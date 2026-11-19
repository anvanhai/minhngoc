/**
 * MODULE HỌC VIÊN (Student Portal Logic)
 * Quản lý tải Lớp học của tôi, Lộ trình bài học, Học từ vựng, Flashcard SRS, Quiz & Bài tập
 */

window.Student = (function () {
  const getDb = () => window.getDb();

  /**
   * Lấy thông tin Lớp học đang theo học (Active Class) của học sinh hiện tại
   */
  async function getActiveClass() {
    const db = getDb();
    if (!db) return null;

    const currentUser = await window.Auth.getCurrentUser();
    if (!currentUser || !currentUser.user) return null;

    const { data, error } = await db
      .from('enrollments')
      .select(`
        id,
        status,
        joined_at,
        class:classes (
          id,
          name,
          level,
          status,
          unlock_mode,
          current_lesson_order,
          start_date,
          curriculum:curriculums (
            id, title, code, level, description, total_lessons
          )
        )
      `)
      .eq('student_id', currentUser.user.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Lỗi lấy lớp học của học sinh:', error);
      throw error;
    }

    if (!data || !data.class) return null;

    return {
      enrollmentId: data.id,
      joinedAt: data.joined_at,
      ...data.class
    };
  }

  /**
   * Lấy lộ trình bài học (Roadmap) của lớp và trạng thái mở khóa của từng bài
   */
  async function getCurriculumRoadmap(classId, curriculumId, unlockMode = 'sequential', classCurrentLessonOrder = 1) {
    const db = getDb();
    if (!db) return [];

    const currentUser = await window.Auth.getCurrentUser();
    const studentId = currentUser ? currentUser.user.id : null;

    // 1. Lấy danh sách tất cả bài học của giáo trình
    const { data: lessons, error: lessonError } = await db
      .from('lessons')
      .select('*')
      .eq('curriculum_id', curriculumId)
      .order('order_index', { ascending: true });

    if (lessonError) throw lessonError;

    // 2. Lấy tiến độ học bài của riêng học sinh này trong lớp
    let progressMap = {};
    if (studentId) {
      const { data: progressList } = await db
        .from('lesson_progress')
        .select('*')
        .eq('student_id', studentId)
        .eq('class_id', classId);

      (progressList || []).forEach(p => {
        progressMap[p.lesson_id] = p;
      });
    }

    // 3. Lấy danh sách bài được mở khóa thủ công bởi Admin (nếu có)
    let manualUnlockMap = {};
    const { data: manualUnlocks } = await db
      .from('class_lesson_unlocks')
      .select('lesson_id, is_unlocked')
      .eq('class_id', classId);

    (manualUnlocks || []).forEach(u => {
      manualUnlockMap[u.lesson_id] = u.is_unlocked;
    });

    // 4. Tính toán trạng thái mở khóa cho từng bài:
    // - Nếu manualUnlockMap[l.id] !== undefined: tôn trọng quyết định của Admin
    // - Nếu unlock_mode === 'all_open': Mở tất cả bài
    // - Nếu l.order_index <= classCurrentLessonOrder: Mở bài theo tiến độ chung của lớp
    // - Hoặc nếu bài trước đó đã hoàn thành (is_completed === true): Mở bài kế tiếp
    let previousCompleted = true; // Bài 1 mặc định luôn mở
    const roadmap = (lessons || []).map((l, index) => {
      const prog = progressMap[l.id] || null;
      const isCompleted = prog ? (prog.is_completed || false) : false;

      let isUnlocked = false;
      if (manualUnlockMap[l.id] !== undefined) {
        isUnlocked = manualUnlockMap[l.id];
      } else if (unlockMode === 'all_open') {
        isUnlocked = true;
      } else if (l.order_index <= classCurrentLessonOrder) {
        isUnlocked = true;
      } else if (previousCompleted) {
        isUnlocked = true;
      }

      previousCompleted = isCompleted;

      return {
        ...l,
        progress: prog,
        isCompleted,
        isUnlocked,
        isCurrent: l.order_index === classCurrentLessonOrder
      };
    });

    return roadmap;
  }

  /**
   * Lấy danh sách từ vựng thuộc về một bài học, kèm mức độ ghi nhớ của học sinh
   */
  async function getLessonWords(lessonId) {
    const db = getDb();
    if (!db) return [];

    const currentUser = await window.Auth.getCurrentUser();
    const studentId = currentUser ? currentUser.user.id : null;

    // 1. Lấy các từ vựng gắn với bài học
    const { data: links, error } = await db
      .from('lesson_vocabularies')
      .select(`
        id,
        sort_order,
        vocabulary:vocabularies (
          id, hanzi, pinyin, meaning_vi, hsk_level, part_of_speech,
          example_hanzi, example_pinyin, example_vi, audio_url
        )
      `)
      .eq('lesson_id', lessonId)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    if (!links || links.length === 0) return [];

    const vocabList = links.map(l => ({
      linkId: l.id,
      sortOrder: l.sort_order,
      ...l.vocabulary
    }));

    // 2. Lấy trạng thái SRS ghi nhớ của từng từ nếu đã học
    if (studentId) {
      const vocabIds = vocabList.map(v => v.id);
      const { data: wordProgs } = await db
        .from('word_progress')
        .select('*')
        .eq('student_id', studentId)
        .in('vocabulary_id', vocabIds);

      const wordProgMap = {};
      (wordProgs || []).forEach(wp => {
        wordProgMap[wp.vocabulary_id] = wp;
      });

      return vocabList.map(v => ({
        ...v,
        masteryLevel: wordProgMap[v.id] ? wordProgMap[v.id].mastery_level : 0,
        correctCount: wordProgMap[v.id] ? wordProgMap[v.id].correct_count : 0
      }));
    }

    return vocabList;
  }

  /**
   * Cập nhật đánh giá Flashcard SRS cho 1 từ vựng
   */
  async function recordWordReview(vocabId, level) {
    const db = getDb();
    if (!db) return;

    const { error } = await db.rpc('record_word_review', {
      p_vocab_id: vocabId,
      p_level: level
    });

    if (error) {
      console.error('Lỗi ghi nhận đánh giá từ vựng SRS:', error);
      throw error;
    }
  }

  /**
   * Cập nhật tiến độ học từ của bài học
   */
  async function recordLessonVocabProgress(classId, lessonId, learnedCount, totalWords) {
    const db = getDb();
    if (!db) return;

    const { error } = await db.rpc('record_lesson_vocab_progress', {
      p_class_id: classId,
      p_lesson_id: lessonId,
      p_learned_count: learnedCount,
      p_total_words: totalWords
    });

    if (error) {
      console.error('Lỗi ghi nhận tiến độ học bài:', error);
    }
  }

  /**
   * Nộp bài kiểm tra cuối bài và nhận XP thưởng qua hàm SQL RPC bảo mật
   */
  async function submitQuizAttempt(classId, lessonId, correctCount, totalQuestions) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db.rpc('submit_quiz_attempt', {
      p_class_id: classId,
      p_lesson_id: lessonId,
      p_correct_count: correctCount,
      p_total_questions: totalQuestions
    });

    if (error) {
      console.error('Lỗi nộp bài kiểm tra:', error);
      throw error;
    }

    return data;
  }

  /**
   * Lấy danh sách bài tập được giao cho lớp của học sinh kèm trạng thái nộp bài
   */
  async function getClassAssignments(classId) {
    const db = getDb();
    if (!db) return [];

    const currentUser = await window.Auth.getCurrentUser();
    const studentId = currentUser ? currentUser.user.id : null;

    const { data: assignments, error } = await db
      .from('assignments')
      .select(`
        *,
        lesson:lessons (
          id, order_index, title_zh, title_vi
        ),
        submissions:assignment_submissions (
          id, student_id, status, completed_at, score
        )
      `)
      .eq('class_id', classId)
      .order('due_date', { ascending: true });

    if (error) throw error;

    return (assignments || []).map(a => {
      const mySub = (a.submissions || []).find(s => s.student_id === studentId);
      const isPastDue = new Date() > new Date(a.due_date);

      let status = 'pending';
      if (mySub) {
        status = mySub.status;
      } else if (isPastDue) {
        status = 'overdue';
      }

      return {
        ...a,
        submission: mySub || null,
        userStatus: status,
        isPastDue
      };
    });
  }

  /**
   * Hoàn thành bài tập
   */
  async function completeAssignment(assignmentId) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db.rpc('complete_assignment', {
      p_assignment_id: assignmentId
    });

    if (error) throw error;
    return data;
  }

  /**
   * Lấy Bảng xếp hạng riêng của lớp theo chu kỳ (Hôm nay / Tuần này / Tháng này / Tổng kỳ)
   * @param {string} classId
   * @param {string} period - 'today' | 'week' | 'month' | 'all'
   */
  async function getClassLeaderboard(classId, period = 'week') {
    const db = getDb();
    if (!db) return [];

    const { data, error } = await db.rpc('get_class_leaderboard', {
      p_class_id: classId,
      p_period: period
    });

    if (error) {
      console.error('Lỗi lấy bảng xếp hạng:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Tự động tính toán và cập nhật Streak ngày học liên tục khi mở app
   */
  async function updateDailyStreak() {
    const db = getDb();
    if (!db) return null;

    try {
      const { data, error } = await db.rpc('update_student_streak');
      if (error) {
        console.warn('Lỗi cập nhật streak:', error);
        return null;
      }
      return data;
    } catch (e) {
      console.warn('Lỗi RPC streak:', e);
      return null;
    }
  }

  /**
   * Lấy lịch sử các lớp học mà học sinh từng tham gia (HSK1, HSK2...)
   */
  async function getEnrollmentHistory() {
    const db = getDb();
    if (!db) return [];

    const { data, error } = await db.rpc('get_student_enrollment_history');
    if (error) {
      console.error('Lỗi lấy lịch sử học tập:', error);
      return [];
    }
    return data || [];
  }

  return {
    getActiveClass,
    getCurriculumRoadmap,
    getLessonWords,
    recordWordReview,
    recordLessonVocabProgress,
    submitQuizAttempt,
    getClassAssignments,
    completeAssignment,
    getClassLeaderboard,
    updateDailyStreak,
    getEnrollmentHistory
  };
})();
