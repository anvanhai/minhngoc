-- =============================================================================
-- Migration 19: Hoàn thiện tính năng Cấu thành Bài học (Từ vựng, Slide, Bài tập)
-- Cho phép bài tập thuộc bài học ở cấp Giáo trình (class_id nullable),
-- bổ sung thứ tự hiển thị, hàm kiểm tra từ trùng và các hàm RPC đồng bộ an toàn.
-- =============================================================================

-- 1. NÂNG CẤP BẢNG ASSIGNMENTS: CHO PHÉP class_id NULL VÀ THÊM sort_order
alter table public.assignments alter column class_id drop not null;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assignments' and column_name = 'sort_order'
  ) then
    alter table public.assignments add column sort_order integer not null default 1;
  end if;
end $$;

create index if not exists idx_assignments_lesson_sort on public.assignments(lesson_id, sort_order);
create index if not exists idx_assignments_class_sort on public.assignments(class_id, sort_order);

-- 2. CẬP NHẬT RLS POLICIES CHO BẢNG ASSIGNMENTS
drop policy if exists "Học sinh xem bài tập lớp mình" on public.assignments;
drop policy if exists "Học sinh xem bài tập lớp hoặc bài học" on public.assignments;

create policy "Học sinh xem bài tập lớp hoặc bài học"
  on public.assignments for select to authenticated
  using (
    -- Giáo viên hoặc Admin xem tất cả bài tập
    public.is_teacher_or_admin()
    or
    -- Bài tập giao theo lớp mà học sinh đang theo học
    (class_id is not null and exists (
      select 1 from public.enrollments e
      where e.class_id = assignments.class_id and e.student_id = auth.uid()
    ))
    or
    -- Bài tập ở cấp bài học thuộc giáo trình mà học sinh đang theo học trong lớp
    (lesson_id is not null and exists (
      select 1 from public.enrollments e
      join public.classes c on c.id = e.class_id
      join public.lessons l on l.curriculum_id = c.curriculum_id
      where e.student_id = auth.uid() and l.id = assignments.lesson_id
    ))
  );

drop policy if exists "Chỉ giáo viên và admin quản lý bài tập" on public.assignments;

create policy "Chỉ giáo viên và admin quản lý bài tập"
  on public.assignments for all to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

