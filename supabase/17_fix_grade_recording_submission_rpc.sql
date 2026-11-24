-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 17: NÂNG CẤP VÀ ĐỒNG BỘ HÀM CHẤM BÀI GHI ÂM (GRADE_RECORDING_SUBMISSION)
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- 1. Xóa các phiên bản cũ của hàm (nếu có) để tránh xung đột chữ ký tham số
drop function if exists public.grade_recording_submission(uuid, integer, text);
drop function if exists public.grade_recording_submission(uuid, integer, text, uuid);

-- 2. Định nghĩa hàm mới với đầy đủ kiểm tra bảo mật và tham số linh hoạt
create or replace function public.grade_recording_submission(
  p_recording_id uuid default null,
  p_score integer default 0,
  p_comment text default null,
  p_submission_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_target_id uuid;
  v_rec record;
  v_max_xp integer := 30;
  v_xp_awarded integer := 0;
  v_already_rewarded boolean := false;
begin
  -- 2.1. Kiểm tra xác thực người gọi
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Yêu cầu đăng nhập để thực hiện chấm bài!';
  end if;

  -- 2.2. Kiểm tra quyền hạn từ bảng profiles (chỉ admin hoặc teacher)
  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role not in ('admin', 'teacher') then
    raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền chấm bài!';
  end if;

  -- 2.3. Lấy mã bài nộp (hỗ trợ cả p_recording_id và p_submission_id)
  v_target_id := coalesce(p_recording_id, p_submission_id);
  if v_target_id is null then
    raise exception 'Vui lòng cung cấp mã bài nộp ghi âm (p_recording_id hoặc p_submission_id)!';
  end if;

  -- 2.4. Kiểm tra điểm số hợp lệ từ 0 đến 100
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'Điểm số phải nằm trong khoảng từ 0 đến 100!';
  end if;

  -- 2.5. Lấy thông tin bản ghi bài nộp ghi âm
  select r.*, a.reward_xp, a.title as assign_title
  into v_rec
  from public.recording_submissions r
  left join public.assignments a on a.id = r.assignment_id
  where r.id = v_target_id;

  if v_rec.id is null then
    raise exception 'Không tìm thấy bài nộp ghi âm tương ứng với mã yêu cầu!';
  end if;

  -- 2.6. Cập nhật bảng recording_submissions
  update public.recording_submissions
  set
    score = p_score,
    teacher_comment = trim(coalesce(p_comment, '')),
    status = 'graded',
    graded_by = v_caller_id,
    graded_at = now()
  where id = v_target_id;

  -- 2.7. Đồng bộ sang assignment_submissions (nếu bài tập gắn với assignment)
  if v_rec.assignment_id is not null then
    update public.assignment_submissions
    set
      score = p_score,
      teacher_comment = trim(coalesce(p_comment, '')),
      status = 'graded',
      graded_by = v_caller_id,
      graded_at = now()
    where assignment_id = v_rec.assignment_id and student_id = v_rec.student_id;
  end if;

  -- 2.8. Tính toán và cộng thưởng XP (chỉ cộng 1 lần duy nhất)
  if coalesce(v_rec.reward_xp, 0) > 0 then
    v_max_xp := v_rec.reward_xp;
  end if;

  v_xp_awarded := round((p_score::numeric / 100.0) * v_max_xp);

  -- Kiểm tra xem học sinh đã từng được cộng XP cho bài tập này chưa
  if v_rec.assignment_id is not null then
    select exists (
      select 1 from public.xp_transactions
      where student_id = v_rec.student_id
        and reference_id = v_rec.assignment_id
        and source_type = 'assignment_completed'
    ) into v_already_rewarded;

    -- Chỉ cộng thưởng XP nếu chưa từng cộng và số XP > 0
    if not v_already_rewarded and v_xp_awarded > 0 then
      insert into public.xp_transactions (
        student_id,
        class_id,
        amount,
        source_type,
        reference_id,
        description
      )
      values (
        v_rec.student_id,
        v_rec.class_id,
        v_xp_awarded,
        'assignment_completed',
        v_rec.assignment_id,
        'Giáo viên chấm bài Nói: ' || coalesce(v_rec.assign_title, v_rec.prompt_text) || ' (' || p_score || ' điểm)'
      );

      -- Cập nhật tổng XP trọn đời của học sinh
      update public.profiles
      set lifetime_xp = coalesce(lifetime_xp, 0) + v_xp_awarded
      where id = v_rec.student_id;
    end if;
  end if;

  return json_build_object(
    'success', true,
    'recording_id', v_target_id,
    'score', p_score,
    'xp_awarded', v_xp_awarded,
    'already_rewarded', coalesce(v_already_rewarded, false),
    'graded_at', now()
  );
end;
$$;

-- 3. Cấp quyền thực thi hàm cho role authenticated (giáo viên và admin)
grant execute on function public.grade_recording_submission(uuid, integer, text, uuid) to authenticated;

-- 4. Báo hiệu cho PostgREST làm mới ngay schema cache để nhận diện hàm
notify pgrst, 'reload schema';
