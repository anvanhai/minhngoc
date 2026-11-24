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
    const { data, error } = await db
      .from('lessons')
      .select('*')
      .eq('curriculum_id', curriculumId)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return data || [];
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

  async function getVocabularies({ hskLevel = null, search = '', limit = 100, page = 1 } = {}) {
    const db = getDb();
    if (!db) return { data: [], total: 0 };

    let query = db.from('vocabularies').select('*', { count: 'exact' });

    if (hskLevel && hskLevel !== 'all') {
      query = query.eq('hsk_level', parseInt(hskLevel, 10));
    }

    if (search && search.trim()) {
      const q = search.trim();
      query = query.or(`hanzi.ilike.%${q}%,pinyin.ilike.%${q}%,meaning_vi.ilike.%${q}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order('hsk_level', { ascending: true })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return { data: data || [], total: count || 0 };
  }

  async function createVocabulary({ hanzi, pinyin, meaningVi, hskLevel, partOfSpeech, exampleHanzi, examplePinyin, exampleVi }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db
      .from('vocabularies')
      .insert([{
        hanzi: hanzi.trim(),
        pinyin: pinyin.trim(),
        meaning_vi: meaningVi.trim(),
        hsk_level: parseInt(hskLevel || 1, 10),
        part_of_speech: partOfSpeech ? partOfSpeech.trim() : null,
        example_hanzi: exampleHanzi ? exampleHanzi.trim() : null,
        example_pinyin: examplePinyin ? examplePinyin.trim() : null,
        example_vi: exampleVi ? exampleVi.trim() : null
      }])
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

  async function updateVocabulary(id, { hanzi, pinyin, meaningVi, hskLevel, partOfSpeech, exampleHanzi, examplePinyin, exampleVi }) {
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
   * @param {Array<Object>} wordsList - Danh sách các từ đã chuẩn hóa
   * @param {string|null} assignLessonId - ID bài học muốn gán ngay (nếu có)
   */
  async function batchImportVocabularies(wordsList, assignLessonId = null) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    if (!Array.isArray(wordsList) || wordsList.length === 0) {
      throw new Error('Danh sách từ vựng trống');
    }

    // 1. Thêm vào bảng vocabularies (insert hoặc cập nhật nếu trùng)
    const { data: insertedWords, error: insertError } = await db
      .from('vocabularies')
      .upsert(wordsList, { onConflict: 'hanzi,pinyin' })
      .select('id, hanzi, pinyin');

    if (insertError) {
      // Nếu upsert onConflict không dùng được do constraint, dùng insert thông thường
      const { data: fallbackWords, error: fallbackError } = await db
        .from('vocabularies')
        .insert(wordsList)
        .select('id, hanzi, pinyin');

      if (fallbackError) throw fallbackError;
    }

    // 2. Nếu có chọn gán vào bài học, liên kết vào lesson_vocabularies
    if (assignLessonId) {
      // Lấy danh sách ID từ vừa thêm hoặc vừa có
      const hanzis = wordsList.map(w => w.hanzi);
      const { data: existingVocabs } = await db
        .from('vocabularies')
        .select('id')
        .in('hanzi', hanzis);

      if (existingVocabs && existingVocabs.length > 0) {
        const lessonLinks = existingVocabs.map((v, idx) => ({
          lesson_id: assignLessonId,
          vocabulary_id: v.id,
          sort_order: idx + 1
        }));

        await db
          .from('lesson_vocabularies')
          .upsert(lessonLinks, { onConflict: 'lesson_id,vocabulary_id' });
      }
    }

    return { total: wordsList.length };
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
    speakingPrompt,
    speakingPinyin,
    speakingSampleAudioUrl,
    listeningAudioUrl,
    listeningQuestions
  }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const payload = {
      class_id: classId,
      lesson_id: lessonId || null,
      title: title.trim(),
      description: description ? description.trim() : null,
      due_date: dueDate,
      reward_xp: parseInt(rewardXp || 30, 10),
      allow_late: true,
      assignment_type: assignmentType || 'vocabulary'
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
    const { data: students, error: sErr } = await db
      .from('enrollments')
      .select('student:profiles(id, display_name, username)')
      .eq('class_id', classId)
      .eq('status', 'active');
    if (sErr) throw sErr;

    const { data: subs, error: subErr } = await db
      .from('assignment_submissions')
      .select('*')
      .eq('assignment_id', assignmentId);
    if (subErr) throw subErr;

    const subMap = {};
    (subs || []).forEach(s => { subMap[s.student_id] = s; });

    return (students || []).map(item => ({
      student: item.student,
      submission: subMap[item.student.id] || null
    }));
  }

  async function getRecordingsForGrading({ classId = 'all', status = 'all' } = {}) {
    const db = getDb();
    if (!db) return [];
    let query = db
      .from('recording_submissions')
      .select(`
        *,
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
    return data || [];
  }

  async function gradeRecording({ submissionId, recordingId, score, comment }) {
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
      p_comment: comment ? comment.trim() : ''
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

  async function deleteRecordingFile(recordingId, audioPath) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    if (audioPath) {
      let cleanPath = audioPath;
      if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
        const parts = cleanPath.split('/recordings/');
        if (parts.length > 1) {
          cleanPath = parts[1].split('?')[0];
        }
      }
      try {
        await db.storage.from('recordings').remove([cleanPath]);
      } catch (storageErr) {
        console.warn('Lỗi khi xóa file Storage:', storageErr);
      }
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
    createAssignment,
    deleteAssignment,
    getAssignmentSubmissions,
    getRecordingsForGrading,
    gradeRecording,
    getAudioPlayUrl,
    deleteRecordingFile,
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
