/**
 * LOGIC QUẢN LÝ DANH SÁCH LỚP HỌC (admin/classes.html)
 */

document.addEventListener('DOMContentLoaded', async function () {
  // 1. Kiểm tra quyền truy cập (Admin hoặc Teacher)
  const authData = await window.Auth.requireAuth(['admin', 'teacher'], '../index.html');
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);

  const classesContainer = document.getElementById('classes-container');
  const pageAlert = document.getElementById('page-alert');
  const modalCreateClass = document.getElementById('modal-create-class');
  const btnOpenCreateClass = document.getElementById('btn-open-create-class');
  const formCreateClass = document.getElementById('form-create-class');
  const selectCurriculum = document.getElementById('class-curriculum');
  const inputStartDate = document.getElementById('class-start-date');
  const modalAlert = document.getElementById('modal-alert');
  const btnSubmitClass = document.getElementById('btn-submit-class');

  let curriculumsCache = [];
  let teachersCache = [];
  let classesList = [];

  // Edit Modal Elements
  const modalEditClass = document.getElementById('modal-edit-class');
  const formEditClass = document.getElementById('form-edit-class');
  const editClassId = document.getElementById('edit-class-id');
  const editClassName = document.getElementById('edit-class-name');
  const editClassCurriculum = document.getElementById('edit-class-curriculum');
  const editClassLevel = document.getElementById('edit-class-level');
  const editClassTeacher = document.getElementById('edit-class-teacher');
  const editClassStartDate = document.getElementById('edit-class-start-date');
  const editClassEndDate = document.getElementById('edit-class-end-date');
  const editClassUnlockMode = document.getElementById('edit-class-unlock-mode');
  const editClassStatus = document.getElementById('edit-class-status');
  const editClassModalAlert = document.getElementById('edit-class-modal-alert');
  const btnSubmitEditClass = document.getElementById('btn-submit-edit-class');

  // Delete Modal Elements
  const modalDeleteClass = document.getElementById('modal-delete-class');
  const deleteClassLoading = document.getElementById('delete-class-loading');
  const deleteClassContent = document.getElementById('delete-class-content');
  const deleteClassSafeRecommend = document.getElementById('delete-class-safe-recommend');
  const btnArchiveClassInstead = document.getElementById('btn-archive-class-instead');
  const deleteClassDisplayName = document.getElementById('delete-class-display-name');
  const deleteClassStatsList = document.getElementById('delete-class-stats-list');
  const inputConfirmDeleteClassName = document.getElementById('input-confirm-delete-class-name');
  const btnConfirmDeleteClass = document.getElementById('btn-confirm-delete-class');
  let pendingDeleteClassId = null;
  let pendingDeleteClassName = '';

  // Đặt ngày mặc định là hôm nay
  if (inputStartDate) {
    inputStartDate.value = new Date().toISOString().split('T')[0];
  }

  function showAlert(msg, type = 'danger') {
    pageAlert.className = `alert alert-${type} show`;
    pageAlert.textContent = msg;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showModalAlert(msg, type = 'danger') {
    modalAlert.className = `alert alert-${type} show`;
    modalAlert.textContent = msg;
  }

  function hideModalAlert() {
    modalAlert.className = 'alert';
    modalAlert.textContent = '';
  }

  // 2. Tải danh sách giáo trình và giáo viên
  async function loadCurriculumsDropdown() {
    try {
      curriculumsCache = await window.Admin.getCurriculums();
      if (!curriculumsCache || curriculumsCache.length === 0) {
        selectCurriculum.innerHTML = '<option value="">-- Chưa có giáo trình, vui lòng tạo trước --</option>';
        if (editClassCurriculum) editClassCurriculum.innerHTML = '<option value="">-- Chưa có giáo trình --</option>';
        return;
      }
      const opts = curriculumsCache.map(c => `
        <option value="${c.id}">${c.title} (${c.level}) - ${c.total_lessons || 0} bài</option>
      `).join('');
      selectCurriculum.innerHTML = opts;
      if (editClassCurriculum) editClassCurriculum.innerHTML = opts;
    } catch (err) {
      console.error('Lỗi tải giáo trình:', err);
      selectCurriculum.innerHTML = '<option value="">-- Lỗi tải danh sách giáo trình --</option>';
    }
  }

  async function loadTeachersDropdown() {
    try {
      teachersCache = await window.Admin.getTeachers();
      if (!editClassTeacher) return;
      let opts = '<option value="">-- Chưa chỉ định (Tự do) --</option>';
      opts += teachersCache.map(t => `
        <option value="${t.id}">${t.display_name || t.email} (${t.role === 'admin' ? 'Quản trị viên' : 'Giáo viên'})</option>
      `).join('');
      editClassTeacher.innerHTML = opts;
    } catch (err) {
      console.error('Lỗi tải danh sách giáo viên:', err);
    }
  }

  // 3. Tải danh sách lớp học và render ra grid cards
  async function loadClassesList() {
    const quickLbBtn = document.getElementById('btn-quick-leaderboard-classes');
    try {
      classesContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
          Đang tải danh sách lớp học...
        </div>
      `;

      const isTeacherOnly = authData.profile && authData.profile.role === 'teacher';

      // Ưu tiên RPC getTeacherAccessibleClasses (lọc theo quyền: Admin thấy hết, Giáo viên chỉ thấy lớp phụ trách)
      try {
        const rpcClasses = await window.Admin.getTeacherAccessibleClasses();
        classesList = (rpcClasses || []).map(c => ({
          ...c,
          curriculum: {
            id: c.curriculum_id,
            title: c.curriculum_title || 'Chưa gán giáo trình',
            total_lessons: c.total_lessons || 0
          },
          activeStudentCount: Number(c.active_student_count || 0)
        }));
      } catch (rpcErr) {
        // Fallback nếu DB chưa chạy Migration 27
        console.warn('Fallback getClasses (chưa chạy Migration 27):', rpcErr);
        const rawClasses = await window.Admin.getClasses();
        classesList = isTeacherOnly
          ? (rawClasses || []).filter(c => c.teacher_id === authData.user.id)
          : (rawClasses || []);
      }

      if (!classesList || classesList.length === 0) {
        if (quickLbBtn) quickLbBtn.style.display = 'none';
        classesContainer.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
            <div style="font-size: 40px; margin-bottom: 12px;">📚</div>
            <h3 style="margin-bottom: 8px;">${isTeacherOnly ? 'Bạn chưa được phân công lớp học nào' : 'Chưa có lớp học nào'}</h3>
            <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 16px;">
              ${isTeacherOnly
                ? 'Vui lòng liên hệ Quản trị viên để được phân công phụ trách lớp học.'
                : 'Hãy nhấn nút "Tạo Lớp Học Mới" ở trên để khởi tạo lớp đầu tiên cho học viên.'}
            </p>
          </div>
        `;
        return;
      }

      if (quickLbBtn) {
        quickLbBtn.href = `class-detail.html?id=${classesList[0].id}&tab=tab-leaderboard`;
        quickLbBtn.style.display = 'inline-flex';
      }

      classesContainer.innerHTML = classesList.map(cls => {
        let statusBadge = '<span class="badge-status badge-ongoing">Đang học</span>';
        if (cls.status === 'paused') {
          statusBadge = '<span class="badge-status badge-paused">Tạm dừng</span>';
        } else if (cls.status === 'completed') {
          statusBadge = '<span class="badge-status badge-completed">Đã kết thúc</span>';
        }

        const safeName = cls.name || 'Lớp chưa đặt tên';
        const safeNameAttr = String(safeName).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeLevel = cls.level || 'HSK1';
        const currTitle = (cls.curriculum && cls.curriculum.title) ? cls.curriculum.title : 'Chưa gán giáo trình';
        const totalLessons = (cls.curriculum && cls.curriculum.total_lessons) ? cls.curriculum.total_lessons : 0;

        return `
          <div class="class-card">
            <div class="class-card-header">
              <span class="class-card-title">${safeNameAttr}</span>
              ${statusBadge}
            </div>

            <div class="class-card-curriculum">
              📖 ${currTitle} (${safeLevel})
            </div>

            <div class="class-card-meta">
              <div>👥 Sĩ số: <strong>${cls.activeStudentCount || 0} học sinh</strong></div>
              <div>📍 Tiến độ lớp: <strong>Đang học Bài ${cls.current_lesson_order || 1} / ${totalLessons} bài</strong></div>
              <div>📅 Ngày mở lớp: ${cls.start_date ? new Date(cls.start_date).toLocaleDateString('vi-VN') : 'Chưa rõ'}</div>
              <div>⚙️ Chế độ mở bài: ${cls.unlock_mode === 'all_open' ? 'Mở toàn bộ' : 'Tuần tự theo bài'}</div>
            </div>

            <div style="margin-top: auto; padding-top: 14px; border-top: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <a href="class-detail.html?id=${cls.id}" class="btn btn-primary btn-sm" style="flex: 1; height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-weight: 700;">
                  ⚙️ Chi tiết lớp
                </a>
                <a href="class-detail.html?id=${cls.id}&tab=tab-leaderboard" class="btn btn-outline btn-sm" style="flex: 1; height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-weight: 700;">
                  🏆 Bảng xếp hạng
                </a>
              </div>
              <div style="display: flex; gap: 8px;">
                <button type="button" class="btn btn-outline btn-sm btn-edit-class" data-id="${cls.id}" style="flex: 1; height: 32px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 4px;" title="Chỉnh sửa thông tin lớp">
                  ✏️ Sửa lớp
                </button>
                <button type="button" class="btn btn-sm btn-delete-class" data-id="${cls.id}" data-name="${safeNameAttr}" style="flex: 1; height: 32px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 4px; border: 1.5px solid #fca5a5; background: rgba(239, 68, 68, 0.08); color: #dc2626;" title="Xóa lớp học">
                  🗑️ Xóa lớp
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Gắn sự kiện nút Sửa lớp
      document.querySelectorAll('.btn-edit-class').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          openEditClassModal(id);
        });
      });

      // Gắn sự kiện nút Xóa lớp
      document.querySelectorAll('.btn-delete-class').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          const name = btn.getAttribute('data-name');
          openDeleteClassModal(id, name);
        });
      });

    } catch (err) {
      console.error('Lỗi tải danh sách lớp:', err);
      classesContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 32px; background: var(--bg-card); border: 1px solid var(--danger-border); border-radius: var(--radius-md); color: var(--danger);">
          <div style="font-weight: 700; margin-bottom: 6px;">Không thể tải danh sách lớp học</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">${err.message || err}</div>
          <button type="button" id="btn-retry-load-classes" class="btn btn-outline btn-sm">🔄 Thử lại</button>
        </div>
      `;
      const retryBtn = document.getElementById('btn-retry-load-classes');
      if (retryBtn) retryBtn.addEventListener('click', loadClassesList);
    }
  }

  // 4. Mở / Đóng Modal
  btnOpenCreateClass.addEventListener('click', function () {
    hideModalAlert();
    formCreateClass.reset();
    if (inputStartDate) inputStartDate.value = new Date().toISOString().split('T')[0];
    modalCreateClass.classList.add('active');
  });

  document.querySelectorAll('[data-close="modal-create-class"]').forEach(btn => {
    btn.addEventListener('click', () => {
      modalCreateClass.classList.remove('active');
    });
  });

  // Đóng modal khi bấm ra ngoài nền xám
  modalCreateClass.addEventListener('click', function (e) {
    if (e.target === modalCreateClass) {
      modalCreateClass.classList.remove('active');
    }
  });

  // 5. Submit Tạo Lớp Mới
  formCreateClass.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideModalAlert();

    const name = document.getElementById('class-name').value.trim();
    const curriculumId = selectCurriculum.value;
    const level = document.getElementById('class-level').value;
    const startDate = inputStartDate.value;
    const unlockMode = document.getElementById('class-unlock-mode').value;

    if (!name || !curriculumId) {
      showModalAlert('Vui lòng điền tên lớp và chọn giáo trình.');
      return;
    }

    try {
      btnSubmitClass.disabled = true;
      btnSubmitClass.textContent = 'Đang tạo lớp...';

      await window.Admin.createClass({
        name,
        curriculumId,
        level,
        startDate,
        unlockMode
      });

      modalCreateClass.classList.remove('active');
      showAlert(`Tạo lớp "${name}" thành công!`, 'success');
      await loadClassesList();

    } catch (err) {
      showModalAlert(err.message || 'Lỗi khi tạo lớp học');
    } finally {
      btnSubmitClass.disabled = false;
      btnSubmitClass.textContent = 'Xác nhận tạo lớp';
    }
  });

  // ===========================================================================
  // 6. MODAL CHỈNH SỬA THÔNG TIN LỚP HỌC
  // ===========================================================================
  async function openEditClassModal(classId) {
    let cls = classesList.find(c => c.id === classId);
    if (!cls) {
      cls = await window.Admin.getClassById(classId);
    }
    if (!cls) return;

    editClassModalAlert.className = 'alert';
    editClassModalAlert.textContent = '';

    editClassId.value = cls.id;
    editClassName.value = cls.name || '';
    editClassCurriculum.value = cls.curriculum_id || '';
    editClassLevel.value = cls.level || 'HSK1';
    editClassTeacher.value = cls.teacher_id || '';
    editClassStartDate.value = cls.start_date || '';
    editClassEndDate.value = cls.end_date || '';
    editClassUnlockMode.value = cls.unlock_mode || 'sequential';
    editClassStatus.value = cls.status || 'ongoing';

    modalEditClass.classList.add('active');
  }

  document.querySelectorAll('[data-close="modal-edit-class"]').forEach(btn => {
    btn.addEventListener('click', () => modalEditClass.classList.remove('active'));
  });

  modalEditClass.addEventListener('click', function (e) {
    if (e.target === modalEditClass) modalEditClass.classList.remove('active');
  });

  formEditClass.addEventListener('submit', async function (e) {
    e.preventDefault();
    const classId = editClassId.value;
    const name = editClassName.value.trim();
    const curriculum_id = editClassCurriculum.value;
    const level = editClassLevel.value;
    const teacher_id = editClassTeacher.value || null;
    const start_date = editClassStartDate.value || null;
    const end_date = editClassEndDate.value || null;
    const unlock_mode = editClassUnlockMode.value;
    const status = editClassStatus.value;

    if (!name || !curriculum_id) {
      editClassModalAlert.className = 'alert alert-danger show';
      editClassModalAlert.textContent = 'Vui lòng nhập tên lớp và chọn giáo trình.';
      return;
    }

    try {
      btnSubmitEditClass.disabled = true;
      btnSubmitEditClass.textContent = 'Đang lưu thay đổi...';

      await window.Admin.updateClass(classId, {
        name,
        curriculum_id,
        level,
        teacher_id,
        start_date,
        end_date,
        unlock_mode,
        status
      });

      modalEditClass.classList.remove('active');
      showAlert(`Đã cập nhật thông tin lớp "${name}" thành công!`, 'success');
      await loadClassesList();

    } catch (err) {
      console.error('Lỗi cập nhật lớp:', err);
      editClassModalAlert.className = 'alert alert-danger show';
      editClassModalAlert.textContent = err.message || 'Lỗi khi cập nhật lớp học';
    } finally {
      btnSubmitEditClass.disabled = false;
      btnSubmitEditClass.textContent = 'Lưu thay đổi';
    }
  });

  // ===========================================================================
  // 7. MODAL XÓA LỚP HỌC (XÁC NHẬN BẰNG TÊN LỚP)
  // ===========================================================================
  async function openDeleteClassModal(classId, className) {
    pendingDeleteClassId = classId;
    pendingDeleteClassName = className || '';

    deleteClassLoading.style.display = 'block';
    deleteClassContent.style.display = 'none';
    deleteClassSafeRecommend.style.display = 'none';
    deleteClassDisplayName.textContent = pendingDeleteClassName;
    inputConfirmDeleteClassName.value = '';
    btnConfirmDeleteClass.disabled = true;
    btnConfirmDeleteClass.style.opacity = '0.5';
    btnConfirmDeleteClass.style.cursor = 'not-allowed';

    modalDeleteClass.classList.add('active');

    try {
      const stats = await window.Admin.getClassUsageStats(classId);
      deleteClassLoading.style.display = 'none';
      deleteClassContent.style.display = 'block';

      if (stats.has_data) {
        deleteClassSafeRecommend.style.display = 'block';
      }

      deleteClassStatsList.innerHTML = `
        <li><strong>${stats.student_count || 0}</strong> học sinh đang ghi danh trong lớp</li>
        <li><strong>${stats.assignment_count || 0}</strong> bài tập đã giao (${stats.submission_count || 0} lượt nộp)</li>
        <li><strong>${stats.recording_count || 0}</strong> bản ghi âm nộp bài trong Storage (sẽ xóa giải phóng bộ nhớ)</li>
        <li><strong>${stats.progress_count || 0}</strong> dòng tiến độ bài học của học sinh</li>
        <li><strong>${stats.xp_count || 0}</strong> giao dịch XP liên quan (sẽ gỡ mã lớp, học sinh giữ nguyên điểm XP trọn đời)</li>
      `;

    } catch (err) {
      console.error('Lỗi tra cứu thông tin lớp:', err);
      deleteClassLoading.innerHTML = `<span style="color: red;">Lỗi tra cứu dữ liệu lớp: ${err.message}</span>`;
    }
  }

  // Chuyển sang đã kết thúc (Lưu trữ an toàn)
  btnArchiveClassInstead.addEventListener('click', async function () {
    if (!pendingDeleteClassId) return;
    try {
      btnArchiveClassInstead.disabled = true;
      btnArchiveClassInstead.textContent = 'Đang lưu trữ...';

      await window.Admin.updateClass(pendingDeleteClassId, { status: 'completed' });
      modalDeleteClass.classList.remove('active');
      showAlert(`Đã chuyển lớp "${pendingDeleteClassName}" sang trạng thái "Đã kết thúc" thành công! Toàn bộ dữ liệu được lưu trữ an toàn.`, 'success');
      await loadClassesList();

    } catch (err) {
      alert('Lỗi khi lưu trữ lớp: ' + (err.message || err));
    } finally {
      btnArchiveClassInstead.disabled = false;
      btnArchiveClassInstead.textContent = '📦 Chuyển sang "Đã kết thúc" ngay';
    }
  });

  // Kiểm tra gõ đúng tên lớp để mở khóa nút xóa
  inputConfirmDeleteClassName.addEventListener('input', function () {
    const typed = inputConfirmDeleteClassName.value.trim().toLowerCase();
    const target = pendingDeleteClassName.trim().toLowerCase();

    if (typed === target && target.length > 0) {
      btnConfirmDeleteClass.disabled = false;
      btnConfirmDeleteClass.style.opacity = '1';
      btnConfirmDeleteClass.style.cursor = 'pointer';
    } else {
      btnConfirmDeleteClass.disabled = true;
      btnConfirmDeleteClass.style.opacity = '0.5';
      btnConfirmDeleteClass.style.cursor = 'not-allowed';
    }
  });

  document.querySelectorAll('[data-close="modal-delete-class"]').forEach(btn => {
    btn.addEventListener('click', () => modalDeleteClass.classList.remove('active'));
  });

  modalDeleteClass.addEventListener('click', function (e) {
    if (e.target === modalDeleteClass) modalDeleteClass.classList.remove('active');
  });

  // Xác nhận xóa vĩnh viễn lớp
  btnConfirmDeleteClass.addEventListener('click', async function () {
    if (!pendingDeleteClassId) return;
    try {
      btnConfirmDeleteClass.disabled = true;
      btnConfirmDeleteClass.textContent = 'Đang xóa sạch dữ liệu...';

      const res = await window.Admin.deleteClass(pendingDeleteClassId);
      modalDeleteClass.classList.remove('active');
      showAlert(res.message || `Đã xóa vĩnh viễn lớp "${pendingDeleteClassName}" thành công!`, 'success');
      await loadClassesList();

    } catch (err) {
      alert(err.message || 'Lỗi khi xóa lớp học');
    } finally {
      btnConfirmDeleteClass.disabled = false;
      btnConfirmDeleteClass.textContent = '🗑️ Xác nhận xóa vĩnh viễn';
    }
  });

  // Khởi chạy ban đầu
  await loadCurriculumsDropdown();
  await loadTeachersDropdown();
  await loadClassesList();
});
