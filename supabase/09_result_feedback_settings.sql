-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 09: CẤU HÌNH POPUP THÔNG BÁO KẾT QUẢ THEO MỨC ĐIỂM (RESULT FEEDBACKS)
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG RESULT_FEEDBACKS (Tùy biến popup chúc mừng / khích lệ theo sự kiện & điểm số)
-- -----------------------------------------------------------------------------
create table if not exists public.result_feedbacks (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'quiz',               -- Hoàn thành bài kiểm tra / Quiz cuối bài (Có điểm)
    'practice',           -- Hoàn thành bài ôn tập / Flashcard SRS (Có điểm)
    'listening',          -- Hoàn thành bài nghe hiểu (Có điểm)
    'vocabulary',         -- Hoàn thành phần từ vựng (Không điểm)
    'speaking',           -- Nộp bài nói / ghi âm (Không điểm)
    'lesson',             -- Hoàn thành toàn bộ bài học (Không điểm)
    'assignment'          -- Nộp bài tập được giao (Không điểm)
  )),
  has_score boolean not null default false,
  min_score integer check (min_score is null or (min_score between 0 and 100)),
  max_score integer check (max_score is null or (max_score between 0 and 100)),
  title text,
  message text not null,
  image_url text not null,
  btn_text text not null default 'Tiếp tục',
  is_active boolean not null default true,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_feedbacks_event on public.result_feedbacks(event_type, is_active);
create index if not exists idx_feedbacks_score on public.result_feedbacks(min_score, max_score);

-- Bật Row Level Security (RLS)
alter table public.result_feedbacks enable row level security;

-- Mọi học sinh đã đăng nhập đều xem được cấu hình đang bật; Admin/Giáo viên xem được tất cả
drop policy if exists "Xem cấu hình feedback" on public.result_feedbacks;
create policy "Xem cấu hình feedback"
  on public.result_feedbacks for select to authenticated
  using (is_active = true or public.is_teacher_or_admin());

-- Cho phép cả người dùng chưa đăng nhập (anon) xem feedback nếu cần
drop policy if exists "Anon xem feedback đang bật" on public.result_feedbacks;
create policy "Anon xem feedback đang bật"
  on public.result_feedbacks for select to anon
  using (is_active = true);

-- Chỉ Admin và Giáo viên mới được thêm/sửa/xóa cấu hình
drop policy if exists "Chỉ giáo viên và admin quản lý feedback" on public.result_feedbacks;
create policy "Chỉ giáo viên và admin quản lý feedback"
  on public.result_feedbacks for all to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

-- -----------------------------------------------------------------------------
-- 2. TẠO SUPABASE STORAGE BUCKET "feedback-images" (CÔNG KHAI)
-- -----------------------------------------------------------------------------
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

-- Policy Storage: Ai cũng xem được ảnh (Public)
drop policy if exists "Ai cũng xem được ảnh feedback" on storage.objects;
create policy "Ai cũng xem được ảnh feedback"
  on storage.objects for select
  using (bucket_id = 'feedback-images');

-- Policy Storage: Chỉ Admin và Giáo viên được tải ảnh lên
drop policy if exists "Chỉ giáo viên và admin tải ảnh feedback" on storage.objects;
create policy "Chỉ giáo viên và admin tải ảnh feedback"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'feedback-images'
    and public.is_teacher_or_admin()
  );

-- Policy Storage: Chỉ Admin và Giáo viên được xóa ảnh
drop policy if exists "Chỉ giáo viên và admin xóa ảnh feedback" on storage.objects;
create policy "Chỉ giáo viên và admin xóa ảnh feedback"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'feedback-images'
    and public.is_teacher_or_admin()
  );

-- -----------------------------------------------------------------------------
-- 3. HÀM RPC TÌM POPUP FEEDBACK PHÙ HỢP NHẤT CHO HỌC SINH
-- -----------------------------------------------------------------------------
create or replace function public.get_matching_feedback(
  p_event_type text,
  p_score integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res record;
begin
  if p_score is not null then
    -- Tìm mức điểm chính xác
    select id, event_type, min_score, max_score, title, message, image_url, btn_text
    into v_res
    from public.result_feedbacks
    where event_type = p_event_type
      and is_active = true
      and min_score <= p_score
      and max_score >= p_score
    order by (max_score - min_score) asc, sort_order asc
    limit 1;

    -- Nếu không có khoảng nào khớp chính xác, lấy khoảng gần nhất
    if v_res.id is null then
      select id, event_type, min_score, max_score, title, message, image_url, btn_text
      into v_res
      from public.result_feedbacks
      where event_type = p_event_type
        and is_active = true
      order by abs(coalesce(min_score, 0) - p_score) asc, sort_order asc
      limit 1;
    end if;
  else
    -- Sự kiện không có điểm
    select id, event_type, min_score, max_score, title, message, image_url, btn_text
    into v_res
    from public.result_feedbacks
    where event_type = p_event_type
      and is_active = true
    order by sort_order asc
    limit 1;
  end if;

  if v_res.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_res.id,
    'event_type', v_res.event_type,
    'title', v_res.title,
    'message', v_res.message,
    'image_url', v_res.image_url,
    'btn_text', v_res.btn_text,
    'min_score', v_res.min_score,
    'max_score', v_res.max_score
  );
