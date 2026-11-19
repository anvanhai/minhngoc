-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 04: QUIZ CUỐI BÀI, BÀI TẬP GIAO THEO LỚP, MỞ BÀI THỦ CÔNG & XP TRANSACTIONS
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG XP_TRANSACTIONS (Lịch sử cộng điểm XP - Bảo mật cao, chống gian lận)
-- -----------------------------------------------------------------------------
create table if not exists public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  amount integer not null check (amount > 0),
  source_type text not null check (source_type in ('quiz_passed', 'assignment_completed', 'streak_bonus', 'admin_reward')),
  reference_id uuid, -- ID bài học hoặc ID bài tập
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_xp_student_class on public.xp_transactions(student_id, class_id, created_at);
create index if not exists idx_xp_created_at on public.xp_transactions(created_at);

-- -----------------------------------------------------------------------------
-- 2. BẢNG CLASS_LESSON_UNLOCKS (Mở khóa bài thủ công theo lớp)
-- -----------------------------------------------------------------------------
create table if not exists public.class_lesson_unlocks (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  is_unlocked boolean not null default true,
  unlocked_at timestamptz not null default now(),
  constraint uq_class_lesson_unlock unique (class_id, lesson_id)
);

create index if not exists idx_unlock_class_lesson on public.class_lesson_unlocks(class_id, lesson_id);

-- -----------------------------------------------------------------------------
-- 3. BẢNG ASSIGNMENTS (Bài tập giáo viên giao riêng cho từng lớp)
-- -----------------------------------------------------------------------------
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  title text not null,
  description text,
  due_date timestamptz not null,
  reward_xp integer not null default 30 check (reward_xp >= 0),
  allow_late boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_assignments_class on public.assignments(class_id, due_date);

-- -----------------------------------------------------------------------------
-- 4. BẢNG ASSIGNMENT_SUBMISSIONS (Theo dõi học sinh nộp bài tập)
-- -----------------------------------------------------------------------------
create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed', 'late')),
  completed_at timestamptz,
  score integer check (score between 0 and 100),
  created_at timestamptz not null default now(),
  constraint uq_assign_student unique (assignment_id, student_id)
);

create index if not exists idx_submissions_assign on public.assignment_submissions(assignment_id, status);
create index if not exists idx_submissions_student on public.assignment_submissions(student_id);

-- -----------------------------------------------------------------------------
-- 5. BẢO MẬT ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------

-- 5.1. Bảng xp_transactions
alter table public.xp_transactions enable row level security;

-- Học sinh chỉ được xem lịch sử điểm của chính mình; Giáo viên xem được tất cả
create policy "Xem lịch sử XP cá nhân"
  on public.xp_transactions for select to authenticated
  using (student_id = auth.uid() or public.is_teacher_or_admin());

-- TUYỆT ĐỐI CHẶN HỌC SINH INSERT TRỰC TIẾP VÀO BẢNG XP (Chỉ cho phép qua hàm SQL RPC bên dưới)
create policy "Chỉ admin và giáo viên mới được can thiệp XP trực tiếp"
  on public.xp_transactions for insert to authenticated
  with check (public.is_teacher_or_admin());

-- 5.2. Bảng class_lesson_unlocks
alter table public.class_lesson_unlocks enable row level security;

create policy "Mọi người trong lớp đều xem được trạng thái mở khóa bài"
  on public.class_lesson_unlocks for select to authenticated
  using (true);

create policy "Chỉ giáo viên và admin mới được mở khóa bài thủ công"
  on public.class_lesson_unlocks for all to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

-- 5.3. Bảng assignments
alter table public.assignments enable row level security;

create policy "Học sinh xem bài tập lớp mình, giáo viên xem tất cả"
  on public.assignments for select to authenticated
  using (
    public.is_teacher_or_admin()
    or exists (
      select 1 from public.enrollments e
      where e.class_id = assignments.class_id and e.student_id = auth.uid()
    )
  );

create policy "Chỉ giáo viên và admin mới được tạo/sửa bài tập"
  on public.assignments for all to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

-- 5.4. Bảng assignment_submissions
alter table public.assignment_submissions enable row level security;

create policy "Học sinh xem bài nộp của mình, giáo viên xem cả lớp"
  on public.assignment_submissions for select to authenticated
  using (student_id = auth.uid() or public.is_teacher_or_admin());

create policy "Học sinh được nộp bài tập của chính mình"
  on public.assignment_submissions for insert to authenticated
  with check (student_id = auth.uid());

create policy "Học sinh cập nhật bài nộp của mình"
  on public.assignment_submissions for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 6. HÀM RPC KIỂM SOÁT ĐẠT QUIZ & CỘNG THƯỞNG XP (SECURITY DEFINER)
