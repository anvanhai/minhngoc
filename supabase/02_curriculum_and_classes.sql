-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 02: GIÁO TRÌNH, BÀI HỌC, TỪ VỰNG, LỚP HỌC & ENROLLMENTS
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BẢNG CURRICULUMS (Giáo trình học tập: HSK Chuẩn, Boya, Giao tiếp...)
-- -----------------------------------------------------------------------------
create table if not exists public.curriculums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  code text unique not null,
  level text not null default 'HSK1',
  description text,
  thumbnail_url text,
  total_lessons integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_curriculums_level on public.curriculums(level);

-- -----------------------------------------------------------------------------
-- 2. BẢNG LESSONS (Bài học thuộc Giáo trình)
-- -----------------------------------------------------------------------------
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curriculums(id) on delete cascade,
  order_index integer not null,
  title_zh text not null,
  title_vi text not null,
  description text,
  audio_dialogue_url text,
  grammar_notes text,
  pass_score_percent integer not null default 80 check (pass_score_percent between 50 and 100),
  reward_xp integer not null default 50 check (reward_xp >= 0),
  created_at timestamptz not null default now(),
  constraint uq_curriculum_lesson_order unique (curriculum_id, order_index)
);

create index if not exists idx_lessons_curriculum on public.lessons(curriculum_id, order_index);

-- -----------------------------------------------------------------------------
-- 3. BẢNG VOCABULARIES (Kho từ vựng tập trung)
-- -----------------------------------------------------------------------------
create table if not exists public.vocabularies (
  id uuid primary key default gen_random_uuid(),
  hanzi text not null,
  pinyin text not null,
  meaning_vi text not null,
  hsk_level integer not null default 1 check (hsk_level between 1 and 6),
  part_of_speech text,
  audio_url text,
  stroke_order_gif text,
  example_hanzi text,
  example_pinyin text,
  example_vi text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vocab_hanzi on public.vocabularies(hanzi);
create index if not exists idx_vocab_hsk_level on public.vocabularies(hsk_level);

-- -----------------------------------------------------------------------------
-- 4. BẢNG LESSON_VOCABULARIES (Gán từ vựng vào bài học cụ thể)
-- -----------------------------------------------------------------------------
create table if not exists public.lesson_vocabularies (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  vocabulary_id uuid not null references public.vocabularies(id) on delete cascade,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  constraint uq_lesson_vocab unique (lesson_id, vocabulary_id)
);

create index if not exists idx_lesson_vocab_lesson on public.lesson_vocabularies(lesson_id, sort_order);

-- -----------------------------------------------------------------------------
-- 5. BẢNG CLASSES (Lớp học - HSK1-A, HSK1-B, HSK2-A...)
-- -----------------------------------------------------------------------------
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  curriculum_id uuid not null references public.curriculums(id) on delete restrict,
  level text not null default 'HSK1',
  teacher_id uuid references public.profiles(id) on delete set null,
  start_date date not null default current_date,
  end_date date,
  status text not null default 'ongoing' check (status in ('ongoing', 'paused', 'completed')),
  unlock_mode text not null default 'sequential' check (unlock_mode in ('sequential', 'all_open')),
  current_lesson_order integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_classes_status on public.classes(status);
create index if not exists idx_classes_curriculum on public.classes(curriculum_id);

-- -----------------------------------------------------------------------------
-- 6. BẢNG ENROLLMENTS (Học sinh tham gia lớp - Quản lý lịch sử học tập trọn đời)
-- -----------------------------------------------------------------------------
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'transferred')),
  joined_at date not null default current_date,
  completed_at date,
  note text,
  created_at timestamptz not null default now(),
  constraint uq_student_class unique (student_id, class_id)
);

create index if not exists idx_enrollments_student on public.enrollments(student_id, status);
create index if not exists idx_enrollments_class on public.enrollments(class_id, status);

-- -----------------------------------------------------------------------------
-- 7. TRIGGER TỰ ĐỘNG CẬP NHẬT TỔNG SỐ BÀI HỌC TRONG GIÁO TRÌNH
-- -----------------------------------------------------------------------------
create or replace function public.sync_curriculum_total_lessons()
returns trigger
language plpgsql
security definer
as $$
declare
  target_curriculum_id uuid;
begin
  if TG_OP = 'DELETE' then
    target_curriculum_id := old.curriculum_id;
  else
    target_curriculum_id := new.curriculum_id;
  end if;

  update public.curriculums
  set total_lessons = (
    select count(*) from public.lessons where curriculum_id = target_curriculum_id
  )
  where id = target_curriculum_id;

  return null;
end;
$$;

drop trigger if exists trg_sync_curriculum_lessons on public.lessons;
create trigger trg_sync_curriculum_lessons
  after insert or update or delete on public.lessons
  for each row execute procedure public.sync_curriculum_total_lessons();

-- -----------------------------------------------------------------------------
-- 8. THIẾT LẬP CHÍNH SÁCH BẢO MẬT ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------

-- 8.1. Bảng curriculums
alter table public.curriculums enable row level security;

