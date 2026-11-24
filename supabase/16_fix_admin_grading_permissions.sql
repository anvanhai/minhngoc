-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 16: CẤP QUYỀN VÀ ĐẢM BẢO RLS CHO TÍNH NĂNG CHẤM BÀI GHI ÂM CỦA ADMIN
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- 1. Cấp quyền thực thi hàm grade_recording_submission cho người dùng đã đăng nhập (Giáo viên / Admin)
grant execute on function public.grade_recording_submission(uuid, integer, text) to authenticated;

-- 2. Đảm bảo quyền truy cập bảng recording_submissions cho giáo viên và admin
drop policy if exists "Học sinh xem bài ghi âm của mình, giáo viên xem lớp mình" on public.recording_submissions;
create policy "Học sinh xem bài ghi âm của mình, giáo viên xem lớp mình"
  on public.recording_submissions for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_teacher_or_admin()
  );

drop policy if exists "Chỉ giáo viên và admin mới được chấm bài ghi âm" on public.recording_submissions;
create policy "Chỉ giáo viên và admin mới được chấm bài ghi âm"
  on public.recording_submissions for update to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

drop policy if exists "Giáo viên và admin được xóa bản ghi" on public.recording_submissions;
create policy "Giáo viên và admin được xóa bản ghi"
  on public.recording_submissions for delete to authenticated
  using (public.is_teacher_or_admin());

-- 3. Cấp quyền thực thi hàm xóa bài tập cho authenticated
grant execute on function public.delete_assignment(uuid) to authenticated;
