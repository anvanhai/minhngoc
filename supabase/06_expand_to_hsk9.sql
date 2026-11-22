-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 06: MỞ RỘNG CẤP ĐỘ LÊN HSK 9 (HSK 1 ĐẾN HSK 9)
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- 1. CẬP NHẬT RÀNG BUỘC CỘT hsk_level (CHO PHÉP 1 ĐẾN 9)
-- Tự động tìm và xóa an toàn mọi check constraint cũ liên quan đến cột hsk_level
do $$
declare
  r record;
begin
  for r in (
    select tc.table_schema, tc.table_name, tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
      and ccu.table_schema = tc.table_schema
    where tc.table_schema = 'public'
      and tc.constraint_type = 'CHECK'
      and ccu.column_name = 'hsk_level'
  ) loop
    execute 'alter table ' || quote_ident(r.table_schema) || '.' || quote_ident(r.table_name) || ' drop constraint if exists ' || quote_ident(r.constraint_name);
  end loop;
end $$;

-- Drop trực tiếp tên constraint mặc định nếu có
alter table public.vocabularies drop constraint if exists vocabularies_hsk_level_check;

-- Thêm lại constraint chuẩn cho phép hsk_level từ 1 đến 9
alter table public.vocabularies
  add constraint vocabularies_hsk_level_check check (hsk_level between 1 and 9);

-- 2. ĐẢM BẢO GIÁ TRỊ MẶC ĐỊNH & CHỈ MỤC INDEX
alter table public.vocabularies
  alter column hsk_level set default 1;

create index if not exists idx_vocab_hsk_level on public.vocabularies(hsk_level);

-- Ghi chú xác nhận hoàn thành
comment on column public.vocabularies.hsk_level is 'Cấp độ HSK chuẩn hóa từ HSK 1 đến HSK 9';
