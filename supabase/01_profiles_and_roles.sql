-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 01: BẢNG PROFILES & PHÂN QUYỀN (ROLES & SECURITY)
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- 1. Bật extension tạo UUID ngẫu nhiên nếu chưa có
create extension if not exists "pgcrypto";

-- 2. TẠO BẢNG PROFILES (Hồ sơ người dùng & Phân quyền)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  phone text,
  avatar_url text,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  lifetime_xp integer not null default 0 check (lifetime_xp >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  last_active_at timestamptz default now(),
  created_at timestamptz not null default now(),
  constraint chk_username_format check (username ~* '^[a-z0-9_]{3,30}$')
);

-- Chỉ mục tối ưu tìm kiếm theo username và role
create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_profiles_role on public.profiles(role);

-- -----------------------------------------------------------------------------
-- 3. CÁC HÀM BẢO MẬT & KIỂM TRA QUYỀN (SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- Hàm kiểm tra người dùng hiện tại có phải là Admin hay không
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Hàm kiểm tra người dùng hiện tại là Giáo viên hoặc Admin
create or replace function public.is_teacher_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'teacher')
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. TRIGGER TỰ ĐỘNG KHỞI TẠO PROFILE KHI ĐĂNG KÝ AUTH.USERS
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_user text;
  clean_user text;
  raw_display text;
  raw_phone text;
begin
  -- Lấy thông tin từ raw_user_meta_data gửi lên khi đăng ký
  raw_user := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  clean_user := lower(trim(raw_user));
  raw_display := coalesce(new.raw_user_meta_data->>'display_name', clean_user);
  raw_phone := new.raw_user_meta_data->>'phone';

  -- Khởi tạo profile mặc định: role luôn là 'student', XP = 0, Streak = 0
  insert into public.profiles (
    id,
    username,
    display_name,
    phone,
    role,
    lifetime_xp,
    current_streak,
    last_active_at,
    created_at
  ) values (
    new.id,
    clean_user,
    raw_display,
    raw_phone,
    'student',
    0,
    0,
    now(),
    now()
  );

  return new;
end;
$$;

-- Gắn trigger vào bảng auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 5. TRIGGER BẢO VỆ CỘT ROLE, LIFETIME_XP, CURRENT_STREAK KHỎI BỊ HỌC SINH SỬA
-- -----------------------------------------------------------------------------
create or replace function public.protect_sensitive_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nếu người thực hiện KHÔNG phải là admin:
  -- Tuyệt đối không cho phép tự ý nâng role hoặc tự cộng điểm XP/streak
  if not public.is_admin() then
    new.role := old.role;
    new.lifetime_xp := old.lifetime_xp;
    new.current_streak := old.current_streak;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_fields on public.profiles;
create trigger trg_protect_profile_fields
  before update on public.profiles
  for each row execute procedure public.protect_sensitive_profile_fields();

-- -----------------------------------------------------------------------------
-- 6. CHÍNH SÁCH BẢO MẬT ROW LEVEL SECURITY (RLS) CHO BẢNG PROFILES
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- 6.1. Quyền XEM (SELECT):
-- Mọi người dùng đã đăng nhập đều có thể xem profile cơ bản của nhau (để hiển thị bảng xếp hạng, avatar, tên)
create policy "Mọi tài khoản đăng nhập đều có thể xem profiles"
  on public.profiles
  for select
  to authenticated
  using (true);

-- 6.2. Quyền CẬP NHẬT (UPDATE):
-- Người dùng tự cập nhật thông tin cá nhân của chính mình (display_name, phone, avatar_url)
-- Lưu ý: Các cột role, lifetime_xp, current_streak đã được trigger protect_sensitive_profile_fields bảo vệ
create policy "Người dùng có thể sửa profile của chính mình"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admin có toàn quyền sửa bất kỳ profile nào (ví dụ gán role teacher/admin)
create policy "Admin có toàn quyền cập nhật mọi profile"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 7. CÂU LỆNH NÂNG CẤP TÀI KHOẢN ADMIN ĐẦU TIÊN (HƯỚNG DẪN CHO BẠN)
-- Sau khi bạn tự đăng ký tài khoản admin (ví dụ username là 'admin'),
-- hãy chạy lệnh dưới đây để cấp quyền Quản trị viên cao nhất:
--
-- UPDATE public.profiles
-- SET role = 'admin'
-- WHERE username = 'admin';
-- =============================================================================
