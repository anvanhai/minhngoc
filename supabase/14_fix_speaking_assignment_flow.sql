-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 14: SỬA LUỒNG BÀI TẬP GHI ÂM (SPEAKING), BẮT BUỘC NỘP FILE ÂM THANH MỚI HOÀN THÀNH
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- 0. Đảm bảo các cột cần thiết tồn tại an toàn
alter table public.assignments
  add column if not exists assignment_type text not null default 'vocabulary',
  add column if not exists speaking_prompt text,
  add column if not exists speaking_pinyin text,
  add column if not exists speaking_sample_audio_url text,
  add column if not exists listening_audio_url text,
  add column if not exists listening_questions jsonb;

alter table public.assignment_submissions
  add column if not exists audio_url text;

-- -----------------------------------------------------------------------------
-- 1. SỬA HÀM complete_assignment:
-- Ngăn chặn gian lận tự đánh dấu hoàn thành bài tập Nói / Ghi âm hoặc Nghe hiểu
-- Bắt buộc phải có file âm thanh bài nộp mới được phép hoàn thành bài tập ghi âm
-- -----------------------------------------------------------------------------
create or replace function public.complete_assignment(
  p_assignment_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_class_id uuid;
  v_due_date timestamptz;
  v_reward_xp integer;
  v_title text;
  v_assignment_type text;
  v_status text;
  v_xp_awarded integer := 0;
  v_already_done boolean;
  v_existing_audio text;
begin
  v_student_id := auth.uid();
  if v_student_id is null then
    raise exception 'Chưa đăng nhập!';
  end if;

  -- 1. Lấy thông tin bài tập
  select class_id, due_date, reward_xp, title, coalesce(assignment_type, 'vocabulary')
  into v_class_id, v_due_date, v_reward_xp, v_title, v_assignment_type
  from public.assignments
  where id = p_assignment_id;

  if v_title is null then
    raise exception 'Không tìm thấy bài tập!';
  end if;

  -- 2. Kiểm tra loại bài tập: BÀI TẬP GHI ÂM BẮT BUỘC PHẢI CÓ FILE ÂM THANH
  if v_assignment_type = 'speaking' then
    select audio_url into v_existing_audio
    from public.assignment_submissions
    where assignment_id = p_assignment_id and student_id = v_student_id;

    if v_existing_audio is null or trim(v_existing_audio) = '' then
      raise exception 'Bài tập Nói & Ghi âm bắt buộc phải thực hiện ghi âm và tải lên file âm thanh trước khi hoàn thành!';
    end if;
  elsif v_assignment_type = 'listening' then
    raise exception 'Bài tập Nghe hiểu cần hoàn thành qua bài kiểm tra nghe trực tuyến!';
  end if;

  -- 3. Kiểm tra quá hạn hay đúng hạn
  if now() > v_due_date then
    v_status := 'late';
  else
    v_status := 'completed';
  end if;

  -- 4. Kiểm tra đã nhận XP trước đó chưa (Chống cộng trùng XP)
  select exists (
    select 1 from public.xp_transactions
    where student_id = v_student_id
      and reference_id = p_assignment_id
      and source_type = 'assignment_completed'
  ) into v_already_done;

  -- 5. Cập nhật hoặc thêm bản ghi nộp bài
  insert into public.assignment_submissions (
    assignment_id,
    student_id,
    status,
    completed_at,
    score
  )
  values (
    p_assignment_id,
    v_student_id,
    v_status,
    now(),
    100
  )
  on conflict (assignment_id, student_id) do update set
    status = v_status,
    completed_at = now(),
    score = 100;

  -- 6. Cộng thưởng XP duy nhất 1 lần cho học sinh
  if not v_already_done and v_reward_xp > 0 then
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
      'Hoàn thành bài tập: ' || v_title
    );

    update public.profiles
    set lifetime_xp = lifetime_xp + v_reward_xp
    where id = v_student_id;

    v_xp_awarded := v_reward_xp;
  end if;

  return json_build_object(
    'success', true,
    'status', v_status,
    'xp_awarded', v_xp_awarded,
    'message', 'Đã hoàn thành bài tập thành công!'
  );