create policy "Tất cả người dùng đã đăng nhập đều xem được giáo trình"
  on public.curriculums for select to authenticated
  using (true);

create policy "Chỉ admin và giáo viên mới được thêm/sửa/xóa giáo trình"
  on public.curriculums for all to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

-- 8.2. Bảng lessons
alter table public.lessons enable row level security;

create policy "Tất cả người dùng đã đăng nhập đều xem được bài học"
  on public.lessons for select to authenticated
  using (true);

create policy "Chỉ admin và giáo viên mới được thêm/sửa/xóa bài học"
  on public.lessons for all to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

-- 8.3. Bảng vocabularies
alter table public.vocabularies enable row level security;

create policy "Tất cả người dùng đã đăng nhập đều xem được từ vựng"
  on public.vocabularies for select to authenticated
  using (true);

create policy "Chỉ admin và giáo viên mới được quản lý kho từ vựng"
  on public.vocabularies for all to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

-- 8.4. Bảng lesson_vocabularies
alter table public.lesson_vocabularies enable row level security;

create policy "Tất cả người dùng đã đăng nhập đều xem được từ trong bài"
  on public.lesson_vocabularies for select to authenticated
  using (true);

create policy "Chỉ admin và giáo viên mới được gán từ vào bài"
  on public.lesson_vocabularies for all to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

-- 8.5. Bảng classes
alter table public.classes enable row level security;

-- Admin/giáo viên xem được tất cả các lớp; Học sinh xem được lớp mà mình đang tham gia
create policy "Xem lớp học phù hợp quyền"
  on public.classes for select to authenticated
  using (
    public.is_teacher_or_admin()
    or exists (
      select 1 from public.enrollments e
      where e.class_id = classes.id and e.student_id = auth.uid()
    )
  );

create policy "Chỉ admin và giáo viên mới được quản lý lớp học"
  on public.classes for all to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

-- 8.6. Bảng enrollments
alter table public.enrollments enable row level security;

create policy "Học sinh xem lịch sử lớp của mình, giáo viên xem tất cả"
  on public.enrollments for select to authenticated
  using (
    student_id = auth.uid() or public.is_teacher_or_admin()
  );

create policy "Chỉ admin và giáo viên mới được ghi danh học sinh vào lớp"
  on public.enrollments for all to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

-- -----------------------------------------------------------------------------
-- 9. DỮ LIỆU KHỞI TẠO MẪU (SEED DATA: GIÁO TRÌNH CHUẨN HSK1 & BÀI 1)
-- -----------------------------------------------------------------------------
do $$
declare
  curr_id uuid;
  less_id uuid;
  v1 uuid;
  v2 uuid;
  v3 uuid;
begin
  -- 1. Tạo Giáo trình mẫu HSK1 nếu chưa có
  if not exists (select 1 from public.curriculums where code = 'HSK1_STANDARD') then
    insert into public.curriculums (title, code, level, description, total_lessons)
    values (
      'Giáo trình Chuẩn HSK 1',
      'HSK1_STANDARD',
      'HSK1',
      'Bộ giáo trình chuẩn HSK cấp độ 1 dành cho người mới bắt đầu học tiếng Trung.',
      1
    ) returning id into curr_id;

    -- 2. Tạo Bài 1 mẫu
    insert into public.lessons (curriculum_id, order_index, title_zh, title_vi, description, reward_xp)
    values (
      curr_id,
      1,
      '你好',
      'Chào bạn',
      'Bài học vỡ lòng: Chào hỏi, làm quen và đại từ nhân xưng cơ bản.',
      50
    ) returning id into less_id;

    -- 3. Tạo một số từ vựng mẫu
    insert into public.vocabularies (hanzi, pinyin, meaning_vi, hsk_level, part_of_speech, example_hanzi, example_pinyin, example_vi)
    values
      ('你', 'nǐ', 'Bạn, cậu, anh, chị (ngôi thứ 2 số ít)', 1, 'Đại từ', '你好！', 'Nǐ hǎo!', 'Chào bạn!'),
      ('好', 'hǎo', 'Tốt, đẹp, khỏe, ngon', 1, 'Tính từ', '很好。', 'Hěn hǎo.', 'Rất tốt.'),
      ('您', 'nín', 'Ngài, ông, bà (kính ngữ của 你)', 1, 'Đại từ', '老师，您好！', 'Lǎoshī, nín hǎo!', 'Chào thầy/cô ạ!')
    on conflict do nothing;

    -- Lấy ID các từ vừa tạo để gán vào bài 1
    select id into v1 from public.vocabularies where hanzi = '你' limit 1;
    select id into v2 from public.vocabularies where hanzi = '好' limit 1;
    select id into v3 from public.vocabularies where hanzi = '您' limit 1;

    if v1 is not null and less_id is not null then
      insert into public.lesson_vocabularies (lesson_id, vocabulary_id, sort_order)
      values (less_id, v1, 1), (less_id, v2, 2), (less_id, v3, 3)
      on conflict do nothing;
    end if;
  end if;
end;
$$;
