/**
 * GIAO DIỆN LÀM BÀI & KẾT QUẢ BÀI TẬP TỰ SOẠN (HỌC VIÊN + XEM TRƯỚC GIÁO VIÊN)
 * - Hỗ trợ 6 dạng: Trắc nghiệm, Đúng/Sai, Điền từ (gõ / ngân hàng từ / kéo thả),
 *   Dịch câu, Sắp xếp từ (chạm / kéo thả), Nối cặp (Quizlet Match)
 * - Tự lưu tiến độ nháp giữa chừng, đồng hồ đếm ngược, phản hồi tức thì (nếu bật),
 *   kết quả chi tiết, làm lại & ôn lại các câu sai.
 * - Tối ưu thao tác chạm trên điện thoại 375px; escape toàn bộ text người dùng.
 */
window.StudentCustomAssignment = (function () {
  'use strict';

  function S() {
    return window.CustomAssignmentShared;
  }

  let modalSession = {
    assignmentId: null,
    onSubmittedCallback: null,
    timerInterval: null
  };

  function el(id) {
    return document.getElementById(id);
  }

  function clearActiveTimer() {
    if (modalSession.timerInterval) {
      clearInterval(modalSession.timerInterval);
      modalSession.timerInterval = null;
    }
  }

  function formatCountdown(totalSec) {
    const s = Math.max(0, parseInt(totalSec, 10) || 0);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function formatVnTime(isoStr) {
    if (!isoStr) return '--';
    try {
      return new Date(isoStr).toLocaleString('vi-VN', {
        hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
      });
    } catch (_) {
      return '';
    }
  }

  // ---------------------------------------------------------------------------
  // TRÌNH CHƠI BÀI DÙNG CHUNG CHO HỌC VIÊN (LIVE) VÀ GIÁO VIÊN (PREVIEW)
  // ---------------------------------------------------------------------------
  function mountInteractivePlayer(rootContainer, {
    mode = 'live', // 'live' | 'preview' | 'mistake_review'
    title = 'Bài tập tự soạn',
    settings = {},
    questions = [],
    attemptId = null,
    initialDraft = {},
    initialRemainingSeconds = null,
    onExit = null,
    onCompleted = null
  }) {
    const shared = S();
    clearActiveTimer();

    // Tách bản lưu _checked (nếu server trả về ở chế độ immediate) khỏi draft câu trả lời
    const serverChecked = (initialDraft && initialDraft._checked) ? { ...initialDraft._checked } : {};
    const answers = { ...(initialDraft || {}) };
    delete answers._checked;

    let currentIdx = 0;
    let activeBlankFocusIdx = 0;
    let activeMatchLeftId = null;
    let remainingSec = initialRemainingSeconds;
    let saveDraftTimer = null;
    let isSubmitting = false;

    const revealMode = settings.answer_reveal_mode || 'after_submit';
    if (mode === 'live' && window.StudyTimer) {
      window.StudyTimer.pushActivity('assignment_custom');
    }

    function scheduleDraftSave(immediateFlush = false) {
      if (mode !== 'live' || !attemptId) return;
      if (saveDraftTimer) clearTimeout(saveDraftTimer);

      const doSave = async () => {
        try {
          const statusEl = rootContainer.querySelector('.ca-save-status');
          if (statusEl) statusEl.textContent = '💾 Đang lưu nháp...';
          await window.Student.saveCustomAttemptDraft(attemptId, answers);
          if (statusEl) {
            const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            statusEl.textContent = `✓ Đã lưu nháp (${nowStr})`;
          }
        } catch (err) {
          const statusEl = rootContainer.querySelector('.ca-save-status');
          if (statusEl) statusEl.textContent = '⚠️ Chưa đồng bộ nháp';
        }
      };

      if (immediateFlush) {
        doSave();
      } else {
        saveDraftTimer = setTimeout(doSave, 700);
      }
    }

    function isQuestionAnswered(q) {
      const resp = answers[q.id];
      if (!resp) return false;
      if (q.question_type === 'mcq') return Array.isArray(resp.selected_option_ids) && resp.selected_option_ids.length > 0;
      if (q.question_type === 'true_false') return typeof resp.selected_boolean === 'boolean';
      if (q.question_type === 'fill_blank') return Array.isArray(resp.values) && resp.values.some(v => String(v || '').trim() !== '');
      if (q.question_type === 'translation') return String(resp.text || '').trim() !== '';
      if (q.question_type === 'word_order') return Array.isArray(resp.ordered_token_ids) && resp.ordered_token_ids.length > 0;
      if (q.question_type === 'matching') return Array.isArray(resp.matched_pairs) && resp.matched_pairs.length > 0;
      return false;
    }

    if (mode === 'live' && remainingSec !== null && remainingSec !== undefined) {
      modalSession.timerInterval = setInterval(() => {
        remainingSec = Math.max(0, remainingSec - 1);
        const tEl = rootContainer.querySelector('.ca-timer-val');
        if (tEl) {
          tEl.textContent = formatCountdown(remainingSec);
          if (remainingSec <= 60) tEl.style.color = 'var(--danger)';
        }
        if (remainingSec <= 0) {
          clearActiveTimer();
          handleSubmitAttempt(true);
        }
      }, 1000);
    }

    function renderFrame() {
      const q = questions[currentIdx];
      if (!q) return;
      const tMeta = shared.QUESTION_TYPES[q.question_type] || { icon: '❓', shortLabel: q.question_type };
      const checkedInfo = serverChecked[q.id] || null;
      const isLockedAfterCheck = Boolean(checkedInfo);

      const answeredCount = questions.filter(isQuestionAnswered).length;
      const pctProgress = Math.round(((currentIdx + 1) / Math.max(1, questions.length)) * 100);

      rootContainer.innerHTML = `
        <div class="ca-player-wrap">
          <div class="ca-player-topbar">
            <div>
              <div style="font-size: 12px; color: var(--text-muted); font-weight: 700;">
                ${mode === 'preview' ? '👁️ CHẾ ĐỘ XEM TRƯỚC' : (mode === 'mistake_review' ? '🧠 ÔN LẠI CÁC CÂU SAI' : '🧩 LÀM BÀI TỰ SOẠN')}
              </div>
              <div style="font-weight: 800; font-size: 15px; color: var(--text-main);">${shared.escapeHtml(title)}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              ${(mode === 'live' && remainingSec !== null) ? `
                <span class="ca-timer-pill">⏱️ <strong class="ca-timer-val">${formatCountdown(remainingSec)}</strong></span>
              ` : ''}
              ${mode === 'live' ? `<span class="ca-save-status" style="font-size: 11.5px; color: var(--text-muted);">💾 Tự lưu tiến độ</span>` : ''}
              ${onExit ? `<button type="button" class="btn btn-outline btn-sm ca-btn-exit-player" style="font-size: 12px;">Thoát</button>` : ''}
            </div>
          </div>

          <!-- Thanh tiến độ & bản đồ câu -->
          <div style="margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); font-weight: 600; margin-bottom: 4px;">
              <span>Câu ${currentIdx + 1} / ${questions.length} (${tMeta.icon} ${shared.escapeHtml(tMeta.shortLabel)} · ${q.points || 1}đ)</span>
              <span>Đã làm: ${answeredCount}/${questions.length}</span>
            </div>
            <div class="progress-bar-container" style="height: 7px; margin: 0 0 8px 0;">
              <div class="progress-bar-fill" style="width: ${pctProgress}%;"></div>
            </div>
            <div class="ca-nav-dots">
              ${questions.map((item, di) => {
                const done = isQuestionAnswered(item);
                const chk = serverChecked[item.id];
                let extraCls = '';
                if (chk) extraCls = chk.is_correct ? 'is-right' : 'is-wrong';
                else if (done) extraCls = 'is-answered';
                return `<button type="button" class="ca-nav-dot ${di === currentIdx ? 'is-current' : ''} ${extraCls}" data-didx="${di}">${di + 1}</button>`;
              }).join('')}
            </div>
          </div>

          <div class="ca-play-alert alert"></div>

          <!-- Nội dung câu hỏi hiện tại -->
          <div class="ca-question-stage">
            <div class="ca-question-prompt-box" id="ca-stage-prompt"></div>
            <div id="ca-stage-body"></div>
          </div>

          <!-- Phản hồi tức thì (nếu bật immediate hoặc mistake_review) -->
          <div id="ca-immediate-feedback-box"></div>

          <!-- Điều hướng câu & Nộp bài -->
          <div class="ca-player-footer">
            <button type="button" class="btn btn-secondary ca-btn-prev-q" ${currentIdx === 0 ? 'disabled' : ''}>← Trước</button>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; flex: 1;">
              ${((revealMode === 'immediate' || mode === 'mistake_review') && !isLockedAfterCheck) ? `
                <button type="button" class="btn btn-outline ca-btn-check-now">🔍 Kiểm tra câu này</button>
              ` : ''}
              ${currentIdx < questions.length - 1 ? `
                <button type="button" class="btn btn-primary ca-btn-next-q">Câu tiếp →</button>
              ` : `
                <button type="button" class="btn btn-primary ca-btn-submit-all">
                  ${mode === 'mistake_review' ? '✅ Hoàn thành ôn tập' : (mode === 'preview' ? '🏁 Xem kết quả thử' : '📤 Nộp bài & Chấm điểm')}
                </button>
              `}
            </div>
          </div>
        </div>
      `;

      const promptBox = rootContainer.querySelector('#ca-stage-prompt');
      const bodyHost = rootContainer.querySelector('#ca-stage-body');

      // Render câu hỏi tương ứng theo 6 dạng
      renderQuestionWidget(q, promptBox, bodyHost, isLockedAfterCheck);

      if (checkedInfo) {
        renderImmediateFeedbackBox(q, checkedInfo);
      }

      // Bind điều hướng
      rootContainer.querySelectorAll('.ca-nav-dot').forEach(btn => {
        btn.addEventListener('click', () => {
          currentIdx = parseInt(btn.dataset.didx, 10);
          activeBlankFocusIdx = 0;
          activeMatchLeftId = null;
          scheduleDraftSave(true);
          renderFrame();
        });
      });

      const prevBtn = rootContainer.querySelector('.ca-btn-prev-q');
      if (prevBtn) prevBtn.addEventListener('click', () => {
        if (currentIdx > 0) {
          currentIdx--;
          activeBlankFocusIdx = 0;
          activeMatchLeftId = null;
          scheduleDraftSave(true);
          renderFrame();
        }
      });

      const nextBtn = rootContainer.querySelector('.ca-btn-next-q');
      if (nextBtn) nextBtn.addEventListener('click', () => {
        if (currentIdx < questions.length - 1) {
          currentIdx++;
          activeBlankFocusIdx = 0;
          activeMatchLeftId = null;
          scheduleDraftSave(true);
          renderFrame();
        }
      });

      const checkBtn = rootContainer.querySelector('.ca-btn-check-now');
      if (checkBtn) checkBtn.addEventListener('click', () => handleCheckCurrentQuestion(q, checkBtn));

      const submitBtn = rootContainer.querySelector('.ca-btn-submit-all');
      if (submitBtn) submitBtn.addEventListener('click', () => handleSubmitAttempt(false));

      const exitBtn = rootContainer.querySelector('.ca-btn-exit-player');
      if (exitBtn && onExit) exitBtn.addEventListener('click', () => {
        scheduleDraftSave(true);
        clearActiveTimer();
        onExit();
      });
    }

    function renderImmediateFeedbackBox(q, chk) {
      const box = rootContainer.querySelector('#ca-immediate-feedback-box');
      if (!box || !chk) return;
      let cls = 'is-wrong';
      let titleTxt = '❌ Chưa chính xác';
      if (chk.needs_manual_grading) {
        cls = 'is-pending';
        titleTxt = '⏳ Câu này sẽ được giáo viên chấm tay sau khi nộp';
      } else if (chk.is_correct) {
        cls = 'is-right';
        titleTxt = `✅ Chính xác! (+${chk.points_earned}/${q.points || 1}đ)`;
      }
      const expText = shared.safeStr(chk.explanation, '');
      const ansText = formatExpectedAnswerText(q, chk.answer_payload);

      box.innerHTML = `
        <div class="ca-feedback-card ${cls}">
          <div style="font-weight: 800; margin-bottom: 4px;">${shared.escapeHtml(titleTxt)}</div>
          ${(!chk.is_correct && ansText) ? `<div style="font-size: 13px; margin-bottom: 4px;">Đáp án đúng: <strong>${shared.escapeHtml(ansText)}</strong></div>` : ''}
          ${expText ? `<div style="font-size: 13px; opacity: 0.95;">💡 ${shared.escapeHtml(expText)}</div>` : ''}
        </div>
      `;
    }

    function renderQuestionWidget(q, promptBox, bodyHost, isLocked) {
      const qp = q.question_payload || {};
      const curResp = answers[q.id] || {};

      if (q.question_type !== 'fill_blank') {
        promptBox.innerHTML = `<div class="ca-prompt-text">${shared.escapeHtml(q.prompt_text)}</div>`;
      }

      if (q.question_type === 'mcq') {
        const allowMulti = Boolean(qp.allow_multiple);
        const opts = Array.isArray(qp.options) ? qp.options : [];
        const selectedSet = new Set(Array.isArray(curResp.selected_option_ids) ? curResp.selected_option_ids : []);

        bodyHost.innerHTML = `
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
            ${allowMulti ? '☑️ Có thể chọn nhiều đáp án đúng' : '🔘 Chọn một đáp án đúng'}
          </div>
          <div class="ca-options-grid">
            ${opts.map((opt, oi) => {
              const isSel = selectedSet.has(opt.id);
              return `
                <button type="button" class="ca-opt-btn ${isSel ? 'is-selected' : ''}" data-opt-id="${shared.escapeHtml(opt.id)}" ${isLocked ? 'disabled' : ''}>
                  <span class="ca-opt-letter">${String.fromCharCode(65 + oi)}</span>
                  <span class="ca-opt-label">${shared.escapeHtml(opt.text)}</span>
                </button>
              `;
            }).join('')}
          </div>
        `;

        if (!isLocked) {
          bodyHost.querySelectorAll('.ca-opt-btn').forEach(btn => btn.addEventListener('click', () => {
            const oid = btn.dataset.optId;
            if (allowMulti) {
              const set = new Set(Array.isArray(answers[q.id] && answers[q.id].selected_option_ids) ? answers[q.id].selected_option_ids : []);
              if (set.has(oid)) set.delete(oid); else set.add(oid);
              answers[q.id] = { selected_option_ids: Array.from(set) };
            } else {
              answers[q.id] = { selected_option_ids: [oid] };
            }
            scheduleDraftSave(false);
            renderFrame();
          }));
        }
        return;
      }

      if (q.question_type === 'true_false') {
        const sel = curResp.selected_boolean;
        bodyHost.innerHTML = `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <button type="button" class="ca-tf-btn ${sel === true ? 'is-selected' : ''}" data-val="true" ${isLocked ? 'disabled' : ''}>✅ Đúng</button>
            <button type="button" class="ca-tf-btn ${sel === false ? 'is-selected' : ''}" data-val="false" ${isLocked ? 'disabled' : ''}>❌ Sai</button>
          </div>
        `;
        if (!isLocked) {
          bodyHost.querySelectorAll('.ca-tf-btn').forEach(btn => btn.addEventListener('click', () => {
            answers[q.id] = { selected_boolean: btn.dataset.val === 'true' };
            scheduleDraftSave(false);
            renderFrame();
          }));
        }
        return;
      }

      if (q.question_type === 'fill_blank') {
        const parts = String(q.prompt_text || '').split('___');
        const blankCount = Math.max(0, parts.length - 1);
        const vals = Array.isArray(curResp.values) ? [...curResp.values] : new Array(blankCount).fill('');
        while (vals.length < blankCount) vals.push('');

        const fbMode = qp.input_mode || 'both';
        const wordBank = Array.isArray(qp.word_bank) ? qp.word_bank : [];

        let sentenceHtml = '';
        for (let i = 0; i < parts.length; i++) {
          sentenceHtml += shared.escapeHtml(parts[i]);
          if (i < blankCount) {
            const val = shared.safeStr(vals[i], '');
            if (fbMode === 'word_bank') {
              sentenceHtml += `<button type="button" class="ca-blank-drop-btn ${i === activeBlankFocusIdx ? 'is-focused' : ''} ${val ? 'is-filled' : ''}" data-bidx="${i}" ${isLocked ? 'disabled' : ''}>${val ? shared.escapeHtml(val) + (isLocked ? '' : ' ×') : `Chỗ #${i + 1}`}</button>`;
            } else {
              sentenceHtml += `<input type="text" class="ca-blank-inline-input ${i === activeBlankFocusIdx ? 'is-focused' : ''}" data-bidx="${i}" value="${shared.escapeHtml(val)}" placeholder="Điền #${i + 1}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" ${isLocked ? 'disabled' : ''}>`;
            }
          }
        }
        promptBox.innerHTML = `<div class="ca-prompt-text" style="line-height: 2.1;">${sentenceHtml}</div>`;

        const flagsHints = [];
        if (qp.ignore_pinyin_tones) flagsHints.push('Chấp nhận Pinyin không dấu thanh');
        if (qp.ignore_case !== false) flagsHints.push('Không phân biệt hoa/thường');

        bodyHost.innerHTML = `
          ${flagsHints.length > 0 ? `<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">💡 ${flagsHints.join(' · ')}</div>` : ''}
          ${(fbMode === 'word_bank' || fbMode === 'both') && wordBank.length > 0 ? `
            <div class="ca-wordbank-box">
              <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 8px;">
                Ngân hàng từ (chạm để điền hoặc kéo thả vào chỗ trống #${Math.min(blankCount, activeBlankFocusIdx + 1)}):
              </div>
              <div class="ca-chip-pool">
                ${wordBank.map((w, wi) => `
                  <button type="button" class="ca-word-chip" draggable="${!isLocked}" data-word="${shared.escapeHtml(w)}" data-wi="${wi}" ${isLocked ? 'disabled' : ''}>
                    ${shared.escapeHtml(w)}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}
        `;

        if (!isLocked) {
          const writeBlankVal = (bi, val) => {
            const nextVals = Array.isArray(answers[q.id] && answers[q.id].values) ? [...answers[q.id].values] : new Array(blankCount).fill('');
            while (nextVals.length < blankCount) nextVals.push('');
            nextVals[bi] = val;
            answers[q.id] = { values: nextVals };
            scheduleDraftSave(false);
          };

          promptBox.querySelectorAll('.ca-blank-inline-input').forEach(inp => {
            const bi = parseInt(inp.dataset.bidx, 10);
            inp.addEventListener('focus', () => { activeBlankFocusIdx = bi; });
            inp.addEventListener('input', () => writeBlankVal(bi, inp.value));
            inp.addEventListener('dragover', (e) => e.preventDefault());
            inp.addEventListener('drop', (e) => {
              e.preventDefault();
              const droppedWord = e.dataTransfer.getData('text/plain');
              if (droppedWord) {
                writeBlankVal(bi, droppedWord);
                renderFrame();
              }
            });
          });

          promptBox.querySelectorAll('.ca-blank-drop-btn').forEach(btn => {
            const bi = parseInt(btn.dataset.bidx, 10);
            btn.addEventListener('click', () => {
              if (vals[bi]) {
                writeBlankVal(bi, '');
                activeBlankFocusIdx = bi;
              } else {
                activeBlankFocusIdx = bi;
              }
              renderFrame();
            });
            btn.addEventListener('dragover', (e) => e.preventDefault());
            btn.addEventListener('drop', (e) => {
              e.preventDefault();
              const droppedWord = e.dataTransfer.getData('text/plain');
              if (droppedWord) {
                writeBlankVal(bi, droppedWord);
                renderFrame();
              }
            });
          });

          bodyHost.querySelectorAll('.ca-word-chip').forEach(chip => {
            const wordText = chip.dataset.word;
            chip.addEventListener('dragstart', (e) => {
              e.dataTransfer.setData('text/plain', wordText);
            });
            chip.addEventListener('click', () => {
              const curVals = Array.isArray(answers[q.id] && answers[q.id].values) ? [...answers[q.id].values] : new Array(blankCount).fill('');
              let targetBi = (activeBlankFocusIdx >= 0 && activeBlankFocusIdx < blankCount) ? activeBlankFocusIdx : 0;
              if (curVals[targetBi]) {
                const firstEmpty = curVals.findIndex(v => !String(v || '').trim());
                if (firstEmpty >= 0) targetBi = firstEmpty;
              }
              writeBlankVal(targetBi, wordText);
              const nextEmpty = curVals.findIndex((v, idx) => idx !== targetBi && !String(v || '').trim());
              if (nextEmpty >= 0) activeBlankFocusIdx = nextEmpty;
              renderFrame();
            });
          });
        }
        return;
      }

      if (q.question_type === 'translation') {
        const dirLabel = qp.direction === 'zh_to_vi' ? '🇨🇳 → 🇻🇳 Dịch sang tiếng Việt' : '🇻🇳 → 🇨🇳 Dịch sang tiếng Trung';
        const val = shared.safeStr(curResp.text, '');
        bodyHost.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
            <span class="import-badge-pill">${dirLabel}</span>
            ${qp.requires_manual_grading ? '<span class="import-badge-pill is-warn">👩‍🏫 Giáo viên sẽ chấm trực tiếp</span>' : '<span style="font-size: 12px; color: var(--text-muted);">Hỗ trợ gõ tiếng Trung & không bắt buộc dấu câu</span>'}
          </div>
          <textarea class="form-control ca-trans-textarea" rows="3" placeholder="Nhập câu dịch của bạn..." autocomplete="off" autocorrect="off" spellcheck="false" ${isLocked ? 'disabled' : ''} style="font-size: 16px; line-height: 1.5; font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;">${shared.escapeHtml(val)}</textarea>
        `;
        if (!isLocked) {
          const ta = bodyHost.querySelector('.ca-trans-textarea');
          if (ta) {
            ta.addEventListener('input', () => {
              answers[q.id] = { text: ta.value };
              scheduleDraftSave(false);
            });
          }
        }
        return;
      }

      if (q.question_type === 'word_order') {
        const pool = Array.isArray(qp.shuffled_tokens) ? qp.shuffled_tokens : [];
        const poolMap = new Map(pool.map(t => [t.id, t.text]));
        const pickedIds = Array.isArray(curResp.ordered_token_ids) ? curResp.ordered_token_ids : [];
        const pickedSet = new Set(pickedIds);

        bodyHost.innerHTML = `
          <div style="margin-bottom: 12px;">
            <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">Câu bạn đang ghép (chạm mảnh để bỏ ra hoặc dùng ◀ ▶ đổi vị trí):</div>
            <div class="ca-word-tray">
              ${pickedIds.length === 0 ? '<span style="font-size: 13px; color: var(--text-light);">Chạm các mảnh từ ở bên dưới theo đúng thứ tự...</span>' : pickedIds.map((tid, pi) => `
                <div class="ca-tray-item">
                  ${(!isLocked && pi > 0) ? `<button type="button" class="ca-tray-step" data-pi="${pi}" data-dir="-1" title="Sang trái">◀</button>` : ''}
                  <button type="button" class="ca-tray-chip" data-pi="${pi}" ${isLocked ? 'disabled' : ''}>${shared.escapeHtml(poolMap.get(tid) || tid)}${isLocked ? '' : ' ×'}</button>
                  ${(!isLocked && pi < pickedIds.length - 1) ? `<button type="button" class="ca-tray-step" data-pi="${pi}" data-dir="1" title="Sang phải">▶</button>` : ''}
                </div>
              `).join('')}
            </div>
          </div>

          <div>
            <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">Kho mảnh từ:</div>
            <div class="ca-chip-pool">
              ${pool.map(tok => {
                const isUsed = pickedSet.has(tok.id);
                return `
                  <button type="button" class="ca-word-chip ${isUsed ? 'is-used' : ''}" data-tid="${shared.escapeHtml(tok.id)}" ${isLocked || isUsed ? 'disabled' : ''}>
                    ${shared.escapeHtml(tok.text)}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;

        if (!isLocked) {
          bodyHost.querySelectorAll('.ca-word-chip:not(.is-used)').forEach(btn => btn.addEventListener('click', () => {
            const nextIds = [...pickedIds, btn.dataset.tid];
            answers[q.id] = { ordered_token_ids: nextIds };
            scheduleDraftSave(false);
            renderFrame();
          }));
          bodyHost.querySelectorAll('.ca-tray-chip').forEach(btn => btn.addEventListener('click', () => {
            const pi = parseInt(btn.dataset.pi, 10);
            const nextIds = [...pickedIds];
            nextIds.splice(pi, 1);
            answers[q.id] = { ordered_token_ids: nextIds };
            scheduleDraftSave(false);
            renderFrame();
          }));
          bodyHost.querySelectorAll('.ca-tray-step').forEach(btn => btn.addEventListener('click', () => {
            const pi = parseInt(btn.dataset.pi, 10);
            const delta = parseInt(btn.dataset.dir, 10);
            const target = pi + delta;
            if (target < 0 || target >= pickedIds.length) return;
            const nextIds = [...pickedIds];
            [nextIds[pi], nextIds[target]] = [nextIds[target], nextIds[pi]];
            answers[q.id] = { ordered_token_ids: nextIds };
            scheduleDraftSave(false);
            renderFrame();
          }));
        }
        return;
      }

      if (q.question_type === 'matching') {
        const leftItems = Array.isArray(qp.left_items) ? qp.left_items : [];
        const rightItems = Array.isArray(qp.right_items) ? qp.right_items : [];
        const matchedPairs = Array.isArray(curResp.matched_pairs) ? curResp.matched_pairs : [];

        const pairColors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#64748b'];
        const leftToColorIdx = new Map();
        const rightToColorIdx = new Map();
        const leftToPairNum = new Map();
        const rightToPairNum = new Map();
        matchedPairs.forEach((p, idx) => {
          leftToColorIdx.set(p.left_id, idx);
          rightToColorIdx.set(p.right_id, idx);
          leftToPairNum.set(p.left_id, idx + 1);
          rightToPairNum.set(p.right_id, idx + 1);
        });

        bodyHost.innerHTML = `
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
            Chạm 1 thẻ ở <strong>Cột trái</strong> rồi chạm thẻ tương ứng ở <strong>Cột phải</strong> để nối (chạm thẻ đã nối để gỡ cặp).
          </div>
          <div class="ca-matching-grid">
            <div class="ca-matching-col">
              ${leftItems.map(item => {
                const pIdx = leftToColorIdx.get(item.id);
                const pNum = leftToPairNum.get(item.id);
                const isActive = activeMatchLeftId === item.id;
                const borderStyle = pIdx !== undefined ? `border-color: ${pairColors[pIdx % pairColors.length]};` : '';
                return `
                  <button type="button" class="ca-match-card ${isActive ? 'is-active' : ''} ${pNum ? 'is-paired' : ''}" style="${borderStyle}" data-side="left" data-id="${shared.escapeHtml(item.id)}" ${isLocked ? 'disabled' : ''}>
                    <span class="ca-match-text">${shared.escapeHtml(item.text)}</span>
                    ${pNum ? `<span class="ca-match-badge" style="background: ${pairColors[pIdx % pairColors.length]};">#${pNum}</span>` : ''}
                  </button>
                `;
              }).join('')}
            </div>
            <div class="ca-matching-col">
              ${rightItems.map(item => {
                const pIdx = rightToColorIdx.get(item.id);
                const pNum = rightToPairNum.get(item.id);
                const borderStyle = pIdx !== undefined ? `border-color: ${pairColors[pIdx % pairColors.length]};` : '';
                return `
                  <button type="button" class="ca-match-card ${pNum ? 'is-paired' : ''}" style="${borderStyle}" data-side="right" data-id="${shared.escapeHtml(item.id)}" ${isLocked ? 'disabled' : ''}>
                    <span class="ca-match-text">${shared.escapeHtml(item.text)}</span>
                    ${pNum ? `<span class="ca-match-badge" style="background: ${pairColors[pIdx % pairColors.length]};">#${pNum}</span>` : ''}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;

        if (!isLocked) {
          bodyHost.querySelectorAll('.ca-match-card').forEach(card => card.addEventListener('click', () => {
            const side = card.dataset.side;
            const itemId = card.dataset.id;

            if (side === 'left') {
              if (leftToPairNum.has(itemId)) {
                answers[q.id] = { matched_pairs: matchedPairs.filter(p => p.left_id !== itemId) };
                activeMatchLeftId = null;
                scheduleDraftSave(false);
              } else {
                activeMatchLeftId = (activeMatchLeftId === itemId) ? null : itemId;
              }
              renderFrame();
              return;
            }

            // Click Right
            if (activeMatchLeftId) {
              const filtered = matchedPairs.filter(p => p.left_id !== activeMatchLeftId && p.right_id !== itemId);
              filtered.push({ left_id: activeMatchLeftId, right_id: itemId });
              answers[q.id] = { matched_pairs: filtered };
              activeMatchLeftId = null;
              scheduleDraftSave(false);
              renderFrame();
            } else if (rightToPairNum.has(itemId)) {
              answers[q.id] = { matched_pairs: matchedPairs.filter(p => p.right_id !== itemId) };
              scheduleDraftSave(false);
              renderFrame();
            }
          }));
        }
      }
    }

    async function handleCheckCurrentQuestion(q, btn) {
      const resp = answers[q.id] || {};
      if (mode === 'mistake_review' || mode === 'preview') {
        const res = shared.gradeQuestionClientPreview(q, resp);
        serverChecked[q.id] = {
          ...res,
          answer_payload: q.answer_payload,
          explanation: q.explanation
        };
        renderFrame();
        return;
      }

      try {
        btn.disabled = true;
        btn.textContent = '⏳ Đang kiểm tra...';
        const res = await window.Student.checkCustomQuestionImmediate(attemptId, q.id, resp);
        serverChecked[q.id] = res;
        renderFrame();
      } catch (err) {
        const al = rootContainer.querySelector('.ca-play-alert');
        if (al) {
          al.className = 'alert alert-danger show ca-play-alert';
          al.textContent = err.message || 'Không kiểm tra được câu hỏi.';
        }
        btn.disabled = false;
        btn.textContent = '🔍 Kiểm tra câu này';
      }
    }

    async function handleSubmitAttempt(autoTimedOut = false) {
      if (isSubmitting) return;

      if (mode === 'mistake_review') {
        clearActiveTimer();
        if (onCompleted) onCompleted();
        return;
      }

      if (!autoTimedOut) {
        const unanswered = questions.filter(q => !isQuestionAnswered(q)).length;
        if (unanswered > 0 && !confirm(`Bạn vẫn còn ${unanswered} câu chưa trả lời. Bạn có chắc muốn nộp bài ngay bây giờ?`)) {
          return;
        }
      }

      if (mode === 'preview') {
        clearActiveTimer();
        let earnedTotal = 0;
        let maxTotal = 0;
        let needsManual = false;
        const items = questions.map((q, idx) => {
          const g = shared.gradeQuestionClientPreview(q, answers[q.id] || {});
          const pts = Number(q.points || 1);
          maxTotal += pts;
          if (g.needs_manual_grading) needsManual = true;
          else earnedTotal += Number(g.points_earned || 0);
          return {
            question_id: q.id,
            question_order: idx + 1,
            question_type: q.question_type,
            prompt_text: q.prompt_text,
            points: pts,
            question_payload: q.question_payload,
            response_payload: answers[q.id] || {},
            is_correct: g.is_correct,
            points_earned: g.points_earned,
            needs_manual_grading: g.needs_manual_grading,
            answer_payload: q.answer_payload,
            explanation: q.explanation
          };
        });
        const pct = maxTotal > 0 ? Math.round((earnedTotal / maxTotal) * 100) : 100;
        const passPct = Number(settings.pass_score_percent ?? 60);
        const resultObj = {
          attempt: {
            id: 'preview',
            attempt_number: 1,
            total_score: Math.round(earnedTotal * 100) / 100,
            max_score: Math.round(maxTotal * 100) / 100,
            score_percent: pct,
            is_passed: !needsManual && pct >= passPct,
            needs_manual_grading: needsManual
          },
          assignment_title: title,
          pass_score_percent: passPct,
          can_reveal_answers: true,
          can_retry: true,
          items
        };
        renderResultScreen(rootContainer, resultObj, {
          isPreview: true,
          onRetryPreview: () => renderPreviewInContainer(rootContainer, { title, settings, questions }),
          onExit: onExit
        });
        return;
      }

      isSubmitting = true;
      const submitBtn = rootContainer.querySelector('.ca-btn-submit-all');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Đang nộp & chấm bài...';
      }

      try {
        clearActiveTimer();
        const result = await window.Student.submitCustomAssignmentAttempt(attemptId, answers);
        if (window.StudyTimer) {
          await window.StudyTimer.popActivity({ expectedActivity: 'assignment_custom', flush: true });
        }
        if (result.xp_awarded > 0 && window.XP && typeof window.XP.showXpToast === 'function') {
          window.XP.showXpToast(result.xp_awarded, 'Hoàn thành bài tập tự soạn');
        }
        renderResultScreen(rootContainer, result, {
          isPreview: false,
          onRetry: async () => openAssignmentModal(modalSession.assignmentId, { onSubmitted: modalSession.onSubmittedCallback }),
          onExit: () => {
            if (onCompleted) onCompleted(result);
            if (onExit) onExit();
          }
        });
        if (onCompleted) onCompleted(result);
      } catch (err) {
        console.error('Lỗi nộp bài tự soạn:', err);
        const al = rootContainer.querySelector('.ca-play-alert');
        if (al) {
          al.className = 'alert alert-danger show ca-play-alert';
          al.textContent = err.message || 'Lỗi kết nối khi nộp bài. Tiến độ nháp của bạn vẫn được giữ — vui lòng thử lại!';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '🔄 Thử nộp lại';
        }
      } finally {
        isSubmitting = false;
      }
    }

    renderFrame();
  }

  function formatExpectedAnswerText(q, ans) {
    const shared = S();
    if (!ans) return '';
    const qp = q.question_payload || {};
    if (q.question_type === 'mcq') {
      const optMap = new Map((qp.options || []).map(o => [o.id, o.text]));
      return (ans.correct_option_ids || []).map(id => optMap.get(id) || id).join(', ');
    }
    if (q.question_type === 'true_false') {
      return ans.correct_boolean ? 'Đúng' : 'Sai';
    }
    if (q.question_type === 'fill_blank') {
      return (ans.blanks || []).map(b => (b.accepted || []).join(' / ')).join(' | ');
    }
    if (q.question_type === 'translation') {
      return (ans.accepted_answers || []).join(' / ');
    }
    if (q.question_type === 'word_order') {
      if (ans.correct_sentence) return ans.correct_sentence;
      const tokMap = new Map((qp.shuffled_tokens || []).map(t => [t.id, t.text]));
      return (ans.correct_token_ids || []).map(id => tokMap.get(id) || '').join(' ');
    }
    if (q.question_type === 'matching') {
      return (ans.pairs || []).map(p => `${shared.safeStr(p.left_text)} → ${shared.safeStr(p.right_text)}`).join('; ');
    }
    return '';
  }

  function formatStudentItemRespText(it) {
    const shared = S();
    const resp = it.response_payload || {};
    const qp = it.question_payload || {};
    if (it.question_type === 'mcq') {
      const optMap = new Map((qp.options || []).map(o => [o.id, o.text]));
      return (resp.selected_option_ids || []).map(id => optMap.get(id) || id).join(', ') || 'Chưa chọn';
    }
    if (it.question_type === 'true_false') {
      return resp.selected_boolean === true ? 'Đúng' : (resp.selected_boolean === false ? 'Sai' : 'Chưa chọn');
    }
    if (it.question_type === 'fill_blank') {
      return (resp.values || []).filter(v => String(v || '').trim() !== '').join(' | ') || 'Chưa điền';
    }
    if (it.question_type === 'translation') {
      return shared.safeStr(resp.text, 'Chưa trả lời');
    }
    if (it.question_type === 'word_order') {
      const tokMap = new Map((qp.shuffled_tokens || qp._preview_shuffled_tokens || []).map(t => [t.id, t.text]));
      return (resp.ordered_token_ids || []).map(id => tokMap.get(id) || '').join(' ') || 'Chưa xếp';
    }
    if (it.question_type === 'matching') {
      const lMap = new Map((qp.left_items || qp._preview_left_items || []).map(x => [x.id, x.text]));
      const rMap = new Map((qp.right_items || qp._preview_right_items || []).map(x => [x.id, x.text]));
      return (resp.matched_pairs || []).map(p => `${lMap.get(p.left_id) || '?'} → ${rMap.get(p.right_id) || '?'}`).join('; ') || 'Chưa nối';
    }
    return '';
  }

  // ---------------------------------------------------------------------------
  // MÀN HÌNH KẾT QUẢ & ÔN LẠI CÂU SAI
  // ---------------------------------------------------------------------------
  function renderResultScreen(container, resultData, { isPreview = false, onRetry = null, onRetryPreview = null, onExit = null } = {}) {
    const shared = S();
    clearActiveTimer();
    const att = resultData.attempt || {};
    const items = Array.isArray(resultData.items) ? resultData.items : [];
    const wrongItems = items.filter(it => it.is_correct === false);
    const correctCnt = items.filter(it => it.is_correct === true).length;

    let heroIcon = '🎉';
    let heroTitle = att.is_passed ? 'Chúc mừng! Bạn đã đạt bài tập' : 'Đã nộp bài tập';
    if (att.needs_manual_grading) {
      heroIcon = '⏳';
      heroTitle = 'Đã nộp bài — đang chờ cô giáo chấm câu tự luận';
    } else if (!att.is_passed) {
      heroIcon = '💪';
      heroTitle = `Chưa đạt ngưỡng ${resultData.pass_score_percent || 60}% — Cố gắng thêm nhé!`;
    }

    container.innerHTML = `
      <div class="ca-result-wrap">
        <div class="ca-result-hero">
          <div style="font-size: 38px; line-height: 1.1; margin-bottom: 6px;">${heroIcon}</div>
          <h3 style="margin: 0 0 6px 0; font-size: 18px; color: var(--text-main);">${shared.escapeHtml(heroTitle)}</h3>
          <div style="font-size: 32px; font-weight: 900; color: ${att.is_passed ? 'var(--success)' : 'var(--primary)'};">
            ${att.score_percent ?? 0}%
          </div>
          <div style="font-size: 13.5px; color: var(--text-muted); margin-top: 4px;">
            Điểm số: <strong>${att.total_score ?? 0} / ${att.max_score ?? 0}</strong> · Đúng hoàn toàn <strong>${correctCnt}/${items.length}</strong> câu
            ${resultData.xp_awarded > 0 ? `<br><span style="color: var(--accent-gold); font-weight: 800;">⚡ Nhận thưởng +${resultData.xp_awarded} XP</span>` : ''}
          </div>
          ${resultData.reveal_notice ? `
            <div style="margin-top: 10px; padding: 8px 12px; border-radius: 8px; background: var(--warning-bg); color: var(--warning); font-size: 12.5px;">
              🔒 ${shared.escapeHtml(resultData.reveal_notice)}
            </div>
          ` : ''}
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin: 14px 0;">
          ${(wrongItems.length > 0 && resultData.can_reveal_answers) ? `
            <button type="button" id="btn-ca-review-wrong" class="btn btn-outline" style="flex: 1; min-width: 170px;">🧠 Ôn lại ${wrongItems.length} câu sai</button>
          ` : ''}
          ${(isPreview && onRetryPreview) ? `
            <button type="button" id="btn-ca-retry-preview" class="btn btn-primary" style="flex: 1; min-width: 150px;">🔄 Làm thử lại</button>
          ` : ''}
          ${(!isPreview && resultData.can_retry && onRetry) ? `
            <button type="button" id="btn-ca-retry-real" class="btn btn-primary" style="flex: 1; min-width: 150px;">
              🔄 Làm lại (${resultData.attempts_remaining !== null ? 'còn ' + resultData.attempts_remaining + ' lượt' : 'không giới hạn'})
            </button>
          ` : ''}
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${items.map(it => {
            const tMeta = shared.QUESTION_TYPES[it.question_type] || { icon: '❓', shortLabel: it.question_type };
            let stBadge = '<span class="import-badge-pill is-warn">⏳ Chờ chấm</span>';
            if (it.is_correct === true) stBadge = `<span class="import-badge-pill is-highlight">✅ Đúng (+${it.points_earned}đ)</span>`;
            else if (it.is_correct === false) stBadge = `<span class="import-badge-pill" style="background: var(--danger-bg); color: var(--danger); border-color: var(--danger-border);">❌ Sai (${it.points_earned}/${it.points}đ)</span>`;

            const yourAns = formatStudentItemRespText(it);
            const rightAns = resultData.can_reveal_answers ? formatExpectedAnswerText(it, it.answer_payload) : '';
            const exp = resultData.can_reveal_answers ? shared.safeStr(it.explanation, '') : '';

            return `
              <div style="border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px 14px; background: var(--bg-subtle);">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px;">
                  <span class="ca-q-badge">${tMeta.icon} Câu ${it.question_order}: ${shared.escapeHtml(tMeta.shortLabel)}</span>
                  ${stBadge}
                </div>
                <div style="font-weight: 700; font-size: 14px; color: var(--text-main); margin-bottom: 6px;">${shared.escapeHtml(it.prompt_text)}</div>
                <div style="font-size: 13px; color: var(--text-main);">Câu trả lời của bạn: <strong>${shared.escapeHtml(yourAns)}</strong></div>
                ${rightAns ? `<div style="font-size: 13px; color: var(--success); margin-top: 3px;">Đáp án đúng: <strong>${shared.escapeHtml(rightAns)}</strong></div>` : ''}
                ${exp ? `<div style="font-size: 12.5px; color: var(--text-muted); margin-top: 4px;">💡 ${shared.escapeHtml(exp)}</div>` : ''}
                ${it.teacher_feedback ? `<div style="font-size: 12.5px; color: var(--primary); margin-top: 4px;">💬 Nhận xét của giáo viên: ${shared.escapeHtml(it.teacher_feedback)}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    const wrongBtn = container.querySelector('#btn-ca-review-wrong');
    if (wrongBtn) {
      wrongBtn.addEventListener('click', () => {
        // Đưa câu sai vào trình làm lại tại chỗ (không ảnh hưởng điểm đã nộp)
        const reviewQs = wrongItems.map(it => {
          const qp = { ...(it.question_payload || {}) };
          if (it.question_type === 'word_order') {
            qp._preview_shuffled_tokens = qp.shuffled_tokens || [];
          }
          if (it.question_type === 'matching') {
            qp._preview_left_items = qp.left_items || [];
            qp._preview_right_items = qp.right_items || [];
          }
          return {
            id: it.question_id,
            question_type: it.question_type,
            prompt_text: it.prompt_text,
            points: it.points,
            question_payload: qp,
            answer_payload: it.answer_payload,
            explanation: it.explanation
          };
        });
        mountInteractivePlayer(container, {
          mode: 'mistake_review',
          title: `Ôn câu sai: ${resultData.assignment_title || ''}`,
          settings: { answer_reveal_mode: 'immediate' },
          questions: reviewQs,
          onCompleted: () => renderResultScreen(container, resultData, { isPreview, onRetry, onRetryPreview, onExit }),
          onExit: () => renderResultScreen(container, resultData, { isPreview, onRetry, onRetryPreview, onExit })
        });
      });
    }

    const rPrevBtn = container.querySelector('#btn-ca-retry-preview');
    if (rPrevBtn && onRetryPreview) rPrevBtn.addEventListener('click', onRetryPreview);

    const rRealBtn = container.querySelector('#btn-ca-retry-real');
    if (rRealBtn && onRetry) rRealBtn.addEventListener('click', onRetry);
  }

  // ---------------------------------------------------------------------------
  // API XEM TRƯỚC DÀNH CHO BƯỚC 4 TRÌNH SOẠN GIÁO VIÊN
  // ---------------------------------------------------------------------------
  function renderPreviewInContainer(hostEl, { title, settings, questions }) {
    const shared = S();
    if (!hostEl) return;

    const prepared = questions.map((orig, idx) => {
      const q = JSON.parse(JSON.stringify(orig));
      q.id = orig.id || `prev_${idx}_${Date.now()}`;
      if (q.question_type === 'mcq' && settings.shuffle_options) {
        q.question_payload.options = shared.shuffleArray(q.question_payload.options || []);
      }
      if (q.question_type === 'fill_blank' && Array.isArray(q.question_payload.word_bank)) {
        q.question_payload.word_bank = shared.shuffleArray(q.question_payload.word_bank);
      }
      if (q.question_type === 'word_order') {
        const pool = [...(q.answer_payload.tokens || []), ...(q.answer_payload.distractor_tokens || [])];
        q.question_payload.shuffled_tokens = shared.shuffleArray(pool);
      }
      if (q.question_type === 'matching') {
        const pairs = q.answer_payload.pairs || [];
        const lItems = pairs.map((p, pi) => ({ id: `L${pi + 1}`, text: p.left_text }));
        const rItems = pairs.map((p, pi) => ({ id: `R${pi + 1}`, text: p.right_text }));
        q.question_payload.left_items = shared.shuffleArray(lItems);
        q.question_payload.right_items = shared.shuffleArray(rItems);
        q.question_payload._preview_left_items = q.question_payload.left_items;
        q.question_payload._preview_right_items = q.question_payload.right_items;
      }
      return q;
    });

    const finalList = settings.shuffle_questions ? shared.shuffleArray(prepared) : prepared;

    mountInteractivePlayer(hostEl, {
      mode: 'preview',
      title,
      settings,
      questions: finalList
    });
  }

  // ---------------------------------------------------------------------------
  // MỞ MODAL LÀM BÀI PHÍA HỌC VIÊN (DASHBOARD & LESSON)
  // ---------------------------------------------------------------------------
  async function openAssignmentModal(assignmentId, { onSubmitted = null } = {}) {
    const shared = S();
    const modal = el('modal-custom-assignment-player');
    const titleEl = el('ca-player-modal-title');
    const subEl = el('ca-player-modal-sub');
    const bodyEl = el('ca-player-stage-root');
    if (!modal || !bodyEl) return;

    clearActiveTimer();
    modalSession.assignmentId = assignmentId;
    modalSession.onSubmittedCallback = onSubmitted;

    if (titleEl) titleEl.textContent = '🧩 Bài tập tự soạn';
    if (subEl) subEl.textContent = 'Đang tải thông tin bài tập...';
    bodyEl.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">⏳ Đang tải bài tập từ máy chủ...</div>';
    modal.classList.add('active');

    try {
      const session = await window.Student.getCustomAssignmentSession(assignmentId);
      renderSessionOverview(bodyEl, titleEl, subEl, session);
    } catch (err) {
      console.error('Lỗi tải bài tập tự soạn:', err);
      if (subEl) subEl.textContent = '';
      bodyEl.innerHTML = `
        <div style="text-align: center; padding: 32px; color: var(--danger);">
          ❌ ${shared.escapeHtml(err.message || 'Không thể tải bài tập này.')}
          <div style="margin-top: 12px;"><button type="button" id="btn-ca-retry-load" class="btn btn-outline btn-sm">🔄 Thử lại</button></div>
        </div>
      `;
      const retry = el('btn-ca-retry-load');
      if (retry) retry.addEventListener('click', () => openAssignmentModal(assignmentId, { onSubmitted }));
    }
  }

  function renderSessionOverview(bodyEl, titleEl, subEl, session) {
    const shared = S();
    const a = session.assignment || {};
    const cfg = a.custom_settings || {};
    const active = session.active_attempt;
    const past = Array.isArray(session.past_attempts) ? session.past_attempts : [];

    if (titleEl) titleEl.textContent = `🧩 ${a.title || 'Bài tập tự soạn'}`;
    if (subEl) subEl.textContent = a.description || 'Hoàn thành các câu hỏi bên dưới trước hạn chót.';

    // Nếu đang có lượt làm dở (còn hạn) -> tự động khôi phục ngay hoặc hiện nút tiếp tục rõ ràng!
    const hasDraftInProgress = Boolean(active && session.questions && session.questions.length > 0 && !a.is_past_due);

    const maxAttText = session.max_attempts ? `${session.attempts_used} / ${session.max_attempts} lượt` : `${session.attempts_used} lượt (không giới hạn)`;
    const timeText = cfg.time_limit_minutes ? `${cfg.time_limit_minutes} phút` : 'Không giới hạn';

    bodyEl.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 10px;">
          <div class="ca-stat-mini"><div class="ca-stat-label">Số câu & Điểm</div><div class="ca-stat-val">${a.total_questions || 0} câu · ${a.total_points || 0}đ</div></div>
          <div class="ca-stat-mini"><div class="ca-stat-label">Thời gian</div><div class="ca-stat-val">${timeText}</div></div>
          <div class="ca-stat-mini"><div class="ca-stat-label">Số lượt</div><div class="ca-stat-val">${maxAttText}</div></div>
          <div class="ca-stat-mini"><div class="ca-stat-label">Ngưỡng đạt & XP</div><div class="ca-stat-val">≥ ${cfg.pass_score_percent ?? 60}% · +${a.reward_xp || 30} XP</div></div>
        </div>

        <div style="font-size: 13px; color: var(--text-muted); padding: 10px 12px; border-radius: var(--radius-sm); background: var(--bg-subtle); border: 1px solid var(--border-color);">
          ⏰ Hạn chót: <strong style="color: ${a.is_past_due ? 'var(--danger)' : 'var(--text-main)'};">${formatVnTime(a.due_date)}${a.is_past_due ? ' (Đã hết hạn)' : ''}</strong>
          ${a.lesson_label ? ` · 📖 ${shared.escapeHtml(a.lesson_label)}` : ''}
        </div>

        ${session.best_attempt ? `
          <div style="padding: 12px 14px; border-radius: var(--radius-sm); background: ${session.best_attempt.is_passed ? 'var(--success-bg)' : 'var(--warning-bg)'}; border: 1px solid ${session.best_attempt.is_passed ? 'var(--success-border)' : 'var(--warning-border)'}; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <strong>🏆 Thành tích tốt nhất: ${session.best_attempt.score_percent}/100</strong> (${session.best_attempt.total_score}/${session.best_attempt.max_score}đ)
            </div>
            <button type="button" class="btn btn-outline btn-sm ca-btn-view-past" data-att-id="${shared.escapeHtml(session.best_attempt.id)}">🔍 Xem kết quả chi tiết</button>
          </div>
        ` : ''}

        ${hasDraftInProgress ? `
          <div style="padding: 12px 14px; border-radius: var(--radius-sm); background: var(--primary-light); border: 1px solid var(--primary-border); font-size: 13.5px;">
            💾 Bạn đang làm dở <strong>Lần ${active.attempt_number}</strong> (tiến độ đã được tự lưu). Bấm tiếp tục để làm tiếp từ nơi bạn dừng lại!
          </div>
        ` : ''}

        <div id="ca-session-action-alert" class="alert"></div>

        <div>
          ${session.can_start ? `
            <button type="button" id="btn-ca-start-or-resume" class="btn btn-primary btn-block" style="min-height: 46px; font-size: 15px;">
              ${hasDraftInProgress ? `⏩ Tiếp tục làm Lần ${active.attempt_number}` : `▶️ ${session.attempts_used > 0 ? 'Làm lại lượt mới' : 'Bắt đầu làm bài'}`}
            </button>
          ` : `
            <div style="padding: 12px; border-radius: var(--radius-sm); background: var(--danger-bg); border: 1px solid var(--danger-border); color: var(--danger); font-size: 13.5px; text-align: center; font-weight: 600;">
              ${a.is_past_due ? '🔴 Bài tập đã quá hạn nộp, không thể bắt đầu hoặc nộp thêm lượt mới.' : '⛔ Bạn đã dùng hết số lượt làm bài cho phép.'}
            </div>
          `}
        </div>

        ${past.length > 0 ? `
          <div>
            <div style="font-weight: 700; font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">Lịch sử các lần đã nộp:</div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${past.map(p => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-card); font-size: 13px; flex-wrap: wrap; gap: 8px;">
                  <div>
                    <strong>Lần ${p.attempt_number}</strong> · ${p.score_percent}/100 (${p.total_score}/${p.max_score}đ)
                    ${p.needs_manual_grading ? ' · <span style="color: var(--warning);">Chờ chấm câu dịch</span>' : (p.is_passed ? ' · <span style="color: var(--success);">Đạt</span>' : '')}
                  </div>
                  <button type="button" class="btn btn-outline btn-sm ca-btn-view-past" data-att-id="${shared.escapeHtml(p.id)}" style="font-size: 12px;">Xem chi tiết</button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    const startBtn = el('btn-ca-start-or-resume');
    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        try {
          startBtn.disabled = true;
          startBtn.textContent = '⏳ Đang mở bài làm...';
          const startedSession = await window.Student.startOrResumeCustomAttempt(a.id);
          const att = startedSession.active_attempt;
          if (!att || !startedSession.questions || startedSession.questions.length === 0) {
            throw new Error('Không khởi tạo được phiên làm bài.');
          }
          mountInteractivePlayer(bodyEl, {
            mode: 'live',
            title: startedSession.assignment.title,
            settings: startedSession.assignment.custom_settings || {},
            questions: startedSession.questions,
            attemptId: att.id,
            initialDraft: att.draft_answers || {},
            initialRemainingSeconds: att.remaining_seconds,
            onCompleted: () => {
              if (typeof modalSession.onSubmittedCallback === 'function') {
                modalSession.onSubmittedCallback();
              }
            },
            onExit: () => {
              const m = el('modal-custom-assignment-player');
              if (m) m.classList.remove('active');
            }
          });
        } catch (err) {
          const al = el('ca-session-action-alert');
          if (al) {
            al.className = 'alert alert-danger show';
            al.textContent = err.message || 'Không thể bắt đầu lượt làm bài.';
          }
          startBtn.disabled = false;
          startBtn.textContent = hasDraftInProgress ? `⏩ Tiếp tục làm Lần ${active.attempt_number}` : '▶️ Bắt đầu làm bài';
        }
      });
    }

    bodyEl.querySelectorAll('.ca-btn-view-past').forEach(btn => {
      btn.addEventListener('click', async () => {
        const attId = btn.dataset.attId;
        bodyEl.innerHTML = '<div style="text-align: center; padding: 36px; color: var(--text-muted);">⏳ Đang tải kết quả chi tiết...</div>';
        try {
          const res = await window.Student.getCustomAttemptResult(attId);
          renderResultScreen(bodyEl, res, {
            isPreview: false,
            onRetry: async () => openAssignmentModal(a.id, { onSubmitted: modalSession.onSubmittedCallback })
          });
        } catch (err) {
          bodyEl.innerHTML = `<div style="padding: 24px; color: var(--danger);">❌ ${shared.escapeHtml(err.message || 'Không tải được kết quả.')}</div>`;
        }
      });
    });
  }

  function closePlayerModal() {
    clearActiveTimer();
    if (window.StudyTimer) {
      void window.StudyTimer.popActivity({ expectedActivity: 'assignment_custom', flush: true });
    }
    const modal = el('modal-custom-assignment-player');
    if (modal) modal.classList.remove('active');
  }

  function bindGlobalClose() {
    document.querySelectorAll('[data-close="modal-custom-assignment-player"]').forEach(btn => {
      btn.addEventListener('click', closePlayerModal);
    });
  }

  return {
    openAssignmentModal,
    renderPreviewInContainer,
    closePlayerModal,
    bindGlobalClose
  };
})();
