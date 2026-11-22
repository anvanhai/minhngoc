/**
 * MINH NGỌC HSK - HỆ THỐNG POPUP THÔNG BÁO KẾT QUẢ CHO HỌC SINH (FEEDBACK POPUP)
 * Hiển thị popup ảnh + thông điệp theo cấu hình từ Admin (hoặc mặc định nếu chưa cấu hình).
 * Dùng tốt trên cả máy tính & điện thoại di động (Responsive, Dark mode ready).
 */

(function () {
  const DEFAULT_FALLBACKS = {
    quiz_high: {
      title: 'Xuất sắc! 太棒了!',
      message: 'Chúc mừng bạn đã vượt qua bài kiểm tra với số điểm cực kỳ ấn tượng!',
      image_url: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=600&auto=format&fit=crop&q=80',
      btn_text: 'Nhận thưởng và tiếp tục'
    },
    quiz_med: {
      title: 'Khá lắm!',
      message: 'Bạn đã nắm được phần lớn kiến thức. Thêm một chút chú ý nữa là đạt điểm tuyệt đối đấy!',
      image_url: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&auto=format&fit=crop&q=80',
      btn_text: 'Tiếp tục phát huy'
    },
    quiz_low: {
      title: 'Cố lên bạn nhé!',
      message: 'Đừng nản lòng, hãy xem lại từ vựng một chút rồi thử lại nhé! Thành công đang chờ bạn.',
      image_url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80',
      btn_text: 'Ôn tập và thử lại'
    },
    vocabulary: {
      title: 'Nạp thêm từ mới thành công!',
      message: 'Bạn vừa hoàn thành toàn bộ từ vựng mới của bài. Hãy chuyển sang Flashcard để củng cố trí nhớ nhé!',
      image_url: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&auto=format&fit=crop&q=80',
      btn_text: 'Luyện tập Flashcard'
    },
    practice: {
      title: 'Hoàn thành bài ôn tập!',
      message: 'Trí nhớ của bạn đang ngày càng sâu sắc qua phương pháp lặp lại ngắt quãng SRS!',
      image_url: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&auto=format&fit=crop&q=80',
      btn_text: 'Tiếp tục'
    },
    listening: {
      title: 'Hoàn thành bài luyện nghe!',
      message: 'Kỹ năng nghe hiểu tiếng Trung của bạn đang tiến bộ từng ngày qua các bài đối thoại thực tế!',
      image_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
      btn_text: 'Tiếp tục'
    },
    speaking: {
      title: 'Đã nộp bài ghi âm thành công!',
      message: 'Bản thu âm của bạn đã được gửi tới giáo viên để chấm điểm và nhận xét. Cùng chờ kết quả nhé!',
      image_url: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=600&auto=format&fit=crop&q=80',
      btn_text: 'Đóng'
    },
    lesson: {
      title: 'Chúc mừng bạn đã hoàn thành bài học!',
      message: 'Bạn đã vượt qua các thử thách của bài học. Hãy vững bước sang bài học tiếp theo nhé!',
      image_url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop&q=80',
      btn_text: 'Đến bài tiếp theo'
    },
    assignment: {
      title: 'Đã hoàn thành bài tập!',
      message: 'Bạn đã nộp bài tập về nhà đúng hạn. Chúc bạn luôn giữ vững tinh thần chăm chỉ!',
      image_url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80',
      btn_text: 'Xem bài khác'
    }
  };

  /**
   * Tra cứu cấu hình từ database hoặc fallback
   */
  async function fetchFeedbackConfig(eventType, score) {
    const db = window.getDb ? window.getDb() : null;
    if (db) {
      try {
        const { data, error } = await db.rpc('get_matching_feedback', {
          p_event_type: eventType,
          p_score: (score !== null && score !== undefined) ? parseInt(score, 10) : null
        });

        if (!error && data && data.image_url) {
          return data;
        }
      } catch (err) {
        console.warn('Lỗi gọi get_matching_feedback RPC, sử dụng cấu hình dự phòng:', err);
      }
    }

    // Fallback mặc định khi chưa có dữ liệu DB
    if (eventType === 'quiz' || eventType === 'practice' || eventType === 'listening') {
      const s = (score !== null && score !== undefined) ? parseInt(score, 10) : 100;
      if (s >= 80) return DEFAULT_FALLBACKS.quiz_high;
      if (s >= 50) return DEFAULT_FALLBACKS.quiz_med;
      return DEFAULT_FALLBACKS.quiz_low;
    }

    return DEFAULT_FALLBACKS[eventType] || DEFAULT_FALLBACKS.quiz_high;
  }

  /**
   * Hiển thị popup kết quả cho học sinh
   * @param {string} eventType - 'quiz' | 'practice' | 'listening' | 'vocabulary' | 'speaking' | 'lesson' | 'assignment'
   * @param {Object} options - { score, onContinue, onRetry, customTitle, customMessage }
   */
  async function show(eventType, options = {}) {
    const {
      score = null,
      onContinue = null,
      onRetry = null,
      customTitle = null,
      customMessage = null
    } = options;

    const config = await fetchFeedbackConfig(eventType, score);

    const title = customTitle || config.title || 'Thông báo kết quả';
    const message = customMessage || config.message || 'Chúc mừng bạn đã hoàn thành hoạt động!';
    const imageUrl = config.image_url;
    const btnText = config.btn_text || 'Tiếp tục';

    // Tạo overlay container
    const existing = document.getElementById('feedback-popup-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'feedback-popup-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      opacity: 0;
      transition: opacity 0.25s ease;
      box-sizing: border-box;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      position: relative;
      width: 100%;
      max-width: 440px;
      background: var(--bg-card, #ffffff);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
      transform: scale(0.9) translateY(20px);
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      box-sizing: border-box;
      border: 1px solid var(--border-color, #e2e8f0);
    `;

    let scorePillHtml = '';
    if (score !== null && score !== undefined) {
      const isPass = parseInt(score, 10) >= 80;
      const badgeBg = isPass ? 'rgba(74, 222, 128, 0.2)' : 'rgba(251, 191, 36, 0.2)';
      const badgeColor = isPass ? '#16a34a' : '#d97706';
      scorePillHtml = `
        <div style="margin-bottom: 12px;">
          <span style="display: inline-block; padding: 4px 14px; border-radius: 999px; background: ${badgeBg}; color: ${badgeColor}; font-weight: 800; font-size: 14px;">
            🎯 Đạt ${score}% điểm
          </span>
        </div>
      `;
    }

    let retryBtnHtml = '';
    if (typeof onRetry === 'function') {
      retryBtnHtml = `
        <button type="button" id="fb-popup-btn-retry" class="btn btn-secondary" style="flex: 1; border-radius: 12px; height: 44px; font-weight: 600; font-size: 14px;">
          🔄 Làm lại
        </button>
      `;
    }

    card.innerHTML = `
      <!-- Khung ảnh lớn phía trên -->
      <div style="position: relative; width: 100%; height: 210px; background: var(--bg-subtle, #f1f5f9); overflow: hidden;">
        <img src="${imageUrl}" alt="Feedback" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=600'">
        <button type="button" id="fb-popup-btn-close" aria-label="Đóng" style="position: absolute; top: 12px; right: 12px; width: 34px; height: 34px; border-radius: 50%; background: rgba(0,0,0,0.5); color: #ffffff; border: none; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); transition: background 0.2s;">
          ✕
        </button>
      </div>

      <!-- Nội dung chữ & Nút thao tác -->
      <div style="padding: 24px; text-align: center;">
        ${scorePillHtml}

        <h3 style="font-size: 20px; font-weight: 800; color: var(--text-main, #0f172a); margin: 0 0 10px 0; line-height: 1.3;">
          ${title}
        </h3>

        <p style="font-size: 14px; line-height: 1.6; color: var(--text-muted, #64748b); margin: 0 0 24px 0;">
          ${message}
        </p>

        <div style="display: flex; gap: 10px; justify-content: center;">
          ${retryBtnHtml}
          <button type="button" id="fb-popup-btn-continue" class="btn btn-primary" style="flex: 1.4; border-radius: 12px; height: 44px; font-weight: 700; font-size: 15px;">
            ${btnText}
          </button>
        </div>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Kích hoạt animation hiện ra
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      card.style.transform = 'scale(1) translateY(0)';
    });

    function closePopup() {
      overlay.style.opacity = '0';
      card.style.transform = 'scale(0.9) translateY(20px)';
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 250);
    }

    const btnClose = card.querySelector('#fb-popup-btn-close');
    const btnContinue = card.querySelector('#fb-popup-btn-continue');
    const btnRetry = card.querySelector('#fb-popup-btn-retry');

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        closePopup();
        if (typeof onContinue === 'function') onContinue();
      });
    }

    if (btnContinue) {
      btnContinue.addEventListener('click', () => {
        closePopup();
        if (typeof onContinue === 'function') onContinue();
      });
    }

    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        closePopup();
        if (typeof onRetry === 'function') onRetry();
      });
    }
  }

  window.FeedbackPopup = {
    show
  };
})();
