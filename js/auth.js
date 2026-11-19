/**
 * MODULE XÁC THỰC VÀ PHÂN QUYỀN (AUTH & ROLES)
 * Hỗ trợ Đăng ký / Đăng nhập bằng Username thông qua email nội bộ
 */

window.Auth = (function () {
  /**
   * Chuyển đổi username sang định dạng email nội bộ
   */
  function usernameToEmail(username) {
    if (!username) return '';
    const cleanUser = username.trim().toLowerCase();
    const domain = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.usernameDomain) || 'minhngochsk.local';
    return `${cleanUser}@${domain}`;
  }

  /**
   * Chuyển email nội bộ về username
   */
  function emailToUsername(email) {
    if (!email) return '';
    return email.split('@')[0];
  }

  /**
   * Đăng ký tài khoản học sinh mới
   * @param {Object} param0 - { username, displayName, password, phone }
   */
  async function register({ username, displayName, password, phone }) {
    const db = window.getDb();
    if (!db) throw new Error('Vui lòng điền SUPABASE_CONFIG trong js/config.js');

    const cleanUser = username.trim().toLowerCase();
    const internalEmail = usernameToEmail(cleanUser);

    // 1. Gọi đăng ký auth.users
    const { data, error } = await db.auth.signUp({
      email: internalEmail,
      password: password,
      options: {
        data: {
          username: cleanUser,
          display_name: displayName.trim(),
          phone: phone ? phone.trim() : null
        }
      }
    });

    if (error) {
      if (error.message.includes('User already registered') || error.message.includes('unique constraint')) {
        throw new Error('Tên đăng nhập này đã được sử dụng. Vui lòng chọn tên khác!');
      }
      throw error;
    }

    return data;
  }

  /**
   * Đăng nhập bằng username và mật khẩu
   * @param {Object} param0 - { username, password }
   */
  async function login({ username, password }) {
    const db = window.getDb();
    if (!db) throw new Error('Vui lòng điền SUPABASE_CONFIG trong js/config.js');

    const cleanUser = username.trim().toLowerCase();
    const internalEmail = usernameToEmail(cleanUser);

    const { data, error } = await db.auth.signInWithPassword({
      email: internalEmail,
      password: password
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác!');
      }
      throw error;
    }

    // Lấy profile chi tiết
    const profile = await getProfile(data.user.id);
    return { session: data.session, user: data.user, profile };
  }

  /**
   * Lấy thông tin profile từ bảng profiles
   */
  async function getProfile(userId) {
    const db = window.getDb();
    if (!db || !userId) return null;

    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Lỗi lấy profile:', error);
      return null;
    }
    return data;
  }

  /**
   * Lấy thông tin người dùng và profile hiện tại đang đăng nhập
   */
  async function getCurrentUser() {
    const db = window.getDb();
    if (!db) return null;

    const { data: { session }, error } = await db.auth.getSession();
    if (error || !session || !session.user) return null;

    const profile = await getProfile(session.user.id);
    return {
      session,
      user: session.user,
      profile
    };
  }

  /**
   * Đăng xuất khỏi hệ thống
   */
  async function logout() {
    const db = window.getDb();
    if (db) {
      await db.auth.signOut();
    }
    // Chuyển hướng về trang chủ đăng nhập
    const isInsideAdmin = window.location.pathname.includes('/admin/');
    window.location.href = isInsideAdmin ? '../index.html' : 'index.html';
  }

  /**
   * Kiểm tra phiên đăng nhập và bảo vệ trang theo Quyền (Role Guard)
   * @param {Array<string>} allowedRoles - Ví dụ: ['student'] hoặc ['admin', 'teacher']
   * @param {string} redirectOnFail - Đường dẫn chuyển hướng khi không có quyền
   */
  async function requireAuth(allowedRoles = [], redirectOnFail = null) {
    if (!window.isSupabaseConfigured()) {
      window.checkAndShowConfigNotice();
      return null;
    }

    const current = await getCurrentUser();
    const isInsideAdmin = window.location.pathname.includes('/admin/');
    const loginUrl = isInsideAdmin ? '../index.html' : 'index.html';

    // Chưa đăng nhập -> đá về trang đăng nhập
    if (!current || !current.user) {
      window.location.href = redirectOnFail || loginUrl;
      return null;
    }

    // Kiểm tra quyền (nếu có yêu cầu quyền cụ thể)
    if (allowedRoles.length > 0 && current.profile) {
      const userRole = current.profile.role;
      if (!allowedRoles.includes(userRole)) {
        console.warn(`Tài khoản role '${userRole}' không có quyền truy cập trang này`);
        // Chuyển về đúng trang tương ứng với quyền của tài khoản
        if (userRole === 'admin' || userRole === 'teacher') {
          window.location.href = isInsideAdmin ? 'classes.html' : 'admin/classes.html';
        } else {
          window.location.href = isInsideAdmin ? '../dashboard.html' : 'dashboard.html';
        }
        return null;
      }
    }

    return current;
  }

  /**
   * Cập nhật thông tin người dùng lên thanh Navbar nếu có
   */
  function renderNavbarUserInfo(profile) {
    if (!profile) return;

    const nameElements = document.querySelectorAll('.user-display-name');
    nameElements.forEach(el => { el.textContent = profile.display_name || profile.username; });

    const roleBadges = document.querySelectorAll('.user-role-badge');
    roleBadges.forEach(el => {
      let roleText = 'Học sinh';
      let roleClass = 'role-student';
      if (profile.role === 'admin') {
        roleText = 'Quản trị viên';
        roleClass = 'role-admin';
      } else if (profile.role === 'teacher') {
        roleText = 'Giáo viên';
        roleClass = 'role-teacher';
      }
      el.textContent = roleText;
      el.className = `user-role-badge ${roleClass}`;
    });

    const logoutButtons = document.querySelectorAll('.btn-logout');
    logoutButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        btn.disabled = true;
        btn.textContent = 'Đang đăng xuất...';
        await logout();
      });
    });

    // Nếu người dùng là admin hoặc teacher, bổ sung nút chuyển đổi giữa trang Quản trị và Học sinh
    const navUserContainer = document.querySelector('.nav-user');
    const isInsideAdmin = window.location.pathname.includes('/admin/');
    if (navUserContainer && (profile.role === 'admin' || profile.role === 'teacher')) {
      if (!document.getElementById('nav-toggle-portal-btn')) {
        const toggleBtn = document.createElement('a');
        toggleBtn.id = 'nav-toggle-portal-btn';
        toggleBtn.className = 'btn btn-sm btn-primary';
        toggleBtn.style.height = '36px';
        toggleBtn.style.padding = '0 12px';
        toggleBtn.style.fontSize = '13px';
        toggleBtn.style.display = 'inline-flex';
        toggleBtn.style.alignItems = 'center';
        toggleBtn.style.gap = '4px';

        if (isInsideAdmin) {
          toggleBtn.href = '../dashboard.html';
          toggleBtn.innerHTML = '🎓 Giao diện học sinh';
        } else {
          toggleBtn.href = 'admin/classes.html';
          toggleBtn.innerHTML = '👑 Trang Quản trị';
        }

        const logoutBtn = navUserContainer.querySelector('.btn-logout');
        if (logoutBtn) {
          navUserContainer.insertBefore(toggleBtn, logoutBtn);
        } else {
          navUserContainer.appendChild(toggleBtn);
        }
      }
    }
  }

  return {
    usernameToEmail,
    emailToUsername,
    register,
    login,
    logout,
    getProfile,
    getCurrentUser,
    requireAuth,
    renderNavbarUserInfo
  };
})();
