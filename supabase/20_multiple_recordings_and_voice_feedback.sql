-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 20: NỘP NHIỀU BẢN GHI ÂM (MULTIPLE TAKES) & GIÁO VIÊN NHẬN XÉT BẰNG GIỌNG NÓI
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BỔ SUNG CÁC CỘT LỜI NHẬN XÉT BẰNG GIỌNG NÓI CỦA GIÁO VIÊN
-- -----------------------------------------------------------------------------
alter table public.recording_submissions
  add column if not exists teacher_audio_url text,
  add column if not exists teacher_audio_mime text default 'audio/webm',
  add column if not exists teacher_audio_duration integer default 0;

alter table public.assignment_submissions
  add column if not exists teacher_audio_url text;

-- -----------------------------------------------------------------------------
-- 2. TẠO BẢNG SUBMISSION_RECORDINGS (LƯU TỪNG BẢN GHI ÂM CON - TAKES CỦA HỌC SINH)
-- -----------------------------------------------------------------------------
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

-- Bật Row Level Security (RLS) cho submission_recordings
alter table public.submission_recordings enable row level security;

-- RLS: Người xem được bài nộp chính thì xem được các bản ghi chi tiết
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

-- RLS: Học sinh nộp bài của mình hoặc giáo viên/admin có quyền thêm bản ghi chi tiết
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

-- RLS: Cập nhật bản ghi chi tiết
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

-- RLS: Xóa bản ghi chi tiết
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
-- 3. DI CHUYỂN DỮ LIỆU CŨ SANG BẢNG SUBMISSION_RECORDINGS (BẢO TOÀN DỮ LIỆU)
-- -----------------------------------------------------------------------------
insert into public.submission_recordings (submission_id, position, storage_path, mime_type, duration_seconds)
select id, 1, audio_url, 'audio/webm', 0
from public.recording_submissions
where audio_url is not null and trim(audio_url) <> ''
on conflict (submission_id, position) do nothing;

-- -----------------------------------------------------------------------------
-- 4. CẬP NHẬT CHÍNH SÁCH STORAGE BUCKET 'RECORDINGS' CHO GIÁO VIÊN & ADMIN
-- Đảm bảo giáo viên và admin được tải lên file nhận xét bằng giọng nói vào 'recordings'
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
-- 5. CẬP NHẬT RPC SUBMIT_SPEAKING_ASSIGNMENT (HỖ TRỢ NHIỀU BẢN GHI ÂM TAKES)
-- -----------------------------------------------------------------------------
-- Drop các chữ ký cũ để tránh xung đột
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
begin
  v_student_id := auth.uid();
  if v_student_id is null then
    raise exception 'Người dùng chưa đăng nhập!';
  end if;

  -- 1. Xác định đường dẫn file chính (take 1)
  v_first_path := trim(coalesce(p_audio_url, ''));
  if (v_first_path is null or v_first_path = '') and (p_recordings is not null and jsonb_array_length(p_recordings) > 0) then
    v_first_path := trim(coalesce(p_recordings->0->>'storage_path', ''));
  end if;

  if v_first_path is null or v_first_path = '' then
    raise exception 'Vui lòng thực hiện ghi âm trước khi nộp bài!';
  end if;

  -- 2. Lấy thông tin bài tập nói
  select class_id, lesson_id, due_date, reward_xp, title, speaking_prompt, speaking_pinyin, speaking_sample_audio_url
  into v_class_id, v_lesson_id, v_due_date, v_reward_xp, v_title, v_prompt, v_pinyin, v_sample_audio
  from public.assignments
  where id = p_assignment_id;

  if v_title is null then
    raise exception 'Không tìm thấy bài tập hợp lệ!';
  end if;

  -- 3. Kiểm tra học sinh có thuộc lớp không
  if not exists (
    select 1 from public.enrollments
    where class_id = v_class_id and student_id = v_student_id
  ) and not public.is_teacher_or_admin() then
    raise exception 'Bạn không thuộc lớp học này!';
  end if;

  -- 4. Trạng thái: hoàn thành nộp bài (chờ giáo viên chấm)
  if now() > v_due_date then
    v_status := 'late';
  else
    v_status := 'completed';
  end if;

  -- 5. Cập nhật hoặc tạo mới trong assignment_submissions
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

  -- 6. Đẩy vào bảng recording_submissions để giáo viên nghe và chấm bài
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

  -- 7. Lưu danh sách các bản ghi (takes) vào submission_recordings
  if p_recordings is not null and jsonb_array_length(p_recordings) > 0 then
    for v_pos in 0 .. (jsonb_array_length(p_recordings) - 1) loop
      v_rec_item := p_recordings->v_pos;
      v_path := trim(coalesce(v_rec_item->>'storage_path', ''));
      v_mime := coalesce(v_rec_item->>'mime_type', 'audio/webm');
      v_dur := coalesce((v_rec_item->>'duration_seconds')::integer, 0);

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
    -- Dự phòng tạo 1 bản ghi duy nhất nếu không truyền mảng p_recordings
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

  -- 8. Cộng thưởng XP bài tập (Chỉ cộng duy nhất 1 lần, nộp lại không cộng thêm)
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
    set lifetime_xp = lifetime_xp + v_reward_xp
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

