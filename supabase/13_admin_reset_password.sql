-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 13: HÀM ĐẶT LẠI MẬT KHẨU NGƯỜI DÙNG DÀNH CHO ADMIN
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- 1. Kích hoạt extension pgcrypto (cung cấp hàm gen_salt và crypt) nếu chưa có
create extension if not exists "pgcrypto";

-- 2. Định nghĩa hàm admin_reset_password:
-- - Quyền: SECURITY DEFINER (thực thi dưới quyền postgres để được phép cập nhật auth.users)
-- - Bảo mật: search_path an toàn (public, auth, extensions)
-- - Phân quyền: Kiểm tra người gọi phải là Admin dựa trên bảng public.profiles (cột role)
-- - Kiểm tra: Mật khẩu mới tối thiểu 6 ký tự
-- - Mã hóa: auth.users.encrypted_password = crypt(new_password, gen_salt('bf'))
-- - Bảo mật thông tin: Tuyệt đối không ghi log hay lưu trữ mật khẩu dạng chữ thường (plain-text)
create or replace function public.admin_reset_password(
  target_user_id uuid,
  new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_target_username text;
  v_target_display_name text;
begin
  -- BƯỚC 1: Xác thực người gọi hàm
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Yêu cầu đăng nhập để thực hiện chức năng này.';
  end if;

  -- BƯỚC 2: Kiểm tra quyền Admin trong bảng public.profiles
  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role <> 'admin' then
    raise exception 'Từ chối truy cập: Chỉ quản trị viên (Admin) mới có quyền đặt lại mật khẩu.';
  end if;

  -- BƯỚC 3: Kiểm tra tính hợp lệ của tham số đầu vào
  if target_user_id is null then
    raise exception 'ID người dùng (target_user_id) không được để trống.';
  end if;

  if new_password is null or length(new_password) < 6 then
    raise exception 'Mật khẩu mới phải có tối thiểu 6 ký tự.';
  end if;

  -- BƯỚC 4: Kiểm tra tài khoản người dùng mục tiêu có tồn tại không
  select username, display_name into v_target_username, v_target_display_name
  from public.profiles
  where id = target_user_id;

  if not found then
    raise exception 'Không tìm thấy hồ sơ người dùng trong hệ thống (profiles).';
  end if;

  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'Tài khoản không tồn tại trong hệ thống xác thực (auth.users).';
  end if;

  -- BƯỚC 5: Cập nhật auth.users.encrypted_password bằng bcrypt và cập nhật updated_at
  -- Tuyệt đối không lưu hay ghi log mật khẩu chữ thường ở bất kỳ đâu
  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = now()
  where id = target_user_id;

  -- BƯỚC 6: Trả về kết quả xác nhận thành công
  return jsonb_build_object(
    'success', true,
    'message', 'Đặt lại mật khẩu thành công.',
    'target_user_id', target_user_id,
    'username', v_target_username,
    'display_name', v_target_display_name
  );
end;
$$;

-- 3. Phân quyền thực thi:
-- Thu hồi quyền từ public và anon, chỉ cấp quyền cho authenticated
revoke all on function public.admin_reset_password(uuid, text) from public;
revoke all on function public.admin_reset_password(uuid, text) from anon;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;

comment on function public.admin_reset_password(uuid, text) is
'Cho phép Admin đặt lại mật khẩu cho tài khoản người dùng bằng cách mã hóa bcrypt trực tiếp vào auth.users';
