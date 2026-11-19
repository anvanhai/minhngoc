/**
 * LOGIC QUẢN LÝ GIÁO TRÌNH & BÀI HỌC (admin/curriculums.html)
 */

document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth(['admin', 'teacher'], '../index.html');
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);

  let curriculumsList = [];
  let selectedCurriculum = null;

  const pageAlert = document.getElementById('page-alert');
  const curriculumsListContainer = document.getElementById('curriculums-list');
  const selectedCurriculumTitle = document.getElementById('selected-curriculum-title');
  const selectedCurriculumMeta = document.getElementById('selected-curriculum-meta');
  const btnOpenCreateLesson = document.getElementById('btn-open-create-lesson');
  const lessonsTableBody = document.getElementById('lessons-table-body');

  // Modals
  const modalCreateCurriculum = document.getElementById('modal-create-curriculum');
  const btnOpenCreateCurriculum = document.getElementById('btn-open-create-curriculum');
  const formCreateCurriculum = document.getElementById('form-create-curriculum');
  const curriculumModalAlert = document.getElementById('curriculum-modal-alert');
  const btnSubmitCurriculum = document.getElementById('btn-submit-curriculum');

  const modalCreateLesson = document.getElementById('modal-create-lesson');
  const formCreateLesson = document.getElementById('form-create-lesson');
  const lessonOrderInput = document.getElementById('lesson-order');
  const lessonModalAlert = document.getElementById('lesson-modal-alert');
  const btnSubmitLesson = document.getElementById('btn-submit-lesson');

  function showAlert(msg, type = 'danger') {
    pageAlert.className = `alert alert-${type} show`;
    pageAlert.textContent = msg;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 1. Tải danh sách giáo trình
  async function loadCurriculums() {
    try {
      curriculumsList = await window.Admin.getCurriculums();

      if (!curriculumsList || curriculumsList.length === 0) {
        curriculumsListContainer.innerHTML = `
          <div style="text-align: center; padding: 24px; color: var(--text-muted);">
            Chưa có giáo trình nào. Hãy bấm "Tạo Giáo Trình Mới"!
          </div>
        `;
        return;
      }

      curriculumsListContainer.innerHTML = curriculumsList.map(c => `
        <div class="card curr-item" data-id="${c.id}" style="margin-bottom: 0; padding: 14px; cursor: pointer; border: 1px solid var(--border-color); transition: all 0.2s;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 700; color: var(--text-main); font-size: 15px;">${c.title}</div>
            <span class="badge-status badge-ongoing">${c.level}</span>
          </div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
            Mã: <code>${c.code}</code> · ${c.total_lessons || 0} bài học
          </div>
        </div>
      `).join('');

      // Gắn sự kiện click chọn giáo trình
      document.querySelectorAll('.curr-item').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-id');
          selectCurriculum(id);
        });
      });

      // Tự động chọn giáo trình đầu tiên nếu chưa chọn
      if (!selectedCurriculum && curriculumsList.length > 0) {
        selectCurriculum(curriculumsList[0].id);
      } else if (selectedCurriculum) {
        selectCurriculum(selectedCurriculum.id);
      }

    } catch (err) {
      console.error('Lỗi tải giáo trình:', err);
      showAlert('Lỗi tải giáo trình: ' + (err.message || err));
    }
  }

  // 2. Chọn một giáo trình để xem các bài học
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

    selectedCurriculumTitle.textContent = selectedCurriculum.title;
    selectedCurriculumMeta.textContent = `Trình độ: ${selectedCurriculum.level} · Mã: ${selectedCurriculum.code}`;
    btnOpenCreateLesson.style.display = 'inline-flex';

    // Tải bài học
    await loadLessons(curriculumId);
  }

  // 3. Tải danh sách bài học
  async function loadLessons(curriculumId) {
    try {
      lessonsTableBody.innerHTML = `
        <tr><td colspan="4" style="text-align: center; padding: 24px; color: var(--text-muted);">
          Đang tải bài học...
        </td></tr>
      `;

      const lessons = await window.Admin.getLessonsByCurriculum(curriculumId);

      if (!lessons || lessons.length === 0) {
        lessonsTableBody.innerHTML = `
          <tr><td colspan="4" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Giáo trình này chưa có bài học nào. Hãy nhấn <strong>"Thêm Bài Học"</strong> ở trên!
          </td></tr>
        `;
        return;
      }

      lessonsTableBody.innerHTML = lessons.map(l => `
        <tr>
          <td><strong>Bài ${l.order_index}</strong></td>
          <td style="font-size: 16px; font-weight: 600;">${l.title_zh}</td>
          <td>${l.title_vi}</td>
          <td><span style="color: #ca8a04; font-weight: 600;">+${l.reward_xp || 50} XP</span></td>
        </tr>
      `).join('');

    } catch (err) {
      console.error('Lỗi tải bài học:', err);
      lessonsTableBody.innerHTML = `<tr><td colspan="4" style="color: red; text-align: center;">Lỗi tải bài học</td></tr>`;
    }
  }

  // 4. Modal Tạo Giáo Trình
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

      await window.Admin.createCurriculum({ title, code, level, description });
      modalCreateCurriculum.classList.remove('active');
      showAlert(`Tạo giáo trình "${title}" thành công!`, 'success');
      await loadCurriculums();

    } catch (err) {
      curriculumModalAlert.className = 'alert alert-danger show';
      curriculumModalAlert.textContent = err.message || 'Lỗi khi tạo giáo trình';
    } finally {
      btnSubmitCurriculum.disabled = false;
      btnSubmitCurriculum.textContent = 'Xác nhận tạo';
    }
  });

  // 5. Modal Thêm Bài Học
  btnOpenCreateLesson.addEventListener('click', async () => {
    if (!selectedCurriculum) return;
    lessonModalAlert.className = 'alert';
    lessonModalAlert.textContent = '';
    formCreateLesson.reset();

    // Dự đoán số thứ tự bài học tiếp theo
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
      await loadCurriculums(); // Cập nhật lại tổng số bài

    } catch (err) {
      lessonModalAlert.className = 'alert alert-danger show';
      lessonModalAlert.textContent = err.message || 'Lỗi khi lưu bài học';
    } finally {
      btnSubmitLesson.disabled = false;
      btnSubmitLesson.textContent = 'Lưu bài học';
    }
  });

  // Khởi chạy
  await loadCurriculums();
});
