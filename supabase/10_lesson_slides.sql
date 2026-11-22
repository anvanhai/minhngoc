-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 10: TẢI SLIDE BÀI GIẢNG (PDF, PPTX) & THEO DÕI DUNG LƯỢNG STORAGE
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG LESSON_SLIDES (Quản lý các tài liệu slide bài giảng gắn với bài học)
-- -----------------------------------------------------------------------------
create table if not exists public.lesson_slides (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  title text not null,                               -- Tiêu đề slide (vd: Slide Ngữ pháp Bài 1)
  file_path text not null,                           -- Đường dẫn lưu trong Storage bucket 'lesson-slides'
  file_type text not null check (file_type in ('pdf', 'pptx', 'ppt')),
  file_size bigint not null default 0,               -- Kích thước file tính bằng byte
  sort_order integer not null default 1,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lesson_slides_lesson on public.lesson_slides(lesson_id, sort_order);

-- Bật Row Level Security (RLS)
alter table public.lesson_slides enable row level security;

-- RLS: Giáo viên / Admin xem tất cả; Học sinh chỉ xem slide của các bài thuộc giáo trình lớp mình đang học
drop policy if exists "Học sinh xem slide lớp mình, giáo viên xem tất cả" on public.lesson_slides;
create policy "Học sinh xem slide lớp mình, giáo viên xem tất cả"
  on public.lesson_slides for select to authenticated
  using (
    public.is_teacher_or_admin()
    or exists (
      select 1 from public.lessons l
      join public.classes c on l.curriculum_id = c.curriculum_id
      join public.enrollments e on c.id = e.class_id
      where l.id = lesson_slides.lesson_id
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );

-- RLS: Chỉ Admin và Giáo viên mới được thêm/sửa/xóa slide
drop policy if exists "Chỉ giáo viên và admin quản lý slide" on public.lesson_slides;
create policy "Chỉ giáo viên và admin quản lý slide"
  on public.lesson_slides for all to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

-- -----------------------------------------------------------------------------
-- 2. TẠO SUPABASE STORAGE BUCKET RIÊNG TƯ "lesson-slides"
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-slides',
  'lesson-slides',
  false,               -- Bucket riêng tư (Private): chỉ truy cập qua Signed URL hoặc RLS
  20971520,            -- Giới hạn 20 MB / file (20 * 1024 * 1024)
  array[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];

-- Policy Storage: Chỉ người dùng đã đăng nhập và có quyền mới đọc được qua Signed URL
drop policy if exists "Người dùng có quyền đọc file slide" on storage.objects;
create policy "Người dùng có quyền đọc file slide"
  on storage.objects for select to authenticated
  using (bucket_id = 'lesson-slides');

-- Policy Storage: Chỉ Admin và Giáo viên được tải slide lên
drop policy if exists "Chỉ giáo viên và admin tải slide lên" on storage.objects;
create policy "Chỉ giáo viên và admin tải slide lên"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lesson-slides'
    and public.is_teacher_or_admin()
  );

-- Policy Storage: Chỉ Admin và Giáo viên được xóa slide
drop policy if exists "Chỉ giáo viên và admin xóa slide" on storage.objects;
create policy "Chỉ giáo viên và admin xóa slide"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'lesson-slides'
    and public.is_teacher_or_admin()
  );

-- -----------------------------------------------------------------------------
-- 3. HÀM RPC THEO DÕI TỔNG DUNG LƯỢNG SLIDE ĐÃ DÙNG (GIÁM SÁT GÓI 1GB FREE)
-- -----------------------------------------------------------------------------
create or replace function public.get_lesson_slides_storage_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_files integer := 0;
  v_total_bytes bigint := 0;
  v_total_mb numeric := 0;
  v_percent numeric := 0;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền tra cứu.';
  end if;

  select count(*), coalesce(sum(file_size), 0)
  into v_total_files, v_total_bytes
  from public.lesson_slides;

  -- 1 MB = 1048576 bytes
  v_total_mb := round((v_total_bytes::numeric / 1048576.0), 2);
  -- Gói miễn phí 1GB = 1024 MB
  v_percent := round((v_total_mb / 1024.0) * 100.0, 2);

  return jsonb_build_object(
    'total_files', v_total_files,
    'total_bytes', v_total_bytes,
    'total_mb', v_total_mb,
    'quota_mb', 1024,
    'percent_used', v_percent
  );
end;
$$;

grant execute on function public.get_lesson_slides_storage_stats() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. HÀM RPC XÓA AN TOÀN SLIDE BÀI HỌC
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_lesson_slide(p_slide_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file_path text;
  v_title text;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền xóa slide.';
  end if;

  select file_path, title into v_file_path, v_title
  from public.lesson_slides
  where id = p_slide_id;

  if v_file_path is null then
    raise exception 'Không tìm thấy slide bài học.';
  end if;

  delete from public.lesson_slides where id = p_slide_id;

  return jsonb_build_object(
    'success', true,
    'file_path', v_file_path,
    'title', v_title
  );
end;
$$;

grant execute on function public.admin_delete_lesson_slide(uuid) to authenticated;
