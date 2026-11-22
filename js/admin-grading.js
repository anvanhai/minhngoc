/**
 * MINH NGỌC HSK - QUẢN TRỊ VIÊN: CHẤM BÀI NÓI & GHI ÂM
 */

document.addEventListener('DOMContentLoaded', async function () {
  const pageAlert = document.getElementById('page-alert');
  const filterClass = document.getElementById('filter-class');
  const filterStatus = document.getElementById('filter-status');
  const btnRefreshGrading = document.getElementById('btn-refresh-grading');
  const gradingListContainer = document.getElementById('grading-list-container');
  const badgePendingCount = document.getElementById('badge-pending-count');

  function showAlert(msg, type = 'danger') {
    if (!pageAlert) return;
    pageAlert.className = `alert alert-${type} show`;
    pageAlert.textContent = msg;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 1. Kiểm tra xác thực quyền Admin / Giáo viên
  const authData = await window.Auth.requireRole(['admin', 'teacher']);
  if (!authData) return;

  // Cập nhật tên hiển thị
  const displayNameEl = document.querySelector('.user-display-name');
  if (displayNameEl) {
    displayNameEl.textContent = authData.profile ? (authData.profile.full_name || authData.user.email) : 'Giáo viên';
  }

  // 2. Nạp danh sách lớp học vào dropdown bộ lọc
  try {
    const classes = await window.Admin.getClasses();
    filterClass.innerHTML = '<option value="">-- Tất cả các lớp học --</option>' +
      (classes || []).map(c => `<option value="${c.id}">${c.name} (${c.level})</option>`).join('');
  } catch (err) {
    console.warn('Lỗi nạp lớp học:', err);
  }

  // 3. Tải và hiển thị danh sách bài ghi âm
  async function loadRecordings() {
    gradingListContainer.innerHTML = `
      <div style="text-align: center; padding: 48px; color: var(--text-muted);">
        Đang tải danh sách bài tập ghi âm...
      </div>
    `;

    try {
      const classId = filterClass.value || null;
      const status = filterStatus.value || 'submitted';

      const list = await window.Admin.getRecordingsForGrading({ classId, status });

      // Đếm số lượng chờ chấm
      const pendingCount = (list || []).filter(r => r.status === 'submitted').length;
      if (badgePendingCount) {
        badgePendingCount.textContent = pendingCount;
      }

      if (!list || list.length === 0) {
        gradingListContainer.innerHTML = `
          <div class="card" style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
            <div style="font-size: 36px; margin-bottom: 12px;">🎉</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">
              Không có bài ghi âm nào theo bộ lọc hiện tại!
            </div>
            <div style="font-size: 13px;">
              ${status === 'submitted' ? 'Toàn bộ bài tập ghi âm đã được chấm xong.' : 'Hãy chọn bộ lọc khác để xem lại các bài đã nộp.'}
            </div>
          </div>
        `;
        return;
      }

      gradingListContainer.innerHTML = list.map(rec => {
        const student = rec.student || { full_name: 'Học sinh', email: '' };
        const className = rec.class ? rec.class.name : 'Lớp học';
        const assignTitle = rec.assignment ? rec.assignment.title : 'Bài tập ghi âm';
        const rewardXp = rec.assignment ? (rec.assignment.reward_xp || 30) : 30;
        const submittedDate = new Date(rec.created_at).toLocaleString('vi-VN', {
          hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
        });

        const isGraded = (rec.status === 'graded');
        const currentScore = (rec.score !== null && rec.score !== undefined) ? rec.score : '';
        const currentComment = rec.teacher_comment || '';

        return `
          <div class="grading-card" id="rec-card-${rec.id}" style="${isGraded ? 'opacity: 0.9;' : 'border-left: 4px solid var(--primary);'}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <strong style="font-size: 16px; color: var(--text-main);">${student.full_name}</strong>
                  <span style="font-size: 12px; color: var(--text-muted);">(${student.email})</span>
                  <span class="badge-status ${isGraded ? 'badge-ongoing' : 'badge-paused'}">
                    ${isGraded ? '🟢 Đã chấm' : '🟡 Chờ chấm'}
                  </span>
                </div>
                <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">
                  Lớp: <strong>${className}</strong> · Bài: <strong>${assignTitle}</strong> · Nộp lúc: ${submittedDate}
                </div>
              </div>

              <div style="text-align: right;">
                <span style="font-size: 12px; color: var(--text-muted);">Thưởng tối đa:</span>
                <strong style="color: #ca8a04; font-size: 14px;">+${rewardXp} XP</strong>
              </div>
            </div>

            <!-- Đề bài câu tiếng Trung -->
            <div style="background: var(--bg-subtle); border-radius: var(--radius-sm); padding: 12px 16px; margin-bottom: 14px; border: 1px solid var(--border-color);">
              <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">
                Đề bài luyện đọc tiếng Trung:
              </div>
              <div style="font-size: 18px; font-weight: 800; color: var(--text-main); font-family: 'PingFang SC', sans-serif;">
                ${rec.prompt_text}
              </div>
              ${rec.prompt_pinyin ? `
                <div style="font-size: 14px; color: var(--primary); font-family: sans-serif; margin-top: 2px;">
                  ${rec.prompt_pinyin}
                </div>
              ` : ''}
            </div>

            <!-- Trình phát Audio nghe thử -->
            <div class="audio-player-box">
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: 1;">
                <button type="button" class="btn btn-primary btn-sm btn-play-student-audio" data-id="${rec.id}" data-url="${rec.audio_url}">
                  ▶️ Nghe học sinh đọc
                </button>

                ${rec.sample_audio_url ? `
                  <button type="button" class="btn btn-outline btn-sm btn-play-sample-audio" data-url="${rec.sample_audio_url}">
                    🔊 Nghe audio mẫu
                  </button>
                ` : ''}

                <span id="audio-status-${rec.id}" style="font-size: 12px; color: var(--text-muted); font-style: italic;"></span>
              </div>

              <button type="button" class="btn btn-outline btn-sm btn-delete-recording" data-id="${rec.id}" data-url="${rec.audio_url}" style="color: var(--danger); border-color: var(--danger-border); font-size: 11px; padding: 4px 8px;" title="Xóa file ghi âm này để giải phóng dung lượng Storage">
                🗑️ Xóa bản ghi
              </button>
            </div>

            <!-- Form chấm điểm & nhận xét -->
            <form class="form-grade-recording" data-id="${rec.id}" style="margin-top: 14px; display: grid; grid-template-columns: 140px 1fr auto; gap: 12px; align-items: end;">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" style="font-size: 12px;">Điểm số (0 - 100) *</label>
                <input type="number" min="0" max="100" class="form-control input-score" required value="${currentScore}" placeholder="Ví dụ: 85" style="font-weight: 700; font-size: 15px;">
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" style="font-size: 12px;">Lời nhận xét của cô giáo</label>
                <input type="text" class="form-control input-comment" value="${currentComment}" placeholder="Ví dụ: Phát âm thanh 1 và 4 rất tốt, chú ý uốn lưỡi chữ 'zh'...">
              </div>

              <div>
                <button type="submit" class="btn btn-primary btn-submit-grade" style="height: 42px;">
                  💾 ${isGraded ? 'Cập nhật điểm' : 'Lưu & Thưởng XP'}
                </button>
              </div>
            </form>
          </div>
        `;
      }).join('');

      // Gắn sự kiện nghe Audio học sinh
      document.querySelectorAll('.btn-play-student-audio').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const rawUrl = btn.dataset.url;
          const statusEl = document.getElementById(`audio-status-${id}`);
          btn.disabled = true;
          if (statusEl) statusEl.textContent = 'Đang tải âm thanh...';

          try {
            const playUrl = await window.Admin.getAudioPlayUrl(rawUrl);
            const audio = new Audio(playUrl);
            audio.play();
            btn.textContent = '⏸️ Đang phát...';
            if (statusEl) statusEl.textContent = 'Đang nghe...';

            audio.onended = () => {
              btn.textContent = '▶️ Nghe học sinh đọc';
              btn.disabled = false;
              if (statusEl) statusEl.textContent = 'Đã nghe xong';
            };
            audio.onerror = () => {
              btn.textContent = '▶️ Nghe học sinh đọc';
              btn.disabled = false;
              if (statusEl) statusEl.textContent = 'Lỗi file âm thanh';
            };
          } catch (err) {
            alert('Không thể phát file âm thanh: ' + (err.message || err));
            btn.textContent = '▶️ Nghe học sinh đọc';
            btn.disabled = false;
            if (statusEl) statusEl.textContent = '';
          }
        });
      });

      // Gắn sự kiện nghe Audio mẫu
      document.querySelectorAll('.btn-play-sample-audio').forEach(btn => {
        btn.addEventListener('click', () => {
          const url = btn.dataset.url;
          const audio = new Audio(url);
          audio.play();
          btn.textContent = '▶️ Đang phát mẫu...';
          audio.onended = () => {
            btn.textContent = '🔊 Nghe audio mẫu';
          };
        });
      });

      // Gắn sự kiện gửi Chấm điểm
      document.querySelectorAll('.form-grade-recording').forEach(form => {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const recId = form.dataset.id;
          const scoreInput = form.querySelector('.input-score');
          const commentInput = form.querySelector('.input-comment');
          const submitBtn = form.querySelector('.btn-submit-grade');

          const score = parseInt(scoreInput.value, 10);
          const comment = commentInput.value.trim();

          try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang lưu...';

            const res = await window.Admin.gradeRecording({
              recordingId: recId,
              score,
              comment
            });

            showAlert(`Đã lưu điểm ${score}/100 và tự động cộng +${res.xp_awarded || 0} XP cho học sinh!`, 'success');
            await loadRecordings();

          } catch (err) {
            alert('Lỗi khi chấm bài: ' + (err.message || err));
            submitBtn.disabled = false;
            submitBtn.textContent = '💾 Thử lại';
          }
        });
      });

      // Gắn sự kiện xóa bản ghi để giải phóng Storage
      document.querySelectorAll('.btn-delete-recording').forEach(btn => {
        btn.addEventListener('click', async () => {
          const recId = btn.dataset.id;
          const audioUrl = btn.dataset.url;
          if (confirm('Bạn có chắc chắn muốn xóa bản ghi này? File âm thanh trong Storage sẽ bị xóa để tiết kiệm dung lượng.')) {
            try {
              btn.disabled = true;
              btn.textContent = 'Đang xóa...';
              await window.Admin.deleteRecordingFile(recId, audioUrl);
              showAlert('Đã xóa bản ghi âm thành công!', 'success');
              const card = document.getElementById(`rec-card-${recId}`);
              if (card) card.remove();
            } catch (err) {
              alert('Lỗi xóa bản ghi: ' + (err.message || err));
              btn.disabled = false;
              btn.textContent = '🗑️ Xóa bản ghi';
            }
          }
        });
      });

    } catch (err) {
      console.error('Lỗi tải bài ghi âm:', err);
      gradingListContainer.innerHTML = `
        <div class="card" style="color: var(--danger); text-align: center; padding: 24px;">
          Lỗi tải bài ghi âm: ${err.message || err}
        </div>
      `;
    }
  }

  // Bắt sự kiện lọc
  filterClass.addEventListener('change', loadRecordings);
  filterStatus.addEventListener('change', loadRecordings);
  btnRefreshGrading.addEventListener('click', loadRecordings);

  // Tải lần đầu
  await loadRecordings();
});
