-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 11: NÂNG CẤP XÓA VÀ SỬA AN TOÀN GIÁO TRÌNH, BÀI HỌC & DỌN DẸP STORAGE
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. HÀM KIỂM TRA THÔNG TIN SỬ DỤNG GIÁO TRÌNH TRƯỚC KHI XÓA
-- -----------------------------------------------------------------------------
create or replace function public.get_curriculum_usage_stats(p_curriculum_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classes jsonb;
  v_class_count integer := 0;
  v_lesson_count integer := 0;
  v_vocab_link_count integer := 0;
  v_progress_count integer := 0;
  v_slide_count integer := 0;
  v_recording_count integer := 0;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền tra cứu.';
  end if;

  -- 1. Kiểm tra các lớp học đang gán giáo trình này
  select coalesce(jsonb_agg(name), '[]'::jsonb), count(*)
  into v_classes, v_class_count
  from public.classes
  where curriculum_id = p_curriculum_id;

  -- 2. Đếm số lượng bài học
  select count(*)
  into v_lesson_count
  from public.lessons
  where curriculum_id = p_curriculum_id;

  -- 3. Đếm số liên kết từ vựng trong các bài học
  select count(*)
  into v_vocab_link_count
  from public.lesson_vocabularies lv
  join public.lessons l on lv.lesson_id = l.id
  where l.curriculum_id = p_curriculum_id;

  -- 4. Đếm số dòng tiến độ học tập của học sinh
  select count(*)
  into v_progress_count
  from public.lesson_progress lp
  join public.lessons l on lp.lesson_id = l.id
  where l.curriculum_id = p_curriculum_id;

  -- 5. Đếm số slide bài giảng đính kèm (nếu bảng lesson_slides tồn tại)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'lesson_slides') then
    select count(*)
    into v_slide_count
    from public.lesson_slides ls
    join public.lessons l on ls.lesson_id = l.id
    where l.curriculum_id = p_curriculum_id;
  end if;

  -- 6. Đếm số bản ghi âm liên quan đến bài học
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'recording_submissions') then
    select count(*)
    into v_recording_count
    from public.recording_submissions rs
    join public.lessons l on rs.lesson_id = l.id
    where l.curriculum_id = p_curriculum_id;
  end if;

  return jsonb_build_object(
    'can_delete', (v_class_count = 0),
    'class_count', v_class_count,
    'class_names', v_classes,
    'lesson_count', v_lesson_count,
    'vocab_link_count', v_vocab_link_count,
    'progress_count', v_progress_count,
    'slide_count', v_slide_count,
    'recording_count', v_recording_count
  );
end;
$$;

