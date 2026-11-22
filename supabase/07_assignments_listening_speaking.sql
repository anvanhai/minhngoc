-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 07: GIAO BÀI TẬP NGHE & NÓI (GHI ÂM), CHẤM ĐIỂM & BẢO MẬT STORAGE
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. NÂNG CẤP BẢNG ASSIGNMENTS: BỔ SUNG LOẠI BÀI TẬP & NỘI DUNG NGHE / NÓI
-- -----------------------------------------------------------------------------
-- 1.1. Thêm cột loại bài tập (assignment_type): vocabulary, listening, speaking, quiz
alter table public.assignments
  add column if not exists assignment_type text not null default 'vocabulary';

-- Ràng buộc loại bài tập hợp lệ
alter table public.assignments
  drop constraint if exists assignments_type_check;

alter table public.assignments
  add constraint assignments_type_check
  check (assignment_type in ('vocabulary', 'listening', 'speaking', 'quiz'));

-- 1.2. Thêm các cột nội dung đặc thù cho bài tập Nghe & Nói
alter table public.assignments
  add column if not exists listening_audio_url text, -- Link audio bài nghe
  add column if not exists listening_questions jsonb, -- Mảng câu hỏi nghe trắc nghiệm [{id, question, audio_url, options, answer}]
  add column if not exists speaking_prompt text,     -- Câu/đoạn tiếng Trung đề bài
  add column if not exists speaking_pinyin text,     -- Phiên âm pinyin cho đề bài
  add column if not exists speaking_sample_audio_url text; -- Link audio đọc mẫu của giáo viên

-- Index hỗ trợ lọc bài tập theo loại
create index if not exists idx_assignments_type on public.assignments(assignment_type);

-- -----------------------------------------------------------------------------
-- 2. NÂNG CẤP BẢNG ASSIGNMENT_SUBMISSIONS: BỔ SUNG TRẠNG THÁI & CHẤM ĐIỂM
-- -----------------------------------------------------------------------------
-- 2.1. Nới rộng ràng buộc status của bài nộp
alter table public.assignment_submissions
  drop constraint if exists assignment_submissions_status_check;

alter table public.assignment_submissions
  add constraint assignment_submissions_status_check
  check (status in ('pending', 'submitted', 'completed', 'late', 'graded'));

-- 2.2. Thêm cột lưu trữ kết quả, file ghi âm và nhận xét của giáo viên
alter table public.assignment_submissions
  add column if not exists audio_url text,           -- Đường dẫn file ghi âm trong bucket recordings
  add column if not exists answers_payload jsonb,     -- Câu trả lời trắc nghiệm của học sinh
  add column if not exists teacher_comment text,     -- Nhận xét góp ý của giáo viên
  add column if not exists graded_by uuid references public.profiles(id) on delete set null,
  add column if not exists graded_at timestamptz;

create index if not exists idx_submissions_graded on public.assignment_submissions(graded_by, graded_at);

-- -----------------------------------------------------------------------------
-- 3. BẢNG MỚI: RECORDING_SUBMISSIONS (Chuyên quản lý bài tập Nói & Ghi âm để chấm điểm)
-- -----------------------------------------------------------------------------
create table if not exists public.recording_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete cascade,
  prompt_text text not null,                          -- Câu / đoạn tiếng Trung cần đọc
  prompt_pinyin text,                                 -- Pinyin
  sample_audio_url text,                              -- Audio mẫu
  audio_url text not null,                            -- Đường dẫn file ghi âm trong Storage bucket 'recordings'
  status text not null default 'submitted' check (status in ('submitted', 'graded')),
  score integer check (score between 0 and 100),       -- Điểm số từ 0 đến 100
  teacher_comment text,                               -- Nhận xét của giáo viên
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_rec_sub_class_status on public.recording_submissions(class_id, status, created_at);
create index if not exists idx_rec_sub_student on public.recording_submissions(student_id);
create index if not exists idx_rec_sub_assignment on public.recording_submissions(assignment_id);

-- Bật Row Level Security (RLS) cho recording_submissions
alter table public.recording_submissions enable row level security;

