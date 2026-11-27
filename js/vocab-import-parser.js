/**
 * MODULE CHUẨN HÓA & NHẬN DIỆN FILE NHẬP TỪ VỰNG (TRÌNH DUYỆT & NODE)
 * - Lớp 1: Chuẩn hóa đầu vào (encoding UTF-8/UTF-16/Windows-1258/GB18030, delimiter,
 *          tách file dính 1 cột, đa sheet Excel, ô gộp !merges, làm sạch ô)
 * - Lớp 2: Nhận diện cột theo tiêu đề đa ngôn ngữ & đoán nội dung kèm điểm tin cậy,
 *          suy đoán cấp HSK từ tên file, kiểm tra dòng lỗi & xuất CSV dòng lỗi
 * - Không sửa nội dung từ vựng, không thêm phụ thuộc ngoài, không dùng service_role.
 */
(function (global) {
  'use strict';

  const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
  const MAX_IMPORT_ROWS = 5000;

  const FIELD_DEFS = [
    { key: 'hanzi', label: 'Chữ Hán (hanzi)', shortLabel: 'Chữ Hán', required: true },
    { key: 'pinyin', label: 'Pinyin (phiên âm)', shortLabel: 'Pinyin', required: true },
    { key: 'meaning_vi', label: 'Nghĩa tiếng Việt (meaning_vi)', shortLabel: 'Nghĩa tiếng Việt', required: true },
    { key: 'hsk_level', label: 'Cấp HSK (1–9)', shortLabel: 'Cấp HSK', required: false },
    { key: 'part_of_speech', label: 'Loại từ (part_of_speech)', shortLabel: 'Loại từ', required: false },
    { key: 'example_hanzi', label: 'Ví dụ chữ Hán', shortLabel: 'Ví dụ Hán', required: false },
    { key: 'example_pinyin', label: 'Phiên âm ví dụ', shortLabel: 'Pinyin ví dụ', required: false },
    { key: 'example_vi', label: 'Nghĩa ví dụ', shortLabel: 'Nghĩa ví dụ', required: false },
    { key: 'sort_order', label: 'Thứ tự / STT', shortLabel: 'STT', required: false }
  ];

  const HEADER_ALIASES = {
    hanzi: [
      'hanzi', 'chu han', 'chuhan', 'han tu', 'hantu', 'tu vung', 'tuvung',
      'tu', 'tu moi', 'tieng trung', 'word', 'chinese', 'vocab', 'vocabulary',
      '汉字', '词', '词语', '生词', '汉语'
    ],
    pinyin: [
      'pinyin', 'phien am', 'phienam', 'binh am', 'binham', 'am doc',
      'phien am chu han', '拼音'
    ],
    meaning_vi: [
      'meaning_vi', 'meaning vi', 'meaning', 'nghia', 'nghia tieng viet',
      'nghia viet', 'dich', 'dich nghia', 'tieng viet', 'y nghia',
      '释义', '意思', '翻译', '越南语', '越语'
    ],
    hsk_level: [
      'hsk_level', 'hsk level', 'hsk', 'cap do', 'cap do hsk', 'cap hsk',
      'cap', 'level', 'bac', '等级', '级别', 'hsk级'
    ],
    part_of_speech: [
      'part_of_speech', 'part of speech', 'tu loai', 'tuloai', 'loai tu',
      'loaitu', 'pos', 'type', 'tu tinh', '词性'
    ],
    example_hanzi: [
      'example_hanzi', 'example hanzi', 'vi du', 'vidu', 'cau vi du',
      'vi du han tu', 'vi du chu han', 'cau mau', 'example', 'vd han', '例句'
    ],
    example_pinyin: [
      'example_pinyin', 'example pinyin', 'phien am vi du', 'pinyin vi du',
      'phien am cau', 'vd pinyin', '例句拼音'
    ],
    example_vi: [
      'example_vi', 'example vi', 'nghia vi du', 'dich vi du', 'nghia cau',
      'nghia cau vi du', 'dich cau vi du', 'vd nghia', '例句翻译', '例句释义'
    ],
    sort_order: [
      'sort_order', 'sort order', 'stt', 'tt', 'no.', 'no', 'thu tu',
      'so thu tu', 'order', 'index', 'id', '序号'
    ]
  };

  const CJK_CHAR_REGEX = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
  const CJK_SENTENCE_PUNCT_REGEX = /[。？！]/;
  const LATIN_SENTENCE_PUNCT_REGEX = /[.?!]/;

  // Thanh điệu chỉ xuất hiện trong Pinyin (không dùng trong tiếng Việt)
  const PINYIN_EXCLUSIVE_TONE_REGEX = /[āǎēěīǐōǒūǔǖǘǚǜĀǍĒĚĪǏŌǑŪǓǕǗǙǛ]/;
  // Tất cả thanh điệu Pinyin (gồm cả sắc/huyền giao thoa với tiếng Việt)
  const PINYIN_ANY_TONE_REGEX = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛüÜ]/;

  // Ký tự / dấu đặc trưng tiếng Việt (không tồn tại trong Pinyin)
  const VIETNAMESE_EXCLUSIVE_REGEX = /[ăâđêôơưĂÂĐÊÔƠƯảãạằắẳẵặầấẩẫậẻẽẹềếểễệỉĩịỏõọồốổỗộờớởỡợủũụừứửữựỳỷỹỵẢÃẠẰẮẲẴẶẦẤẨẪẬẺẼẸỀẾỂỄỆỈĨỊỎÕỌỒỐỔỖỘỜỚỞỠỢỦŨỤỪỨỬỮỰỲỶỸỴ]/;
  const VIETNAMESE_COMMON_WORDS_REGEX = /(?:^|\s)(?:của|và|là|một|những|các|người|tôi|bạn|anh|chị|em|không|có|được|cho|với|trong|ngoài|trên|dưới|này|kia|đó|làm|nói|đi|học|ăn|uống|mua|bán|đến|về|rất|quá|nhiều|ít|khi|nào|gì|sao|thế|tốt|đẹp|mới|cũ|lớn|nhỏ|chuẩn|bị|dự|định|xin|chào|cảm|ơn)(?=$|\s|[,.;:!?/])/i;

  // Ký tự rác thường gặp khi giải mã sai từ UTF-8 / GB sang bảng mã Latin 1-byte
  const MOJIBAKE_SYMBOL_REGEX = /[\uFFFD¤¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÄÅÆÇËÎÏÑÖØÞßäåæçëîïñöøþÿ]/g;

  const POS_TOKENS = new Set([
    'danh tu', 'dong tu', 'tinh tu', 'pho tu', 'dai tu', 'luong tu',
    'gioi tu', 'lien tu', 'tro tu', 'than tu', 'thanh ngu', 'so tu',
    'cum tu', 'danh dong tu', 'phuong vi tu', 'nang nguyen dong tu',
    'tu tuong thanh', 'bo ngu', 'cum dong tu', 'cum danh tu',
    'n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'num', 'mw', 'part', 'int', 'idiom',
    'noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun',
    '名词', '动词', '形容词', '副词', '代词', '量词', '介词', '连词', '助词', '叹词', '成语', '数词',
    '名詞', '動詞', '形容詞', '副詞', '代詞', '量詞'
  ]);

  const PY_SYLLABLE_REGEX = /^(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(?:iang|iong|uang|ueng|ian|iao|ing|ong|uai|uan|ang|eng|ia|ie|iu|io|ui|un|uo|ua|ue|ve|an|en|in|ai|ei|ao|ou|er|a|o|e|i|u|v|ü)+$/i;

  function cleanCellText(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/[\uFEFF\u200B\u200C\u200D\u2060\u00AD]/g, '')
      .replace(/[\u3000\u00A0]/g, ' ')
      .replace(/\uFF1B/g, ';')
      .replace(/\s+/g, ' ')
      .trim()
      .normalize('NFC');
  }

  function cleanRawDelimLine(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/[\uFEFF\u200B\u200C\u200D\u2060\u00AD]/g, '')
      .replace(/[\u3000\u00A0]/g, ' ')
      .trim();
  }

  function stripVietnameseAccents(str) {
    return String(str ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .normalize('NFC');
  }

  function normalizeHeaderToken(str) {
    return stripVietnameseAccents(cleanCellText(str))
      .toLowerCase()
      .replace(/[:*?？]+$/g, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchHeaderToField(rawHeader) {
    const rawStr = cleanCellText(rawHeader);
    if (!rawStr || rawStr.startsWith('__EMPTY')) return null;

    const candidateGroups = [];
    const pushToken = (tok) => {
      const norm = normalizeHeaderToken(tok);
      if (norm) {
        candidateGroups.push([norm, norm.replace(/\s+/g, '_')]);
      }
    };

    pushToken(rawStr);

    const parenMatch = rawStr.match(/^(.+?)[（(]([^)）]+)[)）]\s*[:*?？]*\s*$/);
    if (parenMatch) {
      pushToken(parenMatch[1]);
      pushToken(parenMatch[2]);
    }

    if (rawStr.includes('/') || rawStr.includes('|') || rawStr.includes('／')) {
      rawStr.split(/[/|／]+/).forEach(part => pushToken(part));
    }

    for (const candidates of candidateGroups) {
      for (const fieldDef of FIELD_DEFS) {
        const aliases = HEADER_ALIASES[fieldDef.key] || [];
        if (candidates.some(c => aliases.includes(c))) {
          return fieldDef.key;
        }
      }
    }
    return null;
  }

  function countMatches(str, regex) {
    const m = String(str || '').match(regex);
    return m ? m.length : 0;
  }

  function scoreDecodedText(text) {
    if (!text) return -1e6;
    const replacementCount = countMatches(text, /\uFFFD/g);
    const controlCount = countMatches(text, /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g);
    const mojibakeCount = countMatches(text, MOJIBAKE_SYMBOL_REGEX);
    const vnCharCount = countMatches(text, new RegExp(VIETNAMESE_EXCLUSIVE_REGEX.source, 'g'));
    const cjkCount = countMatches(text, new RegExp(CJK_CHAR_REGEX.source, 'g'));
    const vnWordHits = countMatches(text, new RegExp(VIETNAMESE_COMMON_WORDS_REGEX.source, 'gi'));

    // Kiểm tra tỷ lệ từ tiếng Việt hợp lệ (chữ cái Latin gắn cùng dấu tiếng Việt)
    const vnWordTokens = text.match(/[a-zA-Z\u00C0-\u1EF9]{2,}/g) || [];
    let validVnWords = 0;
    for (let i = 0; i < Math.min(vnWordTokens.length, 300); i++) {
      if (VIETNAMESE_EXCLUSIVE_REGEX.test(vnWordTokens[i])) {
        validVnWords++;
      }
    }

    // Kiểm tra cấu trúc bảng (dòng có dấu phân cách đều nhau)
    const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim() !== '').slice(0, 25);
    let delimConsistentScore = 0;
    if (lines.length >= 2) {
      for (const delim of [',', ';', '\t', '|']) {
        const counts = lines.map(l => l.split(delim).length);
        const first = counts[0];
        if (first >= 2 && counts.every(c => Math.abs(c - first) <= 1)) {
          delimConsistentScore = Math.max(delimConsistentScore, 20 + first * 3);
        }
      }
    }

    return (
      vnCharCount * 3 +
      validVnWords * 5 +
      vnWordHits * 8 +
      cjkCount * 4 +
      delimConsistentScore -
      replacementCount * 40 -
      controlCount * 20 -
      mojibakeCount * 15
    );
  }

  function tryDecodeWithEncoding(bytes, encoding, fatal = false) {
    try {
      const decoder = new TextDecoder(encoding, { fatal });
      let text = decoder.decode(bytes);
      if (encoding.toLowerCase().includes('1258')) {
        text = text.normalize('NFC');
      }
      return text;
    } catch (_) {
      return null;
    }
  }

  function decodeTextBuffer(arrayBuffer) {
    const bytes = arrayBuffer instanceof Uint8Array
      ? arrayBuffer
      : new Uint8Array(arrayBuffer || new ArrayBuffer(0));

    if (bytes.length === 0) {
      return { text: '', encoding: 'utf-8' };
    }

    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      const text = (tryDecodeWithEncoding(bytes.subarray(2), 'utf-16le') || '').replace(/^\uFEFF+/, '').normalize('NFC');
      return { text, encoding: 'utf-16le' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      const text = (tryDecodeWithEncoding(bytes.subarray(2), 'utf-16be') || '').replace(/^\uFEFF+/, '').normalize('NFC');
      return { text, encoding: 'utf-16be' };
    }
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      const utf8BomText = tryDecodeWithEncoding(bytes.subarray(3), 'utf-8', true);
      if (utf8BomText !== null) {
        return { text: utf8BomText.replace(/^\uFEFF+/, '').normalize('NFC'), encoding: 'utf-8-bom' };
      }
    }

    const strictUtf8 = tryDecodeWithEncoding(bytes, 'utf-8', true);
    if (strictUtf8 !== null) {
      return { text: strictUtf8.replace(/^\uFEFF+/, '').normalize('NFC'), encoding: 'utf-8' };
    }

    // Khi UTF-8 hợp lệ thất bại -> thử Windows-1258 & GB18030/GBK rồi chấm điểm chọn bảng mã tốt nhất
    const candidates = [];
    const win1258 = tryDecodeWithEncoding(bytes, 'windows-1258', false);
    if (win1258 !== null) {
      candidates.push({ encoding: 'windows-1258', text: win1258, score: scoreDecodedText(win1258) });
    }

    const gb18030 = tryDecodeWithEncoding(bytes, 'gb18030', false);
    if (gb18030 !== null) {
      candidates.push({ encoding: 'gb18030', text: gb18030.normalize('NFC'), score: scoreDecodedText(gb18030) });
    } else {
      const gbk = tryDecodeWithEncoding(bytes, 'gbk', false);
      if (gbk !== null) {
        candidates.push({ encoding: 'gbk', text: gbk.normalize('NFC'), score: scoreDecodedText(gbk) });
      }
    }

    const looseUtf8 = tryDecodeWithEncoding(bytes, 'utf-8', false) || '';
    candidates.push({ encoding: 'utf-8-lossy', text: looseUtf8.normalize('NFC'), score: scoreDecodedText(looseUtf8) - 10 });

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] || { encoding: 'utf-8', text: '' };
    return {
      text: best.text.replace(/^\uFEFF+/, ''),
      encoding: best.encoding
    };
  }

  function parseDelimitedText(rawText, delimiter) {
    const text = String(rawText || '')
      .replace(/^\uFEFF+/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    if (!text) {
      return { rows: [], rowStartLines: [] };
    }

    const rows = [];
    const rowStartLines = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    let currentLine = 1;
    let rowStartLine = 1;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            currentField += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          if (ch === '\n') currentLine++;
          currentField += ch;
        }
      } else {
        if (ch === '"' && currentField.trim() === '') {
          currentField = '';
          inQuotes = true;
        } else if (ch === delimiter) {
          currentRow.push(currentField);
          currentField = '';
        } else if (ch === '\n') {
          currentRow.push(currentField);
          rows.push(currentRow);
          rowStartLines.push(rowStartLine);
          currentRow = [];
          currentField = '';
          currentLine++;
          rowStartLine = currentLine;
        } else {
          currentField += ch;
        }
      }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
      rowStartLines.push(rowStartLine);
    }

    return { rows, rowStartLines };
  }

  function trimMatrixEmptyEdges(rawMatrix, rawRowNumbers = null) {
    const cleaned = [];
    const rowNumbers = [];
    let maxNonEmptyCol = -1;

    for (let r = 0; r < rawMatrix.length; r++) {
      const row = Array.isArray(rawMatrix[r]) ? rawMatrix[r] : [];
      let rowLastNonEmpty = -1;
      const mappedRow = new Array(row.length);

      for (let c = 0; c < row.length; c++) {
        const cell = cleanCellText(row[c]);
        mappedRow[c] = cell;
        if (cell !== '') {
          rowLastNonEmpty = c;
        }
      }

      if (rowLastNonEmpty >= 0) {
        cleaned.push(mappedRow);
        rowNumbers.push(rawRowNumbers && rawRowNumbers[r] ? rawRowNumbers[r] : (r + 1));
        if (rowLastNonEmpty > maxNonEmptyCol) {
          maxNonEmptyCol = rowLastNonEmpty;
        }
      }
    }

    const colCount = Math.max(0, maxNonEmptyCol + 1);
    const normalizedMatrix = cleaned.map(row => {
      const out = new Array(colCount);
      for (let c = 0; c < colCount; c++) {
        out[c] = c < row.length ? row[c] : '';
      }
      return out;
    });

    return { matrix: normalizedMatrix, rowNumbers, colCount };
  }

  function countUnescapedQuotes(str) {
    let count = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '"') {
        if (i + 1 < s.length && s[i + 1] === '"') {
          i++;
        } else {
          count++;
        }
      }
    }
    return count;
  }

  function unwrapOuterQuotedLinesIfNeeded(lines) {
    if (!Array.isArray(lines) || lines.length === 0) return lines;
    let wrappedCount = 0;
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const s = lines[i].trim();
      if (s.length >= 4 && s.startsWith('"') && s.endsWith('"') && /[,;\t|]/.test(s)) {
        wrappedCount++;
      }
    }
    if (wrappedCount < Math.min(lines.length, 30) * 0.6) return lines;

    return lines.map(line => {
      const s = line.trim();
      if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
        return s.slice(1, -1).replace(/""/g, '"');
      }
      return line;
    });
  }

  function evaluateDelimiterCandidate(rawText, delim) {
    const parsed = parseDelimitedText(rawText, delim);
    // Giữ độ rộng thực từng dòng trước khi cân bằng ma trận để đánh giá độ đồng nhất chính xác
    const nonEmptyRawLengths = [];
    for (let r = 0; r < parsed.rows.length; r++) {
      const row = parsed.rows[r];
      if (!Array.isArray(row)) continue;
      if (row.some(cell => cleanCellText(cell) !== '')) {
        nonEmptyRawLengths.push(row.length);
        if (nonEmptyRawLengths.length >= 40) break;
      }
    }

    const trimmed = trimMatrixEmptyEdges(parsed.rows, parsed.rowStartLines);
    const sampleRows = trimmed.matrix.slice(0, 40);
    if (sampleRows.length === 0 || nonEmptyRawLengths.length === 0) {
      return { delimiter: delim, score: -1, columnCount: 0, consistencyRatio: 0, parsed, trimmed };
    }

    const freq = new Map();
    nonEmptyRawLengths.forEach(len => {
      if (len >= 2) freq.set(len, (freq.get(len) || 0) + 1);
    });

    let modeCols = 0;
    let modeCount = 0;
    for (const [cols, cnt] of freq.entries()) {
      if (cnt > modeCount || (cnt === modeCount && cols > modeCols)) {
        modeCols = cols;
        modeCount = cnt;
      }
    }

    if (modeCols < 2) {
      return { delimiter: delim, score: -1, columnCount: modeCols, consistencyRatio: 0, parsed, trimmed };
    }

    const consistencyRatio = modeCount / nonEmptyRawLengths.length;

    // Kiểm tra dòng đầu tiên có khớp tiêu đề bí danh không
    let headerHits = 0;
    const seenFields = new Set();
    for (let r = 0; r < Math.min(3, sampleRows.length); r++) {
      let rowHits = 0;
      const fields = new Set();
      sampleRows[r].forEach(cell => {
        const f = matchHeaderToField(cell);
        if (f && !fields.has(f)) {
          fields.add(f);
          rowHits++;
        }
      });
      if (rowHits > headerHits) {
        headerHits = rowHits;
        fields.forEach(f => seenFields.add(f));
      }
    }

    // Kiểm tra số lượng ký tự lỗi/lẻ: ưu tiên ',' ';' '\t' hơn '|' nếu bằng điểm
    const delimTieBonus = delim === ',' ? 3 : delim === ';' ? 2.5 : delim === '\t' ? 2.5 : 0;
    const multiColBonus = modeCols >= 3 ? 25 : 8;
    const score = consistencyRatio * 100 + multiColBonus + headerHits * 25 + delimTieBonus;

    return {
      delimiter: delim,
      score,
      columnCount: trimmed.colCount,
      modeCols,
      consistencyRatio,
      headerHits,
      parsed,
      trimmed
    };
  }

  function detectDelimiter(rawText, preferredDelimiter = null) {
    if (preferredDelimiter) {
      const ev = evaluateDelimiterCandidate(rawText, preferredDelimiter);
      return {
        delimiter: preferredDelimiter,
        columnCount: ev.trimmed.colCount,
        consistencyRatio: ev.consistencyRatio,
        matrix: ev.trimmed.matrix,
        rowNumbers: ev.trimmed.rowNumbers
      };
    }

    // Lấy tối đa 60 dòng đầu để đoán dấu phân cách nhanh, vẫn đủ ngữ cảnh ngoặc kép
    const rawLines = String(rawText || '')
      .replace(/^\uFEFF+/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n');
    const sampleChunk = rawLines.slice(0, 60).join('\n');

    const candidates = [',', ';', '\t', '|'];
    const results = candidates.map(d => evaluateDelimiterCandidate(sampleChunk, d));
    results.sort((a, b) => b.score - a.score);

    let best = results[0];
    if (!best || best.score < 50) {
      // Dự phòng nếu người dùng gõ toàn bộ dấu chấm phẩy toàn góc '；' giữa các cột
      if ((sampleChunk.match(/\uFF1B/g) || []).length >= 2) {
        const replaced = String(rawText || '').replace(/\uFF1B/g, ';');
        const semiFull = evaluateDelimiterCandidate(replaced.split('\n').slice(0, 60).join('\n'), ';');
        if (semiFull.score >= 50) {
          const fullParsed = parseDelimitedText(replaced, ';');
          const fullTrimmed = trimMatrixEmptyEdges(fullParsed.rows, fullParsed.rowStartLines);
          return {
            delimiter: '；',
            columnCount: fullTrimmed.colCount,
            consistencyRatio: semiFull.consistencyRatio,
            matrix: fullTrimmed.matrix,
            rowNumbers: fullTrimmed.rowNumbers
          };
        }
      }
      return {
        delimiter: null,
        columnCount: best ? best.trimmed.colCount : 1,
        consistencyRatio: 0,
        matrix: [],
        rowNumbers: []
      };
    }

    // Parse toàn văn bản bằng dấu phân cách tốt nhất đã tìm được
    const fullParsed = parseDelimitedText(rawText, best.delimiter);
    const fullTrimmed = trimMatrixEmptyEdges(fullParsed.rows, fullParsed.rowStartLines);

    return {
      delimiter: best.delimiter,
      columnCount: fullTrimmed.colCount,
      consistencyRatio: best.consistencyRatio,
      matrix: fullTrimmed.matrix,
      rowNumbers: fullTrimmed.rowNumbers
    };
  }

  function extractMatrixFromWorksheet(XLSX, worksheet) {
    if (!worksheet || !worksheet['!ref']) {
      return { matrix: [], rowNumbers: [], colCount: 0, mergedCellAppliedCount: 0 };
    }

    // Quét các ô thực sự có dữ liệu để tránh lặp hàng trăm nghìn dòng rỗng bị định dạng viền
    let minR = Infinity;
    let maxR = -1;
    let minC = Infinity;
    let maxC = -1;

    for (const key of Object.keys(worksheet)) {
      if (!key || key[0] === '!') continue;
      const cell = worksheet[key];
      if (!cell || (cell.v === undefined && cell.w === undefined)) continue;
      const val = cell.v !== undefined && cell.v !== null ? cell.v : cell.w;
      if (val === undefined || val === null || String(val) === '') continue;
      const decoded = XLSX.utils.decode_cell(key);
      if (decoded.r < minR) minR = decoded.r;
      if (decoded.r > maxR) maxR = decoded.r;
      if (decoded.c < minC) minC = decoded.c;
      if (decoded.c > maxC) maxC = decoded.c;
    }

    if (maxR < 0 || maxC < 0) {
      return { matrix: [], rowNumbers: [], colCount: 0, mergedCellAppliedCount: 0 };
    }

    const merges = Array.isArray(worksheet['!merges']) ? worksheet['!merges'] : [];
    for (const merge of merges) {
      if (!merge || !merge.s || !merge.e) continue;
      if (merge.s.c === merge.e.c && merge.e.r > merge.s.r && merge.s.r >= minR && merge.s.c >= minC) {
        const topAddr = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
        const topCell = worksheet[topAddr];
        const topVal = topCell ? cleanCellText(topCell.v !== undefined ? topCell.v : topCell.w) : '';
        if (topVal !== '' && merge.e.r > maxR) {
          maxR = Math.min(merge.e.r, maxR + MAX_IMPORT_ROWS);
        }
      }
    }

    const totalRows = maxR - minR + 1;
    const totalCols = maxC - minC + 1;
    if (totalRows <= 0 || totalCols <= 0) {
      return { matrix: [], rowNumbers: [], colCount: 0, mergedCellAppliedCount: 0 };
    }

    const grid = new Array(totalRows);
    const rawRowNums = new Array(totalRows);

    for (let r = minR; r <= maxR; r++) {
      const rowArr = new Array(totalCols);
      for (let c = minC; c <= maxC; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = worksheet[addr];
        if (!cell) {
          rowArr[c - minC] = '';
        } else if (cell.v !== undefined && cell.v !== null) {
          rowArr[c - minC] = cell.v;
        } else if (cell.w !== undefined && cell.w !== null) {
          rowArr[c - minC] = cell.w;
        } else {
          rowArr[c - minC] = '';
        }
      }
      grid[r - minR] = rowArr;
      rawRowNums[r - minR] = r + 1;
    }

    // Xử lý ô gộp theo cột dọc (thường gặp khi gộp cột cấp HSK hoặc loại từ cho nhiều dòng)
    let mergedCellAppliedCount = 0;
    for (const merge of merges) {
      if (!merge || !merge.s || !merge.e) continue;
      if (merge.s.c === merge.e.c && merge.e.r > merge.s.r) {
        const localSr = merge.s.r - minR;
        const localSc = merge.s.c - minC;
        const localEr = Math.min(totalRows - 1, merge.e.r - minR);
        if (localSr >= 0 && localSr < totalRows && localSc >= 0 && localSc < totalCols) {
          const topVal = cleanCellText(grid[localSr][localSc]);
          if (topVal !== '') {
            for (let lr = localSr + 1; lr <= localEr; lr++) {
              if (cleanCellText(grid[lr][localSc]) === '') {
                grid[lr][localSc] = topVal;
                mergedCellAppliedCount++;
              }
            }
          }
        }
      }
    }

    const trimmed = trimMatrixEmptyEdges(grid, rawRowNums);
    return {
      matrix: trimmed.matrix,
      rowNumbers: trimmed.rowNumbers,
      colCount: trimmed.colCount,
      mergedCellAppliedCount
    };
  }

  function extractSheetRowsFromWorkbook(XLSX, workbook, requestedSheetName = null) {
    const sheetNames = workbook && Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
    const sheets = [];
    const extractedMap = new Map();

    for (const name of sheetNames) {
      const ws = workbook.Sheets[name];
      const extracted = extractMatrixFromWorksheet(XLSX, ws);
      extractedMap.set(name, extracted);
      sheets.push({
        name,
        dataRowCount: extracted.matrix.length,
        colCount: extracted.colCount,
        mergedCellAppliedCount: extracted.mergedCellAppliedCount
      });
    }

    let selectedSheet = null;
    if (requestedSheetName && extractedMap.has(requestedSheetName)) {
      selectedSheet = requestedSheetName;
    } else if (sheets.length > 0) {
      const ranked = [...sheets].sort((a, b) => {
        if (b.dataRowCount !== a.dataRowCount) return b.dataRowCount - a.dataRowCount;
        return b.colCount - a.colCount;
      });
      selectedSheet = ranked[0].name;
    }

    const chosen = selectedSheet ? extractedMap.get(selectedSheet) : { matrix: [], rowNumbers: [], colCount: 0, mergedCellAppliedCount: 0 };

    return {
      sheets,
      selectedSheet,
      matrix: chosen.matrix,
      rowNumbers: chosen.rowNumbers,
      colCount: chosen.colCount,
      mergedCellAppliedCount: chosen.mergedCellAppliedCount
    };
  }

  function detectAndSplitSingleColumnMatrix(matrix, rowNumbers) {
    if (!Array.isArray(matrix) || matrix.length === 0) {
      return {
        matrix: matrix || [],
        rowNumbers: rowNumbers || [],
        splitFromSingleColumn: false,
        detectedDelimiter: null,
        columnCount: 0
      };
    }

    const activeCols = new Set();
    for (const row of matrix) {
      for (let c = 0; c < row.length; c++) {
        if (cleanCellText(row[c]) !== '') {
          activeCols.add(c);
        }
      }
      if (activeCols.size > 1) break;
    }

    if (activeCols.size !== 1) {
      const maxCols = matrix.reduce((m, r) => Math.max(m, r.length), 0);
      return {
        matrix,
        rowNumbers: rowNumbers || matrix.map((_, i) => i + 1),
        splitFromSingleColumn: false,
        detectedDelimiter: null,
        columnCount: maxCols
      };
    }

    const onlyCol = Array.from(activeCols)[0];
    const records = [];
    for (let i = 0; i < matrix.length; i++) {
      const rawLine = cleanRawDelimLine(matrix[i][onlyCol]);
      if (rawLine === '') continue;
      const origRow = rowNumbers && rowNumbers[i] ? rowNumbers[i] : (i + 1);
      records.push({ text: rawLine, origRow });
    }

    if (records.length === 0) {
      return { matrix, rowNumbers, splitFromSingleColumn: false, detectedDelimiter: null, columnCount: 1 };
    }

    // Nối các dòng bị ngắt giữa chừng bên trong ngoặc kép chưa đóng
    const joinedRecords = [];
    let bufferText = '';
    let bufferOrigRow = null;
    for (const rec of records) {
      if (bufferText === '') {
        bufferText = rec.text;
        bufferOrigRow = rec.origRow;
      } else {
        bufferText += '\n' + rec.text;
      }
      if (countUnescapedQuotes(bufferText) % 2 === 0) {
        joinedRecords.push({ text: bufferText, origRow: bufferOrigRow });
        bufferText = '';
        bufferOrigRow = null;
      }
    }
    if (bufferText !== '') {
      joinedRecords.push({ text: bufferText, origRow: bufferOrigRow });
    }

    const rawLineStrings = unwrapOuterQuotedLinesIfNeeded(joinedRecords.map(r => r.text));
    const lineToOrigRow = [];
    rawLineStrings.forEach((recText, recIdx) => {
      const span = String(recText).split('\n').length;
      const oRow = joinedRecords[recIdx].origRow;
      for (let k = 0; k < span; k++) lineToOrigRow.push(oRow);
    });

    const joinedCsvText = rawLineStrings.join('\n');
    const delimRes = detectDelimiter(joinedCsvText);

    if (delimRes.delimiter && delimRes.columnCount >= 2 && delimRes.matrix.length > 0 && delimRes.consistencyRatio >= 0.5) {
      // Ánh xạ chính xác lại số dòng Excel gốc ngay cả khi một ô có xuống dòng bên trong
      const mappedRowNums = delimRes.matrix.map((_, idx) => {
        if (delimRes.rowNumbers && delimRes.rowNumbers[idx]) {
          const lineIdx = delimRes.rowNumbers[idx] - 1;
          if (lineToOrigRow[lineIdx] !== undefined) return lineToOrigRow[lineIdx];
        }
        return joinedRecords[idx] ? joinedRecords[idx].origRow : (idx + 1);
      });

      return {
        matrix: delimRes.matrix,
        rowNumbers: mappedRowNums,
        splitFromSingleColumn: true,
        detectedDelimiter: delimRes.delimiter,
        columnCount: delimRes.columnCount
      };
    }

    return {
      matrix,
      rowNumbers: rowNumbers || matrix.map((_, i) => i + 1),
      splitFromSingleColumn: false,
      detectedDelimiter: null,
      columnCount: 1
    };
  }

  function looksLikePinyinValue(val) {
    const clean = cleanCellText(val);
    if (!clean || clean.length > 60) return false;
    if (CJK_CHAR_REGEX.test(clean) || VIETNAMESE_EXCLUSIVE_REGEX.test(clean)) return false;

    const hasExclusiveTone = PINYIN_EXCLUSIVE_TONE_REGEX.test(clean);
    const hasAnyTone = PINYIN_ANY_TONE_REGEX.test(clean);
    if (hasExclusiveTone) return true;

    const plain = clean
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const tokens = plain.split(/[\s\-’'/,]+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 8) return false;

    const allValidSyllables = tokens.every(tok => PY_SYLLABLE_REGEX.test(tok));
    return allValidSyllables && (hasAnyTone || tokens.every(t => t.length <= 7));
  }

  function parseHskValue(rawVal) {
    const clean = cleanCellText(rawVal);
    if (!clean) return { empty: true, valid: true, value: null };
    const norm = stripVietnameseAccents(clean).toLowerCase();
    const m = norm.match(/^(?:(?:hsk|cap do|cap|level|bac|级别|等级)\s*[_:-]?\s*)?(-?\d+)(?:\.0+)?(?:\s*(?:级|ji))?$/i);
    if (!m) return { empty: false, valid: false, raw: clean };
    const lvl = parseInt(m[1], 10);
    if (!Number.isInteger(lvl) || lvl < 1 || lvl > 9) {
      return { empty: false, valid: false, raw: clean };
    }
    return { empty: false, valid: true, value: lvl };
  }

  function isPartOfSpeechValue(rawVal) {
    const clean = cleanCellText(rawVal);
    if (!clean || clean.length > 35) return false;
    const parts = clean.split(/[/,;、]+/).map(p => normalizeHeaderToken(p)).filter(Boolean);
    if (parts.length === 0) return false;
    return parts.every(p => POS_TOKENS.has(p));
  }

  function looksLikeDataRow(row) {
    if (!Array.isArray(row)) return false;
    let hasUnknownCjk = false;
    let hasPinyin = false;
    for (const cell of row) {
      const c = cleanCellText(cell);
      if (!c) continue;
      if (matchHeaderToField(c)) continue;
      if (CJK_CHAR_REGEX.test(c)) hasUnknownCjk = true;
      if (PINYIN_EXCLUSIVE_TONE_REGEX.test(c)) hasPinyin = true;
    }
    return hasUnknownCjk || hasPinyin;
  }

  function detectHeaderRow(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0) {
      return {
        hasHeader: false,
        isUnknownHeader: false,
        headerRowIndex: -1,
        dataStartIndex: 0,
        headerCells: [],
        headerMatches: {}
      };
    }

    const scanLimit = Math.min(5, matrix.length);
    let bestRowIdx = -1;
    let bestDistinct = 0;
    let bestMatches = {};

    for (let r = 0; r < scanLimit; r++) {
      const row = matrix[r];
      const matches = {};
      const seenFields = new Set();
      let duplicateHitCount = 0;
      let nonHeaderCjkOrPinyin = 0;

      for (let c = 0; c < row.length; c++) {
        const cell = cleanCellText(row[c]);
        if (!cell) continue;
        const field = matchHeaderToField(cell);
        if (field) {
          matches[c] = field;
          if (seenFields.has(field)) duplicateHitCount++;
          seenFields.add(field);
        } else if (CJK_CHAR_REGEX.test(cell) || PINYIN_EXCLUSIVE_TONE_REGEX.test(cell)) {
          nonHeaderCjkOrPinyin++;
        }
      }

      const distinctCount = seenFields.size;
      // Một dòng tiêu đề thật thường khớp >= 2 cột khác nhau và không xen lẫn ô từ vựng CJK/Pinyin
      if (distinctCount >= 2 && (nonHeaderCjkOrPinyin === 0 || distinctCount >= 3)) {
        if (distinctCount > bestDistinct) {
          bestDistinct = distinctCount;
          bestRowIdx = r;
          bestMatches = matches;
        }
      } else if (distinctCount === 1 && nonHeaderCjkOrPinyin === 0 && matrix.length > r + 1 && looksLikeDataRow(matrix[r + 1]) && bestRowIdx === -1) {
        // Trường hợp tiêu đề lạ nhưng khớp được 1 cột rõ ràng và dòng dưới là dữ liệu
        bestDistinct = 1;
        bestRowIdx = r;
        bestMatches = matches;
      }
    }

    if (bestRowIdx >= 0 && (bestDistinct >= 2 || (bestDistinct === 1 && !looksLikeDataRow(matrix[bestRowIdx])))) {
      return {
        hasHeader: true,
        isUnknownHeader: bestDistinct < 2,
        headerRowIndex: bestRowIdx,
        dataStartIndex: bestRowIdx + 1,
        headerCells: matrix[bestRowIdx].map(cleanCellText),
        headerMatches: bestMatches
      };
    }

    // Không khớp tiêu đề chuẩn: kiểm tra xem dòng đầu là dữ liệu luôn hay tiêu đề lạ
    const firstRowLooksData = looksLikeDataRow(matrix[0]);
    const secondRowLooksData = matrix.length > 1 && looksLikeDataRow(matrix[1]);

    if (firstRowLooksData) {
      return {
        hasHeader: false,
        isUnknownHeader: false,
        headerRowIndex: -1,
        dataStartIndex: 0,
        headerCells: [],
        headerMatches: {}
      };
    }

    if (!firstRowLooksData && secondRowLooksData) {
      return {
        hasHeader: true,
        isUnknownHeader: true,
        headerRowIndex: 0,
        dataStartIndex: 1,
        headerCells: matrix[0].map(cleanCellText),
        headerMatches: {}
      };
    }

    return {
      hasHeader: false,
      isUnknownHeader: false,
      headerRowIndex: -1,
      dataStartIndex: 0,
      headerCells: [],
      headerMatches: {}
    };
  }

  function scoreColumnsByContent(dataRows, colCount) {
    const sample = (dataRows || []).slice(0, 30);
    const colScores = [];
    const colStats = [];

    for (let c = 0; c < colCount; c++) {
      const vals = [];
      for (const row of sample) {
        const val = cleanCellText(row[c]);
        if (val !== '') vals.push(val);
      }

      const scores = {
        hanzi: 0,
        pinyin: 0,
        meaning_vi: 0,
        hsk_level: 0,
        part_of_speech: 0,
        example_hanzi: 0,
        example_pinyin: 0,
        example_vi: 0,
        sort_order: 0
      };

      const n = vals.length;
      if (n === 0) {
        colScores.push(scores);
        colStats.push({ n: 0, avgLen: 0, hasCjk: false, isPinyinLike: false, hasViExclusive: false });
        continue;
      }

      let cjkCount = 0;
      let cjkSentencePunctCount = 0;
      let pinyinExclusiveCount = 0;
      let pinyinLikeCount = 0;
      let viExclusiveCount = 0;
      let viCommonWordCount = 0;
      let hskValidCount = 0;
      let hskTaggedCount = 0;
      let posCount = 0;
      let intCount = 0;
      let latinSentencePunctCount = 0;
      let totalLen = 0;
      let maxLen = 0;
      const intNums = [];
      const hskValues = [];

      for (const v of vals) {
        totalLen += v.length;
        if (v.length > maxLen) maxLen = v.length;

        const hasCjk = CJK_CHAR_REGEX.test(v);
        const hasViExcl = VIETNAMESE_EXCLUSIVE_REGEX.test(v);

        if (hasCjk && !hasViExcl) {
          cjkCount++;
          if (CJK_SENTENCE_PUNCT_REGEX.test(v)) cjkSentencePunctCount++;
        }
        if (hasViExcl) viExclusiveCount++;
        if (VIETNAMESE_COMMON_WORDS_REGEX.test(v)) viCommonWordCount++;
        if (LATIN_SENTENCE_PUNCT_REGEX.test(v)) latinSentencePunctCount++;

        if (PINYIN_EXCLUSIVE_TONE_REGEX.test(v) && !hasCjk && !hasViExcl) {
          pinyinExclusiveCount++;
        }
        if (looksLikePinyinValue(v)) {
          pinyinLikeCount++;
        }

        const parsedHsk = parseHskValue(v);
        if (!parsedHsk.empty && parsedHsk.valid) {
          hskValidCount++;
          hskValues.push(parsedHsk.value);
          if (/hsk|cap|cấp|level|级/i.test(v)) hskTaggedCount++;
        }

        if (isPartOfSpeechValue(v)) posCount++;

        if (/^\d+$/.test(v)) {
          const num = parseInt(v, 10);
          if (num >= 1) {
            intCount++;
            intNums.push(num);
          }
        }
      }

      const avgLen = totalLen / n;
      const cjkRatio = cjkCount / n;
      const viExclRatio = viExclusiveCount / n;
      const pinyinLikeRatio = pinyinLikeCount / n;
      const pinyinExclRatio = pinyinExclusiveCount / n;
      const posRatio = posCount / n;
      const hskRatio = hskValidCount / n;
      const intRatio = intCount / n;

      // Kiểm tra dãy số thứ tự tăng dần vs cấp HSK lặp lại
      let strictlyIncreasingRatio = 0;
      if (intNums.length >= 2) {
        let incSteps = 0;
        for (let i = 1; i < intNums.length; i++) {
          if (intNums[i] > intNums[i - 1]) incSteps++;
        }
        strictlyIncreasingRatio = incSteps / (intNums.length - 1);
      }
      const uniqueHsk = new Set(hskValues).size;
      const maxInt = intNums.length > 0 ? Math.max(...intNums) : 0;

      // 1. Chữ Hán & Ví dụ Hán
      if (cjkRatio >= 0.6) {
        const shortScore = avgLen <= 5 ? 1.0 : avgLen <= 8 ? 0.75 : 0.35;
        const punctPenalty = cjkSentencePunctCount / n > 0.25 ? 0.55 : 0;
        scores.hanzi = Math.max(0.1, Math.min(0.99, cjkRatio * (0.55 + 0.45 * shortScore) - punctPenalty));

        const longScore = (avgLen >= 6 || cjkSentencePunctCount / n >= 0.2) ? 1.0 : avgLen >= 4 ? 0.55 : 0.2;
        scores.example_hanzi = Math.max(0.1, Math.min(0.98, cjkRatio * longScore));
      }

      // 2. Pinyin & Pinyin ví dụ
      if (pinyinLikeRatio >= 0.55 && viExclRatio < 0.1) {
        const toneBoost = pinyinExclRatio >= 0.2 ? 0.25 : 0.08;
        const shortPinyin = avgLen <= 28 ? 0.95 : 0.65;
        scores.pinyin = Math.min(0.99, pinyinLikeRatio * 0.72 * shortPinyin + toneBoost);

        if (avgLen >= 16 || latinSentencePunctCount / n >= 0.25) {
          scores.example_pinyin = Math.min(0.95, pinyinLikeRatio * 0.85 + toneBoost * 0.5);
        }
      } else if (pinyinExclRatio >= 0.4 && viExclRatio < 0.1 && cjkRatio < 0.1) {
        scores.example_pinyin = Math.min(0.94, 0.55 + pinyinExclRatio * 0.35);
        if (avgLen <= 30) scores.pinyin = Math.min(0.9, 0.5 + pinyinExclRatio * 0.35);
      }

      // 3. Loại từ (part_of_speech)
      if (posRatio >= 0.5) {
        scores.part_of_speech = Math.min(0.98, 0.45 + posRatio * 0.52);
      }

      // 4. Cấp HSK & Số thứ tự (STT)
      if (hskRatio >= 0.6) {
        const taggedBoost = hskTaggedCount > 0 ? 0.25 : 0;
        const looksLikeSeqNumbers = hskTaggedCount === 0 && intRatio >= 0.9 && intNums.length >= 4 && strictlyIncreasingRatio >= 0.85 && intNums[0] === 1 && uniqueHsk >= Math.min(4, intNums.length);
        const hskPenalty = looksLikeSeqNumbers ? 0.45 : 0;
        scores.hsk_level = Math.max(0, Math.min(0.98, hskRatio * 0.82 + taggedBoost - hskPenalty));
      }

      if (intRatio >= 0.75) {
        const looksSeq = maxInt > 9 || strictlyIncreasingRatio >= 0.75;
        if (looksSeq) {
          scores.sort_order = Math.min(0.98, intRatio * 0.65 + strictlyIncreasingRatio * 0.33);
        } else if (hskTaggedCount === 0) {
          scores.sort_order = Math.min(0.75, intRatio * 0.55);
        }
      }

      // 5. Nghĩa tiếng Việt & Nghĩa ví dụ
      const hasLatinText = /[a-zA-Z\u00C0-\u1EF9]/.test(vals.join(' '));
      if (cjkRatio < 0.2 && hskRatio < 0.5 && intRatio < 0.6 && hasLatinText) {
        let viBase = 0;
        if (viExclRatio >= 0.15 || viCommonWordCount > 0) {
          viBase = 0.65 + Math.min(0.3, viExclRatio * 0.35);
        } else if (pinyinExclRatio === 0 && pinyinLikeRatio < 0.4) {
          // Trường hợp chữ Latin ngắn không dấu hoặc tiếng Anh/Việt không dấu móc
          viBase = 0.48;
        }
        if (posRatio >= 0.6) {
          viBase *= 0.15; // Cột từ loại không được nhầm thành nghĩa tiếng Việt
        }
        if (pinyinExclRatio > 0.25 && viExclRatio < 0.05) {
          viBase *= 0.2; // Cột Pinyin thuần không được nhầm thành nghĩa tiếng Việt
        }

        if (viBase > 0.25) {
          const longSentenceBonus = (avgLen >= 22 || latinSentencePunctCount / n >= 0.25) ? 0.2 : 0;
          const shortPhraseBonus = (avgLen <= 35 && latinSentencePunctCount / n < 0.25) ? 0.12 : 0;
          scores.meaning_vi = Math.min(0.97, viBase + shortPhraseBonus);
          scores.example_vi = Math.min(0.95, (avgLen >= 18 || latinSentencePunctCount / n >= 0.2) ? viBase * 0.85 + longSentenceBonus : viBase * 0.35);
        }
      }

      colScores.push(scores);
      colStats.push({ n, avgLen, cjkRatio, viExclRatio, pinyinLikeRatio, posRatio, hskRatio });
    }

    return { colScores, colStats };
  }

  function resolveBestColumnMapping({ columnCount, headerMatches, colScores, colStats, hasHeader, isUnknownHeader }) {
    const columnMapping = {};
    const columnConfidences = {};
    FIELD_DEFS.forEach(f => {
      columnMapping[f.key] = null;
      columnConfidences[f.key] = 0;
    });

    const usedCols = new Set();
    const ambiguities = [];

    // Bước 1: Ghép các cột có tiêu đề chuẩn khớp 100%
    if (headerMatches) {
      for (let c = 0; c < columnCount; c++) {
        const matchedField = headerMatches[c];
        if (!matchedField) continue;
        if (columnMapping[matchedField] === null) {
          columnMapping[matchedField] = c;
          columnConfidences[matchedField] = 1.0;
          usedCols.add(c);
        } else {
          ambiguities.push(`Cột ${c + 1} trùng tên vai trò "${matchedField}" với cột ${columnMapping[matchedField] + 1}`);
        }
      }
    }

    // Bước 2: Ghép cột còn lại bằng phân tích nội dung — ưu tiên 3 cột bắt buộc trước
    const pickBestColumnForField = (fieldKey, minThreshold) => {
      if (columnMapping[fieldKey] !== null) return;
      let bestCol = -1;
      let bestScore = 0;
      let secondScore = 0;

      for (let c = 0; c < columnCount; c++) {
        if (usedCols.has(c)) continue;
        const score = (colScores[c] && colScores[c][fieldKey]) || 0;
        if (score > bestScore) {
          secondScore = bestScore;
          bestScore = score;
          bestCol = c;
        } else if (score > secondScore) {
          secondScore = score;
        }
      }

      if (bestCol >= 0 && bestScore >= minThreshold) {
        // Kiểm tra xem cột này có thể là cặp với cột ví dụ không (chọn cột ngắn hơn cho trường chính)
        if (fieldKey === 'meaning_vi' && secondScore >= minThreshold && bestScore - secondScore <= 0.12) {
          const candidates = [];
          for (let c = 0; c < columnCount; c++) {
            if (!usedCols.has(c) && ((colScores[c] && colScores[c][fieldKey]) || 0) >= minThreshold) {
              candidates.push({ c, score: colScores[c][fieldKey], avgLen: (colStats[c] && colStats[c].avgLen) || 999 });
            }
          }
          if (candidates.length >= 2) {
            candidates.sort((a, b) => a.avgLen - b.avgLen || a.c - b.c);
            bestCol = candidates[0].c;
            bestScore = candidates[0].score;
          }
        }

        if (fieldKey === 'hanzi' && secondScore >= minThreshold && bestScore - secondScore <= 0.12) {
          const candidates = [];
          for (let c = 0; c < columnCount; c++) {
            if (!usedCols.has(c) && ((colScores[c] && colScores[c].hanzi) || 0) >= minThreshold) {
              candidates.push({ c, score: colScores[c].hanzi, avgLen: (colStats[c] && colStats[c].avgLen) || 999 });
            }
          }
          if (candidates.length >= 2) {
            candidates.sort((a, b) => a.avgLen - b.avgLen || a.c - b.c);
            bestCol = candidates[0].c;
            bestScore = candidates[0].score;
          }
        }

        if (fieldKey === 'pinyin' && secondScore >= minThreshold && bestScore - secondScore <= 0.12) {
          const candidates = [];
          for (let c = 0; c < columnCount; c++) {
            if (!usedCols.has(c) && ((colScores[c] && colScores[c].pinyin) || 0) >= minThreshold) {
              candidates.push({ c, score: colScores[c].pinyin, avgLen: (colStats[c] && colStats[c].avgLen) || 999 });
            }
          }
          if (candidates.length >= 2) {
            candidates.sort((a, b) => a.avgLen - b.avgLen || a.c - b.c);
            bestCol = candidates[0].c;
            bestScore = candidates[0].score;
          }
        }

        columnMapping[fieldKey] = bestCol;
        columnConfidences[fieldKey] = Number(bestScore.toFixed(2));
        usedCols.add(bestCol);

        if (secondScore > 0 && bestScore - secondScore < 0.08 && bestScore < 0.9) {
          ambiguities.push(`Cột ${bestCol + 1} (${fieldKey}) có điểm gần giống cột khác`);
        }
      }
    };

    // Ưu tiên tuyệt đối cho 3 cột bắt buộc
    pickBestColumnForField('hanzi', 0.45);
    pickBestColumnForField('pinyin', 0.45);
    pickBestColumnForField('meaning_vi', 0.42);

    // Sau đó ghép các cột tùy chọn
    ['hsk_level', 'part_of_speech', 'sort_order', 'example_hanzi', 'example_pinyin', 'example_vi'].forEach(optField => {
      pickBestColumnForField(optField, 0.58);
    });

    const missingRequired = ['hanzi', 'pinyin', 'meaning_vi'].filter(k => columnMapping[k] === null);
    const reqScores = ['hanzi', 'pinyin', 'meaning_vi'].map(k => columnConfidences[k] || 0);
    const minReqScore = Math.min(...reqScores);
    const avgReqScore = reqScores.reduce((a, b) => a + b, 0) / 3;

    const needsConfirmation = (
      missingRequired.length > 0 ||
      !hasHeader ||
      Boolean(isUnknownHeader) ||
      minReqScore < 0.72 ||
      ambiguities.length > 0
    );

    return {
      columnMapping,
      columnConfidences,
      missingRequired,
      overallConfidence: Number(avgReqScore.toFixed(2)),
      needsConfirmation,
      ambiguities
    };
  }

  function detectHskFromFilename(fileName) {
    const clean = stripVietnameseAccents(String(fileName || '')).toLowerCase();
    if (!clean) return null;
    const m = clean.match(/(?:^|[^a-z0-9])hsk\s*[_:-]?\s*([1-9])(?:[^0-9]|$)/i);
    if (!m) return null;
    const lvl = parseInt(m[1], 10);
    return (lvl >= 1 && lvl <= 9) ? lvl : null;
  }

  function describeColumnRolesSummary(columnMapping, colCount) {
    const parts = [];
    for (let c = 0; c < colCount; c++) {
      const assigned = FIELD_DEFS.find(f => columnMapping[f.key] === c);
      if (assigned) {
        parts.push(`Cột ${c + 1} → ${assigned.shortLabel}`);
      }
    }
    return parts.join(', ');
  }

  function analyzeTabularSource({ matrix, rowNumbers, fileName = '', metadata = {} }) {
    const colCount = Array.isArray(matrix)
      ? matrix.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0)
      : 0;

    if (!matrix || matrix.length === 0 || colCount === 0) {
      return {
        isEmpty: true,
        colCount: 0,
        rowCount: 0,
        hasHeader: false,
        isUnknownHeader: false,
        headerRowIndex: -1,
        dataStartIndex: 0,
        headerCells: [],
        previewRows: [],
        columnMapping: {},
        columnConfidences: {},
        missingRequired: ['hanzi', 'pinyin', 'meaning_vi'],
        overallConfidence: 0,
        needsConfirmation: true,
        ambiguities: [],
        suggestedFileHskLevel: detectHskFromFilename(fileName) || 1,
        hskSuggestedFromFilename: detectHskFromFilename(fileName),
        summaryNotice: 'Không tìm thấy dòng dữ liệu nào trong file/trang tính này.',
        metadata
      };
    }

    const headerInfo = detectHeaderRow(matrix);
    const dataRows = matrix.slice(headerInfo.dataStartIndex);
    const { colScores, colStats } = scoreColumnsByContent(dataRows, colCount);
    const mappingRes = resolveBestColumnMapping({
      columnCount: colCount,
      headerMatches: headerInfo.headerMatches,
      colScores,
      colStats,
      hasHeader: headerInfo.hasHeader,
      isUnknownHeader: headerInfo.isUnknownHeader
    });

    const filenameHsk = detectHskFromFilename(fileName);
    const suggestedFileHskLevel = filenameHsk || 1;
    const previewRows = dataRows.slice(0, 5);
    const roleSummary = describeColumnRolesSummary(mappingRes.columnMapping, colCount);

    const summaryBadges = [];
    if (metadata.encoding && metadata.encoding !== 'utf-8') {
      summaryBadges.push(`Bảng mã ${metadata.encoding.toUpperCase()}`);
    }
    if (metadata.delimiter) {
      const dLabel = metadata.delimiter === '\t' ? 'TAB' : `"${metadata.delimiter}"`;
      summaryBadges.push(`Phân cách ${dLabel}`);
    }
    if (metadata.splitFromSingleColumn) {
      summaryBadges.push('Đã tự tách dữ liệu CSV bị dán gọn vào 1 cột');
    }
    if (metadata.mergedCellAppliedCount > 0) {
      summaryBadges.push(`Đã tách ${metadata.mergedCellAppliedCount} ô gộp dọc`);
    }
    if (!headerInfo.hasHeader) {
      summaryBadges.push('File không có dòng tiêu đề — đã tự đoán theo nội dung');
    } else if (headerInfo.isUnknownHeader) {
      summaryBadges.push('Tiêu đề lạ — đã tự đoán cột theo nội dung');
    }

    let summaryNotice = `Đã đọc ${matrix.length.toLocaleString('vi-VN')} dòng × ${colCount} cột.`;
    if (roleSummary) {
      summaryNotice += ` Nhận diện: ${roleSummary}.`;
    }

    return {
      isEmpty: false,
      colCount,
      rowCount: matrix.length,
      dataRowCount: dataRows.length,
      matrix,
      rowNumbers: rowNumbers || matrix.map((_, i) => i + 1),
      hasHeader: headerInfo.hasHeader,
      isUnknownHeader: headerInfo.isUnknownHeader,
      headerRowIndex: headerInfo.headerRowIndex,
      dataStartIndex: headerInfo.dataStartIndex,
      headerCells: headerInfo.headerCells,
      previewRows,
      columnMapping: mappingRes.columnMapping,
      columnConfidences: mappingRes.columnConfidences,
      missingRequired: mappingRes.missingRequired,
      overallConfidence: mappingRes.overallConfidence,
      needsConfirmation: mappingRes.needsConfirmation,
      ambiguities: mappingRes.ambiguities,
      suggestedFileHskLevel,
      hskSuggestedFromFilename: filenameHsk,
      summaryBadges,
      summaryNotice,
      metadata
    };
  }

  function extractWordsWithMapping({ matrix, rowNumbers, dataStartIndex = 0, columnMapping, defaultHskLevel = 1 }) {
    const validWords = [];
    const skippedRows = [];
    const seenKeys = new Set();

    const safeDefaultHsk = (Number.isInteger(defaultHskLevel) && defaultHskLevel >= 1 && defaultHskLevel <= 9)
      ? defaultHskLevel
      : 1;

    const mapCol = (field) => {
      const idx = columnMapping ? columnMapping[field] : null;
      return (typeof idx === 'number' && Number.isInteger(idx) && idx >= 0) ? idx : null;
    };

    const hanziIdx = mapCol('hanzi');
    const pinyinIdx = mapCol('pinyin');
    const meaningIdx = mapCol('meaning_vi');
    const hskIdx = mapCol('hsk_level');
    const posIdx = mapCol('part_of_speech');
    const exHanziIdx = mapCol('example_hanzi');
    const exPinyinIdx = mapCol('example_pinyin');
    const exViIdx = mapCol('example_vi');
    const sortIdx = mapCol('sort_order');

    const getCell = (row, colIdx) => {
      if (colIdx === null || !Array.isArray(row) || colIdx >= row.length) return '';
      return cleanCellText(row[colIdx]);
    };

    let validCounter = 0;

    for (let i = dataStartIndex; i < matrix.length; i++) {
      const row = matrix[i];
      if (!Array.isArray(row)) continue;

      const hasAnyValue = row.some(cell => cleanCellText(cell) !== '');
      if (!hasAnyValue) continue;

      const rowNum = (rowNumbers && rowNumbers[i]) ? rowNumbers[i] : (i + 1);
      const hanzi = getCell(row, hanziIdx);
      const pinyin = getCell(row, pinyinIdx);
      const meaningVi = getCell(row, meaningIdx);
      const hskRaw = getCell(row, hskIdx);
      const parsedHsk = hskIdx !== null
        ? (hskRaw === '' ? { empty: true, valid: true, value: safeDefaultHsk } : parseHskValue(hskRaw))
        : { empty: true, valid: true, value: safeDefaultHsk };

      const reasons = [];
      if (!hanzi) reasons.push('chữ Hán rỗng');
      if (!pinyin) reasons.push('pinyin rỗng');
      if (!meaningVi) reasons.push('nghĩa rỗng');
      if (!parsedHsk.valid) reasons.push(`cấp HSK "${parsedHsk.raw}" ngoài 1–9`);

      if (reasons.length > 0) {
        skippedRows.push({
          rowNum,
          hanzi,
          reason: reasons.join(', '),
          rawRow: row.map(cleanCellText).join(' | ')
        });
        continue;
      }

      const hskLevel = parsedHsk.value;
      const dupKey = `${hanzi}_${hskLevel}`;
      if (seenKeys.has(dupKey)) {
        skippedRows.push({
          rowNum,
          hanzi,
          reason: `trùng từ "${hanzi}" (HSK ${hskLevel}) trong file`,
          rawRow: row.map(cleanCellText).join(' | ')
        });
        continue;
      }
      seenKeys.add(dupKey);

      const partOfSpeech = getCell(row, posIdx);
      const exampleHanzi = getCell(row, exHanziIdx);
      const examplePinyin = getCell(row, exPinyinIdx);
      const exampleVi = getCell(row, exViIdx);
      const explicitOrderRaw = getCell(row, sortIdx);
      const explicitOrder = /^\d+$/.test(explicitOrderRaw) ? parseInt(explicitOrderRaw, 10) : NaN;

      validCounter++;
      const sortOrder = (!isNaN(explicitOrder) && explicitOrder > 0) ? explicitOrder : validCounter;

      validWords.push({
        hanzi,
        pinyin,
        meaning_vi: meaningVi,
        hsk_level: hskLevel,
        part_of_speech: partOfSpeech || null,
        example_hanzi: exampleHanzi || null,
        example_pinyin: examplePinyin || null,
        example_vi: exampleVi || null,
        sort_order: sortOrder
      });
    }

    return { validWords, skippedRows };
  }

  function escapeCsvCell(val) {
    const str = String(val ?? '');
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function buildSkippedRowsCsv(skippedRows) {
    const header = ['Dòng số', 'Chữ Hán', 'Lý do lỗi', 'Dữ liệu gốc'];
    const lines = [header.map(escapeCsvCell).join(',')];
    (skippedRows || []).forEach(s => {
      lines.push([
        s.rowNum ?? '',
        s.hanzi || '',
        s.reason || '',
        s.rawRow || ''
      ].map(escapeCsvCell).join(','));
    });
    return '\uFEFF' + lines.join('\r\n');
  }

  const VocabImportParser = {
    MAX_FILE_SIZE_BYTES,
    MAX_IMPORT_ROWS,
    FIELD_DEFS,
    HEADER_ALIASES,
    cleanCellText,
    stripVietnameseAccents,
    normalizeHeaderToken,
    matchHeaderToField,
    decodeTextBuffer,
    parseDelimitedText,
    detectDelimiter,
    extractMatrixFromWorksheet,
    extractSheetRowsFromWorkbook,
    detectAndSplitSingleColumnMatrix,
    looksLikePinyinValue,
    parseHskValue,
    isPartOfSpeechValue,
    detectHeaderRow,
    scoreColumnsByContent,
    resolveBestColumnMapping,
    detectHskFromFilename,
    analyzeTabularSource,
    extractWordsWithMapping,
    buildSkippedRowsCsv
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = VocabImportParser;
  }
  if (global) {
    global.VocabImportParser = VocabImportParser;
  }
})(typeof window !== 'undefined' ? window : globalThis);
