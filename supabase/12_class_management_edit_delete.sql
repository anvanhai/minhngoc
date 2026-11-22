-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 12: QUẢN LÝ NÂNG CAO LỚP HỌC (CHỈNH SỬA TOÀN DIỆN & XÓA AN TOÀN)
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. HÀM THỐNG KÊ CHI TIẾT DỮ LIỆU CỦA LỚP TRƯỚC KHI XÓA
-- -----------------------------------------------------------------------------
create or replace function public.get_class_usage_stats(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_name text;
  v_status text;
  v_student_count integer := 0;
  v_assignment_count integer := 0;
  v_submission_count integer := 0;
  v_recording_count integer := 0;
  v_progress_count integer := 0;
  v_xp_count integer := 0;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền tra cứu.';
  end if;

  select name, status into v_class_name, v_status
  from public.classes
  where id = p_class_id;

  if v_class_name is null then
    raise exception 'Không tìm thấy lớp học yêu cầu.';
  end if;

  -- 1. Số học sinh đang ghi danh
  select count(*) into v_student_count
  from public.enrollments
  where class_id = p_class_id;

  -- 2. Số bài tập đã giao
  select count(*) into v_assignment_count
  from public.assignments
  where class_id = p_class_id;

  -- 3. Số lượt nộp bài tập
  select count(*) into v_submission_count
  from public.assignment_submissions
  where assignment_id in (select id from public.assignments where class_id = p_class_id);

  -- 4. Số bản ghi âm nộp bài
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'recording_submissions') then
    select count(*) into v_recording_count
    from public.recording_submissions
    where class_id = p_class_id;
  end if;

  -- 5. Số bản ghi tiến độ học tập trong lớp
  select count(*) into v_progress_count
  from public.lesson_progress
  where class_id = p_class_id;

  -- 6. Số giao dịch XP gắn với lớp này
  select count(*) into v_xp_count
  from public.xp_transactions
  where class_id = p_class_id;

  return jsonb_build_object(
    'class_name', v_class_name,
    'status', v_status,
    'student_count', v_student_count,
    'assignment_count', v_assignment_count,
    'submission_count', v_submission_count,
    'recording_count', v_recording_count,
    'progress_count', v_progress_count,
    'xp_count', v_xp_count,
    'has_data', (v_student_count > 0 or v_assignment_count > 0 or v_recording_count > 0)
  );
end;
$$;

grant execute on function public.get_class_usage_stats(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. HÀM XÓA VĨNH VIỄN LỚP HỌC (CHỈ ADMIN, BẢO TOÀN XP & DỌN SẠCH STORAGE)
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_class(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_name text;
  v_student_count integer := 0;
  v_deleted_recordings integer := 0;
  v_recording_paths jsonb := '[]'::jsonb;
begin
  -- Quyền hạn: Chỉ Admin tối cao mới được quyền xóa vĩnh viễn lớp
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới có quyền xóa vĩnh viễn lớp học.';
  end if;

  select name into v_class_name
  from public.classes
  where id = p_class_id;

  if v_class_name is null then
    raise exception 'Không tìm thấy lớp học yêu cầu.';
  end if;

  select count(*) into v_student_count
  from public.enrollments
  where class_id = p_class_id;

  -- 1. Thu thập danh sách file ghi âm và xóa bảng recording_submissions
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'recording_submissions') then
    select coalesce(jsonb_agg(audio_url), '[]'::jsonb), count(*)
    into v_recording_paths, v_deleted_recordings
    from public.recording_submissions
    where class_id = p_class_id and audio_url is not null;

    delete from public.recording_submissions
    where class_id = p_class_id;
  end if;

  -- 2. Đặt class_id = null trong xp_transactions để bảo toàn 100% lifetime_xp của học sinh (Lựa chọn 1A)
  update public.xp_transactions
  set class_id = null
  where class_id = p_class_id;

  -- 3. Xóa các bài nộp và bài tập của lớp
  delete from public.assignment_submissions
  where assignment_id in (select id from public.assignments where class_id = p_class_id);

  delete from public.assignments
  where class_id = p_class_id;

  -- 4. Xóa tiến độ học tập và bản ghi mở khóa theo lớp
  delete from public.lesson_progress
  where class_id = p_class_id;

  delete from public.class_lesson_unlocks
  where class_id = p_class_id;

  -- 5. Xóa ghi danh học sinh khỏi lớp
  delete from public.enrollments
  where class_id = p_class_id;

  -- 6. Xóa lớp học
  delete from public.classes
  where id = p_class_id;

  return jsonb_build_object(
    'success', true,
    'message', format('Đã xóa thành công lớp "%s". Toàn bộ XP trọn đời của học sinh được giữ nguyên.', v_class_name),
    'deleted_recordings_count', v_deleted_recordings,
    'deleted_recording_paths', v_recording_paths,
    'student_count', v_student_count
  );
end;
$$;

grant execute on function public.admin_delete_class(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. HÀM CẬP NHẬT THÔNG TIN LỚP HỌC ĐẦY ĐỦ
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_class(
  p_class_id uuid,
  p_name text,
  p_curriculum_id uuid,
  p_level text,
  p_teacher_id uuid,
  p_start_date date,
  p_end_date date,
  p_unlock_mode text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền cập nhật thông tin lớp.';
  end if;

  update public.classes
  set
    name = trim(p_name),
    curriculum_id = p_curriculum_id,
    level = trim(p_level),
    teacher_id = p_teacher_id,
    start_date = coalesce(p_start_date, start_date),
    end_date = p_end_date,
    unlock_mode = p_unlock_mode,
    status = p_status
  where id = p_class_id;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.admin_update_class(uuid, text, uuid, text, uuid, date, date, text, text) to authenticated;
