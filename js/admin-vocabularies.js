/**
 * LOGIC KHO TỪ VỰNG & NHẬP EXCEL / CSV (admin/vocabularies.html)
 */

document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth(['admin', 'teacher'], '../index.html');
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);

  let parsedExcelWords = [];

  const pageAlert = document.getElementById('page-alert');
  const searchInput = document.getElementById('search-vocab-input');
  const filterHsk = document.getElementById('filter-hsk-level');
  const btnSearch = document.getElementById('btn-search-vocab');
  const vocabTableBody = document.getElementById('vocab-table-body');
  const vocabCountInfo = document.getElementById('vocab-count-info');

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

  // Modal Thêm từ thủ công
  const modalCreateVocab = document.getElementById('modal-create-vocab');
  const btnOpenCreateVocab = document.getElementById('btn-open-create-vocab');
  const formCreateVocab = document.getElementById('form-create-vocab');
  const createVocabAlert = document.getElementById('create-vocab-alert');
  const btnSubmitVocab = document.getElementById('btn-submit-vocab');

  function showAlert(msg, type = 'danger') {
    pageAlert.className = `alert alert-${type} show`;
    pageAlert.textContent = msg;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showImportAlert(msg, type = 'danger') {
    importModalAlert.className = `alert alert-${type} show`;
    importModalAlert.textContent = msg;
  }

  // 1. Tải danh sách từ vựng
  async function loadVocabulariesList() {
    try {
      vocabTableBody.innerHTML = `
        <tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">
          Đang tải danh sách từ vựng...
        </td></tr>
      `;

      const search = searchInput.value.trim();
      const hskLevel = filterHsk.value;

      const result = await window.Admin.getVocabularies({
        search,
        hskLevel,
        limit: 100
      });

      const words = result.data || [];
      vocabCountInfo.textContent = `Hiển thị ${words.length} / tổng số ${result.total || words.length} từ`;

      if (words.length === 0) {
        vocabTableBody.innerHTML = `
          <tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Không tìm thấy từ vựng nào phù hợp. Bạn có thể nhấn <strong>"Nhập từ file Excel"</strong> hoặc <strong>"Thêm từ thủ công"</strong>!
          </td></tr>
        `;
        return;
      }

      vocabTableBody.innerHTML = words.map(w => `
        <tr>
          <td style="font-size: 20px; font-weight: 700; color: var(--primary); font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;">
            ${w.hanzi}
          </td>
          <td style="font-size: 15px; font-weight: 600; color: #475569;">${w.pinyin}</td>
          <td>${w.meaning_vi}</td>
          <td><span class="badge-status badge-ongoing">HSK ${w.hsk_level}</span></td>
          <td><span style="font-size: 12px; color: var(--text-muted);">${w.part_of_speech || '--'}</span></td>
          <td style="font-size: 13px;">
            ${w.example_hanzi ? `<div><strong>${w.example_hanzi}</strong></div>` : ''}
            ${w.example_pinyin ? `<div style="color: var(--text-muted);">${w.example_pinyin}</div>` : ''}
            ${w.example_vi ? `<div style="color: #64748b;">${w.example_vi}</div>` : ''}
            ${!w.example_hanzi ? '<span style="color: var(--text-light);">--</span>' : ''}
          </td>
          <td style="text-align: center;">
            <button type="button" class="btn btn-outline btn-sm btn-speak-word" data-hanzi="${w.hanzi}" style="padding: 4px 8px; font-size: 14px;" title="Phát âm tiếng Trung">
              🔊
            </button>
          </td>
        </tr>
      `).join('');

      // Gắn sự kiện phát âm
      document.querySelectorAll('.btn-speak-word').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const hanzi = btn.getAttribute('data-hanzi');
          window.XP.speakChinese(hanzi);
        });
      });

    } catch (err) {
      console.error('Lỗi tải từ vựng:', err);
      vocabTableBody.innerHTML = `<tr><td colspan="7" style="color: red; text-align: center;">Lỗi tải dữ liệu</td></tr>`;
    }
  }

  // Sự kiện tìm kiếm & lọc
  btnSearch.addEventListener('click', loadVocabulariesList);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadVocabulariesList(); });
  filterHsk.addEventListener('change', loadVocabulariesList);

  // 2. Thêm từ thủ công
  btnOpenCreateVocab.addEventListener('click', () => {
    createVocabAlert.className = 'alert';
    createVocabAlert.textContent = '';
    formCreateVocab.reset();
    modalCreateVocab.classList.add('active');
  });

  document.querySelectorAll('[data-close="modal-create-vocab"]').forEach(b => {
    b.addEventListener('click', () => modalCreateVocab.classList.remove('active'));
  });

  formCreateVocab.addEventListener('submit', async function (e) {
    e.preventDefault();
    const hanzi = document.getElementById('v-hanzi').value.trim();
    const pinyin = document.getElementById('v-pinyin').value.trim();
    const meaningVi = document.getElementById('v-meaning').value.trim();
    const hskLevel = document.getElementById('v-hsk').value;
    const partOfSpeech = document.getElementById('v-pos').value.trim();
    const exampleHanzi = document.getElementById('v-ex-hanzi').value.trim();
    const exampleVi = document.getElementById('v-ex-vi').value.trim();

    try {
      btnSubmitVocab.disabled = true;
      btnSubmitVocab.textContent = 'Đang lưu...';

      await window.Admin.createVocabulary({
        hanzi,
        pinyin,
        meaningVi,
        hskLevel,
        partOfSpeech,
        exampleHanzi,
        exampleVi
      });

      modalCreateVocab.classList.remove('active');
      showAlert(`Đã thêm từ "${hanzi}" vào kho từ vựng!`, 'success');
      await loadVocabulariesList();

    } catch (err) {
      createVocabAlert.className = 'alert alert-danger show';
      createVocabAlert.textContent = err.message || 'Lỗi khi lưu từ vựng';
    } finally {
      btnSubmitVocab.disabled = false;
      btnSubmitVocab.textContent = 'Lưu từ vựng';
    }
  });

  // 3. Xử lý Modal Import Excel / CSV
  btnOpenImportExcel.addEventListener('click', async () => {
    importModalAlert.className = 'alert';
    importModalAlert.textContent = '';
    previewContainer.style.display = 'none';
    btnConfirmImport.disabled = true;
    parsedExcelWords = [];
    modalImportExcel.classList.add('active');

    // Tải dropdown giáo trình nếu chưa có
    try {
      const curriculums = await window.Admin.getCurriculums();
      selectAssignCurriculum.innerHTML = '<option value="">-- Không gán bài (Chỉ lưu vào kho) --</option>' +
        curriculums.map(c => `<option value="${c.id}">${c.title} (${c.level})</option>`).join('');
    } catch (e) {
      console.warn('Lỗi tải giáo trình trong import modal:', e);
    }
  });

  document.querySelectorAll('[data-close="modal-import-excel"]').forEach(b => {
    b.addEventListener('click', () => modalImportExcel.classList.remove('active'));
  });

  // Khi chọn giáo trình -> tải danh sách bài học
  selectAssignCurriculum.addEventListener('change', async function () {
    const currId = selectAssignCurriculum.value;
    if (!currId) {
      selectAssignLesson.innerHTML = '<option value="">-- Chọn bài học --</option>';
      selectAssignLesson.disabled = true;
      return;
    }

    try {
      const lessons = await window.Admin.getLessonsByCurriculum(currId);
      if (!lessons || lessons.length === 0) {
        selectAssignLesson.innerHTML = '<option value="">-- Giáo trình này chưa có bài học --</option>';
        selectAssignLesson.disabled = true;
        return;
      }
      selectAssignLesson.innerHTML = lessons.map(l => `
        <option value="${l.id}">Bài ${l.order_index}: ${l.title_zh} (${l.title_vi})</option>
      `).join('');
      selectAssignLesson.disabled = false;
    } catch (e) {
      selectAssignLesson.innerHTML = '<option value="">Lỗi tải bài học</option>';
      selectAssignLesson.disabled = true;
    }
  });

  // Drag & drop hoặc chọn file
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSelectedExcelFile(e.dataTransfer.files[0]);
    }
  });

  excelFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleSelectedExcelFile(e.target.files[0]);
    }
  });

  /**
   * Đọc và phân tích file Excel / CSV bằng SheetJS
   */
  function handleSelectedExcelFile(file) {
    if (!window.XLSX) {
      showImportAlert('Thư viện SheetJS chưa được tải. Vui lòng kiểm tra kết nối mạng!');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = window.XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Chuyển sheet sang dạng JSON
        const rawRows = window.XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawRows || rawRows.length === 0) {
          showImportAlert('File Excel trống hoặc không có dòng dữ liệu nào!');
          return;
        }

        // Chuẩn hóa tên cột linh hoạt
        parsedExcelWords = normalizeExcelRows(rawRows);

        if (parsedExcelWords.length === 0) {
          showImportAlert('Không tìm thấy dữ liệu hợp lệ! Vui lòng đảm bảo file có cột chứa chữ Hán (hanzi), pinyin và nghĩa.');
          return;
        }

        // Hiển thị preview 5 dòng đầu
        renderExcelPreview(parsedExcelWords);

      } catch (err) {
        console.error('Lỗi phân tích file Excel:', err);
        showImportAlert('Lỗi đọc file: ' + (err.message || err));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /**
   * Chuẩn hóa dữ liệu dòng từ các tiêu đề cột tiếng Việt hoặc tiếng Anh
   */
  function normalizeExcelRows(rows) {
    const normalized = [];

    for (const row of rows) {
      // Tìm khóa tương ứng
      const keys = Object.keys(row);
      const findVal = (keywords) => {
        for (const k of keys) {
          const lower = k.trim().toLowerCase();
          if (keywords.some(kw => lower === kw || lower.includes(kw))) {
            return String(row[k]).trim();
          }
        }
        return '';
      };

      const hanzi = findVal(['hanzi', 'chữ hán', 'chu han', 'chuhan', 'từ vựng', 'tu vung', 'word']);
      const pinyin = findVal(['pinyin', 'phiên âm', 'phien am']);
      const meaningVi = findVal(['meaning_vi', 'meaning', 'nghĩa', 'nghia', 'ý nghĩa', 'dịch']);
      const hskVal = findVal(['hsk_level', 'hsk', 'cấp độ', 'cap do', 'level']);
      const pos = findVal(['part_of_speech', 'từ loại', 'tu loai', 'loại từ']);
      const exHanzi = findVal(['example_hanzi', 'ví dụ', 'vi du', 'câu ví dụ']);
      const exVi = findVal(['example_vi', 'dịch ví dụ', 'nghĩa ví dụ']);

      if (hanzi && (meaningVi || pinyin)) {
        normalized.push({
          hanzi: hanzi,
          pinyin: pinyin || '',
          meaning_vi: meaningVi || '(Chưa có nghĩa)',
          hsk_level: parseInt(hskVal, 10) || 1,
          part_of_speech: pos || null,
          example_hanzi: exHanzi || null,
          example_vi: exVi || null
        });
      }
    }

    return normalized;
  }

  function renderExcelPreview(words) {
    previewCount.textContent = words.length;
    const preview5 = words.slice(0, 5);

    previewTableBody.innerHTML = preview5.map(w => `
      <tr>
        <td style="font-weight: 700; color: var(--primary);">${w.hanzi}</td>
        <td>${w.pinyin}</td>
        <td>${w.meaning_vi}</td>
        <td>HSK ${w.hsk_level}</td>
      </tr>
    `).join('');

    previewContainer.style.display = 'block';
    btnConfirmImport.disabled = false;
    importModalAlert.className = 'alert alert-success show';
    importModalAlert.textContent = `✅ Đã đọc thành công ${words.length} từ vựng từ file! Nhấn nút bên dưới để tiến hành nhập.`;
  }

  // 4. Bắt đầu Import vào Database
  btnConfirmImport.addEventListener('click', async function () {
    if (!parsedExcelWords || parsedExcelWords.length === 0) return;

    const assignLessonId = selectAssignLesson.disabled ? null : (selectAssignLesson.value || null);

    try {
      btnConfirmImport.disabled = true;
      btnConfirmImport.textContent = `Đang nhập ${parsedExcelWords.length} từ...`;

      await window.Admin.batchImportVocabularies(parsedExcelWords, assignLessonId);

      modalImportExcel.classList.remove('active');
      showAlert(`🎉 Đã nhập thành công ${parsedExcelWords.length} từ vựng vào kho!`, 'success');
      await loadVocabulariesList();

    } catch (err) {
      showImportAlert(err.message || 'Lỗi khi nhập dữ liệu');
    } finally {
      btnConfirmImport.disabled = false;
      btnConfirmImport.textContent = '🚀 Bắt đầu Nhập Dữ Liệu';
    }
  });

  // Tải danh sách từ ban đầu
  await loadVocabulariesList();
});
