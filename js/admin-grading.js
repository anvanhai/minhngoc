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

    // Đọc tham số URL (nếu dẫn từ trang chi tiết lớp sang)
    const urlParams = new URLSearchParams(window.location.search);
    const paramClass = urlParams.get('classId');
    const paramStatus = urlParams.get('status');
    if (paramClass) filterClass.value = paramClass;
    if (paramStatus) filterStatus.value = paramStatus;
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

    // Bản đồ theo dõi tiến độ nghe và bản ghi âm nhận xét của giáo viên
    const cardVoiceDrafts = new Map();
    const cardListenedMap = new Map();
    let currentPlayingAudio = null;

    function formatDuration(sec) {
      const m = String(Math.floor(sec / 60)).padStart(2, '0');
      const s = String(sec % 60).padStart(2, '0');
      return `${m}:${s}`;
    }

    function stopCurrentPlayingAudio() {
      if (currentPlayingAudio) {
        try {
          currentPlayingAudio.pause();
          currentPlayingAudio.currentTime = 0;
        } catch (e) {}
        currentPlayingAudio = null;
      }
    }

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
        const takes = rec.recordings || [];

        // Khởi tạo tập hợp theo dõi tiến độ nghe
        if (!cardListenedMap.has(rec.id)) {
          cardListenedMap.set(rec.id, new Set());
        }

        return `
          <div class="grading-card" id="rec-card-${rec.id}" data-student-id="${rec.student_id || ''}" style="${isGraded ? 'opacity: 0.95;' : 'border-left: 4px solid var(--primary);'}">
            <!-- Thông tin học sinh & Lớp học -->
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

            <!-- Danh sách các bản ghi âm của học sinh (Multiple Takes) -->
            <div style="background: var(--bg-subtle); border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 14px; border: 1px solid var(--border-color);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
                <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">
                  🎙️ Các bản ghi âm của học sinh (${takes.length} bản):
                </div>
                <div style="font-size: 12px; color: var(--text-muted);">
                  Tiến độ nghe: <strong id="listened-counter-${rec.id}" style="color: var(--primary);">0/${takes.length}</strong>
                </div>
              </div>

              <div id="takes-list-${rec.id}">
                ${takes.map((take, tIdx) => `
                  <div class="take-grading-item" id="take-item-${take.id || tIdx}">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <strong style="font-size: 13px; color: var(--text-main);">Bản ghi ${take.position || tIdx + 1}</strong>
                      ${take.duration_seconds > 0 ? `
                        <span style="font-size: 11px; background: rgba(59, 130, 246, 0.15); color: var(--primary); padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                          ${formatDuration(take.duration_seconds)}
                        </span>
                      ` : ''}
                      <span id="badge-listened-${rec.id}-${tIdx}" style="font-size: 11px; color: var(--text-muted); font-style: italic;">
                        ⚪ Chưa nghe
                      </span>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px;">
                      <button type="button" class="btn btn-primary btn-sm btn-play-take" data-rec-id="${rec.id}" data-take-idx="${tIdx}" data-url="${take.storage_path}" style="padding: 3px 12px; font-size: 12px;">
                        ▶️ Nghe
                      </button>
                      <button type="button" class="btn btn-outline btn-sm btn-delete-take-admin" data-rec-id="${rec.id}" data-take-id="${take.id}" data-url="${take.storage_path}" style="color: var(--danger); border-color: var(--danger-border); font-size: 11px; padding: 3px 8px;" title="Xóa bản ghi này">
                        🗑️ Xóa bản
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>

              <!-- Thanh công cụ âm thanh bổ trợ -->
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; flex-wrap: wrap; gap: 8px; border-top: 1px dashed var(--border-color); padding-top: 8px;">
                <div>
                  ${rec.sample_audio_url ? `
                    <button type="button" class="btn btn-outline btn-sm btn-play-sample-audio" data-url="${rec.sample_audio_url}" style="font-size: 12px;">
                      🔊 Nghe audio đọc mẫu
                    </button>
                  ` : ''}
                </div>

                <button type="button" class="btn btn-outline btn-sm btn-delete-recording" data-id="${rec.id}" data-url="${rec.audio_url}" style="color: var(--danger); border-color: var(--danger-border); font-size: 11px; padding: 4px 10px;" title="Xóa toàn bộ bài nộp này">
                  🗑️ Xóa toàn bộ bài nộp
                </button>
              </div>
            </div>

            <!-- Form chấm điểm & nhận xét (Hỗ trợ cả Chữ & Giọng nói) -->
            <form class="form-grade-recording" data-id="${rec.id}">
              <div style="display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: start;">
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" style="font-size: 12px; font-weight: 700;">Điểm số (0 - 100) *</label>
                  <input type="number" min="0" max="100" class="form-control input-score" required value="${currentScore}" placeholder="Ví dụ: 85" style="font-weight: 700; font-size: 15px;">
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" style="font-size: 12px; font-weight: 700;">
                    Lời nhận xét bằng chữ <span style="font-weight: normal; color: var(--text-muted);">(tùy chọn nếu đã ghi âm)</span>
                  </label>
                  <input type="text" class="form-control input-comment" value="${currentComment}" placeholder="Ví dụ: Phát âm thanh 1 và 4 rất tốt, chú ý uốn lưỡi chữ 'zh'...">
                </div>
              </div>

              <!-- Khung nhận xét bằng giọng nói của cô giáo -->
              <div class="teacher-voice-box">
                <div style="font-size: 12px; font-weight: 700; color: var(--text-main); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                  🎙️ Nhận xét bằng giọng nói của cô giáo:
                </div>

                <!-- Lời nhận xét giọng nói đã lưu trước đó nếu có -->
                ${rec.teacher_audio_url ? `
                  <div id="prev-voice-box-${rec.id}" style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; background: rgba(59, 130, 246, 0.08); padding: 6px 10px; border-radius: 6px;">
                    <span style="font-size: 12px; color: var(--primary); font-weight: 600;">🟢 Đã có nhận xét giọng nói</span>
                    <button type="button" class="btn btn-outline btn-sm btn-play-teacher-prev-voice" data-url="${rec.teacher_audio_url}" style="font-size: 11px; padding: 2px 8px;">
                      ▶️ Nghe lại
                    </button>
                    <button type="button" class="btn btn-outline btn-sm btn-rerecord-teacher-voice" data-id="${rec.id}" style="color: var(--warning); border-color: var(--warning); font-size: 11px; padding: 2px 8px;">
                      🔄 Ghi âm mới (Thay thế)
                    </button>
                  </div>
                ` : ''}

                <!-- Bộ điều khiển ghi âm nhận xét -->
                <div id="teacher-recorder-controls-${rec.id}" style="${rec.teacher_audio_url ? 'display: none;' : 'display: block;'}">
                  <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <button type="button" class="btn btn-outline btn-sm btn-start-teacher-voice" data-id="${rec.id}" style="font-size: 12px;">
                      🎙️ Thu âm lời nhận xét
                    </button>
                    <button type="button" class="btn btn-danger btn-sm btn-stop-teacher-voice" data-id="${rec.id}" style="display: none; font-size: 12px;">
                      ⏹️ Dừng thu âm
                    </button>
                    <span id="teacher-timer-${rec.id}" style="display: none; font-family: monospace; font-size: 14px; font-weight: 700; color: var(--danger);">
                      00:00 / 02:00
                    </span>
                    <span id="teacher-voice-hint-${rec.id}" style="font-size: 12px; color: var(--text-muted); font-style: italic;">
                      (Tối đa 2 phút, giúp học sinh nghe ngữ điệu và phát âm chuẩn)
                    </span>
                  </div>

                  <!-- Trình phát nghe lại bản nhận xét vừa thu thử -->
                  <div id="teacher-draft-preview-${rec.id}" style="display: none; margin-top: 8px; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <audio id="teacher-draft-audio-${rec.id}" controls style="height: 32px; flex: 1; max-width: 280px;"></audio>
                    <button type="button" class="btn btn-outline btn-sm btn-discard-teacher-voice" data-id="${rec.id}" style="color: var(--danger); border-color: var(--danger-border); font-size: 11px; padding: 3px 8px;">
                      🗑️ Hủy bản thu này
                    </button>
                  </div>
                </div>
              </div>

              <!-- Nút Lưu kết quả -->
              <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
                <button type="submit" class="btn btn-primary btn-submit-grade" style="height: 40px; padding: 0 20px;">
                  💾 ${isGraded ? 'Cập nhật điểm & Nhận xét' : 'Lưu kết quả & Thưởng XP'}
                </button>
              </div>
            </form>
          </div>
        `;
      }).join('');

      // Gắn sự kiện nghe từng bản ghi âm con (takes) của học sinh
      document.querySelectorAll('.btn-play-take').forEach(btn => {
        btn.addEventListener('click', async () => {
          const recId = btn.dataset.recId;
          const takeIdx = parseInt(btn.dataset.takeIdx, 10);
          const rawUrl = btn.dataset.url;
          const badgeEl = document.getElementById(`badge-listened-${recId}-${takeIdx}`);
          const counterEl = document.getElementById(`listened-counter-${recId}`);

          stopCurrentPlayingAudio();
          btn.disabled = true;
          const origText = btn.textContent;
          btn.textContent = '⏳...';

          try {
            const playUrl = await window.Admin.getAudioPlayUrl(rawUrl);
            const audio = new Audio(playUrl);
            currentPlayingAudio = audio;
            audio.play();
            btn.textContent = '⏸️ Đang phát';
            btn.disabled = false;

            audio.onended = () => {
              btn.textContent = origText;
              // Đánh dấu đã nghe
              const listenedSet = cardListenedMap.get(recId) || new Set();
              listenedSet.add(takeIdx);
              cardListenedMap.set(recId, listenedSet);

              if (badgeEl) {
                badgeEl.textContent = '🟢 Đã nghe';
                badgeEl.style.color = '#16a34a';
                badgeEl.style.fontWeight = '700';
              }
              const takes = list.find(r => r.id === recId)?.recordings || [];
              if (counterEl) {
                counterEl.textContent = `${listenedSet.size}/${takes.length}`;
                if (listenedSet.size >= takes.length) {
                  counterEl.style.color = '#16a34a';
                }
              }
            };

            audio.onerror = () => {
              btn.textContent = origText;
              alert('Lỗi khi phát file âm thanh.');
            };

          } catch (err) {
            alert('Không thể phát file âm thanh: ' + (err.message || err));
            btn.textContent = origText;
            btn.disabled = false;
          }
        });
      });

      // Gắn sự kiện xóa một bản ghi con (take)
      document.querySelectorAll('.btn-delete-take-admin').forEach(btn => {
        btn.addEventListener('click', async () => {
          const recId = btn.dataset.recId;
          const takeId = btn.dataset.takeId;
          const storagePath = btn.dataset.url;

          if (confirm('Bạn có chắc chắn muốn xóa bản ghi này? File âm thanh trong Storage sẽ bị xóa để giải phóng dung lượng.')) {
            try {
              btn.disabled = true;
              btn.textContent = 'Đang xóa...';
              await window.Admin.deleteRecordingTake(takeId, storagePath);
              showAlert('Đã xóa bản ghi thành công!', 'success');
              const itemRow = document.getElementById(`take-item-${takeId}`);
              if (itemRow) itemRow.remove();
            } catch (err) {
              alert('Lỗi xóa bản ghi: ' + (err.message || err));
              btn.disabled = false;
              btn.textContent = '🗑️ Xóa bản';
            }
          }
        });
      });

      // Gắn sự kiện nghe Audio mẫu
      document.querySelectorAll('.btn-play-sample-audio').forEach(btn => {
        btn.addEventListener('click', () => {
          stopCurrentPlayingAudio();
          const url = btn.dataset.url;
          const audio = new Audio(url);
          currentPlayingAudio = audio;
          audio.play();
          btn.textContent = '▶️ Đang phát mẫu...';
          audio.onended = () => {
            btn.textContent = '🔊 Nghe audio mẫu';
          };
        });
      });

      // Gắn sự kiện nghe nhận xét cũ của giáo viên
      document.querySelectorAll('.btn-play-teacher-prev-voice').forEach(btn => {
        btn.addEventListener('click', async () => {
          stopCurrentPlayingAudio();
          const rawUrl = btn.dataset.url;
          const origText = btn.textContent;
          btn.disabled = true;
          btn.textContent = '⏳...';
          try {
            const playUrl = await window.Admin.getAudioPlayUrl(rawUrl);
            const audio = new Audio(playUrl);
            currentPlayingAudio = audio;
            audio.play();
            btn.textContent = '⏸️ Đang phát';
            btn.disabled = false;
            audio.onended = () => { btn.textContent = origText; };
            audio.onerror = () => { btn.textContent = origText; alert('Lỗi phát file nhận xét.'); };
          } catch (err) {
            alert('Lỗi nghe nhận xét: ' + (err.message || err));
            btn.textContent = origText;
            btn.disabled = false;
          }
        });
      });

      // Gắn sự kiện Ghi âm mới (Thay thế nhận xét cũ)
      document.querySelectorAll('.btn-rerecord-teacher-voice').forEach(btn => {
        btn.addEventListener('click', () => {
          const recId = btn.dataset.id;
          const ctrlBox = document.getElementById(`teacher-recorder-controls-${recId}`);
          if (ctrlBox) ctrlBox.style.display = 'block';
          btn.style.display = 'none';
        });
      });

      // Gắn sự kiện Bắt đầu thu âm nhận xét của giáo viên
      document.querySelectorAll('.btn-start-teacher-voice').forEach(btn => {
        btn.addEventListener('click', async () => {
          const recId = btn.dataset.id;
          const stopBtn = document.querySelector(`.btn-stop-teacher-voice[data-id="${recId}"]`);
          const timerEl = document.getElementById(`teacher-timer-${recId}`);
          const previewBox = document.getElementById(`teacher-draft-preview-${recId}`);
          const hintEl = document.getElementById(`teacher-voice-hint-${recId}`);

          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            let mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = 'audio/webm';
              if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/mp4';
                if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
              }
            }

            const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            const chunks = [];
            let elapsedSec = 0;

            mediaRecorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
              stream.getTracks().forEach(t => t.stop());
              const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });

              if (blob.size > 5 * 1024 * 1024) {
                alert('Dung lượng nhận xét vượt quá 5MB. Vui lòng ghi âm ngắn hơn.');
                btn.style.display = 'inline-flex';
                stopBtn.style.display = 'none';
                timerEl.style.display = 'none';
                return;
              }

              const objectUrl = URL.createObjectURL(blob);
              cardVoiceDrafts.set(recId, {
                blob,
                mimeType: mediaRecorder.mimeType || 'audio/webm',
                durationSeconds: Math.max(elapsedSec, 1),
                objectUrl
              });

              btn.style.display = 'inline-flex';
              btn.textContent = '🔄 Thu âm lại nhận xét';
              stopBtn.style.display = 'none';
              timerEl.style.display = 'none';
              if (hintEl) hintEl.style.display = 'none';

              if (previewBox) {
                previewBox.style.display = 'flex';
                const audioEl = document.getElementById(`teacher-draft-audio-${recId}`);
                if (audioEl) audioEl.src = objectUrl;
              }
            };

            mediaRecorder.start(250);
            btn.style.display = 'none';
            stopBtn.style.display = 'inline-flex';
            timerEl.style.display = 'inline';
            if (previewBox) previewBox.style.display = 'none';

            // Timer đếm lên (Tối đa 120s = 2 phút)
            const timerInterval = setInterval(() => {
              elapsedSec++;
              const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
              const ss = String(elapsedSec % 60).padStart(2, '0');
              timerEl.textContent = `${mm}:${ss} / 02:00`;

              if (elapsedSec >= 120) {
                clearInterval(timerInterval);
                if (mediaRecorder.state === 'recording') mediaRecorder.stop();
              }
            }, 1000);

            // Lưu context dừng
            btn._activeTimer = timerInterval;
            btn._activeRecorder = mediaRecorder;

          } catch (micErr) {
            console.error('Lỗi truy cập Microphone giáo viên:', micErr);
            alert('Không thể truy cập Microphone: ' + (micErr.message || micErr));
          }
        });
      });

      // Gắn sự kiện Dừng thu âm nhận xét của giáo viên
      document.querySelectorAll('.btn-stop-teacher-voice').forEach(btn => {
        btn.addEventListener('click', () => {
          const recId = btn.dataset.id;
          const startBtn = document.querySelector(`.btn-start-teacher-voice[data-id="${recId}"]`);
          if (startBtn && startBtn._activeTimer) {
            clearInterval(startBtn._activeTimer);
            startBtn._activeTimer = null;
          }
          if (startBtn && startBtn._activeRecorder && startBtn._activeRecorder.state === 'recording') {
            startBtn._activeRecorder.stop();
          }
        });
      });

      // Gắn sự kiện Hủy bản thu thử nhận xét
      document.querySelectorAll('.btn-discard-teacher-voice').forEach(btn => {
        btn.addEventListener('click', () => {
          const recId = btn.dataset.id;
          if (cardVoiceDrafts.has(recId)) {
            const draft = cardVoiceDrafts.get(recId);
            if (draft && draft.objectUrl) URL.revokeObjectURL(draft.objectUrl);
            cardVoiceDrafts.delete(recId);
          }
          const previewBox = document.getElementById(`teacher-draft-preview-${recId}`);
          if (previewBox) previewBox.style.display = 'none';
          const startBtn = document.querySelector(`.btn-start-teacher-voice[data-id="${recId}"]`);
          if (startBtn) startBtn.textContent = '🎙️ Thu âm lời nhận xét';
          const hintEl = document.getElementById(`teacher-voice-hint-${recId}`);
          if (hintEl) hintEl.style.display = 'inline';
        });
      });

      // Gắn sự kiện gửi Chấm điểm & Nhận xét
      document.querySelectorAll('.form-grade-recording').forEach(form => {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const recId = form.dataset.id;
          const scoreInput = form.querySelector('.input-score');
          const commentInput = form.querySelector('.input-comment');
          const submitBtn = form.querySelector('.btn-submit-grade');

          const score = parseInt(scoreInput.value, 10);
          const comment = commentInput.value.trim();
          const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '💾 Lưu điểm';

          try {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Đang lưu...';

            let teacherAudioUrl = null;
            let teacherAudioMime = 'audio/webm';
            let teacherAudioDuration = 0;

            // 1. Nếu có bản thu âm nhận xét mới, tải lên Storage trước
            if (cardVoiceDrafts.has(recId)) {
              submitBtn.textContent = '⏳ Đang tải file nhận xét...';
              const draft = cardVoiceDrafts.get(recId);
              const teacherId = authData.user ? authData.user.id : 'teacher';

              const uploadRes = await window.Admin.uploadTeacherVoiceFeedback(
                draft.blob,
                teacherId,
                recId
              );
              teacherAudioUrl = uploadRes.path;
              teacherAudioMime = uploadRes.mime_type;
              teacherAudioDuration = draft.durationSeconds;
            }

            // 2. Gọi hàm RPC lưu kết quả chấm điểm
            submitBtn.textContent = '⏳ Đang lưu điểm & XP...';
            const res = await window.Admin.gradeRecording({
              recordingId: recId,
              submissionId: recId,
              score,
              comment,
              teacherAudioUrl,
              teacherAudioMime,
              teacherAudioDuration
            });

            // Thu hồi objectUrl nếu có
            if (cardVoiceDrafts.has(recId)) {
              const draft = cardVoiceDrafts.get(recId);
              if (draft && draft.objectUrl) URL.revokeObjectURL(draft.objectUrl);
              cardVoiceDrafts.delete(recId);
            }

            const xpBonus = (res && res.xp_awarded > 0)
              ? ` và tự động cộng +${res.xp_awarded} XP cho học sinh!`
              : (res && res.already_rewarded ? ' (Điểm XP của bài tập này đã được cộng trước đó)' : '!');
            showAlert(`Đã lưu điểm ${score}/100${xpBonus}`, 'success');

            // Cập nhật lại danh sách và số lượng chờ chấm
            await loadRecordings();

          } catch (err) {
            console.error('Lỗi khi chấm bài ghi âm:', err);
            let errMsg = err.message || err || 'Lỗi không xác định khi lưu điểm';
            if (typeof errMsg === 'string' && errMsg.includes('xp_transactions_source_type_check')) {
              errMsg = 'Ràng buộc loại giao dịch điểm XP chưa hợp lệ (xp_transactions_source_type_check). Vui lòng dán file supabase/22_expand_xp_transactions_source_types.sql vào Supabase SQL Editor và nhấn Run để mở rộng danh sách loại điểm.';
            }
            showAlert(`Lỗi khi chấm bài: ${errMsg}`, 'danger');
            alert(`Lỗi khi chấm bài: ${errMsg}`);
          } finally {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = originalBtnHtml;
            }
          }
        });
      });

      // Gắn sự kiện xóa toàn bộ bản ghi để giải phóng Storage
      document.querySelectorAll('.btn-delete-recording').forEach(btn => {
        btn.addEventListener('click', async () => {
          const recId = btn.dataset.id;
          const audioUrl = btn.dataset.url;
          if (confirm('Bạn có chắc chắn muốn xóa toàn bộ bài nộp này? Mọi file âm thanh của học sinh và nhận xét của giáo viên sẽ bị xóa khỏi Storage để giải phóng dung lượng.')) {
            try {
              btn.disabled = true;
              btn.textContent = 'Đang xóa...';
              await window.Admin.deleteRecordingFile(recId, audioUrl);
              showAlert('Đã xóa toàn bộ bài ghi âm thành công!', 'success');
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

      // Nếu có tham số submissionId hoặc studentId trên URL -> Tự động cuộn tới bài đó và làm nổi bật
      const urlParams = new URLSearchParams(window.location.search);
      const targetSubId = urlParams.get('submissionId');
      const targetStudentId = urlParams.get('studentId');
      if (targetSubId) {
        const card = document.getElementById(`rec-card-${targetSubId}`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.outline = '3px solid var(--primary)';
          card.style.transition = 'outline 0.3s ease';
          setTimeout(() => { card.style.outline = 'none'; }, 4000);
        }
      } else if (targetStudentId) {
        const firstCard = gradingListContainer.querySelector(`[data-student-id="${targetStudentId}"]`);
        if (firstCard) {
          firstCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstCard.style.outline = '3px solid var(--primary)';
          firstCard.style.transition = 'outline 0.3s ease';
          setTimeout(() => { firstCard.style.outline = 'none'; }, 4000);
        }
      }

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
