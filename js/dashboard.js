/**
 * LOGIC DASHBOARD HỌC SINH (dashboard.html)
 */

document.addEventListener('DOMContentLoaded', async function () {
  // 1. Kiểm tra xác thực
  const authData = await window.Auth.requireAuth();
  if (!authData) return;

  const profile = authData.profile;
  window.Auth.renderNavbarUserInfo(profile);

  // Nếu là admin hoặc teacher, có thể vào bảng quản trị hoặc xem dashboard
  const unassignedBox = document.getElementById('unassigned-class-box');
  const assignedBox = document.getElementById('assigned-class-box');
  const myUsername = document.getElementById('my-username');

  // Dashboard stats
  const dashClassName = document.getElementById('dash-class-name');
  const dashCourseTitle = document.getElementById('dash-course-title');
  const dashClassCurrentLesson = document.getElementById('dash-class-current-lesson');
  const dashProgressText = document.getElementById('dash-progress-text');
  const dashProgressPercent = document.getElementById('dash-progress-percent');
  const dashProgressFill = document.getElementById('dash-progress-fill');

  const dashStreak = document.getElementById('dash-streak');
  const dashRank = document.getElementById('dash-rank');
  const dashXp = document.getElementById('dash-xp');

  const dashNextTitle = document.getElementById('dash-next-title');
  const dashNextDesc = document.getElementById('dash-next-desc');
  const dashNextWordCount = document.getElementById('dash-next-word-count');
  const btnStartVocab = document.getElementById('btn-start-vocab');
  const btnStartFlashcard = document.getElementById('btn-start-flashcard');

  // Render thông tin cá nhân
  if (profile) {
    if (myUsername) myUsername.textContent = profile.username;
    if (dashStreak) dashStreak.textContent = `🔥 ${profile.current_streak || 0} ngày`;
    if (dashXp) dashXp.textContent = `⚡ ${(profile.lifetime_xp || 0).toLocaleString()} XP`;

    // Tự động kiểm tra và cập nhật streak hôm nay
    window.Student.updateDailyStreak().then(st => {
      if (st && st.current_streak && dashStreak) {
        dashStreak.textContent = `🔥 ${st.current_streak} ngày`;
      }
    });
  }

  // 2. Lấy lớp học active của học sinh
  try {
    const activeClass = await window.Student.getActiveClass();

    if (!activeClass) {
      // Học sinh chưa được gán vào lớp nào
      unassignedBox.style.display = 'block';
      assignedBox.style.display = 'none';
      return;
    }

    // Học sinh đã vào lớp thành công
    unassignedBox.style.display = 'none';
    assignedBox.style.display = 'block';

    dashClassName.textContent = activeClass.name;
    const curriculum = activeClass.curriculum;
    dashCourseTitle.textContent = curriculum ? `${curriculum.title} (${activeClass.level})` : 'Giáo trình lớp';
    dashClassCurrentLesson.textContent = `Bài ${activeClass.current_lesson_order || 1}`;

    // 3. Tải lộ trình để tính tiến độ cá nhân & bài học tiếp theo
    if (curriculum) {
      const roadmap = await window.Student.getCurriculumRoadmap(
        activeClass.id,
        curriculum.id,
        activeClass.unlock_mode,
        activeClass.current_lesson_order
      );

      const totalLessons = roadmap.length;
      const completedCount = roadmap.filter(l => l.isCompleted).length;
      const percent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

      dashProgressText.textContent = `${completedCount} / ${totalLessons} bài hoàn thành`;
      dashProgressPercent.textContent = `${percent}%`;
      dashProgressFill.style.width = `${percent}%`;

      // Xác định bài học tiếp theo cần học:
      // Tìm bài đầu tiên chưa hoàn thành và đã mở khóa, hoặc lấy bài theo tiến độ lớp
      let targetLesson = roadmap.find(l => !l.isCompleted && l.isUnlocked);
      if (!targetLesson) {
        targetLesson = roadmap.find(l => l.order_index === activeClass.current_lesson_order) || roadmap[0];
      }

      if (targetLesson) {
        dashNextTitle.textContent = `Bài ${targetLesson.order_index}: ${targetLesson.title_zh}`;
        dashNextDesc.textContent = targetLesson.title_vi || 'Bài học tiếng Trung';

        // Lấy số lượng từ vựng của bài học này
        try {
          const words = await window.Student.getLessonWords(targetLesson.id);
          dashNextWordCount.textContent = `${words.length} từ`;
        } catch (e) {
          dashNextWordCount.textContent = '-- từ';
        }

        btnStartVocab.href = `lesson.html?id=${targetLesson.id}&class_id=${activeClass.id}&mode=vocab`;
        btnStartFlashcard.href = `lesson.html?id=${targetLesson.id}&class_id=${activeClass.id}&mode=flashcard`;
      }
    }

    // 4. Tải danh sách bài tập được giao cho lớp
    const assignmentsContainer = document.getElementById('assignments-list-container');
    try {
      const assignments = await window.Student.getClassAssignments(activeClass.id);

      if (!assignments || assignments.length === 0) {
        assignmentsContainer.innerHTML = `
          <div style="text-align: center; padding: 24px; color: var(--text-muted); background: #f8fafc; border-radius: var(--radius-sm);">
            🎉 Hiện tại lớp chưa có bài tập nào cần làm. Bạn có thể tự do học tiếp giáo trình!
          </div>
        `;
      } else {
        assignmentsContainer.innerHTML = assignments.map(a => {
          let statusBadge = '';
          let actionBtn = '';

          if (a.userStatus === 'completed') {
            statusBadge = '<span class="badge-status badge-ongoing" style="background: #dcfce7; color: #15803d;">🟢 Đã nộp đúng hạn</span>';
            actionBtn = `<span style="font-size: 13px; color: #15803d; font-weight: 600;">+${a.reward_xp} XP</span>`;
          } else if (a.userStatus === 'late') {
            statusBadge = '<span class="badge-status badge-paused">🟡 Đã nộp muộn</span>';
            actionBtn = `<span style="font-size: 13px; color: var(--text-muted);">Đã nộp</span>`;
          } else if (a.isPastDue) {
            statusBadge = '<span class="badge-status badge-completed" style="background: #fee2e2; color: #b91c1c;">🔴 Quá hạn</span>';
            actionBtn = a.lesson_id ? `
              <a href="lesson.html?id=${a.lesson_id}&class_id=${activeClass.id}" class="btn btn-outline btn-sm">
                Làm bù bài tập
              </a>
            ` : `
              <button type="button" class="btn btn-outline btn-sm btn-submit-task" data-id="${a.id}">
                Nộp bài muộn
              </button>
            `;
          } else {
            statusBadge = '<span class="badge-status badge-paused">🟡 Chưa hoàn thành</span>';
            actionBtn = a.lesson_id ? `
              <a href="lesson.html?id=${a.lesson_id}&class_id=${activeClass.id}" class="btn btn-primary btn-sm">
                Làm bài ngay 🚀
              </a>
            ` : `
              <button type="button" class="btn btn-primary btn-sm btn-submit-task" data-id="${a.id}">
                Xác nhận hoàn thành
              </button>
            `;
          }

          const dueFormatted = new Date(a.due_date).toLocaleString('vi-VN', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
          });

          return `
            <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
              <div>
                <div style="font-weight: 700; font-size: 15px; color: var(--text-main); margin-bottom: 2px;">
                  ${a.title}
                </div>
                <div style="font-size: 13px; color: var(--text-muted); display: flex; gap: 12px; flex-wrap: wrap;">
                  <span>⏰ Hạn chót: <strong>${dueFormatted}</strong></span>
                  <span>⚡ Thưởng: <strong>+${a.reward_xp || 30} XP</strong></span>
                  ${a.lesson ? `<span>📖 Bài ${a.lesson.order_index}: ${a.lesson.title_zh}</span>` : ''}
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                ${statusBadge}
                ${actionBtn}
              </div>
            </div>
          `;
        }).join('');

        // Gắn sự kiện nút nộp bài trực tiếp (cho bài tập tự do)
        document.querySelectorAll('.btn-submit-task').forEach(btn => {
          btn.addEventListener('click', async () => {
            const taskId = btn.getAttribute('data-id');
            try {
              btn.disabled = true;
              btn.textContent = 'Đang nộp...';
              await window.Student.completeAssignment(taskId);
              alert('🎉 Chúc mừng bạn đã hoàn thành bài tập!');
              location.reload();
            } catch (err) {
              alert('Lỗi: ' + (err.message || err));
              btn.disabled = false;
              btn.textContent = 'Thử lại';
            }
          });
        });
      }
    } catch (err) {
      console.warn('Lỗi tải bài tập:', err);
      assignmentsContainer.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 16px;">Không thể tải bài tập lớp.</div>`;
    }

    // 5. Lấy thứ hạng thật của học sinh trong lớp (Tuần này)
    try {
      const leaderboard = await window.Student.getClassLeaderboard(activeClass.id, 'week');
      if (leaderboard && leaderboard.length > 0) {
        const myRank = leaderboard.find(s => s.student_id === authData.user.id);
        if (myRank && dashRank) {
          dashRank.textContent = `Hạng ${myRank.rank} / ${leaderboard.length}`;
        }
      }
    } catch (e) {
      console.warn('Lỗi lấy thứ hạng lớp:', e);
    }

  } catch (err) {
    console.error('Lỗi tải dữ liệu Dashboard:', err);
  }

  // 6. Xử lý Modal Xem Lịch Sử Khóa Học Cũ
  const modalCourseHistory = document.getElementById('modal-course-history');
  const btnOpenHistoryModal = document.getElementById('btn-open-history-modal');
  const historyListContainer = document.getElementById('history-list-container');

  if (btnOpenHistoryModal) {
    btnOpenHistoryModal.addEventListener('click', async () => {
      modalCourseHistory.classList.add('active');
      historyListContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Đang tải lịch sử khóa học...</div>';

      try {
        const historyList = await window.Student.getEnrollmentHistory();

        if (!historyList || historyList.length === 0) {
          historyListContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Chưa có lịch sử khóa học cũ.</div>';
          return;
        }

        historyListContainer.innerHTML = historyList.map(h => {
          const isOngoing = (h.status === 'active');
          const badge = isOngoing
            ? '<span class="badge-status badge-ongoing">Đang theo học</span>'
            : '<span class="badge-status badge-completed">Đã hoàn thành</span>';

          const joinedFormatted = h.joined_at ? new Date(h.joined_at).toLocaleDateString('vi-VN') : '--';
          const completedFormatted = h.completed_at ? new Date(h.completed_at).toLocaleDateString('vi-VN') : 'Hiện tại';

          return `
            <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px 14px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                <div style="font-weight: 700; color: var(--text-main); font-size: 15px;">
                  ${h.class_name} (${h.class_level})
                </div>
                ${badge}
              </div>
              <div style="font-size: 13px; color: var(--primary); font-weight: 600; margin-top: 2px;">
                📖 ${h.curriculum_title}
              </div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                Thời gian: ${joinedFormatted} - ${completedFormatted}
              </div>
              ${h.note ? `<div style="font-size: 12px; color: #475569; margin-top: 4px; font-style: italic;">Ghi chú: ${h.note}</div>` : ''}
            </div>
          `;
        }).join('');

      } catch (err) {
        historyListContainer.innerHTML = '<div style="color: red; text-align: center;">Lỗi tải lịch sử khóa học</div>';
      }
    });

    document.querySelectorAll('[data-close="modal-course-history"]').forEach(btn => {
      btn.addEventListener('click', () => modalCourseHistory.classList.remove('active'));
    });
  }
});