grant execute on function public.get_curriculum_usage_stats(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. HÀM XÓA AN TOÀN GIÁO TRÌNH (CHỈ ADMIN, CHẶN KHI CÓ LỚP DÙNG, DỌN SẠCH STORAGE)
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_curriculum(p_curriculum_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_names text;
  v_lesson_count integer := 0;
  v_curriculum_title text;
  v_deleted_slides integer := 0;
begin
  -- Chỉ Admin mới được quyền xóa giáo trình
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới có quyền xóa giáo trình.';
  end if;

  -- 1. Lấy thông tin giáo trình
  select title into v_curriculum_title
  from public.curriculums
  where id = p_curriculum_id;

  if v_curriculum_title is null then
    raise exception 'Không tìm thấy giáo trình yêu cầu.';
  end if;

  -- 2. Kiểm tra nếu có lớp học nào đang dùng
  select string_agg(name, ', ') into v_class_names
  from public.classes
  where curriculum_id = p_curriculum_id;

  if v_class_names is not null and v_class_names <> '' then
    raise exception 'Không thể xóa vì giáo trình đang được dùng bởi các lớp: %. Hãy chuyển giáo trình sang trạng thái ngừng hoạt động thay vì xóa.', v_class_names;
  end if;

  -- 3. Đếm số bài học sẽ bị xóa
  select count(*) into v_lesson_count
  from public.lessons
  where curriculum_id = p_curriculum_id;

  -- 4. Xóa dữ liệu bảng lesson_slides
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'lesson_slides') then
    select count(*) into v_deleted_slides
    from public.lesson_slides ls
    join public.lessons l on ls.lesson_id = l.id
    where l.curriculum_id = p_curriculum_id;

    delete from public.lesson_slides
    where lesson_id in (select id from public.lessons where curriculum_id = p_curriculum_id);
  end if;

  -- 5. Dọn dẹp liên kết bài ghi âm (nếu có bài học thuộc giáo trình này)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'recording_submissions') then
    update public.recording_submissions
    set lesson_id = null
    where lesson_id in (select id from public.lessons where curriculum_id = p_curriculum_id);
  end if;

  -- 6. Dọn dẹp liên kết bài tập
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'assignments') then
    update public.assignments
    set lesson_id = null
    where lesson_id in (select id from public.lessons where curriculum_id = p_curriculum_id);
  end if;

  -- 7. Dọn dữ liệu tiến độ & mở khóa bài học của các bài thuộc giáo trình này
  delete from public.lesson_progress
  where lesson_id in (select id from public.lessons where curriculum_id = p_curriculum_id);

  delete from public.class_lesson_unlocks
  where lesson_id in (select id from public.lessons where curriculum_id = p_curriculum_id);

  delete from public.lesson_vocabularies
  where lesson_id in (select id from public.lessons where curriculum_id = p_curriculum_id);

  delete from public.lessons
  where curriculum_id = p_curriculum_id;

  -- 8. Xóa giáo trình
  delete from public.curriculums
  where id = p_curriculum_id;

  return jsonb_build_object(
    'success', true,
    'message', format('Đã xóa thành công giáo trình "%s" cùng %s bài học và giải phóng file liên quan.', v_curriculum_title, v_lesson_count),
    'deleted_lessons_count', v_lesson_count,
    'deleted_slides_count', v_deleted_slides
  );
end;
$$;

grant execute on function public.admin_delete_curriculum(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. HÀM LẤY THÔNG TIN SỬ DỤNG BÀI HỌC TRƯỚC KHI XÓA
-- -----------------------------------------------------------------------------
create or replace function public.get_lesson_usage_stats(p_lesson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vocab_count integer := 0;
  v_progress_count integer := 0;
  v_assignment_count integer := 0;
  v_recording_count integer := 0;
  v_slide_count integer := 0;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền tra cứu.';
  end if;

  select count(*) into v_vocab_count
  from public.lesson_vocabularies
  where lesson_id = p_lesson_id;

  select count(*) into v_progress_count
  from public.lesson_progress
  where lesson_id = p_lesson_id;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'lesson_slides') then
    select count(*) into v_slide_count
    from public.lesson_slides
    where lesson_id = p_lesson_id;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'assignments') then
    select count(*) into v_assignment_count
    from public.assignments
    where lesson_id = p_lesson_id;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'recording_submissions') then
    select count(*) into v_recording_count
    from public.recording_submissions
    where lesson_id = p_lesson_id;
  end if;

  return jsonb_build_object(
    'vocab_count', v_vocab_count,
    'progress_count', v_progress_count,
    'slide_count', v_slide_count,
    'assignment_count', v_assignment_count,
    'recording_count', v_recording_count
  );
end;
$$;