-- -----------------------------------------------------------------------------
-- 6. CẬP NHẬT RPC GRADE_RECORDING_SUBMISSION (HỖ TRỢ NHẬN XÉT BẰNG GIỌNG NÓI)
-- -----------------------------------------------------------------------------
-- Xóa toàn bộ các phiên bản cũ để tránh lỗi "Could not find the function in schema cache"
drop function if exists public.grade_recording_submission(uuid, integer, text);
drop function if exists public.grade_recording_submission(uuid, integer, text, uuid);
drop function if exists public.grade_recording_submission(uuid, integer, text, uuid, text);
drop function if exists public.grade_recording_submission(uuid, integer, text, uuid, text, text, integer);

create or replace function public.grade_recording_submission(
  p_recording_id uuid default null,
  p_score integer default 0,
  p_comment text default null,
  p_submission_id uuid default null,
  p_teacher_audio_url text default null,
  p_teacher_audio_mime text default 'audio/webm',
  p_teacher_audio_duration integer default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_target_id uuid;
  v_rec record;
  v_max_xp integer := 30;
  v_xp_awarded integer := 0;
  v_already_rewarded boolean := false;
  v_clean_comment text;
  v_clean_audio text;
begin
  -- 6.1. Kiểm tra xác thực người gọi
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Yêu cầu đăng nhập để thực hiện chấm bài!';
  end if;

  -- 6.2. Kiểm tra quyền hạn từ bảng profiles (chỉ admin hoặc teacher)
  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role not in ('admin', 'teacher') then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền chấm bài!';
  end if;

  -- 6.3. Lấy mã bài nộp (hỗ trợ cả p_recording_id và p_submission_id)
  v_target_id := coalesce(p_recording_id, p_submission_id);
  if v_target_id is null then
    raise exception 'Vui lòng cung cấp mã bài nộp ghi âm (p_recording_id hoặc p_submission_id)!';
  end if;

  -- 6.4. Kiểm tra điểm số hợp lệ từ 0 đến 100
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'Điểm số phải nằm trong khoảng từ 0 đến 100!';
  end if;

  v_clean_comment := trim(coalesce(p_comment, ''));
  v_clean_audio := trim(coalesce(p_teacher_audio_url, ''));
  if v_clean_audio = '' then
    v_clean_audio := null;
  end if;

  -- 6.5. Lấy thông tin bản ghi bài nộp ghi âm
  select r.*, a.reward_xp, a.title as assign_title
  into v_rec
  from public.recording_submissions r
  left join public.assignments a on a.id = r.assignment_id
  where r.id = v_target_id;

  if v_rec.id is null then
    raise exception 'Không tìm thấy bài nộp ghi âm tương ứng với mã yêu cầu!';
  end if;

  -- 6.6. Cập nhật bảng recording_submissions
  update public.recording_submissions
  set
    score = p_score,
    teacher_comment = v_clean_comment,
    teacher_audio_url = coalesce(v_clean_audio, teacher_audio_url),
    teacher_audio_mime = coalesce(p_teacher_audio_mime, teacher_audio_mime, 'audio/webm'),
    teacher_audio_duration = coalesce(p_teacher_audio_duration, teacher_audio_duration, 0),
    status = 'graded',
    graded_by = v_caller_id,
    graded_at = now()
  where id = v_target_id;

  -- 6.7. Đồng bộ sang assignment_submissions (nếu bài tập gắn với assignment)
  if v_rec.assignment_id is not null then
    update public.assignment_submissions
    set
      score = p_score,
      teacher_comment = v_clean_comment,
      teacher_audio_url = coalesce(v_clean_audio, teacher_audio_url),
      status = 'graded',
      graded_by = v_caller_id,
      graded_at = now()
    where assignment_id = v_rec.assignment_id and student_id = v_rec.student_id;
  end if;

  -- 6.8. Tính toán và cộng thưởng XP (chỉ cộng 1 lần duy nhất)
  if coalesce(v_rec.reward_xp, 0) > 0 then
    v_max_xp := v_rec.reward_xp;
  end if;

  v_xp_awarded := round((p_score::numeric / 100.0) * v_max_xp);

  -- Kiểm tra xem học sinh đã từng được cộng XP cho bài tập này chưa
  if v_rec.assignment_id is not null then
    select exists (
      select 1 from public.xp_transactions
      where student_id = v_rec.student_id
        and reference_id = v_rec.assignment_id
        and source_type = 'assignment_graded'
    ) into v_already_rewarded;

    if not v_already_rewarded and v_xp_awarded > 0 then
      insert into public.xp_transactions (
        student_id,
        class_id,
        amount,
        source_type,
        reference_id,
        description
      )
      values (
        v_rec.student_id,
        v_rec.class_id,
        v_xp_awarded,
        'assignment_graded',
        v_rec.assignment_id,
        'Điểm phát âm bài: ' || coalesce(v_rec.assign_title, 'Ghi âm') || ' (' || p_score || '/100)'
      );

      update public.profiles
      set lifetime_xp = lifetime_xp + v_xp_awarded
      where id = v_rec.student_id;
    end if;
  end if;

  return json_build_object(
    'success', true,
    'score', p_score,
    'comment', v_clean_comment,
    'teacher_audio_url', v_clean_audio,
    'xp_awarded', case when v_already_rewarded then 0 else v_xp_awarded end,
    'already_rewarded', v_already_rewarded,
    'message', 'Đã lưu kết quả chấm bài thành công!'
  );
end;
$$;

grant execute on function public.grade_recording_submission(uuid, integer, text, uuid, text, text, integer) to authenticated;

-- Làm mới schema cache của PostgREST
notify pgrst, 'reload schema';
