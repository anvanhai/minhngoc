/**
 * MODULE ĐIỀU KHIỂN PHIÊN FLASHCARD DÙNG CHUNG (Ôn tập SRS & Tự học)
 * Tái sử dụng cấu trúc thẻ 3D (.flashcard-wrapper) và 3 nút đánh giá SRS (.srs-actions-grid)
 */
window.FlashcardSession = (function () {
  function safeText(val, fallback = '') {
    if (val === null || val === undefined) return fallback;
    const str = String(val).trim();
    if (!str || str === 'null' || str === 'undefined') return fallback;
    return str;
  }

  function escapeHtml(str) {
    return safeText(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Khởi tạo và chạy một phiên Flashcard trong DOM hiện có
   * @param {Object} opts
   */
  function mount(opts) {
    const {
      mode = 'srs_review', // 'srs_review' | 'self_study'
      deckTitle = '',
      cards = [],
      totalDueOnServer = 0,
      submitCardFn,
      getUpcomingFn,
      onProgressChange,
      onContinueNextBatch,
      onReplayDeck,
      backUrl = 'dashboard.html',
      backLabel = '← Quay lại trang chủ',
      els = {}
    } = opts || {};

    const sessionAlert = els.sessionAlert || document.getElementById('session-alert');
    const counterEl = els.counterEl || document.getElementById('session-counter');
    const remainingNoteEl = els.remainingNoteEl || document.getElementById('session-remaining-note');
    const playingArea = els.playingArea || document.getElementById('fc-playing-area');
    const summaryArea = els.summaryArea || document.getElementById('fc-summary-area');

    const flashcardCard = els.flashcardCard || document.getElementById('flashcard-card');
    const fcSourceBadge = els.fcSourceBadge || document.getElementById('fc-source-badge');
    const fcStageBadge = els.fcStageBadge || document.getElementById('fc-stage-badge');
    const fcFrontHanzi = els.fcFrontHanzi || document.getElementById('fc-front-hanzi');
    const btnFcSpeak = els.btnFcSpeak || document.getElementById('btn-fc-speak');
    const fcBackPinyin = els.fcBackPinyin || document.getElementById('fc-back-pinyin');
    const fcBackMeaning = els.fcBackMeaning || document.getElementById('fc-back-meaning');
    const fcBackPos = els.fcBackPos || document.getElementById('fc-back-pos');
    const fcBackExample = els.fcBackExample || document.getElementById('fc-back-example');
    const fcBackNote = els.fcBackNote || document.getElementById('fc-back-note');
    const fcFlipPrompt = els.fcFlipPrompt || document.getElementById('fc-flip-prompt');
    const btnFlipCard = els.btnFlipCard || document.getElementById('btn-flip-card');
    const fcSrsActions = els.fcSrsActions || document.getElementById('fc-srs-actions');

    const queue = Array.isArray(cards) ? cards.map(c => ({ ...c, _retriedOnce: false })) : [];
    let currentIdx = 0;
    let isFlipped = false;
    let isSubmitting = false;
    let destroyed = false;

    // Theo dõi kết quả theo từng thẻ duy nhất trong phiên (dùng đánh giá đầu tiên để tổng kết trung thực)
    const firstOutcomeByKey = new Map();
    let retriedCardsCount = 0;
    let latestRemainingOnServer = Number(totalDueOnServer || queue.length);

    function cardKey(card) {
      const t = safeText(card.item_type, mode === 'self_study' ? 'self_study' : 'vocab');
      const id = safeText(card.item_id || card.id);
      return `${t}_${id}`;
    }

    function showAlert(msg, type = 'danger', retryFn = null) {
      if (!sessionAlert) return;
      sessionAlert.className = `alert alert-${type} show`;
      sessionAlert.innerHTML = '';

      const span = document.createElement('span');
      span.textContent = safeText(msg, 'Đã xảy ra lỗi.');
      sessionAlert.appendChild(span);

      if (typeof retryFn === 'function') {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'btn btn-secondary btn-sm';
        retryBtn.style.cssText = 'margin-left: 10px; height: 30px; padding: 0 12px; font-size: 12px;';
        retryBtn.textContent = '🔄 Thử lại';
        retryBtn.addEventListener('click', () => {
          hideAlert();
          retryFn();
        });
        sessionAlert.appendChild(retryBtn);
      }
    }

    function hideAlert() {
      if (!sessionAlert) return;
      sessionAlert.className = 'alert';
      sessionAlert.textContent = '';
    }

    function setActionButtonsDisabled(disabled, pendingRating = null) {
      if (!fcSrsActions) return;
      fcSrsActions.querySelectorAll('.btn-srs').forEach(btn => {
        btn.disabled = disabled;
        const r = parseInt(btn.getAttribute('data-srs'), 10);
        if (disabled && pendingRating === r) {
          btn.style.opacity = '0.7';
        } else {
          btn.style.opacity = disabled ? '0.5' : '1';
        }
      });
    }

    function renderCard() {
      if (destroyed) return;
      if (currentIdx >= queue.length) {
        renderSummary();
        return;
      }

      const card = queue[currentIdx];
      isFlipped = false;
      if (flashcardCard) flashcardCard.classList.remove('flipped');
      if (fcFlipPrompt) fcFlipPrompt.style.display = 'block';
      if (fcSrsActions) fcSrsActions.style.display = 'none';
      setActionButtonsDisabled(false);

      if (counterEl) {
        counterEl.textContent = `${currentIdx + 1}/${queue.length}`;
      }

      if (remainingNoteEl) {
        const extraPending = Math.max(0, latestRemainingOnServer - (queue.length - currentIdx));
        if (mode === 'srs_review' && extraPending > 0) {
          remainingNoteEl.style.display = 'inline-block';
          remainingNoteEl.textContent = `Còn ${latestRemainingOnServer} từ cần ôn hôm nay`;
        } else if (card._retriedOnce) {
          remainingNoteEl.style.display = 'inline-block';
          remainingNoteEl.textContent = 'Lượt thử lại cuối phiên';
        } else {
          remainingNoteEl.style.display = 'none';
        }
      }

      // Nguồn của thẻ (Bài học hoặc "Tự học · Tên bộ thẻ")
      if (fcSourceBadge) {
        const isSelf = Boolean(card.is_self_study) || mode === 'self_study';
        if (isSelf) {
          const dTitle = safeText(card.deck_title || deckTitle, 'Bộ thẻ lớp');
          fcSourceBadge.className = 'srs-source-badge srs-self-study-badge';
          fcSourceBadge.textContent = `🃏 Tự học · ${dTitle}`;
        } else {
          const srcLabel = safeText(card.source_label, 'Từ vựng bài học');
          fcSourceBadge.className = 'srs-source-badge';
          fcSourceBadge.textContent = `📖 ${srcLabel}`;
        }
      }

      if (fcStageBadge) {
        const stageNum = typeof card.srs_stage === 'number' ? card.srs_stage : null;
        const overdueDays = Number(card.overdue_days || 0);
        const parts = [];
        if (card._retriedOnce) parts.push('🔁 Thử lại');
        if (overdueDays > 0) parts.push(`⏰ Trễ ${overdueDays} ngày`);
        if (stageNum !== null && mode === 'srs_review') {
          parts.push(stageNum >= 6 ? '⭐ Đã thuộc' : `Bậc ${stageNum + 1}`);
        }
        fcStageBadge.textContent = parts.join(' · ');
        fcStageBadge.style.display = parts.length > 0 ? 'inline-flex' : 'none';
      }

      const hanzi = safeText(card.hanzi);
      const pinyin = safeText(card.pinyin);
      const meaningVi = safeText(card.meaning_vi);
      const pos = safeText(card.part_of_speech);
      const exHanzi = safeText(card.example_hanzi);
      const exPinyin = safeText(card.example_pinyin);
      const exVi = safeText(card.example_vi);
      const noteText = safeText(card.note);

      if (fcFrontHanzi) fcFrontHanzi.textContent = hanzi;
      if (fcBackPinyin) fcBackPinyin.textContent = pinyin;
      if (fcBackMeaning) fcBackMeaning.textContent = meaningVi;

      if (fcBackPos) {
        if (pos) {
          fcBackPos.textContent = pos;
          fcBackPos.style.display = 'inline-block';
        } else {
          fcBackPos.textContent = '';
          fcBackPos.style.display = 'none';
        }
      }

      if (fcBackExample) {
        if (exHanzi || exVi || exPinyin) {
          fcBackExample.style.display = 'block';
          fcBackExample.innerHTML = [
            exHanzi ? `<div><strong>${escapeHtml(exHanzi)}</strong></div>` : '',
            exPinyin ? `<div style="color: var(--text-muted); font-size: 12px; margin-top: 2px;">${escapeHtml(exPinyin)}</div>` : '',
            exVi ? `<div style="color: var(--text-muted); margin-top: 2px;">${escapeHtml(exVi)}</div>` : ''
          ].join('');
        } else {
          fcBackExample.innerHTML = '';
          fcBackExample.style.display = 'none';
        }
      }

      if (fcBackNote) {
        if (noteText) {
          fcBackNote.style.display = 'block';
          fcBackNote.textContent = `📝 Ghi chú: ${noteText}`;
        } else {
          fcBackNote.textContent = '';
          fcBackNote.style.display = 'none';
        }
      }

      if (hanzi && window.XP && typeof window.XP.speakChinese === 'function') {
        window.XP.speakChinese(hanzi);
      }
    }

    function flipCard() {
      if (isSubmitting || currentIdx >= queue.length) return;
      isFlipped = !isFlipped;
      if (isFlipped) {
        if (flashcardCard) flashcardCard.classList.add('flipped');
        if (fcFlipPrompt) fcFlipPrompt.style.display = 'none';
        if (fcSrsActions) fcSrsActions.style.display = 'grid';
        const card = queue[currentIdx];
        if (card && card.hanzi && window.XP && typeof window.XP.speakChinese === 'function') {
          window.XP.speakChinese(card.hanzi);
        }
      } else {
        if (flashcardCard) flashcardCard.classList.remove('flipped');
        if (fcFlipPrompt) fcFlipPrompt.style.display = 'block';
        if (fcSrsActions) fcSrsActions.style.display = 'none';
      }
    }

    async function submitRating(rating) {
      if (isSubmitting || currentIdx >= queue.length) return;
      const card = queue[currentIdx];
      isSubmitting = true;
      hideAlert();
      setActionButtonsDisabled(true, rating);

      try {
        const res = await submitCardFn(card, rating);

        // Ghi nhận kết quả ban đầu của từng thẻ duy nhất trong phiên
        const key = cardKey(card);
        if (!firstOutcomeByKey.has(key)) {
          firstOutcomeByKey.set(key, rating);
        }

        // Chưa nhớ -> đẩy thẻ xuống cuối phiên để thử lại một lần
        if (rating === 1 && !card._retriedOnce) {
          queue.push({ ...card, _retriedOnce: true });
          retriedCardsCount++;
        }

        if (res && typeof res.remaining_due_count === 'number') {
          latestRemainingOnServer = res.remaining_due_count;
        } else if (mode === 'srs_review' && rating !== 1) {
          latestRemainingOnServer = Math.max(0, latestRemainingOnServer - 1);
        }

        if (typeof onProgressChange === 'function') {
          onProgressChange(res, latestRemainingOnServer);
        }

        currentIdx++;
        isSubmitting = false;
        renderCard();
      } catch (err) {
        console.error('Lỗi gửi đánh giá thẻ flashcard:', err);
        isSubmitting = false;
        setActionButtonsDisabled(false);

        const friendlyMsg = (window.XP && typeof window.XP.formatDbError === 'function')
          ? window.XP.formatDbError(err, 'Không thể lưu kết quả thẻ này do lỗi mạng hoặc máy chủ. Thẻ vẫn được giữ nguyên.')
          : (safeText(err && err.message, 'Không thể lưu kết quả thẻ này. Thẻ vẫn được giữ nguyên.'));

        showAlert(friendlyMsg, 'danger', () => submitRating(rating));
      }
    }

    async function renderSummary() {
      if (playingArea) playingArea.style.display = 'none';
      if (summaryArea) summaryArea.style.display = 'block';
      if (counterEl) counterEl.textContent = 'Hoàn thành';
      if (remainingNoteEl) remainingNoteEl.style.display = 'none';
      hideAlert();

      let easyCount = 0;
      let mediumCount = 0;
      let hardCount = 0;
      firstOutcomeByKey.forEach(r => {
        if (r === 3) easyCount++;
        else if (r === 2) mediumCount++;
        else hardCount++;
      });

      const totalUnique = firstOutcomeByKey.size;

      if (!summaryArea) return;
      summaryArea.innerHTML = `
        <div class="card" style="text-align: center; padding: 30px 20px;">
          <div style="font-size: 50px; margin-bottom: 10px;">🎉</div>
          <h2 style="font-size: 22px; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">
            ${mode === 'self_study' ? `Đã học xong bộ "${escapeHtml(safeText(deckTitle, 'Tự học'))}"!` : 'Đã hoàn thành phiên ôn tập!'}
          </h2>
          <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 18px;">
            ${mode === 'self_study'
              ? `Toàn bộ <strong>${totalUnique}</strong> thẻ đã được đưa vào lịch ôn tập SRS (hẹn ôn lần đầu sau 1 ngày).`
              : `Bạn đã ôn xong <strong>${totalUnique}</strong> từ trong phiên này${retriedCardsCount > 0 ? ` (đã thử lại ${retriedCardsCount} thẻ chưa nhớ ở cuối phiên)` : ''}.`}
          </p>

          <div class="srs-summary-grid">
            <div class="srs-summary-stat srs-stat-easy">
              <div class="srs-summary-num">${easyCount}</div>
              <div class="srs-summary-label">🟢 Nhớ rõ</div>
            </div>
            <div class="srs-summary-stat srs-stat-medium">
              <div class="srs-summary-num">${mediumCount}</div>
              <div class="srs-summary-label">🟡 Nhớ mang máng</div>
            </div>
            <div class="srs-summary-stat srs-stat-hard">
              <div class="srs-summary-num">${hardCount}</div>
              <div class="srs-summary-label">🔴 Chưa nhớ</div>
            </div>
          </div>

          <div id="srs-upcoming-box" class="srs-upcoming-box">
            <div style="color: var(--text-muted); font-size: 13px;">⏳ Đang tải lịch ôn sắp tới...</div>
          </div>

          <div id="srs-remaining-cta" style="margin-top: 14px;"></div>

          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 20px;" id="srs-summary-actions">
            <a href="${escapeHtml(backUrl)}" class="btn btn-secondary">${escapeHtml(backLabel)}</a>
          </div>
        </div>
      `;

      const upcomingBox = document.getElementById('srs-upcoming-box');
      const remainingCta = document.getElementById('srs-remaining-cta');
      const actionsRow = document.getElementById('srs-summary-actions');

      if (mode === 'srs_review' && latestRemainingOnServer > 0 && remainingCta) {
        remainingCta.innerHTML = `
          <div style="background: var(--warning-bg); border: 1px solid var(--warning-border); color: var(--warning); padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13.5px; font-weight: 600;">
            📌 Vẫn còn <strong>${latestRemainingOnServer} từ</strong> cần ôn hôm nay.
          </div>
        `;
        if (typeof onContinueNextBatch === 'function' && actionsRow) {
          const nextBatchBtn = document.createElement('button');
          nextBatchBtn.type = 'button';
          nextBatchBtn.className = 'btn btn-primary';
          nextBatchBtn.textContent = `▶️ Ôn tiếp (${Math.min(50, latestRemainingOnServer)} từ nữa)`;
          nextBatchBtn.addEventListener('click', () => onContinueNextBatch());
          actionsRow.prepend(nextBatchBtn);
        }
      } else if (mode === 'self_study' && actionsRow) {
        const goReviewBtn = document.createElement('a');
        goReviewBtn.href = 'review.html';
        goReviewBtn.className = 'btn btn-primary';
        goReviewBtn.textContent = '🧠 Xem mục Ôn tập';
        actionsRow.prepend(goReviewBtn);

        if (typeof onReplayDeck === 'function') {
          const replayBtn = document.createElement('button');
          replayBtn.type = 'button';
          replayBtn.className = 'btn btn-outline';
          replayBtn.textContent = '🔄 Học lại bộ thẻ';
          replayBtn.addEventListener('click', () => onReplayDeck());
          actionsRow.appendChild(replayBtn);
        }
      }

      if (typeof getUpcomingFn === 'function' && upcomingBox) {
        try {
          const up = await getUpcomingFn();
          const tmr = Number(up && up.tomorrow_count ? up.tomorrow_count : 0);
          const in3 = Number(up && up.in_3_days_count ? up.in_3_days_count : 0);
          const buckets = Array.isArray(up && up.buckets) ? up.buckets : [];

          const otherPills = buckets
            .filter(b => b.offset_days !== 1 && b.offset_days !== 3 && Number(b.count) > 0)
            .slice(0, 5)
            .map(b => `<span class="srs-upcoming-pill">${b.offset_days} ngày nữa: <strong>${b.count}</strong> từ</span>`)
            .join('');

          upcomingBox.innerHTML = `
            <div style="font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">📅 Lịch ôn sắp tới</div>
            <div style="font-size: 14px; color: var(--text-main);">
              Ngày mai: <strong>${tmr} từ</strong> · 3 ngày nữa: <strong>${in3} từ</strong>
            </div>
            ${otherPills ? `<div class="srs-upcoming-pills">${otherPills}</div>` : ''}
          `;
        } catch (err) {
          upcomingBox.innerHTML = `
            <div style="font-size: 13px; color: var(--danger);">
              Không tải được lịch ôn sắp tới.
              <button type="button" class="btn btn-outline btn-sm" id="btn-retry-upcoming" style="margin-left: 8px; height: 28px;">🔄 Thử lại</button>
            </div>
          `;
          const btnRetryUp = document.getElementById('btn-retry-upcoming');
          if (btnRetryUp) btnRetryUp.addEventListener('click', () => renderSummary());
        }
      } else if (upcomingBox) {
        upcomingBox.style.display = 'none';
      }
    }

    // Gắn sự kiện 1 lần (dọn cũ nếu remount bằng clone/replace hoặc flag)
    function bindOnce(el, evt, handler) {
      if (!el) return;
      el.addEventListener(evt, handler);
    }

    const onCardClick = () => flipCard();
    const onFlipClick = (e) => { e.stopPropagation(); flipCard(); };
    const onSpeakClick = (e) => {
      e.stopPropagation();
      const card = queue[currentIdx];
      if (card && card.hanzi && window.XP && typeof window.XP.speakChinese === 'function') {
        window.XP.speakChinese(card.hanzi);
      }
    };
    const onSrsClick = (e) => {
      const btn = e.target.closest('.btn-srs');
      if (!btn) return;
      e.stopPropagation();
      const rating = parseInt(btn.getAttribute('data-srs'), 10);
      if ([1, 2, 3].includes(rating)) submitRating(rating);
    };

    bindOnce(flashcardCard, 'click', onCardClick);
    bindOnce(btnFlipCard, 'click', onFlipClick);
    bindOnce(btnFcSpeak, 'click', onSpeakClick);
    bindOnce(fcSrsActions, 'click', onSrsClick);

    if (playingArea) playingArea.style.display = 'block';
    if (summaryArea) summaryArea.style.display = 'none';
    renderCard();

    return {
      destroy() {
        destroyed = true;
        if (flashcardCard) flashcardCard.removeEventListener('click', onCardClick);
        if (btnFlipCard) btnFlipCard.removeEventListener('click', onFlipClick);
        if (btnFcSpeak) btnFcSpeak.removeEventListener('click', onSpeakClick);
        if (fcSrsActions) fcSrsActions.removeEventListener('click', onSrsClick);
      }
    };
  }

  return {
    mount,
    safeText,
    escapeHtml
  };
})();
