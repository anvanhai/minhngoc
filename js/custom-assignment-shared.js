/**
 * MODULE DÙNG CHUNG CHO BÀI TẬP TỰ SOẠN (CUSTOM ASSIGNMENTS - QUIZLET / QUIZIZZ)
 * Dùng cho:
 *  - Trình soạn câu hỏi giáo viên (admin-custom-assignment.js)
 *  - Màn hình làm bài & kết quả học viên (student-custom-assignment.js)
 *  - Unit tests chuẩn hóa / sinh câu hỏi / kiểm tra hợp lệ
 */
(function (global) {
  'use strict';

  const MAX_QUESTIONS = 100;
  const LIMITS = {
    TITLE: 250,
    DESCRIPTION: 2000,
    PROMPT: 2000,
    OPTION: 300,
    EXPLANATION: 2000,
    ANSWER_ITEM: 400,
    MIN_OPTIONS: 2,
    MAX_OPTIONS: 6,
    MIN_PAIRS: 2,
    MAX_PAIRS: 12,
    MAX_BLANKS: 10,
    MAX_TOKENS: 40
  };

  const QUESTION_TYPES = {
    mcq: {
      key: 'mcq',
      icon: '🔘',
      label: 'Trắc nghiệm',
      shortLabel: 'Trắc nghiệm',
      desc: '2–6 lựa chọn, chọn một hoặc nhiều đáp án đúng'
    },
    true_false: {
      key: 'true_false',
      icon: '⚖️',
      label: 'Đúng / Sai',
      shortLabel: 'Đúng / Sai',
      desc: 'Khẳng định đúng hoặc sai'
    },
    fill_blank: {
      key: 'fill_blank',
      icon: '✍️',
      label: 'Điền từ vào chỗ trống',
      shortLabel: 'Điền từ',
      desc: 'Đánh dấu ___ trong câu; hỗ trợ gõ hoặc chọn ngân hàng từ'
    },
    translation: {
      key: 'translation',
      icon: '🌐',
      label: 'Dịch câu',
      shortLabel: 'Dịch câu',
      desc: 'Việt→Trung hoặc Trung→Việt; nhiều đáp án hoặc chờ giáo viên chấm'
    },
    word_order: {
      key: 'word_order',
      icon: '🧩',
      label: 'Sắp xếp từ thành câu',
      shortLabel: 'Sắp xếp từ',
      desc: 'Tách mảnh tự động/thủ công, thêm mảnh gây nhiễu'
    },
    matching: {
      key: 'matching',
      icon: '🔗',
      label: 'Nối cặp (Quizlet Match)',
      shortLabel: 'Nối cặp',
      desc: 'Nối đúng 2–12 cặp Hán tự - Nghĩa hoặc cặp tự do'
    }
  };

  function safeStr(val, fallback = '') {
    if (val === null || val === undefined) return fallback;
    const s = String(val);
    const trimmed = s.trim();
    if (!trimmed || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') {
      return fallback;
    }
    return s;
  }

  function escapeHtml(str) {
    return safeStr(str, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toHalfWidth(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .normalize('NFC')
      .replace(/\u3000|\u00A0/g, ' ')
      .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  }

  const PINYIN_STRIP_MAP = {
    'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
    'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
    'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
    'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
    'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
    'ǖ': 'u', 'ǘ': 'u', 'ǚ': 'u', 'ǜ': 'u', 'ü': 'u',
    'Ā': 'A', 'Á': 'A', 'Ǎ': 'A', 'À': 'A',
    'Ē': 'E', 'É': 'E', 'Ě': 'E', 'È': 'E',
    'Ī': 'I', 'Í': 'I', 'Ǐ': 'I', 'Ì': 'I',
    'Ō': 'O', 'Ó': 'O', 'Ǒ': 'O', 'Ò': 'O',
    'Ū': 'U', 'Ú': 'U', 'Ǔ': 'U', 'Ù': 'U',
    'Ǖ': 'U', 'Ǘ': 'U', 'Ǚ': 'U', 'Ǜ': 'U', 'Ü': 'U'
  };

  function normFillBlank(val, opts = {}) {
    const ignoreCase = opts.ignoreCase !== false;
    const ignorePinyinTones = Boolean(opts.ignorePinyinTones);
    const ignoreExtraSpaces = opts.ignoreExtraSpaces !== false;

    let res = toHalfWidth(val || '').replace(/[\uFEFF\u200B\u200C\u200D\u2060]/g, '');
    res = ignoreExtraSpaces ? res.trim().replace(/\s+/g, ' ') : res.trim();
    if (ignoreCase) res = res.toLowerCase();
    if (ignorePinyinTones) {
      res = Array.from(res).map(ch => PINYIN_STRIP_MAP[ch] || ch).join('');
    }
    return res;
  }

  function normTranslation(val, direction = 'vi_to_zh') {
    let res = toHalfWidth(val || '')
      .replace(/[\uFEFF\u200B\u200C\u200D\u2060]/g, '')
      .toLowerCase()
      .replace(/[.,?!;:'"“”‘’。，？！、：；（）()\[\]{}\-—…·~/`]+/g, ' ');
    const hasCjk = /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(res);
    if (direction === 'vi_to_zh' || hasCjk) {
      return res.replace(/\s+/g, '');
    }
    return res.trim().replace(/\s+/g, ' ');
  }

  function countBlanksInPrompt(promptText) {
    const matches = String(promptText || '').match(/___/g);
    return matches ? matches.length : 0;
  }

  function tokenizeSentenceForWordOrder(sentence) {
    const raw = toHalfWidth(sentence || '').trim();
    if (!raw) return [];

    // Nếu người dùng đã gõ khoảng trắng rõ ràng -> ưu tiên tách theo khoảng trắng
    if (/\s+/.test(raw)) {
      return raw.split(/\s+/).map(s => s.trim()).filter(Boolean).slice(0, LIMITS.MAX_TOKENS);
    }

    // Nếu là chuỗi tiếng Trung viết liền -> tách từng chữ Hán nhưng giữ cụm chữ Latin/số nguyên vẹn
    const tokens = [];
    const regex = /[\u4E00-\u9FFF\u3400-\u4DBF]|[A-Za-z0-9āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+|[。？！，、：；,.?!]/g;
    let m;
    while ((m = regex.exec(raw)) !== null) {
      tokens.push(m[0]);
      if (tokens.length >= LIMITS.MAX_TOKENS) break;
    }
    return tokens;
  }

  function makeEmptyQuestion(questionType = 'mcq') {
    const type = QUESTION_TYPES[questionType] ? questionType : 'mcq';
    if (type === 'mcq') {
      return {
        question_type: 'mcq',
        prompt_text: '',
        points: 1,
        explanation: '',
        source_vocabulary_ids: [],
        question_payload: {
          allow_multiple: false,
          options: [
            { id: 'opt_1', text: '' },
            { id: 'opt_2', text: '' },
            { id: 'opt_3', text: '' },
            { id: 'opt_4', text: '' }
          ]
        },
        answer_payload: {
          correct_option_ids: ['opt_1']
        }
      };
    }
    if (type === 'true_false') {
      return {
        question_type: 'true_false',
        prompt_text: '',
        points: 1,
        explanation: '',
        source_vocabulary_ids: [],
        question_payload: {},
        answer_payload: { correct_boolean: true }
      };
    }
    if (type === 'fill_blank') {
      return {
        question_type: 'fill_blank',
        prompt_text: 'Điền từ thích hợp vào chỗ trống: ___',
        points: 1,
        explanation: '',
        source_vocabulary_ids: [],
        question_payload: {
          input_mode: 'both',
          blank_count: 1,
          word_bank: [],
          ignore_case: true,
          ignore_pinyin_tones: true,
          ignore_extra_spaces: true
        },
        answer_payload: {
          blanks: [{ accepted: [] }]
        }
      };
    }
    if (type === 'translation') {
      return {
        question_type: 'translation',
        prompt_text: '',
        points: 1,
        explanation: '',
        source_vocabulary_ids: [],
        question_payload: {
          direction: 'vi_to_zh',
          requires_manual_grading: false
        },
        answer_payload: {
          accepted_answers: []
        }
      };
    }
    if (type === 'word_order') {
      return {
        question_type: 'word_order',
        prompt_text: 'Sắp xếp các mảnh sau thành câu tiếng Trung hoàn chỉnh:',
        points: 1,
        explanation: '',
        source_vocabulary_ids: [],
        question_payload: {
          distractor_count: 0
        },
        answer_payload: {
          correct_sentence: '',
          tokens: [],
          distractor_tokens: []
        }
      };
    }
    return {
      question_type: 'matching',
      prompt_text: 'Nối các cặp tương ứng bên dưới:',
      points: 1,
      explanation: '',
      source_vocabulary_ids: [],
      question_payload: {},
      answer_payload: {
        pairs: [
          { left_text: '', right_text: '' },
          { left_text: '', right_text: '' },
          { left_text: '', right_text: '' }
        ]
      }
    };
  }

  function validateQuestion(q, idx = 0) {
    const errors = [];
    const label = `Câu ${idx + 1}`;
    if (!q || typeof q !== 'object') {
      return [`${label}: Dữ liệu câu hỏi không hợp lệ.`];
    }

    const qType = q.question_type;
    if (!QUESTION_TYPES[qType]) {
      errors.push(`${label}: Dạng câu hỏi không hợp lệ.`);
      return errors;
    }

    const prompt = String(q.prompt_text || '').trim();
    if (!prompt) {
      errors.push(`${label}: Chưa nhập đề bài câu hỏi.`);
    } else if (prompt.length > LIMITS.PROMPT) {
      errors.push(`${label}: Đề bài vượt quá ${LIMITS.PROMPT} ký tự.`);
    }

    const points = Number(q.points);
    if (!Number.isFinite(points) || points <= 0 || points > 100) {
      errors.push(`${label}: Điểm câu hỏi phải lớn hơn 0 và tối đa 100.`);
    }

    const explanation = String(q.explanation || '').trim();
    if (explanation.length > LIMITS.EXPLANATION) {
      errors.push(`${label}: Phần giải thích vượt quá ${LIMITS.EXPLANATION} ký tự.`);
    }

    const qp = q.question_payload || {};
    const ap = q.answer_payload || {};

    if (qType === 'mcq') {
      const options = Array.isArray(qp.options) ? qp.options : [];
      if (options.length < LIMITS.MIN_OPTIONS || options.length > LIMITS.MAX_OPTIONS) {
        errors.push(`${label} (Trắc nghiệm): Phải có từ ${LIMITS.MIN_OPTIONS} đến ${LIMITS.MAX_OPTIONS} lựa chọn.`);
      }
      const seenTexts = new Set();
      options.forEach((opt, oi) => {
        const txt = String((opt && opt.text) || '').trim();
        if (!txt) {
          errors.push(`${label} (Trắc nghiệm): Lựa chọn ${String.fromCharCode(65 + oi)} đang để trống.`);
        } else if (txt.length > LIMITS.OPTION) {
          errors.push(`${label} (Trắc nghiệm): Lựa chọn ${String.fromCharCode(65 + oi)} vượt quá ${LIMITS.OPTION} ký tự.`);
        } else {
          const normKey = txt.toLowerCase();
          if (seenTexts.has(normKey)) {
            errors.push(`${label} (Trắc nghiệm): Các lựa chọn bị trùng lặp ("${txt}").`);
          }
          seenTexts.add(normKey);
        }
      });

      const optionIds = new Set(options.map(o => o.id));
      const correctIds = (Array.isArray(ap.correct_option_ids) ? ap.correct_option_ids : []).filter(id => optionIds.has(id));
      if (correctIds.length === 0) {
        errors.push(`${label} (Trắc nghiệm): Chưa chọn đáp án đúng.`);
      } else if (!qp.allow_multiple && correctIds.length > 1) {
        errors.push(`${label} (Trắc nghiệm): Chưa bật chế độ nhiều đáp án nhưng đang chọn ${correctIds.length} đáp án đúng.`);
      }
    } else if (qType === 'true_false') {
      if (typeof ap.correct_boolean !== 'boolean') {
        errors.push(`${label} (Đúng/Sai): Chưa chọn đáp án Đúng hoặc Sai.`);
      }
    } else if (qType === 'fill_blank') {
      const blankCount = countBlanksInPrompt(prompt);
      if (blankCount === 0) {
        errors.push(`${label} (Điền từ): Đề bài phải có ít nhất một dấu chỗ trống "___".`);
      } else if (blankCount > LIMITS.MAX_BLANKS) {
        errors.push(`${label} (Điền từ): Tối đa ${LIMITS.MAX_BLANKS} chỗ trống mỗi câu.`);
      }

      const blanks = Array.isArray(ap.blanks) ? ap.blanks : [];
      if (blankCount > 0 && blanks.length !== blankCount) {
        errors.push(`${label} (Điền từ): Số chỗ trống trong câu (${blankCount}) chưa khớp số ô đáp án (${blanks.length}).`);
      }

      blanks.forEach((b, bi) => {
        const acc = (Array.isArray(b && b.accepted) ? b.accepted : []).map(x => String(x || '').trim()).filter(Boolean);
        if (acc.length === 0) {
          errors.push(`${label} (Điền từ): Chỗ trống #${bi + 1} chưa có đáp án chấp nhận.`);
        } else if (acc.some(a => a.length > LIMITS.ANSWER_ITEM)) {
          errors.push(`${label} (Điền từ): Đáp án chỗ trống #${bi + 1} vượt quá ${LIMITS.ANSWER_ITEM} ký tự.`);
        }
      });

      if ((qp.input_mode === 'word_bank' || qp.input_mode === 'both') && blanks.length > 0) {
        const wb = (Array.isArray(qp.word_bank) ? qp.word_bank : []).map(x => String(x || '').trim()).filter(Boolean);
        if (wb.length < blanks.length) {
          errors.push(`${label} (Điền từ): Chế độ Ngân hàng từ cần ít nhất ${blanks.length} từ trong ngân hàng từ.`);
        }
      }
    } else if (qType === 'translation') {
      const manual = Boolean(qp.requires_manual_grading);
      const accepted = (Array.isArray(ap.accepted_answers) ? ap.accepted_answers : []).map(x => String(x || '').trim()).filter(Boolean);
      if (!manual && accepted.length === 0) {
        errors.push(`${label} (Dịch câu): Cần nhập ít nhất 1 đáp án được chấp nhận hoặc bật "Cần giáo viên chấm".`);
      }
      if (accepted.some(a => a.length > LIMITS.ANSWER_ITEM * 2)) {
        errors.push(`${label} (Dịch câu): Đáp án tham khảo quá dài.`);
      }
    } else if (qType === 'word_order') {
      const tokens = (Array.isArray(ap.tokens) ? ap.tokens : []).filter(t => String((t && t.text) || '').trim() !== '');
      if (tokens.length < 2) {
        errors.push(`${label} (Sắp xếp từ): Câu phải có ít nhất 2 mảnh từ hợp lệ.`);
      }
      const distractors = (Array.isArray(ap.distractor_tokens) ? ap.distractor_tokens : []).filter(t => String((t && t.text) || '').trim() !== '');
      if (tokens.length + distractors.length > LIMITS.MAX_TOKENS) {
        errors.push(`${label} (Sắp xếp từ): Tổng số mảnh từ + gây nhiễu không vượt quá ${LIMITS.MAX_TOKENS}.`);
      }
    } else if (qType === 'matching') {
      const pairs = Array.isArray(ap.pairs) ? ap.pairs : [];
      if (pairs.length < LIMITS.MIN_PAIRS || pairs.length > LIMITS.MAX_PAIRS) {
        errors.push(`${label} (Nối cặp): Phải có từ ${LIMITS.MIN_PAIRS} đến ${LIMITS.MAX_PAIRS} cặp nối.`);
      }
      const leftSet = new Set();
      const rightSet = new Set();
      pairs.forEach((p, pi) => {
        const l = String((p && p.left_text) || '').trim();
        const r = String((p && p.right_text) || '').trim();
        if (!l || !r) {
          errors.push(`${label} (Nối cặp): Cặp #${pi + 1} chưa nhập đủ hai vế.`);
        } else {
          if (l.length > LIMITS.OPTION || r.length > LIMITS.OPTION) {
            errors.push(`${label} (Nối cặp): Nội dung cặp #${pi + 1} vượt quá ${LIMITS.OPTION} ký tự.`);
          }
          const lk = l.toLowerCase();
          const rk = r.toLowerCase();
          if (leftSet.has(lk)) {
            errors.push(`${label} (Nối cặp): Vế trái bị trùng ("${l}").`);
          }
          if (rightSet.has(rk)) {
            errors.push(`${label} (Nối cặp): Vế phải bị trùng ("${r}").`);
          }
          leftSet.add(lk);
          rightSet.add(rk);
        }
      });
    }

    return errors;
  }

  function validateCustomAssignment({ title, dueDate, rewardXp, settings, questions, isPublished = true }) {
    const errors = [];
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) {
      errors.push('Vui lòng nhập tiêu đề bài tập.');
    } else if (cleanTitle.length > LIMITS.TITLE) {
      errors.push(`Tiêu đề bài tập không vượt quá ${LIMITS.TITLE} ký tự.`);
    }

    if (!dueDate) {
      errors.push('Vui lòng chọn hạn chót nộp bài.');
    }

    const xpNum = Number(rewardXp);
    if (!Number.isFinite(xpNum) || xpNum < 0 || xpNum > 10000) {
      errors.push('Thưởng XP phải từ 0 đến 10.000.');
    }

    const s = settings || {};
    if (s.time_limit_minutes !== null && s.time_limit_minutes !== undefined && s.time_limit_minutes !== '') {
      const t = Number(s.time_limit_minutes);
      if (!Number.isInteger(t) || t < 1 || t > 300) {
        errors.push('Giới hạn thời gian làm bài phải từ 1 đến 300 phút.');
      }
    }
    if (s.max_attempts !== null && s.max_attempts !== undefined && s.max_attempts !== '') {
      const m = Number(s.max_attempts);
      if (!Number.isInteger(m) || m < 1 || m > 100) {
        errors.push('Số lần làm bài phải từ 1 đến 100.');
      }
    }
    const passPct = Number(s.pass_score_percent ?? 60);
    if (!Number.isFinite(passPct) || passPct < 0 || passPct > 100) {
      errors.push('Ngưỡng đạt (%) phải từ 0 đến 100.');
    }

    const list = Array.isArray(questions) ? questions : [];
    if (list.length > MAX_QUESTIONS) {
      errors.push(`Mỗi bài tập chỉ được tối đa ${MAX_QUESTIONS} câu hỏi (hiện có ${list.length} câu).`);
    }
    if (isPublished && list.length === 0) {
      errors.push('Bài tập giao ngay phải có ít nhất 1 câu hỏi.');
    }

    list.forEach((q, idx) => {
      errors.push(...validateQuestion(q, idx));
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  /**
   * Chấm nháp ngay trên trình duyệt CHỈ dùng cho chế độ "Xem trước như học viên" của giáo viên
   */
  function gradeQuestionClientPreview(q, response) {
    const pts = Number(q.points || 1);
    const qp = q.question_payload || {};
    const ap = q.answer_payload || {};
    const resp = response || {};

    if (q.question_type === 'mcq') {
      const exp = [...new Set(ap.correct_option_ids || [])].sort();
      const got = [...new Set(resp.selected_option_ids || [])].sort();
      const ok = exp.length > 0 && exp.length === got.length && exp.every((v, i) => v === got[i]);
      return { is_correct: ok, points_earned: ok ? pts : 0, needs_manual_grading: false };
    }
    if (q.question_type === 'true_false') {
      const ok = typeof resp.selected_boolean === 'boolean' && resp.selected_boolean === ap.correct_boolean;
      return { is_correct: ok, points_earned: ok ? pts : 0, needs_manual_grading: false };
    }
    if (q.question_type === 'fill_blank') {
      const blanks = Array.isArray(ap.blanks) ? ap.blanks : [];
      const values = Array.isArray(resp.values) ? resp.values : [];
      const normOpts = {
        ignoreCase: qp.ignore_case !== false,
        ignorePinyinTones: Boolean(qp.ignore_pinyin_tones),
        ignoreExtraSpaces: qp.ignore_extra_spaces !== false
      };
      let hitCount = 0;
      const blankResults = blanks.map((b, i) => {
        const uNorm = normFillBlank(values[i] || '', normOpts);
        const uNormV = normOpts.ignorePinyinTones ? uNorm.replace(/v/g, 'u') : uNorm;
        const ok = Boolean(uNorm) && (b.accepted || []).some(acc => {
          const aNorm = normFillBlank(acc, normOpts);
          if (!aNorm) return false;
          return uNorm === aNorm || (normOpts.ignorePinyinTones && uNormV === aNorm.replace(/v/g, 'u'));
        });
        if (ok) hitCount++;
        return ok;
      });
      const allOk = blanks.length > 0 && hitCount === blanks.length;
      return { is_correct: allOk, points_earned: allOk ? pts : 0, needs_manual_grading: false, blank_results: blankResults };
    }
    if (q.question_type === 'translation') {
      if (qp.requires_manual_grading) {
        return { is_correct: null, points_earned: 0, needs_manual_grading: true };
      }
      const dir = qp.direction || 'vi_to_zh';
      const uNorm = normTranslation(resp.text || '', dir);
      const ok = Boolean(uNorm) && (ap.accepted_answers || []).some(acc => normTranslation(acc, dir) === uNorm);
      return { is_correct: ok, points_earned: ok ? pts : 0, needs_manual_grading: false };
    }
    if (q.question_type === 'word_order') {
      const tokens = Array.isArray(ap.tokens) ? ap.tokens : [];
      const allPool = [...tokens, ...(Array.isArray(ap.distractor_tokens) ? ap.distractor_tokens : [])];
      const map = new Map(allPool.map(t => [t.id, t.text]));
      const expectedStr = tokens.map(t => t.text).join('|');
      const gotIds = Array.isArray(resp.ordered_token_ids) ? resp.ordered_token_ids : [];
      const gotStr = gotIds.map(id => map.get(id) || '').join('|');
      const ok = gotIds.length === tokens.length && expectedStr !== '' && gotStr === expectedStr;
      return { is_correct: ok, points_earned: ok ? pts : 0, needs_manual_grading: false };
    }
    if (q.question_type === 'matching') {
      const pairs = Array.isArray(ap.pairs) ? ap.pairs : [];
      const matched = Array.isArray(resp.matched_pairs) ? resp.matched_pairs : [];
      const leftItems = qp._preview_left_items || [];
      const rightItems = qp._preview_right_items || [];
      const lMap = new Map(leftItems.map(x => [x.id, x.text]));
      const rMap = new Map(rightItems.map(x => [x.id, x.text]));
      let correctPairs = 0;
      const seenL = new Set();
      const seenR = new Set();
      matched.forEach(mp => {
        if (!mp || seenL.has(mp.left_id) || seenR.has(mp.right_id)) return;
        seenL.add(mp.left_id);
        seenR.add(mp.right_id);
        const lt = String(lMap.get(mp.left_id) || '').trim();
        const rt = String(rMap.get(mp.right_id) || '').trim();
        const hit = pairs.some(p => (p.left_text || '').trim() === lt && (p.right_text || '').trim() === rt);
        if (hit) correctPairs++;
      });
      const allOk = pairs.length > 0 && correctPairs === pairs.length;
      const earned = pairs.length > 0 ? Math.round((pts * correctPairs / pairs.length) * 100) / 100 : 0;
      return { is_correct: allOk, points_earned: earned, needs_manual_grading: false };
    }
    return { is_correct: false, points_earned: 0, needs_manual_grading: false };
  }

  /**
   * Sinh nhanh câu hỏi từ danh sách từ vựng & pool đáp án nhiễu cùng HSK / cùng loại từ
   * questionFormat: 'mcq_vi' | 'mcq_hanzi' | 'fill_hanzi' | 'fill_pinyin' | 'matching' | 'mixed'
   */
  function pickSmartDistractors(targetWord, allCandidates, fieldName, needed = 3) {
    const targetVal = String(targetWord[fieldName] || '').trim().toLowerCase();
    const seenVals = new Set([targetVal]);
    const samePosSameHsk = [];
    const sameHsk = [];
    const fallbackPool = [];

    const normPos = (p) => String(p || '').trim().toLowerCase();
    const targetPos = normPos(targetWord.part_of_speech);

    for (const cand of allCandidates) {
      if (!cand || cand.id === targetWord.id) continue;
      const rawVal = String(cand[fieldName] || '').trim();
      if (!rawVal) continue;
      const key = rawVal.toLowerCase();
      if (seenVals.has(key)) continue;

      if (cand.hsk_level === targetWord.hsk_level && targetPos && normPos(cand.part_of_speech) === targetPos) {
        samePosSameHsk.push(rawVal);
      } else if (cand.hsk_level === targetWord.hsk_level) {
        sameHsk.push(rawVal);
      } else {
        fallbackPool.push(rawVal);
      }
    }

    const picked = [];
    const appendFrom = (arr) => {
      for (const val of shuffleArray(arr)) {
        if (picked.length >= needed) break;
        const key = val.toLowerCase();
        if (!seenVals.has(key)) {
          seenVals.add(key);
          picked.push(val);
        }
      }
    };

    appendFrom(samePosSameHsk);
    appendFrom(sameHsk);
    appendFrom(fallbackPool);
    return picked;
  }

  function generateQuickQuestions({ selectedVocabs, distractorPool = [], questionFormat = 'mixed', count = 10 }) {
    const vocabs = Array.isArray(selectedVocabs) ? selectedVocabs.filter(v => v && v.hanzi && v.meaning_vi) : [];
    if (vocabs.length === 0) return [];

    // Kết hợp nguồn lọc đáp án nhiễu: ưu tiên pool server + từ đang chọn
    const mergedMap = new Map();
    [...distractorPool, ...vocabs].forEach(w => {
      if (w && w.id) mergedMap.set(w.id, w);
    });
    const allCandidates = Array.from(mergedMap.values());

    if (questionFormat === 'matching') {
      // Chia thành từng nhóm 4–6 cặp cho mỗi câu Nối cặp kiểu Quizlet Match
      const shuffled = shuffleArray(vocabs);
      const maxQuestionsWanted = Math.max(1, Math.min(20, parseInt(count, 10) || Math.ceil(shuffled.length / 5)));
      const questions = [];
      const pairBatchSize = Math.min(6, Math.max(2, Math.ceil(shuffled.length / maxQuestionsWanted)));

      for (let i = 0; i < shuffled.length && questions.length < maxQuestionsWanted; i += pairBatchSize) {
        let slice = shuffled.slice(i, i + pairBatchSize);
        if (slice.length === 1 && questions.length > 0 && questions[questions.length - 1].answer_payload.pairs.length < 12) {
          questions[questions.length - 1].answer_payload.pairs.push({
            left_text: `${slice[0].hanzi} (${slice[0].pinyin || ''})`.trim(),
            right_text: slice[0].meaning_vi
          });
          questions[questions.length - 1].source_vocabulary_ids.push(slice[0].id);
          continue;
        }
        if (slice.length < 2) {
          // Bổ sung 1 từ cùng HSK nếu người dùng chỉ chọn 1 từ để tạo Matching
          const extra = allCandidates.find(c => c.id !== slice[0].id);
          if (extra) slice.push(extra);
        }
        if (slice.length >= 2) {
          questions.push({
            question_type: 'matching',
            prompt_text: 'Nối chữ Hán ở cột trái với nghĩa tiếng Việt đúng ở cột phải:',
            points: 1,
            explanation: slice.map(w => `${w.hanzi} (${w.pinyin}): ${w.meaning_vi}`).join(' · '),
            source_vocabulary_ids: slice.map(w => w.id),
            question_payload: {},
            answer_payload: {
              pairs: slice.map(w => ({
                left_text: w.hanzi,
                right_text: w.meaning_vi
              }))
            }
          });
        }
      }
      return questions;
    }

    const targetCount = Math.min(vocabs.length, Math.max(1, Math.min(MAX_QUESTIONS, parseInt(count, 10) || vocabs.length)));
    const chosenWords = shuffleArray(vocabs).slice(0, targetCount);
    const mixedFormats = ['mcq_vi', 'mcq_hanzi', 'fill_hanzi', 'fill_pinyin'];
    const generated = [];

    for (let i = 0; i < chosenWords.length; i++) {
      const w = chosenWords[i];
      const fmt = questionFormat === 'mixed' ? mixedFormats[i % mixedFormats.length] : questionFormat;

      if (fmt === 'mcq_vi') {
        const distractors = pickSmartDistractors(w, allCandidates, 'meaning_vi', 3);
        const optionsText = shuffleArray([w.meaning_vi, ...distractors]);
        const options = optionsText.map((txt, oi) => ({ id: `opt_${oi + 1}`, text: txt }));
        const correctOpt = options.find(o => o.text === w.meaning_vi);
        if (options.length >= 2 && correctOpt) {
          generated.push({
            question_type: 'mcq',
            prompt_text: `Từ "${w.hanzi}" (${w.pinyin}) có nghĩa tiếng Việt là gì?`,
            points: 1,
            explanation: `${w.hanzi} (${w.pinyin}) = ${w.meaning_vi}${w.example_hanzi ? ` · Ví dụ: ${w.example_hanzi}` : ''}`,
            source_vocabulary_ids: [w.id],
            question_payload: { allow_multiple: false, options },
            answer_payload: { correct_option_ids: [correctOpt.id] }
          });
          continue;
        }
      }

      if (fmt === 'mcq_hanzi') {
        const distractors = pickSmartDistractors(w, allCandidates, 'hanzi', 3);
        const optionsText = shuffleArray([w.hanzi, ...distractors]);
        const options = optionsText.map((txt, oi) => ({ id: `opt_${oi + 1}`, text: txt }));
        const correctOpt = options.find(o => o.text === w.hanzi);
        if (options.length >= 2 && correctOpt) {
          generated.push({
            question_type: 'mcq',
            prompt_text: `Chọn chữ Hán đúng cho nghĩa "${w.meaning_vi}" (${w.pinyin}):`,
            points: 1,
            explanation: `${w.hanzi} (${w.pinyin}) = ${w.meaning_vi}`,
            source_vocabulary_ids: [w.id],
            question_payload: { allow_multiple: false, options },
            answer_payload: { correct_option_ids: [correctOpt.id] }
          });
          continue;
        }
      }

      if (fmt === 'fill_hanzi') {
        const distractors = pickSmartDistractors(w, allCandidates, 'hanzi', 3);
        generated.push({
          question_type: 'fill_blank',
          prompt_text: `Hãy nhập hoặc chọn chữ Hán có nghĩa "${w.meaning_vi}" (Pinyin: ${w.pinyin}): ___`,
          points: 1,
          explanation: `Đáp án đúng là ${w.hanzi} (${w.pinyin}).`,
          source_vocabulary_ids: [w.id],
          question_payload: {
            input_mode: 'both',
            blank_count: 1,
            word_bank: shuffleArray([w.hanzi, ...distractors]),
            ignore_case: true,
            ignore_pinyin_tones: false,
            ignore_extra_spaces: true
          },
          answer_payload: {
            blanks: [{ accepted: [w.hanzi] }]
          }
        });
        continue;
      }

      // fill_pinyin (mặc định fallback)
      const distractors = pickSmartDistractors(w, allCandidates, 'pinyin', 3);
      generated.push({
        question_type: 'fill_blank',
        prompt_text: `Gõ phiên âm Pinyin cho từ "${w.hanzi}" (nghĩa: ${w.meaning_vi}): ___`,
        points: 1,
        explanation: `${w.hanzi} đọc là "${w.pinyin}" (có thể gõ có dấu hoặc không dấu thanh).`,
        source_vocabulary_ids: [w.id],
        question_payload: {
          input_mode: 'both',
          blank_count: 1,
          word_bank: shuffleArray([w.pinyin, ...distractors]),
          ignore_case: true,
          ignore_pinyin_tones: true,
          ignore_extra_spaces: true
        },
        answer_payload: {
          blanks: [{ accepted: [w.pinyin] }]
        }
      });
    }

    return generated;
  }

  const CustomAssignmentShared = {
    MAX_QUESTIONS,
    LIMITS,
    QUESTION_TYPES,
    safeStr,
    escapeHtml,
    toHalfWidth,
    normFillBlank,
    normTranslation,
    countBlanksInPrompt,
    tokenizeSentenceForWordOrder,
    makeEmptyQuestion,
    validateQuestion,
    validateCustomAssignment,
    shuffleArray,
    gradeQuestionClientPreview,
    pickSmartDistractors,
    generateQuickQuestions
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CustomAssignmentShared;
  }
  if (global) {
    global.CustomAssignmentShared = CustomAssignmentShared;
  }
})(typeof window !== 'undefined' ? window : globalThis);