grant execute on function public.get_lesson_usage_stats(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. HÀM XÓA BÀI HỌC VÀ TỰ ĐỘNG ĐÁNH LẠI THỨ TỰ CÁC BÀI CÒN LẠI (DỌN SẠCH STORAGE)
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_lesson(p_lesson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curriculum_id uuid;
  v_order_index integer;
  v_title text;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền xóa bài học.';
  end if;

  select curriculum_id, order_index, title_zh || ' (' || title_vi || ')'
  into v_curriculum_id, v_order_index, v_title
  from public.lessons
  where id = p_lesson_id;

  if v_curriculum_id is null then
    raise exception 'Không tìm thấy bài học yêu cầu.';
  end if;

  -- 1. Xóa dữ liệu bảng lesson_slides của bài học
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'lesson_slides') then
    delete from public.lesson_slides where lesson_id = p_lesson_id;
  end if;

  -- 2. Gỡ bài học khỏi các bài tập / bài nộp ghi âm (đặt null thay vì xóa mất bài tập của lớp)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'assignments') then
    update public.assignments set lesson_id = null where lesson_id = p_lesson_id;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'recording_submissions') then
    update public.recording_submissions set lesson_id = null where lesson_id = p_lesson_id;
  end if;

  -- 3. Xóa bài học (CASCADE xóa lesson_vocabularies, lesson_progress, class_lesson_unlocks)
  delete from public.lesson_vocabularies where lesson_id = p_lesson_id;
  delete from public.lesson_progress where lesson_id = p_lesson_id;
  delete from public.class_lesson_unlocks where lesson_id = p_lesson_id;
  delete from public.lessons where id = p_lesson_id;

  -- 4. Đánh lại thứ tự order_index các bài còn lại liên tục (1, 2, 3...)
  -- Đặt số âm trước để không bị xung đột ràng buộc unique (curriculum_id, order_index)
  update public.lessons
  set order_index = -order_index - 10000
  where curriculum_id = v_curriculum_id;

  with reordered as (
    select id, row_number() over (order by abs(order_index) asc) as new_order
    from public.lessons
    where curriculum_id = v_curriculum_id
  )
  update public.lessons l
  set order_index = r.new_order
  from reordered r
  where l.id = r.id;

  return jsonb_build_object(
    'success', true,
    'message', format('Đã xóa bài học "%s" và tự động căn chỉnh lại số thứ tự bài.', v_title),
    'curriculum_id', v_curriculum_id
  );
end;
$$;

grant execute on function public.admin_delete_lesson(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. HÀM ĐỔI THỨ TỰ BÀI HỌC VÀ CẬP NHẬT ORDER_INDEX
-- -----------------------------------------------------------------------------
create or replace function public.reorder_lessons(
  p_curriculum_id uuid,
  p_lesson_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i integer;
  v_lesson_id uuid;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền sắp xếp bài học.';
  end if;

  -- Bước 1: Gán số âm tạm thời để tránh va chạm ràng buộc unique
  update public.lessons
  set order_index = -order_index - 10000
  where curriculum_id = p_curriculum_id;

  -- Bước 2: Đánh số thứ tự mới từ 1 đến N theo mảng truyền vào
  for v_i in 1..cardinality(p_lesson_ids) loop
    v_lesson_id := p_lesson_ids[v_i];
    update public.lessons
    set order_index = v_i
    where id = v_lesson_id and curriculum_id = p_curriculum_id;
  end loop;

  return jsonb_build_object('success', true, 'updated_count', cardinality(p_lesson_ids));
end;
$$;

grant execute on function public.reorder_lessons(uuid, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. HÀM GỠ TỪ VỰNG HÀNG LOẠT KHỎI BÀI HỌC (KHÔNG XÓA TỪ KHỎI KHO)
-- -----------------------------------------------------------------------------
create or replace function public.batch_remove_words_from_lesson(
  p_lesson_id uuid,
  p_vocab_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer := 0;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền gỡ từ vựng.';
  end if;

  delete from public.lesson_vocabularies
  where lesson_id = p_lesson_id
    and vocabulary_id = any(p_vocab_ids);

  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object(
    'success', true,
    'removed_count', v_deleted_count
  );
end;
$$;

grant execute on function public.batch_remove_words_from_lesson(uuid, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. HÀM THÊM TỪ VỰNG TỪ KHO VÀO BÀI HỌC HÀNG LOẠT
-- -----------------------------------------------------------------------------
create or replace function public.batch_add_words_to_lesson(
  p_lesson_id uuid,
  p_vocab_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted_count integer := 0;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền thêm từ vào bài.';
  end if;

  insert into public.lesson_vocabularies (lesson_id, vocabulary_id)
  select p_lesson_id, unnest(p_vocab_ids)
  on conflict (lesson_id, vocabulary_id) do nothing;

  get diagnostics v_inserted_count = row_count;

  return jsonb_build_object(
    'success', true,
    'added_count', v_inserted_count
  );
end;
$$;

grant execute on function public.batch_add_words_to_lesson(uuid, uuid[]) to authenticated;
