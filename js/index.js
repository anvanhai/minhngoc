/**
 * LOGIC TRANG ĐĂNG NHẬP / ĐĂNG KÝ (index.html)
 */

document.addEventListener('DOMContentLoaded', async function () {
  const tabBtnLogin = document.getElementById('tab-btn-login');
  const tabBtnRegister = document.getElementById('tab-btn-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const authAlert = document.getElementById('auth-alert');

  const btnSubmitLogin = document.getElementById('btn-submit-login');
  const btnSubmitRegister = document.getElementById('btn-submit-register');

  /**
   * Hiển thị thông báo alert
   */
  function showAlert(message, type = 'danger') {
    authAlert.className = `alert alert-${type} show`;
    authAlert.textContent = message;
  }

  function hideAlert() {
    authAlert.className = 'alert';
    authAlert.textContent = '';
  }

  // 1. Chuyển đổi Tab Đăng nhập / Đăng ký
  tabBtnLogin.addEventListener('click', function () {
    tabBtnLogin.classList.add('active');
    tabBtnRegister.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    hideAlert();
  });

  tabBtnRegister.addEventListener('click', function () {
    tabBtnRegister.classList.add('active');
    tabBtnLogin.classList.remove('active');
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
    hideAlert();
  });

  // 2. Kiểm tra nếu đã đăng nhập từ trước -> Tự động chuyển hướng
  try {
    const current = await window.Auth.getCurrentUser();
    if (current && current.profile) {
      if (current.profile.role === 'admin' || current.profile.role === 'teacher') {
        window.location.href = 'admin/classes.html';
      } else {
        window.location.href = 'dashboard.html';
      }
      return;
    }
  } catch (err) {
    console.warn('Chưa có phiên đăng nhập:', err);
  }

  // 3. Xử lý FORM ĐĂNG NHẬP
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideAlert();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
      showAlert('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }

    try {
      btnSubmitLogin.disabled = true;
      btnSubmitLogin.textContent = 'Đang đăng nhập...';

      const result = await window.Auth.login({ username, password });

      showAlert('Đăng nhập thành công! Đang chuyển hướng...', 'success');

      setTimeout(() => {
        if (result.profile && (result.profile.role === 'admin' || result.profile.role === 'teacher')) {
          window.location.href = 'admin/classes.html';
        } else {
          window.location.href = 'dashboard.html';
        }
      }, 600);

    } catch (err) {
      showAlert(err.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại!');
    } finally {
      btnSubmitLogin.disabled = false;
      btnSubmitLogin.textContent = 'Đăng nhập vào lớp';
    }
  });

  // 4. Xử lý FORM ĐĂNG KÝ
  registerForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideAlert();

    const username = document.getElementById('reg-username').value.trim().toLowerCase();
    const displayName = document.getElementById('reg-display-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    const passwordConfirm = document.getElementById('reg-password-confirm').value;

    // Kiểm tra định dạng username: 3-20 ký tự, chữ cái, số, gạch dưới
    const usernameRegex = /^[a-z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      showAlert('Tên đăng nhập không hợp lệ! Vui lòng chỉ dùng 3–20 ký tự chữ cái không dấu, số hoặc gạch dưới (ví dụ: minhanh, duc_99).');
      return;
    }

    if (!displayName) {
      showAlert('Vui lòng nhập họ và tên của bạn.');
      return;
    }

    if (password.length < 6) {
      showAlert('Mật khẩu phải có tối thiểu 6 ký tự.');
      return;
    }

    if (password !== passwordConfirm) {
      showAlert('Mật khẩu nhập lại không khớp!');
      return;
    }

    try {
      btnSubmitRegister.disabled = true;
      btnSubmitRegister.textContent = 'Đang khởi tạo tài khoản...';

      await window.Auth.register({
        username,
        displayName,
        password,
        phone
      });

      showAlert('Tạo tài khoản thành công! Đang đăng nhập...', 'success');

      // Tự động đăng nhập luôn sau khi đăng ký
      setTimeout(async () => {
        try {
          await window.Auth.login({ username, password });
          window.location.href = 'dashboard.html';
        } catch (loginErr) {
          showAlert('Đăng ký thành công! Bạn hãy chuyển sang tab Đăng nhập để vào lớp.', 'success');
          tabBtnLogin.click();
        }
      }, 700);

    } catch (err) {
      showAlert(err.message || 'Đăng ký không thành công. Vui lòng thử lại!');
    } finally {
      btnSubmitRegister.disabled = false;
      btnSubmitRegister.textContent = 'Tạo tài khoản học sinh';
    }
  });
});
