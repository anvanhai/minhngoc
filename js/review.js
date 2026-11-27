/**
 * TRANG ÔN TẬP THEO ĐƯỜNG CONG QUÊN LÃNG (review.html)
 */
document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth();
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);

  const reviewLoading = document.getElementById('review-loading');
  const reviewError = document.getElementById('review-error');
  const reviewErrorMsg = document.getElementById('review-error-msg');
  const btnRetryLoadReview = document.getElementById('btn-retry-load-review');
  const reviewEmpty = document.getElementById('review-empty');
  const reviewEmptyUpcoming = document.getElementById('review-empty-upcoming');
  const playingArea = document.getElementById('fc-playing-area');
  const summaryArea = document.getElementById('fc-summary-area');
  const counterEl = document.getElementById('session-counter');
  const remainingNoteEl = document.getElementById('session-remaining-note');
  const sessionAlert = document.getElementById('session-alert');

  let activeSession = null;

  async function renderEmptyUpcoming() {
    if (!reviewEmptyUpcoming) return;
    reviewEmptyUpcoming.innerHTML = '<div style="font-size: 13px; color: var(--text-muted);">⏳ Đang kiểm tra lịch ôn sắp tới...</div>';
    try {
      const up = await window.Student.getSrsUpcomingSummary();
      const tmr = Number(up && up.tomorrow_count ? up.tomorrow_count : 0);
      const in3 = Number(up && up.in_3_days_count ? up.in_3_days_count : 0);
      reviewEmptyUpcoming.innerHTML = `
        <div style="font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">📅 Lịch ôn sắp tới</div>
        <div style="font-size: 14px; color: var(--text-main);">Ngày mai: <strong>${tmr} từ</strong> · 3 ngày nữa: <strong>${in3} từ</strong></div>
      `;
    } catch (e) {
      reviewEmptyUpcoming.innerHTML = '<div style="font-size: 13px; color: var(--text-muted);">Chưa tải được lịch sắp tới.</div>';
    }
  }

  async function loadDueSession() {
    if (activeSession) {
      activeSession.destroy();
      activeSession = null;
    }

    if (sessionAlert) {
      sessionAlert.className = 'alert';
      sessionAlert.textContent = '';
    }
    reviewLoading.style.display = 'block';
    reviewError.style.display = 'none';
    reviewEmpty.style.display = 'none';
    playingArea.style.display = 'none';
    summaryArea.style.display = 'none';

    try {
      const data = await window.Student.getSrsDueCards(50);
      const cards = Array.isArray(data && data.cards) ? data.cards : [];
      const totalDue = Number(data && data.total_due ? data.total_due : 0);

      window.Student.updateNavbarDueBadge(totalDue);
      reviewLoading.style.display = 'none';

      if (cards.length === 0) {
        if (window.StudyTimer) await window.StudyTimer.stop({ flush: false });
        if (counterEl) counterEl.textContent = '0/0';
        if (remainingNoteEl) remainingNoteEl.style.display = 'none';
        reviewEmpty.style.display = 'block';
        await renderEmptyUpcoming();
        return;
      }

      if (window.StudyTimer) window.StudyTimer.start('srs_review');

      activeSession = window.FlashcardSession.mount({
        mode: 'srs_review',
        cards,
        totalDueOnServer: totalDue,
        backUrl: 'dashboard.html',
        backLabel: '🏠 Về trang chủ',
        submitCardFn: async (card, rating) => {
          return await window.Student.submitSrsReview(
            card.item_type,
            card.item_id,
            rating,
            Boolean(card._retriedOnce)
          );
        },
        getUpcomingFn: async () => {
          return await window.Student.getSrsUpcomingSummary();
        },
        onProgressChange: (res) => {
          if (res && typeof res.remaining_due_count === 'number') {
            window.Student.updateNavbarDueBadge(res.remaining_due_count);
          }
        },
        onContinueNextBatch: () => {
          loadDueSession();
        },
        onFinish: () => {
          if (window.StudyTimer) void window.StudyTimer.stop({ flush: true });
        }
      });
    } catch (err) {
      if (window.StudyTimer) void window.StudyTimer.stop({ flush: false });
      console.error('Lỗi tải phiên ôn tập SRS:', err);
      reviewLoading.style.display = 'none';
      reviewError.style.display = 'block';
      if (reviewErrorMsg) {
        reviewErrorMsg.textContent = (window.XP && typeof window.XP.formatDbError === 'function')
          ? window.XP.formatDbError(err, 'Không thể tải danh sách từ cần ôn tập.')
          : (err && err.message ? err.message : 'Lỗi kết nối máy chủ.');
      }
      window.Student.initReviewNavAndReminder({ showToast: false });
    }
  }

  if (btnRetryLoadReview) {
    btnRetryLoadReview.addEventListener('click', loadDueSession);
  }

  await loadDueSession();
});
