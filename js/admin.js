/**
 * MODULE QUẢN TRỊ ADMIN (Admin Portal Logic)
 * Quản lý Giáo trình, Bài học, Kho từ vựng, Nhập Excel/CSV, Lớp học và Học viên
 */

window.Admin = (function () {
  const getDb = () => window.getDb();

  // ===========================================================================
  // 1. QUẢN LÝ GIÁO TRÌNH (CURRICULUMS)
  // ===========================================================================

  async function getCurriculums() {
    const db = getDb();
    if (!db) return [];
    const { data, error } = await db
      .from('curriculums')
      .select('*')
      .order('level', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Lỗi tải danh sách giáo trình:', error);
      throw error;
    }
    return data || [];
  }

  async function createCurriculum({ title, code, level, description }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db
      .from('curriculums')
      .insert([{
        title: title.trim(),
        code: code.trim().toUpperCase(),
        level: level.trim(),
        description: description ? description.trim() : null
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function getCurriculumById(id) {
    const db = getDb();
    if (!db) return null;
    const { data, error } = await db
      .from('curriculums')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async function updateCurriculum(id, { title, code, level, description, isActive }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (code !== undefined) updateData.code = code.trim().toUpperCase();
    if (level !== undefined) updateData.level = level.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (isActive !== undefined) updateData.is_active = Boolean(isActive);

    const { data, error } = await db
      .from('curriculums')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function getCurriculumUsageStats(id) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    // 1. Thử gọi hàm RPC bảo mật
    const { data, error } = await db.rpc('get_curriculum_usage_stats', { p_curriculum_id: id });
    if (!error && data) {
      return data;
    }

    // 2. Fallback trực tiếp nếu chưa chạy migration SQL RPC
    console.warn('RPC get_curriculum_usage_stats chưa được nạp hoặc lỗi, fallback truy vấn an toàn:', error);
    const { data: classesData } = await db
      .from('classes')
      .select('name')
      .eq('curriculum_id', id);

    const classNames = (classesData || []).map(c => c.name);
    const classCount = classNames.length;

    const { count: lessonCount } = await db
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('curriculum_id', id);

    return {
      can_delete: classCount === 0,
      class_count: classCount,
      class_names: classNames,
      lesson_count: lessonCount || 0,
      vocab_link_count: 0,
      progress_count: 0,
      slide_count: 0,
      recording_count: 0
    };
  }

  async function deleteCurriculum(id) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    // 1. Lấy danh sách slide files thuộc giáo trình này trước khi xóa
    let slidePaths = [];
    try {
      const { data: slides } = await db
        .from('lesson_slides')
        .select('file_path, lesson:lessons!inner(curriculum_id)')
        .eq('lesson.curriculum_id', id);
      if (slides && slides.length > 0) {
        slidePaths = slides.map(s => s.file_path).filter(Boolean);
      }
    } catch (e) {}

    // 2. Gọi hàm RPC xóa an toàn trong database
    const { data, error } = await db.rpc('admin_delete_curriculum', { p_curriculum_id: id });
    if (error) throw error;

    // 3. Dọn sạch file slide qua Storage API (tránh lỗi cấm DELETE trực tiếp bảng storage.objects)
    if (slidePaths.length > 0) {
      try {
        await db.storage.from('lesson-slides').remove(slidePaths);
      } catch (err) {
        console.warn('Lỗi dọn file Storage slide:', err);
      }
    }

    return data;
  }

  // ===========================================================================
  // 2. QUẢN LÝ BÀI HỌC (LESSONS)
  // ===========================================================================

  async function getLessonsByCurriculum(curriculumId) {
    const db = getDb();
    if (!db) return [];

    try {
      const { data, error } = await db
        .from('lessons')
        .select(`
          *,
          lesson_vocabularies(count),
          lesson_slides(count),
          assignments(count)
        `)
        .eq('curriculum_id', curriculumId)
        .order('order_index', { ascending: true });

      if (!error && data) {
        return data.map(l => ({
          ...l,
          vocab_count: l.lesson_vocabularies && l.lesson_vocabularies[0] ? l.lesson_vocabularies[0].count : (l.total_vocabularies || 0),
          slide_count: l.lesson_slides && l.lesson_slides[0] ? l.lesson_slides[0].count : 0,
          assignment_count: l.assignments && l.assignments[0] ? l.assignments[0].count : 0
        }));
      }
    } catch (e) {
      console.warn('Query lessons with counts error, falling back:', e);
    }

    const { data: fallbackData, error: fallbackError } = await db
      .from('lessons')
      .select('*')
      .eq('curriculum_id', curriculumId)
      .order('order_index', { ascending: true });

    if (fallbackError) throw fallbackError;
    return (fallbackData || []).map(l => ({
      ...l,
      vocab_count: l.total_vocabularies || 0,
      slide_count: 0,
      assignment_count: 0
    }));
  }

  async function createLesson({ curriculumId, orderIndex, titleZh, titleVi, description, rewardXp, passScore }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db
      .from('lessons')
      .insert([{
        curriculum_id: curriculumId,
        order_index: parseInt(orderIndex, 10),
        title_zh: titleZh.trim(),
        title_vi: titleVi.trim(),
        description: description ? description.trim() : null,
        reward_xp: parseInt(rewardXp || 50, 10),
        pass_score_percent: parseInt(passScore || 80, 10)
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function getLessonById(id) {
    const db = getDb();
    if (!db) return null;
    const { data, error } = await db
      .from('lessons')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async function updateLesson(id, { titleZh, titleVi, description, rewardXp, passScore }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const updateData = {};
    if (titleZh !== undefined) updateData.title_zh = titleZh.trim();
    if (titleVi !== undefined) updateData.title_vi = titleVi.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (rewardXp !== undefined) updateData.reward_xp = parseInt(rewardXp, 10);
    if (passScore !== undefined) updateData.pass_score_percent = parseInt(passScore, 10);

    const { data, error } = await db
      .from('lessons')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function getLessonUsageStats(id) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('get_lesson_usage_stats', { p_lesson_id: id });
    if (error) throw error;
    return data;
  }

  async function deleteLesson(id) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    // 1. Lấy danh sách file slide của bài học trước khi xóa
    let slidePaths = [];
    try {
      const { data: slides } = await db
        .from('lesson_slides')
        .select('file_path')
        .eq('lesson_id', id);
      if (slides && slides.length > 0) {
        slidePaths = slides.map(s => s.file_path).filter(Boolean);
      }
    } catch (e) {}

    // 2. Gọi hàm RPC xóa an toàn trong database
    const { data, error } = await db.rpc('admin_delete_lesson', { p_lesson_id: id });
    if (error) throw error;

    // 3. Dọn sạch file slide qua Storage API
    if (slidePaths.length > 0) {
      try {
        await db.storage.from('lesson-slides').remove(slidePaths);
      } catch (err) {
        console.warn('Lỗi dọn file Storage slide:', err);
      }
    }

    return data;
  }

  async function reorderLessons(curriculumId, lessonIds) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('reorder_lessons', {
      p_curriculum_id: curriculumId,
      p_lesson_ids: lessonIds
    });
    if (error) throw error;
    return data;
  }

  // ===========================================================================
  // 3. QUẢN LÝ KHO TỪ VỰNG & LIÊN KẾT BÀI HỌC
  // ===========================================================================

  async function getVocabularies({ hskLevel = null, search = '', limit = 50, page = 1, partOfSpeech = null, sortBy = 'sort_order' } = {}) {
    const db = getDb();
    if (!db) return { data: [], total: 0, page: 1, limit: 50, totalPages: 0 };

    const parsedLimit = Math.max(1, parseInt(limit, 10) || 50);
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);

    let query = db.from('vocabularies').select('*', { count: 'exact' });

    if (hskLevel && hskLevel !== 'all') {
      query = query.eq('hsk_level', parseInt(hskLevel, 10));
    }

    if (partOfSpeech && partOfSpeech !== 'all') {
      query = query.eq('part_of_speech', partOfSpeech.trim());
    }

    if (search && search.trim()) {
      const q = search.trim();
      query = query.or(`hanzi.ilike.%${q}%,pinyin.ilike.%${q}%,meaning_vi.ilike.%${q}%`);
    }

    const from = (parsedPage - 1) * parsedLimit;
    const to = from + parsedLimit - 1;

    // Sắp xếp linh hoạt: mặc định theo thứ tự file Excel (sort_order), hoặc pinyin, hanzi, ngày tạo
    if (sortBy === 'pinyin') {
      query = query.order('hsk_level', { ascending: true }).order('pinyin', { ascending: true }).order('id', { ascending: true });
    } else if (sortBy === 'hanzi') {
      query = query.order('hsk_level', { ascending: true }).order('hanzi', { ascending: true }).order('id', { ascending: true });
    } else if (sortBy === 'created_at') {
      query = query.order('hsk_level', { ascending: true }).order('created_at', { ascending: false }).order('id', { ascending: true });
    } else {
      // Mặc định: theo cấp độ HSK -> số thứ tự sort_order tăng dần -> ID tăng dần
      query = query.order('hsk_level', { ascending: true }).order('sort_order', { ascending: true, nullsFirst: false }).order('id', { ascending: true });
    }

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;
    const total = count || 0;
    return {
      data: data || [],
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit) || 1
    };
  }

  /**
   * Lấy toàn bộ từ vựng theo điều kiện lọc, tự động phân lô (batch) qua .range()
   * để không bao giờ bị cắt ở giới hạn 150 hay 1000 dòng của Supabase
   */
  async function getAllVocabularies({ hskLevel = null, search = '', partOfSpeech = null, batchSize = 1000, sortBy = 'sort_order' } = {}) {
    const db = getDb();
    if (!db) return [];

    let allWords = [];
    let page = 1;
    let hasMore = true;
    const batch = Math.min(1000, Math.max(100, parseInt(batchSize, 10) || 1000));

    while (hasMore) {
      const from = (page - 1) * batch;
      const to = from + batch - 1;

      let query = db.from('vocabularies').select('*');

      if (hskLevel && hskLevel !== 'all') {
        query = query.eq('hsk_level', parseInt(hskLevel, 10));
      }

      if (partOfSpeech && partOfSpeech !== 'all') {
        query = query.eq('part_of_speech', partOfSpeech.trim());
      }

      if (search && search.trim()) {
        const q = search.trim();
        query = query.or(`hanzi.ilike.%${q}%,pinyin.ilike.%${q}%,meaning_vi.ilike.%${q}%`);
      }

      if (sortBy === 'pinyin') {
        query = query.order('hsk_level', { ascending: true }).order('pinyin', { ascending: true }).order('id', { ascending: true });
      } else if (sortBy === 'hanzi') {
        query = query.order('hsk_level', { ascending: true }).order('hanzi', { ascending: true }).order('id', { ascending: true });
      } else if (sortBy === 'created_at') {
        query = query.order('hsk_level', { ascending: true }).order('created_at', { ascending: false }).order('id', { ascending: true });
      } else {
        query = query.order('hsk_level', { ascending: true }).order('sort_order', { ascending: true, nullsFirst: false }).order('id', { ascending: true });
      }

      const { data, error } = await query.range(from, to);

      if (error) throw error;

      if (data && data.length > 0) {
        allWords = allWords.concat(data);
        if (data.length < batch) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    return allWords;
  }

  /**
   * Xuất toàn bộ kho từ vựng (hoặc theo bộ lọc hiện tại) ra file Excel .xlsx
   */
  async function exportVocabulariesToExcel({ hskLevel = null, search = '', partOfSpeech = null, sortBy = 'sort_order' } = {}) {
    if (!window.XLSX) {
      throw new Error('Thư viện SheetJS (XLSX) chưa được tải trên trang!');
    }

    const words = await getAllVocabularies({ hskLevel, search, partOfSpeech, sortBy });
    if (!words || words.length === 0) {
      throw new Error('Không có từ vựng nào để xuất file!');
    }

    const rows = words.map((w, idx) => ({
      'STT': w.sort_order !== null && w.sort_order !== undefined ? w.sort_order : (idx + 1),
      'Chữ Hán': w.hanzi || '',
      'Phiên âm': w.pinyin || '',
      'Nghĩa tiếng Việt': w.meaning_vi || '',
      'Cấp độ HSK': w.hsk_level || 1,
      'Từ loại': w.part_of_speech || '',
      'Ví dụ chữ Hán': w.example_hanzi || '',
      'Ví dụ Pinyin': w.example_pinyin || '',
      'Ví dụ tiếng Việt': w.example_vi || ''
    }));

    const worksheet = window.XLSX.utils.json_to_sheet(rows);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Kho_Tu_Vung');

    const suffix = hskLevel && hskLevel !== 'all' ? `_HSK${hskLevel}` : '';
    const fileName = `minhngoc_kho_tu_vung${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    window.XLSX.writeFile(workbook, fileName);
    return { count: words.length, fileName };
  }

  async function createVocabulary({ hanzi, pinyin, meaningVi, hskLevel, partOfSpeech, exampleHanzi, examplePinyin, exampleVi, sortOrder = null }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const payload = {
      hanzi: hanzi.trim(),
      pinyin: pinyin.trim(),
      meaning_vi: meaningVi.trim(),
      hsk_level: parseInt(hskLevel || 1, 10),
      part_of_speech: partOfSpeech ? partOfSpeech.trim() : null,
      example_hanzi: exampleHanzi ? exampleHanzi.trim() : null,
      example_pinyin: examplePinyin ? examplePinyin.trim() : null,
      example_vi: exampleVi ? exampleVi.trim() : null
    };

    if (sortOrder !== null && sortOrder !== undefined && !isNaN(parseInt(sortOrder, 10))) {
      payload.sort_order = parseInt(sortOrder, 10);
    }

    const { data, error } = await db
      .from('vocabularies')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function getLessonVocabularies(lessonId) {
    const db = getDb();
    if (!db) return [];

    const { data, error } = await db
      .from('lesson_vocabularies')
      .select(`
        id,
        sort_order,
        vocabulary:vocabularies (
          id, hanzi, pinyin, meaning_vi, hsk_level, part_of_speech, example_hanzi, example_pinyin, example_vi
        )
      `)
      .eq('lesson_id', lessonId)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return (data || []).map(item => ({
      linkId: item.id,
      sortOrder: item.sort_order,
      ...item.vocabulary
    }));
  }

  async function addWordToLesson(lessonId, vocabularyId, sortOrder = 1) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db
      .from('lesson_vocabularies')
      .insert([{
        lesson_id: lessonId,
        vocabulary_id: vocabularyId,
        sort_order: sortOrder
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function removeWordFromLesson(linkId) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { error } = await db
      .from('lesson_vocabularies')
      .delete()
      .eq('id', linkId);

    if (error) throw error;
    return true;
  }

  async function updateVocabulary(id, { hanzi, pinyin, meaningVi, hskLevel, partOfSpeech, exampleHanzi, examplePinyin, exampleVi, sortOrder = null }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const updateData = {};
    if (hanzi !== undefined) updateData.hanzi = hanzi.trim();
    if (pinyin !== undefined) updateData.pinyin = pinyin.trim();
    if (meaningVi !== undefined) updateData.meaning_vi = meaningVi.trim();
    if (hskLevel !== undefined) updateData.hsk_level = parseInt(hskLevel, 10) || 1;
    if (partOfSpeech !== undefined) updateData.part_of_speech = partOfSpeech ? partOfSpeech.trim() : null;
    if (exampleHanzi !== undefined) updateData.example_hanzi = exampleHanzi ? exampleHanzi.trim() : null;
    if (examplePinyin !== undefined) updateData.example_pinyin = examplePinyin ? examplePinyin.trim() : null;
    if (exampleVi !== undefined) updateData.example_vi = exampleVi ? exampleVi.trim() : null;
    if (sortOrder !== undefined && sortOrder !== null) {
      updateData.sort_order = parseInt(sortOrder, 10) || null;
    }

    const { data, error } = await db
      .from('vocabularies')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function deleteVocabulary(id) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('admin_delete_vocabulary', { p_vocab_id: id });
    if (error) throw error;
    return data;
  }

  async function getVocabularyUsageStats(vocabId) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('get_vocabulary_usage_stats', { p_vocab_id: vocabId });
    if (error) throw error;
    return data;
  }

  async function batchRemoveWordsFromLesson(lessonId, vocabIds) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('batch_remove_words_from_lesson', {
      p_lesson_id: lessonId,
      p_vocab_ids: vocabIds
    });
    if (error) throw error;
    return data;
  }

  async function batchAddWordsToLesson(lessonId, vocabIds) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('batch_add_words_to_lesson', {
      p_lesson_id: lessonId,
      p_vocab_ids: vocabIds
    });
    if (error) throw error;
    return data;
  }

  /**
   * Import mảng từ vựng từ file Excel/CSV vào database
   * Hỗ trợ cập nhật sort_order theo đúng thứ tự dòng trong file Excel gốc,
   * giữ nguyên ID và không làm mất liên kết với các bài học hay tiến độ học viên.
   * @param {Array<Object>} wordsList - Danh sách các từ đã chuẩn hóa
   * @param {string|null} assignLessonId - ID bài học muốn gán ngay (nếu có)
   */
  async function batchImportVocabularies(wordsList, assignLessonId = null) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    if (!Array.isArray(wordsList) || wordsList.length === 0) {
      throw new Error('Danh sách từ vựng trống');
    }

    // 1. Khử trùng lặp nội bộ trong file (giữ lại dòng đầu tiên xuất hiện để bảo toàn STT)
    const seenMap = new Set();
    const dedupedWords = [];
    for (const w of wordsList) {
      const key = `${w.hanzi}_${w.hsk_level}`;
      if (!seenMap.has(key)) {
        seenMap.add(key);
        dedupedWords.push(w);
      }
    }

    // 2. Thêm hoặc cập nhật vào bảng vocabularies theo lô (tránh payload quá lớn)
    const BATCH_SIZE = 150;
    let totalImported = 0;

    for (let i = 0; i < dedupedWords.length; i += BATCH_SIZE) {
      const batch = dedupedWords.slice(i, i + BATCH_SIZE);

      // Thử dùng RPC batch_upsert_vocabularies (Migration 23) để cập nhật thông minh theo (hanzi, hsk_level)
      let rpcSucceeded = false;
      try {
        const { error: rpcErr } = await db.rpc('batch_upsert_vocabularies', { p_words: batch });
        if (!rpcErr) {
          rpcSucceeded = true;
        }
      } catch (e) {
        rpcSucceeded = false;
      }

      if (!rpcSucceeded) {
        // Fallback: PostgREST upsert hoặc insert thông thường nếu RPC chưa được chạy
        const { error: insertError } = await db
          .from('vocabularies')
          .upsert(batch, { onConflict: 'hanzi,pinyin' });

        if (insertError) {
          const { error: fallbackError } = await db
            .from('vocabularies')
            .insert(batch);

          if (fallbackError) throw fallbackError;
        }
      }

      totalImported += batch.length;
    }

    // 3. Nếu có chọn gán vào bài học, bảo toàn đúng thứ tự các từ trong file
    if (assignLessonId) {
      const allHanzis = dedupedWords.map(w => w.hanzi);
      const vocabMap = new Map();

      for (let i = 0; i < allHanzis.length; i += BATCH_SIZE) {
        const batchHanzis = allHanzis.slice(i, i + BATCH_SIZE);
        const { data: foundVocabs } = await db
          .from('vocabularies')
          .select('id, hanzi, hsk_level')
          .in('hanzi', batchHanzis);

        if (foundVocabs) {
          foundVocabs.forEach(v => {
            vocabMap.set(`${v.hanzi}_${v.hsk_level}`, v.id);
            if (!vocabMap.has(v.hanzi)) vocabMap.set(v.hanzi, v.id);
          });
        }
      }

      // Giữ chính xác thứ tự ban đầu của mảng file
      const orderedVocabIds = [];
      for (const w of dedupedWords) {
        const id = vocabMap.get(`${w.hanzi}_${w.hsk_level}`) || vocabMap.get(w.hanzi);
        if (id && !orderedVocabIds.includes(id)) {
          orderedVocabIds.push(id);
        }
      }

      if (orderedVocabIds.length > 0) {
        await batchAddWordsToLesson(assignLessonId, orderedVocabIds);
      }
    }

    return { total: totalImported };
  }

  // ===========================================================================
  // 4. QUẢN LÝ LỚP HỌC (CLASSES)
  // ===========================================================================

  async function getClasses() {
    const db = getDb();
    if (!db) return [];

    const { data, error } = await db
      .from('classes')
      .select(`
        *,
        curriculum:curriculums (
          id, title, code, level, total_lessons
        ),
        enrollments (
          id, status
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Lỗi tải danh sách lớp:', error);
      throw error;
    }

    return (data || []).map(cls => ({
      ...cls,
      activeStudentCount: (cls.enrollments || []).filter(e => e.status === 'active').length
    }));
  }

  async function getClassById(classId) {
    const db = getDb();
    if (!db) return null;

    const { data, error } = await db
      .from('classes')
      .select(`
        *,
        curriculum:curriculums (
          id, title, code, level, total_lessons
        )
      `)
      .eq('id', classId)
      .single();

    if (error) throw error;
    return data;
  }

  async function createClass({ name, curriculumId, level, startDate, unlockMode }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const currentUser = await window.Auth.getCurrentUser();

    const { data, error } = await db
      .from('classes')
      .insert([{
        name: name.trim(),
        curriculum_id: curriculumId,
        level: level || 'HSK1',
        teacher_id: currentUser ? currentUser.user.id : null,
        start_date: startDate || new Date().toISOString().split('T')[0],
        status: 'ongoing',
        unlock_mode: unlockMode || 'sequential',
        current_lesson_order: 1
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function updateClass(classId, updateFields) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db
      .from('classes')
      .update(updateFields)
      .eq('id', classId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function getTeachers() {
    const db = getDb();
    if (!db) return [];
    const { data, error } = await db
      .from('profiles')
      .select('id, display_name, email, role')
      .in('role', ['teacher', 'admin'])
      .order('display_name', { ascending: true });
    if (error) {
      console.error('Lỗi tải danh sách giáo viên:', error);
      return [];
    }
    return data || [];
  }

  async function getClassUsageStats(classId) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    // 1. Thử gọi hàm RPC bảo mật
    const { data, error } = await db.rpc('get_class_usage_stats', { p_class_id: classId });
    if (!error && data) return data;

    // 2. Fallback trực tiếp nếu chưa nạp RPC
    console.warn('RPC get_class_usage_stats chưa nạp hoặc lỗi, fallback truy vấn:', error);
    const { data: cls } = await db.from('classes').select('name, status').eq('id', classId).single();
    const { count: studentCount } = await db.from('enrollments').select('*', { count: 'exact', head: true }).eq('class_id', classId);
    const { count: assignmentCount } = await db.from('assignments').select('*', { count: 'exact', head: true }).eq('class_id', classId);
    let recCount = 0;
    try {
      const { count } = await db.from('recording_submissions').select('*', { count: 'exact', head: true }).eq('class_id', classId);
      recCount = count || 0;
    } catch (e) {}

    return {
      class_name: cls ? cls.name : '',
      status: cls ? cls.status : 'ongoing',
      student_count: studentCount || 0,
      assignment_count: assignmentCount || 0,
      submission_count: 0,
      recording_count: recCount,
      progress_count: 0,
      xp_count: 0,
      has_data: (studentCount > 0 || assignmentCount > 0 || recCount > 0)
    };
  }

  async function deleteClass(classId) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    // 1. Lấy danh sách file ghi âm trước khi xóa để dọn dẹp Storage
    let recordingPaths = [];
    try {
      const { data: recs } = await db
        .from('recording_submissions')
        .select('audio_url')
        .eq('class_id', classId);
      if (recs && recs.length > 0) {
        recordingPaths = recs.map(r => r.audio_url).filter(Boolean);
      }
    } catch (e) {}

    // 2. Gọi hàm RPC xóa an toàn trong database
    const { data, error } = await db.rpc('admin_delete_class', { p_class_id: classId });
    if (error) throw error;

    // 3. Dọn sạch file âm thanh trong Storage qua Storage API
    if (data && data.deleted_recording_paths && Array.isArray(data.deleted_recording_paths)) {
      recordingPaths = recordingPaths.concat(data.deleted_recording_paths);
    }
    const uniquePaths = Array.from(new Set(recordingPaths));
    if (uniquePaths.length > 0) {
      try {
        await db.storage.from('recordings').remove(uniquePaths);
      } catch (storageErr) {
        console.warn('Lỗi dọn file Storage ghi âm:', storageErr);
      }
    }

    return data;
  }

  // ===========================================================================
  // 5. GHI DANH & QUẢN LÝ HỌC SINH TRONG LỚP (ENROLLMENTS)
  // ===========================================================================

  async function getClassStudents(classId) {
    const db = getDb();
    if (!db) return [];

    const { data, error } = await db
      .from('enrollments')
      .select(`
        id,
        status,
        joined_at,
        completed_at,
        note,
        student:profiles (
          id, username, display_name, phone, lifetime_xp, current_streak, avatar_url
        )
      `)
      .eq('class_id', classId)
      .order('joined_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(e => ({
      enrollmentId: e.id,
      status: e.status,
      joinedAt: e.joined_at,
      completedAt: e.completed_at,
      note: e.note,
      ...e.student
    }));
  }

  /**
   * Lấy danh sách các tài khoản học sinh chưa tham gia lớp này (để thêm vào lớp)
   */
  async function getAvailableStudentsForClass(classId) {
    const db = getDb();
    if (!db) return [];

    // 1. Lấy danh sách ID học sinh đã có trong lớp
    const { data: existing } = await db
      .from('enrollments')
      .select('student_id')
      .eq('class_id', classId);

    const existingIds = (existing || []).map(e => e.student_id);

    // 2. Lấy các profile có role = 'student' chưa thuộc lớp này
    let query = db
      .from('profiles')
      .select('id, username, display_name, phone, lifetime_xp, current_streak')
      .eq('role', 'student')
      .order('display_name', { ascending: true });

    if (existingIds.length > 0) {
      query = query.not('id', 'in', `(${existingIds.join(',')})`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function enrollStudentToClass(studentId, classId) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db
      .from('enrollments')
      .insert([{
        student_id: studentId,
        class_id: classId,
        status: 'active',
        joined_at: new Date().toISOString().split('T')[0]
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function removeStudentFromClass(enrollmentId) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { error } = await db
      .from('enrollments')
      .delete()
      .eq('id', enrollmentId);

    if (error) throw error;
    return true;
  }

  // ===========================================================================
  // 6. QUẢN LÝ BÀI TẬP VỀ NHÀ (ASSIGNMENTS)
  // ===========================================================================

  async function getClassAssignments(classId) {
    const db = getDb();
    if (!db) return [];

    const { data, error } = await db
      .from('assignments')
      .select(`
        *,
        lesson:lessons(id, order_index, title_zh, title_vi),
        submissions:assignment_submissions(id, status, score, student_id)
      `)
      .eq('class_id', classId)
      .order('due_date', { ascending: false });

    if (error) throw error;

    return (data || []).map(a => {
      const completedCount = (a.submissions || []).filter(s => s.status === 'completed' || s.status === 'late').length;
      return {
        ...a,
        completedCount,
        totalSubmissions: (a.submissions || []).length
      };
    });
  }

  async function createAssignment({
    classId,
    lessonId,
    title,
    description,
    dueDate,
    rewardXp,
    assignmentType,
    sortOrder,
    speakingPrompt,
    speakingPinyin,
    speakingSampleAudioUrl,
    listeningAudioUrl,
    listeningQuestions
  }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const payload = {
      class_id: classId || null,
      lesson_id: lessonId || null,
      title: title.trim(),
      description: description ? description.trim() : null,
      due_date: dueDate || null,
      reward_xp: parseInt(rewardXp || 30, 10),
      allow_late: true,
      assignment_type: assignmentType || 'vocabulary',
      sort_order: parseInt(sortOrder || 1, 10)
    };

    if (assignmentType === 'speaking') {
      payload.speaking_prompt = speakingPrompt ? speakingPrompt.trim() : null;
      payload.speaking_pinyin = speakingPinyin ? speakingPinyin.trim() : null;
      payload.speaking_sample_audio_url = speakingSampleAudioUrl ? speakingSampleAudioUrl.trim() : null;
    } else if (assignmentType === 'listening') {
      payload.listening_audio_url = listeningAudioUrl ? listeningAudioUrl.trim() : null;
      payload.listening_questions = listeningQuestions || null;
    }

    const { data, error } = await db
      .from('assignments')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function updateAssignment(assignmentId, {
    title,
    description,
    dueDate,
    rewardXp,
    assignmentType,
    sortOrder,
    speakingPrompt,
    speakingPinyin,
    speakingSampleAudioUrl,
    listeningAudioUrl,
    listeningQuestions
  }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const payload = {};
    if (title !== undefined) payload.title = title.trim();
    if (description !== undefined) payload.description = description ? description.trim() : null;
    if (dueDate !== undefined) payload.due_date = dueDate || null;
    if (rewardXp !== undefined) payload.reward_xp = parseInt(rewardXp || 30, 10);
    if (assignmentType !== undefined) payload.assignment_type = assignmentType;
    if (sortOrder !== undefined) payload.sort_order = parseInt(sortOrder, 10);

    if (assignmentType === 'speaking') {
      payload.speaking_prompt = speakingPrompt ? speakingPrompt.trim() : null;
      payload.speaking_pinyin = speakingPinyin ? speakingPinyin.trim() : null;
      payload.speaking_sample_audio_url = speakingSampleAudioUrl ? speakingSampleAudioUrl.trim() : null;
    } else if (assignmentType === 'listening') {
      payload.listening_audio_url = listeningAudioUrl ? listeningAudioUrl.trim() : null;
      payload.listening_questions = listeningQuestions || null;
    }

    const { data, error } = await db
      .from('assignments')
      .update(payload)
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function getLessonAssignments(lessonId) {
    const db = getDb();
    if (!db) return [];
    const { data, error } = await db
      .from('assignments')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function reorderLessonVocabularies(lessonId, vocabIds) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('reorder_lesson_vocabularies', {
      p_lesson_id: lessonId,
      p_vocab_ids: vocabIds
    });
    if (error) throw error;
    return data;
  }

  async function saveLessonVocabularies(lessonId, vocabIds) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('save_lesson_vocabularies', {
      p_lesson_id: lessonId,
      p_vocab_ids: vocabIds
    });
    if (error) throw error;
    return data;
  }

  async function reorderLessonSlides(lessonId, slideIds) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('reorder_lesson_slides', {
      p_lesson_id: lessonId,
      p_slide_ids: slideIds
    });
    if (error) throw error;
    return data;
  }

  async function reorderLessonAssignments(lessonId, assignmentIds) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('reorder_lesson_assignments', {
      p_lesson_id: lessonId,
      p_assignment_ids: assignmentIds
    });
    if (error) throw error;
    return data;
  }

  async function checkDuplicateVocabInCurriculum(curriculumId, lessonId, vocabIds) {
    const db = getDb();
    if (!db) return [];
    try {
      const { data, error } = await db.rpc('check_duplicate_vocab_in_curriculum', {
        p_curriculum_id: curriculumId,
        p_lesson_id: lessonId || null,
        p_vocab_ids: vocabIds
      });
      if (!error && data) return data;
    } catch (e) {
      console.warn('check_duplicate_vocab_in_curriculum error:', e);
    }
    return [];
  }

  async function getLessonFullComposition(lessonId) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    try {
      const { data, error } = await db.rpc('get_lesson_full_composition', {
        p_lesson_id: lessonId
      });
      if (!error && data) return data;
    } catch (e) {
      console.warn('get_lesson_full_composition RPC error, falling back:', e);
    }

    const [lesson, vocabularies, slides, assignments] = await Promise.all([
      getLessonById(lessonId),
      getLessonVocabularies(lessonId),
      getLessonSlides(lessonId),
      getLessonAssignments(lessonId)
    ]);

    return {
      lesson,
      vocabularies,
      slides,
      assignments
    };
  }

  async function deleteAssignment(assignmentId) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { error } = await db.from('assignments').delete().eq('id', assignmentId);
    if (error) throw error;
    return true;
  }

  async function getAssignmentSubmissions(assignmentId, classId) {
    const db = getDb();
    if (!db) return [];

    // Chạy song song:
    // 1. Danh sách học sinh trong lớp
    // 2. Bài nộp tổng hợp (assignment_submissions)
    // 3. Chi tiết bài nộp ghi âm kèm các bản ghi con takes (recording_submissions)
    const [studentsRes, subsRes, recsRes] = await Promise.all([
      db.from('enrollments')
        .select('student:profiles(id, display_name, username, avatar_url)')
        .eq('class_id', classId)
        .eq('status', 'active'),
      db.from('assignment_submissions')
        .select('*')
        .eq('assignment_id', assignmentId),
      db.from('recording_submissions')
        .select(`
          id, student_id, assignment_id, status, score, teacher_comment, teacher_audio_url, teacher_audio_mime, teacher_audio_duration, audio_url, created_at,
          recordings:submission_recordings(id, position, storage_path, mime_type, duration_seconds)
        `)
        .eq('assignment_id', assignmentId)
    ]);

    if (studentsRes.error) throw studentsRes.error;
    if (subsRes.error) throw subsRes.error;
    if (recsRes.error) console.warn('Lỗi tải recording_submissions:', recsRes.error);

    const subMap = {};
    (subsRes.data || []).forEach(s => { subMap[s.student_id] = s; });

    const recMap = {};
    (recsRes.data || []).forEach(r => { recMap[r.student_id] = r; });

    return (studentsRes.data || []).map(item => {
      const student = item.student || null;
      const stId = student ? student.id : null;
      const baseSub = stId ? subMap[stId] : null;
      const recSub = stId ? recMap[stId] : null;

      let finalSub = null;
      if (baseSub || recSub) {
        finalSub = { ...(baseSub || {}) };

        if (recSub) {
          finalSub.recording_id = recSub.id;
          finalSub.status = (recSub.status === 'graded') ? 'graded' : (finalSub.status || recSub.status || 'submitted');
          finalSub.score = (recSub.score !== null && recSub.score !== undefined) ? recSub.score : finalSub.score;
          finalSub.teacher_comment = recSub.teacher_comment || finalSub.teacher_comment || null;
          finalSub.teacher_audio_url = recSub.teacher_audio_url || finalSub.teacher_audio_url || null;
          finalSub.teacher_audio_mime = recSub.teacher_audio_mime || finalSub.teacher_audio_mime || 'audio/webm';
          finalSub.teacher_audio_duration = recSub.teacher_audio_duration || finalSub.teacher_audio_duration || 0;
          finalSub.completed_at = finalSub.completed_at || recSub.created_at;

          if (recSub.recordings && Array.isArray(recSub.recordings) && recSub.recordings.length > 0) {
            finalSub.recordings = [...recSub.recordings].sort((a, b) => (a.position || 1) - (b.position || 1));
          } else if (recSub.audio_url || finalSub.audio_url) {
            finalSub.recordings = [{
              id: 'legacy-take',
              position: 1,
              storage_path: recSub.audio_url || finalSub.audio_url,
              mime_type: 'audio/webm',
              duration_seconds: 0
            }];
          }
        } else if (finalSub.audio_url) {
          finalSub.recordings = [{
            id: 'legacy-take',
            position: 1,
            storage_path: finalSub.audio_url,
            mime_type: 'audio/webm',
            duration_seconds: 0
          }];
        }
      }

      return {
        student,
        submission: finalSub
      };
    });
  }

  async function getRecordingsForGrading({ classId = 'all', status = 'all' } = {}) {
    const db = getDb();
    if (!db) return [];
    let query = db
      .from('recording_submissions')
      .select(`
        *,
        recordings:submission_recordings(id, position, storage_path, mime_type, duration_seconds),
        student:profiles!recording_submissions_student_id_fkey(id, display_name, username, avatar_url),
        class:classes(id, name, level),
        lesson:lessons(id, order_index, title_zh, title_vi),
        assignment:assignments(id, title, reward_xp)
      `);
    if (classId && classId !== 'all') query = query.eq('class_id', classId);
    if (status && status !== 'all') query = query.eq('status', status);
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) throw error;

    const list = data || [];
    // Chuẩn hóa danh sách bản ghi con (takes)
    list.forEach(rec => {
      if (rec.recordings && Array.isArray(rec.recordings) && rec.recordings.length > 0) {
        rec.recordings.sort((a, b) => (a.position || 1) - (b.position || 1));
      } else if (rec.audio_url) {
        rec.recordings = [{
          id: `legacy-${rec.id}`,
          submission_id: rec.id,
          position: 1,
          storage_path: rec.audio_url,
          mime_type: 'audio/webm',
          duration_seconds: 0
        }];
      } else {
        rec.recordings = [];
      }
    });

    return list;
  }

  /**
   * Tải file nhận xét bằng giọng nói của giáo viên lên bucket 'recordings'
   * @param {Blob} audioBlob
   * @param {string} teacherId
   * @param {string} submissionId
   */
  async function uploadTeacherVoiceFeedback(audioBlob, teacherId, submissionId) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const mime = audioBlob.type || 'audio/webm';
    let ext = 'webm';
    if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) ext = 'mp4';
    else if (mime.includes('wav')) ext = 'wav';
    else if (mime.includes('ogg')) ext = 'ogg';

    const safeSubId = submissionId || 'feedback';
    const fileName = `teacher_feedback/${safeSubId}_${Date.now()}.${ext}`;

    const { data, error } = await db.storage
      .from('recordings')
      .upload(fileName, audioBlob, {
        contentType: mime,
        upsert: true
      });

    if (error) throw error;
    return {
      path: data.path,
      mime_type: mime,
      extension: ext
    };
  }

  async function gradeRecording({ submissionId, recordingId, score, comment, teacherAudioUrl, teacherAudioMime, teacherAudioDuration }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const recId = recordingId || submissionId;
    if (!recId) throw new Error('Thiếu mã bài nộp ghi âm (recordingId)');

    const parsedScore = parseInt(score, 10);
    if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      throw new Error('Điểm số phải là số từ 0 đến 100');
    }

    const { data, error } = await db.rpc('grade_recording_submission', {
      p_recording_id: recId,
      p_submission_id: recId,
      p_score: parsedScore,
      p_comment: comment ? comment.trim() : '',
      p_teacher_audio_url: teacherAudioUrl || null,
      p_teacher_audio_mime: teacherAudioMime || 'audio/webm',
      p_teacher_audio_duration: teacherAudioDuration || 0
    });
    if (error) throw error;
    return data;
  }

  async function getAudioPlayUrl(audioPath) {
    const db = getDb();
    if (!db || !audioPath) return '';
    if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) return audioPath;
    const { data, error } = await db.storage.from('recordings').createSignedUrl(audioPath, 3600);
    if (error || !data) {
      const { data: pubData } = db.storage.from('recordings').getPublicUrl(audioPath);
      return pubData ? pubData.publicUrl : audioPath;
    }
    return data.signedUrl;
  }

  /**
   * Xóa một bản ghi con (take) cụ thể bằng Storage API
   */
  async function deleteRecordingTake(takeId, storagePath) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    if (storagePath) {
      let cleanPath = storagePath;
      if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
        const parts = cleanPath.split('/recordings/');
        if (parts.length > 1) {
          cleanPath = parts[1].split('?')[0];
        }
      }
      try {
        await db.storage.from('recordings').remove([cleanPath]);
      } catch (storageErr) {
        console.warn('Lỗi khi xóa file Storage của take:', storageErr);
      }
    }

    if (takeId && !takeId.startsWith('legacy-')) {
      const { error } = await db.from('submission_recordings').delete().eq('id', takeId);
      if (error) throw error;
    }
    return true;
  }

  async function deleteRecordingFile(recordingId, audioPath) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    // 1. Tìm tất cả các file storage liên quan đến bài nộp (cả takes và voice feedback)
    const filesToDelete = [];
    if (audioPath) {
      let clean = audioPath;
      if (clean.includes('/recordings/')) clean = clean.split('/recordings/')[1].split('?')[0];
      filesToDelete.push(clean);
    }

    try {
      const { data: takes } = await db
        .from('submission_recordings')
        .select('storage_path')
        .eq('submission_id', recordingId);

      if (takes && takes.length > 0) {
        takes.forEach(t => {
          if (t.storage_path) {
            let p = t.storage_path;
            if (p.includes('/recordings/')) p = p.split('/recordings/')[1].split('?')[0];
            if (!filesToDelete.includes(p)) filesToDelete.push(p);
          }
        });
      }

      // Kiểm tra xem có file audio nhận xét của giáo viên không
      const { data: recRow } = await db
        .from('recording_submissions')
        .select('teacher_audio_url')
        .eq('id', recordingId)
        .maybeSingle();

      if (recRow && recRow.teacher_audio_url) {
        let tp = recRow.teacher_audio_url;
        if (tp.includes('/recordings/')) tp = tp.split('/recordings/')[1].split('?')[0];
        if (!filesToDelete.includes(tp)) filesToDelete.push(tp);
      }

      // Xóa tất cả các file trong Storage bằng Storage API
      if (filesToDelete.length > 0) {
        await db.storage.from('recordings').remove(filesToDelete);
      }
    } catch (storageErr) {
      console.warn('Lỗi khi dọn dẹp Storage:', storageErr);
    }

    const { error } = await db.from('recording_submissions').delete().eq('id', recordingId);
    if (error) throw error;
    return true;
  }

  // ===========================================================================
  // 7. MỞ KHÓA BÀI THỦ CÔNG THEO LỚP (MANUAL UNLOCKS)
  // ===========================================================================

  async function getClassLessonUnlocks(classId) {
    const db = getDb();
    if (!db) return {};

    const { data, error } = await db
      .from('class_lesson_unlocks')
      .select('lesson_id, is_unlocked')
      .eq('class_id', classId);

    if (error) throw error;

    const map = {};
    (data || []).forEach(u => {
      map[u.lesson_id] = u.is_unlocked;
    });
    return map;
  }

  async function setLessonUnlockForClass(classId, lessonId, isUnlocked) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db
      .from('class_lesson_unlocks')
      .upsert([{
        class_id: classId,
        lesson_id: lessonId,
        is_unlocked: isUnlocked,
        unlocked_at: new Date().toISOString()
      }], { onConflict: 'class_id,lesson_id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ===========================================================================
  // 8. CHUYỂN CẤP / CHUYỂN LỚP (PROMOTION FLOW: HSK1 -> HSK2)
  // ===========================================================================

  async function promoteOrTransferStudent(studentId, oldClassId, newClassId, note = 'Hoàn thành khóa học, lên cấp mới') {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db.rpc('promote_or_transfer_student', {
      p_student_id: studentId,
      p_old_class_id: oldClassId,
      p_new_class_id: newClassId,
      p_note: note
    });

    if (error) {
      console.error('Lỗi chuyển lớp học sinh:', error);
      throw error;
    }

    return data;
  }

  // ===========================================================================
  // 9. CẤU HÌNH THÔNG BÁO KẾT QUẢ / POPUP FEEDBACK (RESULT FEEDBACKS)
  // ===========================================================================

  async function getFeedbacks({ eventType = 'all' } = {}) {
    const db = getDb();
    if (!db) return [];

    let query = db.from('result_feedbacks').select('*');
    if (eventType && eventType !== 'all') {
      query = query.eq('event_type', eventType);
    }

    query = query
      .order('event_type', { ascending: true })
      .order('min_score', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true });

    const { data, error } = await query;
    if (error) {
      console.error('Lỗi tải danh sách feedback:', error);
      throw error;
    }
    return data || [];
  }

  async function createFeedback({ eventType, hasScore, minScore, maxScore, title, message, imageUrl, btnText, isActive, sortOrder }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db
      .from('result_feedbacks')
      .insert([{
        event_type: eventType,
        has_score: Boolean(hasScore),
        min_score: (hasScore && minScore !== '' && minScore !== null) ? parseInt(minScore, 10) : null,
        max_score: (hasScore && maxScore !== '' && maxScore !== null) ? parseInt(maxScore, 10) : null,
        title: title ? title.trim() : null,
        message: message.trim(),
        image_url: imageUrl.trim(),
        btn_text: btnText ? btnText.trim() : 'Tiếp tục',
        is_active: isActive !== undefined ? Boolean(isActive) : true,
        sort_order: parseInt(sortOrder || 1, 10)
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function updateFeedback(id, fields) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const updateData = {};
    if (fields.eventType !== undefined) updateData.event_type = fields.eventType;
    if (fields.hasScore !== undefined) updateData.has_score = Boolean(fields.hasScore);
    if (fields.minScore !== undefined) updateData.min_score = (fields.minScore !== '' && fields.minScore !== null) ? parseInt(fields.minScore, 10) : null;
    if (fields.maxScore !== undefined) updateData.max_score = (fields.maxScore !== '' && fields.maxScore !== null) ? parseInt(fields.maxScore, 10) : null;
    if (fields.title !== undefined) updateData.title = fields.title ? fields.title.trim() : null;
    if (fields.message !== undefined) updateData.message = fields.message.trim();
    if (fields.imageUrl !== undefined) updateData.image_url = fields.imageUrl.trim();
    if (fields.btnText !== undefined) updateData.btn_text = fields.btnText ? fields.btnText.trim() : 'Tiếp tục';
    if (fields.isActive !== undefined) updateData.is_active = Boolean(fields.isActive);
    if (fields.sortOrder !== undefined) updateData.sort_order = parseInt(fields.sortOrder, 10);
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('result_feedbacks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function deleteFeedback(id) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { error } = await db
      .from('result_feedbacks')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  async function uploadFeedbackImage(file) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    if (!file) throw new Error('Chưa chọn file ảnh');

    const ext = file.name ? file.name.split('.').pop().toLowerCase() : '';
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
      throw new Error('Định dạng ảnh không hợp lệ! Chỉ chấp nhận file ảnh JPG, PNG, WEBP hoặc GIF.');
    }

    const maxSize = 2 * 1024 * 1024; // 2 MB
    if (file.size > maxSize) {
      throw new Error(`Dung lượng ảnh vượt quá 2MB (kích thước hiện tại: ${(file.size / (1024 * 1024)).toFixed(1)}MB)! Vui lòng nén nhỏ lại.`);
    }

    const safeExt = allowedExts.includes(ext) ? ext : 'png';
    const filePath = `feedback_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${safeExt}`;

    const { error: uploadErr } = await db.storage
      .from('feedback-images')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadErr) {
      console.error('Lỗi tải ảnh lên Supabase Storage:', uploadErr);
      throw new Error('Không thể tải ảnh lên Supabase Storage: ' + (uploadErr.message || uploadErr));
    }

    const { data: pubData } = db.storage.from('feedback-images').getPublicUrl(filePath);
    return pubData ? pubData.publicUrl : '';
  }

  // ===========================================================================
  // 10. QUẢN LÝ SLIDE BÀI GIẢNG (LESSON SLIDES)
  // ===========================================================================

  async function getLessonSlides(lessonId) {
    const db = getDb();
    if (!db) return [];
    const { data, error } = await db
      .from('lesson_slides')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Lỗi tải slide bài học:', error);
      throw error;
    }
    return data || [];
  }

  async function uploadLessonSlide({ lessonId, title, file }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    if (!file) throw new Error('Chưa chọn file slide');

    const fileName = file.name || '';
    const ext = fileName.split('.').pop().toLowerCase();
    if (!['pdf', 'pptx', 'ppt'].includes(ext)) {
      throw new Error('Định dạng file không hợp lệ! Chỉ chấp nhận file PDF (.pdf) hoặc PowerPoint (.pptx, .ppt).');
    }

    const maxSize = 20 * 1024 * 1024; // 20 MB
    if (file.size > maxSize) {
      throw new Error(`Dung lượng file vượt quá 20MB (kích thước hiện tại: ${(file.size / (1024 * 1024)).toFixed(1)}MB)!`);
    }

    const filePath = `${lessonId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

    const { error: uploadErr } = await db.storage
      .from('lesson-slides')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadErr) {
      console.error('Lỗi tải slide lên Storage:', uploadErr);
      throw uploadErr;
    }

    const { count } = await db
      .from('lesson_slides')
      .select('*', { count: 'exact', head: true })
      .eq('lesson_id', lessonId);

    const { data, error } = await db
      .from('lesson_slides')
      .insert([{
        lesson_id: lessonId,
        title: title.trim(),
        file_path: filePath,
        file_type: ext,
        file_size: file.size,
        sort_order: (count || 0) + 1
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function deleteLessonSlide(slideId) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db.rpc('admin_delete_lesson_slide', { p_slide_id: slideId });
    if (error) throw error;

    if (data && data.file_path) {
      await db.storage.from('lesson-slides').remove([data.file_path]);
    }
    return true;
  }

  async function getLessonSlidesStorageStats() {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('get_lesson_slides_storage_stats');
    if (error) throw error;
    return data;
  }

  async function getSlideViewUrl(filePath) {
    const db = getDb();
    if (!db || !filePath) return '';
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;

    const { data, error } = await db.storage
      .from('lesson-slides')
      .createSignedUrl(filePath, 3600);

    if (error || !data) {
      const { data: pubData } = db.storage.from('lesson-slides').getPublicUrl(filePath);
      return pubData ? pubData.publicUrl : filePath;
    }
    return data.signedUrl;
  }

  // ===========================================================================
  // 14. ĐẶT LẠI MẬT KHẨU & QUẢN LÝ TÀI KHOẢN NGƯỜI DÙNG (PROFILES & AUTH)
  // ===========================================================================

  /**
   * Tạo chuỗi mật khẩu ngẫu nhiên an toàn (mặc định 8 ký tự)
   * Sử dụng ký tự rõ ràng, dễ phân biệt
   */
  function generateRandomPassword(length = 8) {
    const charset = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
    let result = '';
    const cryptoObj = window.crypto || window.msCrypto;
    if (cryptoObj && cryptoObj.getRandomValues) {
      const values = new Uint32Array(length);
      cryptoObj.getRandomValues(values);
      for (let i = 0; i < length; i++) {
        result += charset[values[i] % charset.length];
      }
    } else {
      for (let i = 0; i < length; i++) {
        result += charset.charAt(Math.floor(Math.random() * charset.length));
      }
    }
    return result;
  }

  /**
   * Gọi hàm RPC admin_reset_password để cập nhật mật khẩu cho user
   */
  async function resetUserPassword(targetUserId, newPassword) {
    if (typeof window.adminResetPasswordDb === 'function') {
      return await window.adminResetPasswordDb(targetUserId, newPassword);
    }
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('admin_reset_password', {
      target_user_id: targetUserId,
      new_password: newPassword
    });
    if (error) throw error;
    return data;
  }

  /**
   * Lấy danh sách toàn bộ hồ sơ người dùng trong hệ thống
   * @param {Object} options - { search, role }
   */
  async function getAllProfiles(options = {}) {
    const db = getDb();
    if (!db) return [];

    let query = db
      .from('profiles')
      .select('id, username, display_name, phone, role, lifetime_xp, current_streak, created_at, avatar_url')
      .order('created_at', { ascending: false });

    if (options.role && options.role !== 'all') {
      query = query.eq('role', options.role);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Lỗi tải danh sách profiles:', error);
      throw error;
    }

    let results = data || [];
    if (options.search && options.search.trim()) {
      const s = options.search.trim().toLowerCase();
      results = results.filter(p =>
        (p.username && p.username.toLowerCase().includes(s)) ||
        (p.display_name && p.display_name.toLowerCase().includes(s)) ||
        (p.phone && p.phone.toLowerCase().includes(s))
      );
    }

    return results;
  }

  /**
   * Khởi tạo bộ sự kiện cho modal đặt lại mật khẩu (#modal-reset-password)
   */
  let resetPasswordModalInitialized = false;
  function initResetPasswordModal(callbacks = {}) {
    if (resetPasswordModalInitialized) return;
    const modal = document.getElementById('modal-reset-password');
    if (!modal) return;

    resetPasswordModalInitialized = true;
    const form = document.getElementById('form-reset-password');
    const inputUserId = document.getElementById('reset-pwd-user-id');
    const inputNewPassword = document.getElementById('input-new-password');
    const btnGenerate = document.getElementById('btn-generate-password');
    const btnSubmit = document.getElementById('btn-submit-reset-password');
    const alertBox = document.getElementById('reset-pwd-alert');
    const successView = document.getElementById('reset-pwd-success-view');
    const resultBox = document.getElementById('reset-pwd-result-box');
    const btnCopy = document.getElementById('btn-copy-new-password');

    // Nút sinh mật khẩu ngẫu nhiên
    if (btnGenerate && inputNewPassword) {
      btnGenerate.addEventListener('click', function () {
        inputNewPassword.value = generateRandomPassword(8);
        inputNewPassword.focus();
        if (alertBox) {
          alertBox.className = 'alert';
          alertBox.textContent = '';
        }
      });
    }

    // Đóng modal
    document.querySelectorAll('[data-close="modal-reset-password"]').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.classList.remove('active');
        if (form) form.reset();
        if (successView) successView.style.display = 'none';
        if (form) form.style.display = 'block';
        if (alertBox) {
          alertBox.className = 'alert';
          alertBox.textContent = '';
        }
      });
    });

    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        modal.classList.remove('active');
        if (form) form.reset();
        if (successView) successView.style.display = 'none';
        if (form) form.style.display = 'block';
      }
    });

    // Nút copy mật khẩu
    if (btnCopy && resultBox) {
      btnCopy.addEventListener('click', async function () {
        const textToCopy = resultBox.textContent.trim();
        if (!textToCopy) return;

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textToCopy);
          } else {
            const tempInput = document.createElement('input');
            tempInput.value = textToCopy;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);
          }
          btnCopy.textContent = '✅ Đã sao chép vào bộ nhớ tạm!';
          setTimeout(() => {
            btnCopy.textContent = '📋 Sao chép mật khẩu';
          }, 3000);
        } catch (err) {
          console.warn('Không thể sao chép tự động:', err);
          alert('Mật khẩu: ' + textToCopy);
        }
      });
    }

    // Submit đổi mật khẩu
    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const userId = inputUserId ? inputUserId.value.trim() : '';
        const newPassword = inputNewPassword ? inputNewPassword.value.trim() : '';

        if (!userId) {
          if (alertBox) {
            alertBox.className = 'alert alert-danger show';
            alertBox.textContent = 'Lỗi: Không xác định được người dùng.';
          }
          return;
        }

        if (!newPassword || newPassword.length < 6) {
          if (alertBox) {
            alertBox.className = 'alert alert-danger show';
            alertBox.textContent = 'Mật khẩu mới phải có tối thiểu 6 ký tự.';
          }
          return;
        }

        try {
          if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.textContent = '⏳ Đang lưu mật khẩu...';
          }
          if (alertBox) {
            alertBox.className = 'alert';
            alertBox.textContent = '';
          }

          await resetUserPassword(userId, newPassword);

          // Chuyển sang màn hình hiển thị mật khẩu một lần
          if (form) form.style.display = 'none';
          if (successView) {
            successView.style.display = 'block';
            if (resultBox) resultBox.textContent = newPassword;
            const targetUsernameEl = document.getElementById('reset-pwd-target-username');
            const successUserEl = document.getElementById('reset-pwd-success-user');
            if (successUserEl && targetUsernameEl) {
              successUserEl.textContent = targetUsernameEl.textContent;
            }
          }

          if (typeof callbacks.onSuccess === 'function') {
            callbacks.onSuccess(userId, newPassword);
          }
        } catch (err) {
          if (alertBox) {
            alertBox.className = 'alert alert-danger show';
            alertBox.textContent = 'Lỗi: ' + (err.message || 'Không thể đặt lại mật khẩu.');
          }
        } finally {
          if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Lưu Mật Khẩu Mới';
          }
        }
      });
    }
  }

  /**
   * Mở modal đặt lại mật khẩu cho một user cụ thể
   * @param {Object} user - { id, username, displayName }
   */
  function openResetPasswordModal(user = {}) {
    initResetPasswordModal();
    const modal = document.getElementById('modal-reset-password');
    if (!modal) return;

    const form = document.getElementById('form-reset-password');
    const successView = document.getElementById('reset-pwd-success-view');
    const inputUserId = document.getElementById('reset-pwd-user-id');
    const targetName = document.getElementById('reset-pwd-target-name');
    const targetUsername = document.getElementById('reset-pwd-target-username');
    const inputNewPassword = document.getElementById('input-new-password');
    const alertBox = document.getElementById('reset-pwd-alert');
    const btnCopy = document.getElementById('btn-copy-new-password');

    if (inputUserId) inputUserId.value = user.id || '';
    if (targetName) targetName.textContent = user.displayName || user.username || 'Người dùng';
    if (targetUsername) targetUsername.textContent = user.username || '--';

    // Tạo sẵn mật khẩu ngẫu nhiên 8 ký tự cho tiện lợi
    const initialPass = generateRandomPassword(8);
    if (inputNewPassword) {
      inputNewPassword.value = initialPass;
    }

    if (alertBox) {
      alertBox.className = 'alert';
      alertBox.textContent = '';
    }
    if (btnCopy) {
      btnCopy.textContent = '📋 Sao chép mật khẩu';
    }

    if (form) form.style.display = 'block';
    if (successView) successView.style.display = 'none';

    modal.classList.add('active');
    if (inputNewPassword) {
      setTimeout(() => inputNewPassword.select(), 100);
    }
  }

  return {
    // Giáo trình
    getCurriculums,
    getCurriculumById,
    createCurriculum,
    updateCurriculum,
    getCurriculumUsageStats,
    deleteCurriculum,
    // Bài học
    getLessonsByCurriculum,
    getLessonById,
    createLesson,
    updateLesson,
    getLessonUsageStats,
    deleteLesson,
    reorderLessons,
    // Từ vựng
    getVocabularies,
    getAllVocabularies,
    exportVocabulariesToExcel,
    createVocabulary,
    updateVocabulary,
    deleteVocabulary,
    getVocabularyUsageStats,
    getLessonVocabularies,
    addWordToLesson,
    removeWordFromLesson,
    batchRemoveWordsFromLesson,
    batchAddWordsToLesson,
    batchImportVocabularies,
    // Lớp học
    getClasses,
    getClassById,
    createClass,
    updateClass,
    deleteClass,
    getClassUsageStats,
    getTeachers,
    // Học sinh
    getClassStudents,
    getAvailableStudentsForClass,
    enrollStudentToClass,
    removeStudentFromClass,
    // Bài tập
    getClassAssignments,
    getLessonAssignments,
    createAssignment,
    updateAssignment,
    deleteAssignment,
    reorderLessonAssignments,
    getAssignmentSubmissions,
    getRecordingsForGrading,
    gradeRecording,
    getAudioPlayUrl,
    deleteRecordingFile,
    deleteRecordingTake,
    uploadTeacherVoiceFeedback,
    // Cấu thành bài học nâng cao
    getLessonFullComposition,
    reorderLessonVocabularies,
    saveLessonVocabularies,
    checkDuplicateVocabInCurriculum,
    reorderLessonSlides,
    // Mở khóa thủ công
    getClassLessonUnlocks,
    setLessonUnlockForClass,
    // Chuyển lớp
    promoteOrTransferStudent,
    // Cấu hình Feedback thông báo kết quả
    getFeedbacks,
    createFeedback,
    updateFeedback,
    deleteFeedback,
    uploadFeedbackImage,
    // Slide bài giảng
    getLessonSlides,
    uploadLessonSlide,
    deleteLessonSlide,
    getLessonSlidesStorageStats,
    getSlideViewUrl,
    // Đặt lại mật khẩu & Quản lý Tài khoản
    resetUserPassword,
    getAllProfiles,
    generateRandomPassword,
    initResetPasswordModal,
    openResetPasswordModal
  };
})();
