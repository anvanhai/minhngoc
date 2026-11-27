/**
 * LOGIC BẢNG XẾP HẠNG RIÊNG TỪNG LỚP (leaderboard.html)
 */

document.addEventListener('DOMContentLoaded', async function () {
  const authData = await window.Auth.requireAuth();
  if (!authData) return;
  window.Auth.renderNavbarUserInfo(authData.profile);
  window.Student.initReviewNavAndReminder({ showToast: true });

  const urlParams = new URLSearchParams(window.location.search);
  let classId = urlParams.get('class_id');
  let currentPeriod = 'week';
  let leaderboardData = [];

  const lbClassName = document.getElementById('lb-class-name');
  const podiumSection = document.getElementById('podium-section');
  const myRankBanner = document.getElementById('my-rank-banner');
  const myRankText = document.getElementById('my-rank-text');
  const myXpText = document.getElementById('my-xp-text');
  const leaderboardTableBody = document.getElementById('leaderboard-table-body');
  const pageAlert = document.getElementById('page-alert');

  // Modal Profile
  const modalPublicProfile = document.getElementById('modal-public-profile');
  const popAvatar = document.getElementById('pop-avatar');
  const popName = document.getElementById('pop-name');
  const popUsername = document.getElementById('pop-username');
  const popRank = document.getElementById('pop-rank');
  const popXp = document.getElementById('pop-xp');
  const popWords = document.getElementById('pop-words');
  const popStreak = document.getElementById('pop-streak');

  function showAlert(msg, type = 'danger') {
    pageAlert.className = `alert alert-${type} show`;
    pageAlert.textContent = msg;
  }

  // 1. Xác định lớp học cần xem BXH
  try {
    if (!classId) {
      const activeClass = await window.Student.getActiveClass();
      if (activeClass) {
        classId = activeClass.id;
        lbClassName.textContent = activeClass.name;
      }
    } else {
      // Admin hoặc Teacher xem theo ID
      const targetClass = await window.Admin.getClassById(classId);
      if (targetClass) lbClassName.textContent = targetClass.name;
    }

    if (!classId) {
      leaderboardTableBody.innerHTML = `
        <tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">
          Bạn chưa tham gia lớp học nào nên chưa có bảng xếp hạng riêng.
        </td></tr>
      `;
      return;
    }

    // Tải BXH ban đầu
    await loadLeaderboard();

  } catch (err) {
    console.error('Lỗi khởi tạo BXH:', err);
    showAlert('Lỗi: ' + (err.message || err));
  }

  // 2. Chuyển đổi 4 Tabs Thời gian
  const periodBtns = document.querySelectorAll('.admin-subnav-btn[data-period]');
  periodBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      periodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPeriod = btn.getAttribute('data-period');
      await loadLeaderboard();
    });
  });

  // 3. Tải và Render Bảng Xếp Hạng
  async function loadLeaderboard() {
    try {
      leaderboardTableBody.innerHTML = `
        <tr><td colspan="5" style="text-align: center; padding: 32px; color: var(--text-muted);">
          Đang tải bảng xếp hạng...
        </td></tr>
      `;

      leaderboardData = await window.Student.getClassLeaderboard(classId, currentPeriod);

      if (!leaderboardData || leaderboardData.length === 0) {
        podiumSection.style.display = 'none';
        myRankBanner.style.display = 'none';
        leaderboardTableBody.innerHTML = `
          <tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">
            Lớp chưa có hoạt động học tập nào trong kỳ này. Hãy là người đầu tiên bứt phá điểm số!
          </td></tr>
        `;
        return;
      }

      // Render Top 3 Podium
      renderPodium(leaderboardData);

      // Render vị trí cá nhân
      renderMyPosition(leaderboardData);

      // Render bảng danh sách lớp
      leaderboardTableBody.innerHTML = leaderboardData.map((st, idx) => {
        const isMe = (st.student_id === authData.user.id);
        const rowStyle = isMe ? 'background: var(--primary-light); font-weight: 700;' : '';

        let rankBadge = `<span style="font-weight: 800; color: var(--text-muted);">#${st.rank}</span>`;
        if (Number(st.rank) === 1) rankBadge = '<span style="font-size: 18px;">🥇</span>';
        else if (Number(st.rank) === 2) rankBadge = '<span style="font-size: 18px;">🥈</span>';
        else if (Number(st.rank) === 3) rankBadge = '<span style="font-size: 18px;">🥉</span>';

        return `
          <tr style="${rowStyle} cursor: pointer;" class="lb-row" data-idx="${idx}">
            <td style="text-align: center;">${rankBadge}</td>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 30px; height: 30px; border-radius: var(--radius-full); background: var(--primary-light); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800;">
                  ${st.display_name ? st.display_name.charAt(0).toUpperCase() : '学'}
                </span>
                <div>
                  <span style="color: ${isMe ? 'var(--primary)' : 'var(--text-main)'};">
                    ${st.display_name} ${isMe ? '<strong>(Bạn)</strong>' : ''}
                  </span>
                  <div style="font-size: 11px; color: var(--text-muted);">@${st.username}</div>
                </div>
              </div>
            </td>
            <td><strong style="color: #ca8a04;">${(st.period_xp || 0).toLocaleString()} XP</strong></td>
            <td>${st.words_learned || 0} từ</td>
            <td>🔥 ${st.current_streak || 0} ngày</td>
          </tr>
        `;
      }).join('');

      // Gắn sự kiện click vào từng dòng để mở Modal hồ sơ công khai
      document.querySelectorAll('.lb-row').forEach(row => {
        row.addEventListener('click', () => {
          const idx = parseInt(row.getAttribute('data-idx'), 10);
          const student = leaderboardData[idx];
          if (student) openPublicProfileModal(student);
        });
      });

    } catch (err) {
      console.error('Lỗi tải BXH:', err);
      leaderboardTableBody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center;">Lỗi tải bảng xếp hạng: ${err.message}</td></tr>`;
    }
  }

  // 4. Render Bục Podium Top 3
  function renderPodium(list) {
    if (list.length === 0) {
      podiumSection.style.display = 'none';
      return;
    }
    podiumSection.style.display = 'flex';

    const p1 = list[0] || null;
    const p2 = list[1] || null;
    const p3 = list[2] || null;

    if (p1) {
      document.getElementById('podium-rank-1').style.visibility = 'visible';
      document.getElementById('podium-name-1').textContent = p1.display_name;
      document.getElementById('podium-xp-1').textContent = `${(p1.period_xp || 0).toLocaleString()} XP`;
      document.getElementById('podium-words-1').textContent = `${p1.words_learned || 0} từ · 🔥 ${p1.current_streak || 0}d`;
      document.getElementById('podium-avatar-1').textContent = p1.display_name.charAt(0).toUpperCase();
    } else {
      document.getElementById('podium-rank-1').style.visibility = 'hidden';
    }

    if (p2) {
      document.getElementById('podium-rank-2').style.visibility = 'visible';
      document.getElementById('podium-name-2').textContent = p2.display_name;
      document.getElementById('podium-xp-2').textContent = `${(p2.period_xp || 0).toLocaleString()} XP`;
      document.getElementById('podium-words-2').textContent = `${p2.words_learned || 0} từ · 🔥 ${p2.current_streak || 0}d`;
      document.getElementById('podium-avatar-2').textContent = p2.display_name.charAt(0).toUpperCase();
    } else {
      document.getElementById('podium-rank-2').style.visibility = 'hidden';
    }

    if (p3) {
      document.getElementById('podium-rank-3').style.visibility = 'visible';
      document.getElementById('podium-name-3').textContent = p3.display_name;
      document.getElementById('podium-xp-3').textContent = `${(p3.period_xp || 0).toLocaleString()} XP`;
      document.getElementById('podium-words-3').textContent = `${p3.words_learned || 0} từ · 🔥 ${p3.current_streak || 0}d`;
      document.getElementById('podium-avatar-3').textContent = p3.display_name.charAt(0).toUpperCase();
    } else {
      document.getElementById('podium-rank-3').style.visibility = 'hidden';
    }
  }

  // 5. Render Vị trí của Bạn
  function renderMyPosition(list) {
    const myEntry = list.find(s => s.student_id === authData.user.id);
    if (!myEntry) {
      myRankBanner.style.display = 'none';
      return;
    }

    myRankBanner.style.display = 'flex';
    myRankText.textContent = `Hạng ${myEntry.rank} / ${list.length} học sinh`;
    myXpText.textContent = `· ${(myEntry.period_xp || 0).toLocaleString()} XP trong kỳ`;
  }

  // 6. Modal Hồ sơ Công khai
  function openPublicProfileModal(student) {
    popAvatar.textContent = student.display_name ? student.display_name.charAt(0).toUpperCase() : '学';
    popName.textContent = student.display_name;
    popUsername.textContent = `@${student.username}`;
    popRank.textContent = `#${student.rank}`;
    popXp.textContent = `${(student.period_xp || 0).toLocaleString()} XP`;
    popWords.textContent = `${student.words_learned || 0} từ`;
    popStreak.textContent = `🔥 ${student.current_streak || 0} ngày`;

    modalPublicProfile.classList.add('active');
  }

  document.querySelectorAll('[data-close="modal-public-profile"]').forEach(btn => {
    btn.addEventListener('click', () => modalPublicProfile.classList.remove('active'));
  });
});
