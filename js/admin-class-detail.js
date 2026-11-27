/**
 * LOGIC CHI TIẾT LỚP HỌC (admin/class-detail.html)
 */

document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth(['admin', 'teacher'], '../index.html');
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);

  const urlParams = new URLSearchParams(window.location.search);
  let classId = urlParams.get('id');
  const initialTabParam = urlParams.get('tab');

  if (!classId) {
    alert('Không tìm thấy mã lớp học!');
    window.location.href = 'classes.html';
    return;
  }

  let currentClass = null;
  let curriculumLessons = [];
  let manualUnlocksMap = {};
  let activeTabId = 'tab-overview';

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

  function activateTab(targetTabId) {
    if (!targetTabId) return;
    const btn = document.querySelector(`.admin-subnav-btn[data-tab="${targetTabId}"]`);
    const targetPane = document.getElementById(targetTabId);
    if (!btn || !targetPane) return;

    activeTabId = targetTabId;
    subnavBtns.forEach(b => b.classList.remove('active'));
    tabPanes.forEach(p => { p.style.display = 'none'; });

    btn.classList.add('active');
    targetPane.style.display = 'block';

    try {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('id', classId);
      nextUrl.searchParams.set('tab', targetTabId);
      window.history.replaceState({}, '', nextUrl.toString());
    } catch (e) {}

    if (targetTabId === 'tab-leaderboard' && typeof loadClassLeaderboardAndAudit === 'function') {
      loadClassLeaderboardAndAudit();
    } else if (targetTabId === 'tab-self-study' && typeof loadSelfStudyTab === 'function') {
      loadSelfStudyTab();
    }
  }

  subnavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTabId = btn.getAttribute('data-tab');
      activateTab(targetTabId);
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

      // Kiểm tra phân quyền lớp học: Giáo viên chỉ được xem lớp mình phụ trách
      if (authData.profile && authData.profile.role === 'teacher' && currentClass.teacher_id !== authData.user.id) {
        classDetailName.textContent = 'Không có quyền truy cập';
        classDetailCurriculum.textContent = 'Lớp học này do giáo viên khác phụ trách.';
        tabPanes.forEach(p => { p.style.display = 'none'; });
        const subnavEl = document.querySelector('.admin-subnav');
        if (subnavEl) subnavEl.style.display = 'none';
        showAlert('Bạn chỉ có quyền xem bảng xếp hạng và quản lý các lớp mình được phân công phụ trách.');
        return false;
      }

      // Render Header
      classDetailName.textContent = currentClass.name || 'Lớp học';
      const currTitle = currentClass.curriculum ? currentClass.curriculum.title : 'Chưa gán';
      classDetailCurriculum.textContent = `Giáo trình: ${currTitle} (${currentClass.level || 'HSK1'})`;

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

      // Đồng bộ dropdown lớp ở tab Bảng xếp hạng
      const lbSel = document.getElementById('lb-class-selector');
      if (lbSel && lbSel.querySelector(`option[value="${classId}"]`)) {
        lbSel.value = classId;
      }

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
      } else {
        curriculumLessons = [];
        if (selectCurrentLesson) selectCurrentLesson.innerHTML = '';
        if (assignLessonSelect) assignLessonSelect.innerHTML = '<option value="">-- Không gắn bài cụ thể --</option>';
        renderClassLessonsTable();
      }

      // 4. Tải danh sách học sinh & bài tập
      await loadClassStudentsList();
      await loadClassAssignmentsList();

      if (activeTabId === 'tab-leaderboard' && typeof loadClassLeaderboardAndAudit === 'function') {
        await loadClassLeaderboardAndAudit();
      } else if (activeTabId === 'tab-self-study' && typeof loadSelfStudyTab === 'function') {
        await loadSelfStudyTab();
      }

      return true;

    } catch (err) {
      console.error('Lỗi tải chi tiết lớp:', err);
      showAlert('Lỗi tải dữ liệu lớp học: ' + (err.message || err));
      return false;
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

  // Tải bảng học sinh ở Tab 2 (kèm thống kê thời gian học Hôm nay / Tuần này / Tuần trước + sắp xếp + Xuất CSV + Modal 8 tuần)
  let classStudentsRows = [];
  let studentsStudyMeta = null;
  let studentStudySortKey = 'this_week'; // 'name' | 'today' | 'this_week' | 'last_week'
  let studentStudySortDir = 'desc';

  const studentsStudyWeekMeta = document.getElementById('students-study-week-meta');
  const studentsStudyAlert = document.getElementById('students-study-alert');
  const btnRefreshStudentsStudy = document.getElementById('btn-refresh-students-study');
  const btnExportStudentsStudyCsv = document.getElementById('btn-export-students-study-csv');
  const modalStudentStudyHistory = document.getElementById('modal-student-study-history');
  const stHistModalTitle = document.getElementById('st-hist-modal-title');
  const stHistModalSub = document.getElementById('st-hist-modal-sub');
  const stHistModalBody = document.getElementById('st-hist-modal-body');

  function cleanStr(val, fallback = '') {
    if (val === null || val === undefined) return fallback;
    const s = String(val).trim();
    if (!s || s === 'null' || s === 'undefined') return fallback;
    return s;
  }

  function escHtml(val) {
    return cleanStr(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatStudyCellTime(totalSeconds) {
    const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    if (sec === 0) return '<span style="color: var(--text-light);">0 phút</span>';
    if (sec < 60) return `<strong>${sec} giây</strong>`;
    if (sec < 3600) return `<strong>${Math.round(sec / 60)} phút</strong>`;
    const totalMins = Math.round(sec / 60);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `<strong>${hrs} giờ ${mins} phút</strong>`;
  }

  function formatStudyPlainText(totalSeconds) {
    const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    if (sec === 0) return '0 phút';
    if (sec < 60) return `${sec} giây`;
    if (sec < 3600) return `${Math.round(sec / 60)} phút`;
    const totalMins = Math.round(sec / 60);
    return `${Math.floor(totalMins / 60)} giờ ${totalMins % 60} phút`;
  }

  function formatShortVnDate(isoDate) {
    const s = cleanStr(isoDate);
    const p = s.split('-');
    if (p.length !== 3) return s;
    return `${p[2]}/${p[1]}`;
  }

  function showStudentsStudyAlert(msg, type = 'danger', retryFn = null) {
    if (!studentsStudyAlert) return;
    if (!msg) {
      studentsStudyAlert.className = 'alert';
      studentsStudyAlert.innerHTML = '';
      return;
    }
    studentsStudyAlert.className = `alert alert-${type} show`;
    studentsStudyAlert.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    studentsStudyAlert.appendChild(span);
    if (typeof retryFn === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline btn-sm';
      btn.style.marginLeft = '10px';
      btn.textContent = '🔄 Thử lại';
      btn.addEventListener('click', () => retryFn());
      studentsStudyAlert.appendChild(btn);
    }
  }

  function updateStudentSortHeadersUi() {
    document.querySelectorAll('#tab-students .st-sort-header').forEach(btn => {
      const k = btn.getAttribute('data-sort');
      const iconEl = btn.querySelector('.st-sort-icon');
      const active = k === studentStudySortKey;
      btn.classList.toggle('is-active', active);
      if (iconEl) {
        iconEl.textContent = active ? (studentStudySortDir === 'asc' ? '↑' : '↓') : '↕';
      }
    });
  }

  function getSortedStudentsRows() {
    const copy = [...classStudentsRows];
    const dir = studentStudySortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      if (studentStudySortKey === 'name') {
        const na = cleanStr(a.display_name || a.username).toLowerCase();
        const nb = cleanStr(b.display_name || b.username).toLowerCase();
        return na.localeCompare(nb, 'vi') * dir;
      }
      const fieldMap = {
        today: 'today_seconds',
        this_week: 'this_week_seconds',
        last_week: 'last_week_seconds'
      };
      const f = fieldMap[studentStudySortKey] || 'this_week_seconds';
      const va = Number(a[f] || 0);
      const vb = Number(b[f] || 0);
      if (va !== vb) return (va - vb) * dir;
      const na = cleanStr(a.display_name || a.username).toLowerCase();
      const nb = cleanStr(b.display_name || b.username).toLowerCase();
      return na.localeCompare(nb, 'vi');
    });
    return copy;
  }

  async function openStudentStudyHistoryModal(studentId, fallbackName, fallbackUsername) {
    if (!modalStudentStudyHistory || !stHistModalBody) return;
    if (stHistModalTitle) {
      stHistModalTitle.textContent = `⏱️ Lịch sử 8 tuần — ${cleanStr(fallbackName || fallbackUsername, 'Học viên')}`;
    }
    if (stHistModalSub) {
      stHistModalSub.textContent = fallbackUsername ? `@${cleanStr(fallbackUsername)} · ${cleanStr(currentClass && currentClass.name, 'Lớp học')}` : cleanStr(currentClass && currentClass.name, 'Lớp học');
    }
    stHistModalBody.innerHTML = `
      <div style="text-align: center; padding: 32px; color: var(--text-muted);">
        ⏳ Đang tải lịch sử thời gian học 8 tuần gần nhất...
      </div>
    `;
    modalStudentStudyHistory.classList.add('active');

    try {
      const res = await window.Admin.getStudentStudyTimeHistory(classId, studentId);
      const displayName = cleanStr(res && res.display_name, fallbackName || fallbackUsername || 'Học viên');
      const username = cleanStr(res && res.username, fallbackUsername);
      const weeks = Array.isArray(res && res.weeks) ? res.weeks : [];

      if (stHistModalTitle) stHistModalTitle.textContent = `⏱️ Lịch sử 8 tuần — ${displayName}`;
      if (stHistModalSub) stHistModalSub.textContent = `${username ? `@${username} · ` : ''}${cleanStr(currentClass && currentClass.name, 'Lớp học')}`;

      const total8Sec = weeks.reduce((s, w) => s + Number(w.seconds || 0), 0);
      const avgWeekSec = weeks.length > 0 ? Math.round(total8Sec / weeks.length) : 0;
      const currentWeekRow = weeks.find(w => w.is_current_week);
      const curWeekSec = currentWeekRow ? Number(currentWeekRow.seconds || 0) : 0;
      const maxWeekSec = Math.max(weeks.reduce((m, w) => Math.max(m, Number(w.seconds || 0)), 0), 600);

      const barsHtml = weeks.map(w => {
        const sec = Number(w.seconds || 0);
        const mins = Math.round(sec / 60);
        const hPct = sec > 0 ? Math.max(10, Math.round((sec / maxWeekSec) * 100)) : 5;
        const valShort = sec === 0 ? '0p' : (sec < 60 ? `${sec}s` : (mins < 60 ? `${mins}p` : `${Math.floor(mins / 60)}g${mins % 60 > 0 ? `${mins % 60}p` : ''}`));
        const activeDays = Number(w.active_days || 0);
        const label = w.is_current_week ? 'Tuần này' : `${formatShortVnDate(w.week_start)}`;

        return `
          <div class="st-hist-col ${w.is_current_week ? 'is-current' : ''}" title="${formatShortVnDate(w.week_start)} – ${formatShortVnDate(w.week_end)}: ${formatStudyPlainText(sec)} (${activeDays}/7 ngày)">
            <div class="st-bar-top-val">${valShort}</div>
            <div class="st-bar-track">
              <div class="st-bar-fill ${sec > 0 ? 'has-data' : ''}" style="height: ${hPct}%;"></div>
            </div>
            <div class="st-bar-day-label">${escHtml(label)}</div>
            <div class="st-hist-days-badge">${activeDays}d</div>
          </div>
        `;
      }).join('');

      const rowsHtml = [...weeks].reverse().map(w => {
        const sec = Number(w.seconds || 0);
        const days = Number(w.active_days || 0);
        return `
          <tr>
            <td>
              <strong>${formatShortVnDate(w.week_start)} – ${formatShortVnDate(w.week_end)}</strong>
              ${w.is_current_week ? '<span class="badge-status badge-ongoing" style="margin-left: 6px; font-size: 11px;">Tuần hiện tại</span>' : ''}
            </td>
            <td>${formatStudyCellTime(sec)}</td>
            <td><strong>${days}</strong> / 7 ngày</td>
          </tr>
        `;
      }).join('');

      stHistModalBody.innerHTML = `
        <div class="st-hist-summary-grid">
          <div class="st-metric-box is-today">
            <div class="st-metric-label">Tuần hiện tại</div>
            <div class="st-metric-value">${escHtml(formatStudyPlainText(curWeekSec))}</div>
          </div>
          <div class="st-metric-box">
            <div class="st-metric-label">Tổng 8 tuần</div>
            <div class="st-metric-value">${escHtml(formatStudyPlainText(total8Sec))}</div>
          </div>
          <div class="st-metric-box">
            <div class="st-metric-label">Trung bình / tuần</div>
            <div class="st-metric-value">${escHtml(formatStudyPlainText(avgWeekSec))}</div>
          </div>
        </div>

        <div class="st-chart-section" style="margin-bottom: 14px;">
          <div class="st-chart-title">Biểu đồ cột 8 tuần gần nhất (Thứ Hai – Chủ nhật · Số ngày có học bên dưới)</div>
          <div class="st-hist-chart">${barsHtml}</div>
        </div>

        <div class="table-responsive">
          <table class="data-table" style="font-size: 13px;">
            <thead>
              <tr>
                <th>Khoảng tuần (Thứ 2 – CN)</th>
                <th>Tổng thời gian học</th>
                <th>Số ngày có học</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `;
    } catch (err) {
      console.error('Lỗi tải lịch sử 8 tuần học viên:', err);
      stHistModalBody.innerHTML = `
        <div class="alert alert-danger show" style="margin-bottom: 0; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
          <span>${escHtml(cleanStr(err && err.message, 'Không thể tải lịch sử thời gian học của học viên này.'))}</span>
          <button type="button" id="btn-retry-st-hist" class="btn btn-outline btn-sm">🔄 Thử lại</button>
        </div>
      `;
      const retryBtn = document.getElementById('btn-retry-st-hist');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => openStudentStudyHistoryModal(studentId, fallbackName, fallbackUsername));
      }
    }
  }

  function renderStudentsTableRows() {
    updateStudentSortHeadersUi();
    if (!classStudentsRows || classStudentsRows.length === 0) {
      studentsTableBody.innerHTML = `
        <tr><td colspan="9" style="text-align: center; padding: 32px; color: var(--text-muted);">
          Lớp học hiện chưa có học sinh nào. Hãy nhấn <strong>"Thêm Học Sinh Vào Lớp"</strong> ở trên!
        </td></tr>
      `;
      return;
    }

    const sortedRows = getSortedStudentsRows();
    studentsTableBody.innerHTML = sortedRows.map(st => {
      const displayName = cleanStr(st.display_name || st.username, 'Học viên');
      const username = cleanStr(st.username, '--');
      const phone = cleanStr(st.phone);
      const statusLabel = st.status === 'active' ? 'Đang học' : cleanStr(st.status, 'Đang học');

      return `
        <tr>
          <td>
            <button type="button" class="st-student-name-btn btn-open-student-study-hist" data-student-id="${escHtml(st.id)}" data-name="${escHtml(displayName)}" data-username="${escHtml(username)}" title="Bấm để xem lịch sử thời gian học 8 tuần gần nhất">
              ${escHtml(displayName)}
            </button>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              Streak: 🔥 ${Number(st.current_streak || 0)} ngày · ${(Number(st.lifetime_xp || 0)).toLocaleString('vi-VN')} XP
            </div>
          </td>
          <td><code>${escHtml(username)}</code></td>
          <td>${phone ? escHtml(phone) : '<span style="color: var(--text-light);">Chưa có</span>'}</td>
          <td>
            <button type="button" class="st-time-pill-btn btn-open-student-study-hist" data-student-id="${escHtml(st.id)}" data-name="${escHtml(displayName)}" data-username="${escHtml(username)}" title="Xem chi tiết 8 tuần">
              ${formatStudyCellTime(st.today_seconds)}
            </button>
          </td>
          <td>
            <button type="button" class="st-time-pill-btn is-week btn-open-student-study-hist" data-student-id="${escHtml(st.id)}" data-name="${escHtml(displayName)}" data-username="${escHtml(username)}" title="Xem chi tiết 8 tuần">
              ${formatStudyCellTime(st.this_week_seconds)}
            </button>
          </td>
          <td>
            <button type="button" class="st-time-pill-btn btn-open-student-study-hist" data-student-id="${escHtml(st.id)}" data-name="${escHtml(displayName)}" data-username="${escHtml(username)}" title="Xem chi tiết 8 tuần">
              ${formatStudyCellTime(st.last_week_seconds)}
            </button>
          </td>
          <td>${st.joinedAt ? new Date(st.joinedAt).toLocaleDateString('vi-VN') : '--'}</td>
          <td><span class="badge-status badge-ongoing">${escHtml(statusLabel)}</span></td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap;">
              <button type="button" class="btn btn-outline btn-sm btn-open-student-study-hist" data-student-id="${escHtml(st.id)}" data-name="${escHtml(displayName)}" data-username="${escHtml(username)}" title="Xem lịch sử thời gian học 8 tuần">
                📊 8 tuần
              </button>
              <button type="button" class="btn btn-outline btn-sm btn-reset-password" data-student-id="${escHtml(st.id)}" data-username="${escHtml(username)}" data-name="${escHtml(displayName)}" title="Đặt lại mật khẩu cho học sinh" style="font-weight: 600; color: var(--primary); border-color: var(--primary);">
                🔑 Đổi MK
              </button>
              <button type="button" class="btn btn-primary btn-sm btn-promote-student" data-student-id="${escHtml(st.id)}" data-name="${escHtml(displayName)}">
                ⬆️ Lên HSK2 / Đổi lớp
              </button>
              <button type="button" class="btn btn-outline btn-sm btn-remove-student" data-enrollment-id="${escHtml(st.enrollmentId)}" data-name="${escHtml(displayName)}">
                Xóa
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.btn-open-student-study-hist').forEach(btn => {
      btn.addEventListener('click', () => {
        const stId = btn.getAttribute('data-student-id');
        const stName = btn.getAttribute('data-name');
        const stUser = btn.getAttribute('data-username');
        if (stId) openStudentStudyHistoryModal(stId, stName, stUser);
      });
    });

    // Gắn sự kiện nút Đặt lại mật khẩu cho học sinh
    document.querySelectorAll('.btn-reset-password').forEach(btn => {
      btn.addEventListener('click', () => {
        const stId = btn.getAttribute('data-student-id');
        const stUsername = btn.getAttribute('data-username');
        const stName = btn.getAttribute('data-name');
        window.Admin.openResetPasswordModal({
          id: stId,
          username: stUsername,
          displayName: stName
        });
      });
    });

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
          const otherClasses = (allClasses || []).filter(c => c.id !== classId);

          if (otherClasses.length === 0) {
            selectTargetClass.innerHTML = '<option value="">-- Chưa có lớp học nào khác. Vui lòng tạo lớp mới trước! --</option>';
            btnSubmitPromote.disabled = true;
          } else {
            selectTargetClass.innerHTML = otherClasses.map(c => `
              <option value="${escHtml(c.id)}">
                ${escHtml(c.name)} (${escHtml(c.level)}) - ${escHtml(c.curriculum ? c.curriculum.title : '')}
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
            btn.textContent = 'Xóa';
          }
        }
      });
    });
  }

  function exportStudentsStudyCsv() {
    if (!classStudentsRows || classStudentsRows.length === 0) {
      showStudentsStudyAlert('Lớp chưa có học sinh để xuất CSV.', 'warning');
      return;
    }
    const sortedRows = getSortedStudentsRows();
    const csvEscape = (v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
    const headers = [
      'Họ và tên',
      'Tên đăng nhập',
      'Số điện thoại',
      'Hôm nay (phút)',
      'Hôm nay (hiển thị)',
      'Tuần này (phút)',
      'Tuần này (hiển thị)',
      'Tuần trước (phút)',
      'Tuần trước (hiển thị)',
      'Streak (ngày)',
      'Tổng XP',
      'Ngày vào lớp',
      'Trạng thái'
    ];

    const lines = [
      headers.map(csvEscape).join(','),
      ...sortedRows.map(st => {
        const tMin = Math.round((Number(st.today_seconds || 0)) / 60);
        const wMin = Math.round((Number(st.this_week_seconds || 0)) / 60);
        const lwMin = Math.round((Number(st.last_week_seconds || 0)) / 60);
        const joined = st.joinedAt ? new Date(st.joinedAt).toLocaleDateString('vi-VN') : '';
        return [
          cleanStr(st.display_name || st.username, 'Học viên'),
          cleanStr(st.username),
          cleanStr(st.phone),
          tMin,
          formatStudyPlainText(st.today_seconds),
          wMin,
          formatStudyPlainText(st.this_week_seconds),
          lwMin,
          formatStudyPlainText(st.last_week_seconds),
          Number(st.current_streak || 0),
          Number(st.lifetime_xp || 0),
          joined,
          st.status === 'active' ? 'Đang học' : cleanStr(st.status, '')
        ].map(csvEscape).join(',');
      })
    ];

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const clsSlug = cleanStr(currentClass && currentClass.name, 'lop-hoc')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'lop-hoc';
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    link.href = url;
    link.download = `thoi-gian-hoc_${clsSlug}_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  document.querySelectorAll('#tab-students .st-sort-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-sort') || 'this_week';
      if (studentStudySortKey === k) {
        studentStudySortDir = studentStudySortDir === 'desc' ? 'asc' : 'desc';
      } else {
        studentStudySortKey = k;
        studentStudySortDir = k === 'name' ? 'asc' : 'desc';
      }
      renderStudentsTableRows();
    });
  });

  if (btnRefreshStudentsStudy) {
    btnRefreshStudentsStudy.addEventListener('click', () => loadClassStudentsList());
  }
  if (btnExportStudentsStudyCsv) {
    btnExportStudentsStudyCsv.addEventListener('click', () => exportStudentsStudyCsv());
  }
  document.querySelectorAll('[data-close="modal-student-study-history"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (modalStudentStudyHistory) modalStudentStudyHistory.classList.remove('active');
    });
  });

  async function loadClassStudentsList() {
    showStudentsStudyAlert('');
    try {
      const fetchStudyTimeSafe = async () => {
        if (!window.Admin || typeof window.Admin.getClassStudyTime !== 'function') {
          return { __error: new Error('Vui lòng tải lại trang (Ctrl+F5) để cập nhật admin.js mới nhất.') };
        }
        try {
          return await window.Admin.getClassStudyTime(classId);
        } catch (err) {
          return { __error: err };
        }
      };

      const [students, studyRes] = await Promise.all([
        window.Admin.getClassStudents(classId),
        fetchStudyTimeSafe()
      ]);

      statStudentCount.textContent = students.length;
      countStudentsTab.textContent = students.length;

      const studyMap = new Map();
      if (studyRes && studyRes.__error) {
        console.warn('Lỗi tải thời gian học của lớp:', studyRes.__error);
        showStudentsStudyAlert(
          cleanStr(studyRes.__error && studyRes.__error.message, 'Không thể tải số liệu thời gian học của lớp.'),
          'warning',
          () => loadClassStudentsList()
        );
      } else if (studyRes) {
        studentsStudyMeta = studyRes;
        if (studentsStudyWeekMeta && studyRes.this_week_start && studyRes.last_week_start) {
          studentsStudyWeekMeta.textContent =
            `Tuần này: ${formatShortVnDate(studyRes.this_week_start)} – ${formatShortVnDate(studyRes.this_week_end)} · ` +
            `Tuần trước: ${formatShortVnDate(studyRes.last_week_start)} – ${formatShortVnDate(studyRes.last_week_end)} (giờ VN) · Bấm vào học viên để xem 8 tuần`;
        }
        (Array.isArray(studyRes.students) ? studyRes.students : []).forEach(s => {
          studyMap.set(s.student_id, s);
        });
      }

      classStudentsRows = (students || []).map(st => {
        const stTime = studyMap.get(st.id) || {};
        return {
          ...st,
          today_seconds: Number(stTime.today_seconds || 0),
          this_week_seconds: Number(stTime.this_week_seconds || 0),
          last_week_seconds: Number(stTime.last_week_seconds || 0)
        };
      });

      renderStudentsTableRows();
    } catch (err) {
      console.error('Lỗi tải danh sách học sinh:', err);
      studentsTableBody.innerHTML = `<tr><td colspan="9" style="color: var(--danger); text-align: center; padding: 24px;">Không thể tải danh sách học sinh.</td></tr>`;
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
        const lessonText = a.lesson ? `Bài ${a.lesson.order_index}: ${escHtml(a.lesson.title_zh)}` : '<span style="color: var(--text-light);">Tự do</span>';
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
        } else if (a.assignment_type === 'custom') {
          const draftPill = a.is_published === false
            ? ' <span class="badge-status" style="background: rgba(234, 179, 8, 0.2); color: #ca8a04; margin-left: 4px;">Bản nháp</span>'
            : '';
          typeBadge = `<span class="badge-status" style="background: rgba(99, 102, 241, 0.18); color: #6366f1;">🧩 Tự soạn</span>${draftPill}`;
        }

        const customMetaLine = a.assignment_type === 'custom'
          ? `<div style="font-size: 12px; color: var(--primary); margin-top: 2px;">❓ ${a.total_questions || 0} câu · Tổng ${a.total_points || 0} điểm</div>`
          : '';

        return `
          <tr>
            <td>${typeBadge}</td>
            <td>
              <div style="font-weight: 700; color: var(--text-main);">${escHtml(a.title)}</div>
              <div style="font-size: 12px; color: var(--text-muted);">${escHtml(a.description || '')}</div>
              ${a.speaking_prompt ? `<div style="font-size: 12px; color: var(--primary); margin-top: 2px;">💬 Đề: ${escHtml(a.speaking_prompt)}</div>` : ''}
              ${customMetaLine}
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
                👥 ${a.completedCount} / ${statStudentCount.textContent} ${a.assignment_type === 'custom' ? 'đã làm' : 'đã nộp'}
              </button>
            </td>
            <td style="text-align: right; white-space: nowrap;">
              ${a.assignment_type === 'custom' ? `
                <button type="button" class="btn btn-outline btn-sm btn-edit-custom-assignment" data-id="${a.id}" style="margin-right: 4px;" title="Sửa hoặc xem câu hỏi">✏️ Sửa</button>
              ` : ''}
              <button type="button" class="btn btn-outline btn-sm btn-delete-assignment" data-id="${a.id}" data-title="${encodeURIComponent(a.title)}" style="color: var(--danger); border-color: var(--danger-border);" title="Xóa bài tập này">
                🗑️ Xóa
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Gắn sự kiện Xem nộp bài (hoặc kết quả/thống kê chi tiết với bài tự soạn)
      document.querySelectorAll('.btn-view-submissions').forEach(btn => {
        btn.addEventListener('click', async () => {
          const assignId = btn.getAttribute('data-id');
          const assignTitle = decodeURIComponent(btn.getAttribute('data-title'));
          const assignType = btn.getAttribute('data-type');
          if (assignType === 'custom' && window.AdminCustomAssignment) {
            await window.AdminCustomAssignment.openCustomResultsModal(assignId, assignTitle);
          } else {
            await openSubmissionsModal(assignId, assignTitle, assignType);
          }
        });
      });

      // Gắn sự kiện Sửa bài tự soạn
      document.querySelectorAll('.btn-edit-custom-assignment').forEach(btn => {
        btn.addEventListener('click', async () => {
          const assignId = btn.getAttribute('data-id');
          if (!window.AdminCustomAssignment) return;
          await window.AdminCustomAssignment.openEditCustomAssignment(assignId, {
            classId,
            lessons: curriculumLessons,
            onSaved: async (msg) => {
              showAlert(`🎉 ${msg}`, 'success');
              await loadClassAssignmentsList();
            }
          });
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
      activateTab('tab-settings');
      const settingsPane = document.getElementById('tab-settings');
      if (settingsPane) {
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

  if (window.AdminCustomAssignment && typeof window.AdminCustomAssignment.initOnce === 'function') {
    window.AdminCustomAssignment.initOnce();
  }

  if (assignTypeSelect) {
    assignTypeSelect.addEventListener('change', () => {
      const type = assignTypeSelect.value;
      if (assignSpeakingFields) assignSpeakingFields.style.display = (type === 'speaking') ? 'block' : 'none';
      if (assignListeningFields) assignListeningFields.style.display = (type === 'listening') ? 'block' : 'none';
      if (window.AdminCustomAssignment) {
        window.AdminCustomAssignment.setModeActive(type === 'custom');
      }
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
    if (assignTypeSelect) {
      assignTypeSelect.disabled = false;
      assignTypeSelect.value = 'vocabulary';
    }
    const assignModalTitle = document.getElementById('assign-modal-title');
    if (assignModalTitle) assignModalTitle.textContent = 'Giao Bài Tập Cho Lớp';
    listeningQuestions = [];
    if (assignSpeakingFields) assignSpeakingFields.style.display = 'none';
    if (assignListeningFields) assignListeningFields.style.display = 'none';
    renderListeningQuestions();

    if (window.AdminCustomAssignment) {
      window.AdminCustomAssignment.resetCustomWizardState({
        classId,
        lessons: curriculumLessons,
        onSaved: async (msg) => {
          showAlert(`🎉 ${msg}`, 'success');
          await loadClassAssignmentsList();
        }
      });
      window.AdminCustomAssignment.setModeActive(false);
    }

    // Tự động điền hạn chót tối nay
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

  // Trình quản lý phát âm thanh trong modal xem bài nộp
  let currentModalAudio = null;
  let currentPlayingBtn = null;

  function stopModalAudio() {
    if (currentModalAudio) {
      try {
        currentModalAudio.pause();
        currentModalAudio.currentTime = 0;
      } catch (e) {}
      currentModalAudio = null;
    }
    if (currentPlayingBtn) {
      currentPlayingBtn.innerHTML = currentPlayingBtn.dataset.originalText || '▶️ Nghe';
      currentPlayingBtn.disabled = false;
      currentPlayingBtn = null;
    }
  }

  function closeModalViewSubmissions() {
    stopModalAudio();
    if (modalViewSubmissions) modalViewSubmissions.classList.remove('active');
  }

  document.querySelectorAll('[data-close="modal-view-submissions"]').forEach(btn => {
    btn.addEventListener('click', closeModalViewSubmissions);
  });

  // Đóng modal khi bấm phím Esc hoặc bấm ra ngoài vùng nội dung
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalViewSubmissions && modalViewSubmissions.classList.contains('active')) {
      closeModalViewSubmissions();
    }
  });

  if (modalViewSubmissions) {
    modalViewSubmissions.addEventListener('click', (e) => {
      if (e.target === modalViewSubmissions) {
        closeModalViewSubmissions();
      }
    });
  }

  // Hàm tiện ích định dạng an toàn thông tin học viên (chống undefined / null)
  function formatStudentInfo(student) {
    if (!student) {
      return {
        name: 'Học viên đã xóa',
        username: '',
        initials: '?',
        avatarUrl: null
      };
    }
    const displayName = (student.display_name && typeof student.display_name === 'string') ? student.display_name.trim() : '';
    const username = (student.username && typeof student.username === 'string') ? student.username.trim() : '';
    const name = displayName || username || 'Học viên';
    const initials = name.charAt(0).toUpperCase();
    return {
      name,
      username: username ? `@${username}` : '',
      initials,
      avatarUrl: student.avatar_url || null
    };
  }

  function formatDuration(sec) {
    const s = parseInt(sec, 10) || 0;
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const remS = String(s % 60).padStart(2, '0');
    return `${m}:${remS}`;
  }

  function formatSubmissionDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('vi-VN', {
        hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
      });
    } catch (e) {
      return '';
    }
  }

  async function openSubmissionsModal(assignId, assignTitle, assignType) {
    viewSubmissionsTitle.textContent = `Bài tập: ${assignTitle}`;
    viewSubmissionsSubtitle.textContent = `Loại bài: ${assignType} · Lớp: ${currentClass ? currentClass.name : ''}`;
    submissionsListContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div style="font-size: 28px; margin-bottom: 8px;">⏳</div>
        <div>Đang tải danh sách bài nộp của học sinh...</div>
      </div>
    `;
    modalViewSubmissions.classList.add('active');

    async function loadData() {
      try {
        const records = await window.Admin.getAssignmentSubmissions(assignId, classId);

        if (!records || records.length === 0) {
          submissionsListContainer.innerHTML = `
            <div style="text-align: center; padding: 36px 20px; color: var(--text-muted);">
              <div style="font-size: 32px; margin-bottom: 8px;">👥</div>
              <div style="font-size: 15px; font-weight: 600; color: var(--text-main);">Lớp chưa có học sinh nào</div>
              <div style="font-size: 13px; margin-top: 4px;">Hãy ghi danh học sinh vào lớp ở Tab "Học sinh" để giao bài tập.</div>
            </div>
          `;
          return;
        }

        // Trạng thái tìm kiếm, lọc và sắp xếp
        let currentSearch = '';
        let currentStatusFilter = 'all';
        let currentSort = 'name-asc';

        // Hàm tính toán thống kê
        function getSummaryStats() {
          const total = records.length;
          let submitted = 0;
          let graded = 0;
          records.forEach(r => {
            const s = r.submission;
            if (s) {
              submitted++;
              if (s.status === 'graded') graded++;
            }
          });
          const unsubmitted = total - submitted;
          return { total, submitted, graded, unsubmitted };
        }

        // Hàm lọc và sắp xếp
        function getFilteredAndSortedRecords() {
          let list = records.filter(r => {
            const info = formatStudentInfo(r.student);
            const query = currentSearch.toLowerCase();

            // Lọc theo tìm kiếm
            const matchSearch = !query ||
              info.name.toLowerCase().includes(query) ||
              info.username.toLowerCase().includes(query);

            if (!matchSearch) return false;

            // Lọc theo trạng thái
            const s = r.submission;
            if (currentStatusFilter === 'all') return true;
            if (currentStatusFilter === 'unsubmitted') return !s;
            if (currentStatusFilter === 'graded') return s && s.status === 'graded';
            if (currentStatusFilter === 'submitted') return s && (s.status === 'completed' || s.status === 'submitted' || s.status === 'late');
            return true;
          });

          // Sắp xếp
          list.sort((a, b) => {
            const infoA = formatStudentInfo(a.student);
            const infoB = formatStudentInfo(b.student);
            const sA = a.submission;
            const sB = b.submission;

            if (currentSort === 'name-asc') {
              return infoA.name.localeCompare(infoB.name, 'vi');
            }
            if (currentSort === 'name-desc') {
              return infoB.name.localeCompare(infoA.name, 'vi');
            }
            if (currentSort === 'pending-first') {
              // Chờ chấm (submitted) lên đầu -> Chưa nộp -> Đã chấm
              const weightA = !sA ? 2 : (sA.status === 'graded' ? 3 : 1);
              const weightB = !sB ? 2 : (sB.status === 'graded' ? 3 : 1);
              return weightA - weightB || infoA.name.localeCompare(infoB.name, 'vi');
            }
            if (currentSort === 'unsubmitted-first') {
              const weightA = !sA ? 1 : (sA.status === 'graded' ? 3 : 2);
              const weightB = !sB ? 1 : (sB.status === 'graded' ? 3 : 2);
              return weightA - weightB || infoA.name.localeCompare(infoB.name, 'vi');
            }
            if (currentSort === 'score-desc') {
              const scoreA = (sA && sA.score !== null && sA.score !== undefined) ? sA.score : -1;
              const scoreB = (sB && sB.score !== null && sB.score !== undefined) ? sB.score : -1;
              return scoreB - scoreA || infoA.name.localeCompare(infoB.name, 'vi');
            }
            return 0;
          });

          return list;
        }

        function renderSubmissionsTable() {
          const stats = getSummaryStats();
          const filtered = getFilteredAndSortedRecords();

          submissionsListContainer.innerHTML = `
            <!-- Thanh thống kê & Bộ lọc -->
            <div style="background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
                <div style="display: flex; gap: 8px; flex-wrap: wrap; font-size: 12px; font-weight: 600;">
                  <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: var(--primary);">👥 Tổng: ${stats.total} học viên</span>
                  <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">📤 Đã nộp: ${stats.submitted}/${stats.total}</span>
                  <span class="badge" style="background: rgba(14, 165, 233, 0.15); color: #0ea5e9;">🟢 Đã chấm: ${stats.graded}</span>
                  <span class="badge" style="background: rgba(148, 163, 184, 0.15); color: var(--text-muted);">⚪ Chưa nộp: ${stats.unsubmitted}</span>
                </div>
                <div style="font-size: 12px; color: var(--text-muted);">
                  Hiển thị: <strong>${filtered.length}</strong> / ${stats.total} học viên
                </div>
              </div>

              <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                <input type="text" id="sub-filter-search" class="form-control" placeholder="🔍 Tìm tên hoặc @username..." value="${currentSearch.replace(/"/g, '&quot;')}" style="max-width: 250px; height: 36px; font-size: 13px;">
                <select id="sub-filter-status" class="form-control" style="width: auto; height: 36px; font-size: 13px;">
                  <option value="all" ${currentStatusFilter === 'all' ? 'selected' : ''}>Tất cả trạng thái</option>
                  <option value="submitted" ${currentStatusFilter === 'submitted' ? 'selected' : ''}>🔵 Chờ chấm / Đã nộp (${stats.submitted - stats.graded})</option>
                  <option value="graded" ${currentStatusFilter === 'graded' ? 'selected' : ''}>🟢 Đã chấm (${stats.graded})</option>
                  <option value="unsubmitted" ${currentStatusFilter === 'unsubmitted' ? 'selected' : ''}>⚪ Chưa nộp (${stats.unsubmitted})</option>
                </select>
                <select id="sub-filter-sort" class="form-control" style="width: auto; height: 36px; font-size: 13px;">
                  <option value="name-asc" ${currentSort === 'name-asc' ? 'selected' : ''}>Tên: A → Z</option>
                  <option value="name-desc" ${currentSort === 'name-desc' ? 'selected' : ''}>Tên: Z → A</option>
                  <option value="pending-first" ${currentSort === 'pending-first' ? 'selected' : ''}>Ưu tiên: Chờ chấm lên đầu</option>
                  <option value="unsubmitted-first" ${currentSort === 'unsubmitted-first' ? 'selected' : ''}>Ưu tiên: Chưa nộp lên đầu</option>
                  <option value="score-desc" ${currentSort === 'score-desc' ? 'selected' : ''}>Điểm: Cao → Thấp</option>
                </select>
              </div>
            </div>

            <!-- Bảng danh sách bài nộp -->
            <div class="table-responsive">
              <table class="data-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr>
                    <th style="min-width: 170px;">Học sinh</th>
                    <th style="min-width: 120px;">Trạng thái</th>
                    <th style="min-width: 90px;">Điểm số</th>
                    <th style="min-width: 230px;">Nội dung nộp</th>
                    <th style="min-width: 240px;">Nhận xét của giáo viên</th>
                  </tr>
                </thead>
                <tbody>
                  ${filtered.length === 0 ? `
                    <tr>
                      <td colspan="5" style="text-align: center; padding: 32px; color: var(--text-muted);">
                        Không tìm thấy học viên nào phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  ` : filtered.map(r => {
                    const info = formatStudentInfo(r.student);
                    const s = r.submission;
                    const stId = r.student ? r.student.id : '';

                    // 1. Trạng thái nộp bài
                    let statusHtml = '<span class="badge-status badge-paused" style="background: rgba(148, 163, 184, 0.2); color: var(--text-muted);">⚪ Chưa nộp</span>';
                    if (s) {
                      if (s.status === 'graded') {
                        statusHtml = '<span class="badge-status badge-ongoing">🟢 Đã chấm</span>';
                      } else if (s.status === 'late') {
                        statusHtml = '<span class="badge-status badge-paused" style="background: rgba(234, 179, 8, 0.2); color: #ca8a04;">🟡 Nộp muộn</span>';
                      } else {
                        statusHtml = '<span class="badge-status" style="background: rgba(56, 189, 248, 0.2); color: #0284c7;">🔵 Chờ chấm</span>';
                      }
                    }

                    // 2. Điểm số
                    const scoreHtml = (s && s.score !== null && s.score !== undefined)
                      ? `<strong style="font-size: 15px; color: #16a34a;">${s.score}</strong><span style="font-size: 12px; color: var(--text-muted);">/100</span>`
                      : '<span style="color: var(--text-muted);">-</span>';

                    // 3. Nội dung nộp
                    let contentHtml = '<span style="color: var(--text-muted); font-size: 12px; font-style: italic;">Chưa nộp bài</span>';
                    if (s) {
                      if (s.recordings && Array.isArray(s.recordings) && s.recordings.length > 0) {
                        contentHtml = `
                          <div style="display: flex; flex-direction: column; gap: 6px;">
                            <div style="font-size: 12px; font-weight: 700; color: var(--primary); display: flex; align-items: center; gap: 4px;">
                              🎙️ ${s.recordings.length} bản ghi âm:
                            </div>
                            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                              ${s.recordings.map((take, tIdx) => `
                                <button type="button" class="btn btn-outline btn-sm btn-play-audio-track" data-url="${take.storage_path}" style="padding: 2px 8px; font-size: 11px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
                                  ▶️ Bản ${take.position || tIdx + 1} ${take.duration_seconds > 0 ? `(${formatDuration(take.duration_seconds)})` : ''}
                                </button>
                              `).join('')}
                            </div>
                          </div>
                        `;
                      } else if (s.audio_url) {
                        contentHtml = `
                          <button type="button" class="btn btn-outline btn-sm btn-play-audio-track" data-url="${s.audio_url}" style="padding: 2px 10px; font-size: 12px;">
                            ▶️ Nghe bài ghi âm
                          </button>
                        `;
                      } else if (s.answers_payload) {
                        const totalAns = Array.isArray(s.answers_payload) ? s.answers_payload.length : Object.keys(s.answers_payload).length;
                        contentHtml = `<span style="font-size: 12px; color: var(--text-main); font-weight: 600;">📝 Đã hoàn thành (${totalAns} câu)</span>`;
                      } else {
                        contentHtml = `<span style="font-size: 12px; color: var(--text-main);">✅ Đã nộp bài tập</span>`;
                      }
                    }

                    // 4. Nhận xét của giáo viên (chữ & giọng nói)
                    let feedbackHtml = '';
                    const hasTextComment = s && s.teacher_comment && s.teacher_comment.trim();
                    const hasVoiceComment = s && s.teacher_audio_url && s.teacher_audio_url.trim();

                    if (hasTextComment || hasVoiceComment) {
                      feedbackHtml = `
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                          ${hasTextComment ? `
                            <div style="font-size: 12px; color: var(--text-main); line-height: 1.4; word-break: break-word;" title="${s.teacher_comment.replace(/"/g, '&quot;')}">
                              💬 "${s.teacher_comment.length > 60 ? s.teacher_comment.substring(0, 60) + '...' : s.teacher_comment}"
                            </div>
                          ` : ''}
                          ${hasVoiceComment ? `
                            <div>
                              <button type="button" class="btn btn-primary btn-sm btn-play-audio-track" data-url="${s.teacher_audio_url}" style="padding: 2px 8px; font-size: 11px; border-radius: 4px;">
                                🎙️ Nghe cô nhận xét ${s.teacher_audio_duration > 0 ? `(${formatDuration(s.teacher_audio_duration)})` : ''}
                              </button>
                            </div>
                          ` : ''}
                        </div>
                      `;
                    } else {
                      feedbackHtml = '<span style="color: var(--text-muted); font-size: 12px; font-style: italic;">Chưa có</span>';
                    }

                    // Nút Chấm bài / Xem chi tiết dẫn sang admin/grading.html
                    const gradeLinkHtml = (s && stId) ? `
                      <div style="margin-top: 6px;">
                        <a href="grading.html?classId=${classId}&studentId=${stId}&submissionId=${s.recording_id || ''}" target="_blank" class="btn btn-outline btn-sm" style="font-size: 11px; padding: 2px 8px; color: var(--primary); border-color: var(--primary); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Mở trang chấm bài cho học viên này">
                          ${s.status === 'graded' ? '🔍 Xem bài chấm' : '📝 Chấm bài ngay'}
                        </a>
                      </div>
                    ` : '';

                    return `
                      <tr>
                        <!-- Cột Học sinh -->
                        <td>
                          <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 34px; height: 34px; border-radius: 50%; background: rgba(59, 130, 246, 0.18); color: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; flex-shrink: 0;">
                              ${info.initials}
                            </div>
                            <div>
                              <div style="font-weight: 700; color: var(--text-main); font-size: 13.5px;">${info.name}</div>
                              ${info.username ? `<div style="font-size: 11.5px; color: var(--text-muted); font-weight: 500;">${info.username}</div>` : ''}
                            </div>
                          </div>
                        </td>

                        <!-- Cột Trạng thái -->
                        <td>
                          <div>${statusHtml}</div>
                          ${s && s.completed_at ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">⏱️ ${formatSubmissionDate(s.completed_at)}</div>` : ''}
                        </td>

                        <!-- Cột Điểm số -->
                        <td>${scoreHtml}</td>

                        <!-- Cột Nội dung nộp -->
                        <td>${contentHtml}</td>

                        <!-- Cột Nhận xét -->
                        <td>
                          ${feedbackHtml}
                          ${gradeLinkHtml}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `;

          // Gắn sự kiện ô tìm kiếm
          const searchInput = document.getElementById('sub-filter-search');
          if (searchInput) {
            searchInput.addEventListener('input', (e) => {
              currentSearch = e.target.value.trim();
              renderSubmissionsTable();
            });
          }

          // Gắn sự kiện lọc trạng thái
          const statusSelect = document.getElementById('sub-filter-status');
          if (statusSelect) {
            statusSelect.addEventListener('change', (e) => {
              currentStatusFilter = e.target.value;
              renderSubmissionsTable();
            });
          }

          // Gắn sự kiện sắp xếp
          const sortSelect = document.getElementById('sub-filter-sort');
          if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
              currentSort = e.target.value;
              renderSubmissionsTable();
            });
          }

          // Gắn sự kiện phát âm thanh
          submissionsListContainer.querySelectorAll('.btn-play-audio-track').forEach(btn => {
            btn.addEventListener('click', async () => {
              const rawUrl = btn.dataset.url;
              if (!rawUrl) return;

              // Nếu đang phát chính nút này -> Tạm dừng / Dừng
              if (currentPlayingBtn === btn && currentModalAudio) {
                stopModalAudio();
                return;
              }

              // Dừng bài đang phát trước đó nếu có
              stopModalAudio();

              const origText = btn.innerHTML;
              btn.dataset.originalText = origText;
              btn.innerHTML = '⏳ Đang tải...';
              btn.disabled = true;
              currentPlayingBtn = btn;

              try {
                const playUrl = await window.Admin.getAudioPlayUrl(rawUrl);
                const audio = new Audio(playUrl);
                currentModalAudio = audio;
                btn.disabled = false;
                btn.innerHTML = '⏸️ Đang phát';

                audio.play();
                audio.onended = () => { stopModalAudio(); };
                audio.onerror = () => {
                  alert('Không thể phát file âm thanh này.');
                  stopModalAudio();
                };
              } catch (e) {
                alert('Lỗi lấy link âm thanh: ' + (e.message || e));
                stopModalAudio();
              }
            });
          });
        }

        renderSubmissionsTable();

      } catch (err) {
        console.error('Lỗi tải bài nộp:', err);
        submissionsListContainer.innerHTML = `
          <div style="color: var(--danger); text-align: center; padding: 36px 20px;">
            <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
            <div style="font-weight: 700; font-size: 15px; margin-bottom: 6px;">Không thể tải kết quả bài nộp của học sinh</div>
            <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">${err.message || err}</div>
            <button type="button" class="btn btn-outline btn-sm btn-retry-submissions" style="margin: 0 auto; display: inline-flex; align-items: center; gap: 6px;">
              🔄 Thử lại
            </button>
          </div>
        `;
        const btnRetry = submissionsListContainer.querySelector('.btn-retry-submissions');
        if (btnRetry) {
          btnRetry.addEventListener('click', loadData);
        }
      }
    }

    await loadData();
  }

  formCreateAssignment.addEventListener('submit', async function (e) {
    e.preventDefault();
    const assignmentType = assignTypeSelect ? assignTypeSelect.value : 'vocabulary';
    if (assignmentType === 'custom') {
      // Loại bài tập tự soạn xử lý qua các nút Lưu nháp / Giao ngay của wizard 4 bước
      return;
    }
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

  // ===========================================================================
  // 10. TAB BẢNG XẾP HẠNG LỚP & ĐỐI SOÁT BÙ XP (GIÁO VIÊN / ADMIN)
  // ===========================================================================
  const lbClassSelector = document.getElementById('lb-class-selector');
  const btnRunXpAudit = document.getElementById('btn-run-xp-audit');
  const btnExportLbCsv = document.getElementById('btn-export-lb-csv');
  const lbTabAlert = document.getElementById('lb-tab-alert');
  const lbSumStudents = document.getElementById('lb-sum-students');
  const lbSumAssignments = document.getElementById('lb-sum-assignments');
  const lbSumBackfilledStudents = document.getElementById('lb-sum-backfilled-students');
  const lbSumLegacyNote = document.getElementById('lb-sum-legacy-note');
  const lbSumBackfilledXp = document.getElementById('lb-sum-backfilled-xp');
  const lbSumBackfilledSub = document.getElementById('lb-sum-backfilled-sub');
  const lbSumMismatched = document.getElementById('lb-sum-mismatched');
  const lbLastChecked = document.getElementById('lb-last-checked');
  const lbAuditSearch = document.getElementById('lb-audit-search');
  const lbAuditFilter = document.getElementById('lb-audit-filter');
  const lbAuditTableBody = document.getElementById('lb-audit-table-body');
  const lbPaginationInfo = document.getElementById('lb-pagination-info');
  const lbPaginationControls = document.getElementById('lb-pagination-controls');
  const btnLbPrevPage = document.getElementById('btn-lb-prev-page');
  const btnLbNextPage = document.getElementById('btn-lb-next-page');
  const lbPageIndicator = document.getElementById('lb-page-indicator');

  const modalXpAuditDetail = document.getElementById('modal-xp-audit-detail');
  const auditModalStudentTitle = document.getElementById('audit-modal-student-title');
  const auditModalStudentSub = document.getElementById('audit-modal-student-sub');
  const auditModalBody = document.getElementById('audit-modal-body');

  let lbCurrentPeriod = 'week';
  let lbPage = 1;
  const LB_PAGE_SIZE = 100;
  let lbTotalCount = 0;
  let lbMergedRows = [];
  let lbLastSummary = null;
  let lbClassesCache = [];
  let lbSearchTimer = null;

  function safeStr(val, fallback = '') {
    if (val === null || val === undefined) return fallback;
    const s = String(val).trim();
    if (!s || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') return fallback;
    return s;
  }

  function escHtml(str) {
    return safeStr(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatVnDateTime(isoStr, withSeconds = false) {
    const raw = safeStr(isoStr);
    if (!raw) return '';
    try {
      const opts = {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      };
      if (withSeconds) opts.second = '2-digit';
      return new Date(raw).toLocaleString('vi-VN', opts);
    } catch (e) {
      return raw;
    }
  }

  function showLbError(msg, retryFn = null) {
    if (!lbTabAlert) return;
    lbTabAlert.className = 'alert alert-danger show';
    lbTabAlert.innerHTML = '';

    const span = document.createElement('span');
    span.textContent = msg;
    lbTabAlert.appendChild(span);

    if (typeof retryFn === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline btn-sm';
      btn.style.cssText = 'margin-left: 12px; height: 28px; padding: 0 10px; font-size: 12px;';
      btn.textContent = '🔄 Thử lại';
      btn.addEventListener('click', () => retryFn());
      lbTabAlert.appendChild(btn);
    }
  }

  function clearLbAlert() {
    if (!lbTabAlert) return;
    lbTabAlert.className = 'alert';
    lbTabAlert.innerHTML = '';
  }

  async function initLeaderboardClassSelector() {
    if (!lbClassSelector) return;
    try {
      let classes = [];
      try {
        classes = await window.Admin.getTeacherAccessibleClasses();
      } catch (rpcErr) {
        console.warn('Fallback getClasses cho selector lớp:', rpcErr);
        const raw = await window.Admin.getClasses();
        const isTeacherOnly = authData.profile && authData.profile.role === 'teacher';
        classes = isTeacherOnly ? (raw || []).filter(c => c.teacher_id === authData.user.id) : (raw || []);
      }

      lbClassesCache = classes || [];
      if (lbClassesCache.length === 0) {
        lbClassSelector.innerHTML = '<option value="">-- Không có lớp nào thuộc quyền xem --</option>';
        return;
      }

      lbClassSelector.innerHTML = lbClassesCache.map(c => {
        const name = escHtml(safeStr(c.name, 'Lớp chưa đặt tên'));
        const lvl = escHtml(safeStr(c.level, 'HSK1'));
        const cnt = Number(c.active_student_count ?? c.activeStudentCount ?? 0);
        const teacherLabel = safeStr(c.teacher_name);
        const suffix = teacherLabel ? ` · GV: ${escHtml(teacherLabel)}` : '';
        return `<option value="${escHtml(c.id)}">${name} (${lvl} · ${cnt} HV${suffix})</option>`;
      }).join('');

      if (lbClassSelector.querySelector(`option[value="${classId}"]`)) {
        lbClassSelector.value = classId;
      }
    } catch (err) {
      console.error('Lỗi tải danh sách lớp cho selector BXH:', err);
      lbClassSelector.innerHTML = '<option value="">-- Lỗi tải danh sách lớp --</option>';
    }
  }

  function renderAuditSummaryCards(summary) {
    const s = summary || {};
    const totalStudents = Number(s.total_students || 0);
    const totalAssigns = Number(s.total_class_assignments || 0);
    const backfilledStudents = Number(s.backfilled_students_count || 0);
    const totalBackfilledXp = Number(s.total_backfilled_xp || 0);
    const legacyStudents = Number(s.legacy_suspect_students_count || 0);
    const legacyXp = Number(s.legacy_suspect_xp || 0);
    const matchedCount = Number(s.matched_count || 0);
    const missingCount = Number(s.missing_count || 0);
    const excessCount = Number(s.excess_count || 0);
    const mismatchedCount = Number(s.mismatched_count || 0);
    const checkedAt = formatVnDateTime(s.checked_at, true);

    if (lbSumStudents) lbSumStudents.textContent = `${totalStudents} học viên`;
    if (lbSumAssignments) lbSumAssignments.textContent = `${totalAssigns} bài tập của lớp`;
    if (lbSumBackfilledStudents) lbSumBackfilledStudents.textContent = `${backfilledStudents} học viên`;
    if (lbSumLegacyNote) {
      lbSumLegacyNote.textContent = legacyStudents > 0
        ? `+${legacyStudents} HV có mô tả bù cũ trước nhật ký`
        : 'Theo nhật ký xp_backfill_log';
    }
    if (lbSumBackfilledXp) lbSumBackfilledXp.textContent = `+${totalBackfilledXp.toLocaleString()} XP`;
    if (lbSumBackfilledSub) {
      lbSumBackfilledSub.textContent = legacyXp > 0
        ? `(+${legacyXp.toLocaleString()} XP nghi bù trước Migration 27)`
        : 'Chỉ tính các khoản bù có nhật ký';
    }
    if (lbSumMismatched) {
      lbSumMismatched.textContent = mismatchedCount > 0 ? `${mismatchedCount} học viên lệch` : '0 (Khớp hết)';
      lbSumMismatched.style.color = mismatchedCount > 0 ? 'var(--danger)' : 'var(--success)';
    }
    if (lbLastChecked) {
      lbLastChecked.textContent = `Khớp ${matchedCount} · Thiếu ${missingCount} · Thừa ${excessCount} · Lúc ${checkedAt || '--'}`;
    }
  }

  function formatStatusBadge(row) {
    const status = safeStr(row.status, 'matched');
    const diff = Number(row.diff_xp || 0);
    const dupExcess = Number(row.duplicate_excess_xp || 0);

    if (status === 'missing') {
      const missingAmt = diff < 0 ? Math.abs(diff) : Math.max(0, Number(row.expected_xp || 0) - Number(row.tx_xp || 0));
      return {
        label: `Còn thiếu ${missingAmt.toLocaleString()} XP`,
        html: `<span class="badge-status badge-paused" style="background: rgba(251, 191, 36, 0.2); color: var(--warning);">⚠️ Còn thiếu ${missingAmt.toLocaleString()} XP</span>`
      };
    }
    if (status === 'excess') {
      const excessAmt = diff > 0 ? diff : (dupExcess > 0 ? dupExcess : Math.max(0, Number(row.tx_xp || 0) - Number(row.expected_xp || 0)));
      return {
        label: `Thừa ${excessAmt.toLocaleString()} XP (nghi cộng trùng)`,
        html: `<span class="badge-status" style="background: rgba(248, 113, 113, 0.2); color: var(--danger);">🚨 Thừa ${excessAmt.toLocaleString()} XP (nghi cộng trùng)</span>`
      };
    }
    return {
      label: 'Khớp',
      html: `<span class="badge-status badge-ongoing">✅ Khớp</span>`
    };
  }

  function renderLeaderboardAuditTable() {
    if (!lbAuditTableBody) return;
    const query = safeStr(lbAuditSearch ? lbAuditSearch.value : '').toLowerCase();
    const filterVal = lbAuditFilter ? lbAuditFilter.value : 'all';

    const filtered = (lbMergedRows || []).filter(row => {
      const name = (safeStr(row.display_name) || safeStr(row.username) || 'Học viên').toLowerCase();
      const uname = safeStr(row.username).toLowerCase();
      const matchQuery = !query || name.includes(query) || uname.includes(query);
      if (!matchQuery) return false;

      if (filterVal === 'all') return true;
      if (filterVal === 'backfilled') {
        return Number(row.backfill_total_xp || 0) > 0 || Number(row.legacy_suspect_backfill_xp || 0) > 0;
      }
      return row.status === filterVal;
    });

    if (filtered.length === 0) {
      lbAuditTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 36px; color: var(--text-muted);">
            ${lbMergedRows.length === 0
              ? 'Lớp học này chưa có học viên đang theo học (active).'
              : 'Không tìm thấy học viên nào phù hợp bộ lọc hiện tại.'}
          </td>
        </tr>
      `;
      return;
    }

    lbAuditTableBody.innerHTML = filtered.map(row => {
      const rankNum = Number(row.rank || 0);
      let rankBadge = `<span style="font-weight: 800; color: var(--text-muted);">#${rankNum || '-'}</span>`;
      if (rankNum === 1) rankBadge = '<span style="font-size: 18px;">🥇</span>';
      else if (rankNum === 2) rankBadge = '<span style="font-size: 18px;">🥈</span>';
      else if (rankNum === 3) rankBadge = '<span style="font-size: 18px;">🥉</span>';

      const displayName = safeStr(row.display_name) || safeStr(row.username) || 'Học viên';
      const username = safeStr(row.username);
      const initial = displayName.charAt(0).toUpperCase();

      const periodXp = Number(row.period_xp || 0);
      const lifetimeXp = Number(row.lifetime_xp ?? row.actual_xp ?? 0);
      const wordsLearned = Number(row.words_learned || 0);
      const streak = Number(row.current_streak || 0);
      const completedAssigns = Number(row.completed_assignments || 0);
      const totalAssigns = Number(row.total_assignments || 0);

      const actualXp = Number(row.actual_xp ?? lifetimeXp);
      const expectedXp = Number(row.expected_xp || 0);
      const diffXp = Number(row.diff_xp || 0);
      const statusInfo = formatStatusBadge(row);
      const backfillTotal = Number(row.backfill_total_xp || 0);
      const legacySuspect = Number(row.legacy_suspect_backfill_xp || 0);
      const backfillTimeStr = formatVnDateTime(row.last_backfilled_at, false);

      let backfillActionHtml = `
        <button type="button" class="btn btn-outline btn-sm btn-open-audit-detail" data-student-id="${escHtml(row.student_id)}" style="height: 26px; padding: 0 8px; font-size: 11.5px;">
          🔎 Xem đối soát chi tiết
        </button>
      `;

      if (backfillTotal > 0) {
        backfillActionHtml = `
          <button type="button" class="btn btn-outline btn-sm btn-open-audit-detail" data-student-id="${escHtml(row.student_id)}" style="height: auto; min-height: 26px; padding: 3px 9px; font-size: 11.5px; white-space: normal; text-align: left; border-color: #38bdf8; color: #38bdf8;">
            🩹 Đã bù +${backfillTotal.toLocaleString()} XP${backfillTimeStr ? ` vào ${escHtml(backfillTimeStr)}` : ''} (xem)
          </button>
        `;
      } else if (legacySuspect > 0) {
        backfillActionHtml = `
          <button type="button" class="btn btn-outline btn-sm btn-open-audit-detail" data-student-id="${escHtml(row.student_id)}" style="height: auto; min-height: 26px; padding: 3px 9px; font-size: 11.5px; white-space: normal; text-align: left; border-color: var(--warning); color: var(--warning);">
            📝 Nghi đã bù +${legacySuspect.toLocaleString()} XP (trước nhật ký — xem)
          </button>
        `;
      }

      const ledgerWarnHtml = row.is_ledger_out_of_sync
        ? `<div style="font-size: 11px; color: var(--danger); margin-top: 2px;">⚠️ Sổ cái XP = ${Number(row.tx_xp || 0).toLocaleString()} XP (lệch hồ sơ)</div>`
        : '';

      return `
        <tr>
          <td style="text-align: center;">${rankBadge}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 9px;">
              <span style="width: 32px; height: 32px; border-radius: var(--radius-full); background: var(--primary-light); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; flex-shrink: 0;">
                ${escHtml(initial)}
              </span>
              <div>
                <div style="font-weight: 700; color: var(--text-main);">${escHtml(displayName)}</div>
                ${username ? `<div style="font-size: 11.5px; color: var(--text-muted);">@${escHtml(username)}</div>` : ''}
              </div>
            </div>
          </td>
          <td><strong style="color: #ca8a04;">${periodXp.toLocaleString()} XP</strong></td>
          <td><strong>${lifetimeXp.toLocaleString()} XP</strong></td>
          <td>${wordsLearned.toLocaleString()} từ</td>
          <td>🔥 ${streak} ngày</td>
          <td>${completedAssigns} / ${totalAssigns} bài</td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 5px; align-items: flex-start;">
              <div>${statusInfo.html}</div>
              <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">
                Đang có: <strong style="color: var(--text-main);">${actualXp.toLocaleString()}</strong> ·
                Lẽ ra: <strong style="color: var(--text-main);">${expectedXp.toLocaleString()}</strong> ·
                Lệch: <strong style="color: ${diffXp === 0 ? 'var(--success)' : 'var(--danger)'};">${diffXp > 0 ? `+${diffXp.toLocaleString()}` : diffXp.toLocaleString()}</strong>
              </div>
              ${Number(row.preserved_deleted_xp || 0) > 0 ? `<div style="font-size: 11px; color: var(--text-muted);">Gồm +${Number(row.preserved_deleted_xp).toLocaleString()} XP bảo lưu từ bài đã xóa</div>` : ''}
              ${ledgerWarnHtml}
              <div>${backfillActionHtml}</div>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    lbAuditTableBody.querySelectorAll('.btn-open-audit-detail').forEach(btn => {
      btn.addEventListener('click', () => {
        const stId = btn.getAttribute('data-student-id');
        if (stId) openXpAuditDetailModal(stId);
      });
    });
  }

  function updateLeaderboardPaginationUi() {
    if (!lbPaginationInfo || !lbPaginationControls) return;
    const isFiltering = !!(safeStr(lbAuditSearch ? lbAuditSearch.value : '') || (lbAuditFilter && lbAuditFilter.value !== 'all'));

    if (isFiltering || lbTotalCount <= LB_PAGE_SIZE) {
      lbPaginationControls.style.display = 'none';
      lbPaginationInfo.textContent = `Hiển thị ${lbMergedRows.length} / ${lbTotalCount} học viên`;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(lbTotalCount / LB_PAGE_SIZE));
    const startIdx = (lbPage - 1) * LB_PAGE_SIZE + 1;
    const endIdx = Math.min(lbTotalCount, startIdx + lbMergedRows.length - 1);

    lbPaginationInfo.textContent = `Hiển thị ${startIdx}–${endIdx} trong tổng số ${lbTotalCount} học viên (phân trang phía server)`;
    lbPaginationControls.style.display = 'inline-flex';
    if (lbPageIndicator) lbPageIndicator.textContent = `Trang ${lbPage} / ${totalPages}`;
    if (btnLbPrevPage) btnLbPrevPage.disabled = lbPage <= 1;
    if (btnLbNextPage) btnLbNextPage.disabled = lbPage >= totalPages;
  }

  async function loadClassLeaderboardAndAudit({ forceAuditBtn = false } = {}) {
    if (!lbAuditTableBody || !classId) return;
    clearLbAlert();

    const isFiltering = !!(safeStr(lbAuditSearch ? lbAuditSearch.value : '') || (lbAuditFilter && lbAuditFilter.value !== 'all'));
    const reqLimit = isFiltering ? 5000 : LB_PAGE_SIZE;
    const reqOffset = isFiltering ? 0 : (lbPage - 1) * LB_PAGE_SIZE;

    if (forceAuditBtn && btnRunXpAudit) {
      btnRunXpAudit.disabled = true;
      btnRunXpAudit.textContent = '⏳ Đang kiểm tra...';
    }

    lbAuditTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px; color: var(--text-muted);">
          ⏳ Đang tải bảng xếp hạng &amp; đối soát dữ liệu XP từ máy chủ...
        </td>
      </tr>
    `;

    try {
      // 1. Lấy bảng xếp hạng từ chính hàm get_class_leaderboard dùng chung với học viên
      const lbRows = await window.Admin.getClassLeaderboardForTeacher(classId, lbCurrentPeriod, reqLimit, reqOffset);
      const studentIds = (lbRows || []).map(r => r.student_id).filter(Boolean);
      lbTotalCount = (lbRows && lbRows.length > 0 && lbRows[0].total_count !== undefined)
        ? Number(lbRows[0].total_count)
        : (lbRows ? lbRows.length : 0);

      // 2. Lấy dữ liệu đối soát XP CHỈ ĐỌC cho đúng danh sách học viên trên trang + tổng kết toàn lớp
      const reconcileRes = await window.Admin.getClassXpReconciliation(
        classId,
        studentIds.length > 0 ? studentIds : null,
        reqLimit,
        0
      );

      lbLastSummary = reconcileRes ? reconcileRes.summary : {};
      renderAuditSummaryCards(lbLastSummary);

      const auditByStudent = {};
      ((reconcileRes && reconcileRes.students) || []).forEach(s => {
        auditByStudent[s.student_id] = s;
      });

      lbMergedRows = (lbRows || []).map(lb => {
        const audit = auditByStudent[lb.student_id] || {};
        return {
          ...lb,
          ...audit,
          display_name: safeStr(lb.display_name) || safeStr(audit.display_name) || safeStr(lb.username) || 'Học viên',
          username: safeStr(lb.username) || safeStr(audit.username),
          period_xp: Number(lb.period_xp || 0),
          lifetime_xp: Number(lb.lifetime_xp ?? audit.actual_xp ?? 0),
          words_learned: Number(lb.words_learned || 0),
          current_streak: Number(lb.current_streak || 0)
        };
      });

      renderLeaderboardAuditTable();
      updateLeaderboardPaginationUi();
    } catch (err) {
      console.error('Lỗi tải BXH & đối soát XP:', err);
      const rawMsg = safeStr(err && err.message ? err.message : String(err), 'Không thể tải dữ liệu bảng xếp hạng');
      const friendlyMsg = rawMsg.includes('Could not find the function')
        ? 'Cơ sở dữ liệu chưa chạy file Migration 27 (27_teacher_class_leaderboard_and_xp_audit.sql). Vui lòng chạy file SQL trong Supabase SQL Editor rồi bấm Thử lại.'
        : rawMsg;

      showLbError(friendlyMsg, () => loadClassLeaderboardAndAudit({ forceAuditBtn: true }));
      lbAuditTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 32px; color: var(--danger);">
            <div style="font-weight: 700; margin-bottom: 6px;">Không thể tải bảng xếp hạng &amp; đối soát</div>
            <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">${escHtml(friendlyMsg)}</div>
            <button type="button" id="btn-retry-lb-table" class="btn btn-outline btn-sm">🔄 Thử lại</button>
          </td>
        </tr>
      `;
      const retryBtn = document.getElementById('btn-retry-lb-table');
      if (retryBtn) retryBtn.addEventListener('click', () => loadClassLeaderboardAndAudit({ forceAuditBtn: true }));
    } finally {
      if (forceAuditBtn && btnRunXpAudit) {
        btnRunXpAudit.disabled = false;
        btnRunXpAudit.textContent = '🔍 Chạy kiểm tra đối soát';
      }
    }
  }

  async function openXpAuditDetailModal(studentId) {
    if (!modalXpAuditDetail || !auditModalBody) return;
    const rowSnapshot = lbMergedRows.find(r => r.student_id === studentId);
    const snapName = rowSnapshot ? (safeStr(rowSnapshot.display_name) || safeStr(rowSnapshot.username) || 'Học viên') : 'Học viên';
    const snapUser = rowSnapshot && safeStr(rowSnapshot.username) ? `@${safeStr(rowSnapshot.username)}` : '';

    if (auditModalStudentTitle) auditModalStudentTitle.textContent = `Đối soát XP · ${snapName}`;
    if (auditModalStudentSub) auditModalStudentSub.textContent = snapUser || 'Đang tải thông tin chi tiết...';
    auditModalBody.innerHTML = '<div style="text-align: center; padding: 36px; color: var(--text-muted);">⏳ Đang tải chi tiết đối soát và nhật ký bù XP...</div>';
    modalXpAuditDetail.classList.add('active');

    try {
      const detail = await window.Admin.getStudentXpAuditDetail(classId, studentId);
      const sum = (detail && detail.summary) || {};
      const counts = (detail && detail.counts) || {};
      const logs = (detail && detail.backfill_logs) || [];
      const legacyRows = (detail && detail.legacy_suspect_rows) || [];
      const recentTx = (detail && detail.recent_transactions) || [];
      const statusInfo = formatStatusBadge(sum);

      const sName = safeStr(sum.display_name, snapName);
      const sUser = safeStr(sum.username);
      if (auditModalStudentTitle) auditModalStudentTitle.textContent = `Đối soát XP · ${sName}`;
      if (auditModalStudentSub) auditModalStudentSub.textContent = sUser ? `@${sUser}` : '';

      const diffVal = Number(sum.diff_xp || 0);
      const ruleNames = {
        vocabulary_milestone_2xp: '+2 XP / từ thuộc hoặc tạm nhớ',
        lesson_vocab_10xp: '+10 XP / bài hoàn thành từ vựng',
        lesson_quiz_reward_xp: 'Thưởng Quiz hoàn thành bài học',
        assignment_completion_xp: 'Hoàn thành bài tập',
        recording_grade_xp: 'Giáo viên chấm bài ghi âm'
      };

      const logsHtml = logs.length > 0
        ? `
          <div class="table-responsive" style="margin-top: 8px;">
            <table class="data-table" style="font-size: 13px;">
              <thead>
                <tr>
                  <th>Thời điểm bù (VN)</th>
                  <th>Quy tắc áp dụng</th>
                  <th>Lý do</th>
                  <th style="text-align: right;">Số XP</th>
                </tr>
              </thead>
              <tbody>
                ${logs.map(l => `
                  <tr>
                    <td>
                      <div>${escHtml(formatVnDateTime(l.backfilled_at, true))}</div>
                      <div style="font-size: 11px; color: var(--text-muted);">Đợt: <code>${escHtml(safeStr(l.batch_id).slice(0, 8))}</code></div>
                    </td>
                    <td>${escHtml(ruleNames[l.rule_applied] || safeStr(l.rule_applied, 'Bù XP'))}</td>
                    <td>${escHtml(safeStr(l.reason, 'Bù XP tự động'))}</td>
                    <td style="text-align: right;"><strong style="color: #ca8a04;">+${Number(l.amount || 0).toLocaleString()} XP</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `
        : legacyRows.length > 0
          ? `
            <div class="alert alert-warning show" style="margin-top: 8px; font-size: 13px; color: var(--warning);">
              <strong>⚠️ Dữ liệu bù cũ trước khi có bảng nhật ký <code>xp_backfill_log</code>:</strong><br>
              Phát hiện ${legacyRows.length} giao dịch mang mô tả bắt đầu bằng <code>"Bù XP..."</code> (có thể đã chạy Migration 26 trước khi cài đặt Migration 27).
              Vì chưa có nhật ký <code>xp_backfill_log</code> nên <strong>không xác định được mã đợt và thời điểm chạy bù thực tế</strong> (cột ngày bên dưới là thời điểm học gốc).
            </div>
            <div class="table-responsive" style="margin-top: 8px;">
              <table class="data-table" style="font-size: 13px;">
                <thead>
                  <tr>
                    <th>Ngày học gốc (VN)</th>
                    <th>Loại nguồn</th>
                    <th>Mô tả</th>
                    <th style="text-align: right;">Số XP</th>
                  </tr>
                </thead>
                <tbody>
                  ${legacyRows.map(r => `
                    <tr>
                      <td>${escHtml(formatVnDateTime(r.original_activity_at, false) || '--')}</td>
                      <td><code>${escHtml(safeStr(r.source_type))}</code></td>
                      <td>${escHtml(safeStr(r.description))}</td>
                      <td style="text-align: right;"><strong style="color: #ca8a04;">+${Number(r.amount || 0).toLocaleString()} XP</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `
          : `
            <div style="padding: 12px 14px; background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: 13px; color: var(--text-muted); margin-top: 8px;">
              ${detail && detail.has_unlogged_legacy_note
                ? 'Không có bản ghi trong bảng <code>xp_backfill_log</code>. Nếu từng có thao tác cộng/bù XP thủ công trước Migration 27 thì hệ thống không tự phân biệt được với XP thường mà chỉ đối soát qua tổng điểm.'
                : 'Chưa phát sinh khoản bù XP nào cho học viên này.'}
            </div>
          `;

      auditModalBody.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 16px;">
          <div style="background: var(--bg-subtle); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 12px; color: var(--text-muted);">XP đang có (Hồ sơ)</div>
            <div style="font-size: 20px; font-weight: 800; color: var(--text-main);">${Number(sum.actual_xp || 0).toLocaleString()} XP</div>
            <div style="font-size: 11px; color: var(--text-muted);">Sổ cái TX: ${Number(sum.tx_xp || 0).toLocaleString()} XP</div>
          </div>
          <div style="background: var(--bg-subtle); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 12px; color: var(--text-muted);">XP lẽ ra phải có</div>
            <div style="font-size: 20px; font-weight: 800; color: #38bdf8;">${Number(sum.expected_xp || 0).toLocaleString()} XP</div>
            <div style="font-size: 11px; color: var(--text-muted);">Tính từ dữ liệu thật</div>
          </div>
          <div style="background: var(--bg-subtle); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 12px; color: var(--text-muted);">Chênh lệch &amp; Trạng thái</div>
            <div style="font-size: 18px; font-weight: 800; color: ${diffVal === 0 ? 'var(--success)' : 'var(--danger)'}; margin-bottom: 4px;">
              ${diffVal > 0 ? `+${diffVal.toLocaleString()} XP` : `${diffVal.toLocaleString()} XP`}
            </div>
            <div>${statusInfo.html}</div>
          </div>
        </div>

        <h4 style="font-size: 14px; font-weight: 700; margin-bottom: 8px; color: var(--text-main);">1. Chi tiết tính "XP lẽ ra phải có"</h4>
        <div class="table-responsive" style="margin-bottom: 16px;">
          <table class="data-table" style="font-size: 13px;">
            <thead>
              <tr>
                <th>Hạng mục nguồn</th>
                <th>Số lượng ghi nhận</th>
                <th>Quy tắc tính</th>
                <th style="text-align: right;">XP chuẩn</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Từ vựng đã nhớ / thuộc (SRS ≥ 2)</td>
                <td>${Number(counts.vocab_words || 0)} từ</td>
                <td>+2 XP / từ (1 lần)</td>
                <td style="text-align: right;"><strong>+${Number(sum.vocab_xp || 0).toLocaleString()} XP</strong></td>
              </tr>
              <tr>
                <td>Hoàn thành từ vựng bài học</td>
                <td>${Number(counts.lesson_vocab_done || 0)} bài</td>
                <td>+10 XP / bài (1 lần)</td>
                <td style="text-align: right;"><strong>+${Number(sum.lesson_vocab_xp || 0).toLocaleString()} XP</strong></td>
              </tr>
              <tr>
                <td>Vượt qua Quiz cuối bài</td>
                <td>${Number(counts.quiz_passed_count || 0)} bài</td>
                <td>Theo <code>lessons.reward_xp</code> (mặc định +50 XP)</td>
                <td style="text-align: right;"><strong>+${Number(sum.quiz_xp || 0).toLocaleString()} XP</strong></td>
              </tr>
              <tr>
                <td>Hoàn thành bài tập đã nộp</td>
                <td>${Number(counts.assign_done_count || 0)} bài</td>
                <td>Theo <code>assignments.reward_xp</code> (nghe ≥ 60đ)</td>
                <td style="text-align: right;"><strong>+${Number(sum.assign_xp || 0).toLocaleString()} XP</strong></td>
              </tr>
              <tr>
                <td>Giáo viên chấm bài ghi âm</td>
                <td>${Number(counts.rec_graded_count || 0)} bài</td>
                <td><code>round((score/100) × reward_xp)</code></td>
                <td style="text-align: right;"><strong>+${Number(sum.recording_xp || 0).toLocaleString()} XP</strong></td>
              </tr>
              <tr>
                <td>Thưởng hợp lệ khác (Admin / Streak / Sự kiện)</td>
                <td>--</td>
                <td>Từ giao dịch <code>admin_reward / streak_bonus / ...</code></td>
                <td style="text-align: right;"><strong>+${Number(sum.manual_bonus_xp || 0).toLocaleString()} XP</strong></td>
              </tr>
              ${Number(sum.preserved_deleted_xp || 0) > 0 ? `
                <tr>
                  <td>XP bảo lưu từ bài học / bài tập cũ đã xóa</td>
                  <td>--</td>
                  <td>Giữ nguyên khi xóa bài tập/lớp cũ (không cộng trùng)</td>
                  <td style="text-align: right;"><strong>+${Number(sum.preserved_deleted_xp || 0).toLocaleString()} XP</strong></td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>

        <h4 style="font-size: 14px; font-weight: 700; margin-bottom: 4px; color: var(--text-main);">2. Các khoản đã bù XP</h4>
        ${logsHtml}

        <h4 style="font-size: 14px; font-weight: 700; margin: 16px 0 8px; color: var(--text-main);">3. Giao dịch XP gần nhất (tối đa 30 dòng)</h4>
        ${recentTx.length > 0 ? `
          <div class="table-responsive">
            <table class="data-table" style="font-size: 12.5px;">
              <thead>
                <tr>
                  <th>Thời gian (VN)</th>
                  <th>Loại</th>
                  <th>Mô tả</th>
                  <th>Phân loại</th>
                  <th style="text-align: right;">XP</th>
                </tr>
              </thead>
              <tbody>
                ${recentTx.map(t => `
                  <tr>
                    <td>${escHtml(formatVnDateTime(t.created_at, false) || '--')}</td>
                    <td><code>${escHtml(safeStr(t.source_type))}</code></td>
                    <td>${escHtml(safeStr(t.description, '--'))}</td>
                    <td>
                      ${t.is_backfilled
                        ? `<span style="color: #38bdf8; font-weight: 600;">Đã bù (${escHtml(formatVnDateTime(t.backfilled_at, false))})</span>`
                        : (safeStr(t.description).startsWith('Bù XP')
                          ? '<span style="color: var(--warning);">Nghi bù cũ</span>'
                          : '<span style="color: var(--text-muted);">XP thường</span>')}
                    </td>
                    <td style="text-align: right;"><strong>+${Number(t.amount || 0).toLocaleString()}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div style="font-size: 13px; color: var(--text-muted);">Chưa có giao dịch XP nào trong bảng xp_transactions.</div>'}
      `;
    } catch (err) {
      console.error('Lỗi tải chi tiết đối soát XP học viên:', err);
      const errMsg = safeStr(err && err.message ? err.message : String(err), 'Không thể tải chi tiết đối soát');
      auditModalBody.innerHTML = `
        <div style="text-align: center; padding: 32px; color: var(--danger);">
          <div style="font-weight: 700; margin-bottom: 6px;">Không thể tải chi tiết đối soát</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">${escHtml(errMsg)}</div>
          <button type="button" id="btn-retry-audit-detail" class="btn btn-outline btn-sm">🔄 Thử lại</button>
        </div>
      `;
      const retryBtn = document.getElementById('btn-retry-audit-detail');
      if (retryBtn) retryBtn.addEventListener('click', () => openXpAuditDetailModal(studentId));
    }
  }

  async function exportLeaderboardCsv() {
    if (!btnExportLbCsv || !classId) return;
    clearLbAlert();
    try {
      btnExportLbCsv.disabled = true;
      btnExportLbCsv.textContent = '⏳ Đang xuất CSV...';

      let exportRows = lbMergedRows;
      if (lbTotalCount > lbMergedRows.length || exportRows.length === 0) {
        const allLb = await window.Admin.getClassLeaderboardForTeacher(classId, lbCurrentPeriod, 5000, 0);
        const allIds = (allLb || []).map(r => r.student_id).filter(Boolean);
        const allRec = await window.Admin.getClassXpReconciliation(classId, allIds.length > 0 ? allIds : null, 5000, 0);
        const mapAudit = {};
        ((allRec && allRec.students) || []).forEach(s => { mapAudit[s.student_id] = s; });
        exportRows = (allLb || []).map(lb => ({ ...lb, ...(mapAudit[lb.student_id] || {}) }));
      }

      if (!exportRows || exportRows.length === 0) {
        showLbError('Lớp hiện chưa có học viên nào để xuất file CSV.');
        return;
      }

      const periodNames = {
        today: 'hom-nay',
        week: 'tuan-nay',
        month: 'thang-nay',
        all: 'tong-diem-lop'
      };

      const headers = [
        'Hạng',
        'Họ tên',
        'Username',
        'XP trong kỳ',
        'XP tổng (Hồ sơ)',
        'Tổng sổ cái (xp_transactions)',
        'XP lẽ ra phải có',
        'Chênh lệch XP',
        'Trạng thái đối soát',
        'Đã bù XP (Nhật ký)',
        'Thời điểm bù gần nhất (Giờ VN)',
        'Từ đã học',
        'Chuỗi ngày',
        'Bài tập đã hoàn thành',
        'Tổng bài tập lớp'
      ];

      const csvEscape = (v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;

      const csvLines = [
        headers.map(csvEscape).join(','),
        ...exportRows.map(r => {
          const displayName = safeStr(r.display_name) || safeStr(r.username) || 'Học viên';
          const username = safeStr(r.username) ? `@${safeStr(r.username)}` : '';
          const statusInfo = formatStatusBadge(r);
          const bfTime = formatVnDateTime(r.last_backfilled_at, true);
          return [
            Number(r.rank || 0),
            displayName,
            username,
            Number(r.period_xp || 0),
            Number(r.lifetime_xp ?? r.actual_xp ?? 0),
            Number(r.tx_xp || 0),
            Number(r.expected_xp || 0),
            Number(r.diff_xp || 0),
            statusInfo.label,
            Number(r.backfill_total_xp || 0),
            bfTime,
            Number(r.words_learned || 0),
            Number(r.current_streak || 0),
            Number(r.completed_assignments || 0),
            Number(r.total_assignments || 0)
          ].map(csvEscape).join(',');
        })
      ];

      // Thêm UTF-8 BOM (\uFEFF) để Microsoft Excel mở đúng tiếng Việt có dấu
      const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const clsSlug = safeStr(currentClass && currentClass.name, 'lop-hoc')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'lop-hoc';
      const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      link.href = url;
      link.download = `bang-xep-hang_${clsSlug}_${periodNames[lbCurrentPeriod] || 'tuan'}_${dateStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Lỗi xuất CSV:', err);
      showLbError('Không thể xuất file CSV: ' + safeStr(err && err.message ? err.message : String(err), 'Lỗi không xác định'));
    } finally {
      btnExportLbCsv.disabled = false;
      btnExportLbCsv.textContent = '📥 Xuất CSV';
    }
  }

  // Gắn sự kiện Tab Bảng xếp hạng & Đối soát
  document.querySelectorAll('.lb-period-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.lb-period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      lbCurrentPeriod = btn.getAttribute('data-period') || 'week';
      lbPage = 1;
      await loadClassLeaderboardAndAudit();
    });
  });

  if (lbClassSelector) {
    lbClassSelector.addEventListener('change', async () => {
      const nextId = lbClassSelector.value;
      if (!nextId || nextId === classId) return;
      classId = nextId;
      lbPage = 1;
      try {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('id', classId);
        nextUrl.searchParams.set('tab', activeTabId);
        window.history.replaceState({}, '', nextUrl.toString());
      } catch (e) {}
      await loadClassAllData();
    });
  }

  if (btnRunXpAudit) {
    btnRunXpAudit.addEventListener('click', () => loadClassLeaderboardAndAudit({ forceAuditBtn: true }));
  }

  if (btnExportLbCsv) {
    btnExportLbCsv.addEventListener('click', exportLeaderboardCsv);
  }

  if (lbAuditSearch) {
    lbAuditSearch.addEventListener('input', () => {
      if (lbSearchTimer) clearTimeout(lbSearchTimer);
      lbSearchTimer = setTimeout(() => {
        if (lbTotalCount > LB_PAGE_SIZE) {
          loadClassLeaderboardAndAudit();
        } else {
          renderLeaderboardAuditTable();
          updateLeaderboardPaginationUi();
        }
      }, 220);
    });
  }

  if (lbAuditFilter) {
    lbAuditFilter.addEventListener('change', () => {
      if (lbTotalCount > LB_PAGE_SIZE) {
        loadClassLeaderboardAndAudit();
      } else {
        renderLeaderboardAuditTable();
        updateLeaderboardPaginationUi();
      }
    });
  }

  if (btnLbPrevPage) {
    btnLbPrevPage.addEventListener('click', async () => {
      if (lbPage > 1) {
        lbPage--;
        await loadClassLeaderboardAndAudit();
      }
    });
  }

  if (btnLbNextPage) {
    btnLbNextPage.addEventListener('click', async () => {
      const totalPages = Math.max(1, Math.ceil(lbTotalCount / LB_PAGE_SIZE));
      if (lbPage < totalPages) {
        lbPage++;
        await loadClassLeaderboardAndAudit();
      }
    });
  }

  document.querySelectorAll('[data-close="modal-xp-audit-detail"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (modalXpAuditDetail) modalXpAuditDetail.classList.remove('active');
    });
  });

  if (modalXpAuditDetail) {
    modalXpAuditDetail.addEventListener('click', (e) => {
      if (e.target === modalXpAuditDetail) modalXpAuditDetail.classList.remove('active');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalXpAuditDetail && modalXpAuditDetail.classList.contains('active')) {
      modalXpAuditDetail.classList.remove('active');
    }
  });

  // ===========================================================================
  // 11. TAB TỰ HỌC (FLASHCARD RIÊNG CỦA LỚP - GIÁO VIÊN / ADMIN)
  // ===========================================================================
  const ssTabAlert = document.getElementById('ss-tab-alert');
  const ssDecksContainer = document.getElementById('ss-decks-container');
  const btnOpenSsDeckModal = document.getElementById('btn-open-ss-deck-modal');
  const btnRefreshSsDecks = document.getElementById('btn-refresh-ss-decks');

  const ssCardsPanel = document.getElementById('ss-cards-panel');
  const ssSelectedDeckTitle = document.getElementById('ss-selected-deck-title');
  const ssSelectedDeckMeta = document.getElementById('ss-selected-deck-meta');
  const ssCardsAlert = document.getElementById('ss-cards-alert');
  const ssCardsTableBody = document.getElementById('ss-cards-table-body');
  const btnOpenSsManualCard = document.getElementById('btn-open-ss-manual-card');
  const btnOpenSsWarehouseModal = document.getElementById('btn-open-ss-warehouse-modal');

  // Modal Bộ thẻ
  const modalSsDeck = document.getElementById('modal-ss-deck');
  const ssDeckModalTitle = document.getElementById('ss-deck-modal-title');
  const formSsDeck = document.getElementById('form-ss-deck');
  const ssDeckModalAlert = document.getElementById('ss-deck-modal-alert');
  const ssDeckIdInput = document.getElementById('ss-deck-id');
  const ssDeckTitleInput = document.getElementById('ss-deck-title');
  const ssDeckDescInput = document.getElementById('ss-deck-desc');
  const ssDeckActiveInput = document.getElementById('ss-deck-active');
  const btnSaveSsDeck = document.getElementById('btn-save-ss-deck');

  // Modal Thẻ Tự nhập
  const modalSsCard = document.getElementById('modal-ss-card');
  const ssCardModalTitle = document.getElementById('ss-card-modal-title');
  const formSsCard = document.getElementById('form-ss-card');
  const ssCardModalAlert = document.getElementById('ss-card-modal-alert');
  const ssCardIdInput = document.getElementById('ss-card-id');
  const ssCardHanziInput = document.getElementById('ss-card-hanzi');
  const ssCardPinyinInput = document.getElementById('ss-card-pinyin');
  const ssCardMeaningInput = document.getElementById('ss-card-meaning');
  const ssCardExHanziInput = document.getElementById('ss-card-ex-hanzi');
  const ssCardExPinyinInput = document.getElementById('ss-card-ex-pinyin');
  const ssCardExViInput = document.getElementById('ss-card-ex-vi');
  const ssCardNoteInput = document.getElementById('ss-card-note');
  const btnSaveSsCard = document.getElementById('btn-save-ss-card');

  // Modal Chọn từ Kho từ vựng (Phân trang phía server + lọc HSK + sort_order Excel)
  const modalSsWh = document.getElementById('modal-ss-warehouse-vocab');
  const ssWhAlert = document.getElementById('ss-wh-alert');
  const ssWhSearchInput = document.getElementById('ss-wh-search');
  const ssWhHskSelect = document.getElementById('ss-wh-hsk');
  const ssWhSortSelect = document.getElementById('ss-wh-sort');
  const btnSsWhSearch = document.getElementById('btn-ss-wh-search');
  const btnSsWhSelectPage = document.getElementById('btn-ss-wh-select-page');
  const btnSsWhClearAll = document.getElementById('btn-ss-wh-clear-all');
  const ssWhSelectedInfo = document.getElementById('ss-wh-selected-info');
  const chkSsWhPageAll = document.getElementById('chk-ss-wh-page-all');
  const ssWhTableBody = document.getElementById('ss-wh-table-body');
  const ssWhPageInfo = document.getElementById('ss-wh-page-info');
  const btnSsWhPrev = document.getElementById('btn-ss-wh-prev');
  const btnSsWhNext = document.getElementById('btn-ss-wh-next');
  const ssWhPageIndicator = document.getElementById('ss-wh-page-indicator');
  const btnSsWhConfirm = document.getElementById('btn-ss-wh-confirm');

  let ssDecksList = [];
  let selectedSsDeckId = null;
  let ssCardsList = [];
  let isReorderingSsCards = false;

  // State modal kho từ vựng
  let ssWhPage = 1;
  const SS_WH_PAGE_SIZE = 30;
  let ssWhTotalPages = 1;
  let ssWhCurrentPageRows = [];
  let ssWhSelectedIds = [];
  let ssWhDebounceTimer = null;

  function showSsAlert(alertEl, msg, type = 'danger', retryFn = null) {
    if (!alertEl) return;
    alertEl.className = `alert alert-${type} show`;
    alertEl.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = safeStr(msg, 'Đã xảy ra lỗi.');
    alertEl.appendChild(span);
    if (typeof retryFn === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-sm';
      btn.style.cssText = 'margin-left: 10px; height: 28px; padding: 0 10px; font-size: 12px;';
      btn.textContent = '🔄 Thử lại';
      btn.addEventListener('click', () => {
        alertEl.className = 'alert';
        alertEl.textContent = '';
        retryFn();
      });
      alertEl.appendChild(btn);
    }
  }

  function clearSsAlert(alertEl) {
    if (!alertEl) return;
    alertEl.className = 'alert';
    alertEl.textContent = '';
  }

  async function loadSelfStudyTab() {
    if (!ssDecksContainer || !classId) return;
    clearSsAlert(ssTabAlert);
    ssDecksContainer.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);">⏳ Đang tải danh sách bộ thẻ Tự học...</div>';

    try {
      ssDecksList = await window.Admin.getClassSelfStudyDecks(classId);
      if (!ssDecksList || ssDecksList.length === 0) {
        selectedSsDeckId = null;
        ssCardsList = [];
        ssDecksContainer.innerHTML = `
          <div style="text-align: center; padding: 28px; color: var(--text-muted); background: var(--bg-subtle); border-radius: var(--radius-sm);">
            Lớp này chưa có bộ thẻ Tự học nào. Hãy bấm <strong>"➕ Tạo bộ thẻ mới"</strong> ở góc trên để thêm bộ thẻ đầu tiên!
          </div>
        `;
        if (ssCardsPanel) ssCardsPanel.style.display = 'none';
        return;
      }

      if (!selectedSsDeckId || !ssDecksList.some(d => d.id === selectedSsDeckId)) {
        selectedSsDeckId = ssDecksList[0].id;
      }

      renderSsDecksList();
      await loadSelfStudyCards(selectedSsDeckId);
    } catch (err) {
      console.error('Lỗi tải tab Tự học:', err);
      ssDecksContainer.innerHTML = '';
      showSsAlert(ssTabAlert, err.message || 'Không thể tải danh sách bộ thẻ Tự học.', 'danger', loadSelfStudyTab);
    }
  }

  function renderSsDecksList() {
    if (!ssDecksContainer) return;
    ssDecksContainer.innerHTML = ssDecksList.map(d => {
      const isSelected = d.id === selectedSsDeckId;
      const isActive = Boolean(d.is_active);
      const desc = safeStr(d.description);
      const count = Number(d.card_count || 0);
      const statusBadge = isActive
        ? '<span class="badge-status badge-ongoing">🟢 Đang bật</span>'
        : '<span class="badge-status badge-completed">⚪ Đang tắt</span>';

      return `
        <div class="ss-deck-row" data-deck-id="${escHtml(d.id)}" style="border: 1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border-color)'}; background: ${isSelected ? 'var(--primary-light, rgba(248, 113, 113, 0.08))' : 'var(--bg-subtle)'}; border-radius: var(--radius-sm); padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 210px; cursor: pointer;" class="ss-deck-select-area">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <strong style="font-size: 15px; color: var(--text-main);">${escHtml(d.title)}</strong>
              ${statusBadge}
              <span style="font-size: 12px; font-weight: 700; color: var(--primary);">${count} thẻ</span>
            </div>
            ${desc ? `<div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">${escHtml(desc)}</div>` : ''}
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button type="button" class="btn ${isSelected ? 'btn-primary' : 'btn-outline'} btn-sm btn-ss-select-deck" data-deck-id="${escHtml(d.id)}">
              ${isSelected ? '📋 Đang xem thẻ' : '📋 Quản lý thẻ'}
            </button>
            <button type="button" class="btn btn-outline btn-sm btn-ss-toggle-deck" data-deck-id="${escHtml(d.id)}">
              ${isActive ? 'Tắt' : 'Bật'}
            </button>
            <button type="button" class="btn btn-outline btn-sm btn-ss-edit-deck" data-deck-id="${escHtml(d.id)}" title="Sửa bộ thẻ">
              ✏️
            </button>
            <button type="button" class="btn btn-outline btn-sm btn-ss-delete-deck" data-deck-id="${escHtml(d.id)}" style="color: var(--danger); border-color: var(--danger-border);" title="Xóa bộ thẻ">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');

    ssDecksContainer.querySelectorAll('.ss-deck-select-area, .btn-ss-select-deck').forEach(el => {
      el.addEventListener('click', async () => {
        const row = el.closest('.ss-deck-row');
        const deckId = el.getAttribute('data-deck-id') || (row ? row.getAttribute('data-deck-id') : null);
        if (!deckId) return;
        selectedSsDeckId = deckId;
        renderSsDecksList();
        await loadSelfStudyCards(deckId);
      });
    });

    ssDecksContainer.querySelectorAll('.btn-ss-toggle-deck').forEach(btn => {
      btn.addEventListener('click', async () => {
        const deckId = btn.getAttribute('data-deck-id');
        const deck = ssDecksList.find(x => x.id === deckId);
        if (!deck) return;
        btn.disabled = true;
        clearSsAlert(ssTabAlert);
        try {
          await window.Admin.upsertSelfStudyDeck({
            classId,
            deckId: deck.id,
            title: deck.title,
            description: safeStr(deck.description),
            isActive: !deck.is_active
          });
          await loadSelfStudyTab();
        } catch (err) {
          showSsAlert(ssTabAlert, err.message || 'Không thể đổi trạng thái bộ thẻ.');
          btn.disabled = false;
        }
      });
    });

    ssDecksContainer.querySelectorAll('.btn-ss-edit-deck').forEach(btn => {
      btn.addEventListener('click', () => {
        const deckId = btn.getAttribute('data-deck-id');
        const deck = ssDecksList.find(x => x.id === deckId);
        if (deck) openSsDeckModal(deck);
      });
    });

    ssDecksContainer.querySelectorAll('.btn-ss-delete-deck').forEach(btn => {
      btn.addEventListener('click', async () => {
        const deckId = btn.getAttribute('data-deck-id');
        const deck = ssDecksList.find(x => x.id === deckId);
        if (!deck) return;
        if (!confirm(`Xóa bộ thẻ "${deck.title}"?\nToàn bộ thẻ bên trong và lịch ôn của các thẻ đó sẽ bị gỡ khỏi danh sách ôn của học viên.`)) {
          return;
        }
        btn.disabled = true;
        clearSsAlert(ssTabAlert);
        try {
          await window.Admin.deleteSelfStudyDeck(deck.id);
          showSsAlert(ssTabAlert, `Đã xóa bộ thẻ "${deck.title}".`, 'success');
          if (selectedSsDeckId === deck.id) selectedSsDeckId = null;
          await loadSelfStudyTab();
        } catch (err) {
          showSsAlert(ssTabAlert, err.message || 'Lỗi khi xóa bộ thẻ.');
          btn.disabled = false;
        }
      });
    });
  }

  async function loadSelfStudyCards(deckId) {
    if (!ssCardsPanel || !ssCardsTableBody || !deckId) return;
    const deck = ssDecksList.find(d => d.id === deckId);
    ssCardsPanel.style.display = 'block';
    clearSsAlert(ssCardsAlert);

    if (ssSelectedDeckTitle) ssSelectedDeckTitle.textContent = deck ? safeStr(deck.title) : 'Bộ thẻ Tự học';
    if (ssSelectedDeckMeta) {
      ssSelectedDeckMeta.textContent = deck
        ? `${deck.is_active ? '🟢 Đang bật' : '⚪ Đang tắt'} · ${safeStr(deck.description) || 'Chưa có mô tả'}`
        : '--';
    }

    ssCardsTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">⏳ Đang tải danh sách thẻ...</td></tr>';

    try {
      ssCardsList = await window.Admin.getSelfStudyCards(deckId);
      const deckIdx = ssDecksList.findIndex(d => d.id === deckId);
      if (deckIdx >= 0) ssDecksList[deckIdx].card_count = ssCardsList.length;

      if (!ssCardsList || ssCardsList.length === 0) {
        ssCardsTableBody.innerHTML = `
          <tr><td colspan="7" style="text-align: center; padding: 28px; color: var(--text-muted);">
            Bộ thẻ này chưa có thẻ nào. Bạn có thể bấm <strong>"✍️ Tự nhập thẻ mới"</strong> hoặc <strong>"📚 Chọn từ Kho từ vựng"</strong>!
          </td></tr>
        `;
        return;
      }

      ssCardsTableBody.innerHTML = ssCardsList.map((c, idx) => {
        const exHanzi = safeStr(c.example_hanzi);
        const exPinyin = safeStr(c.example_pinyin);
        const exVi = safeStr(c.example_vi);
        const note = safeStr(c.note);
        const fromWhBadge = c.vocabulary_id
          ? '<span style="font-size: 11px; color: var(--text-muted); display: block;">(Từ kho)</span>'
          : '';

        const extraLines = [
          exHanzi ? `<div><strong>VD:</strong> ${escHtml(exHanzi)}</div>` : '',
          exPinyin ? `<div style="color: var(--text-muted);">${escHtml(exPinyin)}</div>` : '',
          exVi ? `<div style="color: var(--text-muted);">${escHtml(exVi)}</div>` : '',
          note ? `<div style="color: var(--warning); margin-top: 2px;">📝 ${escHtml(note)}</div>` : ''
        ].join('') || '<span style="color: var(--text-light);">--</span>';

        return `
          <tr>
            <td style="text-align: center; font-weight: 700; color: var(--text-muted);">${idx + 1}</td>
            <td style="font-size: 18px; font-weight: 800; color: var(--primary); font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;">
              ${escHtml(c.hanzi)}${fromWhBadge}
            </td>
            <td style="font-weight: 600; color: var(--text-muted);">${escHtml(c.pinyin)}</td>
            <td style="font-weight: 500;">${escHtml(c.meaning_vi)}</td>
            <td style="font-size: 12.5px; line-height: 1.45;">${extraLines}</td>
            <td style="text-align: center; white-space: nowrap;">
              <button type="button" class="btn btn-outline btn-sm btn-ss-move-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} style="padding: 2px 7px;" title="Lên">⬆️</button>
              <button type="button" class="btn btn-outline btn-sm btn-ss-move-down" data-idx="${idx}" ${idx === ssCardsList.length - 1 ? 'disabled' : ''} style="padding: 2px 7px;" title="Xuống">⬇️</button>
            </td>
            <td style="text-align: right; white-space: nowrap;">
              <button type="button" class="btn btn-outline btn-sm btn-ss-edit-card" data-card-id="${escHtml(c.id)}" title="Sửa thẻ">✏️</button>
              <button type="button" class="btn btn-outline btn-sm btn-ss-delete-card" data-card-id="${escHtml(c.id)}" style="color: var(--danger); border-color: var(--danger-border);" title="Xóa thẻ">🗑️</button>
            </td>
          </tr>
        `;
      }).join('');

      ssCardsTableBody.querySelectorAll('.btn-ss-move-up').forEach(btn => {
        btn.addEventListener('click', () => moveSsCardOrder(parseInt(btn.getAttribute('data-idx'), 10), -1));
      });
      ssCardsTableBody.querySelectorAll('.btn-ss-move-down').forEach(btn => {
        btn.addEventListener('click', () => moveSsCardOrder(parseInt(btn.getAttribute('data-idx'), 10), 1));
      });
      ssCardsTableBody.querySelectorAll('.btn-ss-edit-card').forEach(btn => {
        btn.addEventListener('click', () => {
          const cid = btn.getAttribute('data-card-id');
          const card = ssCardsList.find(x => x.id === cid);
          if (card) openSsCardModal(card);
        });
      });
      ssCardsTableBody.querySelectorAll('.btn-ss-delete-card').forEach(btn => {
        btn.addEventListener('click', async () => {
          const cid = btn.getAttribute('data-card-id');
          const card = ssCardsList.find(x => x.id === cid);
          if (!card) return;
          if (!confirm(`Xóa thẻ "${card.hanzi}" khỏi bộ thẻ? Tiến độ ôn của thẻ này cũng sẽ được dọn sạch.`)) return;
          btn.disabled = true;
          clearSsAlert(ssCardsAlert);
          try {
            await window.Admin.deleteSelfStudyCard(card.id);
            await loadSelfStudyTab();
          } catch (err) {
            showSsAlert(ssCardsAlert, err.message || 'Lỗi xóa thẻ.');
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      console.error('Lỗi tải danh sách thẻ Tự học:', err);
      ssCardsTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--danger);">Không thể tải danh sách thẻ.</td></tr>';
      showSsAlert(ssCardsAlert, err.message || 'Lỗi tải danh sách thẻ.', 'danger', () => loadSelfStudyCards(deckId));
    }
  }

  async function moveSsCardOrder(idx, delta) {
    if (isReorderingSsCards || !selectedSsDeckId) return;
    const targetIdx = idx + delta;
    if (idx < 0 || targetIdx < 0 || idx >= ssCardsList.length || targetIdx >= ssCardsList.length) return;

    isReorderingSsCards = true;
    clearSsAlert(ssCardsAlert);
    const copy = [...ssCardsList];
    const tmp = copy[idx];
    copy[idx] = copy[targetIdx];
    copy[targetIdx] = tmp;

    try {
      await window.Admin.reorderSelfStudyCards(selectedSsDeckId, copy.map(c => c.id));
      await loadSelfStudyCards(selectedSsDeckId);
    } catch (err) {
      showSsAlert(ssCardsAlert, err.message || 'Không thể đổi thứ tự thẻ.');
    } finally {
      isReorderingSsCards = false;
    }
  }

  // Modal Bộ thẻ
  function openSsDeckModal(deck = null) {
    if (!modalSsDeck) return;
    clearSsAlert(ssDeckModalAlert);
    ssDeckIdInput.value = deck ? deck.id : '';
    ssDeckTitleInput.value = deck ? safeStr(deck.title) : '';
    ssDeckDescInput.value = deck ? safeStr(deck.description) : '';
    ssDeckActiveInput.checked = deck ? Boolean(deck.is_active) : true;
    if (ssDeckModalTitle) ssDeckModalTitle.textContent = deck ? 'Chỉnh sửa bộ thẻ Tự học' : 'Tạo bộ thẻ Tự học mới';
    modalSsDeck.classList.add('active');
  }

  if (btnOpenSsDeckModal) btnOpenSsDeckModal.addEventListener('click', () => openSsDeckModal(null));
  if (btnRefreshSsDecks) btnRefreshSsDecks.addEventListener('click', loadSelfStudyTab);
  document.querySelectorAll('[data-close="modal-ss-deck"]').forEach(btn => {
    btn.addEventListener('click', () => modalSsDeck && modalSsDeck.classList.remove('active'));
  });

  if (formSsDeck) {
    formSsDeck.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearSsAlert(ssDeckModalAlert);
      const title = ssDeckTitleInput.value.trim();
      const description = ssDeckDescInput.value.trim();
      const isActive = ssDeckActiveInput.checked;
      const deckId = ssDeckIdInput.value.trim() || null;

      if (!title) {
        showSsAlert(ssDeckModalAlert, 'Vui lòng nhập tên bộ thẻ!');
        return;
      }

      try {
        btnSaveSsDeck.disabled = true;
        btnSaveSsDeck.textContent = '⏳ Đang lưu...';
        const saved = await window.Admin.upsertSelfStudyDeck({
          classId,
          deckId,
          title,
          description,
          isActive
        });
        if (saved && saved.id) selectedSsDeckId = saved.id;
        modalSsDeck.classList.remove('active');
        showSsAlert(ssTabAlert, deckId ? 'Đã cập nhật bộ thẻ Tự học.' : 'Đã tạo bộ thẻ Tự học mới!', 'success');
        await loadSelfStudyTab();
      } catch (err) {
        showSsAlert(ssDeckModalAlert, err.message || 'Lỗi khi lưu bộ thẻ.');
      } finally {
        btnSaveSsDeck.disabled = false;
        btnSaveSsDeck.textContent = '💾 Lưu bộ thẻ';
      }
    });
  }

  // Modal Tự nhập / Sửa thẻ
  function openSsCardModal(card = null) {
    if (!modalSsCard || !selectedSsDeckId) return;
    clearSsAlert(ssCardModalAlert);
    ssCardIdInput.value = card ? card.id : '';
    ssCardHanziInput.value = card ? safeStr(card.hanzi) : '';
    ssCardPinyinInput.value = card ? safeStr(card.pinyin) : '';
    ssCardMeaningInput.value = card ? safeStr(card.meaning_vi) : '';
    ssCardExHanziInput.value = card ? safeStr(card.example_hanzi) : '';
    ssCardExPinyinInput.value = card ? safeStr(card.example_pinyin) : '';
    ssCardExViInput.value = card ? safeStr(card.example_vi) : '';
    ssCardNoteInput.value = card ? safeStr(card.note) : '';
    if (ssCardModalTitle) ssCardModalTitle.textContent = card ? `Sửa thẻ: ${safeStr(card.hanzi)}` : 'Thêm thẻ Tự học mới';
    modalSsCard.classList.add('active');
  }

  if (btnOpenSsManualCard) btnOpenSsManualCard.addEventListener('click', () => openSsCardModal(null));
  document.querySelectorAll('[data-close="modal-ss-card"]').forEach(btn => {
    btn.addEventListener('click', () => modalSsCard && modalSsCard.classList.remove('active'));
  });

  if (formSsCard) {
    formSsCard.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!selectedSsDeckId) return;
      clearSsAlert(ssCardModalAlert);

      const cardId = ssCardIdInput.value.trim() || null;
      const hanzi = ssCardHanziInput.value.trim();
      const pinyin = ssCardPinyinInput.value.trim();
      const meaningVi = ssCardMeaningInput.value.trim();
      if (!hanzi || !pinyin || !meaningVi) {
        showSsAlert(ssCardModalAlert, 'Chữ Hán, Pinyin và Nghĩa tiếng Việt là bắt buộc!');
        return;
      }

      try {
        btnSaveSsCard.disabled = true;
        btnSaveSsCard.textContent = '⏳ Đang lưu...';
        await window.Admin.upsertSelfStudyCard({
          deckId: selectedSsDeckId,
          cardId,
          hanzi,
          pinyin,
          meaningVi,
          exampleHanzi: ssCardExHanziInput.value.trim(),
          examplePinyin: ssCardExPinyinInput.value.trim(),
          exampleVi: ssCardExViInput.value.trim(),
          note: ssCardNoteInput.value.trim()
        });
        modalSsCard.classList.remove('active');
        showSsAlert(ssCardsAlert, cardId ? 'Đã cập nhật thẻ.' : 'Đã thêm thẻ mới vào bộ thẻ!', 'success');
        await loadSelfStudyTab();
      } catch (err) {
        showSsAlert(ssCardModalAlert, err.message || 'Lỗi khi lưu thẻ.');
      } finally {
        btnSaveSsCard.disabled = false;
        btnSaveSsCard.textContent = '💾 Lưu thẻ';
      }
    });
  }

  // Modal Chọn từ Kho từ vựng (Phân trang phía server + lọc HSK + sort_order)
  function updateSsWarehouseSelectionUi() {
    if (ssWhSelectedInfo) ssWhSelectedInfo.textContent = `Đã chọn: ${ssWhSelectedIds.length} từ`;
    if (btnSsWhConfirm) {
      btnSsWhConfirm.textContent = `➕ Thêm (${ssWhSelectedIds.length}) từ vào bộ thẻ`;
      btnSsWhConfirm.disabled = ssWhSelectedIds.length === 0;
    }
    if (chkSsWhPageAll) {
      const enabledCheckboxes = Array.from(document.querySelectorAll('.chk-ss-wh-vocab:not(:disabled)'));
      chkSsWhPageAll.checked = enabledCheckboxes.length > 0 && enabledCheckboxes.every(c => c.checked);
    }
  }

  async function loadSsWarehousePage() {
    if (!ssWhTableBody) return;
    clearSsAlert(ssWhAlert);
    ssWhTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">⏳ Đang tải từ vựng từ kho (phân trang server)...</td></tr>';

    try {
      const search = ssWhSearchInput ? ssWhSearchInput.value.trim() : '';
      const hskLevel = ssWhHskSelect ? ssWhHskSelect.value : 'all';
      const sortBy = ssWhSortSelect ? ssWhSortSelect.value : 'sort_order';

      const res = await window.Admin.getVocabularies({
        hskLevel,
        search,
        sortBy,
        page: ssWhPage,
        limit: SS_WH_PAGE_SIZE
      });

      ssWhCurrentPageRows = Array.isArray(res && res.data) ? res.data : [];
      const total = Number(res && res.total ? res.total : 0);
      ssWhTotalPages = Math.max(1, Number(res && res.totalPages ? res.totalPages : 1));
      if (ssWhPage > ssWhTotalPages) ssWhPage = ssWhTotalPages;

      const existingVocabSet = new Set(ssCardsList.map(c => c.vocabulary_id).filter(Boolean));
      const selectedSet = new Set(ssWhSelectedIds);

      if (ssWhPageInfo) {
        const from = total === 0 ? 0 : (ssWhPage - 1) * SS_WH_PAGE_SIZE + 1;
        const to = Math.min(ssWhPage * SS_WH_PAGE_SIZE, total);
        ssWhPageInfo.textContent = total === 0
          ? 'Không có từ vựng nào khớp bộ lọc'
          : `Hiển thị ${from}–${to} / ${total.toLocaleString('vi-VN')} từ`;
      }
      if (ssWhPageIndicator) ssWhPageIndicator.textContent = `Trang ${ssWhPage} / ${ssWhTotalPages}`;
      if (btnSsWhPrev) btnSsWhPrev.disabled = ssWhPage <= 1;
      if (btnSsWhNext) btnSsWhNext.disabled = ssWhPage >= ssWhTotalPages;

      if (ssWhCurrentPageRows.length === 0) {
        ssWhTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">Không tìm thấy từ vựng phù hợp bộ lọc.</td></tr>';
        updateSsWarehouseSelectionUi();
        return;
      }

      ssWhTableBody.innerHTML = ssWhCurrentPageRows.map((w, idx) => {
        const alreadyInDeck = existingVocabSet.has(w.id);
        const checked = selectedSet.has(w.id);
        const stt = (w.sort_order !== null && w.sort_order !== undefined) ? w.sort_order : ((ssWhPage - 1) * SS_WH_PAGE_SIZE + idx + 1);
        const statusHtml = alreadyInDeck
          ? '<span class="badge-status badge-ongoing" style="font-size: 11px;">Đã có trong bộ</span>'
          : '<span style="font-size: 11.5px; color: var(--text-muted);">Chưa thêm</span>';

        return `
          <tr>
            <td style="text-align: center;">
              <input type="checkbox" class="chk-ss-wh-vocab" value="${escHtml(w.id)}" ${alreadyInDeck ? 'disabled' : ''} ${checked ? 'checked' : ''} style="width: 16px; height: 16px;">
            </td>
            <td style="text-align: center; font-weight: 700; color: var(--text-muted);">${stt}</td>
            <td style="font-size: 17px; font-weight: 800; color: var(--primary); font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;">${escHtml(w.hanzi)}</td>
            <td style="font-weight: 600; color: var(--text-muted);">${escHtml(w.pinyin)}</td>
            <td>${escHtml(w.meaning_vi)}</td>
            <td><span class="badge-hsk badge-hsk-${Number(w.hsk_level || 1)}">HSK ${Number(w.hsk_level || 1)}</span></td>
            <td>${statusHtml}</td>
          </tr>
        `;
      }).join('');

      ssWhTableBody.querySelectorAll('.chk-ss-wh-vocab').forEach(chk => {
        chk.addEventListener('change', () => {
          const vid = chk.value;
          if (chk.checked) {
            if (!ssWhSelectedIds.includes(vid)) ssWhSelectedIds.push(vid);
          } else {
            ssWhSelectedIds = ssWhSelectedIds.filter(x => x !== vid);
          }
          updateSsWarehouseSelectionUi();
        });
      });

      updateSsWarehouseSelectionUi();
    } catch (err) {
      console.error('Lỗi tải kho từ vựng cho Tự học:', err);
      ssWhTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--danger);">Lỗi tải dữ liệu kho từ vựng.</td></tr>';
      showSsAlert(ssWhAlert, err.message || 'Không thể tải danh sách từ từ kho.', 'danger', loadSsWarehousePage);
    }
  }

  if (btnOpenSsWarehouseModal) {
    btnOpenSsWarehouseModal.addEventListener('click', () => {
      if (!selectedSsDeckId || !modalSsWh) return;
      ssWhPage = 1;
      ssWhSelectedIds = [];
      if (ssWhSearchInput) ssWhSearchInput.value = '';
      if (ssWhHskSelect) ssWhHskSelect.value = 'all';
      if (ssWhSortSelect) ssWhSortSelect.value = 'sort_order';
      modalSsWh.classList.add('active');
      loadSsWarehousePage();
    });
  }

  document.querySelectorAll('[data-close="modal-ss-warehouse-vocab"]').forEach(btn => {
    btn.addEventListener('click', () => modalSsWh && modalSsWh.classList.remove('active'));
  });

  if (btnSsWhSearch) {
    btnSsWhSearch.addEventListener('click', () => { ssWhPage = 1; loadSsWarehousePage(); });
  }
  if (ssWhSearchInput) {
    ssWhSearchInput.addEventListener('input', () => {
      if (ssWhDebounceTimer) clearTimeout(ssWhDebounceTimer);
      ssWhDebounceTimer = setTimeout(() => { ssWhPage = 1; loadSsWarehousePage(); }, 300);
    });
  }
  if (ssWhHskSelect) ssWhHskSelect.addEventListener('change', () => { ssWhPage = 1; loadSsWarehousePage(); });
  if (ssWhSortSelect) ssWhSortSelect.addEventListener('change', () => { ssWhPage = 1; loadSsWarehousePage(); });

  if (btnSsWhPrev) btnSsWhPrev.addEventListener('click', () => { if (ssWhPage > 1) { ssWhPage--; loadSsWarehousePage(); } });
  if (btnSsWhNext) btnSsWhNext.addEventListener('click', () => { if (ssWhPage < ssWhTotalPages) { ssWhPage++; loadSsWarehousePage(); } });

  function setCurrentPageWarehouseChecked(checkedState) {
    document.querySelectorAll('.chk-ss-wh-vocab:not(:disabled)').forEach(chk => {
      chk.checked = checkedState;
      const vid = chk.value;
      if (checkedState) {
        if (!ssWhSelectedIds.includes(vid)) ssWhSelectedIds.push(vid);
      } else {
        ssWhSelectedIds = ssWhSelectedIds.filter(x => x !== vid);
      }
    });
    updateSsWarehouseSelectionUi();
  }

  if (chkSsWhPageAll) chkSsWhPageAll.addEventListener('change', () => setCurrentPageWarehouseChecked(chkSsWhPageAll.checked));
  if (btnSsWhSelectPage) btnSsWhSelectPage.addEventListener('click', () => setCurrentPageWarehouseChecked(true));
  if (btnSsWhClearAll) {
    btnSsWhClearAll.addEventListener('click', () => {
      ssWhSelectedIds = [];
      document.querySelectorAll('.chk-ss-wh-vocab:not(:disabled)').forEach(chk => { chk.checked = false; });
      updateSsWarehouseSelectionUi();
    });
  }

  if (btnSsWhConfirm) {
    btnSsWhConfirm.addEventListener('click', async () => {
      if (!selectedSsDeckId || ssWhSelectedIds.length === 0) return;
      clearSsAlert(ssWhAlert);
      try {
        btnSsWhConfirm.disabled = true;
        btnSsWhConfirm.textContent = '⏳ Đang thêm...';
        const res = await window.Admin.addWarehouseVocabToDeck(selectedSsDeckId, ssWhSelectedIds);
        const added = Number(res && res.added_count ? res.added_count : 0);
        const skipped = Number(res && res.skipped_count ? res.skipped_count : 0);
        modalSsWh.classList.remove('active');
        showSsAlert(
          ssCardsAlert,
          skipped > 0
            ? `Đã thêm ${added} từ vào bộ thẻ (bỏ qua ${skipped} từ đã có sẵn).`
            : `Đã thêm ${added} từ từ kho vào bộ thẻ!`,
          'success'
        );
        await loadSelfStudyTab();
      } catch (err) {
        showSsAlert(ssWhAlert, err.message || 'Không thể thêm từ vào bộ thẻ.');
      } finally {
        updateSsWarehouseSelectionUi();
      }
    });
  }

  // Khởi tạo modal đặt lại mật khẩu nếu có
  if (window.Admin && typeof window.Admin.initResetPasswordModal === 'function') {
    window.Admin.initResetPasswordModal();
  }

  // Tải dữ liệu ban đầu
  await Promise.all([
    loadCurriculumsAndTeachersDropdowns(),
    initLeaderboardClassSelector()
  ]);
  const loadedOk = await loadClassAllData();

  if (loadedOk && initialTabParam && document.getElementById(initialTabParam)) {
    activateTab(initialTabParam);
  }
});