end;
$$;

grant execute on function public.get_matching_feedback(text, integer) to authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4. DỮ LIỆU MẪU BAN ĐẦU (SEED DATA CHUẨN)
-- -----------------------------------------------------------------------------
-- Thêm các mức feedback mặc định nếu bảng đang trống
do $$
begin
  if not exists (select 1 from public.result_feedbacks limit 1) then
    -- 1. Quiz: Dưới 50 điểm (Khích lệ)
    insert into public.result_feedbacks (event_type, has_score, min_score, max_score, title, message, image_url, btn_text, sort_order)
    values (
      'quiz', true, 0, 49,
      'Cố lên bạn nhé!',
      'Đừng nản lòng, hãy xem lại từ vựng một chút rồi làm lại bài nhé! Thành công đang chờ bạn phía trước.',
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80',
      'Ôn tập và thử lại', 1
    );

    -- 2. Quiz: 50 - 79 điểm (Tiến bộ)
    insert into public.result_feedbacks (event_type, has_score, min_score, max_score, title, message, image_url, btn_text, sort_order)
    values (
      'quiz', true, 50, 79,
      'Khá lắm!',
      'Bạn đã nắm được phần lớn kiến thức rồi. Thêm một chút chú ý nữa là đạt điểm tuyệt đối đấy!',
      'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&auto=format&fit=crop&q=80',
      'Tiếp tục phát huy', 2
    );

    -- 3. Quiz: 80 - 100 điểm (Xuất sắc)
    insert into public.result_feedbacks (event_type, has_score, min_score, max_score, title, message, image_url, btn_text, sort_order)
    values (
      'quiz', true, 80, 100,
      'Xuất sắc! 太棒了!',
      'Chúc mừng bạn đã vượt qua bài kiểm tra với số điểm cực kỳ ấn tượng! Hãy nhận thưởng XP xứng đáng nhé.',
      'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=600&auto=format&fit=crop&q=80',
      'Nhận thưởng và tiếp tục', 3
    );

    -- 4. Hoàn thành Từ vựng
    insert into public.result_feedbacks (event_type, has_score, title, message, image_url, btn_text, sort_order)
    values (
      'vocabulary', false,
      'Nạp thêm từ mới thành công!',
      'Bạn vừa học xong toàn bộ từ vựng mới của bài. Hãy chuyển sang Flashcard hoặc làm bài tập để ghi nhớ sâu hơn nhé!',
      'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&auto=format&fit=crop&q=80',
      'Bắt đầu luyện tập', 1
    );

    -- 5. Nộp bài Nói / Ghi âm
    insert into public.result_feedbacks (event_type, has_score, title, message, image_url, btn_text, sort_order)
    values (
      'speaking', false,
      'Đã nộp bài ghi âm thành công!',
      'Bản thu âm của bạn đã được chuyển đến giáo viên để lắng nghe và chấm điểm. Cùng chờ nhận xét nhé!',
      'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=600&auto=format&fit=crop&q=80',
      'Xem bài tập khác', 1
    );

    -- 6. Hoàn thành bài Nghe
    insert into public.result_feedbacks (event_type, has_score, min_score, max_score, title, message, image_url, btn_text, sort_order)
    values (
      'listening', true, 0, 100,
      'Hoàn thành bài luyện nghe!',
      'Kỹ năng nghe tiếng Trung của bạn đang tiến bộ từng ngày qua các bài đối thoại thực tế!',
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
      'Hoàn tất bài nghe', 1
    );

    -- 7. Hoàn thành bài học
    insert into public.result_feedbacks (event_type, has_score, title, message, image_url, btn_text, sort_order)
    values (
      'lesson', false,
      'Chúc mừng bạn đã hoàn thành bài học!',
      'Bạn đã chinh phục trọn vẹn cả 3 phần: Từ vựng, Nghe hiểu và Ghi âm. Bài học tiếp theo đã sẵn sàng!',
      'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop&q=80',
      'Đến bài tiếp theo', 1
    );
  end if;
end;
$$;