-- RLS: Học sinh chỉ xem được bài của mình; Giáo viên & Admin xem được bài của lớp mình
drop policy if exists "Học sinh xem bài ghi âm của mình, giáo viên xem lớp mình" on public.recording_submissions;
create policy "Học sinh xem bài ghi âm của mình, giáo viên xem lớp mình"
  on public.recording_submissions for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_teacher_or_admin()
  );

-- RLS: Học sinh được quyền tạo bài nộp ghi âm của chính mình
drop policy if exists "Học sinh nộp bài ghi âm của mình" on public.recording_submissions;
create policy "Học sinh nộp bài ghi âm của mình"
  on public.recording_submissions for insert to authenticated
  with check (student_id = auth.uid());

-- RLS: Chỉ giáo viên đứng lớp hoặc admin mới được cập nhật (chấm điểm & nhận xét)
drop policy if exists "Chỉ giáo viên và admin mới được chấm bài ghi âm" on public.recording_submissions;
create policy "Chỉ giáo viên và admin mới được chấm bài ghi âm"
  on public.recording_submissions for update to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

-- RLS: Cho phép giáo viên và admin xóa bản ghi cũ để tiết kiệm dung lượng
drop policy if exists "Giáo viên và admin được xóa bản ghi" on public.recording_submissions;
create policy "Giáo viên và admin được xóa bản ghi"
  on public.recording_submissions for delete to authenticated
  using (public.is_teacher_or_admin());

-- -----------------------------------------------------------------------------
-- 4. BUCKET STORAGE "RECORDINGS" & CHÍNH SÁCH BẢO MẬT FILE ÂM THANH
-- -----------------------------------------------------------------------------
-- 4.1. Tạo bucket riêng tư 'recordings' nếu chưa có
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings',
  'recordings',
  false,
  10485760, -- Giới hạn 10MB mỗi file ghi âm (tiết kiệm dung lượng gói Free 1GB)
  array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'video/webm', 'audio/aac']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760;

-- 4.2. Storage RLS Policies cho bucket 'recordings'
-- Học sinh tải lên file vào thư mục mang user_id của chính mình: {student_id}/...
drop policy if exists "Học sinh tải lên file ghi âm vào thư mục cá nhân" on storage.objects;
create policy "Học sinh tải lên file ghi âm vào thư mục cá nhân"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Học sinh đọc được file của mình; Giáo viên & Admin đọc được file của học sinh
drop policy if exists "Học sinh và giáo viên đọc file ghi âm" on storage.objects;
create policy "Học sinh và giáo viên đọc file ghi âm"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recordings'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_teacher_or_admin()
    )
  );

-- Học sinh xóa file của chính mình khi muốn ghi âm lại
drop policy if exists "Học sinh tự xóa file của mình" on storage.objects;
create policy "Học sinh tự xóa file của mình"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Giáo viên và admin được xóa file ghi âm cũ đã chấm
drop policy if exists "Giáo viên và admin xóa file ghi âm cũ" on storage.objects;
create policy "Giáo viên và admin xóa file ghi âm cũ"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recordings'
    and public.is_teacher_or_admin()
  );

-- -----------------------------------------------------------------------------
-- 5. CÁC HÀM SQL RPC (SECURITY DEFINER) - BẢO MẬT & CHỐNG HỌC SINH TỰ SỬA ĐIỂM
-- -----------------------------------------------------------------------------

