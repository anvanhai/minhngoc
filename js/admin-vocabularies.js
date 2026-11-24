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
  let searchDebounceTimer = null;

  // DOM Elements
  const pageAlert = document.getElementById('page-alert');
  const searchInput = document.getElementById('search-vocab-input');
  const filterHsk = document.getElementById('filter-hsk-level');
  const filterPartOfSpeech = document.getElementById('filter-part-of-speech');
  const btnSearch = document.getElementById('btn-search-vocab');
  const btnExportExcel = document.getElementById('btn-export-excel');
  const vocabTableBody = document.getElementById('vocab-table-body');
  const hskTabs = document.querySelectorAll('.btn-hsk-tab');

  // Modal Excel
  const modalImportExcel = document.getElementById('modal-import-excel');
  const btnOpenImportExcel = document.getElementById('btn-open-import-excel');
  const excelDropzone = document.getElementById('excel-dropzone');
  const excelFileInput = document.getElementById('excel-file-input');
  const selectAssignCurriculum = document.getElementById('import-assign-curriculum');
  const selectAssignLesson = document.getElementById('import-assign-lesson');
  const previewContainer = document.getElementById('preview-container');
  const previewCount = document.getElementById('preview-count');
  const previewTableBody = document.getElementById('preview-table-body');
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
        search: searchInput ? searchInput.value : ''
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
        <tr><td colspan="7" style="text-align: center; padding: 40px 16px; color: var(--text-muted);">
          <div style="font-size: 26px; margin-bottom: 8px;">⏳</div>
          <div style="font-size: 14px; font-weight: 500;">Đang tải danh sách từ vựng (Trang ${currentPage})...</div>
        </td></tr>
      `;

      const search = searchInput ? searchInput.value.trim() : '';
      const hskLevel = filterHsk ? filterHsk.value : 'all';
      const partOfSpeech = filterPartOfSpeech ? filterPartOfSpeech.value : 'all';

      const result = await window.Admin.getVocabularies({
        search,
        hskLevel,
        partOfSpeech,
        limit: pageSize,
        page: currentPage
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
          <tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-muted);">
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

      vocabTableBody.innerHTML = currentWordsList.map(w => `
        <tr>
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
        <tr><td colspan="7" style="text-align: center; padding: 36px 16px; color: var(--danger);">
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

        const res = await window.Admin.exportVocabulariesToExcel({
          search,
          hskLevel,
          partOfSpeech
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
          exampleVi
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
          exampleVi
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

  btnOpenImportExcel.addEventListener('click', async () => {
    importModalAlert.className = 'alert';
    importModalAlert.textContent = '';
    previewContainer.style.display = 'none';
    btnConfirmImport.disabled = true;
    parsedExcelWords = [];
    modalImportExcel.classList.add('active');

    // Tải danh sách giáo trình nếu chưa có
    try {
      const curriculums = await window.Admin.getCurriculums();
      selectAssignCurriculum.innerHTML = '<option value="">-- Không gán (chỉ lưu vào kho chung) --</option>';
      (curriculums || []).forEach(c => {
        selectAssignCurriculum.innerHTML += `<option value="${c.id}">${c.title} (${c.level})</option>`;
      });
      selectAssignLesson.innerHTML = '<option value="">-- Hãy chọn giáo trình trước --</option>';
      selectAssignLesson.disabled = true;
    } catch (e) {
      console.warn('Lỗi tải giáo trình cho modal import:', e);
    }
  });

  document.querySelectorAll('[data-close="modal-import-excel"]').forEach(b => {
    b.addEventListener('click', () => modalImportExcel.classList.remove('active'));
  });

  selectAssignCurriculum.addEventListener('change', async function () {
    const curId = selectAssignCurriculum.value;
    if (!curId) {
      selectAssignLesson.innerHTML = '<option value="">-- Không gán vào bài học --</option>';
      selectAssignLesson.disabled = true;
      return;
    }

    try {
      selectAssignLesson.disabled = true;
      selectAssignLesson.innerHTML = '<option value="">Đang nạp bài học...</option>';
      const lessons = await window.Admin.getLessons(curId);

      if (!lessons || lessons.length === 0) {
        selectAssignLesson.innerHTML = '<option value="">(Giáo trình này chưa có bài học nào)</option>';
        selectAssignLesson.disabled = true;
        return;
      }

      selectAssignLesson.innerHTML = '<option value="">-- Chọn bài học cụ thể --</option>';
      lessons.forEach(l => {
        selectAssignLesson.innerHTML += `
          <option value="${l.id}">Bài ${l.order_index}: ${l.title_zh} (${l.title_vi})</option>
        `;
      });
      selectAssignLesson.disabled = false;
    } catch (e) {
      selectAssignLesson.innerHTML = '<option value="">Lỗi tải bài học</option>';
    }
  });

  // Kéo thả và Chọn file Excel
  excelDropzone.addEventListener('click', () => excelFileInput.click());

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
    if (e.target.files && e.target.files[0]) {
      handleSelectedExcelFile(e.target.files[0]);
    }
  });

  function handleSelectedExcelFile(file) {
    if (!window.XLSX) {
      showImportAlert('Thư viện SheetJS chưa được nạp, vui lòng tải lại trang!');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = window.XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawRows = window.XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawRows || rawRows.length === 0) {
          showImportAlert('File Excel trống hoặc không có dòng dữ liệu nào!');
          return;
        }

        parsedExcelWords = normalizeExcelRows(rawRows);

        if (parsedExcelWords.length === 0) {
          showImportAlert('Không tìm thấy từ vựng hợp lệ nào trong file! Hãy đảm bảo có cột Chữ Hán (hanzi), Pinyin và Nghĩa.');
          return;
        }

        renderExcelPreview(parsedExcelWords);

      } catch (err) {
        console.error('Lỗi đọc file Excel:', err);
        showImportAlert('Không thể đọc file Excel/CSV này. Vui lòng kiểm tra lại định dạng file!');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function normalizeExcelRows(rows) {
    return rows.map(r => {
      const getVal = (keys) => {
        for (const k of keys) {
          for (const rowKey in r) {
            if (rowKey.trim().toLowerCase() === k.toLowerCase()) {
              return String(r[rowKey]).trim();
            }
          }
        }
        return '';
      };

      const hanzi = getVal(['hanzi', 'chữ hán', 'chuhan', 'từ vựng', 'tu vung', 'word', 'chinese']);
      const pinyin = getVal(['pinyin', 'phiên âm', 'phien am', 'bính âm']);
      const meaningVi = getVal(['meaning_vi', 'nghĩa', 'nghia', 'nghĩa tiếng việt', 'dịch nghĩa', 'meaning']);
      let hskLevel = parseInt(getVal(['hsk_level', 'hsk', 'cấp độ', 'cap do', 'level']), 10);
      if (isNaN(hskLevel) || hskLevel < 1 || hskLevel > 9) hskLevel = 1;

      const partOfSpeech = getVal(['part_of_speech', 'từ loại', 'tu loai', 'pos', 'type']);
      const exampleHanzi = getVal(['example_hanzi', 'ví dụ', 'vi du', 'câu ví dụ', 'example']);
      const examplePinyin = getVal(['example_pinyin', 'phiên âm ví dụ', 'pinyin ví dụ']);
      const exampleVi = getVal(['example_vi', 'nghĩa ví dụ', 'dịch ví dụ', 'nghĩa câu']);

      if (!hanzi || !pinyin || !meaningVi) return null;

      return {
        hanzi,
        pinyin,
        meaning_vi: meaningVi,
        hsk_level: hskLevel,
        part_of_speech: partOfSpeech || null,
        example_hanzi: exampleHanzi || null,
        example_pinyin: examplePinyin || null,
        example_vi: exampleVi || null
      };
    }).filter(Boolean);
  }

  function renderExcelPreview(words) {
    previewContainer.style.display = 'block';
    previewCount.textContent = words.length;

    const previewRows = words.slice(0, 10);
    previewTableBody.innerHTML = previewRows.map(w => `
      <tr>
        <td style="font-weight: 700; color: var(--primary); font-size: 16px;">${w.hanzi}</td>
        <td>${w.pinyin}</td>
        <td>${w.meaning_vi}</td>
        <td><span class="badge-hsk badge-hsk-${w.hsk_level}">HSK ${w.hsk_level}</span></td>
        <td>${w.part_of_speech || '--'}</td>
      </tr>
    `).join('');

    btnConfirmImport.disabled = false;
    btnConfirmImport.textContent = `🚀 Bắt đầu Nhập ${words.length} Từ Vựng`;
  }

  btnConfirmImport.addEventListener('click', async function () {
    if (!parsedExcelWords || parsedExcelWords.length === 0) return;

    const assignLessonId = selectAssignLesson.disabled ? null : (selectAssignLesson.value || null);

    try {
      btnConfirmImport.disabled = true;
      btnConfirmImport.textContent = `Đang nhập ${parsedExcelWords.length} từ...`;

      await window.Admin.batchImportVocabularies(parsedExcelWords, assignLessonId);

      modalImportExcel.classList.remove('active');
      showAlert(`🎉 Đã nhập thành công ${parsedExcelWords.length} từ vựng vào kho!`, 'success');

      // Tải lại trang 1 để xem các từ mới nhập
      currentPage = 1;
      saveState();
      await loadVocabulariesList();

    } catch (err) {
      showImportAlert(err.message || 'Lỗi khi nhập dữ liệu');
    } finally {
      btnConfirmImport.disabled = false;
      btnConfirmImport.textContent = '🚀 Bắt đầu Nhập Dữ Liệu';
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
