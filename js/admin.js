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

  async function createAssignment({ classId, lessonId, title, description, dueDate, rewardXp }) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db
      .from('assignments')
      .insert([{
        class_id: classId,
        lesson_id: lessonId || null,
        title: title.trim(),
        description: description ? description.trim() : null,
        due_date: dueDate,
        reward_xp: parseInt(rewardXp || 30, 10),
        allow_late: true
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
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

  return {
    // Giáo trình
    getCurriculums,
    getCurriculumById,
    createCurriculum,
    // Bài học
    getLessonsByCurriculum,
    createLesson,
    // Từ vựng
    getVocabularies,
    createVocabulary,
    getLessonVocabularies,
    addWordToLesson,
    removeWordFromLesson,
    batchImportVocabularies,
    // Lớp học
    getClasses,
    getClassById,
    createClass,
    updateClass,
    // Học sinh
    getClassStudents,
    getAvailableStudentsForClass,
    enrollStudentToClass,
    removeStudentFromClass,
    // Bài tập
    getClassAssignments,
    createAssignment,
    // Mở khóa thủ công
    getClassLessonUnlocks,
    setLessonUnlockForClass,
    // Chuyển lớp
    promoteOrTransferStudent
  };
})();
