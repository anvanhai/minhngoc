-- =============================================================================
-- MINH NGỌC HSK - HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TIẾNG TRUNG
-- MIGRATION 22: MỞ RỘNG RÀNG BUỘC XP_TRANSACTIONS_SOURCE_TYPE_CHECK & HOÀN THIỆN CHẤM BÀI GHI ÂM
-- Hướng dẫn: Dán toàn bộ nội dung file này vào Supabase SQL Editor và nhấn RUN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CHUẨN HÓA DỮ LIỆU HIỆN CÓ TRƯỚC KHI TẠO RÀNG BUỘC MỚI
-- Đảm bảo không có dòng nào có source_type rỗng hoặc null gây lỗi khi add check constraint
-- -----------------------------------------------------------------------------
update public.xp_transactions
set source_type = 'assignment_completed'
where source_type is null or trim(source_type) = '';

-- -----------------------------------------------------------------------------
-- 2. MỞ RỘNG RÀNG BUỘC CHECK: XP_TRANSACTIONS_SOURCE_TYPE_CHECK
-- Bao gồm đầy đủ các loại giao dịch điểm XP đang và sẽ sử dụng trong hệ thống
-- -----------------------------------------------------------------------------
alter table public.xp_transactions
  drop constraint if exists xp_transactions_source_type_check;

alter table public.xp_transactions
  add constraint xp_transactions_source_type_check
  check (
    source_type in (
      'quiz_passed',            -- Hoàn thành quiz bài kiểm tra
      'assignment_completed',  -- Hoàn thành nộp bài tập (từ vựng, nghe, nói)
      'assignment_graded',     -- Giáo viên chấm điểm bài tập (hỗ trợ tương thích ngược)
      'recording_grade',       -- Giáo viên chấm điểm phát âm & ghi âm
      'streak_bonus',          -- Thưởng duy trì chuỗi ngày học liên tục
      'admin_reward',          -- Thưởng XP trực tiếp từ Admin
      'lesson_completed',      -- Hoàn thành toàn bộ nội dung bài học
      'feedback_bonus',        -- Thưởng XP từ popup tương tác / sự kiện
      'review_bonus',          -- Thưởng XP ôn tập từ vựng SRS
      'vocabulary_milestone'   -- Cột mốc học từ vựng
    )
  );

-- -----------------------------------------------------------------------------
-- 3. CẬP NHẬT HÀM RPC GRADE_RECORDING_SUBMISSION
-- Giữ nguyên chữ ký để client JS gọi mượt mà không bị lỗi schema cache
-- Đảm bảo: Chỉ giáo viên/admin được chấm, điểm 0-100, chỉ cộng XP 1 lần duy nhất,
-- lưu nhận xét chữ và nhận xét giọng nói của cô giáo.
-- -----------------------------------------------------------------------------
-- Xóa các phiên bản cũ để tránh xung đột chữ ký
drop function if exists public.grade_recording_submission(uuid, integer, text);
drop function if exists public.grade_recording_submission(uuid, integer, text, uuid);
drop function if exists public.grade_recording_submission(uuid, integer, text, uuid, text);
drop function if exists public.grade_recording_submission(uuid, integer, text, uuid, text, text, integer);

