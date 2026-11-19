/**
 * LOGIC LỘ TRÌNH GIÁO TRÌNH (curriculum.html)
 */

document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth();
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);

  const currClassBadge = document.getElementById('curr-class-badge');
  const currTitle = document.getElementById('curr-title');
  const currDesc = document.getElementById('curr-desc');
  const currProgressNum = document.getElementById('curr-progress-num');
  const currProgressBar = document.getElementById('curr-progress-bar');
  const roadmapContainer = document.getElementById('roadmap-container');
  const pageAlert = document.getElementById('page-alert');

  function showAlert(msg, type = 'danger') {
    pageAlert.className = `alert alert-${type} show`;
    pageAlert.textContent = msg;
  }

  try {
    const activeClass = await window.Student.getActiveClass();

    if (!activeClass || !activeClass.curriculum) {
      roadmapContainer.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px;">
          <div style="font-size: 40px; margin-bottom: 12px;">⏳</div>
          <h3 style="margin-bottom: 8px;">Bạn chưa tham gia lớp học nào</h3>
          <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 16px;">
            Vui lòng liên hệ với giáo viên để được xếp vào lớp và mở giáo trình học tập.
          </p>
          <a href="dashboard.html" class="btn btn-primary">Quay về trang chủ</a>
        </div>
      `;
      return;
    }

    const curr = activeClass.curriculum;
    currClassBadge.textContent = `Lớp: ${activeClass.name}`;
    currTitle.textContent = `${curr.title} (${curr.level})`;
    currDesc.textContent = curr.description || 'Lộ trình bài học bài bản, chuẩn hóa kiến thức thi HSK.';

    // Tải danh sách bài học và trạng thái mở khóa
    const roadmap = await window.Student.getCurriculumRoadmap(
      activeClass.id,
      curr.id,
      activeClass.unlock_mode,
      activeClass.current_lesson_order
    );

    if (!roadmap || roadmap.length === 0) {
      roadmapContainer.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px; color: var(--text-muted);">
          Giáo trình này hiện chưa có bài học nào.
        </div>
      `;
      return;
    }

    // Tính tiến độ tổng
    const total = roadmap.length;
    const completed = roadmap.filter(l => l.isCompleted).length;
    const percent = Math.round((completed / total) * 100);

    currProgressNum.textContent = `${percent}% (${completed}/${total} bài)`;
    currProgressBar.style.width = `${percent}%`;

    // Render từng bài học theo dạng lộ trình hành trình
    roadmapContainer.innerHTML = roadmap.map(lesson => {
      let nodeClass = '';
      let badgeIcon = lesson.order_index;
      let statusHtml = '';
      let actionBtn = '';

      if (lesson.isCompleted) {
        nodeClass = 'completed';
        badgeIcon = '✓';
        statusHtml = '<span style="color: var(--success); font-weight: 600; font-size: 13px;">⭐ Đã hoàn thành</span>';
        actionBtn = `<span class="btn btn-outline btn-sm">Ôn tập lại</span>`;
      } else if (lesson.isCurrent) {
        nodeClass = 'current';
        badgeIcon = lesson.order_index;
        statusHtml = '<span style="color: #d97706; font-weight: 700; font-size: 13px;">🟡 Bài hiện tại của lớp</span>';
        actionBtn = `<span class="btn btn-primary btn-sm">🚀 Vào học ngay</span>`;
      } else if (lesson.isUnlocked) {
        nodeClass = '';
        badgeIcon = lesson.order_index;
        statusHtml = '<span style="color: var(--primary); font-size: 13px;">Đã mở khóa</span>';
        actionBtn = `<span class="btn btn-secondary btn-sm">Bắt đầu học</span>`;
      } else {
        nodeClass = 'locked';
        badgeIcon = '🔒';
        statusHtml = '<span style="color: var(--text-light); font-size: 13px;">Chưa mở khóa</span>';
        actionBtn = `<span style="font-size: 12px; color: var(--text-light);">Hoàn thành bài trước để mở</span>`;
      }

      const href = lesson.isUnlocked ? `lesson.html?id=${lesson.id}&class_id=${activeClass.id}` : 'javascript:void(0)';

      return `
        <a href="${href}" class="roadmap-item ${nodeClass}">
          <div class="roadmap-node-badge">${badgeIcon}</div>
          <div class="roadmap-content">
            <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">
              <span class="roadmap-title-zh">Bài ${lesson.order_index}: ${lesson.title_zh}</span>
              <span style="font-size: 12px; color: #ca8a04; font-weight: 600;">+${lesson.reward_xp || 50} XP</span>
            </div>
            <div class="roadmap-title-vi">${lesson.title_vi || ''}</div>
            <div style="margin-top: 6px; display: flex; justify-content: space-between; align-items: center;">
              <div>${statusHtml}</div>
              <div>${actionBtn}</div>
            </div>
          </div>
        </a>
      `;
    }).join('');

  } catch (err) {
    console.error('Lỗi tải lộ trình:', err);
    showAlert('Không thể tải lộ trình: ' + (err.message || err));
  }
});