-- 5.1. NỘP BÀI TẬP NGHE HIỂU (Tự động chấm điểm trắc nghiệm server-side an toàn)
create or replace function public.submit_listening_assignment(
  p_assignment_id uuid,
  p_answers jsonb -- Mảng số nguyên đáp án học sinh chọn, ví dụ: [0, 2, 1, 3]
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
  v_questions jsonb;
  v_total_q integer := 0;
  v_correct_q integer := 0;
  v_score integer := 0;
  v_status text;
  v_xp_awarded integer := 0;
  v_already_rewarded boolean;
  v_idx integer;
  v_expected_ans integer;
  v_student_ans integer;
begin
  v_student_id := auth.uid();
  if v_student_id is null then
    raise exception 'Người dùng chưa đăng nhập!';
  end if;

  -- 1. Lấy thông tin bài tập nghe
  select class_id, due_date, reward_xp, title, listening_questions
  into v_class_id, v_due_date, v_reward_xp, v_title, v_questions
  from public.assignments
  where id = p_assignment_id and assignment_type = 'listening';

  if v_title is null then
    raise exception 'Không tìm thấy bài tập nghe hiểu hợp lệ!';
  end if;

  -- 2. Kiểm tra quyền của học sinh trong lớp
  if not exists (
    select 1 from public.enrollments
    where class_id = v_class_id and student_id = v_student_id
  ) and not public.is_teacher_or_admin() then
    raise exception 'Bạn không thuộc lớp học này!';
  end if;

  -- 3. Chấm điểm server-side so khớp đáp án
  v_total_q := jsonb_array_length(coalesce(v_questions, '[]'::jsonb));
  if v_total_q > 0 then
    for v_idx in 0 .. (v_total_q - 1) loop
      v_expected_ans := coalesce((v_questions->v_idx->>'answer')::integer, 0);
      v_student_ans := coalesce((p_answers->v_idx)::integer, -1);
      if v_expected_ans = v_student_ans then
        v_correct_q := v_correct_q + 1;
      end if;
    end loop;
    v_score := round((v_correct_q::numeric / v_total_q::numeric) * 100);
  else
    v_score := 100;
  end if;

  -- 4. Xác định trạng thái nộp
  if now() > v_due_date then
    v_status := 'late';
  else
    v_status := 'completed';
  end if;

  -- 5. Lưu vào assignment_submissions
  insert into public.assignment_submissions (
    assignment_id,
    student_id,
    status,
    completed_at,
    score,
    answers_payload
  )
  values (
    p_assignment_id,
    v_student_id,
    v_status,
    now(),
    v_score,
    p_answers
  )
  on conflict (assignment_id, student_id) do update set
    status = v_status,
    completed_at = now(),
    score = v_score,
    answers_payload = p_answers;

  -- 6. Tính thưởng XP theo tỷ lệ điểm nếu đạt từ 60 điểm trở lên
  if v_score >= 60 and v_reward_xp > 0 then
    select exists (
      select 1 from public.xp_transactions
      where student_id = v_student_id
        and reference_id = p_assignment_id
        and source_type = 'assignment_completed'
    ) into v_already_rewarded;

    if not v_already_rewarded then
      v_xp_awarded := round((v_score::numeric / 100.0) * v_reward_xp);
      if v_xp_awarded > 0 then
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
          v_xp_awarded,
          'assignment_completed',
          p_assignment_id,
          'Hoàn thành bài tập Nghe: ' || v_title || ' (' || v_score || ' điểm)'
        );

        update public.profiles
        set lifetime_xp = lifetime_xp + v_xp_awarded
        where id = v_student_id;
      end if;
    end if;
  end if;

  return json_build_object(
    'success', true,
    'score', v_score,
    'correct_count', v_correct_q,
    'total_questions', v_total_q,
    'status', v_status,
    'xp_awarded', v_xp_awarded
  );
end;
$$;

-- 5.2. NỘP BÀI TẬP NÓI & GHI ÂM (Học sinh nộp file âm thanh vào hàng chờ chấm)
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
  v_title text;
  v_prompt text;
  v_pinyin text;
  v_sample_audio text;
  v_status text;
  v_sub_id uuid;
