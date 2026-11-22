/**
 * MINH NGỌC HSK - QUẢN LÝ CHẾ ĐỘ SÁNG / TỐI (DARK MODE) TOÀN HỆ THỐNG
 * Đồng bộ tuyệt đối qua localStorage, sessionStorage, cookie, chống nháy sáng (zero-flicker)
 */

(function () {
  const STORAGE_KEY = 'minhngoc_theme';

  function getSystemPreference() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function getSavedTheme() {
    // 1. Thử localStorage
    try {
      const val = localStorage.getItem(STORAGE_KEY);
      if (val === 'dark' || val === 'light') return val;
    } catch (e) {}

    // 2. Thử sessionStorage
    try {
      const val = sessionStorage.getItem(STORAGE_KEY);
      if (val === 'dark' || val === 'light') return val;
    } catch (e) {}

    // 3. Thử document.cookie (phòng hờ môi trường bị chặn Web Storage)
    try {
      const match = document.cookie.match(new RegExp('(?:^|; )' + STORAGE_KEY + '=(dark|light)'));
      if (match) return match[1];
    } catch (e) {}

    return null;
  }

  function saveTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
    try { sessionStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
    try { document.cookie = STORAGE_KEY + '=' + theme + '; path=/; max-age=31536000'; } catch (e) {}
  }

  function applyTheme(theme) {
    const isDark = (theme === 'dark');
    const root = document.documentElement;

    // 1. Gắn attribute & color-scheme cho html và body
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    root.style.colorScheme = isDark ? 'dark' : 'light';
    if (document.body) {
      document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
      document.body.style.colorScheme = isDark ? 'dark' : 'light';
    }

    // 2. Đồng bộ trạng thái mọi công tắc gạt (Switch) trên trang
    const switches = document.querySelectorAll('.theme-switch, .theme-toggle-btn, #theme-toggle');
    switches.forEach(function (sw) {
      const thumb = sw.querySelector('.theme-switch-thumb');
      const sunIcon = sw.querySelector('.sun-icon');
      const moonIcon = sw.querySelector('.moon-icon');

      if (isDark) {
        sw.classList.add('is-dark');
        sw.setAttribute('title', 'Chuyển sang chế độ Sáng (☀️)');
        sw.setAttribute('aria-label', 'Chuyển sang chế độ Sáng');
        sw.style.backgroundColor = '#1e293b';
        sw.style.borderColor = '#f87171';
        if (thumb) {
          thumb.style.transform = 'translateX(28px)';
          thumb.style.backgroundColor = '#f87171';
          thumb.style.boxShadow = '0 0 10px rgba(248, 113, 113, 0.7)';
        }
        if (sunIcon) sunIcon.style.opacity = '0.35';
        if (moonIcon) moonIcon.style.opacity = '1';
      } else {
        sw.classList.remove('is-dark');
        sw.setAttribute('title', 'Chuyển sang chế độ Tối (🌙)');
        sw.setAttribute('aria-label', 'Chuyển sang chế độ Tối');
        sw.style.backgroundColor = '#f1f5f9';
        sw.style.borderColor = '#cbd5e1';
        if (thumb) {
          thumb.style.transform = 'translateX(0px)';
          thumb.style.backgroundColor = '#ffffff';
          thumb.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.3)';
        }
        if (sunIcon) sunIcon.style.opacity = '1';
        if (moonIcon) moonIcon.style.opacity = '0.35';
      }
    });
  }

  // Chống kích hoạt lặp
  let lastToggleTime = 0;

  window.toggleTheme = function (e) {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    const now = Date.now();
    if (now - lastToggleTime < 250) {
      return;
    }
    lastToggleTime = now;

    const currentTheme = document.documentElement.getAttribute('data-theme') || getSavedTheme() || getSystemPreference();
    const newTheme = (currentTheme === 'dark') ? 'light' : 'dark';

    saveTheme(newTheme);
    applyTheme(newTheme);
  };

  // 1. Áp dụng ngay khi script nạp vào <head>
  const initialTheme = getSavedTheme() || getSystemPreference();
  applyTheme(initialTheme);

  // 2. Khi DOM tải xong, đồng bộ lại công tắc gạt + tự tạo nếu thiếu
  function ensureThemeSwitch() {
    // Nếu trang đã có nút theme-switch rồi thì bỏ qua
    if (document.getElementById('theme-toggle') || document.querySelector('.theme-switch')) return;

    // Tìm vùng navbar để chèn nút
    var navUser = document.querySelector('.nav-user');
    if (!navUser) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-switch';
    btn.id = 'theme-toggle';
    btn.setAttribute('aria-label', 'Chuyển chế độ Sáng / Tối');
    btn.setAttribute('title', 'Chuyển chế độ Sáng / Tối');
    btn.style.cssText = '-webkit-appearance: none; appearance: none; display: inline-flex; align-items: center; position: relative; width: 56px; height: 28px; padding: 0; margin: 0; border: 1.5px solid var(--border-color, #cbd5e1); border-radius: 999px; background: var(--bg-subtle, #f1f5f9); cursor: pointer; outline: none; box-sizing: border-box; overflow: hidden; vertical-align: middle; flex-shrink: 0;';

    btn.innerHTML =
      '<span class="theme-switch-track" style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: space-between; padding: 0 5px; pointer-events: none;">' +
        '<span class="theme-switch-icon sun-icon" style="font-size: 13px; line-height: 1; z-index: 1;">☀️</span>' +
        '<span class="theme-switch-icon moon-icon" style="font-size: 13px; line-height: 1; z-index: 1;">🌙</span>' +
        '<span class="theme-switch-thumb" style="position: absolute; top: 2px; left: 2px; width: 21px; height: 21px; border-radius: 50%; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: transform 0.25s ease; z-index: 2;"></span>' +
      '</span>';

    // Chèn vào đầu nav-user (trước mọi phần tử khác)
    navUser.insertBefore(btn, navUser.firstChild);
  }

  function onDomReady() {
    ensureThemeSwitch();
    var cur = document.documentElement.getAttribute('data-theme') || getSavedTheme() || getSystemPreference();
    applyTheme(cur);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDomReady);
  } else {
    onDomReady();
  }

  // 3. Đồng bộ Realtime giữa các tab / cửa sổ qua storage event
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
      applyTheme(e.newValue);
    }
  });

  // 4. Lắng nghe thay đổi theme từ hệ điều hành nếu người dùng chưa chọn thủ công
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
      if (!getSavedTheme()) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  // 5. Bắt sự kiện click qua Event Delegation toàn trang
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.theme-switch, .theme-toggle-btn, #theme-toggle');
    if (btn) {
      window.toggleTheme(e);
    }
  });

  window.Theme = {
    toggle: window.toggleTheme,
    getTheme: function () {
      return document.documentElement.getAttribute('data-theme') || 'light';
    },
    setTheme: function (theme) {
      saveTheme(theme);
      applyTheme(theme);
    }
  };
})();
