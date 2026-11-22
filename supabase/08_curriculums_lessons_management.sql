-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 08: QUẢN LÝ NÂNG CAO GIÁO TRÌNH, BÀI HỌC & TỪ VỰNG TRONG BÀI
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

  return jsonb_build_object(
    'can_delete', (v_class_count = 0),
    'class_count', v_class_count,
    'class_names', v_classes,
    'lesson_count', v_lesson_count,
    'vocab_link_count', v_vocab_link_count,
    'progress_count', v_progress_count
  );
end;
$$;

grant execute on function public.get_curriculum_usage_stats(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. HÀM XÓA AN TOÀN GIÁO TRÌNH (CHẶN NẾU ĐANG CÓ LỚP HỌC SỬ DỤNG)
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
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền xóa giáo trình.';
  end if;

  -- 1. Lấy tên giáo trình
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

  -- 4. Dọn dẹp liên kết bài tập và bài ghi âm (nếu có bài học thuộc giáo trình này)
  update public.assignments
  set lesson_id = null
  where lesson_id in (select id from public.lessons where curriculum_id = p_curriculum_id);

  update public.recording_submissions
  set lesson_id = null
  where lesson_id in (select id from public.lessons where curriculum_id = p_curriculum_id);

  -- 5. Xóa giáo trình (CASCADE sẽ tự xóa lessons, lesson_vocabularies, lesson_progress, class_lesson_unlocks)
  delete from public.curriculums
  where id = p_curriculum_id;

  return jsonb_build_object(
    'success', true,
    'message', format('Đã xóa thành công giáo trình "%s" cùng %s bài học liên quan.', v_curriculum_title, v_lesson_count),
    'deleted_lessons_count', v_lesson_count
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
  v_lesson record;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền tra cứu.';
  end if;

  select id, title_zh, title_vi, order_index, curriculum_id
  into v_lesson
  from public.lessons
  where id = p_lesson_id;

  if v_lesson.id is null then
    raise exception 'Không tìm thấy bài học.';
  end if;

  select count(*) into v_vocab_count
  from public.lesson_vocabularies
  where lesson_id = p_lesson_id;

  select count(*) into v_progress_count
  from public.lesson_progress
  where lesson_id = p_lesson_id;

  select count(*) into v_assignment_count
  from public.assignments
  where lesson_id = p_lesson_id;

  select count(*) into v_recording_count
  from public.recording_submissions
  where lesson_id = p_lesson_id;

  return jsonb_build_object(
    'lesson_id', v_lesson.id,
    'order_index', v_lesson.order_index,
    'title_zh', v_lesson.title_zh,
    'title_vi', v_lesson.title_vi,
    'vocab_count', v_vocab_count,
    'progress_count', v_progress_count,
    'assignment_count', v_assignment_count,
    'recording_count', v_recording_count
  );
end;
$$;

grant execute on function public.get_lesson_usage_stats(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. HÀM XÓA BÀI HỌC VÀ TỰ ĐỘNG ĐÁNH LẠI THỨ TỰ CÁC BÀI CÒN LẠI
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

  -- 1. Gỡ bài học khỏi các bài tập / bài nộp ghi âm (để set null thay vì xóa mất bài tập của lớp)
  update public.assignments set lesson_id = null where lesson_id = p_lesson_id;
  update public.recording_submissions set lesson_id = null where lesson_id = p_lesson_id;

  -- 2. Xóa bài học (CASCADE xóa lesson_vocabularies, lesson_progress, class_lesson_unlocks)
  delete from public.lessons where id = p_lesson_id;

  -- 3. Đánh lại thứ tự order_index các bài còn lại liên tục (1, 2, 3...)
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
-- 5. HÀM ĐỔI THỨ TỰ BÀI HỌC TRONG GIÁO TRÌNH (REORDER)
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
  v_total integer;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền sắp xếp bài học.';
  end if;

  if p_lesson_ids is null or array_length(p_lesson_ids, 1) = 0 then
    return jsonb_build_object('success', false, 'message', 'Danh sách bài học trống.');
  end if;

  -- Tạm thời set order_index âm để tránh vi phạm unique constraint uq_curriculum_lesson_order
  update public.lessons
  set order_index = -order_index - 10000
  where curriculum_id = p_curriculum_id;

  -- Cập nhật thứ tự mới theo mảng ID truyền vào
  update public.lessons l
  set order_index = t.ord
  from unnest(p_lesson_ids) with ordinality as t(id, ord)
  where l.id = t.id and l.curriculum_id = p_curriculum_id;

  select count(*) into v_total from public.lessons where curriculum_id = p_curriculum_id;

  return jsonb_build_object(
    'success', true,
    'message', format('Đã cập nhật lại thứ tự %s bài học.', v_total)
  );
end;
$$;

grant execute on function public.reorder_lessons(uuid, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. HÀM KIỂM TRA MỨC ĐỘ SỬ DỤNG TỪ VỰNG TRƯỚC KHI XÓA KHỎI KHO
-- -----------------------------------------------------------------------------
create or replace function public.get_vocabulary_usage_stats(p_vocab_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lessons jsonb;
  v_lesson_count integer := 0;
  v_progress_count integer := 0;
  v_hanzi text;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền tra cứu.';
  end if;

  select hanzi into v_hanzi from public.vocabularies where id = p_vocab_id;
  if v_hanzi is null then
    raise exception 'Không tìm thấy từ vựng.';
  end if;

  -- Lấy danh sách các bài học đang chứa từ này
  select coalesce(jsonb_agg(jsonb_build_object(
    'lesson_id', l.id,
    'lesson_order', l.order_index,
    'lesson_title', l.title_zh || ' (' || l.title_vi || ')',
    'curriculum_title', c.title
  )), '[]'::jsonb), count(*)
  into v_lessons, v_lesson_count
  from public.lesson_vocabularies lv
  join public.lessons l on lv.lesson_id = l.id
  join public.curriculums c on l.curriculum_id = c.id
  where lv.vocabulary_id = p_vocab_id;

  -- Đếm số học sinh đang học từ này trong SRS
  select count(*) into v_progress_count
  from public.word_progress
  where vocabulary_id = p_vocab_id;

  return jsonb_build_object(
    'vocab_id', p_vocab_id,
    'hanzi', v_hanzi,
    'lesson_count', v_lesson_count,
    'lessons', v_lessons,
    'progress_count', v_progress_count
  );
end;
$$;

grant execute on function public.get_vocabulary_usage_stats(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. HÀM XÓA HẲN TỪ VỰNG KHỎI KHO
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_vocabulary(p_vocab_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hanzi text;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền xóa từ vựng.';
  end if;

  select hanzi into v_hanzi from public.vocabularies where id = p_vocab_id;
  if v_hanzi is null then
    raise exception 'Không tìm thấy từ vựng.';
  end if;

  -- Xóa từ vựng (CASCADE sẽ tự xóa khỏi lesson_vocabularies và word_progress)
  delete from public.vocabularies where id = p_vocab_id;

  return jsonb_build_object(
    'success', true,
    'message', format('Đã xóa vĩnh viễn từ vựng "%s" khỏi kho.', v_hanzi)
  );
end;
$$;

grant execute on function public.admin_delete_vocabulary(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. HÀM GỠ NHIỀU TỪ KHỎI BÀI HỌC (BATCH REMOVE TỪ LESSON_VOCABULARIES)
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
  v_count integer := 0;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền chỉnh sửa bài học.';
  end if;

  if p_vocab_ids is null or array_length(p_vocab_ids, 1) = 0 then
    return jsonb_build_object('success', false, 'message', 'Không có từ nào được chọn.');
  end if;

  delete from public.lesson_vocabularies
  where lesson_id = p_lesson_id
    and vocabulary_id = any(p_vocab_ids);

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'success', true,
    'message', format('Đã gỡ %s từ vựng khỏi bài học.', v_count),
    'removed_count', v_count
  );
end;
$$;

grant execute on function public.batch_remove_words_from_lesson(uuid, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. HÀM THÊM NHIỀU TỪ VÀO BÀI HỌC (BATCH ADD TỪ KHO VÀO LESSON_VOCABULARIES)
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
  v_max_order integer := 0;
  v_vocab_id uuid;
  v_added_count integer := 0;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền chỉnh sửa bài học.';
  end if;

  if p_vocab_ids is null or array_length(p_vocab_ids, 1) = 0 then
    return jsonb_build_object('success', false, 'message', 'Không có từ nào được chọn.');
  end if;

  select coalesce(max(sort_order), 0) into v_max_order
  from public.lesson_vocabularies
  where lesson_id = p_lesson_id;

  foreach v_vocab_id in array p_vocab_ids
  loop
    v_max_order := v_max_order + 1;
    insert into public.lesson_vocabularies (lesson_id, vocabulary_id, sort_order)
    values (p_lesson_id, v_vocab_id, v_max_order)
    on conflict (lesson_id, vocabulary_id) do nothing;
    
    if found then
      v_added_count := v_added_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'message', format('Đã thêm %s từ vựng vào bài học.', v_added_count),
    'added_count', v_added_count
  );
end;
$$;

grant execute on function public.batch_add_words_to_lesson(uuid, uuid[]) to authenticated;
