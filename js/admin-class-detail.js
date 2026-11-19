/**
 * LOGIC CHI TIẾT LỚP HỌC (admin/class-detail.html)
 */

document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth(['admin', 'teacher'], '../index.html');
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);

  const urlParams = new URLSearchParams(window.location.search);
  const classId = urlParams.get('id');

  if (!classId) {
    alert('Không tìm thấy mã lớp học!');
    window.location.href = 'classes.html';
    return;
  }

  let currentClass = null;
  let curriculumLessons = [];
  let manualUnlocksMap = {};

  const pageAlert = document.getElementById('page-alert');
  const classDetailName = document.getElementById('class-detail-name');
  const classDetailCurriculum = document.getElementById('class-detail-curriculum');
  const classDetailStatusBadge = document.getElementById('class-detail-status-badge');

  // Stats elements
  const statStudentCount = document.getElementById('stat-student-count');
  const countStudentsTab = document.getElementById('count-students');
  const countAssignmentsTab = document.getElementById('count-assignments');
  const statCurrentLesson = document.getElementById('stat-current-lesson');
  const statUnlockMode = document.getElementById('stat-unlock-mode');
  const statStartDate = document.getElementById('stat-start-date');

  // Form & inputs
  const selectCurrentLesson = document.getElementById('select-current-lesson');
  const selectUnlockMode = document.getElementById('select-unlock-mode');
  const formUpdateProgress = document.getElementById('form-update-progress');
  const btnSaveProgress = document.getElementById('btn-save-progress');

  // Tables
  const studentsTableBody = document.getElementById('students-table-body');
  const classLessonsTableBody = document.getElementById('class-lessons-table-body');
  const assignmentsTableBody = document.getElementById('assignments-table-body');

  // Settings
  const settingClassName = document.getElementById('setting-class-name');
  const settingClassStatus = document.getElementById('setting-class-status');
  const formUpdateClassSettings = document.getElementById('form-update-class-settings');

  // Enroll Modal
  const modalEnrollStudent = document.getElementById('modal-enroll-student');
  const btnOpenEnrollModal = document.getElementById('btn-open-enroll-modal');
  const selectStudentToEnroll = document.getElementById('select-student-to-enroll');
  const enrollModalAlert = document.getElementById('enroll-modal-alert');
  const btnConfirmEnroll = document.getElementById('btn-confirm-enroll');

  // Assignment Modal
  const modalCreateAssignment = document.getElementById('modal-create-assignment');
  const btnOpenCreateAssignment = document.getElementById('btn-open-create-assignment');
  const formCreateAssignment = document.getElementById('form-create-assignment');
  const assignLessonSelect = document.getElementById('assign-lesson');
  const assignDueDate = document.getElementById('assign-due-date');
  const assignModalAlert = document.getElementById('assign-modal-alert');
  const btnSubmitAssignment = document.getElementById('btn-submit-assignment');

  // Promotion Modal (Lên cấp / Chuyển lớp)
  const modalPromoteStudent = document.getElementById('modal-promote-student');
  const formPromoteStudent = document.getElementById('form-promote-student');
  const promoteStudentName = document.getElementById('promote-student-name');
  const promoteCurrentClassName = document.getElementById('promote-current-class-name');
  const selectTargetClass = document.getElementById('select-target-class');
  const promoteNote = document.getElementById('promote-note');
  const promoteModalAlert = document.getElementById('promote-modal-alert');
  const btnSubmitPromote = document.getElementById('btn-submit-promote');
  let selectedStudentForPromote = null;

  function showAlert(msg, type = 'danger') {
    pageAlert.className = `alert alert-${type} show`;
    pageAlert.textContent = msg;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 1. Chuyển đổi các Tab
  const subnavBtns = document.querySelectorAll('.admin-subnav-btn[data-tab]');
  const tabPanes = document.querySelectorAll('.tab-pane');

  subnavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTabId = btn.getAttribute('data-tab');
      subnavBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.style.display = 'none');

      btn.classList.add('active');
      const targetPane = document.getElementById(targetTabId);
      if (targetPane) targetPane.style.display = 'block';
    });
  });

  // 2. Tải dữ liệu toàn bộ lớp học
  async function loadClassAllData() {
    try {
      currentClass = await window.Admin.getClassById(classId);
      if (!currentClass) {
        showAlert('Lớp học không tồn tại!');
        return;
      }

      // Render Header
      classDetailName.textContent = currentClass.name;
      const currTitle = currentClass.curriculum ? currentClass.curriculum.title : 'Chưa gán';
      classDetailCurriculum.textContent = `Giáo trình: ${currTitle} (${currentClass.level})`;

      let badgeHtml = '<span class="badge-status badge-ongoing">Đang học</span>';
      if (currentClass.status === 'paused') badgeHtml = '<span class="badge-status badge-paused">Tạm dừng</span>';
      else if (currentClass.status === 'completed') badgeHtml = '<span class="badge-status badge-completed">Đã kết thúc</span>';
      classDetailStatusBadge.innerHTML = badgeHtml;

      // Render Stats
      statCurrentLesson.textContent = `Bài ${currentClass.current_lesson_order || 1}`;
      statUnlockMode.textContent = currentClass.unlock_mode === 'all_open' ? 'Mở toàn bộ bài' : 'Tuần tự từng bài';
      statStartDate.textContent = currentClass.start_date ? new Date(currentClass.start_date).toLocaleDateString('vi-VN') : 'Chưa rõ';

      selectUnlockMode.value = currentClass.unlock_mode || 'sequential';
      settingClassName.value = currentClass.name;
      settingClassStatus.value = currentClass.status;

      // 3. Tải danh sách mở khóa thủ công và bài học
      if (currentClass.curriculum_id) {
        manualUnlocksMap = await window.Admin.getClassLessonUnlocks(classId);
        curriculumLessons = await window.Admin.getLessonsByCurriculum(currentClass.curriculum_id);

        selectCurrentLesson.innerHTML = curriculumLessons.map(l => `
          <option value="${l.order_index}">Bài ${l.order_index}: ${l.title_zh} (${l.title_vi})</option>
        `).join('');
        selectCurrentLesson.value = currentClass.current_lesson_order || 1;

        // Điền vào dropdown bài tập
        assignLessonSelect.innerHTML = '<option value="">-- Không gắn bài cụ thể --</option>' +
          curriculumLessons.map(l => `<option value="${l.id}">Bài ${l.order_index}: ${l.title_zh} (${l.title_vi})</option>`).join('');

        renderClassLessonsTable();
      }

      // 4. Tải danh sách học sinh & bài tập
      await loadClassStudentsList();
      await loadClassAssignmentsList();

    } catch (err) {
      console.error('Lỗi tải chi tiết lớp:', err);
      showAlert('Lỗi tải dữ liệu lớp học: ' + (err.message || err));
    }
  }

  // Render bảng bài học ở Tab 3 (có mở khóa thủ công)
  function renderClassLessonsTable() {
    if (!curriculumLessons || curriculumLessons.length === 0) {
      classLessonsTableBody.innerHTML = `
        <tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">
          Giáo trình này chưa có bài học nào.
        </td></tr>
      `;
      return;
    }

    const currentOrder = currentClass.current_lesson_order || 1;
    const isAllOpen = currentClass.unlock_mode === 'all_open';

    classLessonsTableBody.innerHTML = curriculumLessons.map(l => {
      let isUnlocked = false;
      let statusText = '';

      if (manualUnlocksMap[l.id] !== undefined) {
        isUnlocked = manualUnlocksMap[l.id];
        statusText = isUnlocked ? '<span style="color: var(--success); font-weight: 700;">🔓 Mở thủ công</span>'
                                : '<span style="color: var(--danger); font-weight: 700;">🔒 Khóa thủ công</span>';
      } else if (isAllOpen) {
        isUnlocked = true;
        statusText = '<span style="color: var(--success); font-weight: 600;">🟢 Đã mở (Toàn bộ)</span>';
      } else if (l.order_index < currentOrder) {
        isUnlocked = true;
        statusText = '<span style="color: var(--success); font-weight: 600;">🟢 Đã mở (Đã qua)</span>';
      } else if (l.order_index === currentOrder) {
        isUnlocked = true;
        statusText = '<span style="color: #d97706; font-weight: 700;">🟡 Đang học (Hiện tại)</span>';
      } else {
        isUnlocked = false;
        statusText = '<span style="color: var(--text-muted);">🔒 Đang khóa</span>';
      }

      const toggleActionBtn = isUnlocked ? `
        <button type="button" class="btn btn-outline btn-sm btn-toggle-unlock" data-lesson-id="${l.id}" data-action="lock" style="color: var(--danger); border-color: var(--danger);">
          Khóa bài 🔒
        </button>
      ` : `
        <button type="button" class="btn btn-outline btn-sm btn-toggle-unlock" data-lesson-id="${l.id}" data-action="unlock" style="color: var(--success); border-color: var(--success);">
          Mở bài 🔓
        </button>
      `;

      return `
        <tr>
          <td><strong>Bài ${l.order_index}</strong></td>
          <td style="font-size: 16px; font-weight: 600;">${l.title_zh}</td>
          <td>${l.title_vi}</td>
          <td>+${l.reward_xp || 50} XP</td>
          <td>${statusText}</td>
          <td style="text-align: right;">${toggleActionBtn}</td>
        </tr>
      `;
    }).join('');

    // Gắn sự kiện nút Mở / Khóa thủ công
    document.querySelectorAll('.btn-toggle-unlock').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lId = btn.getAttribute('data-lesson-id');
        const action = btn.getAttribute('data-action');
        const shouldUnlock = (action === 'unlock');

        try {
          btn.disabled = true;
          await window.Admin.setLessonUnlockForClass(classId, lId, shouldUnlock);
          manualUnlocksMap[lId] = shouldUnlock;
          showAlert(`Đã ${shouldUnlock ? 'MỞ KHÓA' : 'KHÓA'} bài học thành công!`, 'success');
          renderClassLessonsTable();
        } catch (err) {
          alert('Lỗi: ' + (err.message || err));
          btn.disabled = false;
        }
      });
    });
  }

  // Tải bảng học sinh ở Tab 2
  async function loadClassStudentsList() {
    try {
      const students = await window.Admin.getClassStudents(classId);

      statStudentCount.textContent = students.length;
      countStudentsTab.textContent = students.length;

      if (!students || students.length === 0) {
        studentsTableBody.innerHTML = `
          <tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Lớp học hiện chưa có học sinh nào. Hãy nhấn <strong>"Thêm Học Sinh Vào Lớp"</strong> ở trên!
          </td></tr>
        `;
        return;
      }

      studentsTableBody.innerHTML = students.map(st => `
        <tr>
          <td>
            <div style="font-weight: 600; color: var(--text-main);">${st.display_name || st.username}</div>
            <div style="font-size: 12px; color: var(--text-muted);">Streak: 🔥 ${st.current_streak || 0} ngày · ${(st.lifetime_xp || 0).toLocaleString()} XP</div>
          </td>
          <td><code>${st.username}</code></td>
          <td>${st.phone || '<span style="color: var(--text-light);">Chưa có</span>'}</td>
          <td>${st.joinedAt ? new Date(st.joinedAt).toLocaleDateString('vi-VN') : '--'}</td>
          <td><span class="badge-status badge-ongoing">${st.status === 'active' ? 'Đang học' : st.status}</span></td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end;">
              <button type="button" class="btn btn-primary btn-sm btn-promote-student" data-student-id="${st.id}" data-name="${st.display_name || st.username}">
                ⬆️ Lên HSK2 / Đổi lớp
              </button>
              <button type="button" class="btn btn-outline btn-sm btn-remove-student" data-enrollment-id="${st.enrollmentId}" data-name="${st.display_name || st.username}">
                Xóa
              </button>
            </div>
          </td>
        </tr>
      `).join('');

      // Gắn sự kiện nút Lên cấp / Đổi lớp
      document.querySelectorAll('.btn-promote-student').forEach(btn => {
        btn.addEventListener('click', async () => {
          const stId = btn.getAttribute('data-student-id');
          const stName = btn.getAttribute('data-name');
          selectedStudentForPromote = stId;

          promoteStudentName.textContent = stName;
          promoteCurrentClassName.textContent = currentClass.name;
          promoteModalAlert.className = 'alert';
          promoteModalAlert.textContent = '';
          selectTargetClass.innerHTML = '<option value="">Đang tải danh sách lớp...</option>';
          modalPromoteStudent.classList.add('active');

          try {
            const allClasses = await window.Admin.getClasses();
            // Lọc bỏ lớp hiện tại
            const otherClasses = (allClasses || []).filter(c => c.id !== classId);

            if (otherClasses.length === 0) {
              selectTargetClass.innerHTML = '<option value="">-- Chưa có lớp học nào khác. Vui lòng tạo lớp mới trước! --</option>';
              btnSubmitPromote.disabled = true;
            } else {
              selectTargetClass.innerHTML = otherClasses.map(c => `
                <option value="${c.id}">
                  ${c.name} (${c.level}) - ${c.curriculum ? c.curriculum.title : ''}
                </option>
              `).join('');
              btnSubmitPromote.disabled = false;
            }
          } catch (e) {
            selectTargetClass.innerHTML = '<option value="">Lỗi tải danh sách lớp</option>';
          }
        });
      });

      document.querySelectorAll('.btn-remove-student').forEach(btn => {
        btn.addEventListener('click', async () => {
          const enrollId = btn.getAttribute('data-enrollment-id');
          const studentName = btn.getAttribute('data-name');
          if (confirm(`Bạn có chắc chắn muốn xóa học sinh "${studentName}" ra khỏi lớp này?`)) {
            try {
              btn.disabled = true;
              btn.textContent = 'Đang xóa...';
              await window.Admin.removeStudentFromClass(enrollId);
              showAlert(`Đã xóa "${studentName}" khỏi lớp.`, 'success');
              await loadClassStudentsList();
            } catch (err) {
              alert('Lỗi: ' + (err.message || err));
              btn.disabled = false;
              btn.textContent = 'Xóa khỏi lớp';
            }
          }
        });
      });

    } catch (err) {
      console.error('Lỗi tải danh sách học sinh:', err);
      studentsTableBody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">Lỗi tải học sinh</td></tr>`;
    }
  }

  // Tải bảng bài tập ở Tab 4
  async function loadClassAssignmentsList() {
    try {
      const assignments = await window.Admin.getClassAssignments(classId);
      countAssignmentsTab.textContent = assignments.length;

      if (!assignments || assignments.length === 0) {
        assignmentsTableBody.innerHTML = `
          <tr><td colspan="5" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Lớp học này chưa có bài tập nào. Hãy nhấn <strong>"Giao Bài Tập Mới"</strong> ở trên!
          </td></tr>
        `;
        return;
      }

      assignmentsTableBody.innerHTML = assignments.map(a => {
        const lessonText = a.lesson ? `Bài ${a.lesson.order_index}: ${a.lesson.title_zh}` : '<span style="color: var(--text-light);">Tự do</span>';
        const dueFormatted = new Date(a.due_date).toLocaleString('vi-VN', {
          hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const isPastDue = new Date() > new Date(a.due_date);

        return `
          <tr>
            <td>
              <div style="font-weight: 700; color: var(--text-main);">${a.title}</div>
              <div style="font-size: 12px; color: var(--text-muted);">${a.description || ''}</div>
            </td>
            <td>${lessonText}</td>
            <td>
              <span style="${isPastDue ? 'color: var(--danger); font-weight: 600;' : ''}">
                ${dueFormatted} ${isPastDue ? '(Đã hết hạn)' : ''}
              </span>
            </td>
            <td><strong style="color: #ca8a04;">+${a.reward_xp || 30} XP</strong></td>
            <td>
              <span class="badge-status badge-ongoing">
                Đã nộp: ${a.completedCount} / ${statStudentCount.textContent} học sinh
              </span>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error('Lỗi tải bài tập:', err);
      assignmentsTableBody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center;">Lỗi tải bài tập</td></tr>`;
    }
  }

  // 5. Cập nhật tiến độ bài học của lớp
  formUpdateProgress.addEventListener('submit', async function (e) {
    e.preventDefault();
    const newLessonOrder = parseInt(selectCurrentLesson.value, 10);
    const newUnlockMode = selectUnlockMode.value;

    try {
      btnSaveProgress.disabled = true;
      btnSaveProgress.textContent = 'Đang lưu...';

      await window.Admin.updateClass(classId, {
        current_lesson_order: newLessonOrder,
        unlock_mode: newUnlockMode
      });

      showAlert('Đã cập nhật bài học hiện tại và chế độ mở khóa của lớp thành công!', 'success');
      await loadClassAllData();

    } catch (err) {
      showAlert(err.message || 'Lỗi khi cập nhật tiến độ');
    } finally {
      btnSaveProgress.disabled = false;
      btnSaveProgress.textContent = 'Lưu thay đổi tiến độ';
    }
  });

  // 6. Cập nhật Cài đặt Lớp (Tab 5)
  formUpdateClassSettings.addEventListener('submit', async function (e) {
    e.preventDefault();
    const name = settingClassName.value.trim();
    const status = settingClassStatus.value;

    if (!name) return;

    try {
      const btn = document.getElementById('btn-save-class-settings');
      btn.disabled = true;
      btn.textContent = 'Đang lưu...';

      await window.Admin.updateClass(classId, { name, status });
      showAlert('Đã cập nhật thông tin lớp học thành công!', 'success');
      await loadClassAllData();
      btn.disabled = false;
      btn.textContent = 'Lưu cài đặt';

    } catch (err) {
      showAlert(err.message || 'Lỗi lưu cài đặt');
    }
  });

  // 7. Modal Thêm Học Sinh Vào Lớp
  btnOpenEnrollModal.addEventListener('click', async function () {
    enrollModalAlert.className = 'alert';
    enrollModalAlert.textContent = '';
    selectStudentToEnroll.innerHTML = '<option value="">Đang tải danh sách học sinh...</option>';
    modalEnrollStudent.classList.add('active');

    try {
      const availableStudents = await window.Admin.getAvailableStudentsForClass(classId);
      if (!availableStudents || availableStudents.length === 0) {
        selectStudentToEnroll.innerHTML = '<option value="">-- Không còn học sinh nào chưa vào lớp --</option>';
        btnConfirmEnroll.disabled = true;
        return;
      }

      selectStudentToEnroll.innerHTML = availableStudents.map(s => `
        <option value="${s.id}">
          ${s.display_name} (@${s.username}) - ${s.phone || 'Không có SĐT'}
        </option>
      `).join('');
      btnConfirmEnroll.disabled = false;

    } catch (err) {
      selectStudentToEnroll.innerHTML = '<option value="">Lỗi tải danh sách học sinh</option>';
    }
  });

  document.querySelectorAll('[data-close="modal-enroll-student"]').forEach(btn => {
    btn.addEventListener('click', () => { modalEnrollStudent.classList.remove('active'); });
  });

  btnConfirmEnroll.addEventListener('click', async function () {
    const studentId = selectStudentToEnroll.value;
    if (!studentId) return;

    try {
      btnConfirmEnroll.disabled = true;
      btnConfirmEnroll.textContent = 'Đang thêm...';

      await window.Admin.enrollStudentToClass(studentId, classId);

      modalEnrollStudent.classList.remove('active');
      showAlert('Đã thêm học sinh vào lớp thành công!', 'success');
      await loadClassStudentsList();

    } catch (err) {
      enrollModalAlert.className = 'alert alert-danger show';
      enrollModalAlert.textContent = err.message || 'Lỗi khi thêm học sinh';
    } finally {
      btnConfirmEnroll.disabled = false;
      btnConfirmEnroll.textContent = 'Xác nhận thêm vào lớp';
    }
  });

  // 8. Modal Giao Bài Tập Mới
  btnOpenCreateAssignment.addEventListener('click', () => {
    assignModalAlert.className = 'alert';
    assignModalAlert.textContent = '';
    formCreateAssignment.reset();

    // Đặt hạn nộp mặc định là 22:00 hôm nay
    const tonight = new Date();
    tonight.setHours(22, 0, 0, 0);
    // Format YYYY-MM-DDTHH:mm
    const tzOffset = tonight.getTimezoneOffset() * 60000;
    const localISOTime = new Date(tonight.getTime() - tzOffset).toISOString().slice(0, 16);
    assignDueDate.value = localISOTime;

    modalCreateAssignment.classList.add('active');
  });

  document.querySelectorAll('[data-close="modal-create-assignment"]').forEach(btn => {
    btn.addEventListener('click', () => { modalCreateAssignment.classList.remove('active'); });
  });

  formCreateAssignment.addEventListener('submit', async function (e) {
    e.preventDefault();
    const title = document.getElementById('assign-title').value.trim();
    const lessonId = assignLessonSelect.value || null;
    const dueDate = assignDueDate.value;
    const rewardXp = document.getElementById('assign-xp').value;
    const description = document.getElementById('assign-desc').value.trim();

    try {
      btnSubmitAssignment.disabled = true;
      btnSubmitAssignment.textContent = 'Đang giao bài...';

      await window.Admin.createAssignment({
        classId,
        lessonId,
        title,
        dueDate: new Date(dueDate).toISOString(),
        rewardXp,
        description
      });

      modalCreateAssignment.classList.remove('active');
      showAlert(`Đã giao bài tập "${title}" cho cả lớp!`, 'success');
      await loadClassAssignmentsList();

    } catch (err) {
      assignModalAlert.className = 'alert alert-danger show';
      assignModalAlert.textContent = err.message || 'Lỗi giao bài tập';
    } finally {
      btnSubmitAssignment.disabled = false;
      btnSubmitAssignment.textContent = 'Xác nhận giao bài';
    }
  });

  // 9. Xử lý Chuyển lớp / Lên cấp HSK
  document.querySelectorAll('[data-close="modal-promote-student"]').forEach(btn => {
    btn.addEventListener('click', () => { modalPromoteStudent.classList.remove('active'); });
  });

  formPromoteStudent.addEventListener('submit', async function (e) {
    e.preventDefault();
    const targetClassId = selectTargetClass.value;
    const note = promoteNote.value.trim();

    if (!selectedStudentForPromote || !targetClassId) {
      promoteModalAlert.className = 'alert alert-danger show';
      promoteModalAlert.textContent = 'Vui lòng chọn lớp học đích!';
      return;
    }

    try {
      btnSubmitPromote.disabled = true;
      btnSubmitPromote.textContent = 'Đang chuyển lớp...';

      const res = await window.Admin.promoteOrTransferStudent(
        selectedStudentForPromote,
        classId,
        targetClassId,
        note
      );

      modalPromoteStudent.classList.remove('active');
      showAlert(`🎉 Đã chuyển học sinh sang lớp "${res.new_class}" thành công! Lịch sử lớp cũ đã được bảo lưu trọn vẹn.`, 'success');
      await loadClassStudentsList();

    } catch (err) {
      promoteModalAlert.className = 'alert alert-danger show';
      promoteModalAlert.textContent = err.message || 'Lỗi khi chuyển lớp';
    } finally {
      btnSubmitPromote.disabled = false;
      btnSubmitPromote.textContent = 'Xác nhận chuyển lớp';
    }
  });

  // Tải dữ liệu ban đầu
  await loadClassAllData();
});
