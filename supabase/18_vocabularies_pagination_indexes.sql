-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 18: TỐI ƯU HÓA CHỈ MỤC CHO PHÂN TRANG & TÌM KIẾM TỪ VỰNG NHANH
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- 1. Chỉ mục phức hợp hỗ trợ phân trang và sắp xếp ổn định
-- Giúp truy vấn ORDER BY hsk_level ASC, created_at DESC, id ASC chạy tức thì mà không cần sort bộ nhớ
create index if not exists idx_vocab_pagination
  on public.vocabularies (hsk_level, created_at desc, id);

-- 2. Bật extension pg_trgm (nếu chưa có) để tăng tốc tìm kiếm từ khóa ILIKE %q%
create extension if not exists pg_trgm;

-- 3. Chỉ mục GIN Trigram cho Chữ Hán, Phiên âm Pinyin và Nghĩa tiếng Việt
-- Giúp tìm kiếm mờ (chứa chuỗi con) trên hàng chục nghìn từ vựng chỉ mất vài mili-giây
create index if not exists idx_vocab_hanzi_trgm
  on public.vocabularies using gin (hanzi gin_trgm_ops);

create index if not exists idx_vocab_pinyin_trgm
  on public.vocabularies using gin (pinyin gin_trgm_ops);

create index if not exists idx_vocab_meaning_trgm
  on public.vocabularies using gin (meaning_vi gin_trgm_ops);

-- Báo hiệu cho PostgREST làm mới schema cache
notify pgrst, 'reload schema';
