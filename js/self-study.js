/**
 * TRANG TỰ HỌC (BỘ THẺ FLASHCARD LỚP DO GIÁO VIÊN BIÊN SOẠN) - self-study.html
 */
document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth();
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);

  const decksListView = document.getElementById('decks-list-view');
  const deckStudyView = document.getElementById('deck-study-view');
  const btnRefreshDecks = document.getElementById('btn-refresh-self-study');
  const decksLoading = document.getElementById('decks-loading');
  const decksError = document.getElementById('decks-error');
  const decksErrorMsg = document.getElementById('decks-error-msg');
  const btnRetryDecks = document.getElementById('btn-retry-decks');
  const decksEmpty = document.getElementById('decks-empty');
  const decksGrid = document.getElementById('decks-grid');

  const btnBackToDecks = document.getElementById('btn-back-to-decks');
  const studyDeckTitle = document.getElementById('study-deck-title');
  const studyDeckDesc = document.getElementById('study-deck-desc');
  const studyCardsLoading = document.getElementById('study-cards-loading');
  const studyCardsError = document.getElementById('study-cards-error');
  const studyCardsErrorMsg = document.getElementById('study-cards-error-msg');
  const btnRetryStudyCards = document.getElementById('btn-retry-study-cards');
  const playingArea = document.getElementById('fc-playing-area');
  const summaryArea = document.getElementById('fc-summary-area');
  const counterEl = document.getElementById('session-counter');
  const sessionAlert = document.getElementById('session-alert');

  let activeDeckId = null;
  let activeSession = null;

  function safeStr(val, fallback = '') {
    if (val === null || val === undefined) return fallback;
    const s = String(val).trim();
    return (!s || s === 'null' || s === 'undefined') ? fallback : s;
  }

  function esc(val) {
    return window.FlashcardSession.escapeHtml(val);
  }

  async function loadDecks() {
    if (window.StudyTimer) await window.StudyTimer.stop({ flush: true });
    if (activeSession) {
      activeSession.destroy();
      activeSession = null;
    }

    decksListView.style.display = 'block';
    deckStudyView.style.display = 'none';
    decksLoading.style.display = 'block';
    decksError.style.display = 'none';
    decksEmpty.style.display = 'none';
    decksGrid.style.display = 'none';

    try {
      const res = await window.Student.getStudentSelfStudyDecks();
      const decks = Array.isArray(res && res.decks) ? res.decks : [];
      decksLoading.style.display = 'none';

      if (decks.length === 0) {
        decksEmpty.style.display = 'block';
        return;
      }

      decksGrid.style.display = 'grid';
      decksGrid.innerHTML = decks.map(d => {
        const cardCount = Number(d.card_count || 0);
        const learnedCount = Number(d.learned_count || 0);
        const dueCount = Number(d.due_count || 0);
        const desc = safeStr(d.description);
        const clsName = safeStr(d.class_name);

        return `
          <div class="self-study-deck-card">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
                <span class="srs-source-badge srs-self-study-badge">${esc(clsName || 'Lớp học')}</span>
                ${dueCount > 0 ? `<span class="srs-stage-pill">Cần ôn: ${dueCount}</span>` : ''}
              </div>
              <h3 style="font-size: 17px; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">
                ${esc(safeStr(d.title, 'Bộ thẻ Tự học'))}
              </h3>
              ${desc ? `<p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 10px;">${esc(desc)}</p>` : ''}
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; font-size: 12.5px; color: var(--text-muted); margin-bottom: 10px; padding-top: 8px; border-top: 1px solid var(--border-color);">
                <span>Tổng: <strong>${cardCount}</strong> thẻ</span>
                <span>Đã vào lịch ôn: <strong>${learnedCount}/${cardCount}</strong></span>
              </div>
              <button type="button" class="btn btn-primary btn-block btn-start-deck" data-deck-id="${esc(d.id)}" ${cardCount === 0 ? 'disabled' : ''}>
                ${cardCount === 0 ? 'Bộ thẻ chưa có thẻ nào' : '🃏 Bắt đầu học bộ thẻ'}
              </button>
            </div>
          </div>
        `;
      }).join('');

      decksGrid.querySelectorAll('.btn-start-deck').forEach(btn => {
        btn.addEventListener('click', () => {
          const deckId = btn.getAttribute('data-deck-id');
          if (deckId) openDeckStudy(deckId);
        });
      });
    } catch (err) {
      console.error('Lỗi tải danh sách bộ thẻ Tự học:', err);
      decksLoading.style.display = 'none';
      decksError.style.display = 'block';
      if (decksErrorMsg) {
        decksErrorMsg.textContent = (window.XP && typeof window.XP.formatDbError === 'function')
          ? window.XP.formatDbError(err, 'Không thể tải danh sách bộ thẻ Tự học.')
          : (err && err.message ? err.message : 'Lỗi kết nối.');
      }
    }
  }

  async function openDeckStudy(deckId) {
    activeDeckId = deckId;
    if (activeSession) {
      activeSession.destroy();
      activeSession = null;
    }

    decksListView.style.display = 'none';
    deckStudyView.style.display = 'block';
    studyCardsLoading.style.display = 'block';
    studyCardsError.style.display = 'none';
    playingArea.style.display = 'none';
    summaryArea.style.display = 'none';
    if (sessionAlert) {
      sessionAlert.className = 'alert';
      sessionAlert.textContent = '';
    }
    if (counterEl) counterEl.textContent = '0/0';

    try {
      const res = await window.Student.getStudentSelfStudyDeckCards(deckId);
      const deck = (res && res.deck) ? res.deck : {};
      const cards = Array.isArray(res && res.cards) ? res.cards : [];
      studyCardsLoading.style.display = 'none';

      studyDeckTitle.textContent = safeStr(deck.title, 'Bộ thẻ Tự học');
      const descText = safeStr(deck.description);
      studyDeckDesc.textContent = descText;
      studyDeckDesc.style.display = descText ? 'block' : 'none';

      if (cards.length === 0) {
        studyCardsError.style.display = 'block';
        studyCardsErrorMsg.textContent = 'Bộ thẻ này hiện chưa có thẻ nào.';
        return;
      }

      const mappedCards = cards.map(c => ({
        ...c,
        item_type: 'self_study',
        item_id: c.id,
        is_self_study: true,
        deck_title: safeStr(deck.title, 'Tự học')
      }));

      if (window.StudyTimer) window.StudyTimer.start('self_study');

      activeSession = window.FlashcardSession.mount({
        mode: 'self_study',
        deckTitle: safeStr(deck.title, 'Tự học'),
        cards: mappedCards,
        totalDueOnServer: 0,
        backUrl: 'self-study.html',
        backLabel: '← Danh sách bộ thẻ',
        submitCardFn: async (card, rating) => {
          return await window.Student.submitSelfStudyCard(card.id, rating);
        },
        getUpcomingFn: async () => {
          return await window.Student.getSrsUpcomingSummary();
        },
        onProgressChange: () => {
          window.Student.initReviewNavAndReminder({ showToast: false });
        },
        onReplayDeck: () => {
          openDeckStudy(deckId);
        },
        onFinish: () => {
          if (window.StudyTimer) void window.StudyTimer.stop({ flush: true });
        }
      });
    } catch (err) {
      if (window.StudyTimer) void window.StudyTimer.stop({ flush: false });
      console.error('Lỗi tải thẻ Tự học:', err);
      studyCardsLoading.style.display = 'none';
      studyCardsError.style.display = 'block';
      studyCardsErrorMsg.textContent = (window.XP && typeof window.XP.formatDbError === 'function')
        ? window.XP.formatDbError(err, 'Không thể tải danh sách thẻ trong bộ này.')
        : (err && err.message ? err.message : 'Lỗi kết nối.');
    }
  }

  if (btnRefreshDecks) btnRefreshDecks.addEventListener('click', loadDecks);
  if (btnRetryDecks) btnRetryDecks.addEventListener('click', loadDecks);
  if (btnRetryStudyCards) btnRetryStudyCards.addEventListener('click', () => {
    if (activeDeckId) openDeckStudy(activeDeckId);
  });
  if (btnBackToDecks) btnBackToDecks.addEventListener('click', loadDecks);

  window.Student.initReviewNavAndReminder({ showToast: true });
  await loadDecks();
});
