/**
 * MODULE QUẢN LÝ XP, STREAK & PHÁT ÂM TIẾNG TRUNG
 *
 * Quy tắc XP chuẩn hóa (thực thi và xác thực hoàn toàn phía database RPC):
 *  - Học thuộc từ mới lần đầu (Flashcard SRS đạt Tạm nhớ / Đã thuộc): +2 XP / từ (chỉ 1 lần/từ)
 *  - Ôn lại từ đã thuộc trước đó: 0 XP (chống cộng lặp)
 *  - Hoàn thành toàn bộ phần từ vựng của bài học lần đầu: +10 XP / bài (chỉ 1 lần/bài)
 *  - Hoàn thành bài học (vượt qua Quiz cuối bài lần đầu): +reward_xp của bài (mặc định +50 XP)
 *  - Hoàn thành bài tập (Từ vựng / Nghe hiểu / Nói & Ghi âm): cộng theo reward_xp của bài tập
 */

window.XP = (function () {
  const XP_RULES = {
    VOCAB_WORD_LEARNED: 2,
    VOCAB_WORD_REVIEW: 0,
    LESSON_VOCAB_COMPLETED: 10,
    DEFAULT_LESSON_QUIZ: 50
  };

  /**
   * Phát âm tiếng Trung chuẩn Bắc Kinh (zh-CN) bằng Web Speech API
   * Hoạt động 100% trên trình duyệt điện thoại và máy tính không cần backend
   * @param {string} text - Chữ Hán hoặc từ cần phát âm
   * @param {number} rate - Tốc độ đọc (0.8 = chậm, 1.0 = bình thường)
   */
  function speakChinese(text, rate = 0.9) {
    if (!('speechSynthesis' in window)) {
      alert('Trình duyệt của bạn không hỗ trợ tính năng phát âm giọng nói Web Speech.');
      return;
    }

    // Hủy các giọng đang đọc dở nếu có
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = rate;
    utterance.pitch = 1.0;

    // Ưu tiên chọn giọng zh-CN chuẩn nếu danh sách voices có sẵn
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang === 'zh-CN' || v.lang.startsWith('zh'));
    if (zhVoice) {
      utterance.voice = zhVoice;
    }

    window.speechSynthesis.speak(utterance);
  }

  /**
   * Định dạng số điểm XP (ví dụ: 1250 -> 1,250 XP)
   */
  function formatXp(xp) {
    return (xp || 0).toLocaleString('vi-VN') + ' XP';
  }

  /**
   * Định dạng chuỗi ngày học Streak
   */
  function formatStreak(days) {
    return (days || 0) + ' ngày';
  }

  /**
   * Chuyển lỗi database / mạng thành thông báo tiếng Việt dễ hiểu
   */
  function formatDbError(err, fallbackMsg = 'Không thể lưu tiến độ và điểm XP.') {
    const raw = (err && (err.message || err.details || err.hint || String(err))) || '';
    const lower = raw.toLowerCase();
    const code = err && err.code ? String(err.code) : '';

    if (lower.includes('xp_transactions_source_type_check') || code === '23514') {
      return 'Cơ sở dữ liệu chưa cập nhật danh sách loại giao dịch XP mới. Vui lòng chạy file SQL Migration 25 trong Supabase SQL Editor rồi thử lại.';
    }
    if (lower.includes('could not find the function') || code === 'PGRST202') {
      return 'Hàm lưu XP/tiến độ trên máy chủ chưa được cập nhật. Vui lòng chạy Migration 25 trên Supabase.';
    }
    if (lower.includes('failed to fetch') || lower.includes('network')) {
      return 'Mất kết nối mạng tới máy chủ Supabase. Vui lòng kiểm tra kết nối rồi bấm Thử lại.';
    }
    if (lower.includes('chưa đăng nhập')) {
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.';
    }
    if (raw && !/^[a-z0-9_.\s"':()-]+$/i.test(raw)) {
      return raw;
    }
    return raw ? `${fallbackMsg} (${raw})` : fallbackMsg;
  }

  /**
   * Hiển thị huy hiệu nổi "+X XP" ở góc màn hình khi học viên nhận thưởng
   */
  function showXpToast(xpAmount, label = '') {
    const amount = parseInt(xpAmount, 10) || 0;
    if (amount <= 0) return;

    const existing = document.getElementById('xp-floating-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'xp-floating-toast';
    toast.style.cssText = `
      position: fixed;
      top: 76px;
      right: 18px;
      z-index: 99998;
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #ffffff;
      padding: 10px 16px;
      border-radius: 999px;
      box-shadow: 0 10px 25px rgba(217, 119, 6, 0.35);
      font-weight: 800;
      font-size: 14px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      opacity: 0;
      transform: translateY(-10px) scale(0.95);
      transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      pointer-events: none;
    `;
    const iconSpan = document.createElement('span');
    iconSpan.textContent = `⚡ +${amount.toLocaleString()} XP`;
    toast.appendChild(iconSpan);

    if (label) {
      const labelSpan = document.createElement('span');
      labelSpan.style.cssText = 'font-weight: 600; opacity: 0.95; font-size: 13px;';
      labelSpan.textContent = `· ${label}`;
      toast.appendChild(labelSpan);
    }
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0) scale(1)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px) scale(0.95)';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, 2600);
  }

  return {
    XP_RULES,
    speakChinese,
    formatXp,
    formatStreak,
    formatDbError,
    showXpToast
  };
})();
