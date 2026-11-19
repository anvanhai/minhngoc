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

  // 2. Tải danh sách giáo trình để đưa vào select modal
  async function loadCurriculumsDropdown() {
    try {
      const curriculums = await window.Admin.getCurriculums();
      if (!curriculums || curriculums.length === 0) {
        selectCurriculum.innerHTML = '<option value="">-- Chưa có giáo trình, vui lòng tạo trước --</option>';
        return;
      }
      selectCurriculum.innerHTML = curriculums.map(c => `
        <option value="${c.id}">${c.title} (${c.level}) - ${c.total_lessons || 0} bài</option>
      `).join('');
    } catch (err) {
      console.error('Lỗi tải giáo trình:', err);
      selectCurriculum.innerHTML = '<option value="">-- Lỗi tải danh sách giáo trình --</option>';
    }
  }

  // 3. Tải danh sách lớp học và render ra grid cards
  async function loadClassesList() {
    try {
      classesContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
          Đang tải danh sách lớp học...
        </div>
      `;

      const classes = await window.Admin.getClasses();

      if (!classes || classes.length === 0) {
        classesContainer.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: #fff; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
            <div style="font-size: 40px; margin-bottom: 12px;">📚</div>
            <h3 style="margin-bottom: 8px;">Chưa có lớp học nào</h3>
            <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 16px;">
              Hãy nhấn nút "Tạo Lớp Học Mới" ở trên để khởi tạo lớp đầu tiên cho học viên.
            </p>
          </div>
        `;
        return;
      }

      classesContainer.innerHTML = classes.map(cls => {
        let statusBadge = '<span class="badge-status badge-ongoing">Đang học</span>';
        if (cls.status === 'paused') {
          statusBadge = '<span class="badge-status badge-paused">Tạm dừng</span>';
        } else if (cls.status === 'completed') {
          statusBadge = '<span class="badge-status badge-completed">Đã kết thúc</span>';
        }

        const currTitle = cls.curriculum ? cls.curriculum.title : 'Chưa gán giáo trình';
        const totalLessons = cls.curriculum ? (cls.curriculum.total_lessons || 0) : 0;

        return `
          <div class="class-card">
            <div class="class-card-header">
              <span class="class-card-title">${cls.name}</span>
              ${statusBadge}
            </div>

            <div class="class-card-curriculum">
              📖 ${currTitle} (${cls.level})
            </div>

            <div class="class-card-meta">
              <div>👥 Sĩ số: <strong>${cls.activeStudentCount || 0} học sinh</strong></div>
              <div>📍 Tiến độ lớp: <strong>Đang học Bài ${cls.current_lesson_order || 1} / ${totalLessons} bài</strong></div>
              <div>📅 Ngày mở lớp: ${cls.start_date ? new Date(cls.start_date).toLocaleDateString('vi-VN') : 'Chưa rõ'}</div>
              <div>⚙️ Chế độ mở bài: ${cls.unlock_mode === 'all_open' ? 'Mở toàn bộ' : 'Tuần tự theo bài'}</div>
            </div>

            <div style="margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border-color);">
              <a href="class-detail.html?id=${cls.id}" class="btn btn-primary btn-block btn-sm">
                ⚙️ Quản lý chi tiết lớp
              </a>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('Lỗi tải danh sách lớp:', err);
      showAlert('Không thể tải danh sách lớp học: ' + (err.message || err));
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

  // Khởi chạy ban đầu
  await loadCurriculumsDropdown();
  await loadClassesList();
});