-- -----------------------------------------------------------------------------
create or replace function public.submit_quiz_attempt(
  p_class_id uuid,
  p_lesson_id uuid,
  p_correct_count integer,
  p_total_questions integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_pass_score integer;
  v_reward_xp integer;
  v_lesson_order integer;
  v_score_percent integer;
  v_passed boolean;
  v_already_rewarded boolean;
  v_xp_awarded integer := 0;
begin
  v_student_id := auth.uid();
  if v_student_id is null then
    raise exception 'Người dùng chưa đăng nhập!';
  end if;

  if p_total_questions <= 0 then
    raise exception 'Số lượng câu hỏi không hợp lệ!';
  end if;

  -- 1. Lấy thông tin bài học (điểm đạt % và điểm thưởng XP)
  select pass_score_percent, reward_xp, order_index
  into v_pass_score, v_reward_xp, v_lesson_order
  from public.lessons
  where id = p_lesson_id;

  if v_pass_score is null then
    raise exception 'Không tìm thấy bài học!';
  end if;

  -- 2. Tính tỷ lệ % điểm thi
  v_score_percent := round((p_correct_count::numeric / p_total_questions::numeric) * 100);
  v_passed := (v_score_percent >= v_pass_score);

  -- 3. Cập nhật tiến độ bài học (lesson_progress)
  insert into public.lesson_progress (
    student_id,
    class_id,
    lesson_id,
    is_quiz_passed,
    highest_quiz_score,
    is_completed,
    completed_at,
    last_studied_at
  )
  values (
    v_student_id,
    p_class_id,
    p_lesson_id,
    v_passed,
    v_score_percent,
    v_passed,
    case when v_passed then now() else null end,
    now()
  )
  on conflict (student_id, class_id, lesson_id) do update set
    is_quiz_passed = public.lesson_progress.is_quiz_passed or v_passed,
    highest_quiz_score = greatest(public.lesson_progress.highest_quiz_score, v_score_percent),
    is_completed = public.lesson_progress.is_completed or v_passed,
    completed_at = coalesce(public.lesson_progress.completed_at, case when v_passed then now() else null end),
    last_studied_at = now();

  -- 4. Nếu đạt Quiz (Passed): Kiểm tra xem học sinh đã từng nhận thưởng XP bài này chưa
  if v_passed then
    select exists (
      select 1 from public.xp_transactions
      where student_id = v_student_id
        and reference_id = p_lesson_id
        and source_type = 'quiz_passed'
    ) into v_already_rewarded;

    -- Nếu là lần đầu tiên hoàn thành -> Cộng điểm XP thưởng
    if not v_already_rewarded and v_reward_xp > 0 then
      -- Ghi vào lịch sử điểm của lớp
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
        p_class_id,
        v_reward_xp,
        'quiz_passed',
        p_lesson_id,
        'Hoàn thành bài kiểm tra Bài ' || v_lesson_order
      );

      -- Cập nhật tổng XP trọn đời của học sinh
      update public.profiles
      set lifetime_xp = lifetime_xp + v_reward_xp
      where id = v_student_id;

      v_xp_awarded := v_reward_xp;
    end if;
  end if;

  return json_build_object(
    'passed', v_passed,
    'score_percent', v_score_percent,
    'pass_score', v_pass_score,
    'xp_awarded', v_xp_awarded,
    'already_rewarded', v_already_rewarded
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. HÀM RPC NỘP VÀ HOÀN THÀNH BÀI TẬP VỀ NHÀ (ASSIGNMENT)
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
  v_status text;
  v_xp_awarded integer := 0;
  v_already_done boolean;
begin
  v_student_id := auth.uid();
  if v_student_id is null then
    raise exception 'Chưa đăng nhập!';
  end if;

  -- Lấy thông tin bài tập
  select class_id, due_date, reward_xp, title
  into v_class_id, v_due_date, v_reward_xp, v_title
  from public.assignments
  where id = p_assignment_id;

  if v_title is null then
    raise exception 'Không tìm thấy bài tập!';
  end if;

  -- Kiểm tra quá hạn hay đúng hạn
  if now() > v_due_date then
    v_status := 'late';
  else
    v_status := 'completed';
  end if;

  -- Kiểm tra đã hoàn thành trước đó chưa
  select exists (
    select 1 from public.assignment_submissions
    where assignment_id = p_assignment_id
      and student_id = v_student_id
      and status in ('completed', 'late')
  ) into v_already_done;

  -- Cập nhật hoặc thêm bản ghi nộp bài
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

  -- Cộng thưởng XP nếu chưa hoàn thành trước đó
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
    'xp_awarded', v_xp_awarded
  );
end;
$$;
