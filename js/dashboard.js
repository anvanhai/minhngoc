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
    let currentListeningAssign = null;
    let currentSpeakingAssign = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let recordTimerInterval = null;
    let recordSeconds = 0;

    // Hàm nhận diện chuẩn loại bài tập (có dự phòng thông minh cho bài tập cũ)
    function getEffectiveAssignmentType(a) {
      if (a.assignment_type && a.assignment_type !== 'vocabulary') {
        return a.assignment_type;
      }
      const titleLower = (a.title || '').toLowerCase();
      if (a.speaking_prompt || titleLower.includes('ghi âm') || titleLower.includes('nói') || titleLower.includes('phát âm') || titleLower.includes('speaking')) {
        return 'speaking';
      }
      if (a.listening_audio_url || titleLower.includes('nghe') || titleLower.includes('listening')) {
        return 'listening';
      }
      if (titleLower.includes('quiz') || titleLower.includes('trắc nghiệm')) {
        return 'quiz';
      }
      return a.assignment_type || 'vocabulary';
    }

    async function loadDashboardAssignments() {
      try {
        const assignments = await window.Student.getClassAssignments(activeClass.id);

        if (!assignments || assignments.length === 0) {
          assignmentsContainer.innerHTML = `
            <div style="text-align: center; padding: 24px; color: var(--text-muted); background: var(--bg-subtle); border-radius: var(--radius-sm);">
              🎉 Hiện tại lớp chưa có bài tập nào cần làm. Bạn có thể tự do học tiếp giáo trình!
            </div>
          `;
          return;
        }

        assignmentsContainer.innerHTML = assignments.map(a => {
          const type = getEffectiveAssignmentType(a);
          a.effectiveType = type;

          let typeBadge = '<span class="badge-status" style="background: rgba(74, 222, 128, 0.18); color: #16a34a;">📖 Từ vựng</span>';
          if (type === 'listening') {
            typeBadge = '<span class="badge-status" style="background: rgba(56, 189, 248, 0.18); color: #0284c7;">🎧 Nghe hiểu</span>';
          } else if (type === 'speaking') {
            typeBadge = '<span class="badge-status" style="background: rgba(248, 113, 113, 0.18); color: #dc2626;">🎙️ Nói / Ghi âm</span>';
          } else if (type === 'quiz') {
            typeBadge = '<span class="badge-status" style="background: rgba(168, 85, 247, 0.18); color: #9333ea;">📝 Quiz</span>';
          }

          let statusBadge = '';
          let actionBtn = '';
          const sub = a.submission;

          if (a.userStatus === 'graded') {
            statusBadge = `<span class="badge-status badge-ongoing">🟢 Đã chấm: ${sub.score}/100</span>`;
            if (type === 'speaking') {
              actionBtn = `<button type="button" class="btn btn-outline btn-sm btn-open-speaking" data-id="${a.id}">Xem bài nộp 🎙️</button>`;
            } else {
              actionBtn = `<span style="font-size: 13px; color: #16a34a; font-weight: 700;">+${Math.round((sub.score / 100) * (a.reward_xp || 30))} XP</span>`;
            }
          } else if (a.userStatus === 'completed' || a.userStatus === 'submitted') {
            if (type === 'speaking') {
              statusBadge = '<span class="badge-status badge-paused">🟡 Đã nộp (Chờ cô giáo chấm)</span>';
              actionBtn = `<button type="button" class="btn btn-outline btn-sm btn-open-speaking" data-id="${a.id}">Xem bài nộp 🎙️</button>`;
            } else {
              statusBadge = '<span class="badge-status badge-ongoing" style="background: rgba(74, 222, 128, 0.2); color: #16a34a;">🟢 Đã hoàn thành</span>';
              actionBtn = `<span style="font-size: 13px; color: #16a34a; font-weight: 600;">+${a.reward_xp || 30} XP</span>`;
            }
          } else if (a.userStatus === 'late') {
            statusBadge = '<span class="badge-status badge-paused">🟡 Đã nộp muộn</span>';
            if (type === 'speaking') {
              actionBtn = `<button type="button" class="btn btn-outline btn-sm btn-open-speaking" data-id="${a.id}">Xem bài nộp 🎙️</button>`;
            } else {
              actionBtn = `<span style="font-size: 13px; color: var(--text-muted);">Đã nộp</span>`;
            }
          } else if (a.isPastDue) {
            statusBadge = '<span class="badge-status badge-completed" style="background: rgba(248, 113, 113, 0.2); color: #dc2626;">🔴 Quá hạn</span>';
            if (type === 'listening') {
              actionBtn = `<button type="button" class="btn btn-outline btn-sm btn-open-listening" data-id="${a.id}">Làm bù bài nghe 🎧</button>`;
            } else if (type === 'speaking') {
              actionBtn = `<button type="button" class="btn btn-outline btn-sm btn-open-speaking" data-id="${a.id}">Ghi âm bù 🎙️</button>`;
            } else if (a.lesson_id) {
              actionBtn = `<a href="lesson.html?id=${a.lesson_id}&class_id=${activeClass.id}" class="btn btn-outline btn-sm">Làm bù</a>`;
            } else {
              actionBtn = `<button type="button" class="btn btn-outline btn-sm btn-open-detail" data-id="${a.id}">Xem chi tiết 📋</button>`;
            }
          } else {
            statusBadge = '<span class="badge-status badge-paused" style="background: rgba(148, 163, 184, 0.2); color: var(--text-muted);">⚪ Chưa làm</span>';
            if (type === 'listening') {
              actionBtn = `<button type="button" class="btn btn-primary btn-sm btn-open-listening" data-id="${a.id}">Làm bài nghe 🎧</button>`;
            } else if (type === 'speaking') {
              actionBtn = `<button type="button" class="btn btn-primary btn-sm btn-open-speaking" data-id="${a.id}">Ghi âm nộp bài 🎙️</button>`;
            } else if (a.lesson_id) {
              actionBtn = `<a href="lesson.html?id=${a.lesson_id}&class_id=${activeClass.id}" class="btn btn-primary btn-sm">Vào bài học 🚀</a>`;
            } else {
              actionBtn = `<button type="button" class="btn btn-outline btn-sm btn-open-detail" data-id="${a.id}">Xem chi tiết 📋</button>`;
            }
          }

          const dueFormatted = new Date(a.due_date).toLocaleString('vi-VN', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
          });

          return `
            <div class="assignment-card-item" data-id="${a.id}" data-type="${type}" style="background: var(--bg-card); border: 1.5px solid var(--border-color); border-radius: var(--radius-sm); padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s;">
              <div style="flex: 1; min-width: 260px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                  ${typeBadge}
                  <span style="font-weight: 700; font-size: 15px; color: var(--text-main);">${a.title}</span>
                </div>
                <div style="font-size: 13px; color: var(--text-muted); display: flex; gap: 12px; flex-wrap: wrap;">
                  <span>⏰ Hạn chót: <strong>${dueFormatted}</strong></span>
                  <span>⚡ Thưởng: <strong style="color: #ca8a04;">+${a.reward_xp || 30} XP</strong></span>
                  ${a.lesson ? `<span>📖 Bài ${a.lesson.order_index}: ${a.lesson.title_zh}</span>` : ''}
                </div>
                ${sub && sub.teacher_comment ? `
                  <div style="font-size: 12px; color: var(--primary); margin-top: 6px; background: var(--bg-subtle); padding: 4px 10px; border-radius: 4px; display: inline-block;">
                    💬 Nhận xét của cô giáo: "${sub.teacher_comment}"
                  </div>
                ` : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                ${statusBadge}
                ${actionBtn}
              </div>
            </div>
          `;
        }).join('');

        // Bấm vào cả thẻ bài tập để mở hộp thoại chi tiết
        document.querySelectorAll('.assignment-card-item').forEach(card => {
          card.addEventListener('click', (e) => {
            // Không mở nếu người dùng bấm trúng liên kết <a> hoặc nút bấm con
            if (e.target.closest('button') || e.target.closest('a')) return;
            const assignId = card.getAttribute('data-id');
            const assign = assignments.find(x => x.id === assignId);
            if (!assign) return;

            const type = assign.effectiveType || assign.assignment_type;
            if (type === 'speaking') {
              openSpeakingModal(assign);
            } else if (type === 'listening') {
              openListeningModal(assign);
            } else {
              openAssignmentDetailModal(assign);
            }
          });
        });

        // Gắn sự kiện mở bài nghe
        document.querySelectorAll('.btn-open-listening').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const assignId = btn.getAttribute('data-id');
            const assign = assignments.find(x => x.id === assignId);
            if (assign) openListeningModal(assign);
          });
        });

        // Gắn sự kiện mở bài nói / ghi âm
        document.querySelectorAll('.btn-open-speaking').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const assignId = btn.getAttribute('data-id');
            const assign = assignments.find(x => x.id === assignId);
            if (assign) openSpeakingModal(assign);
          });
        });

        // Gắn sự kiện mở chi tiết bài tập chung
        document.querySelectorAll('.btn-open-detail').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const assignId = btn.getAttribute('data-id');
            const assign = assignments.find(x => x.id === assignId);
            if (assign) openAssignmentDetailModal(assign);
          });
        });

      } catch (err) {
        console.warn('Lỗi tải bài tập:', err);
        assignmentsContainer.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 16px;">Không thể tải bài tập lớp.</div>`;
      }
    }

    // Modal Bài Nghe
    const modalListening = document.getElementById('modal-listening-assignment');
    const listeningModalTitle = document.getElementById('listening-modal-title');
    const listeningModalDesc = document.getElementById('listening-modal-desc');
    const listeningModalAlert = document.getElementById('listening-modal-alert');
    const listeningAudioPlayer = document.getElementById('listening-audio-player');
    const listeningQuestionsList = document.getElementById('listening-questions-list');
    const btnSubmitListening = document.getElementById('btn-submit-listening');

    document.querySelectorAll('[data-close="modal-listening-assignment"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (listeningAudioPlayer) listeningAudioPlayer.pause();
        modalListening.classList.remove('active');
      });
    });

    function openListeningModal(assign) {
      currentListeningAssign = assign;
      listeningModalTitle.textContent = `🎧 ${assign.title}`;
      listeningModalDesc.textContent = assign.description || 'Nghe đoạn audio bên dưới và trả lời các câu hỏi';
      listeningModalAlert.className = 'alert';
      listeningModalAlert.textContent = '';

      // Thiết lập link audio bài nghe
      const audioUrl = assign.listening_audio_url || (assign.lesson ? assign.lesson.audio_dialogue_url : '');
      if (audioUrl) {
        listeningAudioPlayer.src = audioUrl;
        listeningAudioPlayer.style.display = 'block';
      } else {
        listeningAudioPlayer.style.display = 'none';
      }

      // Render danh sách câu hỏi
      const questions = assign.listening_questions || [];
      if (questions.length === 0) {
        listeningQuestionsList.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">Bài nghe này chưa có câu hỏi trắc nghiệm.</div>`;
      } else {
        listeningQuestionsList.innerHTML = questions.map((q, idx) => `
          <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 14px;">
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 10px; color: var(--text-main);">
              Câu ${idx + 1}: ${q.question}
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${(q.options || []).map((opt, optIdx) => `
                <label style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; background: var(--bg-subtle); cursor: pointer;">
                  <input type="radio" name="listening_ans_${idx}" value="${optIdx}">
                  <span style="font-size: 13px;">${String.fromCharCode(65 + optIdx)}. ${opt}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `).join('');
      }

      btnSubmitListening.disabled = false;
      btnSubmitListening.textContent = 'Nộp bài & Chấm điểm';
      modalListening.classList.add('active');
    }

    if (btnSubmitListening) {
      btnSubmitListening.addEventListener('click', async () => {
        if (!currentListeningAssign) return;
        const questions = currentListeningAssign.listening_questions || [];
        const answers = [];

        for (let i = 0; i < questions.length; i++) {
          const selected = document.querySelector(`input[name="listening_ans_${i}"]:checked`);
          if (!selected) {
            listeningModalAlert.className = 'alert alert-danger show';
            listeningModalAlert.textContent = `Vui lòng chọn đáp án cho Câu ${i + 1}!`;
            return;
          }
          answers.push(parseInt(selected.value, 10));
        }

        try {
          btnSubmitListening.disabled = true;
          btnSubmitListening.textContent = 'Đang chấm điểm...';

          const res = await window.Student.submitListeningAssignment(currentListeningAssign.id, answers);

          listeningModalAlert.className = 'alert alert-success show';
          listeningModalAlert.innerHTML = `
            🎉 <strong>Hoàn thành bài nghe!</strong><br>
            Bạn đạt: <strong>${res.score}/100 điểm</strong> (Đúng ${res.correct_count}/${res.total_questions} câu).<br>
            ${res.xp_awarded > 0 ? `Nhận thưởng: <strong>+${res.xp_awarded} XP</strong> ⚡` : ''}
          `;

          if (listeningAudioPlayer) listeningAudioPlayer.pause();
          await loadDashboardAssignments();

          if (window.FeedbackPopup) {
            window.FeedbackPopup.show('listening', {
              score: res.score,
              onContinue: () => {
                modalListening.classList.remove('active');
              }
            });
          }

        } catch (err) {
          listeningModalAlert.className = 'alert alert-danger show';
          listeningModalAlert.textContent = err.message || 'Lỗi khi nộp bài nghe';
          btnSubmitListening.disabled = false;
          btnSubmitListening.textContent = 'Thử lại';
        }
      });
    }

    // Modal Bài Nói & Ghi Âm
    const modalSpeaking = document.getElementById('modal-speaking-assignment');
    const speakingModalTitle = document.getElementById('speaking-modal-title');
    const speakingModalDesc = document.getElementById('speaking-modal-desc');
    const speakingModalAlert = document.getElementById('speaking-modal-alert');
    const speakingModalDue = document.getElementById('speaking-modal-due');
    const speakingModalXp = document.getElementById('speaking-modal-xp');
    const speakingModalLessonBox = document.getElementById('speaking-modal-lesson-box');
    const speakingModalLesson = document.getElementById('speaking-modal-lesson');
    const speakingPromptHanzi = document.getElementById('speaking-prompt-hanzi');
    const speakingPromptPinyin = document.getElementById('speaking-prompt-pinyin');
    const speakingSampleAudioBox = document.getElementById('speaking-sample-audio-box');
    const btnPlaySpeakingSample = document.getElementById('btn-play-speaking-sample');

    const speakingRecordWrapper = document.getElementById('speaking-record-wrapper');
    const recorderStatusText = document.getElementById('recorder-status-text');
    const recorderTimer = document.getElementById('recorder-timer');
    const btnStartRecord = document.getElementById('btn-start-record');
    const btnStopRecord = document.getElementById('btn-stop-record');
    const btnCancelRecord = document.getElementById('btn-cancel-record');
    const btnReRecord = document.getElementById('btn-re-record');
    const previewAudioContainer = document.getElementById('preview-audio-container');
    const previewAudioPlayer = document.getElementById('preview-audio-player');
    const micPermissionGuide = document.getElementById('mic-permission-guide');
    const speakingPrevSubmissionInfo = document.getElementById('speaking-prev-submission-info');
    const btnSubmitSpeaking = document.getElementById('btn-submit-speaking');
    const btnAddTake = document.getElementById('btn-add-take');
    const speakingTakesList = document.getElementById('speaking-takes-list');
    const takesCountBadge = document.getElementById('takes-count-badge');
    const takesEmptyHint = document.getElementById('takes-empty-hint');
    const takesMaxNotice = document.getElementById('takes-max-notice');

    // Modal Chi tiết bài tập chung (từ vựng / quiz / bài tập chung)
    const modalAssignmentDetail = document.getElementById('modal-assignment-detail');
    const detailAssignBadge = document.getElementById('detail-assign-badge');
    const detailAssignTitle = document.getElementById('detail-assign-title');
    const detailAssignDue = document.getElementById('detail-assign-due');
    const detailAssignXp = document.getElementById('detail-assign-xp');
    const detailAssignLessonBox = document.getElementById('detail-assign-lesson-box');
    const detailAssignLesson = document.getElementById('detail-assign-lesson');
    const detailAssignDesc = document.getElementById('detail-assign-desc');
    const detailAssignStatusBox = document.getElementById('detail-assign-status-box');
    const detailAssignActionContainer = document.getElementById('detail-assign-action-container');
    const detailAssignAlert = document.getElementById('detail-assign-alert');

    document.querySelectorAll('[data-close="modal-assignment-detail"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (modalAssignmentDetail) modalAssignmentDetail.classList.remove('active');
      });
    });

    function openAssignmentDetailModal(assign) {
      if (!modalAssignmentDetail) return;
      if (detailAssignAlert) {
        detailAssignAlert.className = 'alert';
        detailAssignAlert.textContent = '';
      }

      const type = assign.effectiveType || assign.assignment_type || 'vocabulary';
      let typeText = '📖 Bài tập Từ vựng';
      let badgeStyle = 'background: rgba(74, 222, 128, 0.18); color: #16a34a;';
      if (type === 'quiz') {
        typeText = '📝 Quiz kiểm tra';
        badgeStyle = 'background: rgba(168, 85, 247, 0.18); color: #9333ea;';
      }
      if (detailAssignBadge) {
        detailAssignBadge.innerHTML = `<span class="badge-status" style="${badgeStyle}">${typeText}</span>`;
      }

      if (detailAssignTitle) detailAssignTitle.textContent = assign.title;
      if (detailAssignDue) {
        detailAssignDue.textContent = new Date(assign.due_date).toLocaleString('vi-VN', {
          hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
        });
      }
      if (detailAssignXp) detailAssignXp.textContent = `+${assign.reward_xp || 30} XP`;
      if (detailAssignDesc) {
        detailAssignDesc.textContent = assign.description || 'Hoàn thành bài tập theo yêu cầu của giáo viên trước hạn chót.';
      }

      if (detailAssignLessonBox && detailAssignLesson) {
        if (assign.lesson) {
          detailAssignLessonBox.style.display = 'inline';
          detailAssignLesson.textContent = `Bài ${assign.lesson.order_index}: ${assign.lesson.title_zh} (${assign.lesson.title_vi || ''})`;
        } else {
          detailAssignLessonBox.style.display = 'none';
        }
      }

      const isDone = (assign.userStatus === 'completed' || assign.userStatus === 'graded' || assign.userStatus === 'late');
      if (isDone) {
        detailAssignStatusBox.style.background = 'rgba(74, 222, 128, 0.15)';
        detailAssignStatusBox.style.color = '#16a34a';
        detailAssignStatusBox.innerHTML = '🟢 Bạn đã hoàn thành bài tập này và nhận thưởng XP!';
        detailAssignActionContainer.innerHTML = '';
      } else {
        detailAssignStatusBox.style.background = assign.isPastDue ? 'rgba(248, 113, 113, 0.15)' : 'rgba(251, 191, 36, 0.15)';
        detailAssignStatusBox.style.color = assign.isPastDue ? '#dc2626' : '#d97706';
        detailAssignStatusBox.innerHTML = assign.isPastDue ? '🔴 Bài tập đã quá hạn nộp.' : '⚪ Bài tập chưa hoàn thành.';

        if (assign.lesson_id) {
          detailAssignActionContainer.innerHTML = `
            <a href="lesson.html?id=${assign.lesson_id}&class_id=${activeClass.id}" class="btn btn-primary">
              Vào bài học ngay 🚀
            </a>
          `;
        } else {
          detailAssignActionContainer.innerHTML = `
            <button type="button" class="btn btn-primary btn-modal-confirm-complete" data-id="${assign.id}">
              Xác nhận hoàn thành (+${assign.reward_xp || 30} XP)
            </button>
          `;
          detailAssignActionContainer.querySelector('.btn-modal-confirm-complete').addEventListener('click', async (e) => {
            const btn = e.target;
            try {
              btn.disabled = true;
              btn.textContent = 'Đang lưu...';
              await window.Student.completeAssignment(assign.id);
              detailAssignAlert.className = 'alert alert-success show';
              detailAssignAlert.textContent = '🎉 Chúc mừng bạn đã hoàn thành bài tập!';
              await loadDashboardAssignments();
              setTimeout(() => {
                modalAssignmentDetail.classList.remove('active');
              }, 1200);
            } catch (err) {
              detailAssignAlert.className = 'alert alert-danger show';
              detailAssignAlert.textContent = err.message || 'Lỗi khi hoàn thành bài tập';
              btn.disabled = false;
              btn.textContent = 'Thử lại';
            }
          });
        }
      }

      modalAssignmentDetail.classList.add('active');
    }

    // Biến quản lý nhiều bản ghi âm (Takes)
    let recordedTakes = [];
    let activeReplaceIndex = -1;
    let activeStream = null;

    function formatDuration(sec) {
      const m = String(Math.floor(sec / 60)).padStart(2, '0');
      const s = String(sec % 60).padStart(2, '0');
      return `${m}:${s}`;
    }

    function renderTakesList() {
      if (takesCountBadge) {
        takesCountBadge.textContent = `${recordedTakes.length}/10`;
      }

      if (recordedTakes.length === 0) {
        if (takesEmptyHint) takesEmptyHint.style.display = 'block';
        if (speakingTakesList) {
          speakingTakesList.innerHTML = '';
          if (takesEmptyHint) speakingTakesList.appendChild(takesEmptyHint);
        }
        if (btnAddTake) btnAddTake.style.display = 'none';
        if (takesMaxNotice) takesMaxNotice.style.display = 'none';
        if (btnSubmitSpeaking) {
          btnSubmitSpeaking.disabled = true;
          btnSubmitSpeaking.textContent = '📤 Nộp bài ghi âm';
        }
        if (recorderStatusText && activeReplaceIndex === -1) {
          recorderStatusText.textContent = 'Nhấn nút bên dưới để bắt đầu ghi Bản ghi 1';
        }
        return;
      }

      if (takesEmptyHint) takesEmptyHint.style.display = 'none';

      if (speakingTakesList) {
        speakingTakesList.innerHTML = recordedTakes.map((take, idx) => `
          <div class="take-item" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--bg-subtle); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 8px; min-width: 110px;">
              <span style="font-weight: 700; font-size: 13px; color: var(--text-main);">🎙️ Bản ghi ${idx + 1}</span>
              <span style="font-size: 11px; background: rgba(59, 130, 246, 0.15); color: var(--primary); padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                ${formatDuration(take.durationSeconds || 0)}
              </span>
            </div>

            <audio controls src="${take.objectUrl}" style="height: 32px; flex: 1; min-width: 180px; max-width: 280px;"></audio>

            <div style="display: flex; gap: 6px; align-items: center;">
              <button type="button" class="btn btn-outline btn-sm btn-replace-take" data-index="${idx}" style="font-size: 11px; padding: 3px 8px;" title="Ghi âm lại để thay thế bản ghi này">
                🔄 Ghi lại
              </button>
              <button type="button" class="btn btn-outline btn-sm btn-delete-take" data-index="${idx}" style="color: var(--danger); border-color: var(--danger-border); font-size: 11px; padding: 3px 8px;" title="Xóa bản ghi này">
                🗑️ Xóa
              </button>
            </div>
          </div>
        `).join('');

        // Khắc phục lỗi Chromium hiển thị 0:00 cho audio WebM dạng live Blob
        speakingTakesList.querySelectorAll('audio').forEach(audioEl => {
          audioEl.addEventListener('loadedmetadata', function () {
            if (audioEl.duration === Infinity || isNaN(audioEl.duration) || audioEl.duration === 0) {
              const prevTime = audioEl.currentTime;
              audioEl.currentTime = 1e101;
              audioEl.ontimeupdate = function () {
                this.ontimeupdate = null;
                this.currentTime = prevTime;
              };
            }
          });
        });

        // Gắn sự kiện Ghi lại từng bản
        speakingTakesList.querySelectorAll('.btn-replace-take').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index, 10);
            if (isNaN(idx) || idx < 0 || idx >= recordedTakes.length) return;
            activeReplaceIndex = idx;
            if (recorderStatusText) {
              recorderStatusText.innerHTML = `<span style="color: var(--danger); font-weight: 700;">🔴 Đang chuẩn bị thu âm thay thế cho: Bản ghi ${idx + 1}</span>`;
            }
            if (btnCancelRecord) btnCancelRecord.style.display = 'inline-flex';
            if (btnStartRecord) btnStartRecord.style.display = 'inline-flex';
            if (btnStopRecord) btnStopRecord.style.display = 'none';
            if (btnAddTake) btnAddTake.style.display = 'none';
            if (recorderTimer) {
              recorderTimer.innerHTML = '00:00 <span style="font-size: 13px; color: var(--text-muted); font-weight: normal;">/ 01:00</span>';
            }
          });
        });

        // Gắn sự kiện Xóa từng bản (tự động đánh số lại các bản còn lại)
        speakingTakesList.querySelectorAll('.btn-delete-take').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index, 10);
            if (isNaN(idx) || idx < 0 || idx >= recordedTakes.length) return;
            if (confirm(`Bạn có chắc muốn xóa Bản ghi ${idx + 1}?`)) {
              if (recordedTakes[idx] && recordedTakes[idx].objectUrl) {
                URL.revokeObjectURL(recordedTakes[idx].objectUrl);
              }
              recordedTakes.splice(idx, 1);
              recordedTakes.forEach((t, i) => { t.position = i + 1; });
              if (activeReplaceIndex === idx) {
                activeReplaceIndex = -1;
                if (btnCancelRecord) btnCancelRecord.style.display = 'none';
              } else if (activeReplaceIndex > idx) {
                activeReplaceIndex--;
              }
              renderTakesList();
            }
          });
        });
      }

      const total = recordedTakes.length;
      if (btnSubmitSpeaking) {
        btnSubmitSpeaking.disabled = false;
        btnSubmitSpeaking.textContent = `📤 Nộp ${total} bản ghi`;
      }

      if (total >= 10) {
        if (btnAddTake) btnAddTake.style.display = 'none';
        if (takesMaxNotice) takesMaxNotice.style.display = 'block';
        if (btnStartRecord && activeReplaceIndex === -1) btnStartRecord.style.display = 'none';
        if (recorderStatusText && activeReplaceIndex === -1) {
          recorderStatusText.textContent = 'Đã đạt tối đa 10 bản ghi. Bạn có thể nghe lại, thu lại từng bản hoặc nộp bài.';
        }
      } else {
        if (takesMaxNotice) takesMaxNotice.style.display = 'none';
        if (activeReplaceIndex === -1) {
          if (btnAddTake) btnAddTake.style.display = 'inline-flex';
          if (btnStartRecord) btnStartRecord.style.display = 'inline-flex';
          if (recorderStatusText) {
            recorderStatusText.textContent = `Bấm "+ Thêm bản ghi" hoặc "Bắt đầu ghi âm" để ghi Bản ghi ${total + 1}`;
          }
        }
      }
    }

    function resetRecordingUi() {
      recordedTakes.forEach(t => {
        if (t.objectUrl) URL.revokeObjectURL(t.objectUrl);
      });
      recordedTakes = [];
      activeReplaceIndex = -1;
      audioChunks = [];
      recordSeconds = 0;

      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
        activeStream = null;
      }

      if (recorderTimer) recorderTimer.innerHTML = '00:00 <span style="font-size: 13px; color: var(--text-muted); font-weight: normal;">/ 01:00</span>';
      if (recorderStatusText) recorderStatusText.textContent = 'Nhấn nút bên dưới để bắt đầu ghi Bản ghi 1';
      if (btnStartRecord) btnStartRecord.style.display = 'inline-flex';
      if (btnStopRecord) btnStopRecord.style.display = 'none';
      if (btnCancelRecord) btnCancelRecord.style.display = 'none';
      if (btnReRecord) btnReRecord.style.display = 'none';
      if (previewAudioContainer) previewAudioContainer.style.display = 'none';
      renderTakesList();
    }

    function stopRecordingCleanup() {
      if (recordTimerInterval) {
        clearInterval(recordTimerInterval);
        recordTimerInterval = null;
      }
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
        activeStream = null;
      }
      if (previewAudioPlayer) previewAudioPlayer.pause();
    }

    // Cảnh báo người dùng khi thoát hoặc tải lại trang nếu còn bản ghi chưa nộp
    window.addEventListener('beforeunload', (e) => {
      if (recordedTakes && recordedTakes.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Sự kiện đóng modal có kiểm tra bản ghi chưa nộp
    document.querySelectorAll('[data-close="modal-speaking-assignment"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (recordedTakes && recordedTakes.length > 0) {
          if (!confirm('Bạn có các bản ghi âm chưa nộp. Nếu đóng cửa sổ này, các bản ghi sẽ bị hủy. Bạn có chắc chắn muốn đóng?')) {
            e.stopPropagation();
            return;
          }
        }
        stopRecordingCleanup();
        resetRecordingUi();
        modalSpeaking.classList.remove('active');
      });
    });

    if (btnCancelRecord) {
      btnCancelRecord.addEventListener('click', () => {
        activeReplaceIndex = -1;
        btnCancelRecord.style.display = 'none';
        if (recorderTimer) recorderTimer.innerHTML = '00:00 <span style="font-size: 13px; color: var(--text-muted); font-weight: normal;">/ 01:00</span>';
        renderTakesList();
      });
    }

    if (btnAddTake) {
      btnAddTake.addEventListener('click', () => {
        if (recordedTakes.length >= 10) return;
        activeReplaceIndex = -1;
        if (btnCancelRecord) btnCancelRecord.style.display = 'none';
        if (btnStartRecord) {
          btnStartRecord.style.display = 'inline-flex';
          btnStartRecord.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          btnStartRecord.click();
        }
      });
    }

    async function openSpeakingModal(assign) {
      currentSpeakingAssign = assign;
      speakingModalTitle.textContent = `🎙️ ${assign.title}`;
      speakingModalDesc.textContent = assign.description || 'Đọc to rõ ràng câu/đoạn tiếng Trung bên dưới và nộp bản ghi âm để cô giáo chấm điểm.';
      speakingModalAlert.className = 'alert';
      speakingModalAlert.textContent = '';
      if (micPermissionGuide) micPermissionGuide.style.display = 'none';

      // Thiết lập thông tin hạn chót & XP
      if (speakingModalDue) {
        speakingModalDue.textContent = new Date(assign.due_date).toLocaleString('vi-VN', {
          hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
        });
      }
      if (speakingModalXp) {
        speakingModalXp.textContent = `+${assign.reward_xp || 30} XP`;
      }
      if (speakingModalLessonBox && speakingModalLesson) {
        if (assign.lesson) {
          speakingModalLessonBox.style.display = 'inline';
          speakingModalLesson.textContent = `Bài ${assign.lesson.order_index}: ${assign.lesson.title_zh}`;
        } else {
          speakingModalLessonBox.style.display = 'none';
        }
      }

      // Thiết lập đề bài chữ Hán & Pinyin
      speakingPromptHanzi.textContent = assign.speaking_prompt || assign.title;
      speakingPromptPinyin.textContent = assign.speaking_pinyin || '';

      // Audio đọc mẫu của giáo viên (nếu có)
      if (assign.speaking_sample_audio_url) {
        speakingSampleAudioBox.style.display = 'block';
        btnPlaySpeakingSample.onclick = () => {
          const sampleAudio = new Audio(assign.speaking_sample_audio_url);
          sampleAudio.play();
        };
      } else {
        speakingSampleAudioBox.style.display = 'none';
      }

      // Trạng thái bài nộp trước đó (nếu đã nộp)
      const sub = assign.submission;
      if (sub && sub.audio_url) {
        speakingPrevSubmissionInfo.style.display = 'block';
        const isGraded = (sub.status === 'graded');
        const scoreBadge = isGraded
          ? `<span class="badge-status badge-ongoing">🟢 Đã chấm: ${sub.score}/100</span>`
          : `<span class="badge-status badge-paused">🟡 Đã nộp (Chờ cô giáo chấm)</span>`;

        speakingPrevSubmissionInfo.innerHTML = `
          <div style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
            <span>📌 Bài nộp ghi âm của bạn:</span>
            ${scoreBadge}
          </div>
          ${isGraded ? `<div style="font-size: 13px; color: #16a34a; font-weight: 700; margin-bottom: 6px;">⚡ Điểm thưởng đạt được: +${Math.round((sub.score / 100) * (assign.reward_xp || 30))} XP</div>` : ''}

          <!-- Lời nhận xét bằng giọng nói của cô giáo (nếu có) -->
          ${sub.teacher_audio_url ? `
            <div style="margin: 10px 0; background: rgba(59, 130, 246, 0.08); border: 1.5px solid rgba(59, 130, 246, 0.3); border-radius: var(--radius-sm); padding: 10px 14px;">
              <div style="font-weight: 700; color: var(--primary); font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                🎙️ Nhận xét bằng giọng nói của cô giáo:
              </div>
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <button type="button" class="btn btn-primary btn-sm btn-play-teacher-voice" data-url="${sub.teacher_audio_url}">
                  ▶️ Nghe cô giáo nhận xét
                </button>
                <span class="teacher-voice-status" style="font-size: 12px; color: var(--text-muted); font-style: italic;"></span>
              </div>
            </div>
          ` : ''}

          <!-- Lời nhận xét bằng chữ (nếu có) -->
          ${sub.teacher_comment ? `
            <div style="color: var(--primary); font-weight: 600; margin: 8px 0; background: var(--bg-card); padding: 10px 14px; border-radius: 6px; border: 1px dashed var(--border-color); line-height: 1.5;">
              💬 Nhận xét của cô giáo: "${sub.teacher_comment}"
            </div>
          ` : ''}

          <!-- Danh sách các bản ghi âm con đã nộp -->
          <div style="margin-top: 12px;">
            <div style="font-weight: 700; font-size: 13px; color: var(--text-main); margin-bottom: 6px;">
              🎧 Các bản ghi âm bạn đã nộp:
            </div>
            <div id="prev-submitted-takes-list" style="display: flex; flex-direction: column; gap: 6px;">
              <div style="font-size: 12px; color: var(--text-muted); font-style: italic;">Đang tải danh sách bản ghi...</div>
            </div>
          </div>

          <div style="margin-top: 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            ${!isGraded ? `<button type="button" class="btn btn-outline btn-sm btn-toggle-rerecord" style="border-color: var(--warning); color: var(--warning);">🔄 Ghi âm nộp lại</button>` : ''}
          </div>
        `;

        // Tải danh sách takes từ database
        (async () => {
          const takesContainer = speakingPrevSubmissionInfo.querySelector('#prev-submitted-takes-list');
          if (!takesContainer) return;
          try {
            let takes = await window.Student.getSubmissionRecordings(sub.id);
            if (!takes || takes.length === 0) {
              takes = [{ id: 'default', position: 1, storage_path: sub.audio_url, duration_seconds: 0 }];
            }
            takesContainer.innerHTML = takes.map((t, idx) => `
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--bg-card); padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <strong style="font-size: 13px;">🎙️ Bản ghi ${t.position || idx + 1}</strong>
                  ${t.duration_seconds > 0 ? `<span style="font-size: 11px; color: var(--text-muted);">(${formatDuration(t.duration_seconds)})</span>` : ''}
                </div>
                <button type="button" class="btn btn-outline btn-sm btn-play-prev-take" data-url="${t.storage_path}" style="font-size: 12px; padding: 2px 10px;">
                  ▶️ Nghe
                </button>
              </div>
            `).join('');

            takesContainer.querySelectorAll('.btn-play-prev-take').forEach(btn => {
              btn.addEventListener('click', async () => {
                const rawUrl = btn.dataset.url;
                const origText = btn.textContent;
                btn.disabled = true;
                btn.textContent = '⏳...';
                try {
                  const playUrl = await window.Student.getRecordingPlayUrl(rawUrl);
                  const a = new Audio(playUrl);
                  a.play();
                  btn.textContent = '⏸️ Đang phát';
                  a.onended = () => { btn.textContent = origText; btn.disabled = false; };
                  a.onerror = () => { btn.textContent = 'Lỗi file'; btn.disabled = false; };
                } catch (err) {
                  alert('Lỗi nghe bản ghi: ' + (err.message || err));
                  btn.textContent = origText;
                  btn.disabled = false;
                }
              });
            });
          } catch (e) {
            takesContainer.innerHTML = `<div style="font-size: 12px; color: var(--danger);">Không thể nạp danh sách bản ghi: ${e.message || e}</div>`;
          }
        })();

        // Gắn sự kiện nghe nhận xét giọng nói của cô giáo
        const btnTeacherVoice = speakingPrevSubmissionInfo.querySelector('.btn-play-teacher-voice');
        if (btnTeacherVoice) {
          btnTeacherVoice.addEventListener('click', async () => {
            const rawUrl = btnTeacherVoice.dataset.url;
            const statusSpan = speakingPrevSubmissionInfo.querySelector('.teacher-voice-status');
            btnTeacherVoice.disabled = true;
            btnTeacherVoice.textContent = '⏳ Đang tải nhận xét...';
            if (statusSpan) statusSpan.textContent = 'Đang tải âm thanh...';
            try {
              const playUrl = await window.Student.getRecordingPlayUrl(rawUrl);
              const a = new Audio(playUrl);
              a.play();
              btnTeacherVoice.textContent = '⏸️ Đang nghe cô giáo...';
              if (statusSpan) statusSpan.textContent = 'Đang phát lời nhận xét';
              a.onended = () => {
                btnTeacherVoice.textContent = '▶️ Nghe lại nhận xét';
                btnTeacherVoice.disabled = false;
                if (statusSpan) statusSpan.textContent = 'Đã nghe xong';
              };
              a.onerror = () => {
                btnTeacherVoice.textContent = '▶️ Nghe cô giáo nhận xét';
                btnTeacherVoice.disabled = false;
                if (statusSpan) statusSpan.textContent = 'Lỗi phát file';
              };
            } catch (err) {
              alert('Không thể phát file nhận xét: ' + (err.message || err));
              btnTeacherVoice.textContent = '▶️ Nghe cô giáo nhận xét';
              btnTeacherVoice.disabled = false;
              if (statusSpan) statusSpan.textContent = '';
            }
          });
        }

        const btnToggleRe = speakingPrevSubmissionInfo.querySelector('.btn-toggle-rerecord');
        if (btnToggleRe) {
          btnToggleRe.addEventListener('click', () => {
            if (speakingRecordWrapper) speakingRecordWrapper.style.display = 'block';
            if (btnSubmitSpeaking) btnSubmitSpeaking.style.display = 'inline-flex';
            resetRecordingUi();
            btnToggleRe.style.display = 'none';
          });
        }

        // Nếu đã nộp và chưa yêu cầu ghi lại -> Ẩn khung ghi âm đi để tránh nộp trùng
        if (speakingRecordWrapper) {
          speakingRecordWrapper.style.display = 'none';
        }
        if (btnSubmitSpeaking) {
          btnSubmitSpeaking.style.display = 'none';
        }

      } else {
        speakingPrevSubmissionInfo.style.display = 'none';
        if (speakingRecordWrapper) speakingRecordWrapper.style.display = 'block';
        if (btnSubmitSpeaking) btnSubmitSpeaking.style.display = 'inline-flex';
        resetRecordingUi();
      }

      modalSpeaking.classList.add('active');
    }

    if (btnStartRecord) {
      btnStartRecord.addEventListener('click', async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
          speakingModalAlert.className = 'alert alert-danger show';
          speakingModalAlert.textContent = 'Trình duyệt của bạn không hỗ trợ ghi âm trực tiếp qua Micro. Vui lòng sử dụng Google Chrome, Microsoft Edge hoặc Safari phiên bản mới nhất.';
          return;
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          activeStream = stream;
          if (micPermissionGuide) micPermissionGuide.style.display = 'none';
          speakingModalAlert.className = 'alert';
          speakingModalAlert.textContent = '';

          // Tự động nhận diện định dạng nén tương thích cao nhất
          let mimeType = 'audio/webm;codecs=opus';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = 'audio/mp4';
              if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = '';
              }
            }
          }

          mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          audioChunks = [];

          mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) audioChunks.push(e.data);
          };

          mediaRecorder.onstop = () => {
            if (activeStream) {
              activeStream.getTracks().forEach(t => t.stop());
              activeStream = null;
            }

            const mime = mediaRecorder.mimeType || 'audio/webm';
            const blob = new Blob(audioChunks, { type: mime });

            // Kiểm tra dung lượng tối đa 5MB
            if (blob.size > 5 * 1024 * 1024) {
              alert(`Dung lượng bản ghi ${(blob.size / (1024 * 1024)).toFixed(1)}MB vượt quá giới hạn cho phép 5MB. Vui lòng ghi âm ngắn hơn.`);
              if (btnStartRecord) btnStartRecord.style.display = 'inline-flex';
              if (btnStopRecord) btnStopRecord.style.display = 'none';
              if (btnCancelRecord) btnCancelRecord.style.display = 'none';
              return;
            }

            const duration = Math.max(recordSeconds, 1);
            const objectUrl = URL.createObjectURL(blob);

            if (activeReplaceIndex >= 0 && activeReplaceIndex < recordedTakes.length) {
              // Ghi đè thay thế bản ghi được chọn
              if (recordedTakes[activeReplaceIndex].objectUrl) {
                URL.revokeObjectURL(recordedTakes[activeReplaceIndex].objectUrl);
              }
              recordedTakes[activeReplaceIndex].blob = blob;
              recordedTakes[activeReplaceIndex].mimeType = mime;
              recordedTakes[activeReplaceIndex].durationSeconds = duration;
              recordedTakes[activeReplaceIndex].objectUrl = objectUrl;
              delete recordedTakes[activeReplaceIndex].uploadedPath;
              activeReplaceIndex = -1;
            } else {
              // Thêm bản ghi mới
              recordedTakes.push({
                id: 'take_' + Date.now(),
                position: recordedTakes.length + 1,
                blob,
                mimeType: mime,
                durationSeconds: duration,
                objectUrl
              });
            }

            if (btnStartRecord) btnStartRecord.style.display = 'inline-flex';
            if (btnStopRecord) btnStopRecord.style.display = 'none';
            if (btnCancelRecord) btnCancelRecord.style.display = 'none';
            if (recorderTimer) {
              recorderTimer.innerHTML = '00:00 <span style="font-size: 13px; color: var(--text-muted); font-weight: normal;">/ 01:00</span>';
            }

            renderTakesList();
          };

          mediaRecorder.start(250); // Thu theo từng chunk 250ms
          recordSeconds = 0;
          btnStartRecord.style.display = 'none';
          btnStopRecord.style.display = 'inline-flex';
          if (btnCancelRecord) btnCancelRecord.style.display = 'none';

          const targetLabel = activeReplaceIndex >= 0
            ? `Bản ghi ${activeReplaceIndex + 1} (Ghi lại)`
            : `Bản ghi ${recordedTakes.length + 1}`;
          recorderStatusText.innerHTML = `<span style="color: var(--danger); font-weight: 700;">🔴 Đang thu âm cho ${targetLabel}... Hãy đọc to rõ ràng</span>`;

          // Bộ đếm thời gian (Tối đa 60 giây mỗi bản)
          recordTimerInterval = setInterval(() => {
            recordSeconds++;
            const mm = String(Math.floor(recordSeconds / 60)).padStart(2, '0');
            const ss = String(recordSeconds % 60).padStart(2, '0');
            recorderTimer.innerHTML = `<span style="color: var(--danger); font-weight: 800;">${mm}:${ss}</span> <span style="font-size: 13px; color: var(--text-muted); font-weight: normal;">/ 01:00</span>`;

            if (recordSeconds >= 60) {
              clearInterval(recordTimerInterval);
              recordTimerInterval = null;
              if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
              }
            }
          }, 1000);

        } catch (err) {
          console.error('Lỗi truy cập Microphone:', err);
          if (micPermissionGuide) micPermissionGuide.style.display = 'block';
          speakingModalAlert.className = 'alert alert-danger show';
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            speakingModalAlert.textContent = '⚠️ Quyền Microphone bị từ chối! Vui lòng bấm vào biểu tượng 🔒 trên thanh địa chỉ của trình duyệt, chọn Cho phép (Allow) Microphone và thử lại.';
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            speakingModalAlert.textContent = '⚠️ Không tìm thấy thiết bị Microphone trên máy tính/điện thoại của bạn!';
          } else {
            speakingModalAlert.textContent = 'Không thể truy cập Microphone: ' + (err.message || 'Micro đang bận hoặc bị từ chối.');
          }
        }
      });
    }

    if (btnStopRecord) {
      btnStopRecord.addEventListener('click', () => {
        if (recordTimerInterval) {
          clearInterval(recordTimerInterval);
          recordTimerInterval = null;
        }
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      });
    }

    if (btnReRecord) {
      btnReRecord.addEventListener('click', () => {
        resetRecordingUi();
      });
    }

    if (btnSubmitSpeaking) {
      btnSubmitSpeaking.addEventListener('click', async () => {
        if (!recordedTakes || recordedTakes.length === 0 || !currentSpeakingAssign) {
          alert('Vui lòng thực hiện ít nhất 1 bản ghi âm trước khi nộp bài!');
          return;
        }

        try {
          btnSubmitSpeaking.disabled = true;
          speakingModalAlert.className = 'alert';
          speakingModalAlert.textContent = '';

          const studentId = authData.user.id;
          const totalTakes = recordedTakes.length;
          const uploadedTakes = [];

          // 1. Tải tuần tự từng file lên Supabase Storage với chỉ báo tiến độ (có cache đường dẫn khi thử nộp lại)
          for (let i = 0; i < totalTakes; i++) {
            const take = recordedTakes[i];
            btnSubmitSpeaking.textContent = `⏳ Đang tải ${i + 1}/${totalTakes} bản ghi...`;
            speakingModalAlert.className = 'alert alert-info show';
            speakingModalAlert.textContent = `Đang tải Bản ghi ${i + 1}/${totalTakes} lên máy chủ...`;

            try {
              if (!take.uploadedPath) {
                const uploadRes = await window.Student.uploadRecordingAudio(
                  take.blob,
                  studentId,
                  `take_${take.position || (i + 1)}`
                );
                take.uploadedPath = uploadRes.path;
                take.mimeType = uploadRes.mime_type || take.mimeType;
              }
              uploadedTakes.push({
                position: take.position || (i + 1),
                storage_path: take.uploadedPath,
                mime_type: take.mimeType || 'audio/webm',
                duration_seconds: take.durationSeconds || 0
              });
            } catch (upErr) {
              console.error(`Lỗi tải Bản ghi ${take.position || (i + 1)}:`, upErr);
              throw new Error(`Tải Bản ghi ${take.position || (i + 1)} thất bại: ${upErr.message || upErr}. Các bản ghi của bạn vẫn được giữ nguyên, hãy bấm "Thử nộp lại".`);
            }
          }

          // 2. Gửi danh sách tất cả các bản ghi vào database
          btnSubmitSpeaking.textContent = '⏳ Đang lưu bài nộp và nhận XP...';
          speakingModalAlert.textContent = 'Đang hoàn tất nộp bài và cập nhật điểm thưởng...';

          const primaryPath = (uploadedTakes[0] && uploadedTakes[0].storage_path) ? uploadedTakes[0].storage_path : '';
          const res = await window.Student.submitSpeakingAssignment(
            currentSpeakingAssign.id,
            primaryPath,
            uploadedTakes
          );

          const xpBonusText = res.xp_awarded > 0 ? ` Bạn đã được thưởng +${res.xp_awarded} XP!` : '';
          speakingModalAlert.className = 'alert alert-success show';
          speakingModalAlert.textContent = '🎉 ' + (res.message || 'Đã nộp bài ghi âm thành công!') + xpBonusText;

          btnSubmitSpeaking.textContent = '✅ Đã nộp thành công';

          // Dọn dẹp bộ nhớ tạm
          recordedTakes.forEach(t => {
            if (t.objectUrl) URL.revokeObjectURL(t.objectUrl);
          });
          recordedTakes = [];

          // Cập nhật lại danh sách bài tập trên dashboard
          await loadDashboardAssignments();

          // Cập nhật lại XP hiển thị trên trang nếu được cộng điểm
          if (res.xp_awarded > 0 && typeof window.Auth.getProfile === 'function') {
            try {
              const updatedProfile = await window.Auth.getProfile(authData.user.id);
              if (updatedProfile) {
                window.Auth.renderNavbarUserInfo(updatedProfile);
                const statXp = document.getElementById('stat-lifetime-xp');
                if (statXp) statXp.textContent = (updatedProfile.lifetime_xp || 0).toLocaleString();
              }
            } catch (e) {}
          }

          if (window.FeedbackPopup) {
            window.FeedbackPopup.show('speaking', {
              onContinue: () => {
                modalSpeaking.classList.remove('active');
              }
            });
          } else {
            setTimeout(() => {
              modalSpeaking.classList.remove('active');
            }, 1800);
          }

        } catch (err) {
          speakingModalAlert.className = 'alert alert-danger show';
          speakingModalAlert.textContent = err.message || 'Lỗi khi nộp bài ghi âm';
          btnSubmitSpeaking.disabled = false;
          btnSubmitSpeaking.textContent = `Thử nộp lại (${recordedTakes.length} bản ghi)`;
        }
      });
    }

    // Tải danh sách bài tập lần đầu
    await loadDashboardAssignments();

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
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px 14px;">
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
              ${h.note ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 4px; font-style: italic;">Ghi chú: ${h.note}</div>` : ''}
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
