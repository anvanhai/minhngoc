-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 21: ĐỒNG BỘ & HOÀN THIỆN LUỒNG NỘP NHIỀU BẢN GHI ÂM (SPEAKING TAKES)
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ĐẢM BẢO CÁC CỘT VÀ BẢNG LIÊN QUAN TỒN TẠI AN TOÀN
-- -----------------------------------------------------------------------------
alter table public.recording_submissions
  add column if not exists teacher_audio_url text,
  add column if not exists teacher_audio_mime text default 'audio/webm',
  add column if not exists teacher_audio_duration integer default 0;

alter table public.assignment_submissions
  add column if not exists teacher_audio_url text;

create table if not exists public.submission_recordings (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.recording_submissions(id) on delete cascade,
  position integer not null default 1,
  storage_path text not null,
  mime_type text not null default 'audio/webm',
  duration_seconds integer default 0,
  created_at timestamptz not null default now(),
  constraint uq_submission_position unique (submission_id, position)
);

create index if not exists idx_sub_rec_submission on public.submission_recordings(submission_id, position);

alter table public.submission_recordings enable row level security;

-- -----------------------------------------------------------------------------
-- 2. CHÍNH SÁCH RLS CHO BẢNG SUBMISSION_RECORDINGS
-- -----------------------------------------------------------------------------
drop policy if exists "Ai xem bài ghi âm thì xem được các bản ghi chi tiết" on public.submission_recordings;
create policy "Ai xem bài ghi âm thì xem được các bản ghi chi tiết"
  on public.submission_recordings for select to authenticated
  using (
    exists (
      select 1 from public.recording_submissions r
      where r.id = submission_recordings.submission_id
        and (r.student_id = auth.uid() or public.is_teacher_or_admin())
    )
  );

drop policy if exists "Học sinh và giáo viên tạo bản ghi chi tiết" on public.submission_recordings;
create policy "Học sinh và giáo viên tạo bản ghi chi tiết"
  on public.submission_recordings for insert to authenticated
  with check (
    exists (
      select 1 from public.recording_submissions r
      where r.id = submission_recordings.submission_id
        and (r.student_id = auth.uid() or public.is_teacher_or_admin())
    )
  );

drop policy if exists "Giáo viên và học sinh cập nhật bản ghi chi tiết" on public.submission_recordings;
create policy "Giáo viên và học sinh cập nhật bản ghi chi tiết"
  on public.submission_recordings for update to authenticated
  using (
    exists (
      select 1 from public.recording_submissions r
      where r.id = submission_recordings.submission_id
        and (r.student_id = auth.uid() or public.is_teacher_or_admin())
    )
  );

drop policy if exists "Giáo viên và học sinh xóa bản ghi chi tiết" on public.submission_recordings;
create policy "Giáo viên và học sinh xóa bản ghi chi tiết"
  on public.submission_recordings for delete to authenticated
  using (
    exists (
      select 1 from public.recording_submissions r
      where r.id = submission_recordings.submission_id
        and (r.student_id = auth.uid() or public.is_teacher_or_admin())
    )
  );

-- -----------------------------------------------------------------------------
-- 3. CHÍNH SÁCH STORAGE BUCKET 'RECORDINGS' CHO GIÁO VIÊN & HỌC SINH
-- -----------------------------------------------------------------------------
drop policy if exists "Học sinh tải lên file ghi âm vào thư mục cá nhân" on storage.objects;
drop policy if exists "Học sinh và giáo viên tải lên file ghi âm" on storage.objects;
create policy "Học sinh và giáo viên tải lên file ghi âm"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_teacher_or_admin()
    )
  );

drop policy if exists "Học sinh cập nhật file của chính mình" on storage.objects;
drop policy if exists "Học sinh và giáo viên cập nhật file ghi âm" on storage.objects;
create policy "Học sinh và giáo viên cập nhật file ghi âm"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'recordings'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_teacher_or_admin()
    )
  )
  with check (
    bucket_id = 'recordings'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_teacher_or_admin()
    )
  );

