/**
 * CẤU HÌNH HỆ THỐNG MINH NGỌC HSK
 * Bạn hãy điền thông tin Project URL và Anon Public Key từ Supabase Dashboard vào đây.
 * Đường dẫn lấy trong Supabase: Project Settings -> API
 */
window.SUPABASE_CONFIG = {
  // 1. Điền Project URL (ví dụ: https://xyzcompany.supabase.co)
  url: 'https://yijggoiahospzstcortx.supabase.co',

  // 2. Điền anon public key (chuỗi ký tự dài bắt đầu bằng eyJhbGciOi...)
  // TUYỆT ĐỐI KHÔNG DÙNG service_role key ở đây!
  anonKey: 'sb_publishable_S-uNGpBBZLC9NL1VT6qZ7A_FDLM0Cor',

  // Domain ảo dùng để ánh xạ username thành email nội bộ
  usernameDomain: 'minhngochsk.local'
};

/**
 * Kiểm tra xem người dùng đã cấu hình Supabase hay chưa
 */
window.isSupabaseConfigured = function () {
  return (
    window.SUPABASE_CONFIG &&
    window.SUPABASE_CONFIG.url &&
    window.SUPABASE_CONFIG.url.trim().length > 0 &&
    window.SUPABASE_CONFIG.anonKey &&
    window.SUPABASE_CONFIG.anonKey.trim().length > 0 &&
    !window.SUPABASE_CONFIG.url.includes('YOUR_PROJECT_URL')
  );
};
