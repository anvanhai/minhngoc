-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 05: BẢNG XẾP HẠNG THEO LỚP, TÍNH STREAK & QUY TRÌNH CHUYỂN CẤP HSK2
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. HÀM RPC LẤY BẢNG XẾP HẠNG RIÊNG TỪNG LỚP (CLASS LEADERBOARD)
-- Tính theo XP phát sinh trong lớp ở chu kỳ đó (Hôm nay / Tuần này / Tháng này / Tổng kỳ)
-- Tuyệt đối bảo mật: Chỉ trả về tên hiển thị, avatar, XP, streak, số từ đã học
-- -----------------------------------------------------------------------------
create or replace function public.get_class_leaderboard(
  p_class_id uuid,
  p_period text default 'week' -- 'today', 'week', 'month', 'all'
)
returns table (
  rank bigint,
  student_id uuid,
  username text,
  display_name text,
  avatar_url text,
  period_xp bigint,
  current_streak integer,
  words_learned bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_time timestamptz;
begin
  -- 1. Xác định mốc thời gian bắt đầu lọc
  if p_period = 'today' then
    v_start_time := date_trunc('day', now());
  elsif p_period = 'week' then
    v_start_time := date_trunc('week', now());
  elsif p_period = 'month' then
    v_start_time := date_trunc('month', now());
  else
    v_start_time := '1970-01-01 00:00:00+00'::timestamptz;
  end if;

  -- 2. Truy vấn danh sách học sinh đang học trong lớp kèm tổng XP trong kỳ
  return query
  with class_students as (
    select e.student_id, p.username, p.display_name, p.avatar_url, p.current_streak
    from public.enrollments e
    join public.profiles p on p.id = e.student_id
    where e.class_id = p_class_id
      and e.status = 'active'
  ),
  xp_in_period as (
    select x.student_id, coalesce(sum(x.amount), 0) as xp_sum
    from public.xp_transactions x
    where x.class_id = p_class_id
      and x.created_at >= v_start_time
    group by x.student_id
  ),
  words_count as (
    select wp.student_id, count(*) as total_words
    from public.word_progress wp
    where wp.mastery_level >= 2 -- Từ đã thuộc hoặc nhớ mang máng
    group by wp.student_id
  )
  select
    row_number() over (
      order by coalesce(x.xp_sum, 0) desc, cs.current_streak desc, cs.display_name asc
    ) as rank,
    cs.student_id,
    cs.username,
    cs.display_name,
    cs.avatar_url,
    coalesce(x.xp_sum, 0) as period_xp,
    coalesce(cs.current_streak, 0) as current_streak,
    coalesce(w.total_words, 0) as words_learned
  from class_students cs
  left join xp_in_period x on x.student_id = cs.student_id
  left join words_count w on w.student_id = cs.student_id
  order by rank asc;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. HÀM RPC CẬP NHẬT CHUỖI HỌC LIÊN TỤC (DAILY STREAK)
-- -----------------------------------------------------------------------------
create or replace function public.update_student_streak()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_last_active timestamptz;
  v_current_streak integer;
  v_today date;
  v_last_date date;
  v_updated_streak integer;
begin
  v_student_id := auth.uid();
  if v_student_id is null then
    raise exception 'Chưa đăng nhập!';
  end if;

  select last_active_at, current_streak
  into v_last_active, v_current_streak
  from public.profiles
  where id = v_student_id;

  v_today := current_date;
  v_last_date := v_last_active::date;

  if v_last_date is null then
    v_updated_streak := 1;
  elsif v_last_date = v_today then
    -- Đã hoạt động hôm nay rồi, giữ nguyên streak
    v_updated_streak := coalesce(v_current_streak, 1);
  elsif v_last_date = (v_today - 1) then
    -- Hoạt động hôm qua -> Tăng streak thêm 1 ngày
    v_updated_streak := coalesce(v_current_streak, 0) + 1;
  else
    -- Bỏ bẵng 2 ngày trở lên -> Reset streak về 1
    v_updated_streak := 1;
  end if;

  update public.profiles
  set
    current_streak = v_updated_streak,
    last_active_at = now()
  where id = v_student_id;

  return json_build_object(
    'current_streak', v_updated_streak,
    'is_incremented', (v_last_date = (v_today - 1))
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. HÀM RPC QUY TRÌNH CHUYỂN CẤP / CHUYỂN LỚP (HSK1 -> HSK2)
-- Đóng lớp cũ, mở lớp mới, bảo lưu toàn bộ tài khoản, XP và lịch sử
-- -----------------------------------------------------------------------------
create or replace function public.promote_or_transfer_student(
  p_student_id uuid,
  p_old_class_id uuid,
  p_new_class_id uuid,
  p_note text default 'Hoàn thành khóa học, lên cấp mới'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_class_name text;
  v_new_class_name text;
begin
  -- Chỉ giáo viên hoặc admin mới được thực hiện
  if not public.is_teacher_or_admin() then
    raise exception 'Bạn không có quyền thực hiện chức năng chuyển lớp!';
  end if;

  -- Lấy tên 2 lớp
  select name into v_old_class_name from public.classes where id = p_old_class_id;
  select name into v_new_class_name from public.classes where id = p_new_class_id;

  if v_new_class_name is null then
    raise exception 'Lớp học đích không tồn tại!';
  end if;

  -- 1. Đóng lớp cũ (ghi nhận hoàn thành khóa)
  update public.enrollments
  set
    status = 'completed',
    completed_at = current_date,
    note = coalesce(note || ' | ', '') || 'Chuyển sang lớp ' || v_new_class_name || ' (' || p_note || ')'
  where student_id = p_student_id
    and class_id = p_old_class_id;

  -- 2. Tạo bản ghi lớp mới (status = 'active')
  insert into public.enrollments (
    student_id,
    class_id,
    status,
    joined_at,
    note
  )
  values (
    p_student_id,
    p_new_class_id,
    'active',
    current_date,
    'Lên lớp từ ' || coalesce(v_old_class_name, 'lớp cũ') || ': ' || p_note
  )
  on conflict (student_id, class_id) do update set
    status = 'active',
    joined_at = current_date,
    note = 'Tiếp tục học lại lớp này: ' || p_note;

  return json_build_object(
    'success', true,
    'student_id', p_student_id,
    'old_class', v_old_class_name,
    'new_class', v_new_class_name
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. HÀM RPC LẤY LỊCH SỬ CÁC KHÓA HỌC CỦA HỌC SINH
-- -----------------------------------------------------------------------------
create or replace function public.get_student_enrollment_history(
  p_student_id uuid default null
)
returns table (
  enrollment_id uuid,
  class_id uuid,
  class_name text,
  class_level text,
  curriculum_title text,
  status text,
  joined_at date,
  completed_at date,
  note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_id uuid;
begin
  v_target_id := coalesce(p_student_id, auth.uid());

  return query
  select
    e.id as enrollment_id,
    c.id as class_id,
    c.name as class_name,
    c.level as class_level,
    curr.title as curriculum_title,
    e.status,
    e.joined_at,
    e.completed_at,
    e.note
  from public.enrollments e
  join public.classes c on c.id = e.class_id
  join public.curriculums curr on curr.id = c.curriculum_id
  where e.student_id = v_target_id
  order by e.joined_at desc;
end;
$$;
