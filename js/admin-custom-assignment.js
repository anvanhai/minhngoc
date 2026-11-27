/**
 * MODULE TRÌNH SOẠN & THỐNG KÊ / CHẤM TAY BÀI TẬP TỰ SOẠN (GIÁO VIÊN / ADMIN)
 * Tích hợp với modal #modal-create-assignment và #modal-view-submissions trên admin/class-detail.html
 */
window.AdminCustomAssignment = (function () {
  'use strict';

  function S() {
    return window.CustomAssignmentShared;
  }

  let state = {
    classId: null,
    lessons: [],
    onSavedCallback: null,
    editingAssignmentId: null,
    questionsLocked: false,
    attemptCount: 0,
    alreadyPublished: false,
    step: 1,
    questions: [],
    collapsedSet: new WeakSet()
  };

  let qObserver = null;
  let activeNavIdx = 0;
  let scrollTrackBound = false;
  let scrollTrackRaf = null;

  function isQuestionCollapsed(q) {
    return Boolean(q && typeof q === 'object' && state.collapsedSet.has(q));
  }

  function setQuestionCollapsed(q, collapsed) {
    if (!q || typeof q !== 'object') return;
    if (collapsed) state.collapsedSet.add(q);
    else state.collapsedSet.delete(q);
  }

  // State của modal sinh nhanh từ vựng
  let genState = {
    mode: 'warehouse', // 'warehouse' | 'lesson'
    page: 1,
    pageSize: 15,
    totalPages: 1,
    currentRows: [],
    selectedMap: new Map(), // id -> vocab row
    generatedDrafts: [],
    debounceTimer: null
  };

  function el(id) {
    return document.getElementById(id);
  }

  function formatDatetimeLocalFromIso(isoStr) {
    if (!isoStr) {
      const tonight = new Date();
      tonight.setHours(22, 0, 0, 0);
      const tzOffset = tonight.getTimezoneOffset() * 60000;
      return new Date(tonight.getTime() - tzOffset).toISOString().slice(0, 16);
    }
    const d = new Date(isoStr);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  }

  function showModalAlert(msg, type = 'danger') {
    const box = el('assign-modal-alert');
    if (!box) return;
    if (!msg) {
      box.className = 'alert';
      box.textContent = '';
      return;
    }
    box.className = `alert alert-${type} show`;
    box.textContent = msg;
  }

  function updateCountsHeader() {
    const qEl = el('ca-total-q');
    const pEl = el('ca-total-pts');
    const totalPts = state.questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
    if (qEl) qEl.textContent = String(state.questions.length);
    if (pEl) pEl.textContent = String(Math.round(totalPts * 100) / 100);
  }

  function readSettingsFromDom() {
    const timeRaw = el('ca-set-time-limit') ? el('ca-set-time-limit').value.trim() : '';
    const maxAttRaw = el('ca-set-max-attempts') ? el('ca-set-max-attempts').value.trim() : '';
    return {
      shuffle_questions: Boolean(el('ca-set-shuffle-q') && el('ca-set-shuffle-q').checked),
      shuffle_options: Boolean(el('ca-set-shuffle-opt') && el('ca-set-shuffle-opt').checked),
      time_limit_minutes: timeRaw === '' ? null : parseInt(timeRaw, 10),
      max_attempts: maxAttRaw === '' ? null : parseInt(maxAttRaw, 10),
      pass_score_percent: parseInt((el('ca-set-pass-score') && el('ca-set-pass-score').value) || '60', 10),
      answer_reveal_mode: (el('ca-set-reveal-mode') && el('ca-set-reveal-mode').value) || 'after_submit'
    };
  }

  function writeSettingsToDom(settings = {}) {
    if (el('ca-set-shuffle-q')) el('ca-set-shuffle-q').checked = Boolean(settings.shuffle_questions);
    if (el('ca-set-shuffle-opt')) el('ca-set-shuffle-opt').checked = Boolean(settings.shuffle_options);
    if (el('ca-set-time-limit')) {
      el('ca-set-time-limit').value = (settings.time_limit_minutes !== null && settings.time_limit_minutes !== undefined)
        ? String(settings.time_limit_minutes)
        : '';
    }
    if (el('ca-set-max-attempts')) {
      el('ca-set-max-attempts').value = (settings.max_attempts !== null && settings.max_attempts !== undefined)
        ? String(settings.max_attempts)
        : '';
    }
    if (el('ca-set-pass-score')) {
      el('ca-set-pass-score').value = String(settings.pass_score_percent ?? 60);
      el('ca-set-pass-score').disabled = state.questionsLocked;
    }
    if (el('ca-set-reveal-mode')) {
      el('ca-set-reveal-mode').value = settings.answer_reveal_mode || 'after_submit';
    }
  }

  function setModeActive(isCustom) {
    const card = el('modal-create-assignment-card');
    const stepper = el('custom-wizard-stepper');
    const step1Next = el('custom-step1-next-bar');
    const oldFooter = el('assign-old-footer-actions');
    const caFooter = el('ca-footer-actions');
    const step1General = el('ca-step1-general-wrap');
    const s2 = el('custom-wizard-step-2');
    const s3 = el('custom-wizard-step-3');
    const s4 = el('custom-wizard-step-4');
    const modalBody = el('ca-modal-body');

    if (card) {
      card.style.maxWidth = '';
      card.style.width = '';
      card.classList.toggle('is-custom-mode', Boolean(isCustom));
    }
    if (stepper) stepper.style.display = isCustom ? 'flex' : 'none';
    if (step1Next) step1Next.style.display = isCustom ? 'flex' : 'none';
    if (oldFooter) oldFooter.style.display = isCustom ? 'none' : 'flex';
    if (caFooter) caFooter.style.display = isCustom ? 'flex' : 'none';

    if (!isCustom) {
      disconnectNavObserver();
      if (modalBody) {
        modalBody.classList.remove('is-step-2');
        modalBody.scrollTop = 0;
      }
      if (step1General) step1General.style.display = 'block';
      if (s2) s2.style.display = 'none';
      if (s3) s3.style.display = 'none';
      if (s4) s4.style.display = 'none';
      if (el('custom-locked-banner')) el('custom-locked-banner').style.display = 'none';
    } else {
      goToStep(state.step || 1);
    }
  }

  function goToStep(stepNum) {
    const prevStep = state.step;
    state.step = Math.max(1, Math.min(4, stepNum));
    const step1General = el('ca-step1-general-wrap');
    const step1Next = el('custom-step1-next-bar');
    const s2 = el('custom-wizard-step-2');
    const s3 = el('custom-wizard-step-3');
    const s4 = el('custom-wizard-step-4');
    const modalBody = el('ca-modal-body');

    if (step1General) step1General.style.display = state.step === 1 ? 'block' : 'none';
    if (step1Next) step1Next.style.display = state.step === 1 ? 'flex' : 'none';
    if (s2) s2.style.display = state.step === 2 ? 'block' : 'none';
    if (s3) s3.style.display = state.step === 3 ? 'block' : 'none';
    if (s4) s4.style.display = state.step === 4 ? 'block' : 'none';

    if (modalBody) {
      modalBody.classList.toggle('is-step-2', state.step === 2);
      if (prevStep !== state.step) {
        modalBody.scrollTop = 0;
      }
    }

    document.querySelectorAll('.ca-step-btn').forEach(btn => {
      const s = parseInt(btn.getAttribute('data-step'), 10);
      btn.classList.toggle('is-active', s === state.step);
      btn.classList.toggle('is-done', s < state.step);
    });

    const prevBtn = el('btn-ca-prev-step');
    const nextBtn = el('btn-ca-next-step');
    const draftBtn = el('btn-ca-save-draft');
    const pubBtn = el('btn-ca-publish');

    if (prevBtn) prevBtn.style.display = state.step > 1 ? 'inline-flex' : 'none';
    if (nextBtn) nextBtn.style.display = state.step < 4 ? 'inline-flex' : 'none';
    if (draftBtn) {
      draftBtn.style.display = (state.questionsLocked && state.alreadyPublished) ? 'none' : 'inline-flex';
    }
    if (pubBtn) {
      pubBtn.textContent = (state.editingAssignmentId && state.alreadyPublished) ? '💾 Lưu cập nhật' : '🚀 Giao ngay cho lớp';
    }

    if (state.step === 2) {
      renderQuestionsBuilder();
    } else {
      disconnectNavObserver();
      if (state.step === 4) {
        renderStep4SummaryAndValidation();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // RENDER & CHỈNH SỬA DANH SÁCH CÂU HỎI (BƯỚC 2)
  // ---------------------------------------------------------------------------
  function buildQuestionSummaryLine(q) {
    const shared = S();
    const tMeta = shared.QUESTION_TYPES[q.question_type] || { icon: '❓', shortLabel: q.question_type };
    const prompt = shared.escapeHtml(shared.safeStr(q.prompt_text, '(Chưa nhập đề bài)'));
    return `${tMeta.icon} [${tMeta.shortLabel}] ${prompt}`;
  }

  function renderMcqEditorBody(q, idx) {
    const shared = S();
    const qp = q.question_payload || {};
    const ap = q.answer_payload || {};
    const options = Array.isArray(qp.options) ? qp.options : [];
    const correctSet = new Set(Array.isArray(ap.correct_option_ids) ? ap.correct_option_ids : []);
    const allowMultiple = Boolean(qp.allow_multiple);
    const inputType = allowMultiple ? 'checkbox' : 'radio';
    const disabledAttr = state.questionsLocked ? 'disabled' : '';

    return `
      <div style="margin-bottom: 10px;">
        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
          <input type="checkbox" class="ca-mcq-multi" data-idx="${idx}" ${allowMultiple ? 'checked' : ''} ${disabledAttr}>
          Cho phép chọn nhiều đáp án đúng
        </label>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;">
        ${options.map((opt, oi) => `
          <div class="ca-mcq-opt-row">
            <input type="${inputType}" name="ca_mcq_correct_${idx}" class="ca-mcq-correct" data-idx="${idx}" data-opt-id="${shared.escapeHtml(opt.id)}" ${correctSet.has(opt.id) ? 'checked' : ''} ${disabledAttr} title="Đánh dấu đáp án đúng" style="width: 18px; height: 18px; flex-shrink: 0;">
            <span style="font-weight: 700; min-width: 20px; color: var(--primary); flex-shrink: 0;">${String.fromCharCode(65 + oi)}.</span>
            <input type="text" class="form-control ca-mcq-opt-text" data-idx="${idx}" data-oi="${oi}" value="${shared.escapeHtml(opt.text)}" placeholder="Nội dung lựa chọn ${String.fromCharCode(65 + oi)}" maxlength="${shared.LIMITS.OPTION}" ${disabledAttr}>
            ${(!state.questionsLocked && options.length > 2) ? `<button type="button" class="btn btn-outline btn-sm ca-mcq-del-opt" data-idx="${idx}" data-oi="${oi}" style="color: var(--danger); padding: 4px 10px; min-height: 36px; min-width: 36px; flex-shrink: 0;">&times;</button>` : ''}
          </div>
        `).join('')}
      </div>
      ${(!state.questionsLocked && options.length < 6) ? `
        <button type="button" class="btn btn-outline btn-sm ca-mcq-add-opt" data-idx="${idx}" style="font-size: 12px;">➕ Thêm lựa chọn (${options.length}/6)</button>
      ` : ''}
    `;
  }

  function renderTrueFalseEditorBody(q, idx) {
    const ap = q.answer_payload || {};
    const isTrue = ap.correct_boolean !== false;
    const disabledAttr = state.questionsLocked ? 'disabled' : '';
    return `
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <label style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer;">
          <input type="radio" name="ca_tf_${idx}" class="ca-tf-radio" data-idx="${idx}" value="true" ${isTrue ? 'checked' : ''} ${disabledAttr}>
          <strong>✅ Đúng</strong>
        </label>
        <label style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer;">
          <input type="radio" name="ca_tf_${idx}" class="ca-tf-radio" data-idx="${idx}" value="false" ${!isTrue ? 'checked' : ''} ${disabledAttr}>
          <strong>❌ Sai</strong>
        </label>
      </div>
    `;
  }

  function syncFillBlanksArray(q) {
    const shared = S();
    const blankCount = Math.max(0, Math.min(shared.LIMITS.MAX_BLANKS, shared.countBlanksInPrompt(q.prompt_text)));
    if (!q.answer_payload) q.answer_payload = { blanks: [] };
    if (!Array.isArray(q.answer_payload.blanks)) q.answer_payload.blanks = [];
    while (q.answer_payload.blanks.length < blankCount) {
      q.answer_payload.blanks.push({ accepted: [] });
    }
    if (q.answer_payload.blanks.length > blankCount && blankCount > 0) {
      q.answer_payload.blanks = q.answer_payload.blanks.slice(0, blankCount);
    }
    if (!q.question_payload) q.question_payload = {};
    q.question_payload.blank_count = blankCount;
  }

  function renderFillBlankEditorBody(q, idx) {
    const shared = S();
    syncFillBlanksArray(q);
    const qp = q.question_payload || {};
    const blanks = (q.answer_payload && q.answer_payload.blanks) || [];
    const wordBankText = Array.isArray(qp.word_bank) ? qp.word_bank.join(' | ') : '';
    const disabledAttr = state.questionsLocked ? 'disabled' : '';
    const mode = qp.input_mode || 'both';

    return `
      <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <span style="font-size: 12.5px; color: var(--text-muted);">Dùng ký hiệu <code>___</code> (3 dấu gạch dưới) trong đề bài để đánh dấu mỗi chỗ trống (hiện có <strong>${blanks.length}</strong> chỗ trống).</span>
        ${!state.questionsLocked ? `<button type="button" class="btn btn-outline btn-sm ca-fb-insert-blank" data-idx="${idx}" style="font-size: 12px;">➕ Chèn chỗ trống ___</button>` : ''}
      </div>

      ${blanks.length === 0 ? `
        <div style="padding: 10px; border-radius: 6px; background: var(--warning-bg); color: var(--warning); font-size: 12.5px; margin-bottom: 10px;">
          ⚠️ Đề bài hiện chưa có dấu <code>___</code> nào. Hãy chèn <code>___</code> vào đề bài ở trên để thiết lập đáp án.
        </div>
      ` : `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px;">
          ${blanks.map((b, bi) => `
            <div>
              <label style="font-size: 12px; font-weight: 700; display: block; margin-bottom: 4px;">Đáp án chấp nhận cho Chỗ trống #${bi + 1} (mỗi đáp án 1 dòng hoặc ngăn cách bởi dấu <code>|</code>):</label>
              <textarea class="form-control ca-fb-blank-ans" data-idx="${idx}" data-bi="${bi}" rows="2" placeholder="Ví dụ: nǐ hǎo | 你好" ${disabledAttr} style="font-size: 13px;">${shared.escapeHtml((b.accepted || []).join('\n'))}</textarea>
            </div>
          `).join('')}
        </div>
      `}

      <div style="display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 10px; padding: 8px 10px; background: var(--bg-card); border-radius: 6px; border: 1px solid var(--border-color);">
        <label style="display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; cursor: pointer;">
          <input type="checkbox" class="ca-fb-opt" data-key="ignore_case" data-idx="${idx}" ${qp.ignore_case !== false ? 'checked' : ''} ${disabledAttr}> Bỏ qua hoa/thường
        </label>
        <label style="display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; cursor: pointer;">
          <input type="checkbox" class="ca-fb-opt" data-key="ignore_pinyin_tones" data-idx="${idx}" ${qp.ignore_pinyin_tones ? 'checked' : ''} ${disabledAttr}> Chấp nhận Pinyin không dấu thanh (vd: ni hao = nǐ hǎo)
        </label>
        <label style="display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; cursor: pointer;">
          <input type="checkbox" class="ca-fb-opt" data-key="ignore_extra_spaces" data-idx="${idx}" ${qp.ignore_extra_spaces !== false ? 'checked' : ''} ${disabledAttr}> Bỏ qua khoảng trắng thừa
        </label>
      </div>

      <div class="form-group" style="margin-bottom: 8px;">
        <label style="font-size: 12.5px; font-weight: 700; display: block; margin-bottom: 4px;">Chế độ điền cho học viên:</label>
        <select class="form-control ca-fb-mode" data-idx="${idx}" ${disabledAttr} style="height: 36px; font-size: 13px;">
          <option value="both" ${mode === 'both' ? 'selected' : ''}>Cả hai: Gõ trực tiếp hoặc Chạm/Kéo từ ngân hàng từ</option>
          <option value="word_bank" ${mode === 'word_bank' ? 'selected' : ''}>Chỉ chọn/kéo từ Ngân hàng từ</option>
          <option value="typing" ${mode === 'typing' ? 'selected' : ''}>Chỉ gõ từ bàn phím</option>
        </select>
      </div>

      ${(mode === 'word_bank' || mode === 'both') ? `
        <div class="form-group" style="margin-bottom: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 4px;">
            <label style="font-size: 12.5px; font-weight: 700;">Ngân hàng từ (gồm đáp án đúng + từ gây nhiễu, ngăn cách bằng <code>|</code>):</label>
            ${!state.questionsLocked ? `<button type="button" class="btn btn-outline btn-sm ca-fb-fill-bank" data-idx="${idx}" style="font-size: 11px;">✨ Tự lấy từ đáp án đúng</button>` : ''}
          </div>
          <input type="text" class="form-control ca-fb-bank-input" data-idx="${idx}" value="${shared.escapeHtml(wordBankText)}" placeholder="Ví dụ: nǐ hǎo | xièxie | zàijiàn" ${disabledAttr} style="height: 36px; font-size: 13px;">
        </div>
      ` : ''}
    `;
  }

  function renderTranslationEditorBody(q, idx) {
    const shared = S();
    const qp = q.question_payload || {};
    const ap = q.answer_payload || {};
    const dir = qp.direction || 'vi_to_zh';
    const manual = Boolean(qp.requires_manual_grading);
    const disabledAttr = state.questionsLocked ? 'disabled' : '';

    return `
      <div class="ca-tr-grid">
        <div>
          <label style="font-size: 12px; font-weight: 700; display: block; margin-bottom: 4px;">Hướng dịch:</label>
          <select class="form-control ca-tr-dir" data-idx="${idx}" ${disabledAttr} style="height: 36px; font-size: 13px;">
            <option value="vi_to_zh" ${dir === 'vi_to_zh' ? 'selected' : ''}>Việt → Trung</option>
            <option value="zh_to_vi" ${dir === 'zh_to_vi' ? 'selected' : ''}>Trung → Việt</option>
          </select>
        </div>
        <div style="display: flex; align-items: flex-end; padding-bottom: 6px;">
          <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
            <input type="checkbox" class="ca-tr-manual" data-idx="${idx}" ${manual ? 'checked' : ''} ${disabledAttr}>
            <strong>Cần giáo viên chấm tay</strong>
          </label>
        </div>
      </div>
      <div>
        <label style="font-size: 12px; font-weight: 700; display: block; margin-bottom: 4px;">
          ${manual ? 'Đáp án gợi ý để hiện sau khi chấm (tùy chọn):' : 'Các đáp án đúng được chấp nhận (mỗi câu một dòng — tự động bỏ dấu câu & khoảng trắng thừa):'}
        </label>
        <textarea class="form-control ca-tr-answers" data-idx="${idx}" rows="3" placeholder="Ví dụ:&#10;我准备好了。&#10;我已准备好" ${disabledAttr} style="font-size: 13px;">${shared.escapeHtml((ap.accepted_answers || []).join('\n'))}</textarea>
      </div>
    `;
  }

  function renderWordOrderEditorBody(q, idx) {
    const shared = S();
    const ap = q.answer_payload || {};
    const tokens = Array.isArray(ap.tokens) ? ap.tokens : [];
    const distractors = Array.isArray(ap.distractor_tokens) ? ap.distractor_tokens : [];
    const disabledAttr = state.questionsLocked ? 'disabled' : '';

    return `
      <div style="margin-bottom: 10px;">
        <label style="font-size: 12px; font-weight: 700; display: block; margin-bottom: 4px;">Nhập câu đúng hoàn chỉnh (có thể cách sẵn bằng dấu cách hoặc gõ liền rồi bấm Tách):</label>
        <div class="ca-wo-row">
          <input type="text" class="form-control ca-wo-sentence" data-idx="${idx}" value="${shared.escapeHtml(ap.correct_sentence || '')}" placeholder="Ví dụ: 我 已经 习惯 这儿 的 生活 了" ${disabledAttr} style="height: 36px; font-size: 14px; font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;">
          ${!state.questionsLocked ? `<button type="button" class="btn btn-outline btn-sm ca-wo-split-btn" data-idx="${idx}" style="white-space: nowrap; min-height: 36px; flex-shrink: 0;">✂️ Tách mảnh</button>` : ''}
        </div>
      </div>

      <div style="margin-bottom: 10px;">
        <label style="font-size: 12px; font-weight: 700; display: block; margin-bottom: 4px;">Các mảnh theo thứ tự đúng (hoặc sửa tay cách tách bằng dấu <code>|</code>):</label>
        <input type="text" class="form-control ca-wo-tokens-edit" data-idx="${idx}" value="${shared.escapeHtml(tokens.map(t => t.text).join(' | '))}" placeholder="Ví dụ: 我 | 已经 | 习惯 | 了" ${disabledAttr} style="height: 36px; font-size: 13px; margin-bottom: 6px;">
        <div class="ca-wo-token-badges" data-role="wo-token-badges">
          ${tokens.map((t, ti) => `<span class="import-badge-pill">${ti + 1}. ${shared.escapeHtml(t.text)}</span>`).join('')}
        </div>
      </div>

      <div>
        <label style="font-size: 12px; font-weight: 700; display: block; margin-bottom: 4px;">Mảnh gây nhiễu thêm vào (tùy chọn, ngăn cách bởi dấu <code>|</code>):</label>
        <input type="text" class="form-control ca-wo-distractors" data-idx="${idx}" value="${shared.escapeHtml(distractors.map(t => t.text).join(' | '))}" placeholder="Ví dụ: 吗 | 没 | 很" ${disabledAttr} style="height: 36px; font-size: 13px;">
      </div>
    `;
  }

  function renderMatchingEditorBody(q, idx) {
    const shared = S();
    const pairs = (q.answer_payload && Array.isArray(q.answer_payload.pairs)) ? q.answer_payload.pairs : [];
    const disabledAttr = state.questionsLocked ? 'disabled' : '';

    return `
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;">
        ${pairs.map((p, pi) => `
          <div class="ca-match-row">
            <input type="text" class="form-control ca-match-left" data-idx="${idx}" data-pi="${pi}" value="${shared.escapeHtml(p.left_text)}" placeholder="Vế trái #${pi + 1} (vd: 打篮球)" maxlength="${shared.LIMITS.OPTION}" ${disabledAttr} style="height: 36px; font-size: 13px;">
            <input type="text" class="form-control ca-match-right" data-idx="${idx}" data-pi="${pi}" value="${shared.escapeHtml(p.right_text)}" placeholder="Vế phải #${pi + 1} (vd: Chơi bóng rổ)" maxlength="${shared.LIMITS.OPTION}" ${disabledAttr} style="height: 36px; font-size: 13px;">
            ${(!state.questionsLocked && pairs.length > 2) ? `<button type="button" class="btn btn-outline btn-sm ca-match-del-pair" data-idx="${idx}" data-pi="${pi}" style="color: var(--danger); padding: 4px 10px; min-height: 36px; min-width: 36px;">&times;</button>` : '<span></span>'}
          </div>
        `).join('')}
      </div>
      ${(!state.questionsLocked && pairs.length < 12) ? `
        <button type="button" class="btn btn-outline btn-sm ca-match-add-pair" data-idx="${idx}" style="font-size: 12px; min-height: 36px;">➕ Thêm cặp nối (${pairs.length}/12)</button>
      ` : ''}
    `;
  }

  function disconnectNavObserver() {
    if (qObserver) {
      qObserver.disconnect();
      qObserver = null;
    }
    if (scrollTrackRaf !== null) {
      cancelAnimationFrame(scrollTrackRaf);
      scrollTrackRaf = null;
    }
  }

  function formatCompactCardErrors(qErrs) {
    const unique = [];
    const seen = new Set();
    (Array.isArray(qErrs) ? qErrs : []).forEach(msg => {
      const clean = String(msg || '').trim();
      if (!clean || seen.has(clean)) return;
      seen.add(clean);
      unique.push(clean);
    });
    return {
      total: unique.length,
      visible: unique.slice(0, 3),
      extraCount: Math.max(0, unique.length - 3)
    };
  }

  function renderCardErrorHtml(qErrs) {
    const shared = S();
    const info = formatCompactCardErrors(qErrs);
    if (info.total === 0) return '';
    const itemsHtml = info.visible.map(err => `<li>${shared.escapeHtml(err)}</li>`).join('');
    const extraHtml = info.extraCount > 0
      ? `<div style="margin-top: 3px; font-weight: 700;">và ${info.extraCount} lỗi khác</div>`
      : '';
    return `
      <div class="ca-q-body-errors">
        <ul>${itemsHtml}</ul>
        ${extraHtml}
      </div>
    `;
  }

  function renderTypeEditorHtml(q, idx) {
    if (q.question_type === 'mcq') return renderMcqEditorBody(q, idx);
    if (q.question_type === 'true_false') return renderTrueFalseEditorBody(q, idx);
    if (q.question_type === 'fill_blank') return renderFillBlankEditorBody(q, idx);
    if (q.question_type === 'translation') return renderTranslationEditorBody(q, idx);
    if (q.question_type === 'word_order') return renderWordOrderEditorBody(q, idx);
    if (q.question_type === 'matching') return renderMatchingEditorBody(q, idx);
    return '';
  }

  function renderSingleQuestionCardHtml(q, idx) {
    const shared = S();
    const isCollapsed = isQuestionCollapsed(q);
    const qErrs = shared.validateQuestion(q, idx);
    const tMeta = shared.QUESTION_TYPES[q.question_type] || { icon: '❓', shortLabel: q.question_type };
    const disabledAttr = state.questionsLocked ? 'disabled' : '';
    const typeEditorHtml = isCollapsed ? '' : renderTypeEditorHtml(q, idx);

    return `
      <div class="ca-q-card ${isCollapsed ? 'is-collapsed' : 'is-expanded'} ${qErrs.length > 0 ? 'has-error' : ''}" data-qidx="${idx}" draggable="${!state.questionsLocked && isCollapsed ? 'true' : 'false'}">
        <div class="ca-q-header" data-toggle-idx="${idx}">
          <div class="ca-q-header-main">
            <span class="ca-q-badge">${tMeta.icon} Câu ${idx + 1}: ${shared.escapeHtml(tMeta.shortLabel)}</span>
            <span class="ca-q-points-chip" data-role="points-chip">${Number(q.points || 1)}đ</span>
            <span class="ca-q-status-chip ${qErrs.length > 0 ? 'is-warn' : 'is-ok'}" data-role="status-chip">${qErrs.length > 0 ? '⚠️ Thiếu thông tin' : '✓ Đủ ý'}</span>
            <div class="ca-q-preview-title" data-role="preview-title">${shared.escapeHtml(shared.safeStr(q.prompt_text, '(Chưa nhập đề bài)'))}</div>
          </div>
          <div class="ca-q-header-actions">
            ${!state.questionsLocked ? `
              <button type="button" class="btn btn-outline btn-sm ca-q-action-btn ca-q-collapsed-hide-sm ca-q-move-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} title="Đưa lên">▲</button>
              <button type="button" class="btn btn-outline btn-sm ca-q-action-btn ca-q-collapsed-hide-sm ca-q-move-down" data-idx="${idx}" ${idx === state.questions.length - 1 ? 'disabled' : ''} title="Đưa xuống">▼</button>
              <button type="button" class="btn btn-outline btn-sm ca-q-action-btn ca-q-collapsed-hide-sm ca-q-dup" data-idx="${idx}" title="Nhân bản câu">📋</button>
              <button type="button" class="btn btn-outline btn-sm ca-q-action-btn ca-q-del" data-idx="${idx}" title="Xóa câu" style="color: var(--danger); border-color: var(--danger-border);">🗑️</button>
            ` : ''}
            <button type="button" class="btn btn-outline btn-sm ca-q-action-btn ca-q-toggle" data-idx="${idx}">${isCollapsed ? 'Mở' : 'Thu gọn'}</button>
          </div>
        </div>

        ${!isCollapsed ? `
          <div class="ca-q-body">
            <div data-role="error-host">${renderCardErrorHtml(qErrs)}</div>
            <div class="ca-q-prompt-row">
              <div>
                <label style="font-size: 12px; font-weight: 700; display: block; margin-bottom: 4px;">Đề bài / Câu hỏi *</label>
                <textarea class="form-control ca-q-prompt" data-idx="${idx}" rows="2" maxlength="${shared.LIMITS.PROMPT}" placeholder="Nhập câu hỏi, tiếng Trung hoặc mệnh đề..." ${disabledAttr} style="font-size: 14px;">${shared.escapeHtml(q.prompt_text)}</textarea>
              </div>
              <div>
                <label style="font-size: 12px; font-weight: 700; display: block; margin-bottom: 4px;">Điểm</label>
                <input type="number" step="0.5" min="0.5" max="100" class="form-control ca-q-points" data-idx="${idx}" value="${Number(q.points || 1)}" ${disabledAttr} style="height: 40px;">
              </div>
            </div>

            <div data-role="type-editor-host">${typeEditorHtml}</div>

            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border-color);">
              <label style="font-size: 12px; font-weight: 700; display: block; margin-bottom: 4px;">Giải thích sau khi làm (tùy chọn):</label>
              <input type="text" class="form-control ca-q-explanation" data-idx="${idx}" value="${shared.escapeHtml(q.explanation || '')}" maxlength="${shared.LIMITS.EXPLANATION}" placeholder="Giải thích ngữ pháp, nghĩa từ hoặc mẹo nhớ..." ${disabledAttr} style="height: 36px; font-size: 13px;">
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function updateToolbarCollapseButtons() {
    const btnCol = el('btn-ca-collapse-all');
    const btnExp = el('btn-ca-expand-all');
    const total = state.questions.length;
    let collapsedCount = 0;
    state.questions.forEach(q => {
      if (isQuestionCollapsed(q)) collapsedCount++;
    });
    if (btnCol) btnCol.disabled = (total === 0 || collapsedCount === total);
    if (btnExp) btnExp.disabled = (total === 0 || collapsedCount === 0);
  }

  function setActiveNavPill(idx) {
    activeNavIdx = idx;
    const pillsHost = el('ca-builder-nav-pills');
    if (!pillsHost) return;
    let activePillEl = null;
    pillsHost.querySelectorAll('.ca-q-pill').forEach(pill => {
      const pIdx = parseInt(pill.dataset.qidx, 10);
      const isMatch = pIdx === idx;
      pill.classList.toggle('is-in-view', isMatch);
      if (isMatch) activePillEl = pill;
    });
    if (activePillEl) {
      const hostLeft = pillsHost.scrollLeft;
      const hostRight = hostLeft + pillsHost.clientWidth;
      const pillLeft = activePillEl.offsetLeft;
      const pillRight = pillLeft + activePillEl.offsetWidth;
      if (pillLeft < hostLeft + 6) {
        pillsHost.scrollLeft = Math.max(0, pillLeft - 10);
      } else if (pillRight > hostRight - 6) {
        pillsHost.scrollLeft = pillRight - pillsHost.clientWidth + 10;
      }
    }
  }

  function updateInViewQuestionFromScroll() {
    const modalBody = el('ca-modal-body');
    const container = el('ca-questions-list');
    if (!modalBody || !container || state.questions.length === 0) return;
    const toolbar = el('ca-step2-toolbar');
    const stickyBottom = toolbar ? toolbar.getBoundingClientRect().bottom : modalBody.getBoundingClientRect().top;
    const cards = Array.from(container.querySelectorAll('.ca-q-card'));
    if (cards.length === 0) return;

    let bestIdx = 0;
    let foundVisible = false;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (r.bottom > stickyBottom + 10) {
        bestIdx = parseInt(cards[i].dataset.qidx || String(i), 10);
        foundVisible = true;
        break;
      }
    }
    if (!foundVisible) {
      const lastCard = cards[cards.length - 1];
      bestIdx = parseInt(lastCard.dataset.qidx || String(cards.length - 1), 10);
    }
    if (bestIdx !== activeNavIdx) {
      setActiveNavPill(bestIdx);
    }
  }

  function setupNavObserver() {
    disconnectNavObserver();
    const modalBody = el('ca-modal-body');
    const container = el('ca-questions-list');
    if (!modalBody || !container || state.questions.length === 0) return;

    if (!scrollTrackBound) {
      scrollTrackBound = true;
      modalBody.addEventListener('scroll', () => {
        if (state.step !== 2 || scrollTrackRaf !== null) return;
        scrollTrackRaf = requestAnimationFrame(() => {
          scrollTrackRaf = null;
          updateInViewQuestionFromScroll();
        });
      }, { passive: true });
    }

    if (typeof IntersectionObserver === 'function') {
      const toolbar = el('ca-step2-toolbar');
      const stickyH = (toolbar && toolbar.offsetHeight) ? toolbar.offsetHeight : 0;
      qObserver = new IntersectionObserver(() => {
        updateInViewQuestionFromScroll();
      }, {
        root: modalBody,
        rootMargin: `-${stickyH + 4}px 0px -30% 0px`,
        threshold: [0, 0.1, 0.25, 0.5]
      });
      container.querySelectorAll('.ca-q-card').forEach(card => qObserver.observe(card));
    }
    updateInViewQuestionFromScroll();
  }

  function renderNavPills() {
    const strip = el('ca-builder-nav-strip');
    const pillsHost = el('ca-builder-nav-pills');
    if (!strip || !pillsHost) return;
    if (state.questions.length === 0) {
      strip.style.display = 'none';
      pillsHost.innerHTML = '';
      return;
    }
    const shared = S();
    strip.style.display = 'flex';
    const clampedActive = Math.max(0, Math.min(state.questions.length - 1, activeNavIdx));
    activeNavIdx = clampedActive;

    pillsHost.innerHTML = state.questions.map((q, idx) => {
      const qErrs = shared.validateQuestion(q, idx);
      const tMeta = shared.QUESTION_TYPES[q.question_type] || { shortLabel: q.question_type };
      const hasErr = qErrs.length > 0;
      const isCur = idx === clampedActive;
      const tip = `Câu ${idx + 1} (${shared.escapeHtml(tMeta.shortLabel)})${hasErr ? ' - Thiếu thông tin' : ' - Đủ ý'}`;
      return `<button type="button" class="ca-q-pill ${hasErr ? 'has-warning' : ''} ${isCur ? 'is-in-view' : ''}" data-qidx="${idx}" title="${tip}">${idx + 1}</button>`;
    }).join('');

    pillsHost.querySelectorAll('.ca-q-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.qidx, 10);
        if (!isNaN(idx)) {
          scrollToQuestion(idx, { behavior: 'smooth' });
        }
      });
    });
  }

  function scrollToQuestion(idx, { behavior = 'smooth', focusPrompt = false, highlightError = false } = {}) {
    const modalBody = el('ca-modal-body');
    const container = el('ca-questions-list');
    if (!container) return;
    const card = container.querySelector(`.ca-q-card[data-qidx="${idx}"]`);
    if (!card) return;

    if (modalBody) {
      const toolbar = el('ca-step2-toolbar');
      const stickyH = (toolbar && toolbar.offsetHeight) ? toolbar.offsetHeight : 0;
      const bodyRect = modalBody.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const targetTop = Math.max(0, modalBody.scrollTop + (cardRect.top - bodyRect.top) - stickyH - 10);
      if (typeof modalBody.scrollTo === 'function') {
        modalBody.scrollTo({ top: targetTop, behavior });
      } else {
        modalBody.scrollTop = targetTop;
      }
    } else if (typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ behavior, block: 'nearest' });
    }

    setActiveNavPill(idx);

    if (highlightError) {
      card.classList.remove('is-error-focus');
      void card.offsetWidth;
      card.classList.add('is-error-focus');
      clearTimeout(card._errFlashTimer);
      card._errFlashTimer = setTimeout(() => {
        card.classList.remove('is-error-focus');
      }, 2200);
    }

    if (focusPrompt) {
      const promptInp = card.querySelector('.ca-q-prompt');
      if (promptInp && !promptInp.disabled) {
        try {
          promptInp.focus({ preventScroll: true });
          const len = promptInp.value.length;
          if (typeof promptInp.setSelectionRange === 'function') {
            promptInp.setSelectionRange(len, len);
          }
        } catch (e) {}
      }
    }
  }

  function syncQuestionValidationUi(idx) {
    const container = el('ca-questions-list');
    const shared = S();
    const q = state.questions[idx];
    if (!container || !q) return;

    const card = container.querySelector(`.ca-q-card[data-qidx="${idx}"]`);
    if (!card) return;

    const modalBody = el('ca-modal-body');
    const activeEl = document.activeElement;
    const activeInsideCard = Boolean(activeEl && card.contains(activeEl));
    const prevTop = activeInsideCard ? activeEl.getBoundingClientRect().top : null;

    const qErrs = shared.validateQuestion(q, idx);
    card.classList.toggle('has-error', qErrs.length > 0);

    const statusEl = card.querySelector('[data-role="status-chip"]');
    if (statusEl) {
      statusEl.className = `ca-q-status-chip ${qErrs.length > 0 ? 'is-warn' : 'is-ok'}`;
      statusEl.textContent = qErrs.length > 0 ? '⚠️ Thiếu thông tin' : '✓ Đủ ý';
    }

    const previewEl = card.querySelector('[data-role="preview-title"]');
    if (previewEl) {
      previewEl.textContent = shared.safeStr(q.prompt_text, '(Chưa nhập đề bài)');
    }

    const ptsEl = card.querySelector('[data-role="points-chip"]');
    if (ptsEl) {
      ptsEl.textContent = `${q.points || 1}đ`;
    }

    const errHost = card.querySelector('[data-role="error-host"]');
    if (errHost) {
      errHost.innerHTML = renderCardErrorHtml(qErrs);
    }

    const pill = document.querySelector(`#ca-builder-nav-pills .ca-q-pill[data-qidx="${idx}"]`);
    if (pill) {
      const tMeta = shared.QUESTION_TYPES[q.question_type] || { shortLabel: q.question_type };
      pill.classList.toggle('has-warning', qErrs.length > 0);
      pill.title = `Câu ${idx + 1} (${tMeta.shortLabel})${qErrs.length > 0 ? ' - Thiếu thông tin' : ' - Đủ ý'}`;
    }

    if (activeInsideCard && modalBody && prevTop !== null) {
      const nextTop = activeEl.getBoundingClientRect().top;
      const deltaY = nextTop - prevTop;
      if (Math.abs(deltaY) > 0.5) {
        modalBody.scrollTop += deltaY;
      }
    }
  }

  function refreshTypeBodyInPlace(idx) {
    const container = el('ca-questions-list');
    const modalBody = el('ca-modal-body');
    const q = state.questions[idx];
    if (!container || !q) return;

    const card = container.querySelector(`.ca-q-card[data-qidx="${idx}"]`);
    if (!card) return;
    const typeHost = card.querySelector('[data-role="type-editor-host"]');
    if (!typeHost) return;

    const prevScrollTop = modalBody ? modalBody.scrollTop : 0;
    typeHost.innerHTML = renderTypeEditorHtml(q, idx);
    bindTypeEditorEvents(typeHost);
    syncQuestionValidationUi(idx);
    if (modalBody) modalBody.scrollTop = prevScrollTop;
  }

  function rerenderSingleCard(idx) {
    const container = el('ca-questions-list');
    const modalBody = el('ca-modal-body');
    const q = state.questions[idx];
    if (!container || !q) return;
    const oldCard = container.querySelector(`.ca-q-card[data-qidx="${idx}"]`);
    if (!oldCard) return;

    const prevScrollTop = modalBody ? modalBody.scrollTop : 0;
    const temp = document.createElement('div');
    temp.innerHTML = renderSingleQuestionCardHtml(q, idx).trim();
    const newCard = temp.firstElementChild;
    if (!newCard) return;

    container.replaceChild(newCard, oldCard);
    bindCardElementEvents(newCard);
    updateToolbarCollapseButtons();
    if (qObserver) {
      qObserver.unobserve(oldCard);
      qObserver.observe(newCard);
    }
    if (modalBody) modalBody.scrollTop = prevScrollTop;
    updateInViewQuestionFromScroll();
  }

  function findFirstInvalidQuestionIndex() {
    const shared = S();
    for (let i = 0; i < state.questions.length; i++) {
      if (shared.validateQuestion(state.questions[i], i).length > 0) {
        return i;
      }
    }
    return -1;
  }

  function focusFirstInvalidQuestion(errIdx) {
    const shared = S();
    const q = state.questions[errIdx];
    if (!q) return;
    const errs = shared.validateQuestion(q, errIdx);
    const wasCollapsed = isQuestionCollapsed(q);
    if (wasCollapsed) {
      setQuestionCollapsed(q, false);
      rerenderSingleCard(errIdx);
    }
    syncQuestionValidationUi(errIdx);
    showModalAlert(errs[0] || `Câu ${errIdx + 1} còn thiếu thông tin. Vui lòng hoàn thiện trước khi tiếp tục!`);
    scrollToQuestion(errIdx, { behavior: 'smooth', highlightError: true });
  }

  function renderQuestionsBuilder(opts = {}) {
    const container = el('ca-questions-list');
    if (!container) return;
    const modalBody = el('ca-modal-body');
    const prevScrollTop = modalBody ? modalBody.scrollTop : 0;
    updateCountsHeader();
    updateToolbarCollapseButtons();

    if (state.questions.length === 0) {
      disconnectNavObserver();
      renderNavPills();
      container.innerHTML = `
        <div style="text-align: center; padding: 28px 16px; border: 1.5px dashed var(--border-color); border-radius: var(--radius-sm); color: var(--text-muted); font-size: 13.5px;">
          Chưa có câu hỏi nào. Bấm các nút <strong>+ Trắc nghiệm / Đúng-Sai / Điền từ...</strong> hoặc <strong>⚡ Sinh nhanh từ từ vựng</strong> ở trên để bắt đầu!
        </div>
      `;
      return;
    }

    container.innerHTML = state.questions.map((q, idx) => renderSingleQuestionCardHtml(q, idx)).join('');
    bindQuestionCardEvents(container);
    renderNavPills();
    setupNavObserver();

    if (opts.preserveScroll && modalBody) {
      const maxScroll = Math.max(0, modalBody.scrollHeight - modalBody.clientHeight);
      modalBody.scrollTop = Math.min(prevScrollTop, maxScroll);
      updateInViewQuestionFromScroll();
    }
  }

  function bindCardElementEvents(card) {
    if (!card) return;
    const shared = S();
    const container = el('ca-questions-list');

    const header = card.querySelector('.ca-q-header');
    const toggleBtn = card.querySelector('.ca-q-toggle');
    const handleToggle = () => {
      const idx = parseInt(card.dataset.qidx, 10);
      const q = state.questions[idx];
      if (!q) return;
      setQuestionCollapsed(q, !isQuestionCollapsed(q));
      rerenderSingleCard(idx);
    };

    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleToggle();
      });
    }
    if (header) {
      header.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (card.classList.contains('is-collapsed')) {
          handleToggle();
        }
      });
    }

    const moveUpBtn = card.querySelector('.ca-q-move-up');
    if (moveUpBtn) {
      moveUpBtn.addEventListener('click', () => {
        const i = parseInt(moveUpBtn.dataset.idx, 10);
        if (i <= 0 || state.questionsLocked) return;
        [state.questions[i - 1], state.questions[i]] = [state.questions[i], state.questions[i - 1]];
        renderQuestionsBuilder({ preserveScroll: true });
        scrollToQuestion(i - 1, { behavior: 'smooth' });
      });
    }

    const moveDownBtn = card.querySelector('.ca-q-move-down');
    if (moveDownBtn) {
      moveDownBtn.addEventListener('click', () => {
        const i = parseInt(moveDownBtn.dataset.idx, 10);
        if (i >= state.questions.length - 1 || state.questionsLocked) return;
        [state.questions[i + 1], state.questions[i]] = [state.questions[i], state.questions[i + 1]];
        renderQuestionsBuilder({ preserveScroll: true });
        scrollToQuestion(i + 1, { behavior: 'smooth' });
      });
    }

    const dupBtn = card.querySelector('.ca-q-dup');
    if (dupBtn) {
      dupBtn.addEventListener('click', () => {
        if (state.questionsLocked || state.questions.length >= shared.MAX_QUESTIONS) {
          if (state.questions.length >= shared.MAX_QUESTIONS) showModalAlert(`Đã đạt giới hạn tối đa ${shared.MAX_QUESTIONS} câu mỗi bài!`);
          return;
        }
        const i = parseInt(dupBtn.dataset.idx, 10);
        const clone = JSON.parse(JSON.stringify(state.questions[i]));
        state.questions.splice(i + 1, 0, clone);
        renderQuestionsBuilder({ preserveScroll: true });
        scrollToQuestion(i + 1, { behavior: 'smooth', focusPrompt: true });
      });
    }

    const delBtn = card.querySelector('.ca-q-del');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (state.questionsLocked) return;
        const i = parseInt(delBtn.dataset.idx, 10);
        state.questions.splice(i, 1);
        renderQuestionsBuilder({ preserveScroll: true });
      });
    }

    if (container && !state.questionsLocked) {
      if (card.getAttribute('draggable') === 'true') {
        card.addEventListener('dragstart', () => { container._dragSrcIdx = parseInt(card.dataset.qidx, 10); });
        card.addEventListener('dragend', () => { container._dragSrcIdx = null; });
      }
      card.addEventListener('dragover', (e) => { e.preventDefault(); });
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        const srcIdx = container._dragSrcIdx;
        container._dragSrcIdx = null;
        const targetIdx = parseInt(card.dataset.qidx, 10);
        if (srcIdx === null || srcIdx === undefined || isNaN(targetIdx) || srcIdx === targetIdx || state.questionsLocked) return;
        const moved = state.questions.splice(srcIdx, 1)[0];
        state.questions.splice(targetIdx, 0, moved);
        renderQuestionsBuilder({ preserveScroll: true });
        scrollToQuestion(targetIdx, { behavior: 'smooth' });
      });
    }

    const promptInp = card.querySelector('.ca-q-prompt');
    if (promptInp) {
      promptInp.addEventListener('input', () => {
        const i = parseInt(promptInp.dataset.idx, 10);
        const q = state.questions[i];
        if (!q) return;
        const prevBlanks = shared.countBlanksInPrompt(q.prompt_text);
        q.prompt_text = promptInp.value;
        if (q.question_type === 'fill_blank' && shared.countBlanksInPrompt(q.prompt_text) !== prevBlanks) {
          syncFillBlanksArray(q);
          refreshTypeBodyInPlace(i);
          return;
        }
        syncQuestionValidationUi(i);
      });
    }

    const ptsInp = card.querySelector('.ca-q-points');
    if (ptsInp) {
      ptsInp.addEventListener('input', () => {
        const i = parseInt(ptsInp.dataset.idx, 10);
        if (!state.questions[i]) return;
        state.questions[i].points = parseFloat(ptsInp.value) || 1;
        updateCountsHeader();
        syncQuestionValidationUi(i);
      });
    }

    const expInp = card.querySelector('.ca-q-explanation');
    if (expInp) {
      expInp.addEventListener('input', () => {
        const i = parseInt(expInp.dataset.idx, 10);
        if (!state.questions[i]) return;
        state.questions[i].explanation = expInp.value;
        syncQuestionValidationUi(i);
      });
    }

    const typeHost = card.querySelector('[data-role="type-editor-host"]');
    if (typeHost) bindTypeEditorEvents(typeHost);
  }

  function bindTypeEditorEvents(scope) {
    if (!scope) return;
    const shared = S();

    // MCQ events
    scope.querySelectorAll('.ca-mcq-multi').forEach(chk => chk.addEventListener('change', () => {
      const i = parseInt(chk.dataset.idx, 10);
      const q = state.questions[i];
      q.question_payload.allow_multiple = chk.checked;
      if (!chk.checked && q.answer_payload.correct_option_ids.length > 1) {
        q.answer_payload.correct_option_ids = [q.answer_payload.correct_option_ids[0]];
      }
      refreshTypeBodyInPlace(i);
    }));

    scope.querySelectorAll('.ca-mcq-correct').forEach(inp => inp.addEventListener('change', () => {
      const i = parseInt(inp.dataset.idx, 10);
      const q = state.questions[i];
      const optId = inp.dataset.optId;
      if (q.question_payload.allow_multiple) {
        const set = new Set(q.answer_payload.correct_option_ids || []);
        if (inp.checked) set.add(optId);
        else set.delete(optId);
        q.answer_payload.correct_option_ids = Array.from(set);
      } else {
        q.answer_payload.correct_option_ids = [optId];
      }
      syncQuestionValidationUi(i);
    }));

    scope.querySelectorAll('.ca-mcq-opt-text').forEach(inp => inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.idx, 10);
      const oi = parseInt(inp.dataset.oi, 10);
      state.questions[i].question_payload.options[oi].text = inp.value;
      syncQuestionValidationUi(i);
    }));

    scope.querySelectorAll('.ca-mcq-add-opt').forEach(b => b.addEventListener('click', () => {
      const i = parseInt(b.dataset.idx, 10);
      const opts = state.questions[i].question_payload.options;
      if (opts.length >= 6) return;
      opts.push({ id: `opt_${Date.now()}_${opts.length + 1}`, text: '' });
      refreshTypeBodyInPlace(i);
    }));

    scope.querySelectorAll('.ca-mcq-del-opt').forEach(b => b.addEventListener('click', () => {
      const i = parseInt(b.dataset.idx, 10);
      const oi = parseInt(b.dataset.oi, 10);
      const q = state.questions[i];
      if (q.question_payload.options.length <= 2) return;
      const removed = q.question_payload.options.splice(oi, 1)[0];
      q.answer_payload.correct_option_ids = (q.answer_payload.correct_option_ids || []).filter(id => id !== removed.id);
      if (q.answer_payload.correct_option_ids.length === 0) {
        q.answer_payload.correct_option_ids = [q.question_payload.options[0].id];
      }
      refreshTypeBodyInPlace(i);
    }));

    // True/False
    scope.querySelectorAll('.ca-tf-radio').forEach(r => r.addEventListener('change', () => {
      const i = parseInt(r.dataset.idx, 10);
      state.questions[i].answer_payload.correct_boolean = (r.value === 'true');
      syncQuestionValidationUi(i);
    }));

    // Fill Blank
    scope.querySelectorAll('.ca-fb-insert-blank').forEach(b => b.addEventListener('click', () => {
      const i = parseInt(b.dataset.idx, 10);
      const q = state.questions[i];
      q.prompt_text = (q.prompt_text || '').trimEnd() + (q.prompt_text ? ' ___' : '___');
      const card = scope.closest('.ca-q-card');
      const promptInp = card ? card.querySelector('.ca-q-prompt') : null;
      if (promptInp) promptInp.value = q.prompt_text;
      syncFillBlanksArray(q);
      refreshTypeBodyInPlace(i);
      if (promptInp) {
        try { promptInp.focus({ preventScroll: true }); } catch (e) {}
      }
    }));

    scope.querySelectorAll('.ca-fb-blank-ans').forEach(ta => ta.addEventListener('input', () => {
      const i = parseInt(ta.dataset.idx, 10);
      const bi = parseInt(ta.dataset.bi, 10);
      const list = ta.value.split(/[\n|]+/).map(x => x.trim()).filter(Boolean);
      state.questions[i].answer_payload.blanks[bi] = { accepted: list };
      syncQuestionValidationUi(i);
    }));

    scope.querySelectorAll('.ca-fb-opt').forEach(chk => chk.addEventListener('change', () => {
      const i = parseInt(chk.dataset.idx, 10);
      state.questions[i].question_payload[chk.dataset.key] = chk.checked;
      syncQuestionValidationUi(i);
    }));

    scope.querySelectorAll('.ca-fb-mode').forEach(sel => sel.addEventListener('change', () => {
      const i = parseInt(sel.dataset.idx, 10);
      state.questions[i].question_payload.input_mode = sel.value;
      refreshTypeBodyInPlace(i);
    }));

    scope.querySelectorAll('.ca-fb-bank-input').forEach(inp => inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.idx, 10);
      state.questions[i].question_payload.word_bank = inp.value.split(/[\n|]+/).map(x => x.trim()).filter(Boolean);
      syncQuestionValidationUi(i);
    }));

    scope.querySelectorAll('.ca-fb-fill-bank').forEach(b => b.addEventListener('click', () => {
      const i = parseInt(b.dataset.idx, 10);
      const q = state.questions[i];
      const existing = new Set((q.question_payload.word_bank || []).map(x => x.trim()).filter(Boolean));
      (q.answer_payload.blanks || []).forEach(bl => {
        if (bl.accepted && bl.accepted[0]) existing.add(bl.accepted[0].trim());
      });
      q.question_payload.word_bank = Array.from(existing);
      refreshTypeBodyInPlace(i);
    }));

    // Translation
    scope.querySelectorAll('.ca-tr-dir').forEach(sel => sel.addEventListener('change', () => {
      const i = parseInt(sel.dataset.idx, 10);
      state.questions[i].question_payload.direction = sel.value;
    }));
    scope.querySelectorAll('.ca-tr-manual').forEach(chk => chk.addEventListener('change', () => {
      const i = parseInt(chk.dataset.idx, 10);
      state.questions[i].question_payload.requires_manual_grading = chk.checked;
      refreshTypeBodyInPlace(i);
    }));
    scope.querySelectorAll('.ca-tr-answers').forEach(ta => ta.addEventListener('input', () => {
      const i = parseInt(ta.dataset.idx, 10);
      state.questions[i].answer_payload.accepted_answers = ta.value.split('\n').map(x => x.trim()).filter(Boolean);
      syncQuestionValidationUi(i);
    }));

    // Word Order
    scope.querySelectorAll('.ca-wo-sentence').forEach(inp => inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.idx, 10);
      state.questions[i].answer_payload.correct_sentence = inp.value;
    }));
    scope.querySelectorAll('.ca-wo-split-btn').forEach(b => b.addEventListener('click', () => {
      const i = parseInt(b.dataset.idx, 10);
      const q = state.questions[i];
      const parts = shared.tokenizeSentenceForWordOrder(q.answer_payload.correct_sentence || '');
      q.answer_payload.tokens = parts.map((txt, ti) => ({ id: `t_${ti + 1}`, text: txt }));
      refreshTypeBodyInPlace(i);
    }));
    scope.querySelectorAll('.ca-wo-tokens-edit').forEach(inp => inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.idx, 10);
      const parts = inp.value.split('|').map(x => x.trim()).filter(Boolean);
      const tokens = parts.map((txt, ti) => ({ id: `t_${ti + 1}`, text: txt }));
      state.questions[i].answer_payload.tokens = tokens;
      const badgeHost = scope.querySelector('[data-role="wo-token-badges"]');
      if (badgeHost) {
        badgeHost.innerHTML = tokens.map((t, ti) => `<span class="import-badge-pill">${ti + 1}. ${shared.escapeHtml(t.text)}</span>`).join('');
      }
      syncQuestionValidationUi(i);
    }));
    scope.querySelectorAll('.ca-wo-distractors').forEach(inp => inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.idx, 10);
      const parts = inp.value.split('|').map(x => x.trim()).filter(Boolean);
      state.questions[i].answer_payload.distractor_tokens = parts.map((txt, ti) => ({ id: `d_${ti + 1}`, text: txt }));
      syncQuestionValidationUi(i);
    }));

    // Matching
    scope.querySelectorAll('.ca-match-left').forEach(inp => inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.idx, 10);
      const pi = parseInt(inp.dataset.pi, 10);
      state.questions[i].answer_payload.pairs[pi].left_text = inp.value;
      syncQuestionValidationUi(i);
    }));
    scope.querySelectorAll('.ca-match-right').forEach(inp => inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.idx, 10);
      const pi = parseInt(inp.dataset.pi, 10);
      state.questions[i].answer_payload.pairs[pi].right_text = inp.value;
      syncQuestionValidationUi(i);
    }));
    scope.querySelectorAll('.ca-match-add-pair').forEach(b => b.addEventListener('click', () => {
      const i = parseInt(b.dataset.idx, 10);
      const pairs = state.questions[i].answer_payload.pairs;
      if (pairs.length >= 12) return;
      pairs.push({ left_text: '', right_text: '' });
      refreshTypeBodyInPlace(i);
    }));
    scope.querySelectorAll('.ca-match-del-pair').forEach(b => b.addEventListener('click', () => {
      const i = parseInt(b.dataset.idx, 10);
      const pi = parseInt(b.dataset.pi, 10);
      const pairs = state.questions[i].answer_payload.pairs;
      if (pairs.length <= 2) return;
      pairs.splice(pi, 1);
      refreshTypeBodyInPlace(i);
    }));
  }

  function bindQuestionCardEvents(container) {
    container.querySelectorAll('.ca-q-card').forEach(card => {
      bindCardElementEvents(card);
    });
  }

  // ---------------------------------------------------------------------------
  // BƯỚC 4: TỔNG QUAN KIỂM TRA & XEM TRƯỚC NHƯ HỌC VIÊN
  // ---------------------------------------------------------------------------
  function renderStep4SummaryAndValidation() {
    const shared = S();
    const title = (el('assign-title') && el('assign-title').value.trim()) || '';
    const dueDate = (el('assign-due-date') && el('assign-due-date').value) || '';
    const rewardXp = (el('assign-xp') && el('assign-xp').value) || 30;
    const settings = readSettingsFromDom();

    const checkPublish = shared.validateCustomAssignment({
      title,
      dueDate,
      rewardXp,
      settings,
      questions: state.questions,
      isPublished: true
    });

    const valBox = el('ca-validation-summary');
    if (valBox) {
      if (checkPublish.valid) {
        valBox.innerHTML = `
          <div style="padding: 12px 14px; border-radius: var(--radius-sm); background: var(--success-bg); border: 1px solid var(--success-border); color: var(--success); font-size: 13.5px; font-weight: 600;">
            ✅ Bài tập hợp lệ và sẵn sàng giao! Gồm <strong>${state.questions.length} câu hỏi</strong> · Tổng <strong>${Math.round(state.questions.reduce((s, q) => s + Number(q.points || 1), 0) * 100) / 100} điểm</strong>.
          </div>
        `;
      } else {
        valBox.innerHTML = `
          <div style="padding: 12px 14px; border-radius: var(--radius-sm); background: var(--danger-bg); border: 1px solid var(--danger-border); color: var(--danger); font-size: 13px;">
            <div style="font-weight: 700; margin-bottom: 6px;">⚠️ Vui lòng kiểm tra lại các lỗi sau trước khi Giao ngay (hoặc chọn Lưu nháp để hoàn thiện sau):</div>
            <ul style="margin: 0 0 0 18px; padding: 0;">${checkPublish.errors.map(err => `<li>${shared.escapeHtml(err)}</li>`).join('')}</ul>
          </div>
        `;
      }
    }

    const overviewCard = el('ca-overview-card');
    if (overviewCard) {
      const revealLabels = {
        immediate: 'Hiện đáp án ngay sau mỗi câu',
        after_submit: 'Hiện đáp án sau khi nộp bài',
        after_due: 'Chỉ hiện đáp án sau hạn chót',
        never: 'Không hiển thị đáp án'
      };
      overviewCard.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; font-size: 13px;">
          <div><span style="color: var(--text-muted);">Tiêu đề:</span><br><strong>${shared.escapeHtml(title || '(Chưa đặt)')}</strong></div>
          <div><span style="color: var(--text-muted);">Xáo trộn:</span><br><strong>${settings.shuffle_questions ? 'Xáo câu' : 'Giữ câu'} · ${settings.shuffle_options ? 'Xáo đáp án' : 'Giữ đáp án'}</strong></div>
          <div><span style="color: var(--text-muted);">Thời gian & Lượt:</span><br><strong>${settings.time_limit_minutes ? settings.time_limit_minutes + ' phút' : 'Không giới hạn'} · ${settings.max_attempts ? settings.max_attempts + ' lượt' : 'Vô hạn lượt'}</strong></div>
          <div><span style="color: var(--text-muted);">Ngưỡng đạt & Đáp án:</span><br><strong>≥ ${settings.pass_score_percent}% · ${shared.escapeHtml(revealLabels[settings.answer_reveal_mode] || '')}</strong></div>
        </div>
      `;
    }
  }

  function launchInlineStudentPreview() {
    const host = el('ca-preview-inline-host');
    if (!host) return;
    if (state.questions.length === 0) {
      showModalAlert('Hãy thêm ít nhất 1 câu hỏi ở Bước 2 để xem trước!');
      return;
    }
    if (!window.StudentCustomAssignment || typeof window.StudentCustomAssignment.renderPreviewInContainer !== 'function') {
      showModalAlert('Chưa nạp xong giao diện xem trước học viên!');
      return;
    }

    const settings = readSettingsFromDom();
    const title = (el('assign-title') && el('assign-title').value.trim()) || 'Xem trước bài tập';
    host.style.display = 'block';
    window.StudentCustomAssignment.renderPreviewInContainer(host, {
      title,
      settings,
      questions: state.questions
    });
  }

  // ---------------------------------------------------------------------------
  // LƯU NHÁP / GIAO NGAY LÊN SUPABASE RPC
  // ---------------------------------------------------------------------------
  async function handleSaveCustomAssignment(isPublished) {
    const shared = S();
    showModalAlert('');

    const title = (el('assign-title') && el('assign-title').value.trim()) || '';
    const lessonId = (el('assign-lesson') && el('assign-lesson').value) || null;
    const dueDateRaw = (el('assign-due-date') && el('assign-due-date').value) || '';
    const rewardXp = (el('assign-xp') && el('assign-xp').value) || 30;
    const description = (el('assign-desc') && el('assign-desc').value.trim()) || '';
    const settings = readSettingsFromDom();

    const check = shared.validateCustomAssignment({
      title,
      dueDate: dueDateRaw,
      rewardXp,
      settings,
      questions: state.questions,
      isPublished
    });

    if (!check.valid) {
      showModalAlert(check.errors.slice(0, 3).join(' '));
      const firstErrIdx = state.questionsLocked ? -1 : findFirstInvalidQuestionIndex();
      if (firstErrIdx !== -1) {
        if (state.step !== 2) goToStep(2);
        focusFirstInvalidQuestion(firstErrIdx);
      } else if ((!title || !dueDateRaw) && state.step !== 1) {
        goToStep(1);
        const targetInp = !title ? el('assign-title') : el('assign-due-date');
        if (targetInp) {
          try { targetInp.focus(); } catch (e) {}
        }
      }
      return;
    }

    const draftBtn = el('btn-ca-save-draft');
    const pubBtn = el('btn-ca-publish');
    try {
      if (draftBtn) draftBtn.disabled = true;
      if (pubBtn) pubBtn.disabled = true;
      if (pubBtn && isPublished) pubBtn.textContent = '⏳ Đang giao bài...';
      if (draftBtn && !isPublished) draftBtn.textContent = '⏳ Đang lưu nháp...';

      const res = await window.Admin.upsertCustomAssignment({
        assignmentId: state.editingAssignmentId,
        classId: state.classId,
        lessonId,
        title,
        description,
        dueDate: new Date(dueDateRaw).toISOString(),
        rewardXp: parseInt(rewardXp || 30, 10),
        isPublished,
        customSettings: settings,
        questions: state.questions,
        metadataOnly: Boolean(state.questionsLocked)
      });

      const modal = el('modal-create-assignment');
      if (modal) modal.classList.remove('active');

      if (typeof state.onSavedCallback === 'function') {
        await state.onSavedCallback(isPublished
          ? `Đã giao bài tập tự soạn "${title}" cho cả lớp!`
          : `Đã lưu bản nháp "${title}" (học viên chưa thấy cho tới khi bấm Giao ngay).`, res);
      }
    } catch (err) {
      console.error('Lỗi lưu bài tập tự soạn:', err);
      showModalAlert(err.message || 'Lỗi khi lưu bài tập tự soạn. Vui lòng thử lại!');
    } finally {
      if (draftBtn) {
        draftBtn.disabled = false;
        draftBtn.textContent = '💾 Lưu nháp';
      }
      if (pubBtn) {
        pubBtn.disabled = false;
        pubBtn.textContent = (state.editingAssignmentId && state.alreadyPublished) ? '💾 Lưu cập nhật' : '🚀 Giao ngay cho lớp';
      }
    }
  }

  // ---------------------------------------------------------------------------
  // MODAL SINH NHANH TỪ TỪ VỰNG (KHO TỪ VỰNG & BÀI HỌC X)
  // ---------------------------------------------------------------------------
  function showGenAlert(msg, type = 'danger') {
    const box = el('ca-gen-alert');
    if (!box) return;
    if (!msg) {
      box.className = 'alert';
      box.textContent = '';
      return;
    }
    box.className = `alert alert-${type} show`;
    box.textContent = msg;
  }

  function updateGenSelectionCounter() {
    const shared = S();
    const count = genState.selectedMap.size;
    if (el('ca-gen-selected-count')) {
      el('ca-gen-selected-count').textContent = `Đã chọn: ${count} từ`;
    }
    const pageCheckboxes = Array.from(document.querySelectorAll('.chk-ca-gen-vocab'));
    if (el('chk-ca-gen-page-all')) {
      el('chk-ca-gen-page-all').checked = pageCheckboxes.length > 0 && pageCheckboxes.every(c => c.checked);
    }
    if (el('ca-gen-count') && count > 0) {
      const curVal = parseInt(el('ca-gen-count').value, 10);
      if (!curVal || curVal > count) el('ca-gen-count').value = String(Math.min(count, Math.max(1, shared.MAX_QUESTIONS - state.questions.length)));
    }
  }

  async function loadGenWarehousePage() {
    const tbody = el('ca-gen-table-body');
    if (!tbody) return;
    const shared = S();
    showGenAlert('');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">⏳ Đang tải kho từ vựng (phân trang server)...</td></tr>';

    try {
      const hskLevel = el('ca-gen-hsk') ? el('ca-gen-hsk').value : 'all';
      const search = el('ca-gen-search') ? el('ca-gen-search').value.trim() : '';
      const sortBy = el('ca-gen-sort') ? el('ca-gen-sort').value : 'sort_order';

      const res = await window.Admin.getVocabularies({
        hskLevel,
        search,
        sortBy,
        page: genState.page,
        limit: genState.pageSize
      });

      genState.currentRows = Array.isArray(res && res.data) ? res.data : [];
      const total = Number((res && res.total) || 0);
      genState.totalPages = Math.max(1, Number((res && res.totalPages) || 1));

      if (el('ca-gen-page-info')) {
        const from = total === 0 ? 0 : (genState.page - 1) * genState.pageSize + 1;
        const to = Math.min(genState.page * genState.pageSize, total);
        el('ca-gen-page-info').textContent = total === 0 ? 'Không tìm thấy từ nào' : `Hiển thị ${from}–${to} / ${total.toLocaleString('vi-VN')} từ`;
      }
      if (el('ca-gen-page-indicator')) el('ca-gen-page-indicator').textContent = `Trang ${genState.page} / ${genState.totalPages}`;
      if (el('btn-ca-gen-prev')) el('btn-ca-gen-prev').disabled = genState.page <= 1;
      if (el('btn-ca-gen-next')) el('btn-ca-gen-next').disabled = genState.page >= genState.totalPages;

      if (genState.currentRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">Không có từ vựng nào khớp điều kiện lọc.</td></tr>';
        updateGenSelectionCounter();
        return;
      }

      tbody.innerHTML = genState.currentRows.map((w, i) => {
        const checked = genState.selectedMap.has(w.id);
        const stt = (w.sort_order !== null && w.sort_order !== undefined) ? w.sort_order : ((genState.page - 1) * genState.pageSize + i + 1);
        return `
          <tr>
            <td style="text-align: center;"><input type="checkbox" class="chk-ca-gen-vocab" value="${shared.escapeHtml(w.id)}" ${checked ? 'checked' : ''} style="width: 16px; height: 16px;"></td>
            <td style="text-align: center; font-weight: 700; color: var(--text-muted);">${stt}</td>
            <td style="font-size: 16px; font-weight: 800; color: var(--primary); font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;">${shared.escapeHtml(w.hanzi)}</td>
            <td>${shared.escapeHtml(w.pinyin)}</td>
            <td>${shared.escapeHtml(w.meaning_vi)}</td>
            <td><span class="badge-hsk badge-hsk-${Number(w.hsk_level || 1)}">HSK ${Number(w.hsk_level || 1)}</span></td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll('.chk-ca-gen-vocab').forEach((chk, i) => {
        chk.addEventListener('change', () => {
          const row = genState.currentRows[i];
          if (!row) return;
          if (chk.checked) genState.selectedMap.set(row.id, row);
          else genState.selectedMap.delete(row.id);
          updateGenSelectionCounter();
        });
      });

      updateGenSelectionCounter();
    } catch (err) {
      console.error('Lỗi tải kho từ vựng sinh câu hỏi:', err);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--danger);">Lỗi tải từ vựng từ server.</td></tr>';
      showGenAlert(err.message || 'Không thể tải kho từ vựng.');
    }
  }

  function renderGeneratedPreviewList() {
    const sec = el('ca-gen-preview-section');
    const listEl = el('ca-gen-preview-list');
    const commitBtn = el('btn-ca-gen-commit');
    if (!sec || !listEl) return;
    const shared = S();

    if (genState.generatedDrafts.length === 0) {
      sec.style.display = 'none';
      if (commitBtn) commitBtn.disabled = true;
      return;
    }

    sec.style.display = 'block';
    const checkedCount = genState.generatedDrafts.filter(x => x._keep !== false).length;
    if (commitBtn) {
      commitBtn.disabled = checkedCount === 0;
      commitBtn.textContent = `➕ Thêm (${checkedCount}) câu vào bài tập`;
    }

    listEl.innerHTML = genState.generatedDrafts.map((q, gi) => {
      const tMeta = shared.QUESTION_TYPES[q.question_type] || { icon: '❓', shortLabel: q.question_type };
      let answerNote = '';
      if (q.question_type === 'mcq') {
        const opts = (q.question_payload.options || []).map((o, oi) => {
          const isOk = (q.answer_payload.correct_option_ids || []).includes(o.id);
          return `${String.fromCharCode(65 + oi)}. ${shared.escapeHtml(o.text)}${isOk ? ' ✅' : ''}`;
        }).join(' · ');
        answerNote = `<div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${opts}</div>`;
      } else if (q.question_type === 'fill_blank') {
        const ans = ((q.answer_payload.blanks && q.answer_payload.blanks[0] && q.answer_payload.blanks[0].accepted) || []).join(', ');
        answerNote = `<div style="font-size: 12px; color: var(--success); margin-top: 4px;">Đáp án: ${shared.escapeHtml(ans)}</div>`;
      } else if (q.question_type === 'matching') {
        const pairs = (q.answer_payload.pairs || []).map(p => `${shared.escapeHtml(p.left_text)} = ${shared.escapeHtml(p.right_text)}`).join(' · ');
        answerNote = `<div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${pairs}</div>`;
      }

      return `
        <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; background: var(--bg-card); min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <input type="checkbox" class="ca-gen-draft-keep" data-gi="${gi}" ${q._keep !== false ? 'checked' : ''} style="width: 16px; height: 16px;">
            <span class="ca-q-badge">${tMeta.icon} Câu sinh #${gi + 1}: ${shared.escapeHtml(tMeta.shortLabel)}</span>
          </div>
          <input type="text" class="form-control ca-gen-draft-prompt" data-gi="${gi}" value="${shared.escapeHtml(q.prompt_text)}" style="height: 34px; font-size: 13px;">
          ${answerNote}
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.ca-gen-draft-keep').forEach(chk => chk.addEventListener('change', () => {
      const gi = parseInt(chk.dataset.gi, 10);
      genState.generatedDrafts[gi]._keep = chk.checked;
      renderGeneratedPreviewList();
    }));

    listEl.querySelectorAll('.ca-gen-draft-prompt').forEach(inp => inp.addEventListener('input', () => {
      const gi = parseInt(inp.dataset.gi, 10);
      genState.generatedDrafts[gi].prompt_text = inp.value;
    }));
  }

  function openVocabGeneratorModal() {
    if (state.questionsLocked) {
      showModalAlert('Bài đã có học viên làm nên đã khóa sửa câu hỏi.');
      return;
    }
    const modal = el('modal-ca-vocab-generator');
    if (!modal) return;
    showGenAlert('');
    genState.page = 1;
    genState.selectedMap = new Map();
    genState.generatedDrafts = [];
    if (el('ca-gen-search')) el('ca-gen-search').value = '';
    if (el('ca-gen-hsk')) el('ca-gen-hsk').value = 'all';
    if (el('ca-gen-sort')) el('ca-gen-sort').value = 'sort_order';
    if (el('ca-gen-lesson-status')) el('ca-gen-lesson-status').textContent = '';

    // Nạp dropdown bài học của lớp
    const lessonSel = el('ca-gen-lesson-select');
    if (lessonSel) {
      lessonSel.innerHTML = '<option value="">-- Chọn bài học --</option>' +
        (state.lessons || []).map(l => `<option value="${S().escapeHtml(l.id)}">Bài ${l.order_index}: ${S().escapeHtml(l.title_zh)} (${S().escapeHtml(l.title_vi || '')})</option>`).join('');
      const chosenAssignLesson = el('assign-lesson') ? el('assign-lesson').value : '';
      if (chosenAssignLesson) lessonSel.value = chosenAssignLesson;
    }

    renderGeneratedPreviewList();
    modal.classList.add('active');
    loadGenWarehousePage();
  }

  // ---------------------------------------------------------------------------
  // MỞ TRÌNH SOẠN (TẠO MỚI HOẶC CHỈNH SỬA BÀI TỰ SOẠN)
  // ---------------------------------------------------------------------------
  function resetCustomWizardState({ classId, lessons, onSaved }) {
    state.classId = classId;
    state.lessons = lessons || [];
    state.onSavedCallback = onSaved || null;
    state.editingAssignmentId = null;
    state.questionsLocked = false;
    state.attemptCount = 0;
    state.alreadyPublished = false;
    state.step = 1;
    state.questions = [];
    state.collapsedSet = new WeakSet();
    activeNavIdx = 0;
    disconnectNavObserver();

    if (el('custom-locked-banner')) el('custom-locked-banner').style.display = 'none';
    if (el('ca-preview-inline-host')) {
      el('ca-preview-inline-host').style.display = 'none';
      el('ca-preview-inline-host').innerHTML = '';
    }
    writeSettingsToDom({
      shuffle_questions: false,
      shuffle_options: false,
      time_limit_minutes: null,
      max_attempts: 1,
      pass_score_percent: 60,
      answer_reveal_mode: 'after_submit'
    });
    updateCountsHeader();
  }

  async function openEditCustomAssignment(assignmentId, { classId, lessons, onSaved }) {
    resetCustomWizardState({ classId, lessons, onSaved });
    const modal = el('modal-create-assignment');
    const titleHeader = el('assign-modal-title');
    if (titleHeader) titleHeader.textContent = 'Chỉnh sửa Bài tập Tự soạn';
    showModalAlert('');

    const assignTypeSelect = el('assign-type');
    if (assignTypeSelect) {
      assignTypeSelect.value = 'custom';
      assignTypeSelect.disabled = true;
    }

    setModeActive(true);
    if (modal) modal.classList.add('active');

    try {
      const data = await window.Admin.getCustomAssignmentEditor(assignmentId);
      const assign = data.assignment;
      state.editingAssignmentId = assign.id;
      state.questionsLocked = Boolean(data.questions_locked);
      state.attemptCount = Number(data.attempt_count || 0);
      state.alreadyPublished = Boolean(assign.is_published);
      state.questions = (data.questions || []).map(q => ({
        question_type: q.question_type,
        prompt_text: q.prompt_text,
        points: Number(q.points || 1),
        explanation: q.explanation || '',
        question_payload: q.question_payload || {},
        answer_payload: q.answer_payload || {},
        source_vocabulary_ids: q.source_vocabulary_ids || []
      }));
      state.collapsedSet = new WeakSet();
      activeNavIdx = 0;

      if (el('assign-title')) el('assign-title').value = assign.title || '';
      if (el('assign-lesson')) el('assign-lesson').value = assign.lesson_id || '';
      if (el('assign-due-date')) el('assign-due-date').value = formatDatetimeLocalFromIso(assign.due_date);
      if (el('assign-xp')) el('assign-xp').value = String(assign.reward_xp ?? 30);
      if (el('assign-desc')) el('assign-desc').value = assign.description || '';

      writeSettingsToDom(assign.custom_settings || {});
      updateCountsHeader();

      if (state.questionsLocked && el('custom-locked-banner')) {
        el('custom-locked-banner').style.display = 'block';
        el('custom-locked-banner').textContent = `🔒 Bài tập này đã có ${state.attemptCount} lượt học viên làm bài — danh sách câu hỏi, đáp án và ngưỡng đạt đã được khóa để bảo toàn điểm cũ. Bạn vẫn sửa được tiêu đề, hướng dẫn, gia hạn hạn chót, tăng số lượt hoặc đổi chế độ xem đáp án.`;
      }

      goToStep(1);
    } catch (err) {
      console.error('Lỗi tải bài tự soạn để sửa:', err);
      showModalAlert(err.message || 'Không thể tải dữ liệu bài tập tự soạn!');
    }
  }

  // ---------------------------------------------------------------------------
  // MODAL KẾT QUẢ LỚP, THỐNG KÊ TỪNG CÂU & CHẤM TAY CÂU DỊCH
  // ---------------------------------------------------------------------------
  async function openCustomResultsModal(assignId, assignTitle) {
    const shared = S();
    const modal = el('modal-view-submissions');
    const titleEl = el('view-submissions-title');
    const subEl = el('view-submissions-subtitle');
    const bodyEl = el('submissions-list-container');
    const hintEl = el('view-submissions-footer-hint');
    if (!modal || !bodyEl) return;

    if (titleEl) titleEl.textContent = `Kết quả bài tự soạn: ${assignTitle}`;
    if (subEl) subEl.textContent = 'Tổng hợp điểm học viên, thống kê độ khó từng câu & chấm tay câu dịch';
    if (hintEl) hintEl.textContent = 'Mẹo: Bấm vào từng học viên để xem bài làm chi tiết hoặc chấm tay câu dịch.';

    bodyEl.innerHTML = '<div style="text-align: center; padding: 36px; color: var(--text-muted);">⏳ Đang tải bảng điểm & thống kê...</div>';
    modal.classList.add('active');

    let statsData = null;
    let activeTab = 'students'; // 'students' | 'questions'
    let searchTerm = '';

    async function fetchAndRender() {
      try {
        statsData = await window.Admin.getCustomAssignmentResultsAndStats(assignId);
        renderOverview();
      } catch (err) {
        console.error('Lỗi tải kết quả bài tự soạn:', err);
        bodyEl.innerHTML = `
          <div style="text-align: center; padding: 28px; color: var(--danger);">
            ❌ ${shared.escapeHtml(err.message || 'Không tải được dữ liệu kết quả.')}
            <div style="margin-top: 12px;"><button type="button" class="btn btn-outline btn-sm" id="btn-ca-retry-res">🔄 Thử lại</button></div>
          </div>
        `;
        const retry = el('btn-ca-retry-res');
        if (retry) retry.addEventListener('click', fetchAndRender);
      }
    }

    function renderOverview() {
      if (!statsData) return;
      const students = Array.isArray(statsData.students) ? statsData.students : [];
      const qStats = Array.isArray(statsData.question_stats) ? statsData.question_stats : [];
      const passPct = (statsData.assignment && statsData.assignment.pass_score_percent) || 60;

      const submittedStudents = students.filter(s => s.attempts_used > 0);
      const pendingManualCount = students.filter(s => s.needs_manual_grading).length;
      const avgScore = submittedStudents.length > 0
        ? Math.round(submittedStudents.reduce((acc, s) => acc + Number(s.best_score_percent || 0), 0) / submittedStudents.length)
        : 0;

      // Tìm câu khó nhất (tỷ lệ đúng thấp nhất trong các câu đã có người trả lời)
      const answeredQs = qStats.filter(q => q.correct_rate !== null && q.correct_rate !== undefined);
      let hardestId = null;
      if (answeredQs.length > 0) {
        const sortedHard = [...answeredQs].sort((a, b) => a.correct_rate - b.correct_rate);
        hardestId = sortedHard[0].question_id;
      }

      const filteredStudents = students.filter(s => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return shared.safeStr(s.display_name).toLowerCase().includes(q)
          || shared.safeStr(s.username).toLowerCase().includes(q);
      });

      bodyEl.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 10px; margin-bottom: 14px;">
          <div class="ca-stat-mini"><div class="ca-stat-label">Đã làm bài</div><div class="ca-stat-val">${submittedStudents.length} / ${students.length}</div></div>
          <div class="ca-stat-mini"><div class="ca-stat-label">Điểm TB lớp</div><div class="ca-stat-val" style="color: var(--primary);">${submittedStudents.length ? avgScore + '/100' : '—'}</div></div>
          <div class="ca-stat-mini"><div class="ca-stat-label">Ngưỡng đạt</div><div class="ca-stat-val">${passPct}%</div></div>
          <div class="ca-stat-mini"><div class="ca-stat-label">Chờ chấm tay</div><div class="ca-stat-val" style="color: ${pendingManualCount > 0 ? 'var(--warning)' : 'var(--success)'};">${pendingManualCount} HV</div></div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-sm ${activeTab === 'students' ? 'btn-primary' : 'btn-outline'} ca-res-tab" data-tab="students">👥 Bảng điểm học viên (${students.length})</button>
            <button type="button" class="btn btn-sm ${activeTab === 'questions' ? 'btn-primary' : 'btn-outline'} ca-res-tab" data-tab="questions">📊 Thống kê từng câu (${qStats.length})</button>
          </div>
          ${activeTab === 'students' ? `<input type="text" id="ca-res-search" class="form-control" value="${shared.escapeHtml(searchTerm)}" placeholder="🔍 Tìm tên hoặc @username..." style="max-width: 240px; height: 34px; font-size: 13px;">` : ''}
        </div>

        ${activeTab === 'students' ? `
          <div class="table-responsive">
            <table class="data-table" style="font-size: 13px;">
              <thead>
                <tr>
                  <th>Học viên</th>
                  <th>Trạng thái</th>
                  <th>Số lượt</th>
                  <th>Điểm cao nhất</th>
                  <th>Nộp gần nhất</th>
                  <th style="text-align: right;">Chi tiết / Chấm tay</th>
                </tr>
              </thead>
              <tbody>
                ${filteredStudents.length === 0 ? '<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">Không có học viên phù hợp.</td></tr>' : filteredStudents.map(st => {
                  const name = shared.safeStr(st.display_name, 'Học viên');
                  const uname = shared.safeStr(st.username, '');
                  let badge = '<span class="badge-status" style="background: rgba(148,163,184,0.2); color: var(--text-muted);">⚪ Chưa làm</span>';
                  if (st.status === 'pending_manual') badge = '<span class="badge-status badge-paused">🟡 Chờ chấm câu dịch</span>';
                  else if (st.status === 'passed') badge = '<span class="badge-status badge-ongoing">🟢 Đạt</span>';
                  else if (st.status === 'failed_attempt') badge = '<span class="badge-status" style="background: rgba(251,191,36,0.18); color: var(--warning);">🟠 Chưa đạt ngưỡng</span>';

                  const scoreCell = st.attempts_used > 0
                    ? `<strong>${st.best_score_percent}/100</strong> <span style="font-size: 11.5px; color: var(--text-muted);">(${st.best_total_score}/${st.best_max_score}đ)</span>`
                    : '<span style="color: var(--text-muted);">—</span>';

                  const submittedTime = st.last_submitted_at
                    ? new Date(st.last_submitted_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
                    : '—';

                  return `
                    <tr>
                      <td>
                        <div style="font-weight: 700; color: var(--text-main);">${shared.escapeHtml(name)}</div>
                        ${uname ? `<div style="font-size: 11.5px; color: var(--text-muted);">@${shared.escapeHtml(uname)}</div>` : ''}
                      </td>
                      <td>${badge}</td>
                      <td>${st.attempts_used}</td>
                      <td>${scoreCell}</td>
                      <td style="font-size: 12px; color: var(--text-muted);">${shared.escapeHtml(submittedTime)}</td>
                      <td style="text-align: right;">
                        ${st.best_attempt_id ? `
                          <button type="button" class="btn btn-sm ${st.needs_manual_grading ? 'btn-primary' : 'btn-outline'} ca-btn-open-attempt" data-attempt-id="${shared.escapeHtml(st.best_attempt_id)}">
                            ${st.needs_manual_grading ? '✍️ Chấm tay' : '🔍 Xem bài làm'}
                          </button>
                        ` : '<span style="font-size: 12px; color: var(--text-light);">—</span>'}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${qStats.map(qs => {
              const isHardest = qs.question_id === hardestId && qs.correct_rate !== null && qs.correct_rate < 100;
              const tMeta = shared.QUESTION_TYPES[qs.question_type] || { icon: '❓', shortLabel: qs.question_type };
              const rateColor = qs.correct_rate === null ? 'var(--text-muted)' : (qs.correct_rate >= 70 ? 'var(--success)' : (qs.correct_rate >= 40 ? 'var(--warning)' : 'var(--danger)'));
              return `
                <div style="border: 1px solid ${isHardest ? 'var(--danger-border)' : 'var(--border-color)'}; border-radius: var(--radius-sm); padding: 12px 14px; background: var(--bg-subtle);">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 220px;">
                      <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 4px;">
                        <span class="ca-q-badge">${tMeta.icon} Câu ${qs.question_order}: ${shared.escapeHtml(tMeta.shortLabel)}</span>
                        ${isHardest ? '<span class="import-badge-pill is-warn">🔥 Câu khó nhất</span>' : ''}
                        ${qs.pending_manual_count > 0 ? `<span class="import-badge-pill is-warn">⏳ ${qs.pending_manual_count} bài chờ chấm</span>` : ''}
                      </div>
                      <div style="font-weight: 700; font-size: 13.5px; color: var(--text-main);">${shared.escapeHtml(qs.prompt_text)}</div>
                      ${qs.top_wrong_option && qs.top_wrong_option.option_text ? `
                        <div style="font-size: 12px; color: var(--danger); margin-top: 4px;">
                          ❌ Đáp án sai được chọn nhiều nhất: <strong>"${shared.escapeHtml(qs.top_wrong_option.option_text)}"</strong> (${qs.top_wrong_option.pick_count} lượt)
                        </div>
                      ` : ''}
                    </div>
                    <div style="text-align: right; min-width: 110px;">
                      <div style="font-size: 20px; font-weight: 800; color: ${rateColor};">${qs.correct_rate !== null ? qs.correct_rate + '%' : '—'}</div>
                      <div style="font-size: 11.5px; color: var(--text-muted);">${qs.correct_count} đúng / ${qs.total_responses} lượt</div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      `;

      bodyEl.querySelectorAll('.ca-res-tab').forEach(btn => btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        renderOverview();
      }));

      const searchInp = el('ca-res-search');
      if (searchInp) {
        searchInp.addEventListener('input', () => {
          searchTerm = searchInp.value.trim();
          renderOverview();
        });
      }

      bodyEl.querySelectorAll('.ca-btn-open-attempt').forEach(btn => btn.addEventListener('click', () => {
        openStudentAttemptDetailView(btn.dataset.attemptId);
      }));
    }

    async function openStudentAttemptDetailView(attemptId) {
      bodyEl.innerHTML = '<div style="text-align: center; padding: 36px; color: var(--text-muted);">⏳ Đang tải chi tiết bài làm của học viên...</div>';
      try {
        const detail = await window.Admin.getTeacherAttemptDetail(attemptId);
        const st = detail.student || {};
        const att = detail.attempt || {};
        const attempts = Array.isArray(detail.student_attempts) ? detail.student_attempts : [];
        const items = Array.isArray(detail.items) ? detail.items : [];

        const stName = shared.safeStr(st.display_name, 'Học viên');
        const stUser = shared.safeStr(st.username, '');

        bodyEl.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color);">
            <div>
              <button type="button" id="btn-ca-back-to-class" class="btn btn-outline btn-sm" style="margin-bottom: 6px;">← Quay lại danh sách lớp</button>
              <div style="font-size: 16px; font-weight: 800; color: var(--text-main);">
                ${shared.escapeHtml(stName)} ${stUser ? `<span style="font-size: 13px; color: var(--text-muted); font-weight: 500;">(@${shared.escapeHtml(stUser)})</span>` : ''}
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              ${attempts.length > 1 ? `
                <select id="ca-teacher-attempt-switch" class="form-control" style="width: auto; height: 36px; font-size: 13px;">
                  ${attempts.map(a => `<option value="${shared.escapeHtml(a.id)}" ${a.id === att.id ? 'selected' : ''}>Lần ${a.attempt_number}: ${a.score_percent}/100${a.needs_manual_grading ? ' (Chờ chấm)' : ''}</option>`).join('')}
                </select>
              ` : ''}
              <div style="padding: 6px 12px; border-radius: 8px; background: var(--bg-subtle); font-weight: 800; font-size: 15px;">
                Tổng: <span style="color: var(--primary);">${att.score_percent}/100</span> (${att.total_score}/${att.max_score}đ)
              </div>
            </div>
          </div>

          <div id="ca-manual-grade-alert" class="alert"></div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${items.map(it => renderTeacherItemReviewHtml(it)).join('')}
          </div>

          ${items.some(it => it.needs_manual_grading || it.question_type === 'translation') ? `
            <div style="margin-top: 16px; text-align: right;">
              <button type="button" id="btn-ca-save-manual-grades" class="btn btn-primary">💾 Lưu điểm chấm tay & cập nhật tổng</button>
            </div>
          ` : ''}
        `;

        const backBtn = el('btn-ca-back-to-class');
        if (backBtn) backBtn.addEventListener('click', fetchAndRender);

        const sw = el('ca-teacher-attempt-switch');
        if (sw) sw.addEventListener('change', () => openStudentAttemptDetailView(sw.value));

        const saveBtn = el('btn-ca-save-manual-grades');
        if (saveBtn) {
          saveBtn.addEventListener('click', async () => {
            const grades = [];
            bodyEl.querySelectorAll('.ca-manual-grade-row').forEach(row => {
              const qid = row.dataset.qid;
              const ptsInput = row.querySelector('.ca-manual-pts');
              const fbInput = row.querySelector('.ca-manual-fb');
              const maxPts = parseFloat(row.dataset.maxPts || '1');
              const pts = parseFloat(ptsInput ? ptsInput.value : '0') || 0;
              grades.push({
                question_id: qid,
                points_awarded: Math.max(0, Math.min(maxPts, pts)),
                is_correct: pts >= maxPts,
                teacher_feedback: fbInput ? fbInput.value.trim() : ''
              });
            });
            try {
              saveBtn.disabled = true;
              saveBtn.textContent = '⏳ Đang lưu điểm...';
              await window.Admin.gradeCustomAttemptAnswers(att.id, grades);
              await openStudentAttemptDetailView(att.id);
              const al = el('ca-manual-grade-alert');
              if (al) {
                al.className = 'alert alert-success show';
                al.textContent = '✅ Đã lưu điểm chấm tay và cập nhật tổng điểm học viên thành công!';
              }
            } catch (err) {
              const al = el('ca-manual-grade-alert');
              if (al) {
                al.className = 'alert alert-danger show';
                al.textContent = err.message || 'Lỗi lưu điểm chấm tay.';
              }
              saveBtn.disabled = false;
              saveBtn.textContent = '💾 Lưu điểm chấm tay & cập nhật tổng';
            }
          });
        }
      } catch (err) {
        bodyEl.innerHTML = `<div style="padding: 24px; color: var(--danger);">❌ ${shared.escapeHtml(err.message || 'Không tải được bài làm học viên.')}</div>`;
      }
    }

    function renderTeacherItemReviewHtml(it) {
      const shared = S();
      const tMeta = shared.QUESTION_TYPES[it.question_type] || { icon: '❓', shortLabel: it.question_type };
      const resp = it.response_payload || {};
      const ans = it.answer_payload || {};
      const qp = it.question_payload || {};

      let studentRespText = 'Chưa trả lời';
      let expectedText = '';

      if (it.question_type === 'mcq') {
        const optMap = new Map((qp.options || []).map(o => [o.id, o.text]));
        studentRespText = (resp.selected_option_ids || []).map(id => optMap.get(id) || id).join(', ') || 'Chưa chọn';
        expectedText = (ans.correct_option_ids || []).map(id => optMap.get(id) || id).join(', ');
      } else if (it.question_type === 'true_false') {
        studentRespText = resp.selected_boolean === true ? 'Đúng' : (resp.selected_boolean === false ? 'Sai' : 'Chưa chọn');
        expectedText = ans.correct_boolean ? 'Đúng' : 'Sai';
      } else if (it.question_type === 'fill_blank') {
        studentRespText = (resp.values || []).join(' | ') || 'Chưa điền';
        expectedText = (ans.blanks || []).map(b => (b.accepted || []).join(' / ')).join(' | ');
      } else if (it.question_type === 'translation') {
        studentRespText = resp.text || 'Chưa trả lời';
        expectedText = (ans.accepted_answers || []).join(' / ');
      } else if (it.question_type === 'word_order') {
        const tokMap = new Map((qp.shuffled_tokens || []).map(t => [t.id, t.text]));
        studentRespText = (resp.ordered_token_ids || []).map(id => tokMap.get(id) || '').join(' ') || 'Chưa xếp';
        expectedText = ans.correct_sentence || (ans.tokens || []).map(t => t.text).join(' ');
      } else if (it.question_type === 'matching') {
        const lMap = new Map((qp.left_items || []).map(x => [x.id, x.text]));
        const rMap = new Map((qp.right_items || []).map(x => [x.id, x.text]));
        studentRespText = (resp.matched_pairs || []).map(p => `${lMap.get(p.left_id) || '?'} → ${rMap.get(p.right_id) || '?'}`).join('; ') || 'Chưa nối';
        expectedText = (ans.pairs || []).map(p => `${p.left_text} → ${p.right_text}`).join('; ');
      }

      const statusBadge = it.needs_manual_grading
        ? '<span class="import-badge-pill is-warn">⏳ Chờ giáo viên chấm</span>'
        : (it.is_correct
          ? `<span class="import-badge-pill is-highlight">✅ +${it.points_earned}/${it.points}đ</span>`
          : `<span class="import-badge-pill" style="background: var(--danger-bg); color: var(--danger); border-color: var(--danger-border);">❌ ${it.points_earned}/${it.points}đ</span>`);

      const allowManualEdit = it.needs_manual_grading || it.question_type === 'translation';

      return `
        <div style="border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px 14px; background: var(--bg-subtle);">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px;">
            <span class="ca-q-badge">${tMeta.icon} Câu ${it.question_order}: ${shared.escapeHtml(tMeta.shortLabel)}</span>
            ${statusBadge}
          </div>
          <div style="font-weight: 700; font-size: 13.5px; color: var(--text-main); margin-bottom: 6px;">${shared.escapeHtml(it.prompt_text)}</div>
          <div style="font-size: 13px; margin-bottom: 4px;"><span style="color: var(--text-muted);">Học viên trả lời:</span> <strong>${shared.escapeHtml(studentRespText)}</strong></div>
          ${expectedText ? `<div style="font-size: 12.5px; color: var(--success);"><span style="color: var(--text-muted);">Đáp án chuẩn:</span> ${shared.escapeHtml(expectedText)}</div>` : ''}
          ${allowManualEdit ? `
            <div class="ca-manual-grade-row" data-qid="${shared.escapeHtml(it.question_id)}" data-max-pts="${it.points}">
              <div>
                <label style="font-size: 11.5px; font-weight: 700; display: block; margin-bottom: 2px;">Chấm điểm (0–${it.points}):</label>
                <input type="number" step="0.5" min="0" max="${it.points}" class="form-control ca-manual-pts" value="${it.points_earned ?? 0}" style="height: 34px; font-size: 13px;">
              </div>
              <div>
                <label style="font-size: 11.5px; font-weight: 700; display: block; margin-bottom: 2px;">Nhận xét câu này (tùy chọn):</label>
                <input type="text" class="form-control ca-manual-fb" value="${shared.escapeHtml(it.teacher_feedback || '')}" placeholder="Nhận xét bài dịch của học viên..." style="height: 34px; font-size: 13px;">
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }

    await fetchAndRender();
  }

  // ---------------------------------------------------------------------------
  // KHỞI TẠO SỰ KIỆN CỐ ĐỊNH TRÊN DOM
  // ---------------------------------------------------------------------------
  function initOnce() {
    document.querySelectorAll('.ca-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        showModalAlert('');
        const target = parseInt(btn.getAttribute('data-step'), 10);
        if (!isNaN(target)) goToStep(target);
      });
    });

    if (el('btn-ca-to-step2')) el('btn-ca-to-step2').addEventListener('click', () => goToStep(2));
    if (el('btn-ca-prev-step')) el('btn-ca-prev-step').addEventListener('click', () => {
      showModalAlert('');
      goToStep(state.step - 1);
    });
    if (el('btn-ca-next-step')) el('btn-ca-next-step').addEventListener('click', () => {
      showModalAlert('');
      if (state.step === 2 && !state.questionsLocked) {
        const firstErrIdx = findFirstInvalidQuestionIndex();
        if (firstErrIdx !== -1) {
          focusFirstInvalidQuestion(firstErrIdx);
          return;
        }
      }
      goToStep(state.step + 1);
    });

    if (el('btn-ca-collapse-all')) {
      el('btn-ca-collapse-all').addEventListener('click', () => {
        state.questions.forEach(q => setQuestionCollapsed(q, true));
        renderQuestionsBuilder({ preserveScroll: true });
      });
    }
    if (el('btn-ca-expand-all')) {
      el('btn-ca-expand-all').addEventListener('click', () => {
        state.collapsedSet = new WeakSet();
        renderQuestionsBuilder({ preserveScroll: true });
      });
    }

    if (el('btn-ca-save-draft')) el('btn-ca-save-draft').addEventListener('click', () => handleSaveCustomAssignment(false));
    if (el('btn-ca-publish')) el('btn-ca-publish').addEventListener('click', () => handleSaveCustomAssignment(true));
    if (el('btn-ca-launch-preview')) el('btn-ca-launch-preview').addEventListener('click', launchInlineStudentPreview);

    document.querySelectorAll('.btn-ca-add-q').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.questionsLocked) return;
        const shared = S();
        if (state.questions.length >= shared.MAX_QUESTIONS) {
          showModalAlert(`Đã đạt giới hạn tối đa ${shared.MAX_QUESTIONS} câu hỏi mỗi bài!`);
          return;
        }
        const qType = btn.getAttribute('data-qtype');
        const newQ = shared.makeEmptyQuestion(qType);
        state.questions.push(newQ);
        const newIdx = state.questions.length - 1;
        renderQuestionsBuilder({ preserveScroll: true });
        scrollToQuestion(newIdx, { behavior: 'smooth', focusPrompt: true });
      });
    });

    // Events Modal Sinh nhanh từ từ vựng
    if (el('btn-ca-open-vocab-gen')) el('btn-ca-open-vocab-gen').addEventListener('click', openVocabGeneratorModal);
    document.querySelectorAll('[data-close="modal-ca-vocab-generator"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = el('modal-ca-vocab-generator');
        if (m) m.classList.remove('active');
      });
    });

    if (el('ca-gen-tab-warehouse')) {
      el('ca-gen-tab-warehouse').addEventListener('click', () => {
        genState.mode = 'warehouse';
        if (el('ca-gen-pane-warehouse')) el('ca-gen-pane-warehouse').style.display = 'block';
        if (el('ca-gen-pane-lesson')) el('ca-gen-pane-lesson').style.display = 'none';
        el('ca-gen-tab-warehouse').className = 'btn btn-sm btn-primary';
        if (el('ca-gen-tab-lesson')) el('ca-gen-tab-lesson').className = 'btn btn-sm btn-outline';
      });
    }
    if (el('ca-gen-tab-lesson')) {
      el('ca-gen-tab-lesson').addEventListener('click', () => {
        genState.mode = 'lesson';
        if (el('ca-gen-pane-warehouse')) el('ca-gen-pane-warehouse').style.display = 'none';
        if (el('ca-gen-pane-lesson')) el('ca-gen-pane-lesson').style.display = 'block';
        el('ca-gen-tab-lesson').className = 'btn btn-sm btn-primary';
        if (el('ca-gen-tab-warehouse')) el('ca-gen-tab-warehouse').className = 'btn btn-sm btn-outline';
      });
    }

    if (el('btn-ca-gen-search')) el('btn-ca-gen-search').addEventListener('click', () => { genState.page = 1; loadGenWarehousePage(); });
    if (el('ca-gen-search')) {
      el('ca-gen-search').addEventListener('input', () => {
        clearTimeout(genState.debounceTimer);
        genState.debounceTimer = setTimeout(() => { genState.page = 1; loadGenWarehousePage(); }, 300);
      });
    }
    if (el('ca-gen-hsk')) el('ca-gen-hsk').addEventListener('change', () => { genState.page = 1; loadGenWarehousePage(); });
    if (el('ca-gen-sort')) el('ca-gen-sort').addEventListener('change', () => { genState.page = 1; loadGenWarehousePage(); });
    if (el('btn-ca-gen-prev')) el('btn-ca-gen-prev').addEventListener('click', () => { if (genState.page > 1) { genState.page--; loadGenWarehousePage(); } });
    if (el('btn-ca-gen-next')) el('btn-ca-gen-next').addEventListener('click', () => { if (genState.page < genState.totalPages) { genState.page++; loadGenWarehousePage(); } });

    const setPageChecked = (checked) => {
      document.querySelectorAll('.chk-ca-gen-vocab').forEach((chk, i) => {
        chk.checked = checked;
        const row = genState.currentRows[i];
        if (!row) return;
        if (checked) genState.selectedMap.set(row.id, row);
        else genState.selectedMap.delete(row.id);
      });
      updateGenSelectionCounter();
    };
    if (el('chk-ca-gen-page-all')) el('chk-ca-gen-page-all').addEventListener('change', (e) => setPageChecked(e.target.checked));
    if (el('btn-ca-gen-select-page')) el('btn-ca-gen-select-page').addEventListener('click', () => setPageChecked(true));
    if (el('btn-ca-gen-clear-sel')) {
      el('btn-ca-gen-clear-sel').addEventListener('click', () => {
        genState.selectedMap.clear();
        setPageChecked(false);
      });
    }

    if (el('btn-ca-gen-select-range')) {
      el('btn-ca-gen-select-range').addEventListener('click', async () => {
        showGenAlert('');
        const fromPos = parseInt((el('ca-gen-range-from') && el('ca-gen-range-from').value) || '1', 10);
        const toPos = parseInt((el('ca-gen-range-to') && el('ca-gen-range-to').value) || '10', 10);
        const btn = el('btn-ca-gen-select-range');
        try {
          btn.disabled = true;
          btn.textContent = '⏳ Đang chọn...';
          const words = await window.Admin.getVocabulariesByPositionRange({
            hskLevel: el('ca-gen-hsk') ? el('ca-gen-hsk').value : 'all',
            search: el('ca-gen-search') ? el('ca-gen-search').value.trim() : '',
            sortBy: el('ca-gen-sort') ? el('ca-gen-sort').value : 'sort_order',
            fromPos,
            toPos
          });
          words.forEach(w => genState.selectedMap.set(w.id, w));
          await loadGenWarehousePage();
          showGenAlert(`Đã chọn thêm ${words.length} từ trong khoảng #${fromPos}–#${toPos}!`, 'success');
        } catch (err) {
          showGenAlert(err.message || 'Không chọn được khoảng từ.');
        } finally {
          btn.disabled = false;
          btn.textContent = '☑️ Chọn khoảng';
        }
      });
    }

    if (el('btn-ca-gen-load-lesson')) {
      el('btn-ca-gen-load-lesson').addEventListener('click', async () => {
        showGenAlert('');
        const lId = el('ca-gen-lesson-select') ? el('ca-gen-lesson-select').value : '';
        if (!lId) {
          showGenAlert('Vui lòng chọn một bài học trước!');
          return;
        }
        const btn = el('btn-ca-gen-load-lesson');
        try {
          btn.disabled = true;
          btn.textContent = '⏳ Đang nạp...';
          const links = await window.Admin.getLessonVocabularies(lId);
          const vocabs = (links || []).map(item => item.vocabulary).filter(Boolean);
          if (vocabs.length === 0) {
            showGenAlert('Bài học này chưa có từ vựng nào!');
            return;
          }
          vocabs.forEach(v => genState.selectedMap.set(v.id, v));
          updateGenSelectionCounter();
          if (el('ca-gen-lesson-status')) {
            el('ca-gen-lesson-status').textContent = `✅ Đã nạp ${vocabs.length} từ từ bài học vào danh sách chọn (tổng đang chọn ${genState.selectedMap.size} từ).`;
          }
        } catch (err) {
          showGenAlert(err.message || 'Không tải được từ vựng của bài học.');
        } finally {
          btn.disabled = false;
          btn.textContent = '📥 Chọn toàn bộ từ bài này';
        }
      });
    }

    if (el('btn-ca-gen-generate')) {
      el('btn-ca-gen-generate').addEventListener('click', async () => {
        showGenAlert('');
        const shared = S();
        const selectedVocabs = Array.from(genState.selectedMap.values());
        if (selectedVocabs.length === 0) {
          showGenAlert('Vui lòng chọn ít nhất 1 từ vựng từ Kho hoặc từ Bài học!');
          return;
        }
        const fmt = el('ca-gen-format') ? el('ca-gen-format').value : 'mixed';
        const reqCount = parseInt((el('ca-gen-count') && el('ca-gen-count').value) || String(selectedVocabs.length), 10);
        const btn = el('btn-ca-gen-generate');

        try {
          btn.disabled = true;
          btn.textContent = '⏳ Đang sinh câu hỏi...';
          const poolRes = await window.Admin.getVocabDistractorPool(selectedVocabs.map(v => v.id));
          const generated = shared.generateQuickQuestions({
            selectedVocabs: (poolRes && poolRes.selected && poolRes.selected.length > 0) ? poolRes.selected : selectedVocabs,
            distractorPool: (poolRes && poolRes.distractor_pool) || [],
            questionFormat: fmt,
            count: reqCount
          });
          genState.generatedDrafts = generated.map(q => ({ ...q, _keep: true }));
          renderGeneratedPreviewList();
        } catch (err) {
          showGenAlert(err.message || 'Lỗi khi lấy từ vựng tạo câu hỏi.');
        } finally {
          btn.disabled = false;
          btn.textContent = '⚡ Sinh câu hỏi xem trước';
        }
      });
    }

    if (el('btn-ca-gen-commit')) {
      el('btn-ca-gen-commit').addEventListener('click', () => {
        const shared = S();
        const toAdd = genState.generatedDrafts
          .filter(q => q._keep !== false)
          .map(({ _keep, ...cleanQ }) => cleanQ);

        const roomLeft = shared.MAX_QUESTIONS - state.questions.length;
        if (toAdd.length > roomLeft) {
          showGenAlert(`Chỉ còn thêm được tối đa ${roomLeft} câu nữa (giới hạn ${shared.MAX_QUESTIONS} câu/bài). Hãy bỏ bớt câu không cần.`);
          return;
        }
        const firstNewIdx = state.questions.length;
        state.questions.push(...toAdd);
        const m = el('modal-ca-vocab-generator');
        if (m) m.classList.remove('active');
        renderQuestionsBuilder({ preserveScroll: true });
        if (toAdd.length > 0) {
          scrollToQuestion(firstNewIdx, { behavior: 'smooth', focusPrompt: true });
        }
      });
    }
  }

  return {
    initOnce,
    resetCustomWizardState,
    setModeActive,
    openEditCustomAssignment,
    openCustomResultsModal
  };
})();
