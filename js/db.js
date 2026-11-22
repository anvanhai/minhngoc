/**
 * MODULE KẾT NỐI DATABASE SUPABASE (Vanilla JS)
 * Khởi tạo client Supabase từ config.js và quản lý các thao tác cơ bản
 */

(function () {
  let supabaseInstance = null;

  /**
   * Lấy instance Supabase client
   */
  window.getDb = function () {
    if (supabaseInstance) return supabaseInstance;

    if (!window.isSupabaseConfigured()) {
      console.warn('Supabase chưa được cấu hình trong js/config.js');
      return null;
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.error('Thư viện @supabase/supabase-js chưa được nạp qua CDN!');
      return null;
    }

    supabaseInstance = window.supabase.createClient(
      window.SUPABASE_CONFIG.url.trim(),
      window.SUPABASE_CONFIG.anonKey.trim(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    return supabaseInstance;
  };

  /**
   * Hiển thị banner cảnh báo nếu cấu hình Supabase bị thiếu
   */
  window.checkAndShowConfigNotice = function () {
    if (window.isSupabaseConfigured()) return true;

    let banner = document.getElementById('config-warning-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'config-warning-banner';
      banner.className = 'notice-banner warning';
      banner.innerHTML = `
        <div class="notice-content">
          <strong>⚠️ Chưa điền cấu hình Supabase:</strong>
          Vui lòng mở file <code>js/config.js</code> và dán <code>url</code> cùng <code>anonKey</code> để hệ thống hoạt động.
        </div>
      `;
      document.body.prepend(banner);
    }
    return false;
  };

  // Tự động kiểm tra banner khi DOM đã sẵn sàng
  document.addEventListener('DOMContentLoaded', function () {
    window.checkAndShowConfigNotice();
  });

  /**
   * Gọi RPC admin_reset_password để đặt lại mật khẩu cho tài khoản người dùng
   * @param {string} targetUserId - UUID của tài khoản người dùng
   * @param {string} newPassword - Mật khẩu mới (tối thiểu 6 ký tự)
   * @returns {Promise<Object>} Kết quả trả về từ database RPC
   */
  window.adminResetPasswordDb = async function (targetUserId, newPassword) {
    const db = window.getDb();
    if (!db) throw new Error('Database chưa kết nối. Vui lòng kiểm tra cấu hình trong js/config.js');
    if (!targetUserId) throw new Error('Thiếu ID người dùng cần đặt lại mật khẩu');
    if (!newPassword || newPassword.length < 6) throw new Error('Mật khẩu mới phải có tối thiểu 6 ký tự');

    const { data, error } = await db.rpc('admin_reset_password', {
      target_user_id: targetUserId,
      new_password: newPassword
    });

    if (error) {
      console.error('Lỗi gọi RPC admin_reset_password:', error);
      throw new Error(error.message || 'Không thể đặt lại mật khẩu');
    }

    return data;
  };
})();