-- -----------------------------------------------------------------------------
-- 4. HÀM RPC SUBMIT_SPEAKING_ASSIGNMENT (HỖ TRỢ ĐA BẢN GHI ÂM & DỰ PHÒNG CHẶT CHẼ)
-- -----------------------------------------------------------------------------
-- Xóa sạch mọi phiên bản cũ để tránh lỗi schema cache mismatch
drop function if exists public.submit_speaking_assignment(uuid, text);
drop function if exists public.submit_speaking_assignment(uuid, text, jsonb);

create or replace function public.submit_speaking_assignment(
  p_assignment_id uuid,
  p_audio_url text default null,
  p_recordings jsonb default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_class_id uuid;
  v_lesson_id uuid;
  v_due_date timestamptz;
  v_reward_xp integer;
  v_title text;
  v_prompt text;
  v_pinyin text;
  v_sample_audio text;
  v_status text;
  v_sub_id uuid;
  v_already_rewarded boolean;
  v_xp_awarded integer := 0;
  v_rec_item jsonb;
  v_pos integer;
  v_path text;
  v_mime text;
  v_dur integer;
  v_first_path text;
  v_count integer := 0;
begin
  -- 4.1. Xác thực người dùng
  v_student_id := auth.uid();
  if v_student_id is null then
    raise exception 'Người dùng chưa đăng nhập!';
  end if;

  -- 4.2. Tìm đường dẫn file âm thanh hợp lệ (Ưu tiên p_audio_url, sau đó duyệt trong p_recordings)
  v_first_path := trim(coalesce(p_audio_url, ''));

  if (v_first_path is null or v_first_path = '') and p_recordings is not null then
    v_count := jsonb_array_length(p_recordings);
    if v_count > 0 then
      for v_pos in 0 .. (v_count - 1) loop
        v_path := trim(coalesce(p_recordings->v_pos->>'storage_path', p_recordings->v_pos->>'path', ''));
        if v_path <> '' then
          v_first_path := v_path;
          exit;
        end if;
      end loop;
    end if;
  end if;

  if v_first_path is null or v_first_path = '' then
    raise exception 'Vui lòng thực hiện ghi âm trước khi nộp bài!';
  end if;

  -- 4.3. Lấy thông tin bài tập
  select class_id, lesson_id, due_date, reward_xp, title, speaking_prompt, speaking_pinyin, speaking_sample_audio_url
  into v_class_id, v_lesson_id, v_due_date, v_reward_xp, v_title, v_prompt, v_pinyin, v_sample_audio
  from public.assignments
  where id = p_assignment_id;

  if v_title is null then
    raise exception 'Không tìm thấy bài tập hợp lệ!';
  end if;

  -- 4.4. Kiểm tra quyền của học sinh trong lớp (hoặc giáo viên/admin)
  if not exists (
    select 1 from public.enrollments
    where class_id = v_class_id and student_id = v_student_id
  ) and not public.is_teacher_or_admin() then
    raise exception 'Bạn không thuộc lớp học này!';
  end if;

  -- 4.5. Xác định trạng thái nộp bài
  if now() > v_due_date then
    v_status := 'late';
  else
    v_status := 'completed';
  end if;

  -- 4.6. Cập nhật hoặc tạo mới trong assignment_submissions (Đánh dấu hoàn thành)
  insert into public.assignment_submissions (
    assignment_id,
    student_id,
    status,
    completed_at,
    audio_url
  )
  values (
    p_assignment_id,
    v_student_id,
    v_status,
    now(),
    v_first_path
  )
  on conflict (assignment_id, student_id) do update set
    status = v_status,
    completed_at = now(),
    audio_url = v_first_path;

  -- 4.7. Đẩy vào hàng đợi chấm bài của giáo viên (recording_submissions)
  -- Nếu đã có bản ghi nộp trước đó đang ở trạng thái chờ chấm ('submitted'), tái sử dụng và cập nhật lại bản ghi đó
  select id into v_sub_id
  from public.recording_submissions
  where student_id = v_student_id
    and assignment_id = p_assignment_id
    and status = 'submitted'
  order by created_at desc
  limit 1;

  if v_sub_id is not null then
    update public.recording_submissions
    set audio_url = v_first_path,
        prompt_text = coalesce(v_prompt, v_title),
        prompt_pinyin = v_pinyin,
        sample_audio_url = v_sample_audio,
        created_at = now()
    where id = v_sub_id;

    -- Xóa các bản ghi con cũ để thay thế bằng các bản ghi mới nộp
    delete from public.submission_recordings
    where submission_id = v_sub_id;
  else
    insert into public.recording_submissions (
      student_id,
      class_id,
      lesson_id,
      assignment_id,
      prompt_text,
      prompt_pinyin,
      sample_audio_url,
      audio_url,
      status,
      created_at
    )
    values (
      v_student_id,
      v_class_id,
      v_lesson_id,
      p_assignment_id,
      coalesce(v_prompt, v_title),
      v_pinyin,
      v_sample_audio,
      v_first_path,
      'submitted',
      now()
    )
    returning id into v_sub_id;
  end if;

  -- 4.8. Lưu từng bản ghi âm con (takes) vào submission_recordings
  if p_recordings is not null and jsonb_array_length(p_recordings) > 0 then
    for v_pos in 0 .. (jsonb_array_length(p_recordings) - 1) loop
      v_rec_item := p_recordings->v_pos;
      v_path := trim(coalesce(v_rec_item->>'storage_path', v_rec_item->>'path', ''));
      v_mime := coalesce(v_rec_item->>'mime_type', 'audio/webm');
      v_dur := coalesce((v_rec_item->>'duration_seconds')::integer, (v_rec_item->>'durationSeconds')::integer, 0);

      if v_path <> '' then
        insert into public.submission_recordings (
          submission_id,
          position,
          storage_path,
          mime_type,
          duration_seconds
        )
        values (
          v_sub_id,
          coalesce((v_rec_item->>'position')::integer, v_pos + 1),
          v_path,
          v_mime,
          v_dur
        )
        on conflict (submission_id, position) do update set
          storage_path = excluded.storage_path,
          mime_type = excluded.mime_type,
          duration_seconds = excluded.duration_seconds;
      end if;
    end loop;
  else
    -- Dự phòng tạo 1 bản ghi duy nhất nếu không truyền mảng takes
    insert into public.submission_recordings (
      submission_id,
      position,
      storage_path,
      mime_type,
      duration_seconds
    )
    values (
      v_sub_id,
      1,
      v_first_path,
      'audio/webm',
      0
    )
    on conflict (submission_id, position) do nothing;
  end if;

  -- 4.9. Cộng thưởng XP bài tập (Chỉ cộng duy nhất 1 lần, nộp lại không cộng thêm)
  select exists (
    select 1 from public.xp_transactions
    where student_id = v_student_id
      and reference_id = p_assignment_id
      and source_type = 'assignment_completed'
  ) into v_already_rewarded;

  if not v_already_rewarded and coalesce(v_reward_xp, 0) > 0 then
    insert into public.xp_transactions (
      student_id,
      class_id,
      amount,
      source_type,
      reference_id,
      description
    )
    values (
      v_student_id,
      v_class_id,
      v_reward_xp,
      'assignment_completed',
      p_assignment_id,
      'Hoàn thành nộp bài Nói & Ghi âm: ' || v_title
    );

    update public.profiles
    set lifetime_xp = coalesce(lifetime_xp, 0) + v_reward_xp
    where id = v_student_id;

    v_xp_awarded := v_reward_xp;
  end if;

  return json_build_object(
    'success', true,
    'submission_id', v_sub_id,
    'status', v_status,
    'xp_awarded', v_xp_awarded,
    'message', 'Đã nộp bài ghi âm thành công! Hãy chờ cô giáo chấm điểm phát âm nhé.'
  );
end;
$$;

grant execute on function public.submit_speaking_assignment(uuid, text, jsonb) to authenticated;

-- Làm mới schema cache của PostgREST
notify pgrst, 'reload schema';
