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
  // 9. NHẬP EXCEL / CSV BẰNG SHEETJS
  // ===========================================================================

  const DEFAULT_DROPZONE_SUBTITLE = 'hoặc bấm vào để chọn file từ máy tính';

  const EXCEL_COLUMN_ALIASES = {
    hanzi: [
      'hanzi', 'chu han', 'chuhan', 'han tu', 'hantu', 'tu vung', 'tuvung', 'word', 'chinese'
    ],
    pinyin: [
      'pinyin', 'phien am', 'phienam', 'binh am', 'binham', 'am doc'
    ],
    meaning_vi: [
      'meaning_vi', 'meaning vi', 'meaning', 'nghia', 'nghia tieng viet', 'dich nghia', 'tieng viet'
    ],
    hsk_level: [
      'hsk_level', 'hsk level', 'hsk', 'cap do', 'cap do hsk', 'level', 'cap'
    ],
    part_of_speech: [
      'part_of_speech', 'part of speech', 'tu loai', 'tuloai', 'loai tu', 'pos', 'type'
    ],
    example_hanzi: [
      'example_hanzi', 'example hanzi', 'vi du', 'vidu', 'cau vi du', 'vi du han tu', 'example'
    ],
    example_pinyin: [
      'example_pinyin', 'example pinyin', 'phien am vi du', 'pinyin vi du'
    ],
    example_vi: [
      'example_vi', 'example vi', 'nghia vi du', 'dich vi du', 'nghia cau', 'nghia cau vi du'
    ],
    sort_order: [
      'sort_order', 'sort order', 'stt', 'tt', 'no.', 'no', 'thu tu', 'so thu tu', 'order'
    ]
  };

  function stripVietnameseAccents(str) {
    return String(str ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .normalize('NFC');
  }

  function normalizeHeaderToken(str) {
    return stripVietnameseAccents(
      String(str ?? '')
        .replace(/^\uFEFF+/, '')
        .normalize('NFC')
    )
      .toLowerCase()
      .replace(/[:*]+$/g, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchHeaderToField(rawHeader) {
    const rawStr = String(rawHeader ?? '').replace(/^\uFEFF+/, '').trim();
    if (!rawStr || rawStr.startsWith('__EMPTY')) return null;

    // Xây dựng danh sách ứng viên ưu tiên: toàn chuỗi -> bỏ ngoặc đơn -> trong ngoặc đơn -> tách theo '/'
    const candidateGroups = [];
    const fullNorm = normalizeHeaderToken(rawStr);
    if (fullNorm) candidateGroups.push([fullNorm, fullNorm.replace(/\s+/g, '_')]);

    const parenMatch = rawStr.match(/^(.+?)\(([^)]+)\)\s*[:*]*\s*$/);
    if (parenMatch) {
      const outside = normalizeHeaderToken(parenMatch[1]);
      const inside = normalizeHeaderToken(parenMatch[2]);
      if (outside) candidateGroups.push([outside, outside.replace(/\s+/g, '_')]);
      if (inside) candidateGroups.push([inside, inside.replace(/\s+/g, '_')]);
    }

    if (rawStr.includes('/') || rawStr.includes('|')) {
      rawStr.split(/[\/|]+/).forEach(part => {
        const p = normalizeHeaderToken(part);
        if (p) candidateGroups.push([p, p.replace(/\s+/g, '_')]);
      });
    }

    for (const candidates of candidateGroups) {
      for (const [field, aliases] of Object.entries(EXCEL_COLUMN_ALIASES)) {
        if (candidates.some(c => aliases.includes(c))) {
          return field;
        }
      }
    }
    return null;
  }

  function resolveExcelColumnMap(rawRows, headerRowCells = []) {
    const seenHeaderKeys = new Set();
    const headerKeys = [];

    (headerRowCells || []).forEach(cell => {
      const key = String(cell ?? '').replace(/^\uFEFF+/, '').trim();
      if (key && !seenHeaderKeys.has(key)) {
        seenHeaderKeys.add(key);
        headerKeys.push(key);
      }
    });

    (rawRows || []).forEach(row => {
      if (!row || typeof row !== 'object') return;
      Object.keys(row).forEach(k => {
        if (k && !k.startsWith('__EMPTY') && !seenHeaderKeys.has(k)) {
          seenHeaderKeys.add(k);
          headerKeys.push(k);
        }
      });
    });

    const columnMap = {};
    for (const rawKey of headerKeys) {
      const field = matchHeaderToField(rawKey);
      if (field && !columnMap[field]) {
        columnMap[field] = rawKey;
      }
    }
    return { columnMap, headerKeys };
  }

  function getMappedCellVal(row, mappedKey, fieldAliases) {
    if (mappedKey && Object.prototype.hasOwnProperty.call(row, mappedKey)) {
      return String(row[mappedKey] ?? '').replace(/^\uFEFF/, '').trim();
    }
    // Dự phòng nếu một dòng sau có khóa header biến thể khác
    for (const rowKey in row) {
      if (!Object.prototype.hasOwnProperty.call(row, rowKey)) continue;
      if (matchHeaderToField(rowKey) === fieldAliases) {
        return String(row[rowKey] ?? '').replace(/^\uFEFF/, '').trim();
      }
    }
    return '';
  }

  function parseStrictHskLevel(rawVal) {
    const trimmed = String(rawVal ?? '').trim();
    if (!trimmed) return { valid: true, value: 1 };
    const m = stripVietnameseAccents(trimmed)
      .toLowerCase()
      .match(/^(?:(?:hsk|cap do|cap|level)\s*[_:-]?\s*)?(-?\d+)$/i);
    if (!m) return { valid: false, raw: trimmed };
    const lvl = parseInt(m[1], 10);
    if (!Number.isInteger(lvl) || lvl < 1 || lvl > 9) {
      return { valid: false, raw: trimmed };
    }
    return { valid: true, value: lvl };
  }

  function resetImportPreviewState() {
    parsedExcelWords = [];
    skippedExcelRows = [];
    previewContainer.style.display = 'none';
    previewCount.textContent = '0';
    previewTableBody.innerHTML = '';
    if (previewSkippedBox) previewSkippedBox.style.display = 'none';
    if (previewSkippedTitle) previewSkippedTitle.textContent = '';
    if (previewSkippedList) previewSkippedList.innerHTML = '';
    btnConfirmImport.disabled = true;
    btnConfirmImport.textContent = '🚀 Bắt đầu Nhập Dữ Liệu';
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
    resetImportPreviewState();
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

  // Kéo thả và Chọn file Excel/CSV
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

  function decodeCsvBufferToUtf8String(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let text;
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      text = new TextDecoder('utf-16le').decode(bytes);
    } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      text = new TextDecoder('utf-16be').decode(bytes);
    } else {
      text = new TextDecoder('utf-8').decode(bytes);
    }
    return text.replace(/^\uFEFF+/, '');
  }

  function handleSelectedExcelFile(file) {
    // Luôn xóa trạng thái lỗi và xem trước cũ trước khi đọc file mới
    clearImportAlert();
    resetImportPreviewState();

    if (!window.XLSX) {
      showImportAlert('Thư viện SheetJS chưa được nạp, vui lòng tải lại trang!');
      return;
    }

    const fileName = String(file.name || '').trim();
    const ext = fileName.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      if (excelSelectedFileEl) excelSelectedFileEl.textContent = DEFAULT_DROPZONE_SUBTITLE;
      showImportAlert('Định dạng file không hỗ trợ! Vui lòng chọn file .xlsx, .xls hoặc .csv.');
      return;
    }

    if (excelSelectedFileEl) {
      excelSelectedFileEl.textContent = `Đã chọn: ${fileName}`;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        let workbook;
        if (ext === 'csv') {
          const csvText = decodeCsvBufferToUtf8String(e.target.result);
          workbook = window.XLSX.read(csvText, { type: 'string' });
        } else {
          const data = new Uint8Array(e.target.result);
          workbook = window.XLSX.read(data, { type: 'array', codepage: 65001 });
        }

        if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
          showImportAlert('File Excel trống hoặc không chứa sheet dữ liệu nào!');
          return;
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const matrixRows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        let headerIdx = Array.isArray(matrixRows)
          ? matrixRows.findIndex(r => Array.isArray(r) && r.some(c => String(c ?? '').trim() !== ''))
          : -1;

        if (headerIdx >= 0) {
          const firstCandidate = resolveExcelColumnMap([], matrixRows[headerIdx]).columnMap;
          if (!firstCandidate.hanzi || !firstCandidate.pinyin || !firstCandidate.meaning_vi) {
            for (let i = headerIdx + 1; i < Math.min(matrixRows.length, headerIdx + 5); i++) {
              if (!Array.isArray(matrixRows[i])) continue;
              const candidate = resolveExcelColumnMap([], matrixRows[i]).columnMap;
              if (candidate.hanzi && candidate.pinyin && candidate.meaning_vi) {
                headerIdx = i;
                break;
              }
            }
          }
        }

        const headerRowCells = headerIdx >= 0 ? matrixRows[headerIdx] : [];
        let sheetJsonOpts = { defval: '' };
        if (headerIdx > 0 && worksheet['!ref']) {
          const decodedRef = window.XLSX.utils.decode_range(worksheet['!ref']);
          sheetJsonOpts = { defval: '', range: decodedRef.s.r + headerIdx };
        }
        const rawRows = window.XLSX.utils.sheet_to_json(worksheet, sheetJsonOpts);

        const { columnMap } = resolveExcelColumnMap(rawRows, headerRowCells);

        // Kiểm tra cột bắt buộc trước
        const missingCols = [];
        if (!columnMap.hanzi) missingCols.push('Chữ Hán (hanzi / chữ hán / hán tự)');
        if (!columnMap.pinyin) missingCols.push('Pinyin (pinyin / phiên âm)');
        if (!columnMap.meaning_vi) missingCols.push('Nghĩa (meaning_vi / nghĩa / nghĩa tiếng việt)');

        if (missingCols.length > 0) {
          showImportAlert(`Thiếu cột bắt buộc trong file: ${missingCols.join(', ')}.`);
          return;
        }

        if (!rawRows || rawRows.length === 0) {
          showImportAlert('File Excel/CSV mới chỉ có dòng tiêu đề, chưa có dòng dữ liệu từ vựng nào!');
          return;
        }

        const { validWords, skippedRows } = normalizeExcelRows(rawRows, columnMap);

        if (validWords.length === 0) {
          const detailPreview = skippedRows.slice(0, 5)
            .map(s => `Dòng ${s.rowNum}: ${s.reason}`)
            .join('; ');
          const extraCount = skippedRows.length > 5 ? ` (và ${skippedRows.length - 5} dòng khác)` : '';
          showImportAlert(
            skippedRows.length > 0
              ? `Không tìm thấy từ vựng hợp lệ nào trong file! Chi tiết dòng lỗi: ${detailPreview}${extraCount}.`
              : 'Không tìm thấy từ vựng hợp lệ nào trong file! Hãy kiểm tra lại dữ liệu các cột Chữ Hán, Pinyin và Nghĩa.'
          );
          return;
        }

        parsedExcelWords = validWords;
        skippedExcelRows = skippedRows;
        clearImportAlert();
        renderExcelPreview(parsedExcelWords, skippedExcelRows);

      } catch (err) {
        console.error('Lỗi đọc file Excel:', err);
        resetImportPreviewState();
        showImportAlert('Không thể đọc file Excel/CSV này. Vui lòng kiểm tra lại định dạng file!');
      }
    };
    reader.onerror = function () {
      resetImportPreviewState();
      showImportAlert('Không thể đọc file từ máy tính. Vui lòng thử lại!');
    };
    reader.readAsArrayBuffer(file);
  }

  function normalizeExcelRows(rows, columnMap) {
    const validWords = [];
    const skippedRows = [];
    const seenKeys = new Set();
    let validCounter = 0;

    rows.forEach((r, idx) => {
      if (!r || typeof r !== 'object') return;
      const rowNum = typeof r.__rowNum__ === 'number' ? (r.__rowNum__ + 1) : (idx + 2);

      // Bỏ qua các dòng hoàn toàn trống ở cuối sheet
      const hasAnyValue = Object.keys(r).some(k => !k.startsWith('__EMPTY') && String(r[k] ?? '').trim() !== '');
      if (!hasAnyValue) return;

      const hanzi = getMappedCellVal(r, columnMap.hanzi, 'hanzi').normalize('NFC');
      const pinyin = getMappedCellVal(r, columnMap.pinyin, 'pinyin').normalize('NFC');
      const meaningVi = getMappedCellVal(r, columnMap.meaning_vi, 'meaning_vi').normalize('NFC');
      const hskRaw = getMappedCellVal(r, columnMap.hsk_level, 'hsk_level');
      const parsedHsk = parseStrictHskLevel(hskRaw);

      const reasons = [];
      if (!hanzi) reasons.push('chữ Hán rỗng');
      if (!pinyin) reasons.push('pinyin rỗng');
      if (!meaningVi) reasons.push('nghĩa rỗng');
      if (!parsedHsk.valid) reasons.push(`cấp HSK "${parsedHsk.raw}" ngoài 1–9`);

      if (reasons.length > 0) {
        skippedRows.push({
          rowNum,
          hanzi,
          reason: reasons.join(', ')
        });
        return;
      }

      const hskLevel = parsedHsk.value;
      const dupKey = `${hanzi}_${hskLevel}`;
      if (seenKeys.has(dupKey)) {
        skippedRows.push({
          rowNum,
          hanzi,
          reason: `trùng từ "${hanzi}" (HSK ${hskLevel}) trong file`
        });
        return;
      }
      seenKeys.add(dupKey);

      const partOfSpeech = getMappedCellVal(r, columnMap.part_of_speech, 'part_of_speech');
      const exampleHanzi = getMappedCellVal(r, columnMap.example_hanzi, 'example_hanzi');
      const examplePinyin = getMappedCellVal(r, columnMap.example_pinyin, 'example_pinyin');
      const exampleVi = getMappedCellVal(r, columnMap.example_vi, 'example_vi');
      const explicitOrderRaw = getMappedCellVal(r, columnMap.sort_order, 'sort_order');
      const explicitOrder = /^\d+$/.test(explicitOrderRaw) ? parseInt(explicitOrderRaw, 10) : NaN;

      validCounter++;
      const sortOrder = (!isNaN(explicitOrder) && explicitOrder > 0) ? explicitOrder : validCounter;

      validWords.push({
        hanzi,
        pinyin,
        meaning_vi: meaningVi,
        hsk_level: hskLevel,
        part_of_speech: partOfSpeech || null,
        example_hanzi: exampleHanzi || null,
        example_pinyin: examplePinyin || null,
        example_vi: exampleVi || null,
        sort_order: sortOrder
      });
    });

    return { validWords, skippedRows };
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
        previewSkippedBox.style.display = 'block';
      } else {
        previewSkippedBox.style.display = 'none';
        previewSkippedTitle.textContent = '';
        previewSkippedList.innerHTML = '';
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