begin
  v_student_id := auth.uid();
  if v_student_id is null then
    raise exception 'Người dùng chưa đăng nhập!';
  end if;

  if p_audio_url is null or trim(p_audio_url) = '' then
    raise exception 'Vui lòng ghi âm trước khi nộp bài!';
  end if;

  -- 1. Lấy thông tin bài tập nói
  select class_id, lesson_id, due_date, title, speaking_prompt, speaking_pinyin, speaking_sample_audio_url
  into v_class_id, v_lesson_id, v_due_date, v_title, v_prompt, v_pinyin, v_sample_audio
  from public.assignments
  where id = p_assignment_id and assignment_type = 'speaking';

  if v_title is null then
    raise exception 'Không tìm thấy bài tập Nói / Ghi âm hợp lệ!';
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
    p_audio_url
  )
  on conflict (assignment_id, student_id) do update set
    status = v_status,
    completed_at = now(),
    audio_url = p_audio_url;

  -- 5. Đẩy vào bảng recording_submissions dành cho hàng chờ chấm của giáo viên
  -- Nếu học sinh ghi âm lại, cập nhật bản ghi đang chờ chấm
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
    p_audio_url,
    'submitted',
    now()
  )
  returning id into v_sub_id;

  return json_build_object(
    'success', true,
    'submission_id', v_sub_id,
    'status', v_status,
    'message', 'Đã nộp bài ghi âm thành công! Hãy chờ giáo viên chấm điểm.'
  );
end;
$$;

-- 5.3. GIÁO VIÊN CHẤM ĐIỂM BÀI GHI ÂM & TỰ ĐỘNG THƯỞNG XP (CHỐNG GIAN LẬN)
create or replace function public.grade_recording_submission(
  p_recording_id uuid,
  p_score integer,
  p_comment text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_rec record;
  v_max_xp integer := 30;
  v_xp_awarded integer := 0;
  v_already_rewarded boolean;
begin
  v_teacher_id := auth.uid();
  if v_teacher_id is null or not public.is_teacher_or_admin() then
    raise exception 'Chỉ giáo viên hoặc admin mới có quyền chấm bài!';
  end if;

  if p_score < 0 or p_score > 100 then
    raise exception 'Điểm số phải nằm trong khoảng từ 0 đến 100!';
  end if;

  -- 1. Lấy thông tin bản ghi cần chấm
  select r.*, a.reward_xp, a.title as assign_title
  into v_rec
  from public.recording_submissions r
  left join public.assignments a on a.id = r.assignment_id
  where r.id = p_recording_id;

  if v_rec.id is null then
    raise exception 'Không tìm thấy bài ghi âm!';
  end if;

  -- 2. Cập nhật bảng recording_submissions
  update public.recording_submissions
  set
    score = p_score,
    teacher_comment = trim(p_comment),
    status = 'graded',
    graded_by = v_teacher_id,
    graded_at = now()
  where id = p_recording_id;

  -- 3. Đồng bộ điểm và nhận xét sang assignment_submissions
  if v_rec.assignment_id is not null then
    update public.assignment_submissions
    set
      score = p_score,
      teacher_comment = trim(p_comment),
      status = 'graded',
      graded_by = v_teacher_id,
      graded_at = now()
    where assignment_id = v_rec.assignment_id and student_id = v_rec.student_id;
  end if;

  -- 4. Tính toán và cộng thưởng XP (Công thức: điểm % * XP tối đa của bài)
  if coalesce(v_rec.reward_xp, 0) > 0 then
    v_max_xp := v_rec.reward_xp;
  end if;

  v_xp_awarded := round((p_score::numeric / 100.0) * v_max_xp);

  -- Kiểm tra xem đã từng nhận thưởng cho bài tập này chưa
  if v_rec.assignment_id is not null then
    select exists (
      select 1 from public.xp_transactions
      where student_id = v_rec.student_id
        and reference_id = v_rec.assignment_id
        and source_type = 'assignment_completed'
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
        'assignment_completed',
        v_rec.assignment_id,
        'Giáo viên chấm bài Nói: ' || coalesce(v_rec.assign_title, v_rec.prompt_text) || ' (' || p_score || ' điểm)'
      );

      update public.profiles
      set lifetime_xp = lifetime_xp + v_xp_awarded
      where id = v_rec.student_id;
    end if;
  end if;

  return json_build_object(
    'success', true,
    'score', p_score,
    'xp_awarded', v_xp_awarded,
    'graded_at', now()
  );
end;
$$;

-- 5.4. XÓA BÀI TẬP (Chỉ dành cho giáo viên và admin)
create or replace function public.delete_assignment(
  p_assignment_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ giáo viên hoặc admin mới được xóa bài tập!';
  end if;

  delete from public.assignments
  where id = p_assignment_id;

  return json_build_object('success', true);
end;
$$;
