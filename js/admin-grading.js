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

  // 1. Kiểm tra xác thực quyền Admin / Giáo viên (bọc try/catch đảm bảo header không bị kẹt)
  let authData = null;
  try {
    authData = await window.Auth.requireAuth(['admin', 'teacher'], '../index.html');
    if (!authData) return;
    window.Auth.renderNavbarUserInfo(authData.profile);
  } catch (authErr) {
    console.error('Lỗi xác thực quyền truy cập trang chấm bài:', authErr);
    const displayNameEl = document.querySelector('.user-display-name');
    if (displayNameEl) displayNameEl.textContent = 'Chưa đăng nhập';
    if (gradingListContainer) {
      gradingListContainer.innerHTML = `
        <div class="card" style="text-align: center; padding: 36px 20px; color: var(--danger);">
          <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
          <div style="font-weight: 700; font-size: 16px; margin-bottom: 6px;">Không thể xác thực quyền Quản trị / Giáo viên</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">${authErr.message || authErr}</div>
          <a href="../index.html" class="btn btn-primary btn-sm">Đăng nhập lại</a>
        </div>
      `;
    }
    return;
  }

  // 2. Nạp danh sách lớp học vào dropdown bộ lọc
  try {
    const classes = await window.Admin.getClasses();
    filterClass.innerHTML = '<option value="">-- Tất cả các lớp học --</option>' +
      (classes || []).map(c => `<option value="${c.id}">${c.name} (${c.level})</option>`).join('');
  } catch (err) {
    console.warn('Lỗi nạp danh sách lớp học:', err);
  }

  // Hàm đếm số lượng bài chờ chấm chính xác từ DB
  async function updatePendingCount(classId) {
    try {
      const db = window.getDb ? window.getDb() : null;
      if (!db || !badgePendingCount) return;
      let query = db
        .from('recording_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted');

      if (classId && classId !== 'all') {
        query = query.eq('class_id', classId);
      }
      const { count, error } = await query;
      if (!error && count !== null) {
        badgePendingCount.textContent = count;
      }
    } catch (e) {
      console.warn('Lỗi cập nhật số bài chờ chấm:', e);
    }
  }

  // 3. Tải và hiển thị danh sách bài ghi âm
  async function loadRecordings() {
    gradingListContainer.innerHTML = `
      <div style="text-align: center; padding: 48px; color: var(--text-muted);">
        <div style="font-size: 28px; margin-bottom: 8px;">⏳</div>
        <div>Đang tải danh sách bài tập ghi âm...</div>
      </div>
    `;

    try {
      const classId = filterClass.value || null;
      const status = filterStatus.value || 'submitted';

      // Chạy song song: Lấy danh sách bài nộp và cập nhật số bài chờ chấm
      const [list] = await Promise.all([
        window.Admin.getRecordingsForGrading({ classId, status }),
        updatePendingCount(classId)
      ]);

      if (!list || list.length === 0) {
        const isFilterPending = (status === 'submitted');
        gradingListContainer.innerHTML = `
          <div class="card" style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
            <div style="font-size: 36px; margin-bottom: 12px;">🎉</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
              ${isFilterPending ? 'Chưa có bài nộp nào cần chấm!' : 'Không có bài ghi âm nào theo bộ lọc hiện tại!'}
            </div>
            <div style="font-size: 13px;">
              ${isFilterPending ? 'Toàn bộ bài tập ghi âm của học sinh đã được chấm xong hoặc chưa có bài mới.' : 'Hãy chọn bộ lọc khác để xem lại các bài nộp.'}
            </div>
          </div>
        `;
        return;
      }

      gradingListContainer.innerHTML = list.map(rec => {
        const student = rec.student || {};
        const studentName = student.display_name || student.username || 'Học sinh';
        const studentUsername = student.username ? `@${student.username}` : '';
        const className = rec.class ? `${rec.class.name} (${rec.class.level || ''})` : 'Lớp học';
        const assignTitle = rec.assignment ? rec.assignment.title : (rec.lesson ? `Bài ${rec.lesson.order_index}: ${rec.lesson.title_zh}` : 'Bài tập ghi âm');
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
                  <strong style="font-size: 16px; color: var(--text-main);">${studentName}</strong>
                  ${studentUsername ? `<span style="font-size: 12px; color: var(--text-muted); font-weight: 500;">(${studentUsername})</span>` : ''}
                  <span class="badge-status ${isGraded ? 'badge-ongoing' : 'badge-paused'}">
                    ${isGraded ? '🟢 Đã chấm' : '🟡 Chờ chấm'}
                  </span>
                </div>
                <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
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
                ${rec.prompt_text || 'Bài đọc tiếng Trung'}
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
          const originalBtnHtml = submitBtn.innerHTML;

          try {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Đang lưu...';

            const res = await window.Admin.gradeRecording({
              recordingId: recId,
              submissionId: recId,
              score,
              comment
            });

            const xpBonus = (res && res.xp_awarded > 0)
              ? ` và tự động cộng +${res.xp_awarded} XP cho học sinh!`
              : (res && res.already_rewarded ? ' (Điểm XP của bài tập này đã được cộng trước đó)' : '!');
            showAlert(`Đã lưu điểm ${score}/100${xpBonus}`, 'success');

            // Cập nhật lại danh sách và số lượng chờ chấm
            await loadRecordings();

          } catch (err) {
            console.error('Lỗi khi chấm bài:', err);
            alert('Lỗi khi chấm bài: ' + (err.message || err));
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml || '💾 Lưu điểm';
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
              updatePendingCount(filterClass.value || null);
            } catch (err) {
              alert('Lỗi xóa bản ghi: ' + (err.message || err));
              btn.disabled = false;
              btn.textContent = '🗑️ Xóa bản ghi';
            }
          }
        });
      });

    } catch (err) {
      console.error('Lỗi chi tiết khi tải bài ghi âm:', err);
      gradingListContainer.innerHTML = `
        <div class="card" style="color: var(--danger); text-align: center; padding: 36px 20px;">
          <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
          <div style="font-weight: 700; font-size: 16px; margin-bottom: 6px;">Không thể tải danh sách bài tập ghi âm</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">${err.message || err}</div>
          <button type="button" class="btn btn-outline btn-sm btn-retry-load" style="margin: 0 auto; display: inline-flex; align-items: center; gap: 6px;">
            🔄 Thử lại
          </button>
        </div>
      `;
      const btnRetry = gradingListContainer.querySelector('.btn-retry-load');
      if (btnRetry) {
        btnRetry.addEventListener('click', loadRecordings);
      }
    }
  }

  // Bắt sự kiện lọc
  filterClass.addEventListener('change', loadRecordings);
  filterStatus.addEventListener('change', loadRecordings);
  btnRefreshGrading.addEventListener('click', loadRecordings);

  // Tải lần đầu
  await loadRecordings();
});