create or replace function public.grade_recording_submission(
  p_recording_id uuid default null,
  p_score integer default 0,
  p_comment text default null,
  p_submission_id uuid default null,
  p_teacher_audio_url text default null,
  p_teacher_audio_mime text default 'audio/webm',
  p_teacher_audio_duration integer default 0
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
  v_ref_id uuid;
  v_clean_comment text;
  v_clean_audio text;
begin
  -- 3.1. Xác thực người dùng
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Yêu cầu đăng nhập để thực hiện chấm bài!';
  end if;

  -- 3.2. Kiểm tra quyền hạn từ bảng profiles (chỉ admin hoặc teacher)
  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role not in ('admin', 'teacher') then
    if not public.is_teacher_or_admin() then
      raise exception 'Chỉ quản trị viên hoặc giáo viên mới có quyền chấm bài!';
    end if;
  end if;

  -- 3.3. Lấy mã bài nộp (hỗ trợ cả p_recording_id và p_submission_id)
  v_target_id := coalesce(p_recording_id, p_submission_id);
  if v_target_id is null then
    raise exception 'Vui lòng cung cấp mã bài nộp ghi âm (p_recording_id hoặc p_submission_id)!';
  end if;

  -- 3.4. Kiểm tra điểm số hợp lệ từ 0 đến 100
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'Điểm số phải nằm trong khoảng từ 0 đến 100!';
  end if;

  v_clean_comment := trim(coalesce(p_comment, ''));
  v_clean_audio := trim(coalesce(p_teacher_audio_url, ''));
  if v_clean_audio = '' then
    v_clean_audio := null;
  end if;

  -- 3.5. Lấy thông tin bản ghi bài nộp ghi âm
  select r.*, a.reward_xp, a.title as assign_title
  into v_rec
  from public.recording_submissions r
  left join public.assignments a on a.id = r.assignment_id
  where r.id = v_target_id;

  if v_rec.id is null then
    raise exception 'Không tìm thấy bài nộp ghi âm tương ứng với mã yêu cầu!';
  end if;

  -- 3.6. Cập nhật bảng recording_submissions
  update public.recording_submissions
  set
    score = p_score,
    teacher_comment = v_clean_comment,
    teacher_audio_url = coalesce(v_clean_audio, teacher_audio_url),
    teacher_audio_mime = coalesce(p_teacher_audio_mime, teacher_audio_mime, 'audio/webm'),
    teacher_audio_duration = coalesce(p_teacher_audio_duration, teacher_audio_duration, 0),
    status = 'graded',
    graded_by = v_caller_id,
    graded_at = now()
  where id = v_target_id;

  -- 3.7. Đồng bộ sang assignment_submissions (nếu bài tập gắn với assignment)
  if v_rec.assignment_id is not null then
    update public.assignment_submissions
    set
      score = p_score,
      teacher_comment = v_clean_comment,
      teacher_audio_url = coalesce(v_clean_audio, teacher_audio_url),
      status = 'graded',
      graded_by = v_caller_id,
      graded_at = now()
    where assignment_id = v_rec.assignment_id and student_id = v_rec.student_id;
  end if;

  -- 3.8. Tính toán và cộng thưởng XP (Chỉ cộng 1 lần duy nhất cho mỗi bài nộp)
  if coalesce(v_rec.reward_xp, 0) > 0 then
    v_max_xp := v_rec.reward_xp;
  end if;

  v_xp_awarded := round((p_score::numeric / 100.0) * v_max_xp);
  v_ref_id := coalesce(v_rec.assignment_id, v_target_id);

  -- Kiểm tra xem học sinh đã từng nhận thưởng XP cho lượt chấm này chưa
  select exists (
    select 1 from public.xp_transactions
    where student_id = v_rec.student_id
      and reference_id = v_ref_id
      and source_type in ('recording_grade', 'assignment_graded')
  ) into v_already_rewarded;

  -- Nếu chưa nhận và điểm > 0 thì ghi nhận giao dịch XP
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
      'recording_grade',
      v_ref_id,
      'Điểm phát âm bài: ' || coalesce(v_rec.assign_title, 'Ghi âm') || ' (' || p_score || '/100)'
    );

    update public.profiles
    set lifetime_xp = coalesce(lifetime_xp, 0) + v_xp_awarded
    where id = v_rec.student_id;
  end if;

  return json_build_object(
    'success', true,
    'score', p_score,
    'comment', v_clean_comment,
    'teacher_audio_url', v_clean_audio,
    'xp_awarded', case when v_already_rewarded then 0 else v_xp_awarded end,
    'already_rewarded', v_already_rewarded,
    'message', case when v_already_rewarded
      then 'Đã cập nhật điểm và nhận xét thành công (XP bài này đã được tính trước đó)!'
      else 'Đã lưu kết quả chấm bài và cộng XP thành công!'
    end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. CẤP QUYỀN THỰC THI CHO AUTHENTICATED
-- -----------------------------------------------------------------------------
grant execute on function public.grade_recording_submission(uuid, integer, text, uuid, text, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. LÀM MỚI SCHEMA CACHE CỦA POSTGREST
-- -----------------------------------------------------------------------------
notify pgrst, 'reload schema';
