/**
 * MINH NGỌC HSK - QUẢN LÝ GIÁO TRÌNH & BÀI HỌC (admin/curriculums.html)
 * Đầy đủ tính năng: Sửa/Xóa giáo trình an toàn, Đổi thứ tự bài học (⬆️⬇️),
 * Sửa/Xóa bài học, Quản lý từ vựng trong bài (Gỡ lẻ, Gỡ hàng loạt, Thêm từ kho).
 */

document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth(['admin', 'teacher'], '../index.html');
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);

  let curriculumsList = [];
  let selectedCurriculum = null;
  let currentLessonsList = [];
  let activeLessonForVocab = null;
  let currentLessonVocabList = [];
  let warehouseVocabCache = [];

  const pageAlert = document.getElementById('page-alert');
  const curriculumsListContainer = document.getElementById('curriculums-list');
  const selectedCurriculumTitle = document.getElementById('selected-curriculum-title');
  const selectedCurriculumMeta = document.getElementById('selected-curriculum-meta');
  const btnEditSelectedCurr = document.getElementById('btn-edit-selected-curr');
  const btnDeleteSelectedCurr = document.getElementById('btn-delete-selected-curr');
  const btnOpenCreateLesson = document.getElementById('btn-open-create-lesson');
  const lessonsTableBody = document.getElementById('lessons-table-body');

  // Modals Giáo trình
  const modalCreateCurriculum = document.getElementById('modal-create-curriculum');
  const btnOpenCreateCurriculum = document.getElementById('btn-open-create-curriculum');
  const formCreateCurriculum = document.getElementById('form-create-curriculum');
  const curriculumModalAlert = document.getElementById('curriculum-modal-alert');
  const btnSubmitCurriculum = document.getElementById('btn-submit-curriculum');

  const modalEditCurriculum = document.getElementById('modal-edit-curriculum');
  const formEditCurriculum = document.getElementById('form-edit-curriculum');
  const editCurrModalAlert = document.getElementById('edit-curriculum-modal-alert');
  const btnSubmitEditCurr = document.getElementById('btn-submit-edit-curriculum');

  const modalDeleteCurriculum = document.getElementById('modal-delete-curriculum');
  const deleteCurrLoading = document.getElementById('delete-curr-loading');
  const deleteCurrContent = document.getElementById('delete-curr-content');
  const deleteCurrBlocked = document.getElementById('delete-curr-blocked');
  const deleteCurrBlockedMsg = document.getElementById('delete-curr-blocked-msg');
  const deleteCurrAllowed = document.getElementById('delete-curr-allowed');
  const deleteCurrName = document.getElementById('delete-curr-name');
  const deleteCurrStatsList = document.getElementById('delete-curr-stats-list');
  const btnConfirmDeleteCurr = document.getElementById('btn-confirm-delete-curr');
  let pendingDeleteCurriculumId = null;

  // Modals Bài học
  const modalCreateLesson = document.getElementById('modal-create-lesson');
  const formCreateLesson = document.getElementById('form-create-lesson');
  const lessonOrderInput = document.getElementById('lesson-order');
  const lessonModalAlert = document.getElementById('lesson-modal-alert');
  const btnSubmitLesson = document.getElementById('btn-submit-lesson');

  const modalEditLesson = document.getElementById('modal-edit-lesson');
  const formEditLesson = document.getElementById('form-edit-lesson');
  const editLessonModalAlert = document.getElementById('edit-lesson-modal-alert');
  const btnSubmitEditLesson = document.getElementById('btn-submit-edit-lesson');

  const modalDeleteLesson = document.getElementById('modal-delete-lesson');
  const deleteLessonLoading = document.getElementById('delete-lesson-loading');
  const deleteLessonContent = document.getElementById('delete-lesson-content');
  const deleteLessonName = document.getElementById('delete-lesson-name');
  const deleteLessonStatsList = document.getElementById('delete-lesson-stats-list');
  const btnConfirmDeleteLesson = document.getElementById('btn-confirm-delete-lesson');
  let pendingDeleteLessonId = null;

  // Modals Quản lý từ vựng trong bài
  const modalLessonVocabularies = document.getElementById('modal-lesson-vocabularies');
  const modalLessonVocabTitle = document.getElementById('modal-lesson-vocab-title');
  const modalLessonVocabMeta = document.getElementById('modal-lesson-vocab-meta');
  const lessonVocabAlert = document.getElementById('lesson-vocab-alert');
  const checkAllLessonVocab = document.getElementById('check-all-lesson-vocab');
  const btnBatchRemoveVocab = document.getElementById('btn-batch-remove-vocab');
  const selectedVocabCount = document.getElementById('selected-vocab-count');
  const lessonVocabTableBody = document.getElementById('lesson-vocab-table-body');
  const btnOpenAddVocabModal = document.getElementById('btn-open-add-vocab-modal');

  // Modal Chọn từ kho
  const modalAddVocabToLesson = document.getElementById('modal-add-vocab-to-lesson');
  const addVocabAlert = document.getElementById('add-vocab-alert');
  const searchWarehouseVocab = document.getElementById('search-warehouse-vocab');
  const filterWarehouseHsk = document.getElementById('filter-warehouse-hsk');
  const btnSearchWarehouse = document.getElementById('btn-search-warehouse');
  const checkAllWarehouseVocab = document.getElementById('check-all-warehouse-vocab');
  const warehouseVocabTableBody = document.getElementById('warehouse-vocab-table-body');
  const btnConfirmAddWarehouseVocab = document.getElementById('btn-confirm-add-warehouse-vocab');

  function showAlert(msg, type = 'danger') {
    pageAlert.className = `alert alert-${type} show`;
    pageAlert.textContent = msg;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ===========================================================================
  // 1. TẢI VÀ HIỂN THỊ DANH SÁCH GIÁO TRÌNH
  // ===========================================================================
  async function loadCurriculums() {
    try {
      curriculumsList = await window.Admin.getCurriculums();

      if (!curriculumsList || curriculumsList.length === 0) {
        curriculumsListContainer.innerHTML = `
          <div style="text-align: center; padding: 24px; color: var(--text-muted);">
            Chưa có giáo trình nào. Hãy bấm "Tạo Giáo Trình Mới"!
          </div>
        `;
        selectedCurriculum = null;
        selectedCurriculumTitle.textContent = 'Danh sách Bài học';
        selectedCurriculumMeta.textContent = 'Chưa chọn giáo trình nào';
        if (btnEditSelectedCurr) btnEditSelectedCurr.style.display = 'none';
        if (btnDeleteSelectedCurr) btnDeleteSelectedCurr.style.display = 'none';
        btnOpenCreateLesson.style.display = 'none';
        lessonsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">Chưa có giáo trình</td></tr>`;
        return;
      }

      curriculumsListContainer.innerHTML = curriculumsList.map(c => {
        const isActive = c.is_active !== false;
        return `
          <div class="card curr-item" data-id="${c.id}" style="margin-bottom: 0; padding: 14px; cursor: pointer; border: 1.5px solid var(--border-color); transition: all 0.2s;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
              <div style="flex: 1;">
                <div style="font-weight: 700; color: var(--text-main); font-size: 15px; line-height: 1.3;">${c.title}</div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                  Mã: <code>${c.code}</code> · ${c.total_lessons || 0} bài học
                </div>
              </div>
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                <span class="badge-status badge-ongoing" style="font-size: 11px;">${c.level}</span>
                <span class="badge-status ${isActive ? 'badge-ongoing' : 'badge-paused'}" style="font-size: 10px; padding: 2px 6px;">
                  ${isActive ? '● Đang chạy' : '○ Ngừng'}
                </span>
              </div>
            </div>

            <!-- Nút thao tác rõ ràng trên thẻ giáo trình -->
            <div class="curr-card-actions" style="display: flex; gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-color);">
              <button type="button" class="btn btn-sm btn-edit-curr" data-id="${c.id}" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 32px; font-size: 13px; font-weight: 600; border: 1.5px solid var(--border-color); background: var(--bg-card); color: var(--text-main); border-radius: var(--radius-sm);" title="Chỉnh sửa giáo trình">
                ✏️ Sửa
              </button>
              <button type="button" class="btn btn-sm btn-delete-curr" data-id="${c.id}" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 32px; font-size: 13px; font-weight: 600; border: 1.5px solid #fca5a5; background: rgba(239, 68, 68, 0.08); color: #dc2626; border-radius: var(--radius-sm);" title="Xóa giáo trình">
                🗑️ Xóa
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Gắn sự kiện click chọn giáo trình
      document.querySelectorAll('.curr-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.btn-edit-curr') || e.target.closest('.btn-delete-curr')) return;
          const id = el.getAttribute('data-id');
          selectCurriculum(id);
        });
      });

      // Gắn sự kiện nút Sửa giáo trình
      document.querySelectorAll('.btn-edit-curr').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          openEditCurriculumModal(id);
        });
      });

      // Gắn sự kiện nút Xóa giáo trình
      document.querySelectorAll('.btn-delete-curr').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          openDeleteCurriculumModal(id);
        });
      });

      // Tự động giữ giáo trình đang chọn hoặc chọn cái đầu tiên
      if (selectedCurriculum) {
        const stillExists = curriculumsList.find(c => c.id === selectedCurriculum.id);
        if (stillExists) {
          selectCurriculum(stillExists.id);
        } else if (curriculumsList.length > 0) {
          selectCurriculum(curriculumsList[0].id);
        }
      } else if (curriculumsList.length > 0) {
        selectCurriculum(curriculumsList[0].id);
      }

    } catch (err) {
      console.error('Lỗi tải giáo trình:', err);
      showAlert('Lỗi tải giáo trình: ' + (err.message || err));
    }
  }

  // ===========================================================================
  // 2. CHỌN MỘT GIÁO TRÌNH ĐỂ XEM DANH SÁCH BÀI HỌC
  // ===========================================================================
  async function selectCurriculum(curriculumId) {
    selectedCurriculum = curriculumsList.find(c => c.id === curriculumId);
    if (!selectedCurriculum) return;

    // Highlight item được chọn
    document.querySelectorAll('.curr-item').forEach(el => {
      if (el.getAttribute('data-id') === curriculumId) {
        el.style.borderColor = 'var(--primary)';
        el.style.backgroundColor = 'var(--primary-light)';
      } else {
        el.style.borderColor = 'var(--border-color)';
        el.style.backgroundColor = 'var(--bg-card)';
      }
    });

    const statusText = selectedCurriculum.is_active !== false ? 'Đang hoạt động' : 'Ngừng hoạt động';
    selectedCurriculumTitle.textContent = selectedCurriculum.title;
    selectedCurriculumMeta.textContent = `Trình độ: ${selectedCurriculum.level} · Mã: ${selectedCurriculum.code} · Trạng thái: ${statusText}`;
    if (btnEditSelectedCurr) btnEditSelectedCurr.style.display = 'inline-flex';
    if (btnDeleteSelectedCurr) btnDeleteSelectedCurr.style.display = 'inline-flex';
    btnOpenCreateLesson.style.display = 'inline-flex';

    await loadLessons(curriculumId);
  }

  // ===========================================================================
  // 3. TẢI DANH SÁCH BÀI HỌC
  // ===========================================================================
  async function loadLessons(curriculumId) {
    try {
      lessonsTableBody.innerHTML = `
        <tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">
          Đang tải bài học...
        </td></tr>
      `;

      currentLessonsList = await window.Admin.getLessonsByCurriculum(curriculumId);

      if (!currentLessonsList || currentLessonsList.length === 0) {
        lessonsTableBody.innerHTML = `
          <tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Giáo trình này chưa có bài học nào. Hãy nhấn <strong>"Thêm Bài Học"</strong> ở trên!
          </td></tr>
        `;
        return;
      }

      const totalLessons = currentLessonsList.length;

      lessonsTableBody.innerHTML = currentLessonsList.map((l, index) => {
        const isFirst = (index === 0);
        const isLast = (index === totalLessons - 1);

        const vocabCount = l.vocab_count !== undefined ? l.vocab_count : (l.total_vocabularies || 0);
        const slideCount = l.slide_count !== undefined ? l.slide_count : 0;
        const assignCount = l.assignment_count !== undefined ? l.assignment_count : 0;

        return `
          <tr data-lesson-id="${l.id}">
            <td>
              <div style="display: flex; align-items: center; gap: 6px;">
                <strong style="color: var(--text-main); min-width: 42px;">Bài ${l.order_index}</strong>
                <div style="display: inline-flex; flex-direction: column; gap: 2px;">
                  <button type="button" class="btn btn-outline btn-sm btn-reorder-up" data-index="${index}" style="height: 18px; width: 22px; padding: 0; line-height: 1; font-size: 10px;" ${isFirst ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Di chuyển lên">
                    ▲
                  </button>
                  <button type="button" class="btn btn-outline btn-sm btn-reorder-down" data-index="${index}" style="height: 18px; width: 22px; padding: 0; line-height: 1; font-size: 10px;" ${isLast ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Di chuyển xuống">
                    ▼
                  </button>
                </div>
              </div>
            </td>
            <td style="font-size: 16px; font-weight: 600; color: var(--primary); font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;">
              ${l.title_zh}
            </td>
            <td>${l.title_vi}</td>
            <td><span style="color: #ca8a04; font-weight: 600;">+${l.reward_xp || 50} XP</span></td>
            <td>
              <button type="button" class="btn btn-outline btn-sm btn-open-vocab-manager" data-lesson-id="${l.id}" style="height: 30px; padding: 0 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                📖 ${vocabCount} từ
              </button>
            </td>
            <td>
              <button type="button" class="btn btn-outline btn-sm btn-open-slide-manager" data-lesson-id="${l.id}" style="height: 30px; padding: 0 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                📑 ${slideCount} slide
              </button>
            </td>
            <td>
              <button type="button" class="btn btn-outline btn-sm btn-open-assign-manager" data-lesson-id="${l.id}" style="height: 30px; padding: 0 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                🎯 ${assignCount} bài
              </button>
            </td>
            <td style="text-align: right; white-space: nowrap;">
              <button type="button" class="btn btn-outline btn-sm btn-edit-lesson" data-lesson-id="${l.id}" style="padding: 4px 7px; font-size: 13px;" title="Sửa bài học">
                ✏️
              </button>
              <button type="button" class="btn btn-outline btn-sm btn-delete-lesson" data-lesson-id="${l.id}" style="padding: 4px 7px; font-size: 13px; color: var(--danger); border-color: #fca5a5;" title="Xóa bài học">
                🗑️
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Gắn sự kiện đổi thứ tự bài học (Lên / Xuống)
      document.querySelectorAll('.btn-reorder-up').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          if (idx <= 0) return;
          await swapLessonOrder(idx, idx - 1);
        });
      });

      document.querySelectorAll('.btn-reorder-down').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          if (idx >= currentLessonsList.length - 1) return;
          await swapLessonOrder(idx, idx + 1);
        });
      });

      // Gắn sự kiện mở quản lý từ vựng trong bài
      document.querySelectorAll('.btn-open-vocab-manager').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const lId = btn.getAttribute('data-lesson-id');
          openLessonVocabModal(lId);
        });
      });

      // Gắn sự kiện mở quản lý slide bài giảng
      document.querySelectorAll('.btn-open-slide-manager').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const lId = btn.getAttribute('data-lesson-id');
          openLessonSlidesModal(lId);
        });
      });

      // Gắn sự kiện mở quản lý bài tập trong bài
      document.querySelectorAll('.btn-open-assign-manager').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const lId = btn.getAttribute('data-lesson-id');
          openLessonAssignmentsModal(lId);
        });
      });

      // Gắn sự kiện sửa bài học
      document.querySelectorAll('.btn-edit-lesson').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const lId = btn.getAttribute('data-lesson-id');
          openEditLessonModal(lId);
        });
      });

      // Gắn sự kiện xóa bài học
      document.querySelectorAll('.btn-delete-lesson').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const lId = btn.getAttribute('data-lesson-id');
          openDeleteLessonModal(lId);
        });
      });

    } catch (err) {
      console.error('Lỗi tải bài học:', err);
      lessonsTableBody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">Lỗi tải bài học</td></tr>`;
    }
  }

  // ===========================================================================
  // 4. HOÁN ĐỔI THỨ TỰ BÀI HỌC (SWAP & REORDER RPC)
  // ===========================================================================
  async function swapLessonOrder(fromIndex, toIndex) {
    if (!selectedCurriculum) return;
    try {
      const items = [...currentLessonsList];
      const temp = items[fromIndex];
      items[fromIndex] = items[toIndex];
      items[toIndex] = temp;

      const newIdOrder = items.map(x => x.id);
      await window.Admin.reorderLessons(selectedCurriculum.id, newIdOrder);
      showAlert(`Đã cập nhật thứ tự bài học thành công!`, 'success');
      await loadLessons(selectedCurriculum.id);
    } catch (err) {
      console.error('Lỗi đổi thứ tự bài học:', err);
      showAlert(err.message || 'Lỗi khi sắp xếp lại bài học', 'danger');
    }
  }

  // ===========================================================================
  // 5. MODAL TẠO GIÁO TRÌNH
  // ===========================================================================
  btnOpenCreateCurriculum.addEventListener('click', () => {
    curriculumModalAlert.className = 'alert';
    curriculumModalAlert.textContent = '';
    formCreateCurriculum.reset();
    modalCreateCurriculum.classList.add('active');
  });

  document.querySelectorAll('[data-close="modal-create-curriculum"]').forEach(b => {
    b.addEventListener('click', () => modalCreateCurriculum.classList.remove('active'));
  });

  formCreateCurriculum.addEventListener('submit', async function (e) {
    e.preventDefault();
    const title = document.getElementById('curr-title').value.trim();
    const code = document.getElementById('curr-code').value.trim();
    const level = document.getElementById('curr-level').value;
    const description = document.getElementById('curr-description').value.trim();

    try {
      btnSubmitCurriculum.disabled = true;
      btnSubmitCurriculum.textContent = 'Đang tạo...';

      const newCurr = await window.Admin.createCurriculum({ title, code, level, description });
      modalCreateCurriculum.classList.remove('active');
      showAlert(`Tạo giáo trình "${title}" thành công!`, 'success');
      selectedCurriculum = newCurr;
      await loadCurriculums();

    } catch (err) {
      curriculumModalAlert.className = 'alert alert-danger show';
      curriculumModalAlert.textContent = err.message || 'Lỗi khi tạo giáo trình';
    } finally {
      btnSubmitCurriculum.disabled = false;
      btnSubmitCurriculum.textContent = 'Xác nhận tạo';
    }
  });

  // ===========================================================================
  // 6. MODAL CHỈNH SỬA GIÁO TRÌNH
  // ===========================================================================
  function openEditCurriculumModal(id) {
    const c = curriculumsList.find(item => item.id === id);
    if (!c) return;

    editCurrModalAlert.className = 'alert';
    editCurrModalAlert.textContent = '';
    formEditCurriculum.reset();

    document.getElementById('edit-curr-id').value = c.id;
    document.getElementById('edit-curr-title').value = c.title || '';
    document.getElementById('edit-curr-code').value = c.code || '';
    document.getElementById('edit-curr-level').value = c.level || 'HSK1';
    document.getElementById('edit-curr-description').value = c.description || '';
    document.getElementById('edit-curr-active').checked = (c.is_active !== false);

    modalEditCurriculum.classList.add('active');
  }

  document.querySelectorAll('[data-close="modal-edit-curriculum"]').forEach(b => {
    b.addEventListener('click', () => modalEditCurriculum.classList.remove('active'));
  });

  formEditCurriculum.addEventListener('submit', async function (e) {
    e.preventDefault();
    const id = document.getElementById('edit-curr-id').value;
    const title = document.getElementById('edit-curr-title').value.trim();
    const code = document.getElementById('edit-curr-code').value.trim();
    const level = document.getElementById('edit-curr-level').value;
    const description = document.getElementById('edit-curr-description').value.trim();
    const isActive = document.getElementById('edit-curr-active').checked;

    try {
      btnSubmitEditCurr.disabled = true;
      btnSubmitEditCurr.textContent = 'Đang lưu...';

      await window.Admin.updateCurriculum(id, {
        title,
        code,
        level,
        description,
        isActive
      });

      modalEditCurriculum.classList.remove('active');
      showAlert(`Đã cập nhật giáo trình "${title}" thành công!`, 'success');
      await loadCurriculums();

    } catch (err) {
      editCurrModalAlert.className = 'alert alert-danger show';
      editCurrModalAlert.textContent = err.message || 'Lỗi khi cập nhật giáo trình';
    } finally {
      btnSubmitEditCurr.disabled = false;
      btnSubmitEditCurr.textContent = 'Lưu thay đổi';
    }
  });

  if (btnEditSelectedCurr) {
    btnEditSelectedCurr.addEventListener('click', () => {
      if (selectedCurriculum) openEditCurriculumModal(selectedCurriculum.id);
    });
  }
  if (btnDeleteSelectedCurr) {
    btnDeleteSelectedCurr.addEventListener('click', () => {
      if (selectedCurriculum) openDeleteCurriculumModal(selectedCurriculum.id);
    });
  }

  // ===========================================================================
  // 7. MODAL XÓA GIÁO TRÌNH (KIỂM TRA RÀNG BUỘC LỚP HỌC)
  // ===========================================================================
  async function openDeleteCurriculumModal(id) {
    const c = curriculumsList.find(item => item.id === id);
    if (!c) return;

    pendingDeleteCurriculumId = id;
    deleteCurrLoading.style.display = 'block';
    deleteCurrContent.style.display = 'none';
    deleteCurrBlocked.style.display = 'none';
    deleteCurrAllowed.style.display = 'none';
    btnConfirmDeleteCurr.style.display = 'none';

    modalDeleteCurriculum.classList.add('active');

    try {
      const stats = await window.Admin.getCurriculumUsageStats(id);
      deleteCurrLoading.style.display = 'none';
      deleteCurrContent.style.display = 'block';

      if (!stats.can_delete) {
        // Có lớp đang dùng -> Chặn xóa
        deleteCurrBlocked.style.display = 'block';
        const classNamesStr = Array.isArray(stats.class_names) ? stats.class_names.join(', ') : '';
        deleteCurrBlockedMsg.innerHTML = `
          Giáo trình <strong>"${c.title}"</strong> hiện đang được gán cho <strong>${stats.class_count} lớp học</strong>:
          <br><strong style="color: #b91c1c;">${classNamesStr}</strong>.
          <br><br>Hệ thống không cho phép xóa giáo trình đang có học sinh theo học để bảo toàn dữ liệu trọn đời.
        `;
        btnConfirmDeleteCurr.style.display = 'none';
      } else {
        // Được phép xóa
        deleteCurrAllowed.style.display = 'block';
        deleteCurrName.textContent = `"${c.title}" (${c.code})`;
        deleteCurrStatsList.innerHTML = `
          <li><strong>${stats.lesson_count || 0}</strong> bài học thuộc giáo trình</li>
          <li><strong>${stats.vocab_link_count || 0}</strong> liên kết từ vựng trong các bài</li>
          <li><strong>${stats.progress_count || 0}</strong> bản ghi lịch sử tiến độ học tập liên quan</li>
          ${stats.slide_count > 0 ? `<li><strong>${stats.slide_count}</strong> file slide bài giảng trong Storage (sẽ tự động dọn dẹp)</li>` : ''}
          ${stats.recording_count > 0 ? `<li><strong>${stats.recording_count}</strong> bản ghi âm nộp bài liên quan</li>` : ''}
        `;
        btnConfirmDeleteCurr.style.display = 'inline-flex';
      }
    } catch (err) {
      deleteCurrLoading.innerHTML = `<span style="color: red;">Lỗi kiểm tra dữ liệu: ${err.message}</span>`;
    }
  }

  document.querySelectorAll('[data-close="modal-delete-curriculum"]').forEach(b => {
    b.addEventListener('click', () => modalDeleteCurriculum.classList.remove('active'));
  });

  btnConfirmDeleteCurr.addEventListener('click', async () => {
    if (!pendingDeleteCurriculumId) return;
    try {
      btnConfirmDeleteCurr.disabled = true;
      btnConfirmDeleteCurr.textContent = 'Đang xóa...';

      const res = await window.Admin.deleteCurriculum(pendingDeleteCurriculumId);
      modalDeleteCurriculum.classList.remove('active');
      showAlert(res.message || 'Đã xóa giáo trình thành công!', 'success');

      if (selectedCurriculum && selectedCurriculum.id === pendingDeleteCurriculumId) {
        selectedCurriculum = null;
      }
      await loadCurriculums();

    } catch (err) {
      alert(err.message || 'Lỗi khi xóa giáo trình');
    } finally {
      btnConfirmDeleteCurr.disabled = false;
      btnConfirmDeleteCurr.textContent = '🗑️ Xác nhận xóa vĩnh viễn';
    }
  });

  // ===========================================================================
  // 8. MODAL THÊM BÀI HỌC MỚI
  // ===========================================================================
  btnOpenCreateLesson.addEventListener('click', async () => {
    if (!selectedCurriculum) return;
    lessonModalAlert.className = 'alert';
    lessonModalAlert.textContent = '';
    formCreateLesson.reset();

    const lessons = await window.Admin.getLessonsByCurriculum(selectedCurriculum.id);
    lessonOrderInput.value = (lessons ? lessons.length : 0) + 1;
    modalCreateLesson.classList.add('active');
  });

  document.querySelectorAll('[data-close="modal-create-lesson"]').forEach(b => {
    b.addEventListener('click', () => modalCreateLesson.classList.remove('active'));
  });

  formCreateLesson.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!selectedCurriculum) return;

    const orderIndex = lessonOrderInput.value;
    const titleZh = document.getElementById('lesson-title-zh').value.trim();
    const titleVi = document.getElementById('lesson-title-vi').value.trim();
    const description = document.getElementById('lesson-description').value.trim();
    const rewardXp = document.getElementById('lesson-xp').value;
    const passScore = document.getElementById('lesson-pass-score').value;

    try {
      btnSubmitLesson.disabled = true;
      btnSubmitLesson.textContent = 'Đang lưu...';

      await window.Admin.createLesson({
        curriculumId: selectedCurriculum.id,
        orderIndex,
        titleZh,
        titleVi,
        description,
        rewardXp,
        passScore
      });

      modalCreateLesson.classList.remove('active');
      showAlert(`Đã thêm Bài ${orderIndex}: ${titleZh} vào giáo trình!`, 'success');
      await loadLessons(selectedCurriculum.id);
      await loadCurriculums();

    } catch (err) {
      lessonModalAlert.className = 'alert alert-danger show';
      lessonModalAlert.textContent = err.message || 'Lỗi khi lưu bài học';
    } finally {
      btnSubmitLesson.disabled = false;
      btnSubmitLesson.textContent = 'Lưu bài học';
    }
  });

  // ===========================================================================
  // 9. MODAL CHỈNH SỬA BÀI HỌC
  // ===========================================================================
  function openEditLessonModal(lessonId) {
    const l = currentLessonsList.find(x => x.id === lessonId);
    if (!l) return;

    editLessonModalAlert.className = 'alert';
    editLessonModalAlert.textContent = '';
    formEditLesson.reset();

    document.getElementById('edit-lesson-id').value = l.id;
    document.getElementById('edit-lesson-title-zh').value = l.title_zh || '';
    document.getElementById('edit-lesson-title-vi').value = l.title_vi || '';
    document.getElementById('edit-lesson-description').value = l.description || '';
    document.getElementById('edit-lesson-xp').value = l.reward_xp || 50;
    document.getElementById('edit-lesson-pass-score').value = l.pass_score_percent || 80;

    const vocabCount = l.vocab_count !== undefined ? l.vocab_count : (l.total_vocabularies || 0);
    const slideCount = l.slide_count !== undefined ? l.slide_count : 0;
    const assignCount = l.assignment_count !== undefined ? l.assignment_count : 0;

    const vocabCountEl = document.getElementById('edit-lesson-vocab-count');
    const slideCountEl = document.getElementById('edit-lesson-slide-count');
    const assignCountEl = document.getElementById('edit-lesson-assign-count');
    if (vocabCountEl) vocabCountEl.textContent = `${vocabCount} từ`;
    if (slideCountEl) slideCountEl.textContent = `${slideCount} slide`;
    if (assignCountEl) assignCountEl.textContent = `${assignCount} bài`;

    const btnVocab = document.getElementById('edit-lesson-btn-vocab');
    const btnSlide = document.getElementById('edit-lesson-btn-slide');
    const btnAssign = document.getElementById('edit-lesson-btn-assign');

    if (btnVocab) {
      btnVocab.onclick = () => {
        modalEditLesson.classList.remove('active');
        openLessonVocabModal(l.id);
      };
    }
    if (btnSlide) {
      btnSlide.onclick = () => {
        modalEditLesson.classList.remove('active');
        openLessonSlidesModal(l.id);
      };
    }
    if (btnAssign) {
      btnAssign.onclick = () => {
        modalEditLesson.classList.remove('active');
        openLessonAssignmentsModal(l.id);
      };
    }

    modalEditLesson.classList.add('active');
  }

  document.querySelectorAll('[data-close="modal-edit-lesson"]').forEach(b => {
    b.addEventListener('click', () => modalEditLesson.classList.remove('active'));
  });

  formEditLesson.addEventListener('submit', async function (e) {
    e.preventDefault();
    const lessonId = document.getElementById('edit-lesson-id').value;
    const titleZh = document.getElementById('edit-lesson-title-zh').value.trim();
    const titleVi = document.getElementById('edit-lesson-title-vi').value.trim();
    const description = document.getElementById('edit-lesson-description').value.trim();
    const rewardXp = document.getElementById('edit-lesson-xp').value;
    const passScore = document.getElementById('edit-lesson-pass-score').value;

    try {
      btnSubmitEditLesson.disabled = true;
      btnSubmitEditLesson.textContent = 'Đang lưu...';

      await window.Admin.updateLesson(lessonId, {
        titleZh,
        titleVi,
        description,
        rewardXp,
        passScore
      });

      modalEditLesson.classList.remove('active');
      showAlert(`Đã cập nhật bài học "${titleZh}" thành công!`, 'success');
      await loadLessons(selectedCurriculum.id);

    } catch (err) {
      editLessonModalAlert.className = 'alert alert-danger show';
      editLessonModalAlert.textContent = err.message || 'Lỗi khi cập nhật bài học';
    } finally {
      btnSubmitEditLesson.disabled = false;
      btnSubmitEditLesson.textContent = 'Lưu thay đổi';
    }
  });

  // ===========================================================================
  // 10. MODAL XÓA BÀI HỌC (KIỂM TRA DỮ LIỆU LIÊN QUAN)
  // ===========================================================================
  async function openDeleteLessonModal(lessonId) {
    const l = currentLessonsList.find(x => x.id === lessonId);
    if (!l) return;

    pendingDeleteLessonId = lessonId;
    deleteLessonLoading.style.display = 'block';
    deleteLessonContent.style.display = 'none';
    btnConfirmDeleteLesson.style.display = 'none';

    modalDeleteLesson.classList.add('active');

    try {
      const stats = await window.Admin.getLessonUsageStats(lessonId);
      deleteLessonLoading.style.display = 'none';
      deleteLessonContent.style.display = 'block';

      deleteLessonName.textContent = `Bài ${l.order_index}: ${l.title_zh} (${l.title_vi})`;
      deleteLessonStatsList.innerHTML = `
        <li><strong>${stats.vocab_count || 0}</strong> từ vựng đang được gán trong bài</li>
        <li><strong>${stats.progress_count || 0}</strong> lượt theo dõi tiến độ bài học của học sinh</li>
        <li><strong>${stats.assignment_count || 0}</strong> bài tập về nhà liên quan</li>
        <li><strong>${stats.recording_count || 0}</strong> bản ghi âm nộp liên quan</li>
      `;
      btnConfirmDeleteLesson.style.display = 'inline-flex';

    } catch (err) {
      deleteLessonLoading.innerHTML = `<span style="color: red;">Lỗi kiểm tra bài học: ${err.message}</span>`;
    }
  }

  document.querySelectorAll('[data-close="modal-delete-lesson"]').forEach(b => {
    b.addEventListener('click', () => modalDeleteLesson.classList.remove('active'));
  });

  btnConfirmDeleteLesson.addEventListener('click', async () => {
    if (!pendingDeleteLessonId) return;
    try {
      btnConfirmDeleteLesson.disabled = true;
      btnConfirmDeleteLesson.textContent = 'Đang xóa...';

      const res = await window.Admin.deleteLesson(pendingDeleteLessonId);
      modalDeleteLesson.classList.remove('active');
      showAlert(res.message || 'Đã xóa bài học thành công!', 'success');

      await loadLessons(selectedCurriculum.id);
      await loadCurriculums();

    } catch (err) {
      alert(err.message || 'Lỗi khi xóa bài học');
    } finally {
      btnConfirmDeleteLesson.disabled = false;
      btnConfirmDeleteLesson.textContent = '🗑️ Xác nhận xóa bài';
    }
  });

  // ===========================================================================
  // 11. MODAL QUẢN LÝ TỪ VỰNG TRONG BÀI (XEM, GỠ LẺ, GỠ HÀNG LOẠT)
  // ===========================================================================
  async function openLessonVocabModal(lessonId) {
    activeLessonForVocab = currentLessonsList.find(x => x.id === lessonId);
    if (!activeLessonForVocab) return;

    modalLessonVocabTitle.textContent = `Từ vựng trong Bài ${activeLessonForVocab.order_index}: ${activeLessonForVocab.title_zh}`;
    modalLessonVocabMeta.textContent = `${activeLessonForVocab.title_vi} · Giáo trình: ${selectedCurriculum ? selectedCurriculum.title : ''}`;
    lessonVocabAlert.className = 'alert';
    lessonVocabAlert.textContent = '';
    checkAllLessonVocab.checked = false;
    btnBatchRemoveVocab.style.display = 'none';

    modalLessonVocabularies.classList.add('active');
    await loadLessonVocabulariesList(lessonId);
  }

  async function loadLessonVocabulariesList(lessonId) {
    try {
      lessonVocabTableBody.innerHTML = `
        <tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">
          Đang tải từ vựng...
        </td></tr>
      `;

      currentLessonVocabList = await window.Admin.getLessonVocabularies(lessonId);

      if (!currentLessonVocabList || currentLessonVocabList.length === 0) {
        lessonVocabTableBody.innerHTML = `
          <tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Bài học này chưa có từ vựng nào. Hãy bấm <strong>"➕ Thêm từ từ kho"</strong>!
          </td></tr>
        `;
        checkAllLessonVocab.checked = false;
        btnBatchRemoveVocab.style.display = 'none';
        return;
      }

      const totalWords = currentLessonVocabList.length;

      lessonVocabTableBody.innerHTML = currentLessonVocabList.map((v, index) => {
        const isFirst = (index === 0);
        const isLast = (index === totalWords - 1);

        return `
        <tr data-vocab-id="${v.id}" data-link-id="${v.linkId}">
          <td style="text-align: center;">
            <input type="checkbox" class="chk-lesson-vocab" value="${v.id}" style="width: 16px; height: 16px;">
          </td>
          <td style="text-align: center;">
            <div style="display: inline-flex; align-items: center; gap: 3px;">
              <span style="font-size: 12px; font-weight: 700; color: var(--text-muted); min-width: 18px;">${index + 1}</span>
              <div style="display: inline-flex; flex-direction: column; gap: 1px;">
                <button type="button" class="btn btn-outline btn-sm btn-reorder-vocab-up" data-index="${index}" style="height: 16px; width: 20px; padding: 0; line-height: 1; font-size: 9px;" ${isFirst ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Đổi lên">▲</button>
                <button type="button" class="btn btn-outline btn-sm btn-reorder-vocab-down" data-index="${index}" style="height: 16px; width: 20px; padding: 0; line-height: 1; font-size: 9px;" ${isLast ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Đổi xuống">▼</button>
              </div>
            </div>
          </td>
          <td style="font-size: 18px; font-weight: 700; color: var(--primary); font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;">
            ${v.hanzi}
          </td>
          <td style="font-weight: 600; color: var(--text-muted);">${v.pinyin}</td>
          <td>${v.meaning_vi}</td>
          <td><span class="badge-hsk badge-hsk-${v.hsk_level || 1}">HSK ${v.hsk_level || 1}</span></td>
          <td style="text-align: right;">
            <button type="button" class="btn btn-outline btn-sm btn-remove-single-word" data-link-id="${v.linkId}" data-hanzi="${v.hanzi}" style="padding: 2px 7px; font-size: 12px; color: var(--danger); border-color: #fca5a5;" title="Gỡ từ khỏi bài">
              ❌
            </button>
          </td>
        </tr>
      `}).join('');

      // Gắn sự kiện đổi thứ tự từ vựng (Lên / Xuống)
      document.querySelectorAll('.btn-reorder-vocab-up').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          if (idx <= 0) return;
          const temp = currentLessonVocabList[idx];
          currentLessonVocabList[idx] = currentLessonVocabList[idx - 1];
          currentLessonVocabList[idx - 1] = temp;
          await saveVocabOrder(lessonId);
        });
      });

      document.querySelectorAll('.btn-reorder-vocab-down').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          if (idx >= currentLessonVocabList.length - 1) return;
          const temp = currentLessonVocabList[idx];
          currentLessonVocabList[idx] = currentLessonVocabList[idx + 1];
          currentLessonVocabList[idx + 1] = temp;
          await saveVocabOrder(lessonId);
        });
      });

      // Gắn sự kiện checkbox từng dòng
      document.querySelectorAll('.chk-lesson-vocab').forEach(chk => {
        chk.addEventListener('change', updateSelectedLessonVocabCount);
      });

      // Gắn sự kiện gỡ lẻ một từ
      document.querySelectorAll('.btn-remove-single-word').forEach(btn => {
        btn.addEventListener('click', async () => {
          const linkId = btn.getAttribute('data-link-id');
          const hanzi = btn.getAttribute('data-hanzi');
          if (confirm(`Bạn có chắc muốn gỡ từ "${hanzi}" khỏi bài học này không? (Từ vẫn được lưu trong Kho từ vựng)`)) {
            try {
              await window.Admin.removeWordFromLesson(linkId);
              await loadLessonVocabulariesList(lessonId);
              await loadLessons(selectedCurriculum.id);
            } catch (err) {
              alert('Lỗi gỡ từ: ' + err.message);
            }
          }
        });
      });

      updateSelectedLessonVocabCount();

    } catch (err) {
      console.error('Lỗi tải từ vựng bài học:', err);
      lessonVocabTableBody.innerHTML = `<tr><td colspan="7" style="color: red; text-align: center;">Lỗi tải từ vựng</td></tr>`;
    }
  }

  async function saveVocabOrder(lessonId) {
    try {
      const vocabIds = currentLessonVocabList.map(v => v.id);
      await window.Admin.reorderLessonVocabularies(lessonId, vocabIds);
      await loadLessonVocabulariesList(lessonId);
    } catch (err) {
      console.error('Lỗi lưu thứ tự từ vựng:', err);
      alert('Lỗi lưu thứ tự từ vựng: ' + (err.message || err));
    }
  }

  // Cập nhật số lượng checkbox từ vựng đã chọn
  function updateSelectedLessonVocabCount() {
    const checked = document.querySelectorAll('.chk-lesson-vocab:checked');
    const total = document.querySelectorAll('.chk-lesson-vocab');
    if (selectedVocabCount) selectedVocabCount.textContent = checked.length;

    if (checked.length > 0) {
      btnBatchRemoveVocab.style.display = 'inline-flex';
    } else {
      btnBatchRemoveVocab.style.display = 'none';
    }

    if (checkAllLessonVocab) {
      checkAllLessonVocab.checked = (total.length > 0 && checked.length === total.length);
    }
  }

  checkAllLessonVocab.addEventListener('change', () => {
    const isChecked = checkAllLessonVocab.checked;
    document.querySelectorAll('.chk-lesson-vocab').forEach(c => { c.checked = isChecked; });
    updateSelectedLessonVocabCount();
  });

  // Gỡ hàng loạt từ đã chọn
  btnBatchRemoveVocab.addEventListener('click', async () => {
    if (!activeLessonForVocab) return;
    const checked = Array.from(document.querySelectorAll('.chk-lesson-vocab:checked')).map(c => c.value);
    if (checked.length === 0) return;

    if (confirm(`Bạn có chắc muốn gỡ ${checked.length} từ vựng đã chọn khỏi bài học này?`)) {
      try {
        btnBatchRemoveVocab.disabled = true;
        btnBatchRemoveVocab.textContent = 'Đang gỡ...';

        await window.Admin.batchRemoveWordsFromLesson(activeLessonForVocab.id, checked);
        await loadLessonVocabulariesList(activeLessonForVocab.id);
      } catch (err) {
        alert('Lỗi gỡ từ: ' + err.message);
      } finally {
        btnBatchRemoveVocab.disabled = false;
        btnBatchRemoveVocab.textContent = `❌ Gỡ (${checked.length}) từ đã chọn`;
      }
    }
  });

  document.querySelectorAll('[data-close="modal-lesson-vocabularies"]').forEach(b => {
    b.addEventListener('click', () => modalLessonVocabularies.classList.remove('active'));
  });

  // ===========================================================================
  // 12. MODAL CHỌN TỪ TỪ KHO ĐỂ THÊM VÀO BÀI HỌC
  // ===========================================================================
  btnOpenAddVocabModal.addEventListener('click', async () => {
    if (!activeLessonForVocab) return;
    addVocabAlert.className = 'alert';
    addVocabAlert.textContent = '';
    searchWarehouseVocab.value = '';
    if (selectedCurriculum && selectedCurriculum.level && selectedCurriculum.level.startsWith('HSK')) {
      const lvlNum = selectedCurriculum.level.replace('HSK', '');
      filterWarehouseHsk.value = lvlNum;
    } else {
      filterWarehouseHsk.value = 'all';
    }
    checkAllWarehouseVocab.checked = false;
    btnConfirmAddWarehouseVocab.disabled = true;
    btnConfirmAddWarehouseVocab.textContent = '➕ Thêm (0) từ vào bài học';

    modalAddVocabToLesson.classList.add('active');
    await loadWarehouseVocabularies();
  });

  document.querySelectorAll('[data-close="modal-add-vocab-to-lesson"]').forEach(b => {
    b.addEventListener('click', () => modalAddVocabToLesson.classList.remove('active'));
  });

  const filterWarehousePos = document.getElementById('filter-warehouse-pos');
  let searchWarehouseDebounceTimer = null;

  btnSearchWarehouse.addEventListener('click', loadWarehouseVocabularies);
  searchWarehouseVocab.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadWarehouseVocabularies();
  });
  searchWarehouseVocab.addEventListener('input', () => {
    clearTimeout(searchWarehouseDebounceTimer);
    searchWarehouseDebounceTimer = setTimeout(() => {
      loadWarehouseVocabularies();
    }, 300);
  });
  filterWarehouseHsk.addEventListener('change', loadWarehouseVocabularies);
  if (filterWarehousePos) {
    filterWarehousePos.addEventListener('change', loadWarehouseVocabularies);
  }

  async function loadWarehouseVocabularies() {
    try {
      warehouseVocabTableBody.innerHTML = `
        <tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">
          Đang nạp từ vựng từ kho...
        </td></tr>
      `;

      const search = searchWarehouseVocab.value.trim();
      const hskLevel = filterWarehouseHsk.value;
      const pos = filterWarehousePos ? filterWarehousePos.value : 'all';

      const res = await window.Admin.getAllVocabularies({
        search,
        hskLevel: hskLevel === 'all' ? null : hskLevel
      });

      const existingVocabIds = new Set((currentLessonVocabList || []).map(v => v.id));
      let filtered = (res || []).filter(w => !existingVocabIds.has(w.id));

      if (pos && pos !== 'all') {
        const lowerPos = pos.toLowerCase();
        filtered = filtered.filter(w => (w.part_of_speech || '').toLowerCase().includes(lowerPos));
      }

      warehouseVocabCache = filtered;

      if (warehouseVocabCache.length === 0) {
        warehouseVocabTableBody.innerHTML = `
          <tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">
            Không có từ vựng nào mới phù hợp với bộ lọc (các từ khớp có thể đã nằm trong bài học này).
          </td></tr>
        `;
        checkAllWarehouseVocab.checked = false;
        updateSelectedWarehouseVocabCount();
        return;
      }

      // Kiểm tra xem các từ này đã từng xuất hiện ở bài khác trong cùng giáo trình chưa
      let dupMap = new Map();
      if (selectedCurriculum && activeLessonForVocab) {
        try {
          const wordIds = warehouseVocabCache.map(w => w.id);
          const dups = await window.Admin.checkDuplicateVocabInCurriculum(selectedCurriculum.id, activeLessonForVocab.id, wordIds);
          if (dups && dups.length > 0) {
            dups.forEach(d => dupMap.set(d.vocabulary_id, d));
          }
        } catch (e) {
          console.warn('Không thể kiểm tra trùng lặp từ vựng:', e);
        }
      }

      warehouseVocabTableBody.innerHTML = warehouseVocabCache.map(w => {
        const dup = dupMap.get(w.id);
        const dupBadge = dup
          ? `<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #fef3c7; color: #b45309; font-weight: 600; display: inline-block;">⚠️ Bài ${dup.other_lesson_order}: ${dup.other_lesson_title_zh}</span>`
          : `<span style="color: var(--text-muted); font-size: 11px;">Chưa gán</span>`;

        return `
        <tr>
          <td style="text-align: center;">
            <input type="checkbox" class="chk-warehouse-vocab" value="${w.id}" style="width: 16px; height: 16px;">
          </td>
          <td style="font-size: 18px; font-weight: 700; color: var(--primary); font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;">
            ${w.hanzi}
          </td>
          <td style="font-weight: 600; color: var(--text-muted);">${w.pinyin}</td>
          <td>${w.meaning_vi}</td>
          <td><span class="badge-hsk badge-hsk-${w.hsk_level || 1}">HSK ${w.hsk_level || 1}</span></td>
          <td>${dupBadge}</td>
        </tr>
      `}).join('');

      document.querySelectorAll('.chk-warehouse-vocab').forEach(c => {
        c.addEventListener('change', updateSelectedWarehouseVocabCount);
      });

      updateSelectedWarehouseVocabCount();

    } catch (err) {
      console.error('Lỗi tải từ trong kho:', err);
      warehouseVocabTableBody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">Lỗi tải dữ liệu</td></tr>`;
    }
  }

  function updateSelectedWarehouseVocabCount() {
    const checked = document.querySelectorAll('.chk-warehouse-vocab:checked');
    const total = document.querySelectorAll('.chk-warehouse-vocab');
    const count = checked.length;

    btnConfirmAddWarehouseVocab.textContent = `➕ Thêm (${count}) từ vào bài học`;
    btnConfirmAddWarehouseVocab.disabled = (count === 0);

    if (checkAllWarehouseVocab) {
      checkAllWarehouseVocab.checked = (total.length > 0 && count === total.length);
    }
  }

  checkAllWarehouseVocab.addEventListener('change', () => {
    const isChecked = checkAllWarehouseVocab.checked;
    document.querySelectorAll('.chk-warehouse-vocab').forEach(c => { c.checked = isChecked; });
    updateSelectedWarehouseVocabCount();
  });

  // Thêm các từ đã chọn vào bài học
  btnConfirmAddWarehouseVocab.addEventListener('click', async () => {
    if (!activeLessonForVocab) return;
    const checked = Array.from(document.querySelectorAll('.chk-warehouse-vocab:checked')).map(c => c.value);
    if (checked.length === 0) return;

    try {
      btnConfirmAddWarehouseVocab.disabled = true;
      btnConfirmAddWarehouseVocab.textContent = 'Đang thêm...';

      await window.Admin.batchAddWordsToLesson(activeLessonForVocab.id, checked);
      modalAddVocabToLesson.classList.remove('active');
      await loadLessonVocabulariesList(activeLessonForVocab.id);

    } catch (err) {
      addVocabAlert.className = 'alert alert-danger show';
      addVocabAlert.textContent = err.message || 'Lỗi thêm từ vào bài học';
    } finally {
      btnConfirmAddWarehouseVocab.disabled = false;
      btnConfirmAddWarehouseVocab.textContent = `➕ Thêm (${checked.length}) từ vào bài học`;
    }
  });

  // ===========================================================================
  // 13. QUẢN LÝ SLIDE BÀI GIẢNG (TẢI LÊN, XEM, XÓA & THEO DÕI DUNG LƯỢNG)
  // ===========================================================================
  const modalLessonSlides = document.getElementById('modal-lesson-slides');
  const modalSlideLessonTitle = document.getElementById('modal-slide-lesson-title');
  const modalSlideLessonMeta = document.getElementById('modal-slide-lesson-meta');
  const slideModalAlert = document.getElementById('slide-modal-alert');
  const slideStorageText = document.getElementById('slide-storage-text');
  const slideStorageBar = document.getElementById('slide-storage-bar');
  const formUploadSlide = document.getElementById('form-upload-slide');
  const slideTitleInput = document.getElementById('slide-title-input');
  const slideFileInput = document.getElementById('slide-file-input');
  const btnSubmitUploadSlide = document.getElementById('btn-submit-upload-slide');
  const slideListTableBody = document.getElementById('slide-list-table-body');
  let activeLessonForSlide = null;

  async function openLessonSlidesModal(lessonId) {
    activeLessonForSlide = currentLessonsList.find(x => x.id === lessonId);
    if (!activeLessonForSlide) return;

    modalSlideLessonTitle.textContent = `Slide Bài Giảng: Bài ${activeLessonForSlide.order_index} - ${activeLessonForSlide.title_zh}`;
    modalSlideLessonMeta.textContent = `${activeLessonForSlide.title_vi} · Giáo trình: ${selectedCurriculum ? selectedCurriculum.title : ''}`;
    slideModalAlert.className = 'alert';
    slideModalAlert.textContent = '';
    formUploadSlide.reset();

    modalLessonSlides.classList.add('active');
    await loadSlideStorageStats();
    await loadLessonSlidesList(lessonId);
  }

  document.querySelectorAll('[data-close="modal-lesson-slides"]').forEach(b => {
    b.addEventListener('click', () => modalLessonSlides.classList.remove('active'));
  });

  async function loadSlideStorageStats() {
    try {
      const stats = await window.Admin.getLessonSlidesStorageStats();
      if (!stats) return;
      const usedMb = stats.total_mb || 0;
      const quotaMb = stats.quota_mb || 1024;
      const percent = Math.min(100, stats.percent_used || 0);

      slideStorageText.textContent = `${usedMb} MB / ${quotaMb} MB (${percent}%) · ${stats.total_files || 0} file`;
      slideStorageBar.style.width = `${percent}%`;

      if (percent >= 90) {
        slideStorageBar.style.background = 'var(--danger, #ef4444)';
      } else if (percent >= 70) {
        slideStorageBar.style.background = '#f59e0b';
      } else {
        slideStorageBar.style.background = 'var(--primary, #2563eb)';
      }
    } catch (err) {
      console.warn('Lỗi lấy storage stats:', err);
      slideStorageText.textContent = 'Gói Free: 1,024 MB';
    }
  }

  let currentLessonSlidesList = [];

  async function loadLessonSlidesList(lessonId) {
    try {
      slideListTableBody.innerHTML = `
        <tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">
          Đang nạp danh sách slide...
        </td></tr>
      `;

      const slides = await window.Admin.getLessonSlides(lessonId);
      currentLessonSlidesList = slides || [];

      if (!currentLessonSlidesList || currentLessonSlidesList.length === 0) {
        slideListTableBody.innerHTML = `
          <tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">
            Bài học này chưa có slide nào. Hãy chọn file bên trên và bấm <strong>"Tải lên bài học"</strong>!
          </td></tr>
        `;
        return;
      }

      const totalSlides = currentLessonSlidesList.length;

      slideListTableBody.innerHTML = currentLessonSlidesList.map((s, index) => {
        const isFirst = (index === 0);
        const isLast = (index === totalSlides - 1);
        const isPdf = s.file_type === 'pdf';
        const typeBadge = isPdf
          ? `<span class="badge-status" style="background: #fee2e2; color: #dc2626; font-weight: 800; font-size: 11px;">PDF</span>`
          : `<span class="badge-status" style="background: #ffedd5; color: #ea580c; font-weight: 800; font-size: 11px;">PPTX</span>`;

        const sizeMb = s.file_size ? (s.file_size / (1024 * 1024)).toFixed(1) + ' MB' : '--';

        return `
          <tr data-slide-id="${s.id}">
            <td style="text-align: center;">
              <div style="display: inline-flex; align-items: center; gap: 3px;">
                <span style="font-size: 12px; font-weight: 700; color: var(--text-muted); min-width: 18px;">${index + 1}</span>
                <div style="display: inline-flex; flex-direction: column; gap: 1px;">
                  <button type="button" class="btn btn-outline btn-sm btn-reorder-slide-up" data-index="${index}" style="height: 16px; width: 20px; padding: 0; line-height: 1; font-size: 9px;" ${isFirst ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Đổi lên">▲</button>
                  <button type="button" class="btn btn-outline btn-sm btn-reorder-slide-down" data-index="${index}" style="height: 16px; width: 20px; padding: 0; line-height: 1; font-size: 9px;" ${isLast ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Đổi xuống">▼</button>
                </div>
              </div>
            </td>
            <td>${typeBadge}</td>
            <td style="font-weight: 600; color: var(--text-main);">${s.title}</td>
            <td style="font-size: 12px; color: var(--text-muted);">${sizeMb}</td>
            <td>
              <button type="button" class="btn btn-outline btn-sm btn-open-slide-file" data-path="${s.file_path}" style="padding: 3px 8px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                ${isPdf ? '👁️ Xem PDF' : '📥 Tải file'}
              </button>
            </td>
            <td style="text-align: right;">
              <button type="button" class="btn btn-outline btn-sm btn-delete-slide" data-id="${s.id}" data-title="${s.title}" style="padding: 3px 8px; font-size: 12px; color: var(--danger); border-color: #fca5a5;" title="Xóa slide">
                🗑️
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Gắn sự kiện đổi thứ tự slide (Lên / Xuống)
      document.querySelectorAll('.btn-reorder-slide-up').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          if (idx <= 0) return;
          const temp = currentLessonSlidesList[idx];
          currentLessonSlidesList[idx] = currentLessonSlidesList[idx - 1];
          currentLessonSlidesList[idx - 1] = temp;
          await saveSlideOrder(lessonId);
        });
      });

      document.querySelectorAll('.btn-reorder-slide-down').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          if (idx >= currentLessonSlidesList.length - 1) return;
          const temp = currentLessonSlidesList[idx];
          currentLessonSlidesList[idx] = currentLessonSlidesList[idx + 1];
          currentLessonSlidesList[idx + 1] = temp;
          await saveSlideOrder(lessonId);
        });
      });

      // Gắn sự kiện xem/tải file slide
      document.querySelectorAll('.btn-open-slide-file').forEach(btn => {
        btn.addEventListener('click', async () => {
          const path = btn.getAttribute('data-path');
          try {
            btn.textContent = 'Đang mở...';
            const url = await window.Admin.getSlideViewUrl(path);
            btn.textContent = '👁️ Xem / Tải';
            if (url) window.open(url, '_blank');
          } catch (err) {
            alert('Lỗi mở file slide: ' + err.message);
          }
        });
      });

      // Gắn sự kiện xóa slide
      document.querySelectorAll('.btn-delete-slide').forEach(btn => {
        btn.addEventListener('click', async () => {
          const slideId = btn.getAttribute('data-id');
          const title = btn.getAttribute('data-title');
          if (confirm(`Bạn có chắc chắn muốn xóa slide "${title}" khỏi bài học? Dung lượng lưu trữ sẽ được giải phóng ngay.`)) {
            try {
              await window.Admin.deleteLessonSlide(slideId);
              await loadLessonSlidesList(lessonId);
              await loadSlideStorageStats();
              await loadLessons(selectedCurriculum.id);
            } catch (err) {
              alert('Lỗi khi xóa slide: ' + err.message);
            }
          }
        });
      });

    } catch (err) {
      console.error('Lỗi tải danh sách slide:', err);
      slideListTableBody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">Lỗi tải slide</td></tr>`;
    }
  }

  async function saveSlideOrder(lessonId) {
    try {
      const slideIds = currentLessonSlidesList.map(s => s.id);
      await window.Admin.reorderLessonSlides(lessonId, slideIds);
      await loadLessonSlidesList(lessonId);
    } catch (err) {
      console.error('Lỗi lưu thứ tự slide:', err);
      alert('Lỗi lưu thứ tự slide: ' + (err.message || err));
    }
  }

  // Tải lên slide mới
  formUploadSlide.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!activeLessonForSlide) return;

    const title = slideTitleInput.value.trim();
    const file = slideFileInput.files[0];
    if (!file) {
      slideModalAlert.className = 'alert alert-danger show';
      slideModalAlert.textContent = 'Vui lòng chọn một file slide (.pdf, .pptx, .ppt)!';
      return;
    }

    try {
      btnSubmitUploadSlide.disabled = true;
      btnSubmitUploadSlide.textContent = 'Đang tải lên Supabase...';
      slideModalAlert.className = 'alert';
      slideModalAlert.textContent = '';

      await window.Admin.uploadLessonSlide({
        lessonId: activeLessonForSlide.id,
        title,
        file
      });

      slideModalAlert.className = 'alert alert-success show';
      slideModalAlert.textContent = `Tải lên slide "${title}" thành công!`;
      formUploadSlide.reset();

      await loadLessonSlidesList(activeLessonForSlide.id);
      await loadSlideStorageStats();
      await loadLessons(selectedCurriculum.id);

    } catch (err) {
      console.error('Lỗi tải slide lên:', err);
      slideModalAlert.className = 'alert alert-danger show';
      slideModalAlert.textContent = err.message || 'Lỗi khi tải slide lên';
    } finally {
      btnSubmitUploadSlide.disabled = false;
      btnSubmitUploadSlide.textContent = 'Tải lên bài học';
    }
  });

  // ===========================================================================
  // 14. QUẢN LÝ BÀI TẬP TRONG BÀI HỌC (TỪ VỰNG, NGHE, GHI ÂM, QUIZ)
  // ===========================================================================
  const modalLessonAssignments = document.getElementById('modal-lesson-assignments');
  const modalLessonAssignTitle = document.getElementById('modal-lesson-assign-title');
  const modalLessonAssignMeta = document.getElementById('modal-lesson-assign-meta');
  const lessonAssignAlert = document.getElementById('lesson-assign-alert');
  const lessonAssignmentsTableBody = document.getElementById('lesson-assignments-table-body');
  const btnOpenCreateAssignmentModal = document.getElementById('btn-open-create-assignment-modal');

  const modalCreateAssignment = document.getElementById('modal-create-assignment');
  const modalCreateAssignTitle = document.getElementById('modal-create-assign-title');
  const formCreateAssignment = document.getElementById('form-create-assignment');
  const createAssignAlert = document.getElementById('create-assign-alert');
  const assignIdInput = document.getElementById('assign-id');
  const assignTypeSelect = document.getElementById('assign-type');
  const assignTitleInput = document.getElementById('assign-title');
  const assignDescInput = document.getElementById('assign-desc');
  const assignXpInput = document.getElementById('assign-xp');
  const assignDueDateInput = document.getElementById('assign-due-date');
  const assignSpeakingFields = document.getElementById('assign-speaking-fields');
  const assignSpeakingPrompt = document.getElementById('assign-speaking-prompt');
  const assignSpeakingPinyin = document.getElementById('assign-speaking-pinyin');
  const assignSpeakingSampleAudio = document.getElementById('assign-speaking-sample-audio');
  const assignListeningFields = document.getElementById('assign-listening-fields');
  const assignListeningAudio = document.getElementById('assign-listening-audio');
  const assignListeningQuestions = document.getElementById('assign-listening-questions');
  const btnSubmitAssignment = document.getElementById('btn-submit-assignment');

  let activeLessonForAssign = null;
  let currentLessonAssignmentsList = [];

  async function openLessonAssignmentsModal(lessonId) {
    activeLessonForAssign = currentLessonsList.find(x => x.id === lessonId);
    if (!activeLessonForAssign) return;

    modalLessonAssignTitle.textContent = `Bài Tập: Bài ${activeLessonForAssign.order_index} - ${activeLessonForAssign.title_zh}`;
    modalLessonAssignMeta.textContent = `${activeLessonForAssign.title_vi} · Giáo trình: ${selectedCurriculum ? selectedCurriculum.title : ''}`;
    lessonAssignAlert.className = 'alert';
    lessonAssignAlert.textContent = '';

    modalLessonAssignments.classList.add('active');
    await loadLessonAssignmentsList(lessonId);
  }

  document.querySelectorAll('[data-close="modal-lesson-assignments"]').forEach(b => {
    b.addEventListener('click', () => modalLessonAssignments.classList.remove('active'));
  });

  async function loadLessonAssignmentsList(lessonId) {
    try {
      lessonAssignmentsTableBody.innerHTML = `
        <tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">
          Đang tải danh sách bài tập...
        </td></tr>
      `;

      const list = await window.Admin.getLessonAssignments(lessonId);
      currentLessonAssignmentsList = list || [];

      if (!currentLessonAssignmentsList || currentLessonAssignmentsList.length === 0) {
        lessonAssignmentsTableBody.innerHTML = `
          <tr><td colspan="5" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Bài học này chưa có bài tập nào. Hãy bấm <strong>"➕ Thêm bài tập mới"</strong> để giao bài cho học viên!
          </td></tr>
        `;
        return;
      }

      const totalAssigns = currentLessonAssignmentsList.length;

      lessonAssignmentsTableBody.innerHTML = currentLessonAssignmentsList.map((a, index) => {
        const isFirst = (index === 0);
        const isLast = (index === totalAssigns - 1);

        let typeBadge = '';
        if (a.assignment_type === 'speaking') {
          typeBadge = '<span class="badge" style="background: #dbeafe; color: #1e40af; font-weight: 700; font-size: 11px;">🎙️ Ghi âm</span>';
        } else if (a.assignment_type === 'listening') {
          typeBadge = '<span class="badge" style="background: #d1fae5; color: #065f46; font-weight: 700; font-size: 11px;">🎧 Nghe hiểu</span>';
        } else if (a.assignment_type === 'quiz') {
          typeBadge = '<span class="badge" style="background: #fef3c7; color: #92400e; font-weight: 700; font-size: 11px;">📝 Quiz</span>';
        } else {
          typeBadge = '<span class="badge" style="background: #f3e8ff; color: #6b21a8; font-weight: 700; font-size: 11px;">📖 Từ vựng</span>';
        }

        return `
          <tr data-assign-id="${a.id}">
            <td style="text-align: center;">
              <div style="display: inline-flex; align-items: center; gap: 3px;">
                <span style="font-size: 12px; font-weight: 700; color: var(--text-muted); min-width: 18px;">${index + 1}</span>
                <div style="display: inline-flex; flex-direction: column; gap: 1px;">
                  <button type="button" class="btn btn-outline btn-sm btn-reorder-assign-up" data-index="${index}" style="height: 16px; width: 20px; padding: 0; line-height: 1; font-size: 9px;" ${isFirst ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Đổi lên">▲</button>
                  <button type="button" class="btn btn-outline btn-sm btn-reorder-assign-down" data-index="${index}" style="height: 16px; width: 20px; padding: 0; line-height: 1; font-size: 9px;" ${isLast ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Đổi xuống">▼</button>
                </div>
              </div>
            </td>
            <td>${typeBadge}</td>
            <td>
              <div style="font-weight: 600; color: var(--text-main);">${a.title}</div>
              ${a.description ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${a.description}</div>` : ''}
            </td>
            <td><span style="color: #ca8a04; font-weight: 600;">+${a.reward_xp || 30} XP</span></td>
            <td style="text-align: right; white-space: nowrap;">
              <button type="button" class="btn btn-outline btn-sm btn-edit-assign" data-index="${index}" style="padding: 3px 8px; font-size: 12px;" title="Sửa bài tập">
                ✏️
              </button>
              <button type="button" class="btn btn-outline btn-sm btn-delete-assign" data-id="${a.id}" data-title="${a.title}" style="padding: 3px 8px; font-size: 12px; color: var(--danger); border-color: #fca5a5;" title="Xóa bài tập">
                🗑️
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Gắn sự kiện đổi thứ tự bài tập (Lên / Xuống)
      document.querySelectorAll('.btn-reorder-assign-up').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          if (idx <= 0) return;
          const temp = currentLessonAssignmentsList[idx];
          currentLessonAssignmentsList[idx] = currentLessonAssignmentsList[idx - 1];
          currentLessonAssignmentsList[idx - 1] = temp;
          await saveAssignOrder(lessonId);
        });
      });

      document.querySelectorAll('.btn-reorder-assign-down').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          if (idx >= currentLessonAssignmentsList.length - 1) return;
          const temp = currentLessonAssignmentsList[idx];
          currentLessonAssignmentsList[idx] = currentLessonAssignmentsList[idx + 1];
          currentLessonAssignmentsList[idx + 1] = temp;
          await saveAssignOrder(lessonId);
        });
      });

      // Gắn sự kiện sửa bài tập
      document.querySelectorAll('.btn-edit-assign').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          const item = currentLessonAssignmentsList[idx];
          if (item) openEditAssignmentModal(item);
        });
      });

      // Gắn sự kiện xóa bài tập
      document.querySelectorAll('.btn-delete-assign').forEach(btn => {
        btn.addEventListener('click', async () => {
          const aId = btn.getAttribute('data-id');
          const title = btn.getAttribute('data-title');
          if (confirm(`Bạn có chắc chắn muốn xóa bài tập "${title}" không?`)) {
            try {
              await window.Admin.deleteAssignment(aId);
              await loadLessonAssignmentsList(lessonId);
              await loadLessons(selectedCurriculum.id);
            } catch (err) {
              alert('Lỗi xóa bài tập: ' + err.message);
            }
          }
        });
      });

    } catch (err) {
      console.error('Lỗi tải bài tập:', err);
      lessonAssignmentsTableBody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center;">Lỗi tải bài tập</td></tr>`;
    }
  }

  async function saveAssignOrder(lessonId) {
    try {
      const assignIds = currentLessonAssignmentsList.map(a => a.id);
      await window.Admin.reorderLessonAssignments(lessonId, assignIds);
      await loadLessonAssignmentsList(lessonId);
    } catch (err) {
      console.error('Lỗi lưu thứ tự bài tập:', err);
      alert('Lỗi lưu thứ tự bài tập: ' + (err.message || err));
    }
  }

  // Toggle trường chuyên biệt theo loại bài tập
  function updateAssignmentTypeFields() {
    const type = assignTypeSelect.value;
    if (type === 'speaking') {
      assignSpeakingFields.style.display = 'block';
      assignListeningFields.style.display = 'none';
      assignSpeakingPrompt.required = true;
      assignListeningAudio.required = false;
      assignListeningQuestions.required = false;
    } else if (type === 'listening') {
      assignSpeakingFields.style.display = 'none';
      assignListeningFields.style.display = 'block';
      assignSpeakingPrompt.required = false;
      assignListeningAudio.required = true;
      assignListeningQuestions.required = true;
    } else {
      assignSpeakingFields.style.display = 'none';
      assignListeningFields.style.display = 'none';
      assignSpeakingPrompt.required = false;
      assignListeningAudio.required = false;
      assignListeningQuestions.required = false;
    }
  }

  assignTypeSelect.addEventListener('change', updateAssignmentTypeFields);

  // Mở modal thêm bài tập mới
  btnOpenCreateAssignmentModal.addEventListener('click', () => {
    formCreateAssignment.reset();
    assignIdInput.value = '';
    modalCreateAssignTitle.textContent = 'Thêm Bài Tập Mới';
    btnSubmitAssignment.textContent = 'Lưu bài tập';
    createAssignAlert.className = 'alert';
    createAssignAlert.textContent = '';
    assignXpInput.value = 30;
    updateAssignmentTypeFields();
    modalCreateAssignment.classList.add('active');
  });

  // Mở modal sửa bài tập
  function openEditAssignmentModal(item) {
    formCreateAssignment.reset();
    assignIdInput.value = item.id;
    modalCreateAssignTitle.textContent = 'Chỉnh Sửa Bài Tập';
    btnSubmitAssignment.textContent = 'Cập nhật bài tập';
    createAssignAlert.className = 'alert';
    createAssignAlert.textContent = '';

    assignTypeSelect.value = item.assignment_type || 'vocabulary';
    assignTitleInput.value = item.title || '';
    assignDescInput.value = item.description || '';
    assignXpInput.value = item.reward_xp || 30;

    if (item.due_date) {
      const dt = new Date(item.due_date);
      const localIso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      assignDueDateInput.value = localIso;
    } else {
      assignDueDateInput.value = '';
    }

    if (item.assignment_type === 'speaking') {
      assignSpeakingPrompt.value = item.speaking_prompt || '';
      assignSpeakingPinyin.value = item.speaking_pinyin || '';
      assignSpeakingSampleAudio.value = item.speaking_sample_audio_url || '';
    } else if (item.assignment_type === 'listening') {
      assignListeningAudio.value = item.listening_audio_url || '';
      if (item.listening_questions) {
        assignListeningQuestions.value = typeof item.listening_questions === 'string'
          ? item.listening_questions
          : JSON.stringify(item.listening_questions, null, 2);
      } else {
        assignListeningQuestions.value = '';
      }
    }

    updateAssignmentTypeFields();
    modalCreateAssignment.classList.add('active');
  }

  document.querySelectorAll('[data-close="modal-create-assignment"]').forEach(b => {
    b.addEventListener('click', () => modalCreateAssignment.classList.remove('active'));
  });

  // Lưu bài tập (Thêm mới hoặc Cập nhật)
  formCreateAssignment.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!activeLessonForAssign) return;

    const assignId = assignIdInput.value;
    const type = assignTypeSelect.value;
    const title = assignTitleInput.value.trim();
    const description = assignDescInput.value.trim();
    const rewardXp = parseInt(assignXpInput.value || 30, 10);
    const dueDate = assignDueDateInput.value ? new Date(assignDueDateInput.value).toISOString() : null;

    let speakingPrompt = null;
    let speakingPinyin = null;
    let speakingSampleAudioUrl = null;
    let listeningAudioUrl = null;
    let listeningQuestions = null;

    if (type === 'speaking') {
      speakingPrompt = assignSpeakingPrompt.value.trim();
      if (!speakingPrompt) {
        createAssignAlert.className = 'alert alert-danger show';
        createAssignAlert.textContent = 'Vui lòng nhập đoạn văn chữ Hán cần đọc!';
        return;
      }
      speakingPinyin = assignSpeakingPinyin.value.trim();
      speakingSampleAudioUrl = assignSpeakingSampleAudio.value.trim();
    } else if (type === 'listening') {
      listeningAudioUrl = assignListeningAudio.value.trim();
      if (!listeningAudioUrl) {
        createAssignAlert.className = 'alert alert-danger show';
        createAssignAlert.textContent = 'Vui lòng nhập URL file âm thanh bài nghe!';
        return;
      }
      const qText = assignListeningQuestions.value.trim();
      try {
        listeningQuestions = JSON.parse(qText);
      } catch (err) {
        createAssignAlert.className = 'alert alert-danger show';
        createAssignAlert.textContent = 'Định dạng câu hỏi trắc nghiệm không phải JSON hợp lệ: ' + err.message;
        return;
      }
    }

    try {
      btnSubmitAssignment.disabled = true;
      btnSubmitAssignment.textContent = 'Đang lưu...';
      createAssignAlert.className = 'alert';
      createAssignAlert.textContent = '';

      if (assignId) {
        // Cập nhật bài tập
        await window.Admin.updateAssignment(assignId, {
          title,
          description,
          dueDate,
          rewardXp,
          assignmentType: type,
          speakingPrompt,
          speakingPinyin,
          speakingSampleAudioUrl,
          listeningAudioUrl,
          listeningQuestions
        });
      } else {
        // Tạo bài tập mới gắn trực tiếp vào bài học
        const newSortOrder = (currentLessonAssignmentsList.length || 0) + 1;
        await window.Admin.createAssignment({
          classId: null,
          lessonId: activeLessonForAssign.id,
          title,
          description,
          dueDate,
          rewardXp,
          assignmentType: type,
          sortOrder: newSortOrder,
          speakingPrompt,
          speakingPinyin,
          speakingSampleAudioUrl,
          listeningAudioUrl,
          listeningQuestions
        });
      }

      modalCreateAssignment.classList.remove('active');
      await loadLessonAssignmentsList(activeLessonForAssign.id);
      await loadLessons(selectedCurriculum.id);

    } catch (err) {
      console.error('Lỗi khi lưu bài tập:', err);
      createAssignAlert.className = 'alert alert-danger show';
      createAssignAlert.textContent = err.message || 'Lỗi khi lưu bài tập';
    } finally {
      btnSubmitAssignment.disabled = false;
      btnSubmitAssignment.textContent = assignId ? 'Cập nhật bài tập' : 'Lưu bài tập';
    }
  });

  // Khởi chạy
  await loadCurriculums();
});
