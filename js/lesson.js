/**
 * LOGIC PHÒNG HỌC BÀI: HỌC TỪ MỚI, FLASHCARD SRS & QUIZ CUỐI BÀI (lesson.html)
 */

document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth();
  if (!authData) return;
  if (window.Student && typeof window.Student.initReviewNavAndReminder === 'function') {
    window.Student.initReviewNavAndReminder({ showToast: true });
  }

  const urlParams = new URLSearchParams(window.location.search);
  const lessonId = urlParams.get('id');
  const classId = urlParams.get('class_id');
  const initialMode = urlParams.get('mode') || 'vocab';

  if (!lessonId) {
    alert('Không tìm thấy bài học!');
    window.location.href = 'curriculum.html';
    return;
  }

  let words = [];
  let currentVocabIndex = 0;
  let currentFcIndex = 0;
  let hanziWriterInstance = null;
  let resolvedClassId = typeof classId !== 'undefined' ? classId : null;
  let currentLessonData = null;
  let sessionVocabXpEarned = 0;

  // Header Elements
  const lessonHeaderTitle = document.getElementById('lesson-header-title');
  const lessonWordCounter = document.getElementById('lesson-word-counter');
  const btnBackLink = document.getElementById('btn-back-link');
  const lessonAlert = document.getElementById('lesson-alert');

  function formatLessonDbError(err, fallback) {
    if (window.XP && typeof window.XP.formatDbError === 'function') {
      return window.XP.formatDbError(err, fallback);
    }
    return (err && err.message) ? err.message : fallback;
  }

  function showXpEarnedToast(xpAmount, label) {
    if (xpAmount > 0 && window.XP && typeof window.XP.showXpToast === 'function') {
      window.XP.showXpToast(xpAmount, label);
    }
  }

  function showLessonErrorWithRetry(message, retryFn) {
    if (!lessonAlert) return;
    lessonAlert.className = 'alert alert-danger show';
    lessonAlert.innerHTML = '';

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    lessonAlert.appendChild(msgSpan);

    if (typeof retryFn === 'function') {
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'btn btn-secondary';
      retryBtn.style.cssText = 'margin-left: 12px; padding: 4px 12px; font-size: 13px;';
      retryBtn.textContent = '🔄 Thử lại';
      retryBtn.addEventListener('click', async () => {
        lessonAlert.className = 'alert';
        lessonAlert.textContent = '';
        await retryFn();
      });
      lessonAlert.appendChild(retryBtn);
    }
    lessonAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function resolveStudentClassId() {
    if (resolvedClassId) return resolvedClassId;
    if (typeof classId !== 'undefined' && classId) {
      resolvedClassId = classId;
      return resolvedClassId;
    }
    if (window.Student && typeof window.Student.getActiveClass === 'function') {
      try {
        const activeCls = await window.Student.getActiveClass();
        if (activeCls && activeCls.id) {
          resolvedClassId = activeCls.id;
          return resolvedClassId;
        }
      } catch (e) {
        console.warn('Không xác định được lớp học đang theo học:', e);
      }
    }
    return null;
  }

  // Mode Tabs
  const tabBtnVocab = document.getElementById('tab-btn-vocab');
  const tabBtnFlashcard = document.getElementById('tab-btn-flashcard');
  const tabBtnQuiz = document.getElementById('tab-btn-quiz');
  const tabBtnSlides = document.getElementById('tab-btn-slides');
  const tabBtnAssignments = document.getElementById('tab-btn-assignments');
  const modeVocabContainer = document.getElementById('mode-vocab-container');
  const modeFlashcardContainer = document.getElementById('mode-flashcard-container');
  const modeQuizContainer = document.getElementById('mode-quiz-container');
  const modeSlidesContainer = document.getElementById('mode-slides-container');
  const modeAssignmentsContainer = document.getElementById('mode-assignments-container');
  const lessonAssignmentsList = document.getElementById('lesson-assignments-list');
  const lessonAssignCounter = document.getElementById('lesson-assign-counter');
  const studioContainer = document.querySelector('.lesson-studio-container');

  // Slide Elements
  const slidesLoading = document.getElementById('slides-loading');
  const slidesEmpty = document.getElementById('slides-empty');
  const slidesContent = document.getElementById('slides-content');
  const slidesPillsContainer = document.getElementById('slides-pills-container');
  const btnSlideDownload = document.getElementById('btn-slide-download');
  const btnSlideFullscreen = document.getElementById('btn-slide-fullscreen');
  const slideTypeBadge = document.getElementById('slide-type-badge');
  const slideTitleDisplay = document.getElementById('slide-title-display');
  const slideSizeDisplay = document.getElementById('slide-size-display');
  const slidePdfViewerWrap = document.getElementById('slide-pdf-viewer-wrap');
  const slidePdfIframe = document.getElementById('slide-pdf-iframe');
  const slidePptxViewerWrap = document.getElementById('slide-pptx-viewer-wrap');
  const pptxTitleDisplay = document.getElementById('pptx-title-display');
  const btnPptxDownload = document.getElementById('btn-pptx-download');
  const pptxSizeText = document.getElementById('pptx-size-text');

  let lessonSlides = [];
  let currentSlideIndex = 0;
  let slidesLoaded = false;

  // Vocab Elements
  const vocabHanzi = document.getElementById('vocab-hanzi');
  const vocabPinyin = document.getElementById('vocab-pinyin');
  const vocabMeaning = document.getElementById('vocab-meaning');
  const vocabPos = document.getElementById('vocab-pos');
  const btnSpeakVocab = document.getElementById('btn-speak-vocab');
  const btnToggleWriter = document.getElementById('btn-toggle-writer');
  const hanziWriterBox = document.getElementById('hanzi-writer-box');
  const hanziTarget = document.getElementById('hanzi-target');
  const vocabExampleContainer = document.getElementById('vocab-example-container');
  const vocabExHanzi = document.getElementById('vocab-ex-hanzi');
  const vocabExPinyin = document.getElementById('vocab-ex-pinyin');
  const vocabExVi = document.getElementById('vocab-ex-vi');
  const btnSpeakExample = document.getElementById('btn-speak-example');
  const btnPrevVocab = document.getElementById('btn-prev-vocab');
  const btnNextVocab = document.getElementById('btn-next-vocab');

  // Flashcard Elements
  const flashcardCard = document.getElementById('flashcard-card');
  const fcFrontHanzi = document.getElementById('fc-front-hanzi');
  const btnFcSpeak = document.getElementById('btn-fc-speak');
  const fcBackPinyin = document.getElementById('fc-back-pinyin');
  const fcBackMeaning = document.getElementById('fc-back-meaning');
  const fcBackExample = document.getElementById('fc-back-example');
  const fcFlipPrompt = document.getElementById('fc-flip-prompt');
  const btnFlipCard = document.getElementById('btn-flip-card');
  const fcSrsActions = document.getElementById('fc-srs-actions');

  // Quiz Elements
  const quizIntroCard = document.getElementById('quiz-intro-card');
  const btnStartQuiz = document.getElementById('btn-start-quiz');
  const quizPlayingCard = document.getElementById('quiz-playing-card');
  const quizQuestionCounter = document.getElementById('quiz-question-counter');
  const quizScoreLive = document.getElementById('quiz-score-live');
  const quizPromptType = document.getElementById('quiz-prompt-type');
  const quizQuestionHanzi = document.getElementById('quiz-question-hanzi');
  const btnQuizSpeak = document.getElementById('btn-quiz-speak');
  const quizOptionsContainer = document.getElementById('quiz-options-container');
  const quizResultCard = document.getElementById('quiz-result-card');
  const quizResultIcon = document.getElementById('quiz-result-icon');
  const quizResultTitle = document.getElementById('quiz-result-title');
  const quizResultScore = document.getElementById('quiz-result-score');
  const quizResultDesc = document.getElementById('quiz-result-desc');
  const btnRetryQuiz = document.getElementById('btn-retry-quiz');

  function showAlert(msg, type = 'danger') {
    lessonAlert.className = `alert alert-${type} show`;
    lessonAlert.textContent = msg;
  }

  function hideAlert() {
    lessonAlert.className = 'alert';
    lessonAlert.textContent = '';
  }

  // 1. Tải thông tin bài học và danh sách từ vựng
  try {
    await resolveStudentClassId();
    const db = window.getDb();
    const { data: lessonData } = await db
      .from('lessons')
      .select('*, curriculum:curriculums(title)')
      .eq('id', lessonId)
      .single();

    if (lessonData) {
      currentLessonData = lessonData;
      lessonHeaderTitle.textContent = `Bài ${lessonData.order_index}: ${lessonData.title_zh}`;
      document.title = `Bài ${lessonData.order_index}: ${lessonData.title_zh} — Minh Ngọc HSK`;

      const lessonRewardXp = typeof lessonData.reward_xp === 'number' ? lessonData.reward_xp : 50;
      const lessonHeaderXp = document.getElementById('lesson-header-xp');
      if (lessonHeaderXp) {
        lessonHeaderXp.textContent = `Hoàn thành bài để nhận +${lessonRewardXp} XP`;
        lessonHeaderXp.title = `Học xong từ vựng để nhận +10 XP và đạt Quiz ≥ 80% để hoàn thành bài nhận +${lessonRewardXp} XP`;
      }
    }

    words = await window.Student.getLessonWords(lessonId);

    if (!words || words.length === 0) {
      modeVocabContainer.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px; color: var(--text-muted);">
          <div style="font-size: 40px; margin-bottom: 12px;">📭</div>
          <h3 style="margin-bottom: 8px;">Bài học này chưa có từ vựng</h3>
          <p style="font-size: 14px;">Giáo viên đang cập nhật danh sách từ cho bài học này. Bạn có thể xem Slide bài giảng nếu có!</p>
        </div>
      `;
      lessonWordCounter.textContent = 'Từ 0 / 0';
    }

    if (classId) {
      btnBackLink.href = `curriculum.html`;
    }

    // Chọn chế độ ban đầu
    if (initialMode === 'flashcard') {
      switchMode('flashcard');
    } else if (initialMode === 'quiz') {
      switchMode('quiz');
    } else if (initialMode === 'slides') {
      switchMode('slides');
    } else if (initialMode === 'assignments') {
      switchMode('assignments');
    } else {
      switchMode('vocab');
    }

  } catch (err) {
    console.error('Lỗi tải bài học:', err);
    showAlert('Lỗi tải bài học: ' + (err.message || err));
  }

  // 2. Chuyển đổi giữa các chế độ học
  function switchMode(mode) {
    hideAlert();
    tabBtnVocab.classList.remove('active');
    tabBtnFlashcard.classList.remove('active');
    tabBtnQuiz.classList.remove('active');
    if (tabBtnSlides) tabBtnSlides.classList.remove('active');
    if (tabBtnAssignments) tabBtnAssignments.classList.remove('active');

    modeVocabContainer.style.display = 'none';
    modeFlashcardContainer.style.display = 'none';
    modeQuizContainer.style.display = 'none';
    if (modeSlidesContainer) modeSlidesContainer.style.display = 'none';
    if (modeAssignmentsContainer) modeAssignmentsContainer.style.display = 'none';

    if (studioContainer) {
      if (mode === 'slides' || mode === 'assignments') {
        studioContainer.classList.add('wide-mode');
      } else {
        studioContainer.classList.remove('wide-mode');
      }
    }

    if (mode === 'vocab') {
      tabBtnVocab.classList.add('active');
      modeVocabContainer.style.display = 'block';
      renderVocabWord();
    } else if (mode === 'flashcard') {
      tabBtnFlashcard.classList.add('active');
      modeFlashcardContainer.style.display = 'block';
      renderFlashcard();
    } else if (mode === 'quiz') {
      tabBtnQuiz.classList.add('active');
      modeQuizContainer.style.display = 'block';
      resetQuizToStart();
    } else if (mode === 'slides') {
      if (tabBtnSlides) tabBtnSlides.classList.add('active');
      if (modeSlidesContainer) modeSlidesContainer.style.display = 'block';
      loadAndRenderLessonSlides();
    } else if (mode === 'assignments') {
      if (tabBtnAssignments) tabBtnAssignments.classList.add('active');
      if (modeAssignmentsContainer) modeAssignmentsContainer.style.display = 'block';
      loadAndRenderLessonAssignments();
    }
  }

  tabBtnVocab.addEventListener('click', () => switchMode('vocab'));
  tabBtnFlashcard.addEventListener('click', () => switchMode('flashcard'));
  tabBtnQuiz.addEventListener('click', () => switchMode('quiz'));
  if (tabBtnSlides) {
    tabBtnSlides.addEventListener('click', () => switchMode('slides'));
  }
  if (tabBtnAssignments) {
    tabBtnAssignments.addEventListener('click', () => switchMode('assignments'));
  }

  // ===========================================================================
  // CHẾ ĐỘ 1: HỌC TỪ MỚI (VOCABULARY STUDIO)
  // ===========================================================================
  function renderVocabWord() {
    if (!words || words.length === 0) return;
    const w = words[currentVocabIndex];

    lessonWordCounter.textContent = `Từ ${currentVocabIndex + 1} / ${words.length}`;

    vocabHanzi.textContent = w.hanzi;
    vocabPinyin.textContent = w.pinyin;
    vocabMeaning.textContent = w.meaning_vi;

    if (w.part_of_speech) {
      vocabPos.style.display = 'inline-block';
      vocabPos.textContent = w.part_of_speech;
    } else {
      vocabPos.style.display = 'none';
    }

    if (w.example_hanzi) {
      vocabExampleContainer.style.display = 'block';
      vocabExHanzi.textContent = w.example_hanzi;
      vocabExPinyin.textContent = w.example_pinyin || '';
      vocabExVi.textContent = w.example_vi || '';
    } else {
      vocabExampleContainer.style.display = 'none';
    }

    hanziWriterBox.style.display = 'none';
    btnToggleWriter.textContent = '✍️ Xem nét viết';

    btnPrevVocab.disabled = currentVocabIndex === 0;
    if (currentVocabIndex === words.length - 1) {
      btnNextVocab.textContent = 'Hoàn thành từ mới 🎉';
    } else {
      btnNextVocab.textContent = 'Từ tiếp theo ➡️';
    }

    window.XP.speakChinese(w.hanzi);
  }

  btnSpeakVocab.addEventListener('click', () => {
    const w = words[currentVocabIndex];
    if (w) window.XP.speakChinese(w.hanzi);
  });

  btnSpeakExample.addEventListener('click', () => {
    const w = words[currentVocabIndex];
    if (w && w.example_hanzi) window.XP.speakChinese(w.example_hanzi, 0.85);
  });

  btnToggleWriter.addEventListener('click', () => {
    const w = words[currentVocabIndex];
    if (!w) return;

    if (hanziWriterBox.style.display === 'none') {
      hanziWriterBox.style.display = 'flex';
      btnToggleWriter.textContent = 'Đóng nét viết';

      hanziTarget.innerHTML = '';
      const charToAnimate = w.hanzi.charAt(0);

      if (window.HanziWriter) {
        try {
          hanziWriterInstance = window.HanziWriter.create('hanzi-target', charToAnimate, {
            width: 140,
            height: 140,
            padding: 5,
            showOutline: true,
            strokeAnimationSpeed: 1,
            delayBetweenStrokes: 150,
            strokeColor: '#c82929'
          });
          hanziWriterInstance.animateCharacter();
        } catch (e) {
          console.warn('Lỗi vẽ chữ Hán:', e);
          hanziTarget.innerHTML = `<span style="font-size: 50px; color: var(--primary);">${charToAnimate}</span>`;
        }
      }
    } else {
      hanziWriterBox.style.display = 'none';
      btnToggleWriter.textContent = '✍️ Xem nét viết';
    }
  });

  btnPrevVocab.addEventListener('click', () => {
    if (currentVocabIndex > 0) {
      currentVocabIndex--;
      renderVocabWord();
    }
  });

  async function saveAndCompleteVocabStep() {
    btnNextVocab.disabled = true;
    try {
      const targetClassId = await resolveStudentClassId();
      if (!targetClassId) {
        throw new Error('Không xác định được lớp học hiện tại để lưu tiến độ và cộng XP.');
      }

      const res = await window.Student.recordLessonVocabProgress(targetClassId, lessonId, words.length, words.length);
      if (window.Student && typeof window.Student.initReviewNavAndReminder === 'function') {
        window.Student.initReviewNavAndReminder({ showToast: false });
      }
      const lessonRewardXp = (currentLessonData && typeof currentLessonData.reward_xp === 'number') ? currentLessonData.reward_xp : 50;

      if (res && res.xp_awarded > 0) {
        showXpEarnedToast(res.xp_awarded, 'Hoàn thành từ vựng bài học');
        showAlert(`🎉 Đã ghi nhận hoàn thành từ vựng (+${res.xp_awarded} XP)! Tiếp tục ôn Flashcard hoặc làm Quiz đạt ≥ 80% để hoàn thành bài nhận +${lessonRewardXp} XP.`, 'success');
      } else {
        showAlert(`🎉 Bạn đã xem hết toàn bộ từ vựng của bài học! Hãy chuyển sang Flashcard hoặc làm Quiz đạt ≥ 80% để hoàn thành bài nhận +${lessonRewardXp} XP.`, 'success');
      }

      if (window.FeedbackPopup) {
        window.FeedbackPopup.show('vocabulary', {
          onContinue: () => switchMode('flashcard')
        });
      } else {
        setTimeout(() => switchMode('flashcard'), 1200);
      }
    } catch (err) {
      console.error('Lỗi lưu tiến độ từ vựng:', err);
      showLessonErrorWithRetry(
        formatLessonDbError(err, 'Không thể lưu tiến độ từ vựng lên máy chủ. Vui lòng thử lại.'),
        saveAndCompleteVocabStep
      );
    } finally {
      btnNextVocab.disabled = false;
    }
  }

  btnNextVocab.addEventListener('click', async () => {
    if (currentVocabIndex < words.length - 1) {
      currentVocabIndex++;
      renderVocabWord();
    } else {
      await saveAndCompleteVocabStep();
    }
  });

  // ===========================================================================
  // CHẾ ĐỘ 2: LUYỆN FLASHCARD (SPACED REPETITION - SRS)
  // ===========================================================================
  let isCardFlipped = false;

  function renderFlashcard() {
    if (!words || words.length === 0) return;
    const w = words[currentFcIndex];

    lessonWordCounter.textContent = `Thẻ ${currentFcIndex + 1} / ${words.length}`;

    isCardFlipped = false;
    flashcardCard.classList.remove('flipped');
    fcFlipPrompt.style.display = 'block';
    fcSrsActions.style.display = 'none';

    fcFrontHanzi.textContent = w.hanzi;
    fcBackPinyin.textContent = w.pinyin;
    fcBackMeaning.textContent = w.meaning_vi;

    if (w.example_hanzi) {
      fcBackExample.style.display = 'block';
      fcBackExample.innerHTML = `<strong>${w.example_hanzi}</strong><br><span style="color: var(--text-muted);">${w.example_vi || ''}</span>`;
    } else {
      fcBackExample.style.display = 'none';
    }

    window.XP.speakChinese(w.hanzi);
  }

  function flipFlashcard() {
    isCardFlipped = !isCardFlipped;
    if (isCardFlipped) {
      flashcardCard.classList.add('flipped');
      fcFlipPrompt.style.display = 'none';
      fcSrsActions.style.display = 'grid';
      const w = words[currentFcIndex];
      if (w) window.XP.speakChinese(w.hanzi);
    } else {
      flashcardCard.classList.remove('flipped');
      fcFlipPrompt.style.display = 'block';
      fcSrsActions.style.display = 'none';
    }
  }

  flashcardCard.addEventListener('click', flipFlashcard);
  btnFlipCard.addEventListener('click', flipFlashcard);

  btnFcSpeak.addEventListener('click', (e) => {
    e.stopPropagation();
    const w = words[currentFcIndex];
    if (w) window.XP.speakChinese(w.hanzi);
  });

  let isSavingFlashcard = false;

  async function handleFlashcardSrsAction(srsLevel) {
    if (isSavingFlashcard) return;
    isSavingFlashcard = true;

    const w = words[currentFcIndex];
    try {
      const targetClassId = await resolveStudentClassId();

      if (w) {
        const reviewRes = await window.Student.recordWordReview(w.id, srsLevel, targetClassId);
        if (reviewRes && reviewRes.xp_awarded > 0) {
          sessionVocabXpEarned += reviewRes.xp_awarded;
          showXpEarnedToast(reviewRes.xp_awarded, `Thuộc từ: ${w.hanzi || 'từ mới'}`);
        }
      }

      if (currentFcIndex < words.length - 1) {
        currentFcIndex++;
        renderFlashcard();
      } else {
        if (!targetClassId) {
          throw new Error('Không xác định được lớp học hiện tại để ghi nhận hoàn thành từ vựng.');
        }

        const vocabRes = await window.Student.recordLessonVocabProgress(targetClassId, lessonId, words.length, words.length);
        if (window.Student && typeof window.Student.initReviewNavAndReminder === 'function') {
          window.Student.initReviewNavAndReminder({ showToast: false });
        }
        if (vocabRes && vocabRes.xp_awarded > 0) {
          sessionVocabXpEarned += vocabRes.xp_awarded;
          showXpEarnedToast(vocabRes.xp_awarded, 'Hoàn thành từ vựng bài học');
        }

        const lessonRewardXp = (currentLessonData && typeof currentLessonData.reward_xp === 'number') ? currentLessonData.reward_xp : 50;
        const earnedSummaryHtml = sessionVocabXpEarned > 0
          ? `<br>Bạn đã nhận tổng cộng <strong style="color: #ca8a04;">+${sessionVocabXpEarned} XP</strong> từ phần từ vựng trong phiên học này!`
          : '';

        if (window.FeedbackPopup) {
          window.FeedbackPopup.show('practice', {
            score: 100,
            onContinue: () => switchMode('quiz'),
            onRetry: () => {
              currentFcIndex = 0;
              renderFlashcard();
            }
          });
        }

        modeFlashcardContainer.innerHTML = `
          <div class="card" style="text-align: center; padding: 40px;">
            <div style="font-size: 56px; margin-bottom: 12px;">🏆</div>
            <h2 style="font-size: 22px; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">
              Đã ôn tập xong vòng thẻ Flashcard!
            </h2>
            <p style="color: var(--text-muted); font-size: 15px; margin-bottom: 20px;">
              Bạn đã ôn luyện toàn bộ <strong>${words.length} từ vựng</strong>.${earnedSummaryHtml}
              <br>Hãy làm Quiz đạt ≥ 80% để hoàn thành bài và nhận thưởng <strong style="color: #ca8a04;">+${lessonRewardXp} XP</strong> nhé!
            </p>
            <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
              <button type="button" id="btn-goto-quiz" class="btn btn-primary">
                📝 Vào Làm Bài Kiểm Tra (Quiz)
              </button>
              <button type="button" id="btn-replay-flashcard" class="btn btn-secondary">
                🔄 Ôn tập lại vòng nữa
              </button>
            </div>
          </div>
        `;

        document.getElementById('btn-goto-quiz').addEventListener('click', () => switchMode('quiz'));
        document.getElementById('btn-replay-flashcard').addEventListener('click', () => {
          currentFcIndex = 0;
          location.reload();
        });
      }
    } catch (err) {
      console.error('Lỗi lưu SRS / tiến độ Flashcard:', err);
      showLessonErrorWithRetry(
        formatLessonDbError(err, 'Không thể lưu tiến độ ôn từ vựng lên máy chủ. Vui lòng thử lại.'),
        () => handleFlashcardSrsAction(srsLevel)
      );
    } finally {
      isSavingFlashcard = false;
    }
  }

  document.querySelectorAll('.btn-srs').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const srsLevel = parseInt(btn.getAttribute('data-srs'), 10);
      await handleFlashcardSrsAction(srsLevel);
    });
  });

  // ===========================================================================
  // CHẾ ĐỘ 3: BÀI KIỂM TRA CUỐI BÀI (END-OF-LESSON QUIZ)
  // ===========================================================================
  let quizQuestions = [];
  let currentQuestionIndex = 0;
  let quizCorrectCount = 0;
  let isAnswerSubmitted = false;

  function resetQuizToStart() {
    quizIntroCard.style.display = 'block';
    quizPlayingCard.style.display = 'none';
    quizResultCard.style.display = 'none';
    lessonWordCounter.textContent = 'Bài kiểm tra';
  }

  btnStartQuiz.addEventListener('click', () => {
    generateQuizQuestions();
    if (quizQuestions.length === 0) {
      alert('Không đủ từ vựng để tạo bài kiểm tra!');
      return;
    }
    quizIntroCard.style.display = 'none';
    quizResultCard.style.display = 'none';
    quizPlayingCard.style.display = 'block';

    currentQuestionIndex = 0;
    quizCorrectCount = 0;
    renderQuizQuestion();
  });

  /**
   * Sinh câu hỏi trắc nghiệm thông minh từ kho từ vựng của bài
   */
  function generateQuizQuestions() {
    quizQuestions = [];
    if (!words || words.length === 0) return;

    // Trộn ngẫu nhiên danh sách từ để làm câu hỏi
    const shuffledWords = [...words].sort(() => 0.5 - Math.random());
    const targetCount = Math.min(10, words.length);

    for (let i = 0; i < targetCount; i++) {
      const correctWord = shuffledWords[i];

      // Chọn dạng câu hỏi:
      // 0: Cho chữ Hán -> Chọn nghĩa tiếng Việt
      // 1: Cho chữ Hán -> Chọn Pinyin
      // 2: Cho Pinyin/Nghĩa -> Chọn chữ Hán
      const qType = i % 3;

      let prompt = '';
      let correctAnswer = '';
      let getDistractor = (w) => '';

      if (qType === 0) {
        prompt = 'Chọn NGHĨA ĐÚNG của từ:';
        correctAnswer = correctWord.meaning_vi;
        getDistractor = (w) => w.meaning_vi;
      } else if (qType === 1) {
        prompt = 'Chọn PINYIN CHUẨN của từ:';
        correctAnswer = correctWord.pinyin;
        getDistractor = (w) => w.pinyin;
      } else {
        prompt = `Tìm CHỮ HÁN có nghĩa "${correctWord.meaning_vi}":`;
        correctAnswer = correctWord.hanzi;
        getDistractor = (w) => w.hanzi;
      }

      // Lấy 3 đáp án sai từ các từ khác
      const otherWords = words.filter(w => w.id !== correctWord.id);
      const shuffledOthers = [...otherWords].sort(() => 0.5 - Math.random());
      const distractorAnswers = shuffledOthers.slice(0, 3).map(getDistractor);

      // Nếu không đủ 3 từ khác, thêm đáp án mặc định
      while (distractorAnswers.length < 3) {
        distractorAnswers.push('---');
      }

      // Trộn đáp án đúng vào 4 lựa chọn
      const options = [correctAnswer, ...distractorAnswers].sort(() => 0.5 - Math.random());

      quizQuestions.push({
        word: correctWord,
        qType,
        prompt,
        correctAnswer,
        options
      });
    }
  }

  function renderQuizQuestion() {
    isAnswerSubmitted = false;
    const q = quizQuestions[currentQuestionIndex];
    if (!q) return;

    quizQuestionCounter.textContent = `Câu hỏi ${currentQuestionIndex + 1} / ${quizQuestions.length}`;
    quizScoreLive.textContent = `Đúng: ${quizCorrectCount} câu`;

    quizPromptType.textContent = q.prompt;
    quizQuestionHanzi.textContent = (q.qType === 2) ? q.word.pinyin : q.word.hanzi;

    btnQuizSpeak.style.display = (q.qType === 2) ? 'none' : 'inline-flex';

    // Render 4 đáp án dạng buttons
    quizOptionsContainer.innerHTML = q.options.map((opt, idx) => `
      <button type="button" class="btn btn-secondary btn-block quiz-opt-btn" data-answer="${opt}" style="text-align: left; justify-content: flex-start; padding: 12px 18px; font-size: 15px; height: auto; min-height: 48px;">
        <span style="font-weight: 800; margin-right: 12px; color: var(--primary);">${String.fromCharCode(65 + idx)}.</span>
        <span>${opt}</span>
      </button>
    `).join('');

    // Tự động phát âm
    if (q.qType !== 2) {
      window.XP.speakChinese(q.word.hanzi);
    }

    // Gắn sự kiện chọn đáp án
    document.querySelectorAll('.quiz-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (isAnswerSubmitted) return;
        isAnswerSubmitted = true;

        const chosen = btn.getAttribute('data-answer');
        const isCorrect = (chosen === q.correctAnswer);

        if (isCorrect) {
          quizCorrectCount++;
          btn.style.backgroundColor = '#dcfce7';
          btn.style.borderColor = '#15803d';
          btn.style.color = '#15803d';
        } else {
          btn.style.backgroundColor = '#fee2e2';
          btn.style.borderColor = '#dc2626';
          btn.style.color = '#dc2626';

          // Tô xanh đáp án đúng để học sinh biết
          document.querySelectorAll('.quiz-opt-btn').forEach(b => {
            if (b.getAttribute('data-answer') === q.correctAnswer) {
              b.style.backgroundColor = '#dcfce7';
              b.style.borderColor = '#15803d';
              b.style.color = '#15803d';
            }
          });
        }

        // Tự động chuyển câu tiếp theo sau 1.2s
        setTimeout(() => {
          if (currentQuestionIndex < quizQuestions.length - 1) {
            currentQuestionIndex++;
            renderQuizQuestion();
          } else {
            finishQuiz();
          }
        }, 1200);
      });
    });
  }

  btnQuizSpeak.addEventListener('click', () => {
    const q = quizQuestions[currentQuestionIndex];
    if (q) window.XP.speakChinese(q.word.hanzi);
  });

  /**
   * Kết thúc Quiz, tính điểm % và gọi RPC nộp bài
   */
  async function finishQuiz() {
    quizPlayingCard.style.display = 'none';
    quizResultCard.style.display = 'block';

    const total = quizQuestions.length;
    const percent = Math.round((quizCorrectCount / total) * 100);
    quizResultScore.textContent = `${percent}%`;
    quizResultIcon.textContent = '⏳';
    quizResultTitle.textContent = 'Đang lưu kết quả kiểm tra...';
    quizResultDesc.textContent = `Bạn đã trả lời đúng ${quizCorrectCount}/${total} câu (${percent}%). Đang đồng bộ XP với máy chủ...`;

    try {
      const targetClassId = await resolveStudentClassId();
      if (!targetClassId) {
        throw new Error('Không xác định được lớp học hiện tại để ghi nhận kết quả và cộng XP.');
      }

      // Gọi RPC an toàn phía server
      const result = await window.Student.submitQuizAttempt(
        targetClassId,
        lessonId,
        quizCorrectCount,
        total
      );

      const passScore = (result && typeof result.pass_score === 'number') ? result.pass_score : 80;
      const isPassed = result ? !!result.passed : (percent >= passScore);
      const xpAwarded = (result && typeof result.xp_awarded === 'number') ? result.xp_awarded : 0;
      const lessonRewardXp = (currentLessonData && typeof currentLessonData.reward_xp === 'number') ? currentLessonData.reward_xp : 50;

      if (xpAwarded > 0) {
        showXpEarnedToast(xpAwarded, 'Hoàn thành bài kiểm tra');
      }

      if (isPassed) {
        quizResultIcon.textContent = '🎉';
        quizResultTitle.textContent = 'Chúc mừng bạn đã hoàn thành bài học!';
        quizResultDesc.innerHTML = `
          Bạn đã trả lời đúng <strong>${quizCorrectCount}/${total} câu (${percent}%)</strong>.<br>
          ${xpAwarded > 0 ? `Đã cộng thưởng <strong style="color: #ca8a04;">+${xpAwarded} XP</strong> vào tài khoản của bạn!` : 'Bạn đã hoàn thành và nhận thưởng XP của bài học này trước đó.'}
          <br>Bài học tiếp theo đã được mở khóa trên lộ trình!
        `;
      } else {
        quizResultIcon.textContent = '⚠️';
        quizResultTitle.textContent = 'Chưa đạt điểm yêu cầu';
        quizResultDesc.innerHTML = `
          Bạn trả lời đúng <strong>${quizCorrectCount}/${total} câu (${percent}%)</strong>.<br>
          Cần đạt <strong>từ ${passScore}% trở lên</strong> để vượt qua bài học và nhận thưởng <strong>+${lessonRewardXp} XP</strong>. Hãy ôn lại từ vựng hoặc Flashcard và thử lại nhé!
        `;
      }

      // Kích hoạt Popup chúc mừng / khích lệ kết quả
      if (window.FeedbackPopup) {
        window.FeedbackPopup.show('quiz', {
          score: percent,
          onContinue: () => {
            if (isPassed) {
              // Nếu qua bài, có thể hiển thị thêm popup hoàn thành bài học nếu muốn
              window.FeedbackPopup.show('lesson');
            }
          },
          onRetry: () => {
            resetQuizToStart();
          }
        });
      }

    } catch (err) {
      console.error('Lỗi lưu kết quả quiz:', err);
      const friendlyMsg = formatLessonDbError(err, 'Không thể lưu kết quả bài kiểm tra lên máy chủ.');
      quizResultIcon.textContent = '❌';
      quizResultTitle.textContent = 'Chưa lưu được kết quả kiểm tra';
      quizResultDesc.innerHTML = '';

      const pMsg = document.createElement('p');
      pMsg.style.cssText = 'color: #f87171; margin-bottom: 10px;';
      pMsg.textContent = `Bạn trả lời đúng ${quizCorrectCount}/${total} câu (${percent}%), nhưng lưu điểm bị lỗi: ${friendlyMsg}`;
      quizResultDesc.appendChild(pMsg);

      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'btn btn-primary';
      retryBtn.textContent = '🔄 Thử lưu kết quả lại';
      retryBtn.addEventListener('click', () => finishQuiz());
      quizResultDesc.appendChild(retryBtn);

      showLessonErrorWithRetry(friendlyMsg, () => finishQuiz());
    }
  }

  // ===========================================================================
  // CHẾ ĐỘ 4: SLIDE BÀI GIẢNG (LESSON SLIDES)
  // ===========================================================================
  async function loadAndRenderLessonSlides() {
    if (slidesLoaded) return;
    try {
      if (slidesLoading) slidesLoading.style.display = 'block';
      if (slidesEmpty) slidesEmpty.style.display = 'none';
      if (slidesContent) slidesContent.style.display = 'none';

      lessonSlides = await window.Student.getLessonSlides(lessonId);
      slidesLoaded = true;
      if (slidesLoading) slidesLoading.style.display = 'none';

      if (!lessonSlides || lessonSlides.length === 0) {
        if (slidesEmpty) slidesEmpty.style.display = 'block';
        return;
      }

      if (slidesContent) slidesContent.style.display = 'block';
      currentSlideIndex = 0;
      renderSlideSelector();
      await renderCurrentSlide();
    } catch (err) {
      console.error('Lỗi tải slide bài học:', err);
      if (slidesLoading) slidesLoading.style.display = 'none';
      if (slidesEmpty) slidesEmpty.style.display = 'block';
    }
  }

  function renderSlideSelector() {
    if (!slidesPillsContainer) return;
    slidesPillsContainer.innerHTML = '';
    lessonSlides.forEach((slide, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-sm ${idx === currentSlideIndex ? 'btn-primary' : 'btn-outline'}`;
      btn.style.borderRadius = 'var(--radius-full)';
      btn.style.fontSize = '13px';
      btn.style.padding = '5px 12px';
      const isPdf = (slide.file_type || '').toLowerCase() === 'pdf';
      const icon = isPdf ? '📄' : '📊';
      btn.innerHTML = `${icon} Slide ${idx + 1}: ${slide.title || 'Tài liệu'}`;
      btn.onclick = async () => {
        currentSlideIndex = idx;
        renderSlideSelector();
        await renderCurrentSlide();
      };
      slidesPillsContainer.appendChild(btn);
    });
  }

  async function renderCurrentSlide() {
    const slide = lessonSlides[currentSlideIndex];
    if (!slide) return;

    const fileType = (slide.file_type || 'pdf').toLowerCase();
    const isPdf = fileType === 'pdf';
    const sizeMb = slide.file_size ? (slide.file_size / (1024 * 1024)).toFixed(2) + ' MB' : '';

    if (slideTitleDisplay) slideTitleDisplay.textContent = slide.title || 'Slide bài giảng';
    if (slideSizeDisplay) slideSizeDisplay.textContent = sizeMb ? `(${sizeMb})` : '';

    if (isPdf) {
      if (slideTypeBadge) {
        slideTypeBadge.textContent = 'PDF';
        slideTypeBadge.style.background = 'rgba(239, 68, 68, 0.15)';
        slideTypeBadge.style.color = '#ef4444';
      }
      if (slidePdfViewerWrap) slidePdfViewerWrap.style.display = 'block';
      if (slidePptxViewerWrap) slidePptxViewerWrap.style.display = 'none';
      if (btnSlideFullscreen) btnSlideFullscreen.style.display = 'inline-flex';
    } else {
      if (slideTypeBadge) {
        slideTypeBadge.textContent = 'POWERPOINT';
        slideTypeBadge.style.background = 'rgba(249, 115, 22, 0.15)';
        slideTypeBadge.style.color = '#f97316';
      }
      if (slidePdfViewerWrap) slidePdfViewerWrap.style.display = 'none';
      if (slidePptxViewerWrap) slidePptxViewerWrap.style.display = 'block';
      if (pptxTitleDisplay) pptxTitleDisplay.textContent = slide.title || 'Slide PowerPoint (.pptx)';
      if (pptxSizeText) pptxSizeText.textContent = sizeMb || 'Tải về';
      if (btnSlideFullscreen) btnSlideFullscreen.style.display = 'none';
    }

    // Lấy signed URL xem hoặc tải về
    const viewUrl = await window.Student.getSlideViewUrl(slide.file_path);

    if (btnSlideDownload) {
      btnSlideDownload.href = viewUrl;
      btnSlideDownload.setAttribute('download', slide.title || 'slide');
    }
    if (btnPptxDownload) {
      btnPptxDownload.href = viewUrl;
      btnPptxDownload.setAttribute('download', slide.title || 'slide');
    }
    if (btnSlideFullscreen) {
      btnSlideFullscreen.href = viewUrl;
    }

    if (isPdf && slidePdfIframe) {
      slidePdfIframe.src = viewUrl;
    }
  }

  // ===========================================================================
  // CHẾ ĐỘ 5: BÀI TẬP VẬN DỤNG CỦA BÀI HỌC (VOCAB, NGHE, GHI ÂM, QUIZ)
  // ===========================================================================
  let lessonAssignmentsData = [];

  // Speaking Modal Elements
  const modalSpeaking = document.getElementById('modal-speaking-assignment');
  const speakingModalTitle = document.getElementById('speaking-modal-title');
  const speakingModalDesc = document.getElementById('speaking-modal-desc');
  const speakingModalAlert = document.getElementById('speaking-modal-alert');
  const speakingModalDue = document.getElementById('speaking-modal-due');
  const speakingModalXp = document.getElementById('speaking-modal-xp');
  const speakingPromptHanzi = document.getElementById('speaking-prompt-hanzi');
  const speakingPromptPinyin = document.getElementById('speaking-prompt-pinyin');
  const speakingSampleAudioBox = document.getElementById('speaking-sample-audio-box');
  const btnPlaySpeakingSample = document.getElementById('btn-play-speaking-sample');
  const recorderStatusText = document.getElementById('recorder-status-text');
  const recorderTimer = document.getElementById('recorder-timer');
  const btnStartRecord = document.getElementById('btn-start-record');
  const btnStopRecord = document.getElementById('btn-stop-record');
  const btnReRecord = document.getElementById('btn-re-record');
  const previewAudioContainer = document.getElementById('preview-audio-container');
  const previewAudioPlayer = document.getElementById('preview-audio-player');
  const micPermissionGuide = document.getElementById('mic-permission-guide');
  const speakingPrevSubmissionInfo = document.getElementById('speaking-prev-submission-info');
  const btnSubmitSpeaking = document.getElementById('btn-submit-speaking');
  const btnCancelRecord = document.getElementById('btn-cancel-record');
  const btnAddTake = document.getElementById('btn-add-take');
  const speakingTakesList = document.getElementById('speaking-takes-list');
  const takesCountBadge = document.getElementById('takes-count-badge');
  const takesEmptyHint = document.getElementById('takes-empty-hint');
  const takesMaxNotice = document.getElementById('takes-max-notice');

  // Listening Modal Elements
  const modalListening = document.getElementById('modal-listening-assignment');
  const listeningModalTitle = document.getElementById('listening-modal-title');
  const listeningModalDesc = document.getElementById('listening-modal-desc');
  const listeningModalAlert = document.getElementById('listening-modal-alert');
  const listeningAudioPlayer = document.getElementById('listening-audio-player');
  const listeningQuestionsList = document.getElementById('listening-questions-list');
  const btnSubmitListening = document.getElementById('btn-submit-listening');

  let currentSpeakingAssign = null;
  let currentListeningAssign = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let recordTimerInterval = null;
  let recordSeconds = 0;
  let sampleAudioInstance = null;

  async function loadAndRenderLessonAssignments() {
    try {
      if (lessonAssignCounter) lessonAssignCounter.textContent = 'Đang tải...';
      if (lessonAssignmentsList) {
        lessonAssignmentsList.innerHTML = `
          <div style="text-align: center; padding: 32px; color: var(--text-muted);">
            Đang nạp bài tập của bài học...
          </div>
        `;
      }

      const assignments = await window.Student.getLessonAssignments(lessonId, classId);
      lessonAssignmentsData = assignments || [];

      if (!lessonAssignmentsData || lessonAssignmentsData.length === 0) {
        if (lessonAssignCounter) lessonAssignCounter.textContent = '0 bài tập';
        if (lessonAssignmentsList) {
          lessonAssignmentsList.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-muted); background: var(--bg-subtle); border-radius: var(--radius-md);">
              <div style="font-size: 40px; margin-bottom: 10px;">🎉</div>
              <div style="font-weight: 700; font-size: 16px; color: var(--text-main); margin-bottom: 6px;">
                Bài học này chưa có bài tập mở rộng nào
              </div>
              <p style="font-size: 13px; margin: 0; line-height: 1.5;">
                Bạn hãy ôn luyện kỹ phần Từ Mới, Flashcard và vượt qua bài Kiểm Tra Quiz để tích lũy XP nhé!
              </p>
            </div>
          `;
        }
        return;
      }

      if (lessonAssignCounter) lessonAssignCounter.textContent = `${lessonAssignmentsData.length} bài tập`;

      lessonAssignmentsList.innerHTML = lessonAssignmentsData.map(a => {
        let typeBadge = '';
        let actionBtnText = 'Làm bài';

        if (a.assignment_type === 'speaking') {
          typeBadge = '<span class="badge" style="background: #dbeafe; color: #1e40af; font-weight: 700;">🎙️ Bài tập Ghi âm</span>';
          actionBtnText = (a.userStatus === 'completed' || a.userStatus === 'submitted' || a.userStatus === 'graded')
            ? '🎧 Xem bài nộp / Ghi âm lại'
            : '🎙️ Bắt đầu ghi âm';
        } else if (a.assignment_type === 'listening') {
          typeBadge = '<span class="badge" style="background: #d1fae5; color: #065f46; font-weight: 700;">🎧 Bài tập Luyện nghe</span>';
          actionBtnText = a.userStatus === 'completed'
            ? '🎧 Làm lại bài nghe'
            : '🎧 Bắt đầu làm bài nghe';
        } else if (a.assignment_type === 'quiz') {
          typeBadge = '<span class="badge" style="background: #fef3c7; color: #92400e; font-weight: 700;">📝 Trắc nghiệm Quiz</span>';
          actionBtnText = '📝 Vào kiểm tra Quiz';
        } else {
          typeBadge = '<span class="badge" style="background: #f3e8ff; color: #6b21a8; font-weight: 700;">📖 Ôn tập Từ vựng</span>';
          actionBtnText = '📖 Vào học từ vựng';
        }

        let statusBadge = '<span class="badge" style="background: var(--bg-subtle); color: var(--text-muted);">Chưa làm</span>';
        if (a.userStatus === 'completed') {
          statusBadge = '<span class="badge" style="background: #dcfce7; color: #15803d; font-weight: 700;">✅ Đã hoàn thành</span>';
        } else if (a.userStatus === 'submitted') {
          statusBadge = '<span class="badge" style="background: #fef3c7; color: #b45309; font-weight: 700;">⏳ Chờ cô giáo chấm</span>';
        } else if (a.userStatus === 'graded') {
          const score = a.submission ? a.submission.score : '';
          statusBadge = `<span class="badge" style="background: #e0e7ff; color: #4338ca; font-weight: 700;">⭐ Điểm: ${score}/100</span>`;
        }

        return `
          <div class="card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 240px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                ${typeBadge}
                ${statusBadge}
                <span style="font-size: 13px; font-weight: 700; color: #ca8a04;">+${a.reward_xp || 30} XP</span>
              </div>
              <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">
                ${a.title}
              </h3>
              ${a.description ? `<p style="font-size: 13px; color: var(--text-muted); margin: 0; line-height: 1.4;">${a.description}</p>` : ''}
              ${a.submission && a.submission.teacher_comment ? `
                <div style="margin-top: 8px; background: rgba(59,130,246,0.06); border-left: 3px solid var(--primary); padding: 6px 10px; font-size: 12px; color: var(--text-main); border-radius: 4px;">
                  💬 <strong>Cô giáo nhận xét:</strong> "${a.submission.teacher_comment}"
                </div>
              ` : ''}
            </div>
            <div>
              <button type="button" class="btn btn-primary btn-sm btn-action-lesson-assign" data-id="${a.id}" data-type="${a.assignment_type}">
                ${actionBtnText}
              </button>
            </div>
          </div>
        `;
      }).join('');

      document.querySelectorAll('.btn-action-lesson-assign').forEach(btn => {
        btn.addEventListener('click', () => {
          const aId = btn.getAttribute('data-id');
          const type = btn.getAttribute('data-type');
          const assign = lessonAssignmentsData.find(x => x.id === aId);
          if (!assign) return;

          if (type === 'speaking') {
            openSpeakingModal(assign);
          } else if (type === 'listening') {
            openListeningModal(assign);
          } else if (type === 'quiz') {
            switchMode('quiz');
          } else {
            switchMode('vocab');
          }
        });
      });

    } catch (err) {
      console.error('Lỗi nạp bài tập bài học:', err);
      if (lessonAssignmentsList) {
        lessonAssignmentsList.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 20px;">Lỗi tải bài tập: ${err.message}</div>`;
      }
    }
  }

  // --- XỬ LÝ MODAL BÀI TẬP GHI ÂM (SPEAKING) - NHIỀU BẢN GHI (MULTIPLE TAKES) ---
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

      // Gắn sự kiện Xóa từng bản
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
      try { mediaRecorder.stop(); } catch (e) {}
    }
    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop());
      activeStream = null;
    }
    if (previewAudioPlayer) previewAudioPlayer.pause();
    if (sampleAudioInstance) sampleAudioInstance.pause();
  }

  // Cảnh báo người dùng khi thoát hoặc tải lại trang nếu còn bản ghi chưa nộp
  window.addEventListener('beforeunload', (e) => {
    if (recordedTakes && recordedTakes.length > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  if (modalSpeaking) {
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
  }

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

    if (speakingModalDue) {
      speakingModalDue.textContent = assign.due_date
        ? new Date(assign.due_date).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
        : 'Không giới hạn';
    }
    if (speakingModalXp) {
      speakingModalXp.textContent = `+${assign.reward_xp || 30} XP`;
    }

    speakingPromptHanzi.textContent = assign.speaking_prompt || 'Không có nội dung câu hỏi';
    if (speakingPromptPinyin) {
      speakingPromptPinyin.textContent = assign.speaking_pinyin || '';
      speakingPromptPinyin.style.display = assign.speaking_pinyin ? 'block' : 'none';
    }

    if (speakingSampleAudioBox && btnPlaySpeakingSample) {
      if (assign.speaking_sample_audio_url) {
        speakingSampleAudioBox.style.display = 'block';
        btnPlaySpeakingSample.onclick = () => {
          if (!sampleAudioInstance) {
            sampleAudioInstance = new Audio(assign.speaking_sample_audio_url);
            sampleAudioInstance.onended = () => { btnPlaySpeakingSample.textContent = '🔊 Nghe audio đọc mẫu của cô giáo'; };
          }
          if (sampleAudioInstance.paused) {
            sampleAudioInstance.play();
            btnPlaySpeakingSample.textContent = '⏸️ Đang phát audio mẫu...';
          } else {
            sampleAudioInstance.pause();
            btnPlaySpeakingSample.textContent = '🔊 Nghe audio đọc mẫu của cô giáo';
          }
        };
      } else {
        speakingSampleAudioBox.style.display = 'none';
      }
    }

    // Hiển thị lịch sử bài nộp trước đó nếu có (kèm danh sách các bản ghi con & nhận xét giọng nói của cô giáo)
    if (speakingPrevSubmissionInfo) {
      const sub = assign.submission;
      if (sub && sub.audio_url) {
        speakingPrevSubmissionInfo.style.display = 'block';
        const isGraded = (sub.status === 'graded');
        const scoreBadge = isGraded
          ? `<span class="badge" style="background: #e0e7ff; color: #4338ca; font-weight: 700;">🟢 Đã chấm: ${sub.score}/100</span>`
          : `<span class="badge" style="background: #fef3c7; color: #b45309; font-weight: 600;">🟡 Đang chờ cô giáo chấm</span>`;

        speakingPrevSubmissionInfo.innerHTML = `
          <div style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
            <span>📌 Bài nộp ghi âm của bạn:</span>
            ${scoreBadge}
          </div>
          ${isGraded ? `<div style="font-size: 13px; color: #16a34a; font-weight: 700; margin-bottom: 6px;">⚡ Điểm thưởng: +${Math.round((sub.score / 100) * (assign.reward_xp || 30))} XP</div>` : ''}

          <!-- Lời nhận xét bằng giọng nói của cô giáo (nếu có) -->
          ${sub.teacher_audio_url ? `
            <div style="margin: 10px 0; background: rgba(59, 130, 246, 0.08); border: 1.5px solid rgba(59, 130, 246, 0.3); border-radius: var(--radius-sm); padding: 10px 14px;">
              <div style="font-weight: 700; color: var(--primary); font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                🎙️ Nhận xét bằng giọng nói của cô giáo:
              </div>
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <button type="button" class="btn btn-primary btn-sm btn-play-teacher-voice-lesson" data-url="${sub.teacher_audio_url}">
                  ▶️ Nghe cô giáo nhận xét
                </button>
                <span class="teacher-voice-status-lesson" style="font-size: 12px; color: var(--text-muted); font-style: italic;"></span>
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
            <div id="prev-lesson-takes-list" style="display: flex; flex-direction: column; gap: 6px;">
              <div style="font-size: 12px; color: var(--text-muted); font-style: italic;">Đang tải danh sách bản ghi...</div>
            </div>
          </div>

          <div style="margin-top: 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            ${!isGraded ? `<button type="button" class="btn btn-outline btn-sm btn-toggle-rerecord-lesson" style="border-color: var(--warning); color: var(--warning);">🔄 Ghi âm nộp lại</button>` : ''}
          </div>
        `;

        // Tải danh sách các bản ghi từ DB
        (async () => {
          const takesContainer = speakingPrevSubmissionInfo.querySelector('#prev-lesson-takes-list');
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
                <button type="button" class="btn btn-outline btn-sm btn-play-prev-take-lesson" data-url="${t.storage_path}" style="font-size: 12px; padding: 2px 10px;">
                  ▶️ Nghe
                </button>
              </div>
            `).join('');

            takesContainer.querySelectorAll('.btn-play-prev-take-lesson').forEach(btn => {
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
            takesContainer.innerHTML = `<div style="font-size: 12px; color: var(--danger);">Không thể tải danh sách bản ghi: ${e.message || e}</div>`;
          }
        })();

        // Sự kiện nghe nhận xét giọng nói của cô giáo
        const btnTeacherVoice = speakingPrevSubmissionInfo.querySelector('.btn-play-teacher-voice-lesson');
        if (btnTeacherVoice) {
          btnTeacherVoice.addEventListener('click', async () => {
            const rawUrl = btnTeacherVoice.dataset.url;
            const statusSpan = speakingPrevSubmissionInfo.querySelector('.teacher-voice-status-lesson');
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

        const btnToggleRe = speakingPrevSubmissionInfo.querySelector('.btn-toggle-rerecord-lesson');
        if (btnToggleRe) {
          btnToggleRe.addEventListener('click', () => {
            if (speakingRecordWrapper) speakingRecordWrapper.style.display = 'block';
            if (btnSubmitSpeaking) btnSubmitSpeaking.style.display = 'inline-flex';
            resetRecordingUi();
            btnToggleRe.style.display = 'none';
          });
        }

        // Đã nộp -> ẩn khung thu âm
        if (speakingRecordWrapper) speakingRecordWrapper.style.display = 'none';
        if (btnSubmitSpeaking) btnSubmitSpeaking.style.display = 'none';

      } else {
        speakingPrevSubmissionInfo.style.display = 'none';
        if (speakingRecordWrapper) speakingRecordWrapper.style.display = 'block';
        if (btnSubmitSpeaking) btnSubmitSpeaking.style.display = 'inline-flex';
        resetRecordingUi();
      }
    }

    modalSpeaking.classList.add('active');
  }

  if (btnStartRecord) {
    btnStartRecord.addEventListener('click', async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        activeStream = stream;
        if (micPermissionGuide) micPermissionGuide.style.display = 'none';
        speakingModalAlert.className = 'alert';
        speakingModalAlert.textContent = '';

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

          if (blob.size > 5 * 1024 * 1024) {
            alert(`Dung lượng bản ghi ${(blob.size / (1024 * 1024)).toFixed(1)}MB vượt quá giới hạn 5MB. Vui lòng ghi âm ngắn hơn.`);
            if (btnStartRecord) btnStartRecord.style.display = 'inline-flex';
            if (btnStopRecord) btnStopRecord.style.display = 'none';
            if (btnCancelRecord) btnCancelRecord.style.display = 'none';
            return;
          }

          const duration = Math.max(recordSeconds, 1);
          const objectUrl = URL.createObjectURL(blob);

          if (activeReplaceIndex >= 0 && activeReplaceIndex < recordedTakes.length) {
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

        mediaRecorder.start(250);
        recordSeconds = 0;
        btnStartRecord.style.display = 'none';
        btnStopRecord.style.display = 'inline-flex';
        if (btnCancelRecord) btnCancelRecord.style.display = 'none';

        const targetLabel = activeReplaceIndex >= 0
          ? `Bản ghi ${activeReplaceIndex + 1} (Ghi lại)`
          : `Bản ghi ${recordedTakes.length + 1}`;
        recorderStatusText.innerHTML = `<span style="color: var(--danger); font-weight: 700;">🔴 Đang thu âm cho ${targetLabel}... Hãy đọc to rõ ràng</span>`;

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
        console.error('Lỗi Microphone:', err);
        if (micPermissionGuide) micPermissionGuide.style.display = 'block';
        speakingModalAlert.className = 'alert alert-danger show';
        speakingModalAlert.textContent = 'Không thể truy cập Microphone: ' + (err.message || 'Micro bị từ chối');
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
        speakingModalAlert.className = 'alert alert-info show';
        speakingModalAlert.textContent = 'Đang tải bản ghi âm lên hệ thống...';

        const currentUser = await window.Auth.getCurrentUser();
        const studentId = currentUser ? currentUser.user.id : 'unknown';

        const totalTakes = recordedTakes.length;
        const uploadedTakes = [];

        // 1. Tải tuần tự từng file lên Supabase Storage với chỉ báo tiến độ (có cache đường dẫn khi thử nộp lại)
        for (let i = 0; i < totalTakes; i++) {
          const take = recordedTakes[i];
          btnSubmitSpeaking.textContent = `⏳ Đang tải ${i + 1}/${totalTakes} bản ghi...`;
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

        speakingModalAlert.textContent = 'Đang hoàn tất nộp bài tập...';
        const primaryPath = (uploadedTakes[0] && uploadedTakes[0].storage_path) ? uploadedTakes[0].storage_path : '';
        const res = await window.Student.submitSpeakingAssignment(
          currentSpeakingAssign.id,
          primaryPath,
          uploadedTakes
        );

        const xpBonusText = (res && res.xp_awarded > 0) ? ` (+${res.xp_awarded} XP)` : '';
        if (res && res.xp_awarded > 0) {
          showXpEarnedToast(res.xp_awarded, 'Nộp bài ghi âm');
        }
        speakingModalAlert.className = 'alert alert-success show';
        speakingModalAlert.textContent = '🎉 Nộp bài ghi âm thành công!' + xpBonusText + ' Cô giáo sẽ nghe và chấm điểm cho bạn sớm nhất.';

        // Dọn dẹp bộ nhớ tạm
        recordedTakes.forEach(t => {
          if (t.objectUrl) URL.revokeObjectURL(t.objectUrl);
        });
        recordedTakes = [];

        setTimeout(() => {
          stopRecordingCleanup();
          modalSpeaking.classList.remove('active');
          loadAndRenderLessonAssignments();
        }, 1500);

      } catch (err) {
        console.error('Lỗi nộp bài ghi âm:', err);
        speakingModalAlert.className = 'alert alert-danger show';
        speakingModalAlert.textContent = formatLessonDbError(err, 'Lỗi khi nộp bài ghi âm');
        btnSubmitSpeaking.disabled = false;
        btnSubmitSpeaking.textContent = `Thử nộp lại (${recordedTakes.length} bản ghi)`;
      }
    });
  }

  // --- XỬ LÝ MODAL BÀI TẬP NGHE HIỂU (LISTENING) ---
  if (modalListening) {
    document.querySelectorAll('[data-close="modal-listening-assignment"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (listeningAudioPlayer) listeningAudioPlayer.pause();
        modalListening.classList.remove('active');
      });
    });
  }

  function openListeningModal(assign) {
    currentListeningAssign = assign;
    listeningModalTitle.textContent = `🎧 ${assign.title}`;
    listeningModalDesc.textContent = assign.description || 'Lắng nghe kỹ file audio và chọn đáp án chính xác cho từng câu hỏi bên dưới.';
    listeningModalAlert.className = 'alert';
    listeningModalAlert.textContent = '';

    if (listeningAudioPlayer) {
      listeningAudioPlayer.src = assign.listening_audio_url || '';
    }

    let questions = [];
    if (assign.listening_questions) {
      questions = typeof assign.listening_questions === 'string'
        ? JSON.parse(assign.listening_questions)
        : assign.listening_questions;
    }

    if (!questions || questions.length === 0) {
      listeningQuestionsList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Bài nghe chưa có câu hỏi nào.</div>`;
      btnSubmitListening.style.display = 'none';
    } else {
      btnSubmitListening.style.display = 'inline-flex';
      btnSubmitListening.disabled = false;
      btnSubmitListening.textContent = 'Nộp bài & Chấm điểm';

      listeningQuestionsList.innerHTML = questions.map((q, qIdx) => `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 14px;">
          <div style="font-weight: 700; color: var(--text-main); margin-bottom: 8px;">
            Câu ${qIdx + 1}: ${q.question || ''}
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${(q.options || []).map((opt, oIdx) => `
              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; padding: 6px 10px; border-radius: 6px; background: var(--bg-subtle);">
                <input type="radio" name="listening-q-${qIdx}" value="${oIdx}">
                <span>${opt}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `).join('');
    }

    modalListening.classList.add('active');
  }

  if (btnSubmitListening) {
    btnSubmitListening.addEventListener('click', async () => {
      if (!currentListeningAssign) return;

      let questions = [];
      if (currentListeningAssign.listening_questions) {
        questions = typeof currentListeningAssign.listening_questions === 'string'
          ? JSON.parse(currentListeningAssign.listening_questions)
          : currentListeningAssign.listening_questions;
      }

      const answers = [];
      for (let i = 0; i < questions.length; i++) {
        const checked = document.querySelector(`input[name="listening-q-${i}"]:checked`);
        if (!checked) {
          listeningModalAlert.className = 'alert alert-danger show';
          listeningModalAlert.textContent = `Vui lòng chọn đáp án cho Câu ${i + 1}!`;
          return;
        }
        answers.push(parseInt(checked.value, 10));
      }

      try {
        btnSubmitListening.disabled = true;
        btnSubmitListening.textContent = 'Đang chấm điểm...';

        const result = await window.Student.submitListeningAssignment(currentListeningAssign.id, answers);
        const correctCount = result ? (result.correct_count ?? result.correctCount ?? 0) : 0;
        const totalQuestions = result ? (result.total_questions ?? result.totalQuestions ?? 0) : 0;
        const earnedXp = result ? (result.xp_awarded ?? result.earnedXp ?? 0) : 0;
        const xpSuffix = earnedXp > 0 ? ` (+${earnedXp} XP)` : '';

        if (earnedXp > 0) {
          showXpEarnedToast(earnedXp, 'Hoàn thành bài tập nghe');
        }

        listeningModalAlert.className = 'alert alert-success show';
        listeningModalAlert.textContent = `🎉 Hoàn thành! Bạn trả lời đúng ${correctCount}/${totalQuestions} câu.${xpSuffix}`;

        setTimeout(() => {
          if (listeningAudioPlayer) listeningAudioPlayer.pause();
          modalListening.classList.remove('active');
          loadAndRenderLessonAssignments();
        }, 1800);

      } catch (err) {
        console.error('Lỗi nộp bài nghe:', err);
        listeningModalAlert.className = 'alert alert-danger show';
        listeningModalAlert.textContent = formatLessonDbError(err, 'Lỗi nộp bài');
        btnSubmitListening.disabled = false;
        btnSubmitListening.textContent = 'Thử lại';
      }
    });
  }

  btnRetryQuiz.addEventListener('click', () => {
    resetQuizToStart();
  });
});
