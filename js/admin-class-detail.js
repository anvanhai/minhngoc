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
  const settingClassCurriculum = document.getElementById('setting-class-curriculum');
  const settingClassLevel = document.getElementById('setting-class-level');
  const settingClassTeacher = document.getElementById('setting-class-teacher');
  const settingClassStartDate = document.getElementById('setting-class-start-date');
  const settingClassEndDate = document.getElementById('setting-class-end-date');
  const settingClassUnlockMode = document.getElementById('setting-class-unlock-mode');
  const settingClassStatus = document.getElementById('setting-class-status');
  const settingsTabAlert = document.getElementById('settings-tab-alert');
  const formUpdateClassSettings = document.getElementById('form-update-class-settings');
  const btnBannerEditClass = document.getElementById('btn-banner-edit-class');
  const btnBannerDeleteClass = document.getElementById('btn-banner-delete-class');
  const btnOpenDeleteClassTab = document.getElementById('btn-open-delete-class-tab');

  // Delete Modal
  const modalDeleteClass = document.getElementById('modal-delete-class');
  const deleteClassLoading = document.getElementById('delete-class-loading');
  const deleteClassContent = document.getElementById('delete-class-content');
  const deleteClassSafeRecommend = document.getElementById('delete-class-safe-recommend');
  const btnArchiveClassInstead = document.getElementById('btn-archive-class-instead');
  const deleteClassDisplayName = document.getElementById('delete-class-display-name');
  const deleteClassStatsList = document.getElementById('delete-class-stats-list');
  const inputConfirmDeleteClassName = document.getElementById('input-confirm-delete-class-name');
  const btnConfirmDeleteClass = document.getElementById('btn-confirm-delete-class');

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
      settingClassName.value = currentClass.name || '';
      if (settingClassCurriculum) settingClassCurriculum.value = currentClass.curriculum_id || '';
      if (settingClassLevel) settingClassLevel.value = currentClass.level || 'HSK1';
      if (settingClassTeacher) settingClassTeacher.value = currentClass.teacher_id || '';
      if (settingClassStartDate) settingClassStartDate.value = currentClass.start_date || '';
      if (settingClassEndDate) settingClassEndDate.value = currentClass.end_date || '';
      if (settingClassUnlockMode) settingClassUnlockMode.value = currentClass.unlock_mode || 'sequential';
      settingClassStatus.value = currentClass.status || 'ongoing';

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
          <tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">
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

        let typeBadge = '<span class="badge-status" style="background: rgba(74, 222, 128, 0.18); color: #16a34a;">📖 Từ vựng</span>';
        if (a.assignment_type === 'listening') {
          typeBadge = '<span class="badge-status" style="background: rgba(56, 189, 248, 0.18); color: #0284c7;">🎧 Nghe hiểu</span>';
        } else if (a.assignment_type === 'speaking') {
          typeBadge = '<span class="badge-status" style="background: rgba(248, 113, 113, 0.18); color: #dc2626;">🎙️ Nói / Ghi âm</span>';
        } else if (a.assignment_type === 'quiz') {
          typeBadge = '<span class="badge-status" style="background: rgba(168, 85, 247, 0.18); color: #9333ea;">📝 Quiz</span>';
        }

        return `
          <tr>
            <td>${typeBadge}</td>
            <td>
              <div style="font-weight: 700; color: var(--text-main);">${a.title}</div>
              <div style="font-size: 12px; color: var(--text-muted);">${a.description || ''}</div>
              ${a.speaking_prompt ? `<div style="font-size: 12px; color: var(--primary); margin-top: 2px;">💬 Đề: ${a.speaking_prompt}</div>` : ''}
            </td>
            <td>${lessonText}</td>
            <td>
              <span style="${isPastDue ? 'color: var(--danger); font-weight: 600;' : ''}">
                ${dueFormatted} ${isPastDue ? '(Đã hết hạn)' : ''}
              </span>
            </td>
            <td><strong style="color: #ca8a04;">+${a.reward_xp || 30} XP</strong></td>
            <td>
              <button type="button" class="btn btn-outline btn-sm btn-view-submissions" data-id="${a.id}" data-title="${encodeURIComponent(a.title)}" data-type="${a.assignment_type}">
                👥 ${a.completedCount} / ${statStudentCount.textContent} đã nộp
              </button>
            </td>
            <td style="text-align: right;">
              <button type="button" class="btn btn-outline btn-sm btn-delete-assignment" data-id="${a.id}" data-title="${encodeURIComponent(a.title)}" style="color: var(--danger); border-color: var(--danger-border);" title="Xóa bài tập này">
                🗑️ Xóa
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Gắn sự kiện Xem nộp bài
      document.querySelectorAll('.btn-view-submissions').forEach(btn => {
        btn.addEventListener('click', async () => {
          const assignId = btn.getAttribute('data-id');
          const assignTitle = decodeURIComponent(btn.getAttribute('data-title'));
          const assignType = btn.getAttribute('data-type');
          await openSubmissionsModal(assignId, assignTitle, assignType);
        });
      });

      // Gắn sự kiện Xóa bài tập
      document.querySelectorAll('.btn-delete-assignment').forEach(btn => {
        btn.addEventListener('click', async () => {
          const assignId = btn.getAttribute('data-id');
          const assignTitle = decodeURIComponent(btn.getAttribute('data-title'));
          if (confirm(`Bạn có chắc chắn muốn xóa bài tập "${assignTitle}"? Học sinh sẽ không thể nộp bài này nữa.`)) {
            try {
              btn.disabled = true;
              btn.textContent = 'Đang xóa...';
              await window.Admin.deleteAssignment(assignId);
              showAlert(`Đã xóa bài tập "${assignTitle}" thành công!`, 'success');
              await loadClassAssignmentsList();
            } catch (delErr) {
              alert('Lỗi xóa bài tập: ' + (delErr.message || delErr));
              btn.disabled = false;
              btn.textContent = '🗑️ Xóa';
            }
          }
        });
      });

    } catch (err) {
      console.error('Lỗi tải bài tập:', err);
      assignmentsTableBody.innerHTML = `<tr><td colspan="7" style="color: red; text-align: center;">Lỗi tải bài tập: ${err.message || err}</td></tr>`;
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
    if (settingsTabAlert) {
      settingsTabAlert.className = 'alert';
      settingsTabAlert.textContent = '';
    }

    const name = settingClassName.value.trim();
    const curriculum_id = settingClassCurriculum ? settingClassCurriculum.value : (currentClass ? currentClass.curriculum_id : null);
    const level = settingClassLevel ? settingClassLevel.value : (currentClass ? currentClass.level : 'HSK1');
    const teacher_id = settingClassTeacher ? (settingClassTeacher.value || null) : null;
    const start_date = settingClassStartDate ? (settingClassStartDate.value || null) : null;
    const end_date = settingClassEndDate ? (settingClassEndDate.value || null) : null;
    const unlock_mode = settingClassUnlockMode ? settingClassUnlockMode.value : 'sequential';
    const status = settingClassStatus.value;

    if (!name || !curriculum_id) {
      if (settingsTabAlert) {
        settingsTabAlert.className = 'alert alert-danger show';
        settingsTabAlert.textContent = 'Vui lòng nhập tên lớp và chọn giáo trình.';
      }
      return;
    }

    try {
      const btn = document.getElementById('btn-save-class-settings');
      btn.disabled = true;
      btn.textContent = 'Đang lưu cài đặt...';

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

      if (settingsTabAlert) {
        settingsTabAlert.className = 'alert alert-success show';
        settingsTabAlert.textContent = 'Đã cập nhật cài đặt lớp học thành công!';
      }
      showAlert(`Đã cập nhật thông tin lớp "${name}" thành công!`, 'success');
      await loadClassAllData();

    } catch (err) {
      console.error('Lỗi lưu cài đặt lớp:', err);
      if (settingsTabAlert) {
        settingsTabAlert.className = 'alert alert-danger show';
        settingsTabAlert.textContent = err.message || 'Lỗi lưu cài đặt';
      }
      showAlert(err.message || 'Lỗi lưu cài đặt');
    } finally {
      const btn = document.getElementById('btn-save-class-settings');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '💾 Lưu thay đổi cài đặt lớp';
      }
    }
  });

  // Chuyển nhanh sang tab Cài đặt từ Banner
  if (btnBannerEditClass) {
    btnBannerEditClass.addEventListener('click', () => {
      subnavBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.style.display = 'none');
      const settingsBtn = document.querySelector('[data-tab="tab-settings"]');
      if (settingsBtn) settingsBtn.classList.add('active');
      const settingsPane = document.getElementById('tab-settings');
      if (settingsPane) {
        settingsPane.style.display = 'block';
        settingsPane.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // Mở modal xóa lớp
  function openDeleteClassModal() {
    if (!currentClass) return;

    deleteClassLoading.style.display = 'block';
    deleteClassContent.style.display = 'none';
    deleteClassSafeRecommend.style.display = 'none';
    deleteClassDisplayName.textContent = currentClass.name;
    inputConfirmDeleteClassName.value = '';
    btnConfirmDeleteClass.disabled = true;
    btnConfirmDeleteClass.style.opacity = '0.5';
    btnConfirmDeleteClass.style.cursor = 'not-allowed';

    modalDeleteClass.classList.add('active');

    window.Admin.getClassUsageStats(classId).then(stats => {
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
    }).catch(err => {
      deleteClassLoading.innerHTML = `<span style="color: red;">Lỗi tra cứu dữ liệu: ${err.message}</span>`;
    });
  }

  if (btnBannerDeleteClass) btnBannerDeleteClass.addEventListener('click', openDeleteClassModal);
  if (btnOpenDeleteClassTab) btnOpenDeleteClassTab.addEventListener('click', openDeleteClassModal);

  // Đổi sang "Đã kết thúc" thay vì xóa
  btnArchiveClassInstead.addEventListener('click', async function () {
    try {
      btnArchiveClassInstead.disabled = true;
      btnArchiveClassInstead.textContent = 'Đang lưu trữ...';

      await window.Admin.updateClass(classId, { status: 'completed' });
      modalDeleteClass.classList.remove('active');
      showAlert(`Đã chuyển lớp "${currentClass.name}" sang trạng thái "Đã kết thúc" thành công! Toàn bộ dữ liệu được lưu trữ an toàn.`, 'success');
      await loadClassAllData();

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
    const target = (currentClass ? currentClass.name : '').trim().toLowerCase();

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
    try {
      btnConfirmDeleteClass.disabled = true;
      btnConfirmDeleteClass.textContent = 'Đang xóa sạch dữ liệu...';

      await window.Admin.deleteClass(classId);
      alert(`Đã xóa vĩnh viễn lớp "${currentClass.name}" thành công! Hệ thống chuyển về danh sách lớp.`);
      window.location.href = 'classes.html';

    } catch (err) {
      alert(err.message || 'Lỗi khi xóa lớp học');
    } finally {
      btnConfirmDeleteClass.disabled = false;
      btnConfirmDeleteClass.textContent = '🗑️ Xác nhận xóa vĩnh viễn';
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
  const assignTypeSelect = document.getElementById('assign-type');
  const assignSpeakingFields = document.getElementById('assign-speaking-fields');
  const assignListeningFields = document.getElementById('assign-listening-fields');
  const listeningQuestionsContainer = document.getElementById('listening-questions-container');
  const btnAddListeningQuestion = document.getElementById('btn-add-listening-question');

  let listeningQuestions = [];

  function renderListeningQuestions() {
    if (!listeningQuestionsContainer) return;
    if (listeningQuestions.length === 0) {
      listeningQuestionsContainer.innerHTML = `
        <div style="font-size: 12px; color: var(--text-muted); font-style: italic; padding: 8px; background: var(--bg-card); border-radius: var(--radius-sm);">
          Chưa có câu hỏi nào. Bấm "+ Thêm câu hỏi trắc nghiệm" bên dưới.
        </div>
      `;
      return;
    }

    listeningQuestionsContainer.innerHTML = listeningQuestions.map((q, idx) => `
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="font-size: 13px;">Câu ${idx + 1}:</strong>
          <button type="button" class="btn btn-outline btn-sm btn-remove-q" data-idx="${idx}" style="padding: 2px 8px; font-size: 11px; color: var(--danger); border-color: var(--danger-border);">Xóa câu</button>
        </div>
        <input type="text" class="form-control lq-title" data-idx="${idx}" placeholder="Nhập câu hỏi nghe..." value="${q.question || ''}" style="margin-bottom: 8px; font-size: 13px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          ${(q.options || ['', '', '', '']).map((opt, optIdx) => `
            <div style="display: flex; align-items: center; gap: 4px;">
              <input type="radio" name="lq_ans_${idx}" value="${optIdx}" ${q.answer === optIdx ? 'checked' : ''} class="lq-radio" data-qidx="${idx}" data-oidx="${optIdx}">
              <input type="text" class="form-control lq-opt" data-qidx="${idx}" data-oidx="${optIdx}" placeholder="Đáp án ${String.fromCharCode(65 + optIdx)}" value="${opt || ''}" style="font-size: 12px; padding: 4px 8px; height: 32px;">
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    // Bắt sự kiện nhập liệu
    listeningQuestionsContainer.querySelectorAll('.lq-title').forEach(input => {
      input.addEventListener('input', (e) => {
        const i = parseInt(e.target.dataset.idx, 10);
        listeningQuestions[i].question = e.target.value;
      });
    });

    listeningQuestionsContainer.querySelectorAll('.lq-opt').forEach(input => {
      input.addEventListener('input', (e) => {
        const qi = parseInt(e.target.dataset.qidx, 10);
        const oi = parseInt(e.target.dataset.oidx, 10);
        listeningQuestions[qi].options[oi] = e.target.value;
      });
    });

    listeningQuestionsContainer.querySelectorAll('.lq-radio').forEach(r => {
      r.addEventListener('change', (e) => {
        const qi = parseInt(e.target.dataset.qidx, 10);
        const oi = parseInt(e.target.dataset.oidx, 10);
        listeningQuestions[qi].answer = oi;
      });
    });

    listeningQuestionsContainer.querySelectorAll('.btn-remove-q').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = parseInt(e.target.dataset.idx, 10);
        listeningQuestions.splice(i, 1);
        renderListeningQuestions();
      });
    });
  }

  if (assignTypeSelect) {
    assignTypeSelect.addEventListener('change', () => {
      const type = assignTypeSelect.value;
      if (assignSpeakingFields) assignSpeakingFields.style.display = (type === 'speaking') ? 'block' : 'none';
      if (assignListeningFields) assignListeningFields.style.display = (type === 'listening') ? 'block' : 'none';
    });
  }

  if (btnAddListeningQuestion) {
    btnAddListeningQuestion.addEventListener('click', () => {
      listeningQuestions.push({
        id: listeningQuestions.length + 1,
        question: '',
        options: ['', '', '', ''],
        answer: 0
      });
      renderListeningQuestions();
    });
  }

  btnOpenCreateAssignment.addEventListener('click', () => {
    assignModalAlert.className = 'alert';
    assignModalAlert.textContent = '';
    formCreateAssignment.reset();
    listeningQuestions = [];
    if (assignSpeakingFields) assignSpeakingFields.style.display = 'none';
    if (assignListeningFields) assignListeningFields.style.display = 'none';
    renderListeningQuestions();

    // Tự động điền link audio nếu lớp gắn với bài học đã có audio
    const tonight = new Date();
    tonight.setHours(22, 0, 0, 0);
    const tzOffset = tonight.getTimezoneOffset() * 60000;
    const localISOTime = new Date(tonight.getTime() - tzOffset).toISOString().slice(0, 16);
    assignDueDate.value = localISOTime;

    modalCreateAssignment.classList.add('active');
  });

  document.querySelectorAll('[data-close="modal-create-assignment"]').forEach(btn => {
    btn.addEventListener('click', () => { modalCreateAssignment.classList.remove('active'); });
  });

  // Modal Xem nộp bài tập
  const modalViewSubmissions = document.getElementById('modal-view-submissions');
  const viewSubmissionsTitle = document.getElementById('view-submissions-title');
  const viewSubmissionsSubtitle = document.getElementById('view-submissions-subtitle');
  const submissionsListContainer = document.getElementById('submissions-list-container');

  document.querySelectorAll('[data-close="modal-view-submissions"]').forEach(btn => {
    btn.addEventListener('click', () => { modalViewSubmissions.classList.remove('active'); });
  });

  async function openSubmissionsModal(assignId, assignTitle, assignType) {
    viewSubmissionsTitle.textContent = `Bài tập: ${assignTitle}`;
    viewSubmissionsSubtitle.textContent = `Loại bài: ${assignType} · Lớp: ${currentClass ? currentClass.name : ''}`;
    submissionsListContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Đang tải danh sách bài nộp...</div>`;
    modalViewSubmissions.classList.add('active');

    try {
      const records = await window.Admin.getAssignmentSubmissions(assignId, classId);

      if (!records || records.length === 0) {
        submissionsListContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Lớp chưa có học sinh nào.</div>`;
        return;
      }

      submissionsListContainer.innerHTML = `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Học sinh</th>
                <th>Trạng thái</th>
                <th>Điểm số</th>
                <th>Nội dung nộp</th>
                <th>Nhận xét</th>
              </tr>
            </thead>
            <tbody>
              ${records.map(r => {
                const s = r.submission;
                let statusHtml = '<span class="badge-status badge-paused" style="background: rgba(148, 163, 184, 0.2); color: var(--text-muted);">⚪ Chưa nộp</span>';
                if (s) {
                  if (s.status === 'graded') {
                    statusHtml = '<span class="badge-status badge-ongoing">🟢 Đã chấm</span>';
                  } else if (s.status === 'completed' || s.status === 'submitted') {
                    statusHtml = '<span class="badge-status" style="background: rgba(56, 189, 248, 0.2); color: #0284c7;">🔵 Đã nộp</span>';
                  } else if (s.status === 'late') {
                    statusHtml = '<span class="badge-status badge-paused">🟡 Nộp muộn</span>';
                  }
                }

                let contentHtml = '<span style="color: var(--text-muted); font-size: 12px;">Chưa có</span>';
                if (s && s.audio_url) {
                  contentHtml = `
                    <button type="button" class="btn btn-outline btn-sm btn-play-submission-audio" data-url="${s.audio_url}" style="padding: 2px 8px; font-size: 12px;">
                      🔊 Nghe ghi âm
                    </button>
                  `;
                } else if (s && s.score !== null) {
                  contentHtml = `<span style="font-size: 13px; font-weight: 700; color: #16a34a;">${s.score}/100</span>`;
                }

                return `
                  <tr>
                    <td>
                      <div style="font-weight: 700; color: var(--text-main);">${r.student.full_name || 'Học sinh'}</div>
                      <div style="font-size: 11px; color: var(--text-muted);">${r.student.email}</div>
                    </td>
                    <td>${statusHtml}</td>
                    <td>${s && s.score !== null && s.score !== undefined ? `<strong>${s.score}</strong>/100` : '<span style="color: var(--text-muted);">-</span>'}</td>
                    <td>${contentHtml}</td>
                    <td style="font-size: 12px; color: var(--text-muted); max-width: 200px;">
                      ${s && s.teacher_comment ? s.teacher_comment : '<em>Chưa có</em>'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      // Gắn sự kiện nghe audio
      submissionsListContainer.querySelectorAll('.btn-play-submission-audio').forEach(btn => {
        btn.addEventListener('click', async () => {
          const rawUrl = btn.dataset.url;
          btn.textContent = '⏳ Đang tải...';
          btn.disabled = true;
          try {
            const playUrl = await window.Admin.getAudioPlayUrl(rawUrl);
            const audio = new Audio(playUrl);
            audio.play();
            btn.textContent = '▶️ Đang phát...';
            audio.onended = () => {
              btn.textContent = '🔊 Nghe ghi âm';
              btn.disabled = false;
            };
          } catch (e) {
            alert('Lỗi phát âm thanh: ' + (e.message || e));
            btn.textContent = '🔊 Nghe ghi âm';
            btn.disabled = false;
          }
        });
      });

    } catch (err) {
      console.error('Lỗi tải bài nộp:', err);
      submissionsListContainer.innerHTML = `<div style="color: red; text-align: center; padding: 20px;">Lỗi: ${err.message || err}</div>`;
    }
  }

  formCreateAssignment.addEventListener('submit', async function (e) {
    e.preventDefault();
    const assignmentType = assignTypeSelect ? assignTypeSelect.value : 'vocabulary';
    const title = document.getElementById('assign-title').value.trim();
    const lessonId = assignLessonSelect.value || null;
    const dueDate = assignDueDate.value;
    const rewardXp = document.getElementById('assign-xp').value;
    const description = document.getElementById('assign-desc').value.trim();

    let speakingPrompt = null;
    let speakingPinyin = null;
    let speakingSampleAudioUrl = null;
    let listeningAudioUrl = null;

    if (assignmentType === 'speaking') {
      speakingPrompt = document.getElementById('assign-speaking-prompt').value.trim();
      speakingPinyin = document.getElementById('assign-speaking-pinyin').value.trim();
      speakingSampleAudioUrl = document.getElementById('assign-speaking-audio').value.trim();
      if (!speakingPrompt) {
        assignModalAlert.className = 'alert alert-danger show';
        assignModalAlert.textContent = 'Vui lòng nhập đề bài câu/đoạn tiếng Trung cần đọc!';
        return;
      }
    } else if (assignmentType === 'listening') {
      listeningAudioUrl = document.getElementById('assign-listening-audio').value.trim();
      if (!listeningAudioUrl) {
        assignModalAlert.className = 'alert alert-danger show';
        assignModalAlert.textContent = 'Vui lòng điền link Audio cho bài nghe!';
        return;
      }
      if (listeningQuestions.length === 0) {
        assignModalAlert.className = 'alert alert-danger show';
        assignModalAlert.textContent = 'Vui lòng tạo ít nhất 1 câu hỏi nghe hiểu!';
        return;
      }
    }

    try {
      btnSubmitAssignment.disabled = true;
      btnSubmitAssignment.textContent = 'Đang giao bài...';

      await window.Admin.createAssignment({
        classId,
        lessonId,
        title,
        dueDate: new Date(dueDate).toISOString(),
        rewardXp,
        description,
        assignmentType,
        speakingPrompt,
        speakingPinyin,
        speakingSampleAudioUrl,
        listeningAudioUrl,
        listeningQuestions: (assignmentType === 'listening') ? listeningQuestions : null
      });

      modalCreateAssignment.classList.remove('active');
      showAlert(`Đã giao bài tập "${title}" thành công cho cả lớp!`, 'success');
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

  async function loadCurriculumsAndTeachersDropdowns() {
    try {
      const curriculums = await window.Admin.getCurriculums();
      if (settingClassCurriculum && curriculums) {
        settingClassCurriculum.innerHTML = curriculums.map(c => `
          <option value="${c.id}">${c.title} (${c.level}) - ${c.total_lessons || 0} bài</option>
        `).join('');
      }
      const teachers = await window.Admin.getTeachers();
      if (settingClassTeacher && teachers) {
        let opts = '<option value="">-- Chưa chỉ định (Tự do) --</option>';
        opts += teachers.map(t => `
          <option value="${t.id}">${t.display_name || t.email} (${t.role === 'admin' ? 'Quản trị viên' : 'Giáo viên'})</option>
        `).join('');
        settingClassTeacher.innerHTML = opts;
      }
    } catch (e) {
      console.error('Lỗi nạp dropdown cài đặt lớp:', e);
    }
  }

  // Tải dữ liệu ban đầu
  await loadCurriculumsAndTeachersDropdowns();
  await loadClassAllData();
});