-- 3. HÀM ĐỔI THỨ TỰ TỪ VỰNG TRONG BÀI HỌC (reorder_lesson_vocabularies)
create or replace function public.reorder_lesson_vocabularies(
  p_lesson_id uuid,
  p_vocab_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i integer;
  v_vocab_id uuid;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền sắp xếp từ vựng.';
  end if;

  if p_vocab_ids is null or cardinality(p_vocab_ids) = 0 then
    return jsonb_build_object('success', true, 'updated_count', 0);
  end if;

  for v_i in 1..cardinality(p_vocab_ids) loop
    v_vocab_id := p_vocab_ids[v_i];
    update public.lesson_vocabularies
    set sort_order = v_i
    where lesson_id = p_lesson_id and vocabulary_id = v_vocab_id;
  end loop;

  return jsonb_build_object('success', true, 'updated_count', cardinality(p_vocab_ids));
end;
$$;

grant execute on function public.reorder_lesson_vocabularies(uuid, uuid[]) to authenticated;

-- 4. HÀM ĐỒNG BỘ DANH SÁCH TỪ VỰNG TRONG BÀI HỌC THEO THỨ TỰ (save_lesson_vocabularies)
-- Giúp cập nhật toàn bộ từ vựng cho bài học: thêm mới từ chưa có, cập nhật thứ tự, gỡ từ không còn chọn.
create or replace function public.save_lesson_vocabularies(
  p_lesson_id uuid,
  p_vocab_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i integer;
  v_vocab_id uuid;
  v_count integer := 0;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền gán từ vựng vào bài học.';
  end if;

  if p_vocab_ids is null or cardinality(p_vocab_ids) = 0 then
    -- Nếu danh sách rỗng, gỡ toàn bộ từ khỏi bài học này
    delete from public.lesson_vocabularies where lesson_id = p_lesson_id;
    update public.lessons set total_vocabularies = 0 where id = p_lesson_id;
    return jsonb_build_object('success', true, 'total_vocabularies', 0);
  end if;

  -- 1. Gỡ những từ không còn nằm trong danh sách mới
  delete from public.lesson_vocabularies
  where lesson_id = p_lesson_id
    and vocabulary_id not in (select unnest(p_vocab_ids));

  -- 2. Upsert từng từ kèm số thứ tự sort_order
  for v_i in 1..cardinality(p_vocab_ids) loop
    v_vocab_id := p_vocab_ids[v_i];
    insert into public.lesson_vocabularies (lesson_id, vocabulary_id, sort_order)
    values (p_lesson_id, v_vocab_id, v_i)
    on conflict (lesson_id, vocabulary_id)
    do update set sort_order = v_i;
    v_count := v_count + 1;
  end loop;

  -- 3. Cập nhật trường đếm total_vocabularies trên bảng lessons
  update public.lessons
  set total_vocabularies = v_count
  where id = p_lesson_id;

  return jsonb_build_object('success', true, 'total_vocabularies', v_count);
end;
$$;

grant execute on function public.save_lesson_vocabularies(uuid, uuid[]) to authenticated;

-- 5. HÀM ĐỔI THỨ TỰ SLIDE TRONG BÀI HỌC (reorder_lesson_slides)
create or replace function public.reorder_lesson_slides(
  p_lesson_id uuid,
  p_slide_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i integer;
  v_slide_id uuid;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền sắp xếp slide.';
  end if;

  if p_slide_ids is null or cardinality(p_slide_ids) = 0 then
    return jsonb_build_object('success', true, 'updated_count', 0);
  end if;

  for v_i in 1..cardinality(p_slide_ids) loop
    v_slide_id := p_slide_ids[v_i];
    update public.lesson_slides
    set sort_order = v_i
    where lesson_id = p_lesson_id and id = v_slide_id;
  end loop;

  return jsonb_build_object('success', true, 'updated_count', cardinality(p_slide_ids));
end;
$$;

grant execute on function public.reorder_lesson_slides(uuid, uuid[]) to authenticated;

-- 6. HÀM ĐỔI THỨ TỰ BÀI TẬP TRONG BÀI HỌC (reorder_lesson_assignments)
create or replace function public.reorder_lesson_assignments(
  p_lesson_id uuid,
  p_assignment_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i integer;
  v_assign_id uuid;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền sắp xếp bài tập.';
  end if;

  if p_assignment_ids is null or cardinality(p_assignment_ids) = 0 then
    return jsonb_build_object('success', true, 'updated_count', 0);
  end if;

  for v_i in 1..cardinality(p_assignment_ids) loop
    v_assign_id := p_assignment_ids[v_i];
    update public.assignments
    set sort_order = v_i
    where lesson_id = p_lesson_id and id = v_assign_id;
  end loop;

  return jsonb_build_object('success', true, 'updated_count', cardinality(p_assignment_ids));
end;
$$;

grant execute on function public.reorder_lesson_assignments(uuid, uuid[]) to authenticated;

-- 7. HÀM KIỂM TRA TỪ TRÙNG TRONG GIÁO TRÌNH (check_duplicate_vocab_in_curriculum)
-- Giúp cảnh báo admin khi chọn từ đã từng xuất hiện ở bài khác trong cùng một giáo trình
create or replace function public.check_duplicate_vocab_in_curriculum(
  p_curriculum_id uuid,
  p_lesson_id uuid,
  p_vocab_ids uuid[]
)
returns table (
  vocabulary_id uuid,
  hanzi text,
  pinyin text,
  other_lesson_id uuid,
  other_lesson_order integer,
  other_lesson_title_zh text,
  other_lesson_title_vi text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Không có quyền truy cập.';
  end if;

  if p_vocab_ids is null or cardinality(p_vocab_ids) = 0 then
    return;
  end if;

  return query
  select
    v.id as vocabulary_id,
    v.hanzi,
    v.pinyin,
    l.id as other_lesson_id,
    l.order_index as other_lesson_order,
    l.title_zh as other_lesson_title_zh,
    l.title_vi as other_lesson_title_vi
  from public.lesson_vocabularies lv
  join public.lessons l on l.id = lv.lesson_id
  join public.vocabularies v on v.id = lv.vocabulary_id
  where l.curriculum_id = p_curriculum_id
    and (p_lesson_id is null or l.id <> p_lesson_id)
    and lv.vocabulary_id in (select unnest(p_vocab_ids))
  order by l.order_index asc;
end;
$$;

grant execute on function public.check_duplicate_vocab_in_curriculum(uuid, uuid, uuid[]) to authenticated;

-- 8. HÀM TRUY VẤN TOÀN BỘ CẤU THÀNH BÀI HỌC (get_lesson_full_composition)
-- Trả về siêu dữ liệu bài học, danh sách từ vựng (kèm sort_order), danh sách slide (kèm sort_order)
-- và danh sách bài tập (kèm sort_order) chỉ trong 1 lần gọi.
create or replace function public.get_lesson_full_composition(p_lesson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson jsonb;
  v_vocabularies jsonb;
  v_slides jsonb;
  v_assignments jsonb;
begin
  -- 1. Lấy thông tin bài học
  select to_jsonb(l) into v_lesson
  from public.lessons l
  where l.id = p_lesson_id;

  if v_lesson is null then
    raise exception 'Không tìm thấy bài học có ID %', p_lesson_id;
  end if;

  -- 2. Lấy danh sách từ vựng theo sort_order
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'link_id', lv.id,
      'vocabulary_id', v.id,
      'sort_order', lv.sort_order,
      'hanzi', v.hanzi,
      'pinyin', v.pinyin,
      'meaning_vi', v.meaning_vi,
      'hsk_level', v.hsk_level,
      'part_of_speech', v.part_of_speech,
      'example_hanzi', v.example_hanzi,
      'example_vi', v.example_vi,
      'audio_url', v.audio_url
    ) order by lv.sort_order asc, lv.id asc
  ), '[]'::jsonb)
  into v_vocabularies
  from public.lesson_vocabularies lv
  join public.vocabularies v on v.id = lv.vocabulary_id
  where lv.lesson_id = p_lesson_id;

  -- 3. Lấy danh sách slide theo sort_order
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'title', s.title,
      'file_path', s.file_path,
      'file_type', s.file_type,
      'file_size', s.file_size,
      'sort_order', s.sort_order,
      'created_at', s.created_at
    ) order by s.sort_order asc, s.id asc
  ), '[]'::jsonb)
  into v_slides
  from public.lesson_slides s
  where s.lesson_id = p_lesson_id;

  -- 4. Lấy danh sách bài tập theo sort_order
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'title', a.title,
      'description', a.description,
      'assignment_type', a.assignment_type,
      'reward_xp', a.reward_xp,
      'due_date', a.due_date,
      'sort_order', a.sort_order,
      'class_id', a.class_id,
      'listening_audio_url', a.listening_audio_url,
      'listening_questions', a.listening_questions,
      'speaking_prompt', a.speaking_prompt,
      'speaking_pinyin', a.speaking_pinyin,
      'speaking_sample_audio_url', a.speaking_sample_audio_url,
      'created_at', a.created_at
    ) order by a.sort_order asc, a.id asc
  ), '[]'::jsonb)
  into v_assignments
  from public.assignments a
  where a.lesson_id = p_lesson_id;

  return jsonb_build_object(
    'lesson', v_lesson,
    'vocabularies', v_vocabularies,
    'slides', v_slides,
    'assignments', v_assignments
  );
end;
$$;

grant execute on function public.get_lesson_full_composition(uuid) to authenticated;
