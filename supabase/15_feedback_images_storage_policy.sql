-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 15: ĐẢM BẢO BUCKET STORAGE VÀ RLS CHO ẢNH THÔNG BÁO (FEEDBACK-IMAGES)
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- 1. Đảm bảo bucket 'feedback-images' tồn tại, công khai và cấu hình giới hạn 2MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-images',
  'feedback-images',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 2. Bật Row Level Security cho storage.objects nếu chưa bật
alter table storage.objects enable row level security;

-- 3. Policy SELECT: Cho phép tất cả người dùng (kể cả khách / anon và học viên) xem ảnh feedback
drop policy if exists "Ai cũng xem được ảnh feedback" on storage.objects;
create policy "Ai cũng xem được ảnh feedback"
  on storage.objects for select
  using (bucket_id = 'feedback-images');

-- 4. Policy INSERT: Chỉ giáo viên và admin được tải ảnh feedback lên
drop policy if exists "Chỉ giáo viên và admin tải ảnh feedback" on storage.objects;
create policy "Chỉ giáo viên và admin tải ảnh feedback"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'feedback-images'
    and public.is_teacher_or_admin()
  );

-- 5. Policy UPDATE: Chỉ giáo viên và admin được cập nhật ảnh feedback khi ghi đè (upsert)
drop policy if exists "Chỉ giáo viên và admin cập nhật ảnh feedback" on storage.objects;
create policy "Chỉ giáo viên và admin cập nhật ảnh feedback"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'feedback-images'
    and public.is_teacher_or_admin()
  )
  with check (
    bucket_id = 'feedback-images'
    and public.is_teacher_or_admin()
  );

-- 6. Policy DELETE: Chỉ giáo viên và admin được xóa ảnh feedback qua Storage API
drop policy if exists "Chỉ giáo viên và admin xóa ảnh feedback" on storage.objects;
create policy "Chỉ giáo viên và admin xóa ảnh feedback"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'feedback-images'
    and public.is_teacher_or_admin()
  );