end;
$$;

grant execute on function public.complete_assignment(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. CẬP NHẬT HÀM submit_speaking_assignment:
-- Nộp file âm thanh vào hàng chờ chấm của giáo viên VÀ cộng XP bài tập (duy nhất 1 lần)
-- -----------------------------------------------------------------------------
create or replace function public.submit_speaking_assignment(
  p_assignment_id uuid,
  p_audio_url text
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
begin
  v_student_id := auth.uid();
  if v_student_id is null then
    raise exception 'Người dùng chưa đăng nhập!';
  end if;

  -- Bắt buộc phải có đường dẫn file âm thanh hợp lệ
  if p_audio_url is null or trim(p_audio_url) = '' then
    raise exception 'Vui lòng thực hiện ghi âm trước khi nộp bài!';
  end if;

  -- 1. Lấy thông tin bài tập nói (hỗ trợ cả bài tập đã tạo trước đó)
  select class_id, lesson_id, due_date, reward_xp, title, speaking_prompt, speaking_pinyin, speaking_sample_audio_url
  into v_class_id, v_lesson_id, v_due_date, v_reward_xp, v_title, v_prompt, v_pinyin, v_sample_audio
  from public.assignments
  where id = p_assignment_id;

  if v_title is null then
    raise exception 'Không tìm thấy bài tập hợp lệ!';
  end if;

  -- 2. Kiểm tra học sinh có thuộc lớp không
  if not exists (
    select 1 from public.enrollments
    where class_id = v_class_id and student_id = v_student_id
  ) and not public.is_teacher_or_admin() then
    raise exception 'Bạn không thuộc lớp học này!';
  end if;

  -- 3. Trạng thái: hoàn thành nộp bài (chờ giáo viên chấm)
  if now() > v_due_date then
    v_status := 'late';
  else
    v_status := 'completed';
  end if;

  -- 4. Cập nhật hoặc tạo mới trong assignment_submissions
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
    trim(p_audio_url)
  )
  on conflict (assignment_id, student_id) do update set
    status = v_status,
    completed_at = now(),
    audio_url = trim(p_audio_url);

  -- 5. Đẩy vào bảng recording_submissions để giáo viên nghe và chấm bài
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
    trim(p_audio_url),
    'submitted',
    now()
  )
  returning id into v_sub_id;

  -- 6. Cộng thưởng XP bài tập (Chỉ cộng duy nhất 1 lần, nộp lại không cộng thêm)
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

grant execute on function public.submit_speaking_assignment(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. BỔ SUNG CHÍNH SÁCH STORAGE RLS CHO BUCKET 'RECORDINGS'
-- Cho phép học sinh cập nhật file của chính mình khi ghi âm lại (upsert: true)
-- -----------------------------------------------------------------------------
drop policy if exists "Học sinh cập nhật file của chính mình" on storage.objects;
create policy "Học sinh cập nhật file của chính mình"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- 4. DỌN DẸP DỮ LIỆU ĐÃ TẠO TRƯỚC ĐÂY:
-- Tự động chuẩn hóa assignment_type = 'speaking' cho các bài tập có tiêu đề ghi âm
-- -----------------------------------------------------------------------------
update public.assignments
set assignment_type = 'speaking'
where (assignment_type = 'vocabulary' or assignment_type is null)
  and (
    lower(title) like '%ghi âm%'
    or lower(title) like '%nói%'
    or lower(title) like '%phát âm%'
    or lower(title) like '%speaking%'
    or speaking_prompt is not null
  );

update public.assignments
set assignment_type = 'listening'
where (assignment_type = 'vocabulary' or assignment_type is null)
  and (
    lower(title) like '%nghe%'
    or lower(title) like '%listening%'
    or listening_audio_url is not null
  );

-- Gợi ý: Nếu bạn có bài tập ghi âm đã tạo trước đây mà tiêu đề không chứa các từ khóa trên,
-- bạn có thể cập nhật đích danh bài tập đó bằng ID như sau:
-- UPDATE public.assignments SET assignment_type = 'speaking' WHERE id = 'ID_BÀI_TẬP_CỦA_BẠN';
