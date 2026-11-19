-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 03: TIẾN ĐỘ HỌC SINH, TIẾN ĐỘ BÀI HỌC & FLASHCARD SRS
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG LESSON_PROGRESS (Tiến độ từng bài của học sinh trong lớp học)
-- -----------------------------------------------------------------------------
create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  words_learned_count integer not null default 0 check (words_learned_count >= 0),
  total_words_count integer not null default 0 check (total_words_count >= 0),
  is_vocab_completed boolean not null default false,
  is_practice_completed boolean not null default false,
  is_quiz_passed boolean not null default false,
  highest_quiz_score integer not null default 0 check (highest_quiz_score between 0 and 100),
  is_completed boolean not null default false,
  completed_at timestamptz,
  last_studied_at timestamptz not null default now(),
  constraint uq_student_class_lesson unique (student_id, class_id, lesson_id)
);

create index if not exists idx_lesson_prog_student on public.lesson_progress(student_id, class_id);
create index if not exists idx_lesson_prog_lesson on public.lesson_progress(lesson_id);

-- -----------------------------------------------------------------------------
-- 2. BẢNG WORD_PROGRESS (Tiến độ ghi nhớ từng từ theo Spaced Repetition - SRS)
-- -----------------------------------------------------------------------------
create table if not exists public.word_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  vocabulary_id uuid not null references public.vocabularies(id) on delete cascade,
  mastery_level integer not null default 0 check (mastery_level between 0 and 3), 
  -- 0: Mới, 1: Chưa thuộc (Quên), 2: Đang nhớ (Mang máng), 3: Đã thuộc làu (Thành thạo)
  correct_count integer not null default 0 check (correct_count >= 0),
  mistake_count integer not null default 0 check (mistake_count >= 0),
  last_reviewed_at timestamptz not null default now(),
  constraint uq_student_vocab unique (student_id, vocabulary_id)
);

create index if not exists idx_word_prog_student on public.word_progress(student_id, mastery_level);

-- -----------------------------------------------------------------------------
-- 3. CHÍNH SÁCH BẢO MẬT ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------

-- 3.1. Bảng lesson_progress
alter table public.lesson_progress enable row level security;

create policy "Học sinh xem tiến độ của chính mình, giáo viên xem tất cả"
  on public.lesson_progress for select to authenticated
  using (student_id = auth.uid() or public.is_teacher_or_admin());

create policy "Học sinh tự cập nhật tiến độ bài học của mình"
  on public.lesson_progress for insert to authenticated
  with check (student_id = auth.uid());

create policy "Học sinh tự sửa tiến độ bài học của mình"
  on public.lesson_progress for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- 3.2. Bảng word_progress
alter table public.word_progress enable row level security;

create policy "Học sinh xem tiến độ từ của chính mình, giáo viên xem tất cả"
  on public.word_progress for select to authenticated
  using (student_id = auth.uid() or public.is_teacher_or_admin());

create policy "Học sinh tự thêm tiến độ từ của mình"
  on public.word_progress for insert to authenticated
  with check (student_id = auth.uid());

create policy "Học sinh tự cập nhật tiến độ từ của mình"
  on public.word_progress for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 4. HÀM RPC TIỆN ÍCH CHO HỌC SINH CẬP NHẬT TIẾN ĐỘ TỪ & BÀI HỌC
-- -----------------------------------------------------------------------------

-- Hàm cập nhật mức độ ghi nhớ từ vựng (SRS)
create or replace function public.record_word_review(
  p_vocab_id uuid,
  p_level integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.word_progress (student_id, vocabulary_id, mastery_level, correct_count, mistake_count, last_reviewed_at)
  values (
    auth.uid(),
    p_vocab_id,
    p_level,
    case when p_level >= 2 then 1 else 0 end,
    case when p_level <= 1 then 1 else 0 end,
    now()
  )
  on conflict (student_id, vocabulary_id) do update set
    mastery_level = p_level,
    correct_count = public.word_progress.correct_count + case when p_level >= 2 then 1 else 0 end,
    mistake_count = public.word_progress.mistake_count + case when p_level <= 1 then 1 else 0 end,
    last_reviewed_at = now();
end;
$$;

-- Hàm cập nhật tiến độ học từ của bài học
create or replace function public.record_lesson_vocab_progress(
  p_class_id uuid,
  p_lesson_id uuid,
  p_learned_count integer,
  p_total_words integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_done boolean;
begin
  is_done := (p_learned_count >= p_total_words and p_total_words > 0);

  insert into public.lesson_progress (
    student_id,
    class_id,
    lesson_id,
    words_learned_count,
    total_words_count,
    is_vocab_completed,
    last_studied_at
  )
  values (
    auth.uid(),
    p_class_id,
    p_lesson_id,
    p_learned_count,
    p_total_words,
    is_done,
    now()
  )
  on conflict (student_id, class_id, lesson_id) do update set
    words_learned_count = greatest(public.lesson_progress.words_learned_count, p_learned_count),
    total_words_count = p_total_words,
    is_vocab_completed = public.lesson_progress.is_vocab_completed or is_done,
    last_studied_at = now();
end;
$$;
