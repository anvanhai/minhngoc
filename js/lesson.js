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
  const modeVocabContainer = document.getElementById('mode-vocab-container');
  const modeFlashcardContainer = document.getElementById('mode-flashcard-container');
  const modeQuizContainer = document.getElementById('mode-quiz-container');

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
          <p style="font-size: 14px;">Giáo viên đang cập nhật danh sách từ cho bài học này.</p>
        </div>
      `;
      lessonWordCounter.textContent = 'Từ 0 / 0';
      return;
    }

    if (classId) {
      btnBackLink.href = `curriculum.html`;
    }

    // Chọn chế độ ban đầu
    if (initialMode === 'flashcard') {
      switchMode('flashcard');
    } else if (initialMode === 'quiz') {
      switchMode('quiz');
    } else {
      switchMode('vocab');
    }

  } catch (err) {
    console.error('Lỗi tải bài học:', err);
    showAlert('Lỗi tải bài học: ' + (err.message || err));
  }

  // 2. Chuyển đổi giữa 3 chế độ
  function switchMode(mode) {
    hideAlert();
    tabBtnVocab.classList.remove('active');
    tabBtnFlashcard.classList.remove('active');
    tabBtnQuiz.classList.remove('active');

    modeVocabContainer.style.display = 'none';
    modeFlashcardContainer.style.display = 'none';
    modeQuizContainer.style.display = 'none';

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
    }
  }

  tabBtnVocab.addEventListener('click', () => switchMode('vocab'));
  tabBtnFlashcard.addEventListener('click', () => switchMode('flashcard'));
  tabBtnQuiz.addEventListener('click', () => switchMode('quiz'));

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
      showAlert('🎉 Bạn đã xem hết toàn bộ từ vựng của bài học! Hãy chuyển sang Flashcard hoặc làm Quiz để nhận XP.', 'success');
      setTimeout(() => switchMode('flashcard'), 1200);
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
      fcBackExample.innerHTML = `<strong>${w.example_hanzi}</strong><br><span style="color: #64748b;">${w.example_vi || ''}</span>`;
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

    } catch (err) {
      console.error('Lỗi lưu kết quả quiz:', err);
      quizResultDesc.textContent = `Đạt ${quizCorrectCount}/${total} câu (${percent}%).`;
    }
  }

  btnRetryQuiz.addEventListener('click', () => {
    resetQuizToStart();
  });
});
