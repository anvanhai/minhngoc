/**
 * MODULE QUẢN LÝ XP, STREAK & PHÁT ÂM TIẾNG TRUNG
 */

window.XP = (function () {
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

  return {
    speakChinese,
    formatXp,
    formatStreak
  };
})();
