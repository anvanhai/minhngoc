/**
 * MODULE KHO TỪ VỰNG & LUYỆN THÊM CHO HỌC VIÊN (vocab-practice.html)
 * - Phân trang server, lọc HSK / loại từ / bài học / bộ lọc nhanh / tìm kiếm debounce 300ms
 * - Chọn nhiều dòng + Shift+Click theo khoảng + Chọn tất cả kết quả đang lọc (tối đa 100 từ)
 * - Chế độ Flashcard (tái sử dụng FlashcardSession) & Trắc nghiệm 4 lựa chọn (chấm tại trình duyệt)
 * - Tuân thủ chặt 3 quy tắc bảo toàn lịch ôn: chưa đến hạn -> luyện tự do; đến hạn -> submit_srs_review;
 *   chưa học -> đưa vào lịch bậc 1 (giới hạn 20 từ/ngày VN, vượt báo rõ & vẫn luyện tự do).
 */
document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth();
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);
  if (window.Student && typeof window.Student.initReviewNavAndReminder === 'function') {
    window.Student.initReviewNavAndReminder({ showToast: true });
  }

  const MAX_SELECT = 100;
  const PAGE_SIZE = 30;

  let activeClassId = null;
  let filterState = {
    hskLevel: 'all',
    partOfSpeech: 'all',
    lessonId: '',
    quickFilter: 'all',
    search: '',
    sortBy: 'sort_order',
    page: 1,
    totalPages: 1,
    total: 0
  };

  let dailyNewUsed = 0;
  let dailyNewLimit = 20;
  let currentRows = [];
  let selectedIds = new Set();
  let lastAnchorIndex = null;
  let practiceMode = 'flashcard'; // 'flashcard' | 'mcq'
  let debounceTimer = null;
  let activeFlashcardSession = null;

  // DOM Elements - Browser View
  const browserView = document.getElementById('vp-browser-view');
  const practiceView = document.getElementById('vp-practice-view');
  const browserAlert = document.getElementById('vp-browser-alert');
  const dailyNewUsedEl = document.getElementById('vp-daily-new-used');

  const cntAllEl = document.getElementById('vp-cnt-all');
  const cntDiffEl = document.getElementById('vp-cnt-difficult');
  const cntUpEl = document.getElementById('vp-cnt-upcoming');
  const cntUnlearnedEl = document.getElementById('vp-cnt-unlearned');
  const cntDueEl = document.getElementById('vp-cnt-due');

  const quickFiltersWrap = document.getElementById('vp-quick-filters');
  const searchInput = document.getElementById('vp-search-input');
  const filterHskSel = document.getElementById('vp-filter-hsk');
  const filterPosSel = document.getElementById('vp-filter-pos');
  const filterLessonSel = document.getElementById('vp-filter-lesson');
  const sortBySel = document.getElementById('vp-sort-by');

  const chkPageAll = document.getElementById('vp-chk-page-all');
  const btnSelectFiltered = document.getElementById('vp-btn-select-filtered');
  const btnClearSel = document.getElementById('vp-btn-clear-sel');
  const selectedCountEl = document.getElementById('vp-selected-count');
  const btnStartPractice = document.getElementById('vp-btn-start-practice');

  const loadingEl = document.getElementById('vp-loading');
  const errorEl = document.getElementById('vp-error');
  const errorMsgEl = document.getElementById('vp-error-msg');
  const btnRetryEl = document.getElementById('vp-btn-retry');
  const emptyEl = document.getElementById('vp-empty');
  const btnResetFilters = document.getElementById('vp-btn-reset-filters');
  const listWrap = document.getElementById('vp-list-wrap');
  const wordsListEl = document.getElementById('vp-words-list');
  const pageInfoEl = document.getElementById('vp-page-info');
  const pageIndicatorEl = document.getElementById('vp-page-indicator');
  const btnPrevEl = document.getElementById('vp-btn-prev');
  const btnNextEl = document.getElementById('vp-btn-next');

  // DOM Elements - Practice View
  const btnExitPractice = document.getElementById('vp-btn-exit-practice');
  const practiceHeading = document.getElementById('vp-practice-heading');
  const practiceSubheading = document.getElementById('vp-practice-subheading');
  const sessionAlert = document.getElementById('session-alert');
  const sessionCounter = document.getElementById('session-counter');
  const sessionRemNote = document.getElementById('session-remaining-note');
  const fcPlayingArea = document.getElementById('fc-playing-area');
  const mcqArea = document.getElementById('vp-mcq-area');
  const summaryArea = document.getElementById('fc-summary-area');

  function safeStr(val, fallback = '') {
    if (val === null || val === undefined) return fallback;
    const s = String(val).trim();
    if (!s || s === 'null' || s === 'undefined') return fallback;
    return s;
  }

  function esc(val) {
    return safeStr(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateVnShort(dateStr) {
    const clean = safeStr(dateStr);
    if (!clean) return '';
    const parts = clean.split('-');
    if (parts.length !== 3) return clean;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function formatErr(err, fallback) {
    if (window.XP && typeof window.XP.formatDbError === 'function') {
      return window.XP.formatDbError(err, fallback);
    }
    return safeStr(err && err.message, fallback);
  }

  function showBrowserAlert(msg, type = 'warning', retryFn = null) {
    if (!browserAlert) return;
    if (!msg) {
      browserAlert.className = 'alert';
      browserAlert.textContent = '';
      return;
    }
    browserAlert.className = `alert alert-${type} show`;
    browserAlert.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    browserAlert.appendChild(span);
    if (typeof retryFn === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-sm';
      btn.style.cssText = 'margin-left: 10px; height: 28px; padding: 0 10px; font-size: 12px;';
      btn.textContent = '🔄 Thử lại';
      btn.addEventListener('click', () => {
        showBrowserAlert('');
        retryFn();
      });
      browserAlert.appendChild(btn);
    }
  }

  function showSessionAlert(msg, type = 'danger', retryFn = null) {
    if (!sessionAlert) return;
    if (!msg) {
      sessionAlert.className = 'alert';
      sessionAlert.textContent = '';
      return;
    }
    sessionAlert.className = `alert alert-${type} show`;
    sessionAlert.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    sessionAlert.appendChild(span);
    if (typeof retryFn === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-sm';
      btn.style.cssText = 'margin-left: 10px; height: 28px; padding: 0 10px; font-size: 12px;';
      btn.textContent = '🔄 Thử lại';
      btn.addEventListener('click', () => {
        showSessionAlert('');
        retryFn();
      });
      sessionAlert.appendChild(btn);
    }
  }

  function updateQuotaUi() {
    if (dailyNewUsedEl) dailyNewUsedEl.textContent = String(dailyNewUsed);
  }

  function updateSelectionUi() {
    const count = selectedIds.size;
    if (selectedCountEl) {
      selectedCountEl.textContent = `Đã chọn: ${count}/${MAX_SELECT} từ`;
    }
    if (btnStartPractice) {
      btnStartPractice.disabled = count === 0;
      btnStartPractice.textContent = count > 0
        ? `▶️ Luyện các từ đã chọn (${count})`
        : '▶️ Luyện các từ đã chọn';
    }
    if (chkPageAll) {
      const pageChks = Array.from(document.querySelectorAll('.vp-row-chk'));
      chkPageAll.checked = pageChks.length > 0 && pageChks.every(c => selectedIds.has(c.value));
    }
    document.querySelectorAll('.vp-word-row').forEach(row => {
      const id = row.getAttribute('data-id');
      row.classList.toggle('is-selected', Boolean(id && selectedIds.has(id)));
    });
  }

  function resolveExtraRuleBadge(card) {
    if (!card) return { badgeClass: 'srs-source-badge', label: '🕊️ Luyện tự do (không đổi lịch ôn)' };
    if (card.is_due_today && !card._isFreeRetry) {
      return {
        badgeClass: 'srs-source-badge vp-rule-badge-due',
        label: '📅 Tính vào lịch ôn (Đến hạn)'
      };
    }
    if (card.is_unlearned && !card._isFreeRetry) {
      if (dailyNewUsed >= dailyNewLimit) {
        return {
          badgeClass: 'srs-source-badge vp-rule-badge-quota',
          label: '⚠️ Vượt 20 từ/ngày · Luyện tự do'
        };
      }
      return {
        badgeClass: 'srs-source-badge vp-rule-badge-new',
        label: `🆕 Từ mới → Lịch ôn bậc 1 (${dailyNewUsed}/${dailyNewLimit})`
      };
    }
    return {
      badgeClass: 'srs-source-badge',
      label: '🕊️ Luyện tự do (không đổi lịch ôn)'
    };
  }

  function buildStudentStatusHtml(item) {
    const pills = [];
    const status = safeStr(item.srs_status, 'unlearned');
    const stageNum = typeof item.srs_stage === 'number' ? item.srs_stage : null;
    const dueStr = formatDateVnShort(item.due_date);
    const forgetCount = Number(item.forget_count || 0);

    if (status === 'unlearned') {
      pills.push('<span class="vp-status-pill is-unlearned">🆕 Chưa học</span>');
    } else if (status === 'mastered') {
      pills.push(`<span class="vp-status-pill is-mastered">⭐ Đã thuộc${dueStr ? ` · hẹn ${esc(dueStr)}` : ''}</span>`);
    } else {
      const stageTxt = stageNum !== null ? `Bậc ${stageNum + 1}` : 'Đang ôn';
      pills.push(`<span class="vp-status-pill is-learning">🔁 Đang ôn (${esc(stageTxt)}${dueStr ? ` · hẹn ${esc(dueStr)}` : ''})</span>`);
    }

    if (item.is_due_today) {
      pills.push('<span class="vp-status-pill is-due">🎯 Đến hạn hôm nay</span>');
    } else if (item.is_upcoming_soon) {
      pills.push('<span class="vp-status-pill is-soon">⏰ Sắp đến hạn</span>');
    }

    if (forgetCount > 0) {
      pills.push(`<span class="vp-status-pill is-hard">Quên ${forgetCount} lần</span>`);
    }
    return pills.join('');
  }

  async function loadFilterOptions() {
    try {
      const opts = await window.Student.getStudentVocabFilterOptions();
      dailyNewUsed = Number(opts.daily_new_used || 0);
      dailyNewLimit = Number(opts.daily_new_limit || 20);
      updateQuotaUi();

      const counts = opts.counts || {};
      if (cntAllEl) cntAllEl.textContent = Number(counts.total || 0).toLocaleString('vi-VN');
      if (cntDiffEl) cntDiffEl.textContent = Number(counts.difficult || 0).toLocaleString('vi-VN');
      if (cntUpEl) cntUpEl.textContent = Number(counts.upcoming_soon || 0).toLocaleString('vi-VN');
      if (cntUnlearnedEl) cntUnlearnedEl.textContent = Number(counts.unlearned || 0).toLocaleString('vi-VN');
      if (cntDueEl) cntDueEl.textContent = Number(counts.due_today || 0).toLocaleString('vi-VN');

      if (filterHskSel) {
        const cur = filterHskSel.value;
        const lvls = Array.isArray(opts.hsk_levels) ? opts.hsk_levels : [];
        filterHskSel.innerHTML = '<option value="all">Tất cả cấp HSK</option>' +
          lvls.map(l => `<option value="${Number(l)}">HSK ${Number(l)}</option>`).join('');
        if (cur && filterHskSel.querySelector(`option[value="${cur}"]`)) filterHskSel.value = cur;
      }

      if (filterPosSel) {
        const cur = filterPosSel.value;
        const posList = Array.isArray(opts.parts_of_speech) ? opts.parts_of_speech : [];
        filterPosSel.innerHTML = '<option value="all">Tất cả loại từ</option>' +
          posList.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
        if (cur && filterPosSel.querySelector(`option[value="${cur}"]`)) filterPosSel.value = cur;
      }

      if (filterLessonSel) {
        const cur = filterLessonSel.value;
        const lessons = Array.isArray(opts.lessons) ? opts.lessons : [];
        const myLessons = lessons.filter(l => l.is_my_curriculum);
        const otherLessons = lessons.filter(l => !l.is_my_curriculum);
        let html = '<option value="">Tất cả bài học</option>';
        if (myLessons.length > 0) {
          html += `<optgroup label="📖 Giáo trình lớp đang học">${myLessons.map(l =>
            `<option value="${esc(l.id)}">Bài ${Number(l.order_index)}: ${esc(safeStr(l.title_zh))} (${esc(safeStr(l.title_vi))})</option>`
          ).join('')}</optgroup>`;
        }
        if (otherLessons.length > 0) {
          html += `<optgroup label="📚 Giáo trình khác">${otherLessons.map(l =>
            `<option value="${esc(l.id)}">[${esc(safeStr(l.curriculum_level))}] Bài ${Number(l.order_index)}: ${esc(safeStr(l.title_zh))}</option>`
          ).join('')}</optgroup>`;
        }
        filterLessonSel.innerHTML = html;
        if (cur && filterLessonSel.querySelector(`option[value="${cur}"]`)) filterLessonSel.value = cur;
      }
    } catch (err) {
      console.warn('Không tải được tùy chọn bộ lọc kho từ vựng:', err);
    }
  }

  async function loadWarehousePage() {
    if (loadingEl) loadingEl.style.display = 'block';
    if (errorEl) errorEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';
    if (listWrap) listWrap.style.display = 'none';
    lastAnchorIndex = null;

    try {
      const res = await window.Student.getStudentVocabWarehousePage({
        hskLevel: filterState.hskLevel,
        partOfSpeech: filterState.partOfSpeech,
        lessonId: filterState.lessonId,
        quickFilter: filterState.quickFilter,
        search: filterState.search,
        sortBy: filterState.sortBy,
        page: filterState.page,
        limit: PAGE_SIZE
      });

      currentRows = Array.isArray(res && res.items) ? res.items : [];
      filterState.total = Number((res && res.total) || 0);
      filterState.page = Number((res && res.page) || 1);
      filterState.totalPages = Number((res && res.total_pages) || 1);

      if (loadingEl) loadingEl.style.display = 'none';

      if (currentRows.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        updateSelectionUi();
        return;
      }

      if (listWrap) listWrap.style.display = 'block';

      const fromRow = (filterState.page - 1) * PAGE_SIZE + 1;
      const toRow = Math.min(filterState.page * PAGE_SIZE, filterState.total);
      if (pageInfoEl) {
        pageInfoEl.textContent = `Hiển thị ${fromRow}–${toRow} / ${filterState.total.toLocaleString('vi-VN')} từ`;
      }
      if (pageIndicatorEl) {
        pageIndicatorEl.textContent = `Trang ${filterState.page} / ${filterState.totalPages}`;
      }
      if (btnPrevEl) btnPrevEl.disabled = filterState.page <= 1;
      if (btnNextEl) btnNextEl.disabled = filterState.page >= filterState.totalPages;

      renderWordsRows();
    } catch (err) {
      console.error('Lỗi tải kho từ vựng học viên:', err);
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'block';
      if (errorMsgEl) errorMsgEl.textContent = formatErr(err, 'Không thể tải danh sách từ vựng lúc này.');
    }
  }

  function renderWordsRows() {
    if (!wordsListEl) return;
    wordsListEl.innerHTML = currentRows.map((item, idx) => {
      const checked = selectedIds.has(item.id);
      const pos = safeStr(item.part_of_speech);
      const exHanzi = safeStr(item.example_hanzi);
      const exVi = safeStr(item.example_vi);
      const exampleSnippet = exHanzi
        ? `<div class="vp-word-example">Ví dụ: ${esc(exHanzi)}${exVi ? ` — ${esc(exVi)}` : ''}</div>`
        : '';

      return `
        <div class="vp-word-row ${checked ? 'is-selected' : ''}" data-id="${esc(item.id)}" data-idx="${idx}">
          <div class="vp-cell-check">
            <input type="checkbox" class="vp-row-chk" value="${esc(item.id)}" data-idx="${idx}" ${checked ? 'checked' : ''} aria-label="Chọn từ ${esc(item.hanzi)}">
          </div>

          <div class="vp-cell-hanzi">
            <span class="vp-hanzi-text">${esc(safeStr(item.hanzi))}</span>
            <span class="badge-hsk badge-hsk-${Number(item.hsk_level || 1)}" style="font-size: 11px;">HSK ${Number(item.hsk_level || 1)}</span>
          </div>

          <div class="vp-cell-pinyin">
            <div style="font-weight: 600; color: var(--text-main);">${esc(safeStr(item.pinyin))}</div>
            ${pos ? `<span class="vocab-pos-badge" style="margin-top: 3px; font-size: 11px;">${esc(pos)}</span>` : ''}
          </div>

          <div class="vp-cell-meaning">
            <div style="font-weight: 600; color: var(--text-main);">${esc(safeStr(item.meaning_vi))}</div>
            ${exampleSnippet}
          </div>

          <div class="vp-cell-status">
            ${buildStudentStatusHtml(item)}
          </div>

          <div class="vp-cell-action">
            <button type="button" class="btn btn-outline btn-sm vp-btn-speak" data-hanzi="${esc(safeStr(item.hanzi))}" title="Nghe phát âm">🔊</button>
          </div>
        </div>
      `;
    }).join('');

    wordsListEl.querySelectorAll('.vp-btn-speak').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hz = btn.getAttribute('data-hanzi');
        if (hz && window.XP && typeof window.XP.speakChinese === 'function') {
          window.XP.speakChinese(hz);
        }
      });
    });

    function applyRowSelection(curIdx, wantChecked, useShift) {
      const targetItem = currentRows[curIdx];
      if (!targetItem) return;

      if (useShift && lastAnchorIndex !== null && !isNaN(curIdx)) {
        const from = Math.min(lastAnchorIndex, curIdx);
        const to = Math.max(lastAnchorIndex, curIdx);
        let cappedOut = false;

        for (let i = from; i <= to; i++) {
          const rowItem = currentRows[i];
          if (!rowItem) continue;
          if (wantChecked) {
            if (!selectedIds.has(rowItem.id)) {
              if (selectedIds.size >= MAX_SELECT) {
                cappedOut = true;
                break;
              }
              selectedIds.add(rowItem.id);
            }
          } else {
            selectedIds.delete(rowItem.id);
          }
        }

        if (cappedOut) {
          showBrowserAlert(`Mỗi lượt luyện chỉ chọn tối đa ${MAX_SELECT} từ. Hệ thống đã giữ ${MAX_SELECT} từ đầu tiên trong khoảng vừa chọn.`, 'warning');
        } else {
          showBrowserAlert('');
        }
      } else {
        if (wantChecked) {
          if (selectedIds.size >= MAX_SELECT && !selectedIds.has(targetItem.id)) {
            showBrowserAlert(`Đã đạt giới hạn tối đa ${MAX_SELECT} từ cho một lượt luyện!`, 'warning');
          } else {
            selectedIds.add(targetItem.id);
            showBrowserAlert('');
          }
        } else {
          selectedIds.delete(targetItem.id);
        }
      }

      lastAnchorIndex = curIdx;
      wordsListEl.querySelectorAll('.vp-row-chk').forEach(c => {
        c.checked = selectedIds.has(c.value);
      });
      updateSelectionUi();
    }

    wordsListEl.querySelectorAll('.vp-row-chk').forEach(chk => {
      chk.addEventListener('click', (e) => {
        e.stopPropagation();
        const curIdx = parseInt(chk.getAttribute('data-idx'), 10);
        applyRowSelection(curIdx, chk.checked, e.shiftKey);
      });
    });

    wordsListEl.querySelectorAll('.vp-word-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        const curIdx = parseInt(row.getAttribute('data-idx'), 10);
        const item = currentRows[curIdx];
        if (!item) return;
        applyRowSelection(curIdx, !selectedIds.has(item.id), e.shiftKey);
      });
    });

    updateSelectionUi();
  }

  // ---------------------------------------------------------------------------
  // BẮT ĐẦU PHIÊN LUYỆN TẬP (FLASHCARD HOẶC TRẮC NGHIỆM 4 LỰA CHỌN)
  // ---------------------------------------------------------------------------
  async function startPracticeSession(idsToPractice = null) {
    const targetIds = Array.isArray(idsToPractice) ? idsToPractice : Array.from(selectedIds);
    if (targetIds.length === 0) {
      showBrowserAlert('Vui lòng tích chọn ít nhất 1 từ vựng để bắt đầu luyện tập.', 'warning');
      return;
    }

    if (btnStartPractice) {
      btnStartPractice.disabled = true;
      btnStartPractice.textContent = '⏳ Đang chuẩn bị...';
    }
    showBrowserAlert('');

    try {
      const batch = await window.Student.getStudentVocabPracticeBatch(targetIds);
      const cards = Array.isArray(batch && batch.cards) ? batch.cards : [];
      const distractorPool = Array.isArray(batch && batch.distractor_pool) ? batch.distractor_pool : [];

      dailyNewUsed = Number((batch && batch.daily_new_used) ?? dailyNewUsed);
      dailyNewLimit = Number((batch && batch.daily_new_limit) ?? 20);
      updateQuotaUi();

      if (cards.length === 0) {
        showBrowserAlert('Không tìm thấy từ vựng hợp lệ trong các mục đã chọn.', 'danger');
        return;
      }

      if (browserView) browserView.style.display = 'none';
      if (practiceView) practiceView.style.display = 'block';
      showSessionAlert('');

      if (practiceMode === 'mcq') {
        mountMcqPracticeSession(cards, distractorPool, targetIds);
      } else {
        mountFlashcardPracticeSession(cards, targetIds);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Lỗi bắt đầu phiên luyện thêm:', err);
      showBrowserAlert(formatErr(err, 'Không thể khởi tạo phiên luyện tập lúc này.'), 'danger', () => startPracticeSession(targetIds));
    } finally {
      updateSelectionUi();
    }
  }

  async function processExtraPracticeCardResult(card, rating) {
    // Thử lại cuối phiên (từ luyện tự do / từ mới đã đưa vào ở lượt 1) -> không ghi thêm
    if (card._isFreeRetry) {
      return { practiceKind: 'free', xp_awarded: 0, limit_reached: false };
    }

    // 1. Từ đang đến hạn hôm nay hoặc trễ hạn -> đi qua luồng ôn tập chính thức submit_srs_review
    if (card.is_due_today) {
      const res = await window.Student.submitSrsReview('vocab', card.id, rating, Boolean(card._retriedOnce));
      if (res && typeof res.remaining_due_count === 'number') {
        window.Student.updateNavbarDueBadge(res.remaining_due_count);
      }
      card.srs_stage = (res && typeof res.new_stage === 'number') ? res.new_stage : card.srs_stage;
      card.due_date = (res && res.new_due_date) ? res.new_due_date : card.due_date;
      if (!card._retriedOnce || rating !== 1) {
        card.is_due_today = false;
      }
      return {
        practiceKind: 'due_reviewed',
        xp_awarded: 0,
        limit_reached: false,
        remaining_due_count: res ? res.remaining_due_count : undefined
      };
    }

    // 2. Từ chưa học bao giờ -> RPC từ mới (kiểm tra giới hạn 20 từ/ngày VN + gọi record_word_review)
    if (card.is_unlearned) {
      const res = await window.Student.submitExtraPracticeNewWord(card.id, rating, activeClassId);
      if (typeof res.daily_new_used === 'number') {
        dailyNewUsed = res.daily_new_used;
        dailyNewLimit = Number(res.daily_new_limit || 20);
        updateQuotaUi();
      }
      if (res && res.limit_reached) {
        card.is_unlearned = false;
        return {
          practiceKind: 'quota_exceeded_free',
          xp_awarded: 0,
          limit_reached: true
        };
      }
      card.is_unlearned = false;
      card.srs_stage = typeof res.srs_stage === 'number' ? res.srs_stage : 0;
      card.due_date = res.due_date || card.due_date;
      const xpAwarded = Number((res && res.xp_awarded) || 0);
      if (xpAwarded > 0 && window.XP && typeof window.XP.showXpToast === 'function') {
        window.XP.showXpToast(xpAwarded, 'Từ mới vào lịch ôn');
      }
      return {
        practiceKind: res && res.enrolled ? 'new_enrolled' : 'free',
        xp_awarded: xpAwarded,
        limit_reached: false
      };
    }

    // 3. Từ chưa đến hạn -> luyện tự do hoàn toàn, KHÔNG chạm DB / SRS / XP
    return { practiceKind: 'free', xp_awarded: 0, limit_reached: false };
  }

  function mountFlashcardPracticeSession(cards, targetIds) {
    if (activeFlashcardSession) {
      activeFlashcardSession.destroy();
      activeFlashcardSession = null;
    }
    if (mcqArea) mcqArea.style.display = 'none';
    if (practiceHeading) practiceHeading.textContent = '🗂️ Luyện thêm bằng Flashcard';
    if (practiceSubheading) practiceSubheading.textContent = 'Từ chưa đến hạn giữ nguyên bậc ôn và ngày hẹn; từ đến hạn được tính vào lịch ôn.';
    if (window.StudyTimer) window.StudyTimer.start('extra_practice_flashcard');

    activeFlashcardSession = window.FlashcardSession.mount({
      mode: 'extra_practice',
      cards,
      totalDueOnServer: 0,
      backUrl: 'dashboard.html',
      backLabel: '🏠 Về trang chủ',
      extraRuleResolver: resolveExtraRuleBadge,
      submitCardFn: async (card, rating) => {
        return await processExtraPracticeCardResult(card, rating);
      },
      onProgressChange: () => {
        if (window.Student && typeof window.Student.initReviewNavAndReminder === 'function') {
          window.Student.initReviewNavAndReminder({ showToast: false });
        }
      },
      onReplayDeck: () => {
        exitPracticeToBrowser();
      },
      onFinish: () => {
        if (window.StudyTimer) void window.StudyTimer.stop({ flush: true });
      }
    });
  }

  function shuffleArr(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function buildMcqOptionsForCard(card, pool) {
    const correctMeaning = safeStr(card.meaning_vi);
    const norm = (s) => safeStr(s).toLowerCase().replace(/\s+/g, ' ');
    const targetPos = norm(card.part_of_speech);
    const targetHsk = Number(card.hsk_level || 1);

    const usedMeanings = new Set([norm(correctMeaning)]);
    const candidates = (Array.isArray(pool) ? pool : []).filter(item => {
      if (!item || item.id === card.id) return false;
      const m = safeStr(item.meaning_vi);
      return m && !usedMeanings.has(norm(m));
    });

    // Ưu tiên 1: cùng HSK & cùng loại từ -> 2: cùng HSK -> 3: còn lại
    const sameHskSamePos = shuffleArr(candidates.filter(c =>
      Number(c.hsk_level) === targetHsk && targetPos && norm(c.part_of_speech) === targetPos
    ));
    const sameHsk = shuffleArr(candidates.filter(c =>
      Number(c.hsk_level) === targetHsk && !(targetPos && norm(c.part_of_speech) === targetPos)
    ));
    const fallbackOthers = shuffleArr(candidates.filter(c => Number(c.hsk_level) !== targetHsk));

    const pickedDistractors = [];
    for (const c of [...sameHskSamePos, ...sameHsk, ...fallbackOthers]) {
      const key = norm(c.meaning_vi);
      if (usedMeanings.has(key)) continue;
      usedMeanings.add(key);
      pickedDistractors.push({ text: safeStr(c.meaning_vi), isCorrect: false });
      if (pickedDistractors.length >= 3) break;
    }

    return shuffleArr([
      { text: correctMeaning, isCorrect: true },
      ...pickedDistractors
    ]);
  }

  function mountMcqPracticeSession(cards, distractorPool) {
    if (activeFlashcardSession) {
      activeFlashcardSession.destroy();
      activeFlashcardSession = null;
    }
    if (fcPlayingArea) fcPlayingArea.style.display = 'none';
    if (summaryArea) summaryArea.style.display = 'none';
    if (mcqArea) mcqArea.style.display = 'block';
    if (sessionRemNote) sessionRemNote.style.display = 'none';
    if (practiceHeading) practiceHeading.textContent = '📝 Luyện thêm Trắc nghiệm 4 lựa chọn';
    if (practiceSubheading) practiceSubheading.textContent = 'Nhìn chữ Hán chọn nghĩa đúng (đáp án nhiễu cùng cấp HSK & loại từ).';
    if (window.StudyTimer) window.StudyTimer.start('extra_practice_mcq');

    const mcqRuleBadge = document.getElementById('vp-mcq-rule-badge');
    const mcqStageBadge = document.getElementById('vp-mcq-stage-badge');
    const mcqHanzi = document.getElementById('vp-mcq-hanzi');
    const mcqSpeak = document.getElementById('vp-mcq-speak');
    const mcqPos = document.getElementById('vp-mcq-pos');
    const mcqOptionsHost = document.getElementById('vp-mcq-options');
    const mcqFeedback = document.getElementById('vp-mcq-feedback');
    const mcqNextWrap = document.getElementById('vp-mcq-next-wrap');
    const mcqNextBtn = document.getElementById('vp-mcq-next-btn');

    let qIdx = 0;
    let lockedChoice = false;
    let shownQuotaWarn = false;
    const stats = {
      correctCount: 0,
      wrongCount: 0,
      newlyEnrolled: 0,
      dueReviewed: 0,
      freeCount: 0,
      xpTotal: 0
    };

    function renderMcqCard() {
      if (qIdx >= cards.length) {
        renderMcqSummary();
        return;
      }
      const card = cards[qIdx];
      lockedChoice = false;
      if (sessionCounter) sessionCounter.textContent = `${qIdx + 1}/${cards.length}`;
      if (mcqFeedback) {
        mcqFeedback.style.display = 'none';
        mcqFeedback.className = 'vp-mcq-feedback';
        mcqFeedback.innerHTML = '';
      }
      if (mcqNextWrap) mcqNextWrap.style.display = 'none';
      if (mcqNextBtn) {
        mcqNextBtn.textContent = qIdx === cards.length - 1 ? '🏁 Xem tổng kết' : 'Câu tiếp theo ➡️';
      }

      const rule = resolveExtraRuleBadge(card);
      if (mcqRuleBadge) {
        mcqRuleBadge.className = rule.badgeClass;
        mcqRuleBadge.textContent = rule.label;
      }
      if (mcqStageBadge) {
        const parts = [];
        if (card.overdue_days > 0) parts.push(`⏰ Trễ ${card.overdue_days} ngày`);
        if (typeof card.srs_stage === 'number') parts.push(card.srs_stage >= 6 ? '⭐ Đã thuộc' : `Bậc ${card.srs_stage + 1}`);
        else parts.push(`HSK ${Number(card.hsk_level || 1)}`);
        mcqStageBadge.textContent = parts.join(' · ');
        mcqStageBadge.style.display = 'inline-flex';
      }

      const hz = safeStr(card.hanzi);
      if (mcqHanzi) mcqHanzi.textContent = hz;
      if (mcqPos) {
        const pos = safeStr(card.part_of_speech);
        mcqPos.textContent = pos;
        mcqPos.style.display = pos ? 'inline-block' : 'none';
      }

      if (mcqSpeak) {
        mcqSpeak.onclick = () => {
          if (hz && window.XP && typeof window.XP.speakChinese === 'function') {
            window.XP.speakChinese(hz);
          }
        };
      }
      if (hz && window.XP && typeof window.XP.speakChinese === 'function') {
        window.XP.speakChinese(hz);
      }

      const opts = buildMcqOptionsForCard(card, distractorPool);
      if (mcqOptionsHost) {
        mcqOptionsHost.innerHTML = opts.map((opt, oi) => `
          <button type="button" class="vp-mcq-opt-btn" data-oi="${oi}">
            <span class="vp-mcq-opt-letter">${String.fromCharCode(65 + oi)}</span>
            <span class="vp-mcq-opt-text">${esc(opt.text)}</span>
          </button>
        `).join('');

        mcqOptionsHost.querySelectorAll('.vp-mcq-opt-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (lockedChoice) return;
            const pickedOi = parseInt(btn.getAttribute('data-oi'), 10);
            const picked = opts[pickedOi];
            if (!picked) return;
            lockedChoice = true;

            mcqOptionsHost.querySelectorAll('.vp-mcq-opt-btn').forEach((b, bi) => {
              b.disabled = true;
              if (opts[bi] && opts[bi].isCorrect) b.classList.add('is-correct');
              else if (bi === pickedOi) b.classList.add('is-wrong');
            });

            if (picked.isCorrect) stats.correctCount++;
            else stats.wrongCount++;

            if (mcqFeedback) {
              const exHanzi = safeStr(card.example_hanzi);
              const exVi = safeStr(card.example_vi);
              mcqFeedback.className = `vp-mcq-feedback ${picked.isCorrect ? 'is-ok' : 'is-err'}`;
              mcqFeedback.style.display = 'block';
              mcqFeedback.innerHTML = `
                <div style="font-weight: 800; margin-bottom: 4px;">
                  ${picked.isCorrect ? '✅ Chính xác!' : `❌ Chưa đúng — Nghĩa đúng: "${esc(card.meaning_vi)}"`}
                </div>
                <div style="font-size: 13px; color: var(--text-main);">
                  <strong>${esc(card.hanzi)}</strong> (${esc(card.pinyin)})
                  ${card.part_of_speech ? ` · <em>${esc(card.part_of_speech)}</em>` : ''}
                </div>
                ${exHanzi ? `<div style="font-size: 12.5px; color: var(--text-muted); margin-top: 4px;">${esc(exHanzi)}${exVi ? ` — ${esc(exVi)}` : ''}</div>` : ''}
              `;
            }

            try {
              const out = await processExtraPracticeCardResult(card, picked.isCorrect ? 3 : 1);
              if (out.practiceKind === 'new_enrolled') stats.newlyEnrolled++;
              else if (out.practiceKind === 'due_reviewed') stats.dueReviewed++;
              else stats.freeCount++;
              stats.xpTotal += Number(out.xp_awarded || 0);

              if (out.limit_reached && !shownQuotaWarn) {
                shownQuotaWarn = true;
                showSessionAlert('Bạn đã chạm mốc 20 từ mới đưa vào lịch ôn trong ngày (giờ VN). Các từ mới tiếp theo vẫn tiếp tục luyện tự do bình thường!', 'warning');
              }
            } catch (err) {
              console.warn('Lỗi cập nhật trạng thái ôn khi luyện trắc nghiệm:', err);
              showSessionAlert(formatErr(err, 'Không lưu được trạng thái lịch ôn của thẻ vừa rồi, nhưng bạn vẫn tiếp tục luyện bình thường.'), 'warning');
            }

            if (mcqNextWrap) mcqNextWrap.style.display = 'block';
          });
        });
      }
    }

    function renderMcqSummary() {
      if (window.StudyTimer) void window.StudyTimer.stop({ flush: true });
      if (mcqArea) mcqArea.style.display = 'none';
      if (summaryArea) summaryArea.style.display = 'block';
      if (sessionCounter) sessionCounter.textContent = 'Hoàn thành';

      summaryArea.innerHTML = `
        <div class="card" style="text-align: center; padding: 30px 20px;">
          <div style="font-size: 50px; margin-bottom: 10px;">🎉</div>
          <h2 style="font-size: 22px; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">
            Đã hoàn thành lượt Trắc nghiệm!
          </h2>
          <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 18px; line-height: 1.55;">
            Đã luyện <strong>${cards.length}</strong> từ · Đưa mới vào lịch ôn: <strong>${stats.newlyEnrolled}</strong> từ
            ${stats.dueReviewed > 0 ? ` · Đã ôn đến hạn: <strong>${stats.dueReviewed}</strong> từ` : ''}
            ${stats.freeCount > 0 ? ` · Luyện tự do (giữ nguyên lịch): <strong>${stats.freeCount}</strong> từ` : ''}
            ${stats.xpTotal > 0 ? ` · <span style="color: var(--accent-gold); font-weight: 800;">+${stats.xpTotal} XP</span>` : ''}
          </p>

          <div class="srs-summary-grid" style="grid-template-columns: repeat(2, 1fr); max-width: 380px; margin: 0 auto 18px auto;">
            <div class="srs-summary-stat srs-stat-easy">
              <div class="srs-summary-num">${stats.correctCount}</div>
              <div class="srs-summary-label">🟢 Trả lời đúng</div>
            </div>
            <div class="srs-summary-stat srs-stat-hard">
              <div class="srs-summary-num">${stats.wrongCount}</div>
              <div class="srs-summary-label">🔴 Cần nhớ thêm</div>
            </div>
          </div>

          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button type="button" id="vp-mcq-summary-continue" class="btn btn-primary">🔄 Luyện tiếp</button>
            <a href="dashboard.html" class="btn btn-secondary">🏠 Về trang chủ</a>
          </div>
        </div>
      `;

      const contBtn = document.getElementById('vp-mcq-summary-continue');
      if (contBtn) contBtn.addEventListener('click', exitPracticeToBrowser);
    }

    if (mcqNextBtn) {
      mcqNextBtn.onclick = () => {
        qIdx++;
        renderMcqCard();
      };
    }

    renderMcqCard();
  }

  async function exitPracticeToBrowser() {
    if (window.StudyTimer) await window.StudyTimer.stop({ flush: true });
    if (activeFlashcardSession) {
      activeFlashcardSession.destroy();
      activeFlashcardSession = null;
    }
    if (practiceView) practiceView.style.display = 'none';
    if (browserView) browserView.style.display = 'block';
    showSessionAlert('');
    await Promise.all([loadFilterOptions(), loadWarehousePage()]);
    if (window.Student && typeof window.Student.initReviewNavAndReminder === 'function') {
      window.Student.initReviewNavAndReminder({ showToast: false });
    }
  }

  // ---------------------------------------------------------------------------
  // GẮN SỰ KIỆN BỘ LỌC & CHỌN TỪ
  // ---------------------------------------------------------------------------
  if (quickFiltersWrap) {
    quickFiltersWrap.querySelectorAll('.vp-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        quickFiltersWrap.querySelectorAll('.vp-quick-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterState.quickFilter = btn.getAttribute('data-quick') || 'all';
        filterState.page = 1;
        loadWarehousePage();
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        filterState.search = searchInput.value.trim();
        filterState.page = 1;
        loadWarehousePage();
      }, 300);
    });
  }

  if (filterHskSel) {
    filterHskSel.addEventListener('change', () => {
      filterState.hskLevel = filterHskSel.value || 'all';
      filterState.page = 1;
      loadWarehousePage();
    });
  }

  if (filterPosSel) {
    filterPosSel.addEventListener('change', () => {
      filterState.partOfSpeech = filterPosSel.value || 'all';
      filterState.page = 1;
      loadWarehousePage();
    });
  }

  if (filterLessonSel) {
    filterLessonSel.addEventListener('change', () => {
      filterState.lessonId = filterLessonSel.value || '';
      filterState.page = 1;
      loadWarehousePage();
    });
  }

  if (sortBySel) {
    sortBySel.addEventListener('change', () => {
      filterState.sortBy = sortBySel.value || 'sort_order';
      filterState.page = 1;
      loadWarehousePage();
    });
  }

  if (btnResetFilters) {
    btnResetFilters.addEventListener('click', () => {
      filterState = {
        ...filterState,
        hskLevel: 'all',
        partOfSpeech: 'all',
        lessonId: '',
        quickFilter: 'all',
        search: '',
        sortBy: 'sort_order',
        page: 1
      };
      if (searchInput) searchInput.value = '';
      if (filterHskSel) filterHskSel.value = 'all';
      if (filterPosSel) filterPosSel.value = 'all';
      if (filterLessonSel) filterLessonSel.value = '';
      if (sortBySel) sortBySel.value = 'sort_order';
      if (quickFiltersWrap) {
        quickFiltersWrap.querySelectorAll('.vp-quick-btn').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-quick') === 'all');
        });
      }
      loadWarehousePage();
    });
  }

  if (btnRetryEl) btnRetryEl.addEventListener('click', loadWarehousePage);
  if (btnPrevEl) btnPrevEl.addEventListener('click', () => {
    if (filterState.page > 1) {
      filterState.page--;
      loadWarehousePage();
    }
  });
  if (btnNextEl) btnNextEl.addEventListener('click', () => {
    if (filterState.page < filterState.totalPages) {
      filterState.page++;
      loadWarehousePage();
    }
  });

  if (chkPageAll) {
    chkPageAll.addEventListener('change', () => {
      const checked = chkPageAll.checked;
      let capped = false;
      currentRows.forEach(item => {
        if (checked) {
          if (!selectedIds.has(item.id)) {
            if (selectedIds.size >= MAX_SELECT) {
              capped = true;
              return;
            }
            selectedIds.add(item.id);
          }
        } else {
          selectedIds.delete(item.id);
        }
      });
      document.querySelectorAll('.vp-row-chk').forEach(c => {
        c.checked = selectedIds.has(c.value);
      });
      if (capped) {
        showBrowserAlert(`Đã chạm giới hạn tối đa ${MAX_SELECT} từ/lượt luyện.`, 'warning');
      } else {
        showBrowserAlert('');
      }
      updateSelectionUi();
    });
  }

  if (btnSelectFiltered) {
    btnSelectFiltered.addEventListener('click', async () => {
      const prevTxt = btnSelectFiltered.textContent;
      try {
        btnSelectFiltered.disabled = true;
        btnSelectFiltered.textContent = '⏳ Đang chọn...';
        const res = await window.Student.getStudentVocabFilteredIds({
          hskLevel: filterState.hskLevel,
          partOfSpeech: filterState.partOfSpeech,
          lessonId: filterState.lessonId,
          quickFilter: filterState.quickFilter,
          search: filterState.search,
          sortBy: filterState.sortBy,
          maxSelect: MAX_SELECT
        });
        const ids = Array.isArray(res && res.ids) ? res.ids : [];
        const totalMatched = Number((res && res.total_matched) || ids.length);
        selectedIds = new Set(ids.slice(0, MAX_SELECT));
        document.querySelectorAll('.vp-row-chk').forEach(c => {
          c.checked = selectedIds.has(c.value);
        });
        updateSelectionUi();
        if (totalMatched > MAX_SELECT) {
          showBrowserAlert(`Có ${totalMatched.toLocaleString('vi-VN')} từ khớp bộ lọc — đã chọn ${MAX_SELECT} từ đầu tiên theo giới hạn mỗi lượt.`, 'warning');
        } else if (selectedIds.size > 0) {
          showBrowserAlert(`Đã chọn toàn bộ ${selectedIds.size} từ khớp bộ lọc hiện tại.`, 'success');
        } else {
          showBrowserAlert('Không có từ nào khớp bộ lọc để chọn.', 'warning');
        }
      } catch (err) {
        showBrowserAlert(formatErr(err, 'Không thể chọn danh sách từ theo bộ lọc.'), 'danger');
      } finally {
        btnSelectFiltered.disabled = false;
        btnSelectFiltered.textContent = prevTxt;
      }
    });
  }

  if (btnClearSel) {
    btnClearSel.addEventListener('click', () => {
      selectedIds.clear();
      lastAnchorIndex = null;
      document.querySelectorAll('.vp-row-chk').forEach(c => { c.checked = false; });
      showBrowserAlert('');
      updateSelectionUi();
    });
  }

  document.querySelectorAll('.vp-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.vp-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      practiceMode = btn.getAttribute('data-mode') || 'flashcard';
    });
  });

  if (btnStartPractice) {
    btnStartPractice.addEventListener('click', () => startPracticeSession());
  }
  if (btnExitPractice) {
    btnExitPractice.addEventListener('click', exitPracticeToBrowser);
  }

  // Khởi tạo: lấy lớp đang học (nếu có) + bộ lọc + trang đầu tiên
  try {
    const activeCls = await window.Student.getActiveClass();
    activeClassId = activeCls ? activeCls.id : null;
  } catch (e) {}

  await Promise.all([loadFilterOptions(), loadWarehousePage()]);
});
