/**
 * LOGIC PHÒNG HỌC BÀI: HỌC TỪ MỚI, FLASHCARD SRS & QUIZ CUỐI BÀI (lesson.html)
 */

document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth();
  if (!authData) return;

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

  // Header Elements
  const lessonHeaderTitle = document.getElementById('lesson-header-title');
  const lessonWordCounter = document.getElementById('lesson-word-counter');
  const btnBackLink = document.getElementById('btn-back-link');
  const lessonAlert = document.getElementById('lesson-alert');

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
    const db = window.getDb();
    const { data: lessonData } = await db
      .from('lessons')
      .select('*, curriculum:curriculums(title)')
      .eq('id', lessonId)
      .single();

    if (lessonData) {
      lessonHeaderTitle.textContent = `Bài ${lessonData.order_index}: ${lessonData.title_zh}`;
      document.title = `Bài ${lessonData.order_index}: ${lessonData.title_zh} — Minh Ngọc HSK`;
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

  btnNextVocab.addEventListener('click', async () => {
    if (currentVocabIndex < words.length - 1) {
      currentVocabIndex++;
      renderVocabWord();
    } else {
      if (classId) {
        await window.Student.recordLessonVocabProgress(classId, lessonId, words.length, words.length);
      }
      if (window.FeedbackPopup) {
        window.FeedbackPopup.show('vocabulary', {
          onContinue: () => switchMode('flashcard')
        });
      } else {
        showAlert('🎉 Bạn đã xem hết toàn bộ từ vựng của bài học! Hãy chuyển sang Flashcard hoặc làm Quiz để nhận XP.', 'success');
        setTimeout(() => switchMode('flashcard'), 1200);
      }
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

  document.querySelectorAll('.btn-srs').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const srsLevel = parseInt(btn.getAttribute('data-srs'), 10);
      const w = words[currentFcIndex];

      if (w) {
        try {
          await window.Student.recordWordReview(w.id, srsLevel);
        } catch (err) {
          console.warn('Lỗi lưu SRS:', err);
        }
      }

      if (currentFcIndex < words.length - 1) {
        currentFcIndex++;
        renderFlashcard();
      } else {
        if (classId) {
          await window.Student.recordLessonVocabProgress(classId, lessonId, words.length, words.length);
        }

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
              Bạn đã ôn luyện toàn bộ <strong>${words.length} từ vựng</strong>. Hãy vào làm Quiz để kiểm tra trí nhớ và nhận XP nhé!
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

    try {
      // Gọi RPC an toàn phía server
      const result = await window.Student.submitQuizAttempt(
        classId,
        lessonId,
        quizCorrectCount,
        total
      );

      const isPassed = result ? result.passed : (percent >= 80);
      const xpAwarded = result ? result.xp_awarded : 0;

      if (isPassed) {
        quizResultIcon.textContent = '🎉';
        quizResultTitle.textContent = 'Chúc mừng bạn đã hoàn thành bài học!';
        quizResultDesc.innerHTML = `
          Bạn đã trả lời đúng <strong>${quizCorrectCount}/${total} câu (${percent}%)</strong>.<br>
          ${xpAwarded > 0 ? `Đã cộng thưởng <strong style="color: #ca8a04;">+${xpAwarded} XP</strong> vào tài khoản của bạn!` : 'Bạn đã từng nhận thưởng XP của bài học này.'}
          <br>Bài học tiếp theo đã được mở khóa trên lộ trình!
        `;
      } else {
        quizResultIcon.textContent = '⚠️';
        quizResultTitle.textContent = 'Chưa đạt điểm yêu cầu';
        quizResultDesc.innerHTML = `
          Bạn trả lời đúng <strong>${quizCorrectCount}/${total} câu (${percent}%)</strong>.<br>
          Cần đạt <strong>từ 80% trở lên</strong> để vượt qua bài học. Hãy ôn lại từ vựng hoặc Flashcard và thử lại nhé!
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
      quizResultDesc.textContent = `Đạt ${quizCorrectCount}/${total} câu (${percent}%).`;
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
  let audioBlob = null;
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

  // --- XỬ LÝ MODAL BÀI TẬP GHI ÂM (SPEAKING) ---
  if (modalSpeaking) {
    document.querySelectorAll('[data-close="modal-speaking-assignment"]').forEach(btn => {
      btn.addEventListener('click', () => {
        stopRecordingCleanup();
        modalSpeaking.classList.remove('active');
      });
    });
  }

  function stopRecordingCleanup() {
    if (recordTimerInterval) {
      clearInterval(recordTimerInterval);
      recordTimerInterval = null;
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { mediaRecorder.stop(); } catch (e) {}
    }
    if (previewAudioPlayer) previewAudioPlayer.pause();
    if (sampleAudioInstance) sampleAudioInstance.pause();
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

    audioBlob = null;
    btnSubmitSpeaking.disabled = true;
    btnStartRecord.style.display = 'inline-flex';
    btnStopRecord.style.display = 'none';
    btnReRecord.style.display = 'none';
    previewAudioContainer.style.display = 'none';
    recorderStatusText.textContent = 'Nhấn nút tròn đỏ bên dưới để bắt đầu ghi âm';
    recorderTimer.innerHTML = '00:00 <span style="font-size: 13px; color: var(--text-muted); font-weight: normal;">/ 01:00</span>';

    // Hiển thị lịch sử bài nộp trước đó nếu có
    if (speakingPrevSubmissionInfo) {
      if (assign.submission) {
        speakingPrevSubmissionInfo.style.display = 'block';
        let subText = `ℹ️ <strong>Bạn đã nộp bài tập này:</strong> `;
        if (assign.submission.status === 'graded') {
          subText += `<span style="color: #4338ca; font-weight: 700;">Điểm số: ${assign.submission.score}/100</span>`;
        } else {
          subText += `<span style="color: #b45309; font-weight: 600;">Đang chờ cô giáo chấm điểm</span>`;
        }
        if (assign.submission.teacher_comment) {
          subText += `<br>💬 <em>Nhận xét của cô giáo:</em> "${assign.submission.teacher_comment}"`;
        }
        speakingPrevSubmissionInfo.innerHTML = subText;
      } else {
        speakingPrevSubmissionInfo.style.display = 'none';
      }
    }

    modalSpeaking.classList.add('active');
  }

  if (btnStartRecord) {
    btnStartRecord.addEventListener('click', async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
        }

        mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
          previewAudioPlayer.src = URL.createObjectURL(audioBlob);
          previewAudioContainer.style.display = 'block';

          btnStartRecord.style.display = 'none';
          btnStopRecord.style.display = 'none';
          btnReRecord.style.display = 'inline-flex';
          btnSubmitSpeaking.disabled = false;
          recorderStatusText.textContent = 'Đã ghi âm xong! Bạn hãy nghe lại bản ghi ở dưới trước khi nộp nhé.';
        };

        mediaRecorder.start(250);
        recordSeconds = 0;
        btnStartRecord.style.display = 'none';
        btnStopRecord.style.display = 'inline-flex';
        btnReRecord.style.display = 'none';
        previewAudioContainer.style.display = 'none';
        recorderStatusText.textContent = '🔴 Đang thu âm... Hãy đọc to rõ ràng';

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
      audioBlob = null;
      btnSubmitSpeaking.disabled = true;
      btnStartRecord.style.display = 'inline-flex';
      btnStopRecord.style.display = 'none';
      btnReRecord.style.display = 'none';
      previewAudioContainer.style.display = 'none';
      if (previewAudioPlayer) previewAudioPlayer.pause();
      recorderStatusText.textContent = 'Nhấn nút tròn đỏ để ghi âm lại';
      recorderTimer.innerHTML = '00:00 <span style="font-size: 13px; color: var(--text-muted); font-weight: normal;">/ 01:00</span>';
    });
  }

  if (btnSubmitSpeaking) {
    btnSubmitSpeaking.addEventListener('click', async () => {
      if (!currentSpeakingAssign || !audioBlob) return;

      try {
        btnSubmitSpeaking.disabled = true;
        btnSubmitSpeaking.textContent = 'Đang tải lên bản ghi âm...';
        speakingModalAlert.className = 'alert alert-info show';
        speakingModalAlert.textContent = 'Đang tải bản ghi âm lên hệ thống...';

        const currentUser = await window.Auth.getCurrentUser();
        const studentId = currentUser ? currentUser.user.id : 'unknown';

        const audioUrl = await window.Student.uploadRecordingAudio(audioBlob, studentId);

        speakingModalAlert.textContent = 'Đang hoàn tất nộp bài tập...';
        await window.Student.submitSpeakingAssignment(currentSpeakingAssign.id, audioUrl);

        speakingModalAlert.className = 'alert alert-success show';
        speakingModalAlert.textContent = '🎉 Nộp bài ghi âm thành công! Cô giáo sẽ nghe và chấm điểm cho bạn sớm nhất.';

        if (window.XP) {
          await window.XP.awardXP(10, `Ghi âm nộp bài: ${currentSpeakingAssign.title}`);
        }

        setTimeout(() => {
          stopRecordingCleanup();
          modalSpeaking.classList.remove('active');
          loadAndRenderLessonAssignments();
        }, 1500);

      } catch (err) {
        console.error('Lỗi nộp bài ghi âm:', err);
        speakingModalAlert.className = 'alert alert-danger show';
        speakingModalAlert.textContent = err.message || 'Lỗi khi nộp bài ghi âm';
        btnSubmitSpeaking.disabled = false;
        btnSubmitSpeaking.textContent = 'Thử nộp lại';
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

        listeningModalAlert.className = 'alert alert-success show';
        listeningModalAlert.textContent = `🎉 Hoàn thành! Bạn trả lời đúng ${result.correctCount}/${result.totalQuestions} câu. (+${result.earnedXp || 30} XP)`;

        setTimeout(() => {
          if (listeningAudioPlayer) listeningAudioPlayer.pause();
          modalListening.classList.remove('active');
          loadAndRenderLessonAssignments();
        }, 1800);

      } catch (err) {
        console.error('Lỗi nộp bài nghe:', err);
        listeningModalAlert.className = 'alert alert-danger show';
        listeningModalAlert.textContent = err.message || 'Lỗi nộp bài';
        btnSubmitListening.disabled = false;
        btnSubmitListening.textContent = 'Thử lại';
      }
    });
  }

  btnRetryQuiz.addEventListener('click', () => {
    resetQuizToStart();
  });
});
