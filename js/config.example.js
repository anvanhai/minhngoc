/**
 * MẪU CẤU HÌNH SUPABASE MINH NGỌC HSK (config.example.js)
 * Hãy sao chép file này thành js/config.js và điền thông tin từ Supabase Dashboard:
 * Đường dẫn: Project Settings -> API
 */
window.SUPABASE_CONFIG = {
  // 1. Project URL (ví dụ: https://xyzcompany.supabase.co)
  url: 'YOUR_SUPABASE_PROJECT_URL',

  // 2. Anon Public Key (bắt đầu bằng eyJhbGciOi...)
  // TUYỆT ĐỐI KHÔNG DÙNG service_role key ở đây!
  anonKey: 'YOUR_SUPABASE_ANON_KEY',

  // Domain ảo dùng để ánh xạ username thành email nội bộ
  usernameDomain: 'minhngochsk.local'
};

window.isSupabaseConfigured = function () {
  return (
    window.SUPABASE_CONFIG &&
    window.SUPABASE_CONFIG.url &&
    window.SUPABASE_CONFIG.url.trim().length > 0 &&
    window.SUPABASE_CONFIG.anonKey &&
    window.SUPABASE_CONFIG.anonKey.trim().length > 0 &&
    !window.SUPABASE_CONFIG.url.includes('YOUR_SUPABASE_PROJECT_URL')
  );
};
