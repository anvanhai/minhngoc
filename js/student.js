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
   * Cập nhật đánh giá Flashcard SRS cho 1 từ vựng (+2 XP nếu lần đầu đạt thuộc/nhớ)
   */
  async function recordWordReview(vocabId, level, classId = null) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const payload = {
      p_vocab_id: vocabId,
      p_level: level
    };
    if (classId) {
      payload.p_class_id = classId;
    }

    let { data, error } = await db.rpc('record_word_review', payload);

    // Fallback nếu DB chưa chạy Migration 25 (chữ ký 2 tham số cũ)
    if (error && (error.code === 'PGRST202' || (error.message && error.message.includes('Could not find the function')))) {
      const retry = await db.rpc('record_word_review', {
        p_vocab_id: vocabId,
        p_level: level
      });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Lỗi ghi nhận đánh giá từ vựng SRS:', error);
      throw error;
    }

    return data || { success: true, xp_awarded: 0 };
  }

  /**
   * Cập nhật tiến độ học từ của bài học (+10 XP khi hoàn thành đủ từ mới của bài lần đầu)
   */
  async function recordLessonVocabProgress(classId, lessonId, learnedCount, totalWords) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db.rpc('record_lesson_vocab_progress', {
      p_class_id: classId || null,
      p_lesson_id: lessonId,
      p_learned_count: learnedCount,
      p_total_words: totalWords
    });

    if (error) {
      console.error('Lỗi ghi nhận tiến độ học bài:', error);
      throw error;
    }

    return data || { success: true, xp_awarded: 0 };
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
          id, student_id, status, completed_at, score, audio_url, teacher_comment, graded_at
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
   * Lấy danh sách bài tập gắn với một bài học (cả bài tập cấp giáo trình và bài tập lớp)
   */
  async function getLessonAssignments(lessonId, classId = null) {
    const db = getDb();
    if (!db || !lessonId) return [];

    const currentUser = await window.Auth.getCurrentUser();
    const studentId = currentUser ? currentUser.user.id : null;

    let query = db
      .from('assignments')
      .select(`
        *,
        lesson:lessons (
          id, order_index, title_zh, title_vi
        ),
        submissions:assignment_submissions (
          id, student_id, status, completed_at, score, audio_url, teacher_comment, graded_at
        )
      `)
      .eq('lesson_id', lessonId);

    if (classId) {
      query = query.or(`class_id.eq.${classId},class_id.is.null`);
    }

    const { data: assignments, error } = await query
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Lỗi tải bài tập bài học:', error);
      return [];
    }

    return (assignments || []).map(a => {
      const mySub = (a.submissions || []).find(s => s.student_id === studentId);
      const isPastDue = a.due_date ? (new Date() > new Date(a.due_date)) : false;

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
   * Hoàn thành bài tập từ vựng thường
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
   * Nộp bài tập Nghe hiểu (server-side chấm điểm trắc nghiệm)
   */
  async function submitListeningAssignment(assignmentId, answers) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const { data, error } = await db.rpc('submit_listening_assignment', {
      p_assignment_id: assignmentId,
      p_answers: answers
    });

    if (error) throw error;
    return data;
  }

  /**
   * Tải file ghi âm của học sinh lên Supabase Storage bucket 'recordings'
   * @param {Blob} audioBlob
   * @param {string} studentId
   * @param {string} [customSuffix] - Hậu tố định danh bản ghi (ví dụ: take_1, take_2)
   */
  async function uploadRecordingAudio(audioBlob, studentId, customSuffix = '') {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    const mime = audioBlob.type || 'audio/webm';
    let ext = 'webm';
    if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) ext = 'mp4';
    else if (mime.includes('wav')) ext = 'wav';
    else if (mime.includes('ogg')) ext = 'ogg';
    else if (mime.includes('mpeg') || mime.includes('mp3')) ext = 'mp3';

    const suffix = customSuffix ? `_${customSuffix}` : '_recording';
    const fileName = `${studentId}/${Date.now()}${suffix}.${ext}`;

    const { data, error } = await db.storage
      .from('recordings')
      .upload(fileName, audioBlob, {
        contentType: mime,
        upsert: true
      });

    if (error) throw error;
    const finalPath = (data && (data.path || data.Key || data.fullPath)) ? (data.path || data.Key || data.fullPath) : fileName;
    return {
      path: finalPath,
      mime_type: mime,
      extension: ext,
      toString() { return finalPath; }
    };
  }

  /**
   * Nộp bài tập Nói & Ghi âm (hỗ trợ nhiều bản ghi âm con - takes)
   * @param {string} assignmentId
   * @param {string} audioUrl - Đường dẫn bản ghi chính (hoặc bản ghi đầu tiên)
   * @param {Array<Object>} [recordings] - Danh sách các bản ghi [{position, storage_path, mime_type, duration_seconds}]
   */
  async function submitSpeakingAssignment(assignmentId, audioUrl, recordings = null) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');

    let normalizedRecordings = null;
    let mainAudioUrl = (typeof audioUrl === 'string') ? audioUrl.trim() : '';

    if (recordings && Array.isArray(recordings) && recordings.length > 0) {
      normalizedRecordings = recordings.map((rec, idx) => {
        const path = (rec.storage_path || rec.path || (typeof rec === 'string' ? rec : '') || '').toString().trim();
        return {
          position: typeof rec.position === 'number' ? rec.position : (idx + 1),
          storage_path: path,
          mime_type: rec.mime_type || rec.mimeType || 'audio/webm',
          duration_seconds: typeof rec.duration_seconds === 'number' ? rec.duration_seconds : (rec.durationSeconds || 0)
        };
      }).filter(r => !!r.storage_path);

      if (!mainAudioUrl && normalizedRecordings.length > 0) {
        mainAudioUrl = normalizedRecordings[0].storage_path;
      }
    }

    if (!mainAudioUrl && normalizedRecordings && normalizedRecordings.length > 0) {
      mainAudioUrl = normalizedRecordings[0].storage_path;
    }

    const payload = {
      p_assignment_id: assignmentId,
      p_audio_url: mainAudioUrl
    };
    if (normalizedRecordings && normalizedRecordings.length > 0) {
      payload.p_recordings = normalizedRecordings;
    }

    const { data, error } = await db.rpc('submit_speaking_assignment', payload);

    if (error) throw error;
    return data;
  }

  /**
   * Lấy danh sách các bản ghi âm con (takes) của một bài nộp
   * @param {string} submissionId - ID của bản ghi trong recording_submissions
   */
  async function getSubmissionRecordings(submissionId) {
    const db = getDb();
    if (!db || !submissionId) return [];

    try {
      const { data, error } = await db
        .from('submission_recordings')
        .select('*')
        .eq('submission_id', submissionId)
        .order('position', { ascending: true });

      if (error) {
        console.warn('Lỗi lấy danh sách bản ghi con:', error);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn('Lỗi getSubmissionRecordings:', e);
      return [];
    }
  }

  /**
   * Lấy signed URL nghe file ghi âm
   */
  async function getRecordingPlayUrl(audioPath) {
    const db = getDb();
    if (!db || !audioPath) return '';

    if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
      return audioPath;
    }

    const { data, error } = await db.storage
      .from('recordings')
      .createSignedUrl(audioPath, 3600);

    if (error || !data) {
      const { data: pubData } = db.storage.from('recordings').getPublicUrl(audioPath);
      return pubData ? pubData.publicUrl : audioPath;
    }
    return data.signedUrl;
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

  /**
   * Lấy danh sách slide bài giảng của một bài học
   */
  async function getLessonSlides(lessonId) {
    const db = getDb();
    if (!db) return [];
    const { data, error } = await db
      .from('lesson_slides')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('sort_order', { ascending: true });
    if (error) {
      console.error('Lỗi tải slide bài học:', error);
      return [];
    }
    return data || [];
  }

  /**
   * Lấy signed URL xem hoặc tải slide bài giảng
   */
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

  /**
   * Lấy tóm tắt từ cần ôn tập hôm nay (gộp từ bài học + thẻ Tự học, tính theo ngày VN)
   */
  async function getSrsDueSummary(classId = null) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('get_srs_due_summary', {
      p_class_id: classId || null
    });
    if (error) throw error;
    return data || { today_vn: null, session_limit: 50, total_due: 0, lesson_due_count: 0, self_study_due_count: 0, groups: [], upcoming: {} };
  }

  /**
   * Lấy danh sách tối đa 50 thẻ đến hạn ôn cho phiên học SRS
   */
  async function getSrsDueCards(limit = 50, classId = null) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('get_srs_due_cards', {
      p_limit: limit,
      p_class_id: classId || null
    });
    if (error) throw error;
    return data || { today_vn: null, session_limit: 50, total_due: 0, cards: [] };
  }

  /**
   * Gửi kết quả ôn tập 1 thẻ lên server (không cộng XP mới, trả về lịch hẹn tiếp theo)
   */
  async function submitSrsReview(itemType, itemId, rating, isSessionRetry = false) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('submit_srs_review', {
      p_item_type: itemType,
      p_item_id: itemId,
      p_rating: rating,
      p_is_session_retry: Boolean(isSessionRetry)
    });
    if (error) throw error;
    return data;
  }

  /**
   * Lấy lịch ôn sắp tới theo ngày giờ Việt Nam
   */
  async function getSrsUpcomingSummary() {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('get_srs_upcoming_summary');
    if (error) throw error;
    return data || { today_vn: null, tomorrow_count: 0, in_3_days_count: 0, total_upcoming: 0, buckets: [] };
  }

  /**
   * Lấy danh sách bộ thẻ Tự học đang bật của lớp học viên đang tham gia
   */
  async function getStudentSelfStudyDecks() {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('get_student_self_study_decks');
    if (error) throw error;
    return data || { today_vn: null, decks: [] };
  }

  /**
   * Lấy toàn bộ thẻ thuộc một bộ Tự học đang bật của lớp mình
   */
  async function getStudentSelfStudyDeckCards(deckId) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('get_student_self_study_deck_cards', {
      p_deck_id: deckId
    });
    if (error) throw error;
    return data;
  }

  /**
   * Ghi nhận học xong 1 thẻ Tự học và đưa vào lịch ôn SRS (bậc đầu 1 ngày)
   */
  async function submitSelfStudyCard(cardId, rating = 3) {
    const db = getDb();
    if (!db) throw new Error('Database chưa kết nối');
    const { data, error } = await db.rpc('submit_self_study_learning_card', {
      p_card_id: cardId,
      p_rating: rating
    });
    if (error) throw error;
    return data;
  }

  /**
   * Cập nhật huy hiệu số từ cần ôn trên tất cả thanh menu trang học viên
   */
  function updateNavbarDueBadge(count) {
    const safeCount = Math.max(0, parseInt(count, 10) || 0);
    const label = safeCount > 99 ? '99+' : String(safeCount);
    document.querySelectorAll('.nav-due-badge').forEach(badge => {
      if (safeCount > 0) {
        badge.textContent = label;
        badge.style.display = 'inline-flex';
        badge.setAttribute('aria-label', `${safeCount} từ cần ôn hôm nay`);
      } else {
        badge.textContent = '0';
        badge.style.display = 'none';
      }
    });

    const lessonPill = document.getElementById('lesson-due-pill');
    if (lessonPill) {
      if (safeCount > 0) {
        lessonPill.textContent = `🧠 Ôn (${label})`;
        lessonPill.style.display = 'inline-flex';
      } else {
        lessonPill.style.display = 'none';
      }
    }
  }

  /**
   * Hiển thị thông báo nhắc ôn nhẹ (không chặn thao tác) đúng 1 lần trong ngày (giờ VN từ server)
   */
  function maybeShowDailyReviewBanner(userId, todayVn, totalDue) {
    const due = Math.max(0, parseInt(totalDue, 10) || 0);
    if (!userId || !todayVn || due <= 0) return;

    // Không tự làm phiền khi học viên đang ở ngay trang ôn tập
    const pathLower = (window.location.pathname || '').toLowerCase();
    if (pathLower.endsWith('/review.html') || pathLower === 'review.html') return;

    const storageKey = `minhngoc_srs_daily_notice_${userId}_${todayVn}`;
    try {
      if (localStorage.getItem(storageKey) === '1') return;
      localStorage.setItem(storageKey, '1');
    } catch (e) {}

    if (document.getElementById('srs-daily-toast')) return;

    const toast = document.createElement('div');
    toast.id = 'srs-daily-toast';
    toast.className = 'srs-daily-toast';
    toast.setAttribute('role', 'status');

    const textWrap = document.createElement('div');
    textWrap.className = 'srs-daily-toast-text';

    const titleEl = document.createElement('div');
    titleEl.className = 'srs-daily-toast-title';
    titleEl.textContent = `🧠 Hôm nay bạn có ${due} từ cần ôn tập`;

    const subEl = document.createElement('div');
    subEl.className = 'srs-daily-toast-sub';
    subEl.textContent = 'Ôn nhanh vài phút để giữ trí nhớ lâu hơn.';

    textWrap.appendChild(titleEl);
    textWrap.appendChild(subEl);

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'srs-daily-toast-actions';

    const goBtn = document.createElement('a');
    goBtn.href = 'review.html';
    goBtn.className = 'btn btn-primary btn-sm';
    goBtn.style.cssText = 'height: 32px; padding: 0 12px; font-size: 12px; white-space: nowrap;';
    goBtn.textContent = 'Ôn ngay';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'srs-daily-toast-close';
    closeBtn.setAttribute('aria-label', 'Đóng thông báo');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    });

    actionsWrap.appendChild(goBtn);
    actionsWrap.appendChild(closeBtn);
    toast.appendChild(textWrap);
    toast.appendChild(actionsWrap);

    document.body.appendChild(toast);
  }

  /**
   * Nạp số từ cần ôn lên menu ở mọi trang học viên và hiện nhắc nhẹ lần đầu trong ngày
   */
  async function initReviewNavAndReminder({ dueSummary = null, showToast = true, classId = null } = {}) {
    try {
      const currentUser = await window.Auth.getCurrentUser();
      if (!currentUser || !currentUser.user) return null;

      const summary = dueSummary || await getSrsDueSummary(classId);
      const totalDue = Number(summary && summary.total_due ? summary.total_due : 0);
      updateNavbarDueBadge(totalDue);

      if (showToast && summary && summary.today_vn) {
        maybeShowDailyReviewBanner(currentUser.user.id, summary.today_vn, totalDue);
      }
      return summary;
    } catch (e) {
      console.warn('Chưa tải được thống kê ôn tập SRS trên menu:', e);
      return null;
    }
  }

  return {
    getActiveClass,
    getCurriculumRoadmap,
    getLessonWords,
    recordWordReview,
    recordLessonVocabProgress,
    submitQuizAttempt,
    getClassAssignments,
    getLessonAssignments,
    completeAssignment,
    submitListeningAssignment,
    uploadRecordingAudio,
    submitSpeakingAssignment,
    getSubmissionRecordings,
    getRecordingPlayUrl,
    getClassLeaderboard,
    updateDailyStreak,
    getEnrollmentHistory,
    getLessonSlides,
    getSlideViewUrl,
    // SRS & Tự học
    getSrsDueSummary,
    getSrsDueCards,
    submitSrsReview,
    getSrsUpcomingSummary,
    getStudentSelfStudyDecks,
    getStudentSelfStudyDeckCards,
    submitSelfStudyCard,
    updateNavbarDueBadge,
    initReviewNavAndReminder
  };
})();
