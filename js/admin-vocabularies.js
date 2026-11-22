/**
 * LOGIC KHO TỪ VỰNG & NHẬP EXCEL / CSV (admin/vocabularies.html)
 */

document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth(['admin', 'teacher'], '../index.html');
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);

  let parsedExcelWords = [];
  let currentWordsList = [];

  const pageAlert = document.getElementById('page-alert');
  const searchInput = document.getElementById('search-vocab-input');
  const filterHsk = document.getElementById('filter-hsk-level');
  const btnSearch = document.getElementById('btn-search-vocab');
  const vocabTableBody = document.getElementById('vocab-table-body');
  const vocabCountInfo = document.getElementById('vocab-count-info');
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
        limit: 150
      });

      currentWordsList = result.data || [];
      vocabCountInfo.textContent = `Hiển thị ${currentWordsList.length} / tổng số ${result.total || currentWordsList.length} từ`;

      if (currentWordsList.length === 0) {
        vocabTableBody.innerHTML = `
          <tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Không tìm thấy từ vựng nào phù hợp. Bạn có thể nhấn <strong>"Nhập từ file Excel"</strong> hoặc <strong>"Thêm từ thủ công"</strong>!
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
          <td>${w.meaning_vi}</td>
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

      // Gắn sự kiện phát âm
      document.querySelectorAll('.btn-speak-word').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const hanzi = btn.getAttribute('data-hanzi');
          window.XP.speakChinese(hanzi);
        });
      });

      // Gắn sự kiện sửa từ
      document.querySelectorAll('.btn-edit-word').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          openEditVocabModal(id);
        });
      });

      // Gắn sự kiện xóa từ
      document.querySelectorAll('.btn-delete-word').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          const hanzi = btn.getAttribute('data-hanzi');
          openDeleteVocabModal(id, hanzi);
        });
      });

    } catch (err) {
      console.error('Lỗi tải từ vựng:', err);
      vocabTableBody.innerHTML = `<tr><td colspan="7" style="color: red; text-align: center;">Lỗi tải dữ liệu</td></tr>`;
    }
  }

  // Sự kiện Tabs lọc HSK nhanh
  hskTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const level = tab.getAttribute('data-level');
      hskTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      filterHsk.value = level;
      loadVocabulariesList();
    });
  });

  // Sự kiện tìm kiếm & lọc dropdown
  btnSearch.addEventListener('click', loadVocabulariesList);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadVocabulariesList(); });
  filterHsk.addEventListener('change', () => {
    const val = filterHsk.value;
    hskTabs.forEach(t => {
      if (t.getAttribute('data-level') === val) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });
    loadVocabulariesList();
  });

  // 2. Thêm mới từ thủ công
  btnOpenCreateVocab.addEventListener('click', () => {
    createVocabAlert.className = 'alert';
    createVocabAlert.textContent = '';
    formCreateVocab.reset();
    inputVocabId.value = '';
    if (modalVocabTitle) modalVocabTitle.textContent = 'Thêm Từ Vựng Mới';
    btnSubmitVocab.textContent = 'Lưu từ vựng';
    modalCreateVocab.classList.add('active');
  });

  // Mở modal Chỉnh sửa từ vựng
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

  // Mở modal Xóa từ vựng khỏi kho
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
      await loadVocabulariesList();

    } catch (err) {
      alert(err.message || 'Lỗi khi xóa từ vựng');
    } finally {
      btnConfirmDeleteVocab.disabled = false;
      btnConfirmDeleteVocab.textContent = '🗑️ Xác nhận xóa vĩnh viễn';
    }
  });

  // Submit Form Thêm hoặc Sửa từ vựng
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
      await loadVocabulariesList();

    } catch (err) {
      createVocabAlert.className = 'alert alert-danger show';
      createVocabAlert.textContent = err.message || 'Lỗi khi lưu từ vựng';
    } finally {
      btnSubmitVocab.disabled = false;
      btnSubmitVocab.textContent = vocabId ? 'Cập nhật thay đổi' : 'Lưu từ vựng';
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
        console.error('Lỗi đọc file Excel:', err);
        showImportAlert('Không thể đọc file Excel/CSV này. Vui lòng kiểm tra lại định dạng file!');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /**
   * Chuẩn hóa dữ liệu dòng từ các tiêu đề cột tiếng Việt hoặc tiếng Anh
   * Hỗ trợ đầy đủ cấp độ HSK 1 đến HSK 9
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

      const rawHsk = hskVal ? hskVal.replace(/[^0-9]/g, '') : '';
      let parsedHsk = parseInt(rawHsk, 10);
      if (isNaN(parsedHsk) || parsedHsk < 1 || parsedHsk > 9) {
        parsedHsk = 1;
      }

      if (hanzi && (meaningVi || pinyin)) {
        normalized.push({
          hanzi: hanzi,
          pinyin: pinyin || '',
          meaning_vi: meaningVi || '(Chưa có nghĩa)',
          hsk_level: parsedHsk,
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
        <td><span class="badge-hsk badge-hsk-${w.hsk_level}">HSK ${w.hsk_level}</span></td>
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

  // Tải danh sách từ ban đầu
  await loadVocabulariesList();
});
