/**
 * LOGIC KHO TỪ VỰNG & NHẬP EXCEL / CSV (admin/vocabularies.html)
 * Phiên bản 5.2: Phân trang phía Server (Server-Side Pagination), Tìm kiếm Debounce,
 * Bộ lọc linh hoạt, Ghi nhớ trạng thái và Xuất file Excel
 */

document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth(['admin', 'teacher'], '../index.html');
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);

  // Trạng thái phân trang & lọc
  let currentPage = 1;
  let pageSize = 50;
  let totalWords = 0;
  let totalPages = 1;
  let currentWordsList = [];
  let parsedExcelWords = [];
  let skippedExcelRows = [];
  let searchDebounceTimer = null;

  // DOM Elements
  const pageAlert = document.getElementById('page-alert');
  const searchInput = document.getElementById('search-vocab-input');
  const filterHsk = document.getElementById('filter-hsk-level');
  const filterPartOfSpeech = document.getElementById('filter-part-of-speech');
  const selectSortBy = document.getElementById('select-sort-by');
  const btnSearch = document.getElementById('btn-search-vocab');
  const btnExportExcel = document.getElementById('btn-export-excel');
  const vocabTableBody = document.getElementById('vocab-table-body');
  const hskTabs = document.querySelectorAll('.btn-hsk-tab');

  // Modal Excel
  const modalImportExcel = document.getElementById('modal-import-excel');
  const btnOpenImportExcel = document.getElementById('btn-open-import-excel');
  const excelDropzone = document.getElementById('excel-dropzone');
  const excelSelectedFileEl = document.getElementById('excel-selected-file');
  const excelFileInput = document.getElementById('excel-file-input');
  const importSheetSelectorWrap = document.getElementById('import-sheet-selector-wrap');
  const importSheetSelect = document.getElementById('import-sheet-select');
  const importDetectSummary = document.getElementById('import-detect-summary');
  const importDetectSummaryText = document.getElementById('import-detect-summary-text');
  const importDetectBadges = document.getElementById('import-detect-badges');
  const btnToggleColumnMapper = document.getElementById('btn-toggle-column-mapper');
  const importDefaultHskWrap = document.getElementById('import-default-hsk-wrap');
  const importDefaultHskSelect = document.getElementById('import-default-hsk-select');
  const importDefaultHskHint = document.getElementById('import-default-hsk-hint');
  const importColumnMapperWrap = document.getElementById('import-column-mapper-wrap');
  const btnApplyColumnMapping = document.getElementById('btn-apply-column-mapping');
  const importMapperHead = document.getElementById('import-mapper-head');
  const importMapperBody = document.getElementById('import-mapper-body');
  const selectAssignCurriculum = document.getElementById('import-assign-curriculum');
  const selectAssignLesson = document.getElementById('import-assign-lesson');
  const importLessonLoadError = document.getElementById('import-lesson-load-error');
  const importLessonLoadErrorText = document.getElementById('import-lesson-load-error-text');
  const btnRetryLoadLessons = document.getElementById('btn-retry-load-lessons');
  const previewContainer = document.getElementById('preview-container');
  const previewCount = document.getElementById('preview-count');
  const previewTableBody = document.getElementById('preview-table-body');
  const previewSkippedBox = document.getElementById('preview-skipped-box');
  const previewSkippedTitle = document.getElementById('preview-skipped-title');
  const previewSkippedList = document.getElementById('preview-skipped-list');
  const btnDownloadSkippedCsv = document.getElementById('btn-download-skipped-csv');
  const btnConfirmImport = document.getElementById('btn-confirm-import');
  const importModalAlert = document.getElementById('import-modal-alert');

  // Modal Thêm / Sửa từ
  const modalCreateVocab = document.getElementById('modal-create-vocab');
  const modalVocabTitle = document.getElementById('modal-vocab-title');
  const btnOpenCreateVocab = document.getElementById('btn-open-create-vocab');
  const formCreateVocab = document.getElementById('form-create-vocab');
  const createVocabAlert = document.getElementById('create-vocab-alert');
  const btnSubmitVocab = document.getElementById('btn-submit-vocab');
  const inputVocabId = document.getElementById('v-id');

  // Modal Xóa từ khỏi kho
  const modalDeleteVocab = document.getElementById('modal-delete-vocab');
  const deleteVocabLoading = document.getElementById('delete-vocab-loading');
  const deleteVocabContent = document.getElementById('delete-vocab-content');
  const deleteVocabHanzi = document.getElementById('delete-vocab-hanzi');
  const deleteVocabWarning = document.getElementById('delete-vocab-warning');
  const deleteVocabUsageDesc = document.getElementById('delete-vocab-usage-desc');
  const deleteVocabLessonsList = document.getElementById('delete-vocab-lessons-list');
  const deleteVocabDangerNote = document.getElementById('delete-vocab-danger-note');
  const btnConfirmDeleteVocab = document.getElementById('btn-confirm-delete-vocab');
  let pendingDeleteVocabId = null;

  function showAlert(msg, type = 'danger') {
    pageAlert.className = `alert alert-${type} show`;
    pageAlert.textContent = msg;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clearImportAlert() {
    importModalAlert.className = 'alert';
    importModalAlert.textContent = '';
  }

  function showImportAlert(msg, type = 'danger') {
    importModalAlert.className = `alert alert-${type} show`;
    importModalAlert.textContent = msg;
  }

  // ===========================================================================
  // 1. QUẢN LÝ TRẠNG THÁI (SESSION STORAGE)
  // ===========================================================================

  function loadState() {
    try {
      const raw = sessionStorage.getItem('minhngoc_vocab_state');
      if (raw) {
        const state = JSON.parse(raw);
        if (state.page && typeof state.page === 'number') currentPage = state.page;
        if (state.pageSize && [25, 50, 100, 200].includes(state.pageSize)) pageSize = state.pageSize;
        if (state.hskLevel !== undefined && filterHsk) filterHsk.value = state.hskLevel;
        if (state.partOfSpeech !== undefined && filterPartOfSpeech) filterPartOfSpeech.value = state.partOfSpeech;
        if (state.search !== undefined && searchInput) searchInput.value = state.search;
        if (state.sortBy && selectSortBy) selectSortBy.value = state.sortBy;

        // Đồng bộ tab HSK tương ứng
        syncHskTabs(filterHsk ? filterHsk.value : 'all');
      }
    } catch (e) {
      console.warn('Không thể đọc trạng thái từ sessionStorage:', e);
    }
  }

  function saveState() {
    try {
      sessionStorage.setItem('minhngoc_vocab_state', JSON.stringify({
        page: currentPage,
        pageSize: pageSize,
        hskLevel: filterHsk ? filterHsk.value : 'all',
        partOfSpeech: filterPartOfSpeech ? filterPartOfSpeech.value : 'all',
        search: searchInput ? searchInput.value : '',
        sortBy: selectSortBy ? selectSortBy.value : 'sort_order'
      }));
    } catch (e) {
      console.warn('Không thể lưu trạng thái vào sessionStorage:', e);
    }
  }

  function syncHskTabs(level) {
    hskTabs.forEach(tab => {
      if (tab.getAttribute('data-level') === String(level)) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
  }

  // ===========================================================================
  // 2. TẢI DANH SÁCH TỪ VỰNG PHÍA SERVER (SERVER-SIDE PAGINATION)
  // ===========================================================================

  async function loadVocabulariesList() {
    try {
      vocabTableBody.innerHTML = `
        <tr><td colspan="8" style="text-align: center; padding: 40px 16px; color: var(--text-muted);">
          <div style="font-size: 26px; margin-bottom: 8px;">⏳</div>
          <div style="font-size: 14px; font-weight: 500;">Đang tải danh sách từ vựng (Trang ${currentPage})...</div>
        </td></tr>
      `;

      const search = searchInput ? searchInput.value.trim() : '';
      const hskLevel = filterHsk ? filterHsk.value : 'all';
      const partOfSpeech = filterPartOfSpeech ? filterPartOfSpeech.value : 'all';
      const sortBy = selectSortBy ? selectSortBy.value : 'sort_order';

      const result = await window.Admin.getVocabularies({
        search,
        hskLevel,
        partOfSpeech,
        limit: pageSize,
        page: currentPage,
        sortBy
      });

      totalWords = result.total || 0;
      totalPages = result.totalPages || 1;
      currentWordsList = result.data || [];

      // Nếu trang hiện tại bị rỗng do xóa từ hoặc đổi bộ lọc, tự động lùi về trang hợp lệ cuối cùng
      if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
        saveState();
        return loadVocabulariesList();
      }

      // 1. Cập nhật giao diện phân trang (trên và dưới bảng)
      renderPagination();

      // 2. Hiển thị dữ liệu bảng
      if (currentWordsList.length === 0) {
        vocabTableBody.innerHTML = `
          <tr><td colspan="8" style="text-align: center; padding: 48px 16px; color: var(--text-muted);">
            <div style="font-size: 36px; margin-bottom: 10px;">🔍</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
              Không tìm thấy từ vựng nào phù hợp
            </div>
            <div style="font-size: 13px;">
              Thử tìm kiếm với từ khóa khác, chọn cấp độ HSK khác hoặc bấm <strong>"Nhập từ file Excel"</strong> để bổ sung!
            </div>
          </td></tr>
        `;
        return;
      }

      vocabTableBody.innerHTML = currentWordsList.map((w, idx) => `
        <tr>
          <td style="text-align: center; font-weight: 700; color: var(--text-muted); font-size: 13px;">
            ${w.sort_order !== null && w.sort_order !== undefined ? w.sort_order : ((currentPage - 1) * pageSize + idx + 1)}
          </td>
          <td style="font-size: 20px; font-weight: 700; color: var(--primary); font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;">
            ${w.hanzi}
          </td>
          <td style="font-size: 15px; font-weight: 600; color: var(--text-muted);">${w.pinyin}</td>
          <td style="font-weight: 500;">${w.meaning_vi}</td>
          <td><span class="badge-hsk badge-hsk-${w.hsk_level}">HSK ${w.hsk_level}</span></td>
          <td><span style="font-size: 12px; color: var(--text-muted);">${w.part_of_speech || '--'}</span></td>
          <td style="font-size: 13px;">
            ${w.example_hanzi ? `<div><strong>${w.example_hanzi}</strong></div>` : ''}
            ${w.example_pinyin ? `<div style="color: var(--text-muted);">${w.example_pinyin}</div>` : ''}
            ${w.example_vi ? `<div style="color: var(--text-muted);">${w.example_vi}</div>` : ''}
            ${!w.example_hanzi ? '<span style="color: var(--text-light);">--</span>' : ''}
          </td>
          <td style="text-align: center; white-space: nowrap;">
            <button type="button" class="btn btn-outline btn-sm btn-speak-word" data-hanzi="${w.hanzi}" style="padding: 4px 7px; font-size: 13px;" title="Phát âm">
              🔊
            </button>
            <button type="button" class="btn btn-outline btn-sm btn-edit-word" data-id="${w.id}" style="padding: 4px 7px; font-size: 13px;" title="Chỉnh sửa">
              ✏️
            </button>
            <button type="button" class="btn btn-outline btn-sm btn-delete-word" data-id="${w.id}" data-hanzi="${w.hanzi}" style="padding: 4px 7px; font-size: 13px; color: var(--danger); border-color: #fca5a5;" title="Xóa từ">
              🗑️
            </button>
          </td>
        </tr>
      `).join('');

      // Gắn sự kiện các nút trên từng dòng
      bindRowActions();

    } catch (err) {
      console.error('Lỗi tải danh sách từ vựng:', err);
      vocabTableBody.innerHTML = `
        <tr><td colspan="8" style="text-align: center; padding: 36px 16px; color: var(--danger);">
          <div style="font-size: 28px; margin-bottom: 8px;">⚠️</div>
          <div style="font-weight: 700; font-size: 15px; margin-bottom: 6px;">Không thể tải danh sách từ vựng</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">${err.message || 'Lỗi kết nối cơ sở dữ liệu'}</div>
          <button type="button" class="btn btn-outline btn-sm btn-retry-vocab" style="margin: 0 auto; display: inline-flex; align-items: center; gap: 6px;">
            🔄 Thử lại
          </button>
        </td></tr>
      `;
      const btnRetry = vocabTableBody.querySelector('.btn-retry-vocab');
      if (btnRetry) btnRetry.addEventListener('click', loadVocabulariesList);
    }
  }

  // ===========================================================================
  // 3. RENDER & ĐIỀU KHIỂN THANH PHÂN TRANG (TOP & BOTTOM)
  // ===========================================================================

  function renderPagination() {
    const from = totalWords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const to = Math.min(currentPage * pageSize, totalWords);
    const infoText = totalWords === 0
      ? 'Không có từ vựng nào'
      : `Hiển thị <strong>${from}–${to}</strong> / tổng số <strong>${totalWords.toLocaleString('vi-VN')}</strong> từ (Trang ${currentPage}/${totalPages})`;

    // 1. Cập nhật text thống kê số dòng
    document.querySelectorAll('.vocab-page-info').forEach(el => {
      el.innerHTML = infoText;
    });

    // 2. Đồng bộ giá trị chọn số dòng mỗi trang
    document.querySelectorAll('.select-page-size').forEach(sel => {
      sel.value = String(pageSize);
    });

    // 3. Tạo danh sách các nút số trang (rút gọn với dấu ba chấm ...)
    const pagerHtml = buildPagerButtonsHtml(currentPage, totalPages);
    document.querySelectorAll('.vocab-pager').forEach(p => {
      p.innerHTML = pagerHtml;
    });

    // 4. Đồng bộ ô nhập nhảy trang
    document.querySelectorAll('.input-jump-page').forEach(inp => {
      inp.value = currentPage;
      inp.max = totalPages;
    });

    // 5. Gắn lại sự kiện cho các nút pager
    bindPagerEvents();
  }

  function buildPagerButtonsHtml(page, total) {
    if (total <= 1) {
      return `
        <button type="button" class="pager-btn" disabled title="Trang đầu">«</button>
        <button type="button" class="pager-btn" disabled title="Trang trước">‹</button>
        <button type="button" class="pager-btn active">1</button>
        <button type="button" class="pager-btn" disabled title="Trang sau">›</button>
        <button type="button" class="pager-btn" disabled title="Trang cuối">»</button>
      `;
    }

    const isFirstDisabled = page <= 1;
    const isLastDisabled = page >= total;

    let html = `
      <button type="button" class="pager-btn btn-pager-first" data-page="1" ${isFirstDisabled ? 'disabled' : ''} title="Trang đầu (Trang 1)">«</button>
      <button type="button" class="pager-btn btn-pager-prev" data-page="${page - 1}" ${isFirstDisabled ? 'disabled' : ''} title="Trang trước">‹</button>
    `;

    // Tính toán số trang hiển thị dạng: 1 ... 4 5 6 ... 10
    const pages = getPageNumbersList(page, total);
    pages.forEach(p => {
      if (p === '...') {
        html += `<span class="pager-ellipsis">…</span>`;
      } else {
        const isActive = (p === page);
        html += `
          <button type="button" class="pager-btn btn-pager-num ${isActive ? 'active' : ''}" data-page="${p}">
            ${p}
          </button>
        `;
      }
    });

    html += `
      <button type="button" class="pager-btn btn-pager-next" data-page="${page + 1}" ${isLastDisabled ? 'disabled' : ''} title="Trang sau">›</button>
      <button type="button" class="pager-btn btn-pager-last" data-page="${total}" ${isLastDisabled ? 'disabled' : ''} title="Trang cuối (Trang ${total})">»</button>
    `;

    return html;
  }

  function getPageNumbersList(page, total) {
    if (total <= 7) {
      const list = [];
      for (let i = 1; i <= total; i++) list.push(i);
      return list;
    }

    if (page <= 4) {
      return [1, 2, 3, 4, 5, '...', total];
    }

    if (page >= total - 3) {
      return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    }

    return [1, '...', page - 1, page, page + 1, '...', total];
  }

  function bindPagerEvents() {
    // Nút chuyển trang (First, Prev, Next, Last, Số trang)
    document.querySelectorAll('.vocab-pager .pager-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetPage = parseInt(btn.dataset.page, 10);
        if (targetPage && targetPage !== currentPage && targetPage >= 1 && targetPage <= totalPages) {
          currentPage = targetPage;
          saveState();
          loadVocabulariesList();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }

  // Gắn sự kiện thay đổi số dòng mỗi trang (.select-page-size)
  document.querySelectorAll('.select-page-size').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const newLimit = parseInt(e.target.value, 10);
      if ([25, 50, 100, 200].includes(newLimit)) {
        pageSize = newLimit;
        currentPage = 1;
        saveState();
        loadVocabulariesList();
      }
    });
  });

  // Gắn sự kiện ô nhập nhảy trang (.input-jump-page)
  document.querySelectorAll('.btn-jump-page').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const container = e.target.closest('.vocab-jump');
      const inp = container ? container.querySelector('.input-jump-page') : null;
      if (!inp) return;
      const jumpVal = parseInt(inp.value, 10);
      if (jumpVal && jumpVal >= 1 && jumpVal <= totalPages && jumpVal !== currentPage) {
        currentPage = jumpVal;
        saveState();
        loadVocabulariesList();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });

  document.querySelectorAll('.input-jump-page').forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const jumpVal = parseInt(inp.value, 10);
        if (jumpVal && jumpVal >= 1 && jumpVal <= totalPages && jumpVal !== currentPage) {
          currentPage = jumpVal;
          saveState();
          loadVocabulariesList();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    });
  });

  // ===========================================================================
  // 4. BỘ LỌC & TÌM KIẾM CÓ DEBOUNCE 300MS
  // ===========================================================================

  // Tìm kiếm với Debounce 300ms
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      currentPage = 1;
      saveState();
      loadVocabulariesList();
    }, 300);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchDebounceTimer);
      currentPage = 1;
      saveState();
      loadVocabulariesList();
    }
  });

  btnSearch.addEventListener('click', () => {
    clearTimeout(searchDebounceTimer);
    currentPage = 1;
    saveState();
    loadVocabulariesList();
  });

  // Lọc theo Cấp độ HSK (Dropdown)
  filterHsk.addEventListener('change', () => {
    syncHskTabs(filterHsk.value);
    currentPage = 1;
    saveState();
    loadVocabulariesList();
  });

  // Lọc theo Cấp độ HSK (Dải Tabs chọn nhanh)
  hskTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const level = tab.getAttribute('data-level');
      filterHsk.value = level;
      syncHskTabs(level);
      currentPage = 1;
      saveState();
      loadVocabulariesList();
    });
  });

  // Lọc theo Từ loại (Danh từ, Động từ, Tính từ...)
  if (filterPartOfSpeech) {
    filterPartOfSpeech.addEventListener('change', () => {
      currentPage = 1;
      saveState();
      loadVocabulariesList();
    });
  }

  // Sắp xếp danh sách từ vựng (Thứ tự Excel, Pinyin, Chữ Hán, Mới nhất)
  if (selectSortBy) {
    selectSortBy.addEventListener('change', () => {
      currentPage = 1;
      saveState();
      loadVocabulariesList();
    });
  }

  // ===========================================================================
  // 5. XUẤT TOÀN BỘ KHO TỪ VỰNG RA EXCEL / CSV
  // ===========================================================================

  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', async () => {
      try {
        btnExportExcel.disabled = true;
        btnExportExcel.innerHTML = '⏳ Đang kết xuất Excel...';

        const search = searchInput ? searchInput.value.trim() : '';
        const hskLevel = filterHsk ? filterHsk.value : 'all';
        const partOfSpeech = filterPartOfSpeech ? filterPartOfSpeech.value : 'all';
        const sortBy = selectSortBy ? selectSortBy.value : 'sort_order';

        const res = await window.Admin.exportVocabulariesToExcel({
          search,
          hskLevel,
          partOfSpeech,
          sortBy
        });

        showAlert(`🎉 Đã xuất thành công ${res.count.toLocaleString('vi-VN')} từ vựng ra file "${res.fileName}"!`, 'success');

      } catch (err) {
        console.error('Lỗi xuất Excel:', err);
        showAlert('Lỗi khi xuất file Excel: ' + (err.message || err), 'danger');
      } finally {
        btnExportExcel.disabled = false;
        btnExportExcel.innerHTML = '📤 Xuất file Excel';
      }
    });
  }

  // ===========================================================================
  // 6. GẮN SỰ KIỆN PHÁT ÂM, SỬA, XÓA TRÊN TỪNG DÒNG
  // ===========================================================================

  function bindRowActions() {
    // Phát âm chữ Hán
    document.querySelectorAll('.btn-speak-word').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hanzi = btn.getAttribute('data-hanzi');
        if (window.XP && typeof window.XP.speakChinese === 'function') {
          window.XP.speakChinese(hanzi);
        } else if (typeof window.speakChinese === 'function') {
          window.speakChinese(hanzi);
        }
      });
    });

    // Mở modal sửa từ
    document.querySelectorAll('.btn-edit-word').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        openEditVocabModal(id);
      });
    });

    // Mở modal xóa từ
    document.querySelectorAll('.btn-delete-word').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const hanzi = btn.getAttribute('data-hanzi');
        openDeleteVocabModal(id, hanzi);
      });
    });
  }

  // ===========================================================================
  // 7. THÊM MỚI & SỬA TỪ THỦ CÔNG
  // ===========================================================================

  btnOpenCreateVocab.addEventListener('click', () => {
    createVocabAlert.className = 'alert';
    createVocabAlert.textContent = '';
    formCreateVocab.reset();
    inputVocabId.value = '';
    if (modalVocabTitle) modalVocabTitle.textContent = 'Thêm Từ Vựng Mới';
    btnSubmitVocab.textContent = 'Lưu từ vựng';
    modalCreateVocab.classList.add('active');
  });

  function openEditVocabModal(id) {
    const word = currentWordsList.find(w => w.id === id);
    if (!word) return;

    createVocabAlert.className = 'alert';
    createVocabAlert.textContent = '';
    formCreateVocab.reset();

    inputVocabId.value = word.id;
    document.getElementById('v-hanzi').value = word.hanzi || '';
    document.getElementById('v-pinyin').value = word.pinyin || '';
    document.getElementById('v-meaning').value = word.meaning_vi || '';
    document.getElementById('v-hsk').value = String(word.hsk_level || 1);
    document.getElementById('v-pos').value = word.part_of_speech || '';
    const inputSortOrder = document.getElementById('v-sort-order');
    if (inputSortOrder) {
      inputSortOrder.value = (word.sort_order !== null && word.sort_order !== undefined) ? word.sort_order : '';
    }
    document.getElementById('v-ex-hanzi').value = word.example_hanzi || '';
    document.getElementById('v-ex-vi').value = word.example_vi || '';

    if (modalVocabTitle) modalVocabTitle.textContent = `Chỉnh Sửa Từ Vựng: ${word.hanzi}`;
    btnSubmitVocab.textContent = 'Cập nhật thay đổi';
    modalCreateVocab.classList.add('active');
  }

  document.querySelectorAll('[data-close="modal-create-vocab"]').forEach(b => {
    b.addEventListener('click', () => modalCreateVocab.classList.remove('active'));
  });

  formCreateVocab.addEventListener('submit', async function (e) {
    e.preventDefault();
    const vocabId = inputVocabId.value.trim();
    const hanzi = document.getElementById('v-hanzi').value.trim();
    const pinyin = document.getElementById('v-pinyin').value.trim();
    const meaningVi = document.getElementById('v-meaning').value.trim();
    const hskLevel = parseInt(document.getElementById('v-hsk').value, 10) || 1;
    const partOfSpeech = document.getElementById('v-pos').value.trim();
    const sortOrderVal = document.getElementById('v-sort-order') ? document.getElementById('v-sort-order').value.trim() : '';
    const sortOrder = sortOrderVal !== '' ? parseInt(sortOrderVal, 10) : null;
    const exampleHanzi = document.getElementById('v-ex-hanzi').value.trim();
    const exampleVi = document.getElementById('v-ex-vi').value.trim();

    try {
      btnSubmitVocab.disabled = true;
      btnSubmitVocab.textContent = 'Đang xử lý...';

      if (vocabId) {
        // Cập nhật từ vựng
        await window.Admin.updateVocabulary(vocabId, {
          hanzi,
          pinyin,
          meaningVi,
          hskLevel,
          partOfSpeech,
          exampleHanzi,
          exampleVi,
          sortOrder
        });
        showAlert(`Đã cập nhật từ vựng "${hanzi}" (HSK ${hskLevel}) thành công!`, 'success');
      } else {
        // Thêm mới từ vựng
        await window.Admin.createVocabulary({
          hanzi,
          pinyin,
          meaningVi,
          hskLevel,
          partOfSpeech,
          exampleHanzi,
          exampleVi,
          sortOrder
        });
        showAlert(`Đã thêm từ "${hanzi}" (HSK ${hskLevel}) vào kho từ vựng!`, 'success');
      }

      modalCreateVocab.classList.remove('active');
      saveState();
      await loadVocabulariesList();

    } catch (err) {
      createVocabAlert.className = 'alert alert-danger show';
      createVocabAlert.textContent = err.message || 'Lỗi khi lưu từ vựng';
    } finally {
      btnSubmitVocab.disabled = false;
      btnSubmitVocab.textContent = vocabId ? 'Cập nhật thay đổi' : 'Lưu từ vựng';
    }
  });

  // ===========================================================================
  // 8. XÓA TỪ VỰNG KHỎI KHO
  // ===========================================================================

  async function openDeleteVocabModal(id, hanzi) {
    pendingDeleteVocabId = id;
    deleteVocabHanzi.textContent = `"${hanzi}"`;
    deleteVocabLoading.style.display = 'block';
    deleteVocabContent.style.display = 'none';
    btnConfirmDeleteVocab.style.display = 'none';

    modalDeleteVocab.classList.add('active');

    try {
      const stats = await window.Admin.getVocabularyUsageStats(id);
      deleteVocabLoading.style.display = 'none';
      deleteVocabContent.style.display = 'block';

      if (stats.lesson_count > 0) {
        deleteVocabUsageDesc.innerHTML = `
          Từ vựng này đang được gán trong <strong>${stats.lesson_count} bài học</strong> và có <strong>${stats.progress_count || 0}</strong> lượt học sinh theo dõi tiến độ SRS:
        `;
        const lessonsList = Array.isArray(stats.lessons) ? stats.lessons : [];
        deleteVocabLessonsList.innerHTML = lessonsList.map(l => `
          <li><strong>${l.curriculum_title}</strong>: Bài ${l.lesson_order} - ${l.lesson_title}</li>
        `).join('');
        deleteVocabDangerNote.style.display = 'block';
      } else {
        deleteVocabUsageDesc.innerHTML = `
          Từ vựng này hiện <strong>chưa được gán vào bất kỳ bài học nào</strong> (chỉ nằm trong kho) và có <strong>${stats.progress_count || 0}</strong> bản ghi SRS liên quan.
        `;
        deleteVocabLessonsList.innerHTML = '';
        deleteVocabDangerNote.style.display = 'none';
      }

      btnConfirmDeleteVocab.style.display = 'inline-flex';

    } catch (err) {
      deleteVocabLoading.innerHTML = `<span style="color: red;">Lỗi kiểm tra từ vựng: ${err.message}</span>`;
    }
  }

  document.querySelectorAll('[data-close="modal-delete-vocab"]').forEach(b => {
    b.addEventListener('click', () => modalDeleteVocab.classList.remove('active'));
  });

  btnConfirmDeleteVocab.addEventListener('click', async () => {
    if (!pendingDeleteVocabId) return;
    try {
      btnConfirmDeleteVocab.disabled = true;
      btnConfirmDeleteVocab.textContent = 'Đang xóa...';

      await window.Admin.deleteVocabulary(pendingDeleteVocabId);
      modalDeleteVocab.classList.remove('active');
      showAlert(`Đã xóa vĩnh viễn từ vựng khỏi kho thành công!`, 'success');

      // Nếu xóa làm trang hiện tại vượt quá số trang mới, lùi lại 1 trang
      const newTotal = Math.max(0, totalWords - 1);
      const newMaxPages = Math.ceil(newTotal / pageSize) || 1;
      if (currentPage > newMaxPages) {
        currentPage = newMaxPages;
      }

      saveState();
      await loadVocabulariesList();

    } catch (err) {
      alert(err.message || 'Lỗi khi xóa từ vựng');
    } finally {
      btnConfirmDeleteVocab.disabled = false;
      btnConfirmDeleteVocab.textContent = '🗑️ Xác nhận xóa vĩnh viễn';
    }
  });

  // ===========================================================================
  // 9. NHẬP EXCEL / CSV / TSV THÔNG MINH (SHEETJS + VOCABIMPORTPARSER)
  // ===========================================================================

  const DEFAULT_DROPZONE_SUBTITLE = 'hoặc bấm vào để chọn file từ máy tính';

  let currentImportWorkbook = null;
  let currentImportFileName = '';
  let currentAnalysis = null;
  let currentColumnMapping = {};
  let isMapperExpanded = false;

  function resetImportPreviewState() {
    parsedExcelWords = [];
    skippedExcelRows = [];
    previewContainer.style.display = 'none';
    previewCount.textContent = '0';
    previewTableBody.innerHTML = '';
    if (previewSkippedBox) previewSkippedBox.style.display = 'none';
    if (previewSkippedTitle) previewSkippedTitle.textContent = '';
    if (previewSkippedList) previewSkippedList.innerHTML = '';
    if (btnDownloadSkippedCsv) btnDownloadSkippedCsv.style.display = 'none';
    btnConfirmImport.disabled = true;
    btnConfirmImport.textContent = '🚀 Bắt đầu Nhập Dữ Liệu';
  }

  function resetAllImportAnalysisUi() {
    currentImportWorkbook = null;
    currentImportFileName = '';
    currentAnalysis = null;
    currentColumnMapping = {};
    isMapperExpanded = false;
    if (importSheetSelectorWrap) importSheetSelectorWrap.style.display = 'none';
    if (importSheetSelect) importSheetSelect.innerHTML = '';
    if (importDetectSummary) importDetectSummary.style.display = 'none';
    if (importDetectSummaryText) importDetectSummaryText.textContent = '';
    if (importDetectBadges) importDetectBadges.innerHTML = '';
    if (importDefaultHskWrap) importDefaultHskWrap.style.display = 'none';
    if (importColumnMapperWrap) importColumnMapperWrap.style.display = 'none';
    if (importMapperHead) importMapperHead.innerHTML = '';
    if (importMapperBody) importMapperBody.innerHTML = '';
    resetImportPreviewState();
  }

  function updateMapperVisibility() {
    if (!importColumnMapperWrap) return;
    importColumnMapperWrap.style.display = isMapperExpanded ? 'block' : 'none';
    if (btnToggleColumnMapper) {
      btnToggleColumnMapper.textContent = isMapperExpanded ? '🔼 Ẩn ghép cột' : '🔧 Chỉnh ghép cột';
    }
  }

  function syncDefaultHskControls(shouldApplySuggested = false) {
    if (!importDefaultHskWrap || !importDefaultHskSelect || !currentAnalysis) return;
    const hasHskCol = currentColumnMapping.hsk_level !== null && currentColumnMapping.hsk_level !== undefined;
    if (hasHskCol) {
      importDefaultHskWrap.style.display = 'none';
      return;
    }

    importDefaultHskWrap.style.display = 'block';
    if (shouldApplySuggested) {
      importDefaultHskSelect.value = String(currentAnalysis.suggestedFileHskLevel || 1);
    }

    if (importDefaultHskHint) {
      if (currentAnalysis.hskSuggestedFromFilename) {
        importDefaultHskHint.textContent = `File không có cột Cấp HSK — đã gợi ý HSK ${currentAnalysis.hskSuggestedFromFilename} theo tên file "${currentImportFileName}". Bạn có thể đổi nếu cần.`;
      } else {
        importDefaultHskHint.textContent = 'File không có cột Cấp HSK — cấp độ chọn ở đây sẽ áp dụng cho toàn bộ từ trong file.';
      }
    }
  }

  function renderDetectSummary(analysis) {
    if (!importDetectSummary || !importDetectSummaryText || !importDetectBadges) return;

    importDetectSummary.style.display = 'block';
    importDetectSummaryText.textContent = analysis.summaryNotice || 'Đã phân tích xong dữ liệu.';

    const badges = [];
    if (analysis.metadata && analysis.metadata.sheetName && analysis.metadata.totalSheets > 1) {
      badges.push({ label: `Sheet: ${analysis.metadata.sheetName}`, cls: 'is-highlight' });
    }
    (analysis.summaryBadges || []).forEach(txt => {
      const isWarn = /không có dòng tiêu đề|tiêu đề lạ|1 cột/i.test(txt);
      badges.push({ label: txt, cls: isWarn ? 'is-warn' : 'is-highlight' });
    });

    if (analysis.missingRequired && analysis.missingRequired.length > 0) {
      badges.push({ label: 'Thiếu cột bắt buộc — cần chọn lại', cls: 'is-warn' });
    } else if (analysis.overallConfidence >= 0.85) {
      badges.push({ label: `Độ tin cậy cao (${Math.round(analysis.overallConfidence * 100)}%)`, cls: 'is-highlight' });
    } else {
      badges.push({ label: `Cần kiểm tra ghép cột (${Math.round(analysis.overallConfidence * 100)}%)`, cls: 'is-warn' });
    }

    importDetectBadges.innerHTML = badges
      .map(b => `<span class="import-badge-pill ${b.cls}">${escapeHtml(b.label)}</span>`)
      .join('');
  }

  function renderColumnMapper(analysis) {
    if (!importMapperHead || !importMapperBody || !window.VocabImportParser) return;
    const { FIELD_DEFS } = window.VocabImportParser;
    const colCount = analysis.colCount || 0;

    let headHtml = '<tr>';
    for (let c = 0; c < colCount; c++) {
      const rawHdr = (analysis.hasHeader && analysis.headerCells && analysis.headerCells[c])
        ? analysis.headerCells[c]
        : '';
      const mappedField = FIELD_DEFS.find(f => currentColumnMapping[f.key] === c);
      const selectedKey = mappedField ? mappedField.key : '';

      const optionsHtml = [
        '<option value="">-- Bỏ qua cột này --</option>',
        ...FIELD_DEFS.map(f => {
          const reqMark = f.required ? ' *' : '';
          const isSel = selectedKey === f.key ? ' selected' : '';
          return `<option value="${escapeHtml(f.key)}"${isSel}>${escapeHtml(f.shortLabel + reqMark)}</option>`;
        })
      ].join('');

      headHtml += `
        <th>
          <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Cột ${c + 1}${rawHdr ? `: ${escapeHtml(rawHdr)}` : ' (Không tiêu đề)'}</div>
          <select class="form-control import-mapper-select" data-col-idx="${c}">${optionsHtml}</select>
        </th>
      `;
    }
    headHtml += '</tr>';
    importMapperHead.innerHTML = headHtml;

    // Ràng buộc mỗi vai trò chỉ chọn tối đa 1 cột
    importMapperHead.querySelectorAll('.import-mapper-select').forEach(sel => {
      sel.addEventListener('change', function () {
        const chosenField = this.value;
        if (!chosenField) return;
        importMapperHead.querySelectorAll('.import-mapper-select').forEach(other => {
          if (other !== this && other.value === chosenField) {
            other.value = '';
          }
        });
      });
    });

    const sampleRows = (analysis.previewRows || []).slice(0, 5);
    if (sampleRows.length === 0) {
      importMapperBody.innerHTML = `<tr><td colspan="${Math.max(1, colCount)}" style="text-align: center; color: var(--text-muted);">Không có dòng dữ liệu mẫu.</td></tr>`;
    } else {
      importMapperBody.innerHTML = sampleRows.map(row => {
        let cellsHtml = '';
        for (let c = 0; c < colCount; c++) {
          const rawVal = (Array.isArray(row) && row[c] !== undefined) ? String(row[c]) : '';
          const shortDisplay = rawVal.length > 80 ? rawVal.slice(0, 80) + '…' : rawVal;
          cellsHtml += `<td title="${escapeHtml(rawVal)}">${shortDisplay ? escapeHtml(shortDisplay) : '<span style="color: var(--text-light);">—</span>'}</td>`;
        }
        return `<tr>${cellsHtml}</tr>`;
      }).join('');
    }

    updateMapperVisibility();
  }

  function readMappingFromMapperDom() {
    const nextMapping = {};
    if (window.VocabImportParser && Array.isArray(window.VocabImportParser.FIELD_DEFS)) {
      window.VocabImportParser.FIELD_DEFS.forEach(f => {
        nextMapping[f.key] = null;
      });
    }
    if (!importMapperHead) return nextMapping;

    importMapperHead.querySelectorAll('.import-mapper-select').forEach(sel => {
      const colIdx = parseInt(sel.dataset.colIdx, 10);
      const fieldKey = sel.value;
      if (fieldKey && !isNaN(colIdx) && nextMapping[fieldKey] === null) {
        nextMapping[fieldKey] = colIdx;
      }
    });
    return nextMapping;
  }

  function runExtractionAndPreview() {
    if (!currentAnalysis || !window.VocabImportParser) return;
    const { extractWordsWithMapping } = window.VocabImportParser;

    const missingLabels = [];
    if (currentColumnMapping.hanzi === null || currentColumnMapping.hanzi === undefined) {
      missingLabels.push('Chữ Hán (hanzi)');
    }
    if (currentColumnMapping.pinyin === null || currentColumnMapping.pinyin === undefined) {
      missingLabels.push('Pinyin (phiên âm)');
    }
    if (currentColumnMapping.meaning_vi === null || currentColumnMapping.meaning_vi === undefined) {
      missingLabels.push('Nghĩa tiếng Việt (meaning_vi)');
    }

    if (missingLabels.length > 0) {
      resetImportPreviewState();
      isMapperExpanded = true;
      updateMapperVisibility();
      showImportAlert(
        `Thiếu cột bắt buộc: ${missingLabels.join(', ')}. Hãy chọn cột tương ứng trong bảng "Kiểm tra & ghép cột" phía trên rồi bấm "Áp dụng ghép cột", hoặc bổ sung cột còn thiếu vào file.`
      );
      return;
    }

    const defaultHskLevel = importDefaultHskSelect ? (parseInt(importDefaultHskSelect.value, 10) || 1) : 1;
    const { validWords, skippedRows } = extractWordsWithMapping({
      matrix: currentAnalysis.matrix,
      rowNumbers: currentAnalysis.rowNumbers,
      dataStartIndex: currentAnalysis.dataStartIndex,
      columnMapping: currentColumnMapping,
      defaultHskLevel
    });

    if (validWords.length === 0) {
      resetImportPreviewState();
      if (currentAnalysis.dataRowCount === 0) {
        showImportAlert('File Excel/CSV mới chỉ có dòng tiêu đề, chưa có dòng dữ liệu từ vựng nào!');
      } else {
        const detailPreview = skippedRows.slice(0, 5)
          .map(s => `Dòng ${s.rowNum}: ${s.reason}`)
          .join('; ');
        const extraCount = skippedRows.length > 5 ? ` (và ${skippedRows.length - 5} dòng khác)` : '';
        isMapperExpanded = true;
        updateMapperVisibility();
        showImportAlert(
          skippedRows.length > 0
            ? `Không có từ vựng hợp lệ nào sau khi đọc! Chi tiết: ${detailPreview}${extraCount}. Hãy kiểm tra lại ghép cột phía trên hoặc dữ liệu file.`
            : 'Không tìm thấy từ vựng hợp lệ nào trong file! Hãy kiểm tra lại các cột Chữ Hán, Pinyin và Nghĩa.'
        );
      }
      return;
    }

    parsedExcelWords = validWords;
    skippedExcelRows = skippedRows;
    clearImportAlert();
    renderExcelPreview(parsedExcelWords, skippedExcelRows);
  }

  function applyAnalysisToUi(analysis) {
    currentAnalysis = analysis;

    if (!analysis || analysis.isEmpty) {
      if (importDetectSummary) importDetectSummary.style.display = 'none';
      if (importDefaultHskWrap) importDefaultHskWrap.style.display = 'none';
      if (importColumnMapperWrap) importColumnMapperWrap.style.display = 'none';
      resetImportPreviewState();
      showImportAlert(
        (analysis && analysis.metadata && analysis.metadata.totalSheets > 1)
          ? `Trang tính "${analysis.metadata.sheetName}" đang trống. Hãy chọn trang tính khác ở mục phía trên.`
          : 'File Excel/CSV trống hoặc không chứa dữ liệu nào!'
      );
      return;
    }

    currentColumnMapping = { ...analysis.columnMapping };
    isMapperExpanded = Boolean(analysis.needsConfirmation);

    renderDetectSummary(analysis);
    syncDefaultHskControls(true);
    renderColumnMapper(analysis);
    runExtractionAndPreview();
  }

  function processExcelSheet(requestedSheetName = null) {
    if (!currentImportWorkbook || !window.XLSX || !window.VocabImportParser) return;
    const {
      MAX_IMPORT_ROWS,
      extractSheetRowsFromWorkbook,
      detectAndSplitSingleColumnMatrix,
      analyzeTabularSource
    } = window.VocabImportParser;

    const sheetRes = extractSheetRowsFromWorkbook(window.XLSX, currentImportWorkbook, requestedSheetName);

    if (importSheetSelectorWrap && importSheetSelect) {
      if (sheetRes.sheets.length > 1) {
        importSheetSelect.innerHTML = '';
        sheetRes.sheets.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.name;
          opt.textContent = `${s.name} (${s.dataRowCount.toLocaleString('vi-VN')} dòng có dữ liệu)`;
          if (s.name === sheetRes.selectedSheet) opt.selected = true;
          importSheetSelect.appendChild(opt);
        });
        importSheetSelectorWrap.style.display = 'block';
      } else {
        importSheetSelectorWrap.style.display = 'none';
        importSheetSelect.innerHTML = '';
      }
    }

    const splitRes = detectAndSplitSingleColumnMatrix(sheetRes.matrix, sheetRes.rowNumbers);

    if (splitRes.matrix.length > MAX_IMPORT_ROWS) {
      if (importDetectSummary) importDetectSummary.style.display = 'none';
      if (importDefaultHskWrap) importDefaultHskWrap.style.display = 'none';
      if (importColumnMapperWrap) importColumnMapperWrap.style.display = 'none';
      resetImportPreviewState();
      showImportAlert(`Trang tính "${sheetRes.selectedSheet}" có ${splitRes.matrix.length.toLocaleString('vi-VN')} dòng, vượt quá giới hạn ${MAX_IMPORT_ROWS.toLocaleString('vi-VN')} dòng/lần để đảm bảo trình duyệt ổn định. Vui lòng chia nhỏ file.`);
      return;
    }

    const analysis = analyzeTabularSource({
      matrix: splitRes.matrix,
      rowNumbers: splitRes.rowNumbers,
      fileName: currentImportFileName,
      metadata: {
        sheetName: sheetRes.selectedSheet,
        totalSheets: sheetRes.sheets.length,
        delimiter: splitRes.detectedDelimiter,
        splitFromSingleColumn: splitRes.splitFromSingleColumn,
        mergedCellAppliedCount: sheetRes.mergedCellAppliedCount
      }
    });

    applyAnalysisToUi(analysis);
  }

  function clearLessonLoadError() {
    if (importLessonLoadError) importLessonLoadError.style.display = 'none';
    if (importLessonLoadErrorText) importLessonLoadErrorText.textContent = '';
  }

  function resetLessonSelectPlaceholder(text) {
    selectAssignLesson.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = text;
    selectAssignLesson.appendChild(opt);
    selectAssignLesson.disabled = true;
  }

  async function loadLessonsForImportCurriculum(curId) {
    clearLessonLoadError();

    if (!curId) {
      resetLessonSelectPlaceholder('-- Không gán bài (Chỉ lưu vào kho) --');
      return;
    }

    resetLessonSelectPlaceholder('Đang tải...');

    try {
      const lessons = await window.Admin.getLessonsByCurriculum(curId);
      // Bỏ qua kết quả cũ nếu người dùng vừa chuyển sang giáo trình khác
      if (selectAssignCurriculum.value !== curId) return;

      if (!lessons || lessons.length === 0) {
        resetLessonSelectPlaceholder('Giáo trình này chưa có bài học');
        return;
      }

      const sortedLessons = [...lessons].sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));

      selectAssignLesson.innerHTML = '';
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = '-- Chọn bài học cụ thể (Tùy chọn) --';
      selectAssignLesson.appendChild(defaultOpt);

      sortedLessons.forEach(l => {
        const opt = document.createElement('option');
        const label = `Bài ${l.order_index}: ${l.title_zh || ''} (${l.title_vi || ''})`.trim();
        const count = Number(l.vocab_count || 0);
        opt.value = l.id;
        opt.dataset.lessonLabel = label;
        opt.dataset.vocabCount = String(count);
        opt.textContent = `${label} — ${count} từ`;
        selectAssignLesson.appendChild(opt);
      });

      selectAssignLesson.disabled = false;
    } catch (e) {
      console.error('Lỗi tải bài học cho modal import:', e);
      if (selectAssignCurriculum.value !== curId) return;

      resetLessonSelectPlaceholder('Lỗi tải bài học (vẫn có thể nhập vào kho)');
      if (importLessonLoadError && importLessonLoadErrorText) {
        importLessonLoadErrorText.textContent = `Không tải được danh sách bài học: ${e.message || 'Lỗi kết nối cơ sở dữ liệu'}.`;
        importLessonLoadError.style.display = 'flex';
      }
    }
  }

  btnOpenImportExcel.addEventListener('click', async () => {
    clearImportAlert();
    resetAllImportAnalysisUi();
    clearLessonLoadError();
    if (excelFileInput) excelFileInput.value = '';
    if (excelSelectedFileEl) excelSelectedFileEl.textContent = DEFAULT_DROPZONE_SUBTITLE;
    modalImportExcel.classList.add('active');

    selectAssignCurriculum.innerHTML = '<option value="">Đang tải giáo trình...</option>';
    resetLessonSelectPlaceholder('-- Hãy chọn giáo trình trước --');

    try {
      const curriculums = await window.Admin.getCurriculums();
      selectAssignCurriculum.innerHTML = '';
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '-- Không gán (chỉ lưu vào kho chung) --';
      selectAssignCurriculum.appendChild(emptyOpt);

      (curriculums || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.title} (${c.level})`;
        selectAssignCurriculum.appendChild(opt);
      });
    } catch (e) {
      console.error('Lỗi tải giáo trình cho modal import:', e);
      selectAssignCurriculum.innerHTML = '<option value="">-- Không gán (lỗi tải giáo trình) --</option>';
      if (importLessonLoadError && importLessonLoadErrorText) {
        importLessonLoadErrorText.textContent = `Không tải được danh sách giáo trình: ${e.message || 'Lỗi kết nối'}. Bạn vẫn có thể import từ vào kho.`;
        importLessonLoadError.style.display = 'flex';
      }
    }
  });

  document.querySelectorAll('[data-close="modal-import-excel"]').forEach(b => {
    b.addEventListener('click', () => modalImportExcel.classList.remove('active'));
  });

  // Đổi giáo trình/bài học KHÔNG được chạy lại parse hay làm mất dữ liệu xem trước đã đọc
  selectAssignCurriculum.addEventListener('change', function () {
    loadLessonsForImportCurriculum(selectAssignCurriculum.value);
  });

  if (btnRetryLoadLessons) {
    btnRetryLoadLessons.addEventListener('click', function () {
      loadLessonsForImportCurriculum(selectAssignCurriculum.value);
    });
  }

  if (importSheetSelect) {
    importSheetSelect.addEventListener('change', function () {
      if (currentImportWorkbook) {
        clearImportAlert();
        processExcelSheet(importSheetSelect.value);
      }
    });
  }

  if (btnToggleColumnMapper) {
    btnToggleColumnMapper.addEventListener('click', function () {
      isMapperExpanded = !isMapperExpanded;
      updateMapperVisibility();
    });
  }

  if (btnApplyColumnMapping) {
    btnApplyColumnMapping.addEventListener('click', function () {
      if (!currentAnalysis) return;
      currentColumnMapping = readMappingFromMapperDom();
      syncDefaultHskControls(false);
      runExtractionAndPreview();
    });
  }

  if (importDefaultHskSelect) {
    importDefaultHskSelect.addEventListener('change', function () {
      if (currentAnalysis) {
        runExtractionAndPreview();
      }
    });
  }

  if (btnDownloadSkippedCsv) {
    btnDownloadSkippedCsv.addEventListener('click', function () {
      if (!skippedExcelRows || skippedExcelRows.length === 0 || !window.VocabImportParser) return;
      const csvContent = window.VocabImportParser.buildSkippedRowsCsv(skippedExcelRows);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dong_loi_nhap_tu_vung.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  // Kéo thả và Chọn file Excel/CSV/TSV
  excelDropzone.addEventListener('click', (e) => {
    if (e.target === excelFileInput) return;
    excelFileInput.click();
  });

  excelDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    excelDropzone.classList.add('dragover');
  });

  excelDropzone.addEventListener('dragleave', () => {
    excelDropzone.classList.remove('dragover');
  });

  excelDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    excelDropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedExcelFile(e.dataTransfer.files[0]);
    }
  });

  excelFileInput.addEventListener('change', (e) => {
    const selectedFile = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    // Reset input value để nếu người dùng sửa lại cùng một file vẫn kích hoạt change
    excelFileInput.value = '';
    if (selectedFile) {
      handleSelectedExcelFile(selectedFile);
    }
  });

  function handleSelectedExcelFile(file) {
    // Luôn xóa trạng thái lỗi, nhận diện và xem trước cũ trước khi đọc file mới
    clearImportAlert();
    resetAllImportAnalysisUi();

    if (!window.XLSX || !window.VocabImportParser) {
      showImportAlert('Bộ đọc Excel/CSV chưa được nạp đầy đủ, vui lòng tải lại trang!');
      return;
    }

    const {
      MAX_FILE_SIZE_BYTES,
      MAX_IMPORT_ROWS,
      decodeTextBuffer,
      detectDelimiter,
      parseDelimitedText,
      detectAndSplitSingleColumnMatrix,
      analyzeTabularSource
    } = window.VocabImportParser;

    const fileName = String(file.name || '').trim();
    const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
    if (!['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
      if (excelSelectedFileEl) excelSelectedFileEl.textContent = DEFAULT_DROPZONE_SUBTITLE;
      showImportAlert('Định dạng file không hỗ trợ! Vui lòng chọn file .xlsx, .xls, .csv hoặc .tsv.');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      if (excelSelectedFileEl) excelSelectedFileEl.textContent = DEFAULT_DROPZONE_SUBTITLE;
      showImportAlert(`File "${fileName}" có dung lượng ${sizeMb} MB, vượt quá giới hạn tối đa 5 MB để bảo vệ trình duyệt. Vui lòng tách thành nhiều file nhỏ.`);
      return;
    }

    currentImportFileName = fileName;
    if (excelSelectedFileEl) {
      excelSelectedFileEl.textContent = `⏳ Đang phân tích: ${fileName}`;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        if (excelSelectedFileEl) {
          excelSelectedFileEl.textContent = `Đã chọn: ${fileName}`;
        }

        if (ext === 'csv' || ext === 'tsv') {
          const decoded = decodeTextBuffer(e.target.result);
          const delimRes = detectDelimiter(decoded.text, ext === 'tsv' ? '\t' : null);

          let matrix = delimRes.matrix;
          let rowNumbers = delimRes.rowNumbers;
          let delimiterUsed = delimRes.delimiter;
          let splitSingle = false;

          if ((!matrix || matrix.length === 0) && decoded.text.trim() !== '') {
            // Dự phòng nếu toàn bộ CSV chỉ có 1 cột (vd thiếu dấu phân cách hoặc gói ngoặc kép cả dòng)
            const fallbackParsed = parseDelimitedText(decoded.text, ext === 'tsv' ? '\t' : ',');
            const singleCheck = detectAndSplitSingleColumnMatrix(fallbackParsed.rows, fallbackParsed.rowStartLines);
            matrix = singleCheck.matrix;
            rowNumbers = singleCheck.rowNumbers;
            splitSingle = singleCheck.splitFromSingleColumn;
            delimiterUsed = singleCheck.detectedDelimiter;
          }

          if (matrix && matrix.length > MAX_IMPORT_ROWS) {
            showImportAlert(`File "${fileName}" có ${matrix.length.toLocaleString('vi-VN')} dòng, vượt quá giới hạn ${MAX_IMPORT_ROWS.toLocaleString('vi-VN')} dòng/lần để đảm bảo trình duyệt ổn định.`);
            return;
          }

          const analysis = analyzeTabularSource({
            matrix: matrix || [],
            rowNumbers: rowNumbers || [],
            fileName,
            metadata: {
              encoding: decoded.encoding,
              delimiter: delimiterUsed,
              splitFromSingleColumn: splitSingle,
              mergedCellAppliedCount: 0
            }
          });
          applyAnalysisToUi(analysis);
        } else {
          const data = new Uint8Array(e.target.result);
          const workbook = window.XLSX.read(data, { type: 'array', codepage: 65001 });
          if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
            showImportAlert('File Excel trống hoặc không chứa sheet dữ liệu nào!');
            return;
          }
          currentImportWorkbook = workbook;
          processExcelSheet(null);
        }
      } catch (err) {
        console.error('Lỗi đọc file Excel/CSV:', err);
        resetAllImportAnalysisUi();
        showImportAlert('Không thể đọc file Excel/CSV này. Vui lòng kiểm tra lại file không bị hỏng hoặc mật khẩu bảo vệ!');
      }
    };
    reader.onerror = function () {
      if (excelSelectedFileEl) excelSelectedFileEl.textContent = DEFAULT_DROPZONE_SUBTITLE;
      resetAllImportAnalysisUi();
      showImportAlert('Không thể đọc file từ máy tính. Vui lòng thử lại!');
    };
    reader.readAsArrayBuffer(file);
  }

  function renderExcelPreview(words, skippedRows = []) {
    if (!Array.isArray(words) || words.length === 0) {
      resetImportPreviewState();
      return;
    }

    // Tuyệt đối không để khung đỏ còn hiển thị khi bảng xem trước có từ hợp lệ
    clearImportAlert();

    previewContainer.style.display = 'block';
    previewCount.textContent = words.length;

    const previewRows = words.slice(0, 10);
    previewTableBody.innerHTML = previewRows.map(w => `
      <tr>
        <td style="text-align: center; font-weight: 700; color: var(--text-muted);">${escapeHtml(w.sort_order)}</td>
        <td style="font-weight: 700; color: var(--primary); font-size: 16px;">${escapeHtml(w.hanzi)}</td>
        <td>${escapeHtml(w.pinyin)}</td>
        <td>${escapeHtml(w.meaning_vi)}</td>
        <td><span class="badge-hsk badge-hsk-${escapeHtml(w.hsk_level)}">HSK ${escapeHtml(w.hsk_level)}</span></td>
      </tr>
    `).join('');

    if (previewSkippedBox && previewSkippedTitle && previewSkippedList) {
      if (skippedRows.length > 0) {
        previewSkippedTitle.textContent = `⚠️ Đã bỏ qua ${skippedRows.length} dòng không hợp lệ / trùng trong file:`;
        const maxDisplay = 20;
        const itemsHtml = skippedRows.slice(0, maxDisplay).map(s =>
          `<li>Dòng ${escapeHtml(s.rowNum)}${s.hanzi ? ` (${escapeHtml(s.hanzi)})` : ''}: ${escapeHtml(s.reason)}</li>`
        ).join('');
        const extraHtml = skippedRows.length > maxDisplay
          ? `<li>... và ${skippedRows.length - maxDisplay} dòng khác.</li>`
          : '';
        previewSkippedList.innerHTML = itemsHtml + extraHtml;
        if (btnDownloadSkippedCsv) btnDownloadSkippedCsv.style.display = 'inline-flex';
        previewSkippedBox.style.display = 'block';
      } else {
        previewSkippedBox.style.display = 'none';
        previewSkippedTitle.textContent = '';
        previewSkippedList.innerHTML = '';
        if (btnDownloadSkippedCsv) btnDownloadSkippedCsv.style.display = 'none';
      }
    }

    btnConfirmImport.disabled = false;
    btnConfirmImport.textContent = `🚀 Bắt đầu Nhập ${words.length} Từ Vựng`;
  }

  btnConfirmImport.addEventListener('click', async function () {
    if (!parsedExcelWords || parsedExcelWords.length === 0) return;

    clearImportAlert();
    const hasSelectedLesson = !selectAssignLesson.disabled && Boolean(selectAssignLesson.value);
    const assignLessonId = hasSelectedLesson ? selectAssignLesson.value : null;
    const selectedOpt = hasSelectedLesson && selectAssignLesson.selectedOptions ? selectAssignLesson.selectedOptions[0] : null;
    const selectedLessonLabel = selectedOpt
      ? (selectedOpt.dataset.lessonLabel || selectedOpt.textContent)
      : '';

    try {
      btnConfirmImport.disabled = true;
      btnConfirmImport.textContent = `⏳ Đang nhập ${parsedExcelWords.length} từ...`;

      const result = await window.Admin.batchImportVocabularies(parsedExcelWords, assignLessonId);
      const totalSkipped = skippedExcelRows.length + Number(result.skipped_count || 0);

      // Cập nhật số từ của bài học ngay trên dropdown giao diện
      if (assignLessonId && selectedOpt && result.lesson_vocab_count !== null) {
        const newCount = Number(result.lesson_vocab_count);
        selectedOpt.dataset.vocabCount = String(newCount);
        selectedOpt.textContent = `${selectedLessonLabel} — ${newCount} từ`;
      }

      let summaryMsg = `Đã thêm ${result.inserted_count} từ mới, cập nhật ${result.updated_count} từ, bỏ qua ${totalSkipped} dòng lỗi`;
      if (assignLessonId) {
        summaryMsg += `, gán ${result.lesson_added_count} từ vào bài ${selectedLessonLabel}`;
        if (result.lesson_vocab_count !== null) {
          summaryMsg += ` (bài hiện có ${result.lesson_vocab_count} từ`;
          if (result.lesson_already_in_count > 0) {
            summaryMsg += `, ${result.lesson_already_in_count} từ đã có sẵn trong bài`;
          }
          summaryMsg += ')';
        }
      } else {
        summaryMsg += ' (chỉ lưu vào kho, chưa gán bài)';
      }

      modalImportExcel.classList.remove('active');
      showAlert(`🎉 ${summaryMsg}`, 'success');

      // Tải lại trang 1 để xem các từ mới nhập và cập nhật tổng số từ trong kho
      currentPage = 1;
      saveState();
      await loadVocabulariesList();

    } catch (err) {
      console.error('Lỗi khi import từ vựng:', err);
      showImportAlert(err.message || 'Lỗi khi nhập dữ liệu. Vui lòng thử lại!');
    } finally {
      btnConfirmImport.disabled = !parsedExcelWords || parsedExcelWords.length === 0;
      btnConfirmImport.textContent = (parsedExcelWords && parsedExcelWords.length > 0)
        ? `🚀 Bắt đầu Nhập ${parsedExcelWords.length} Từ Vựng`
        : '🚀 Bắt đầu Nhập Dữ Liệu';
    }
  });

  // Sự kiện tải file mẫu CSV
  const btnDownloadSampleCsv = document.getElementById('btn-download-sample-csv');
  if (btnDownloadSampleCsv) {
    btnDownloadSampleCsv.addEventListener('click', function () {
      const sampleContent = "\uFEFF" +
`hanzi,pinyin,meaning_vi,hsk_level,part_of_speech,example_hanzi,example_pinyin,example_vi
你好,nǐ hǎo,Xin chào,1,Thán từ,你好！很高兴认识你。,Nǐ hǎo! Hěn gāoxìng rènshí nǐ.,Xin chào! Rất vui được gặp bạn.
准备,zhǔnbèi,Chuẩn bị,2,Động từ,我准备好了。,Wǒ zhǔnbèi hǎo le.,Tôi đã chuẩn bị xong rồi.
打算,dǎsuàn,Dự định,3,Động từ,你周末有什么打算？,Nǐ zhōumò yǒu shénme dǎsuàn?,Cuối tuần bạn có dự định gì?
坚持,jiānchí,Kiên trì,4,Động từ,坚持就是胜利。,Jiānchí jiùshì shènglì.,Kiên trì chính là thắng lợi.
综合,zōnghé,Tổng hợp,5,Tính từ,这是一门综合课程。,Zhè shì yī mén zōnghé kèchéng.,Đây là một môn học tổng hợp.
抽象,chōuxiàng,Trừu tượng,6,Tính từ,这个问题太抽象了。,Zhè ge wèntí tài chōuxiàng le.,Vấn đề này quá trừu tượng rồi.
阐述,chǎnshù,Làm sáng tỏ / Trình bày rõ ràng,7,Động từ,请阐述你的观点。,Qǐng chǎnshù nǐ de guāndiǎn.,Xin hãy trình bày rõ quan điểm của bạn.
渊博,yuānbó,Uyên bác / Sâu rộng,8,Tính từ,他学识渊博，令人敬佩。,Tā xuéshí yuānbó, lìng rén jìngpèi.,Học thức của ông ấy uyên bác, khiến người ta kính nể.
韬光养晦,tāoguāng-yǎnghuì,Giấu tài chờ thời / Khiêm tốn kín đáo,9,Thành ngữ,在逆境中需要懂得韬光养晦。,Zài nìjìng zhōng xūyào dǒngdé tāoguāng-yǎnghuì.,Trong nghịch cảnh cần biết khiêm tốn giấu tài chờ thời.`;

      const blob = new Blob([sampleContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      btnDownloadSampleCsv.setAttribute('href', url);
    });
  }

  // ===========================================================================
  // 10. KHỞI CHẠY BAN ĐẦU
  // ===========================================================================

  loadState();
  await loadVocabulariesList();
});
