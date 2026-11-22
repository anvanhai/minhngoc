/**
 * MINH NGỌC HSK - LOGIC QUẢN TRỊ CÀI ĐẶT & THÔNG BÁO POPUP KẾT QUẢ (admin/settings.html)
 */

document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth(['admin', 'teacher'], '../index.html');
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);

  const EVENT_META = {
    quiz: { name: 'Quiz kiểm tra cuối bài', icon: '📝', hasScore: true },
    practice: { name: 'Ôn tập Flashcard SRS', icon: '🗂️', hasScore: true },
    listening: { name: 'Bài Nghe hiểu', icon: '🎧', hasScore: true },
    vocabulary: { name: 'Hoàn thành phần Từ vựng', icon: '📖', hasScore: false },
    speaking: { name: 'Nộp bài Nói / Ghi âm', icon: '🎙️', hasScore: false },
    lesson: { name: 'Hoàn thành toàn bộ Bài học', icon: '🎓', hasScore: false },
    assignment: { name: 'Nộp Bài tập được giao', icon: '📋', hasScore: false }
  };

  let allFeedbacks = [];
  let currentEventFilter = 'all';
  let pendingUploadFile = null;

  const pageAlert = document.getElementById('page-alert');
  const feedbacksContainer = document.getElementById('feedbacks-container');
  const feedbackCountText = document.getElementById('feedback-count-text');
  const eventFilterTabs = document.querySelectorAll('.event-tab-btn');

  // Modal Thêm / Sửa Feedback
  const modalFeedbackEditor = document.getElementById('modal-feedback-editor');
  const btnOpenCreateFeedback = document.getElementById('btn-open-create-feedback');
  const formFeedbackEditor = document.getElementById('form-feedback-editor');
  const modalFeedbackTitle = document.getElementById('modal-feedback-title');
  const feedbackModalAlert = document.getElementById('feedback-modal-alert');
  const btnSubmitFeedback = document.getElementById('btn-submit-feedback');

  const inputId = document.getElementById('f-id');
  const selectEvent = document.getElementById('f-event');
  const scoreRangeGroup = document.getElementById('score-range-group');
  const inputMinScore = document.getElementById('f-min-score');
  const inputMaxScore = document.getElementById('f-max-score');
  const fileInput = document.getElementById('f-file-input');
  const btnBrowseImg = document.getElementById('btn-browse-img');
  const fileChosenName = document.getElementById('file-chosen-name');
  const inputImageUrl = document.getElementById('f-image-url');
  const imgPreviewTag = document.getElementById('img-preview-tag');
  const imgPreviewPlaceholder = document.getElementById('img-preview-placeholder');
  const inputTitle = document.getElementById('f-title');
  const inputMessage = document.getElementById('f-message');
  const inputBtnText = document.getElementById('f-btn-text');
  const inputSortOrder = document.getElementById('f-sort-order');
  const checkIsActive = document.getElementById('f-is-active');

  // Modal Xem thử Popup (Preview)
  const modalPreviewFeedback = document.getElementById('modal-preview-feedback');
  const previewPopupImg = document.getElementById('preview-popup-img');
  const previewPopupBadgeBox = document.getElementById('preview-popup-badge-box');
  const previewPopupBadge = document.getElementById('preview-popup-badge');
  const previewPopupTitle = document.getElementById('preview-popup-title');
  const previewPopupMsg = document.getElementById('preview-popup-msg');
  const previewPopupBtn = document.getElementById('preview-popup-btn');

  function showAlert(msg, type = 'danger') {
    pageAlert.className = `alert alert-${type} show`;
    pageAlert.textContent = msg;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ===========================================================================
  // 1. TẢI VÀ HIỂN THỊ DANH SÁCH FEEDBACK
  // ===========================================================================
  async function loadFeedbacksList() {
    try {
      feedbacksContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted); grid-column: 1 / -1;">
          Đang nạp cấu hình thông báo kết quả...
        </div>
      `;

      allFeedbacks = await window.Admin.getFeedbacks();

      let filtered = allFeedbacks;
      if (currentEventFilter !== 'all') {
        filtered = allFeedbacks.filter(f => f.event_type === currentEventFilter);
      }

      feedbackCountText.textContent = `Hiển thị ${filtered.length} / tổng số ${allFeedbacks.length} cấu hình`;

      if (filtered.length === 0) {
        feedbacksContainer.innerHTML = `
          <div style="text-align: center; padding: 40px; color: var(--text-muted); grid-column: 1 / -1; background: var(--bg-card); border-radius: 12px; border: 1.5px dashed var(--border-color);">
            <div style="font-size: 32px; margin-bottom: 8px;">🖼️</div>
            Chưa có cấu hình thông báo nào cho mục này. Hãy bấm <strong>"Thêm Cấu Hình Mới"</strong> ở trên!
          </div>
        `;
        return;
      }

      feedbacksContainer.innerHTML = filtered.map(f => {
        const meta = EVENT_META[f.event_type] || { name: f.event_type, icon: '📢', hasScore: false };
        let scoreBadge = '';
        if (f.has_score && (f.min_score !== null || f.max_score !== null)) {
          const min = (f.min_score !== null) ? f.min_score : 0;
          const max = (f.max_score !== null) ? f.max_score : 100;
          scoreBadge = `<span class="badge-status badge-ongoing" style="font-size: 11px;">🎯 ${min} - ${max} điểm</span>`;
        } else {
          scoreBadge = `<span class="badge-status badge-completed" style="font-size: 11px;">Mặc định</span>`;
        }

        const activeBadge = f.is_active
          ? `<span class="badge-status badge-ongoing" style="font-size: 10px;">● Đang bật</span>`
          : `<span class="badge-status badge-paused" style="font-size: 10px;">○ Đang tắt</span>`;

        return `
          <div class="feedback-card" data-id="${f.id}">
            <div class="feedback-img-wrapper">
              <img src="${f.image_url}" alt="Preview" onerror="this.src='https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=600'">
              <div style="position: absolute; top: 8px; left: 8px;">
                <span class="badge-status badge-ongoing" style="background: rgba(0,0,0,0.65); color: #fff; font-size: 11px; backdrop-filter: blur(4px);">
                  ${meta.icon} ${meta.name}
                </span>
              </div>
              <div style="position: absolute; top: 8px; right: 8px;">
                ${activeBadge}
              </div>
            </div>

            <div class="feedback-body">
              <div class="feedback-meta">
                ${scoreBadge}
                <span style="font-size: 11px; color: var(--text-muted);">Ưu tiên: #${f.sort_order || 1}</span>
              </div>

              ${f.title ? `<div class="feedback-title">${f.title}</div>` : ''}
              <div class="feedback-msg">${f.message}</div>

              <div class="feedback-actions">
                <button type="button" class="btn btn-outline btn-sm btn-preview-fb" data-id="${f.id}" style="padding: 4px 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                  👁️ Xem thử popup
                </button>
                <div style="display: flex; gap: 6px;">
                  <button type="button" class="btn btn-outline btn-sm btn-edit-fb" data-id="${f.id}" style="padding: 4px 8px; font-size: 12px;" title="Chỉnh sửa">
                    ✏️ Sửa
                  </button>
                  <button type="button" class="btn btn-outline btn-sm btn-delete-fb" data-id="${f.id}" style="padding: 4px 8px; font-size: 12px; color: var(--danger); border-color: #fca5a5;" title="Xóa">
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Gắn sự kiện nút Xem thử
      document.querySelectorAll('.btn-preview-fb').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          openPreviewModal(id);
        });
      });

      // Gắn sự kiện nút Sửa
      document.querySelectorAll('.btn-edit-fb').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          openEditModal(id);
        });
      });

      // Gắn sự kiện nút Xóa
      document.querySelectorAll('.btn-delete-fb').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const fb = allFeedbacks.find(x => x.id === id);
          if (confirm(`Bạn có chắc chắn muốn xóa cấu hình thông báo này không?`)) {
            try {
              await window.Admin.deleteFeedback(id);
              showAlert('Đã xóa cấu hình thông báo thành công!', 'success');
              await loadFeedbacksList();
            } catch (err) {
              showAlert(err.message || 'Lỗi khi xóa cấu hình', 'danger');
            }
          }
        });
      });

    } catch (err) {
      console.error('Lỗi tải feedback:', err);
      feedbacksContainer.innerHTML = `<div style="text-align: center; color: red; grid-column: 1 / -1; padding: 30px;">Lỗi tải cấu hình: ${err.message}</div>`;
    }
  }

  // Bộ lọc Tabs theo sự kiện
  eventFilterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      eventFilterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentEventFilter = tab.getAttribute('data-event');
      loadFeedbacksList();
    });
  });

  // ===========================================================================
  // 2. MỞ MODAL THÊM CẤU HÌNH MỚI
  // ===========================================================================
  btnOpenCreateFeedback.addEventListener('click', () => {
    feedbackModalAlert.className = 'alert';
    feedbackModalAlert.textContent = '';
    formFeedbackEditor.reset();
    pendingUploadFile = null;

    inputId.value = '';
    modalFeedbackTitle.textContent = 'Thêm Cấu Hình Thông Báo Mới';
    btnSubmitFeedback.textContent = 'Lưu cấu hình';

    if (currentEventFilter !== 'all') {
      selectEvent.value = currentEventFilter;
    } else {
      selectEvent.value = 'quiz';
    }

    updateScoreRangeVisibility();
    resetImagePreview();

    fileChosenName.textContent = 'Chưa chọn file';
    inputBtnText.value = 'Tiếp tục';
    inputSortOrder.value = '1';
    checkIsActive.checked = true;

    modalFeedbackEditor.classList.add('active');
  });

  // ===========================================================================
  // 3. MỞ MODAL CHỈNH SỬA CẤU HÌNH
  // ===========================================================================
  function openEditModal(id) {
    const fb = allFeedbacks.find(x => x.id === id);
    if (!fb) return;

    feedbackModalAlert.className = 'alert';
    feedbackModalAlert.textContent = '';
    formFeedbackEditor.reset();
    pendingUploadFile = null;

    inputId.value = fb.id;
    modalFeedbackTitle.textContent = 'Chỉnh Sửa Cấu Hình Thông Báo';
    btnSubmitFeedback.textContent = 'Lưu thay đổi';

    selectEvent.value = fb.event_type;
    updateScoreRangeVisibility();

    if (fb.has_score) {
      inputMinScore.value = (fb.min_score !== null) ? fb.min_score : 0;
      inputMaxScore.value = (fb.max_score !== null) ? fb.max_score : 100;
    }

    inputImageUrl.value = fb.image_url || '';
    setImagePreviewUrl(fb.image_url);

    fileChosenName.textContent = 'Đã có ảnh hiện tại';
    inputTitle.value = fb.title || '';
    inputMessage.value = fb.message || '';
    inputBtnText.value = fb.btn_text || 'Tiếp tục';
    inputSortOrder.value = fb.sort_order || 1;
    checkIsActive.checked = (fb.is_active !== false);

    modalFeedbackEditor.classList.add('active');
  }

  document.querySelectorAll('[data-close="modal-feedback-editor"]').forEach(b => {
    b.addEventListener('click', () => modalFeedbackEditor.classList.remove('active'));
  });

  // Chuyển đổi hiển thị nhóm điểm số theo loại sự kiện
  function updateScoreRangeVisibility() {
    const meta = EVENT_META[selectEvent.value];
    if (meta && meta.hasScore) {
      scoreRangeGroup.style.display = 'grid';
      if (!inputMinScore.value && !inputMaxScore.value) {
        inputMinScore.value = '80';
        inputMaxScore.value = '100';
      }
    } else {
      scoreRangeGroup.style.display = 'none';
      inputMinScore.value = '';
      inputMaxScore.value = '';
    }
  }

  selectEvent.addEventListener('change', updateScoreRangeVisibility);

  // ===========================================================================
  // 4. XỬ LÝ CHỌN ẢNH VÀ XEM TRƯỚC TỨC THÌ
  // ===========================================================================
  btnBrowseImg.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Kiểm tra định dạng
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      alert('Định dạng file không hợp lệ! Vui lòng chỉ chọn file ảnh JPG, PNG, WEBP hoặc GIF.');
      fileInput.value = '';
      return;
    }

    // Kiểm tra dung lượng 2MB
    if (file.size > 2 * 1024 * 1024) {
      alert(`Dung lượng ảnh vượt quá 2MB (kích thước: ${(file.size / (1024 * 1024)).toFixed(1)}MB)! Vui lòng nén nhỏ lại.`);
      fileInput.value = '';
      return;
    }

    pendingUploadFile = file;
    fileChosenName.textContent = file.name;

    // Hiển thị xem trước ảnh ngay lập tức bằng FileReader
    const reader = new FileReader();
    reader.onload = function (evt) {
      setImagePreviewUrl(evt.target.result);
      // Ghi chú tạm vào ô URL
      inputImageUrl.value = `[File cục bộ]: ${file.name}`;
    };
    reader.readAsDataURL(file);
  });

  inputImageUrl.addEventListener('input', () => {
    const val = inputImageUrl.value.trim();
    if (val && !val.startsWith('[File cục bộ]')) {
      pendingUploadFile = null;
      fileChosenName.textContent = 'Chưa chọn file (Dùng link)';
      setImagePreviewUrl(val);
    }
  });

  function setImagePreviewUrl(url) {
    if (url) {
      imgPreviewTag.src = url;
      imgPreviewTag.style.display = 'block';
      imgPreviewPlaceholder.style.display = 'none';
    } else {
      resetImagePreview();
    }
  }

  function resetImagePreview() {
    imgPreviewTag.src = '';
    imgPreviewTag.style.display = 'none';
    imgPreviewPlaceholder.style.display = 'block';
  }

  // ===========================================================================
  // 5. LƯU CẤU HÌNH FEEDBACK (SUBMIT FORM)
  // ===========================================================================
  formFeedbackEditor.addEventListener('submit', async function (e) {
    e.preventDefault();

    const id = inputId.value;
    const eventType = selectEvent.value;
    const meta = EVENT_META[eventType] || { hasScore: false };
    const hasScore = meta.hasScore;

    let minScore = null;
    let maxScore = null;

    if (hasScore) {
      const minVal = inputMinScore.value.trim();
      const maxVal = inputMaxScore.value.trim();

      if (minVal === '' || maxVal === '') {
        feedbackModalAlert.className = 'alert alert-danger show';
        feedbackModalAlert.textContent = 'Vui lòng nhập cả điểm tối thiểu và tối đa cho sự kiện có tính điểm!';
        return;
      }

      minScore = parseInt(minVal, 10);
      maxScore = parseInt(maxVal, 10);

      if (minScore > maxScore) {
        feedbackModalAlert.className = 'alert alert-danger show';
        feedbackModalAlert.textContent = 'Điểm tối thiểu không được lớn hơn điểm tối đa!';
        return;
      }
    }

    const title = inputTitle.value.trim();
    const message = inputMessage.value.trim();
    const btnText = inputBtnText.value.trim() || 'Tiếp tục';
    const sortOrder = parseInt(inputSortOrder.value, 10) || 1;
    const isActive = checkIsActive.checked;

    try {
      btnSubmitFeedback.disabled = true;
      btnSubmitFeedback.textContent = 'Đang xử lý...';
      feedbackModalAlert.className = 'alert';
      feedbackModalAlert.textContent = '';

      let finalImageUrl = inputImageUrl.value.trim();

      // Nếu người dùng chọn file ảnh từ máy tính -> Tải lên Storage bucket 'feedback-images'
      if (pendingUploadFile) {
        btnSubmitFeedback.textContent = 'Đang tải ảnh lên Storage...';
        finalImageUrl = await window.Admin.uploadFeedbackImage(pendingUploadFile);
      } else if (!finalImageUrl || finalImageUrl.startsWith('[File cục bộ]')) {
        throw new Error('Vui lòng chọn file ảnh hoặc nhập đường dẫn ảnh hợp lệ!');
      }

      btnSubmitFeedback.textContent = 'Đang lưu vào database...';

      if (id) {
        // Cập nhật
        await window.Admin.updateFeedback(id, {
          eventType,
          hasScore,
          minScore,
          maxScore,
          title,
          message,
          imageUrl: finalImageUrl,
          btnText,
          isActive,
          sortOrder
        });
        showAlert('Đã cập nhật cấu hình thông báo thành công!', 'success');
      } else {
        // Thêm mới
        await window.Admin.createFeedback({
          eventType,
          hasScore,
          minScore,
          maxScore,
          title,
          message,
          imageUrl: finalImageUrl,
          btnText,
          isActive,
          sortOrder
        });
        showAlert('Đã tạo cấu hình thông báo mới thành công!', 'success');
      }

      modalFeedbackEditor.classList.remove('active');
      await loadFeedbacksList();

    } catch (err) {
      console.error('Lỗi lưu feedback:', err);
      feedbackModalAlert.className = 'alert alert-danger show';
      feedbackModalAlert.textContent = err.message || 'Lỗi khi lưu cấu hình';
    } finally {
      btnSubmitFeedback.disabled = false;
      btnSubmitFeedback.textContent = id ? 'Lưu thay đổi' : 'Lưu cấu hình';
    }
  });

  // ===========================================================================
  // 6. XEM THỬ POPUP KẾT QUẢ THỰC TẾ (LIVE PREVIEW)
  // ===========================================================================
  function openPreviewModal(id) {
    const fb = allFeedbacks.find(x => x.id === id);
    if (!fb) return;

    previewPopupImg.src = fb.image_url;
    previewPopupTitle.textContent = fb.title || 'Thông báo kết quả';
    previewPopupMsg.textContent = fb.message;
    previewPopupBtn.textContent = fb.btn_text || 'Tiếp tục';

    if (fb.has_score && (fb.min_score !== null || fb.max_score !== null)) {
      const displayScore = (fb.max_score !== null) ? fb.max_score : 100;
      previewPopupBadgeBox.style.display = 'block';
      previewPopupBadge.textContent = `🎯 Đạt ${displayScore}/100 điểm (${fb.min_score || 0} - ${fb.max_score || 100})`;
    } else {
      previewPopupBadgeBox.style.display = 'none';
    }

    modalPreviewFeedback.classList.add('active');
  }

  document.querySelectorAll('[data-close="modal-preview-feedback"]').forEach(b => {
    b.addEventListener('click', () => modalPreviewFeedback.classList.remove('active'));
  });

  // ===========================================================================
  // 7. QUẢN LÝ NGƯỜI DÙNG & ĐẶT LẠI MẬT KHẨU (TAB 2)
  // ===========================================================================
  const settingsNavTabs = document.querySelectorAll('.settings-nav-tab');
  const tabFeedbackSettings = document.getElementById('tab-feedback-settings');
  const tabUsersManagement = document.getElementById('tab-users-management');
  const userSearchInput = document.getElementById('user-search-input');
  const userRoleFilter = document.getElementById('user-role-filter');
  const btnRefreshUsers = document.getElementById('btn-refresh-users');
  const allUsersTableBody = document.getElementById('all-users-table-body');
  const usersCountText = document.getElementById('users-count-text');

  let allProfilesCache = [];

  // Chuyển đổi tab chính của trang Cài đặt
  settingsNavTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      settingsNavTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (targetTab === 'tab-feedback-settings') {
        tabFeedbackSettings.style.display = 'block';
        tabUsersManagement.style.display = 'none';
        if (btnOpenCreateFeedback) btnOpenCreateFeedback.style.display = 'inline-flex';
      } else if (targetTab === 'tab-users-management') {
        tabFeedbackSettings.style.display = 'none';
        tabUsersManagement.style.display = 'block';
        if (btnOpenCreateFeedback) btnOpenCreateFeedback.style.display = 'none';
        loadAllUsersList();
      }
    });
  });

  async function loadAllUsersList() {
    if (!allUsersTableBody) return;
    try {
      allUsersTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Đang tải danh sách người dùng...
          </td>
        </tr>
      `;
      allProfilesCache = await window.Admin.getAllProfiles();
      renderUsersTable();
    } catch (err) {
      console.error('Lỗi tải người dùng:', err);
      allUsersTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 32px; color: var(--danger);">
            Lỗi khi tải danh sách người dùng: ${err.message || err}
          </td>
        </tr>
      `;
    }
  }

  function renderUsersTable() {
    if (!allUsersTableBody) return;
    const search = (userSearchInput ? userSearchInput.value : '').trim().toLowerCase();
    const roleFilter = userRoleFilter ? userRoleFilter.value : 'all';

    let filtered = allProfilesCache || [];
    if (roleFilter !== 'all') {
      filtered = filtered.filter(u => u.role === roleFilter);
    }
    if (search) {
      filtered = filtered.filter(u =>
        (u.username && u.username.toLowerCase().includes(search)) ||
        (u.display_name && u.display_name.toLowerCase().includes(search)) ||
        (u.phone && u.phone.toLowerCase().includes(search))
      );
    }

    if (usersCountText) {
      usersCountText.textContent = `Hiển thị ${filtered.length} / tổng số ${(allProfilesCache || []).length} tài khoản`;
    }

    if (filtered.length === 0) {
      allUsersTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Không tìm thấy người dùng nào phù hợp.
          </td>
        </tr>
      `;
      return;
    }

    allUsersTableBody.innerHTML = filtered.map(u => {
      let roleBadge = '';
      if (u.role === 'admin') {
        roleBadge = '<span class="user-role-badge role-admin">🛡️ Quản trị viên</span>';
      } else if (u.role === 'teacher') {
        roleBadge = '<span class="user-role-badge role-teacher">👨‍🏫 Giáo viên</span>';
      } else {
        roleBadge = '<span class="user-role-badge role-student">🎓 Học sinh</span>';
      }

      const createdDate = u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '--';

      return `
        <tr>
          <td>
            <div style="font-weight: 600; color: var(--text-main);">${u.display_name || u.username}</div>
            <div style="font-size: 12px; color: var(--text-muted);">🔥 Streak: ${u.current_streak || 0} ngày · ${(u.lifetime_xp || 0).toLocaleString()} XP</div>
          </td>
          <td><code>${u.username}</code></td>
          <td>${roleBadge}</td>
          <td>${u.phone || '<span style="color: var(--text-light);">Chưa có</span>'}</td>
          <td>${createdDate}</td>
          <td style="text-align: right;">
            <button
              type="button"
              class="btn btn-outline btn-sm btn-reset-password"
              data-user-id="${u.id}"
              data-username="${u.username}"
              data-name="${u.display_name || u.username}"
              style="color: var(--primary); border-color: var(--primary); font-weight: 600;"
            >
              🔑 Đặt lại mật khẩu
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Gắn sự kiện nút Đặt lại mật khẩu
    allUsersTableBody.querySelectorAll('.btn-reset-password').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-user-id');
        const uname = btn.getAttribute('data-username');
        const dname = btn.getAttribute('data-name');
        window.Admin.openResetPasswordModal({
          id: uid,
          username: uname,
          displayName: dname
        });
      });
    });
  }

  if (userSearchInput) userSearchInput.addEventListener('input', renderUsersTable);
  if (userRoleFilter) userRoleFilter.addEventListener('change', renderUsersTable);
  if (btnRefreshUsers) btnRefreshUsers.addEventListener('click', loadAllUsersList);

  // Khởi tạo modal đặt lại mật khẩu
  if (window.Admin && typeof window.Admin.initResetPasswordModal === 'function') {
    window.Admin.initResetPasswordModal();
  }

  // Khởi chạy
  await loadFeedbacksList();
});
