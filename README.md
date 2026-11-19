# 🎓 Nền tảng Quản lý Đào tạo & Học Tiếng Trung — Minh Ngọc HSK

Hệ thống quản lý đào tạo, phân phối giáo trình và học tập tiếng Trung HSK thông minh dành cho trung tâm và giáo viên, hoạt động trên kiến trúc 4 tầng: **Lớp học ➔ Giáo trình ➔ Bài học ➔ Hoạt động & Bảng xếp hạng riêng từng lớp**.

Dự án được xây dựng hoàn toàn bằng **HTML5, CSS3, JavaScript thuần (Vanilla JS)** và **Supabase (PostgreSQL, Auth, RLS)**, không sử dụng framework nặng (Next.js, React), không cần bước build, tải trang siêu tốc và tối ưu hóa 100% trải nghiệm trên điện thoại di động.

---

## 🌟 Tính Năng Cốt Lõi

1. **Kiến trúc Lớp học độc lập (Class Isolation)**:
   - Giáo viên quản lý nhiều lớp học cùng lúc (HSK1-A, HSK1-B, HSK2-A...).
   - Mỗi lớp có tiến độ bài học riêng, danh sách học sinh riêng và bài tập riêng.
   - Học sinh đăng nhập chỉ nhìn thấy lớp của mình.
2. **Bảng xếp hạng công bằng theo lớp (Leaderboard)**:
   - Đua top riêng giữa các thành viên trong cùng một lớp.
   - 4 tab chu kỳ: *Hôm nay*, *Tuần này* (mặc định), *Tháng này*, *Tổng kỳ*.
   - Bục vinh danh Top 3 Podium (🥇 Cúp vàng, 🥈 Bạc, 🥉 Đồng).
3. **Quy trình Chuyển cấp HSK2 thông minh**:
   - Học sinh chỉ dùng **duy nhất 1 tài khoản** xuyên suốt lộ trình (HSK1 ➔ HSK2 ➔ HSK3).
   - Bảo lưu toàn bộ tài khoản, XP trọn đời, chuỗi Streak và lịch sử các khóa học cũ.
   - Khi lên lớp mới, điểm đua top được tính lại từ đầu để công bằng với học sinh mới.
4. **Phòng học bài tương tác đa năng (Lesson Studio)**:
   - **Học từ mới**: Hán tự to rõ, Pinyin, nghĩa tiếng Việt, câu ví dụ, phát âm giọng chuẩn Bắc Kinh `zh-CN` (Web Speech API) và mô phỏng thứ tự nét viết động (HanziWriter).
   - **Flashcard SRS**: Thẻ lật 3D tương tác với 3 nút đánh giá lặp lại ngắt quãng (🔴 Quên, 🟡 Tạm nhớ, 🟢 Đã thuộc).
   - **Quiz cuối bài**: Trắc nghiệm 4 đáp án thông minh (yêu cầu đạt >= 80% để pass bài và nhận thưởng XP).
5. **Cơ chế mở bài linh hoạt**:
   - Chế độ mở tuần tự (xong bài trước mới mở bài sau).
   - Chế độ mở toàn bộ giáo trình.
   - Giáo viên có nút **Mở khóa thủ công** từng bài cho cả lớp ôn tập trước.
6. **Kho Từ vựng tập trung & Nhập Excel / CSV**:
   - Tra cứu từ vựng theo chữ Hán, Pinyin, nghĩa tiếng Việt, lọc theo cấp độ HSK 1–6.
   - Kéo & thả file Excel (`.xlsx`, `.xls`, `.csv`) để nhập hàng trăm từ vào kho hoặc gán thẳng vào bài học bằng thư viện SheetJS.
7. **Giao bài tập theo lớp (Assignments)**:
   - Giáo viên giao nhiệm vụ kèm hạn chót (Deadline) và thưởng XP.
   - Học sinh theo dõi đếm ngược hạn chót ngay trên Dashboard cá nhân.

---

## 📁 Cấu Trúc Thư Mục

```text
my-web/
├── index.html                   # Trang Đăng nhập & Đăng ký bằng Username
├── dashboard.html               # Bàn học cá nhân hóa của Học sinh
├── curriculum.html              # Bản đồ lộ trình bài học (Roadmap)
├── lesson.html                  # Phòng học bài (Từ mới, Flashcard SRS, Quiz)
├── leaderboard.html             # Bảng xếp hạng riêng của lớp (Podium Top 3)
│
├── admin/                       # Khu vực Quản trị dành cho Giáo viên / Admin
│   ├── classes.html             # Quản lý danh sách các Lớp học & Tạo lớp
│   ├── class-detail.html        # Chi tiết lớp: Học sinh, Tiến độ, Mở bài, Bài tập
│   ├── curriculums.html         # Quản lý Giáo trình & Danh sách bài học
│   └── vocabularies.html        # Kho từ vựng & Nhập Excel/CSV kéo thả
│
├── css/
│   └── style.css                # CSS dùng chung toàn hệ thống, tối ưu mobile
│
├── js/
│   ├── config.js                # Cấu hình Supabase (URL & Anon Key)
│   ├── config.example.js        # Mẫu file cấu hình tham khảo
│   ├── db.js                    # Khởi tạo kết nối Supabase client
│   ├── auth.js                  # Module đăng nhập, đăng ký username, phân quyền RLS
│   ├── xp.js                    # Module XP, Streak & Phát âm tiếng Trung (zh-CN)
│   ├── student.js               # Module API dành riêng cho Học sinh
│   ├── admin.js                 # Module API dành riêng cho Quản trị viên
│   ├── index.js                 # Logic trang index.html
│   ├── dashboard.js             # Logic trang dashboard.html
│   ├── curriculum.js            # Logic trang curriculum.html
│   ├── lesson.js                # Logic trang lesson.html
│   ├── leaderboard.js           # Logic trang leaderboard.html
│   ├── admin-classes.js         # Logic trang admin/classes.html
│   ├── admin-class-detail.js    # Logic trang admin/class-detail.html
│   ├── admin-curriculums.js     # Logic trang admin/curriculums.html
│   └── admin-vocabularies.js    # Logic trang admin/vocabularies.html
│
├── supabase/                    # Các file SQL Migration chạy trên Supabase
│   ├── 01_profiles_and_roles.sql         # Hồ sơ người dùng, phân quyền RLS
│   ├── 02_curriculum_and_classes.sql     # Giáo trình, bài học, kho từ, lớp học
│   ├── 03_student_progress.sql           # Tiến độ bài học, Spaced Repetition SRS
│   ├── 04_quiz_assignments_and_xp.sql    # Quiz cuối bài, bài tập, mở bài thủ công
│   └── 05_leaderboard_and_promotion.sql  # Bảng xếp hạng lớp, streak, chuyển cấp HSK2
│
├── docs/
│   └── minhngoc_hsk_system_design_and_ui_mockups.md  # Tài liệu thiết kế kiến trúc gốc
├── .gitignore                   # Cấu hình bỏ qua file nhạy cảm khi dùng Git
└── README.md                    # Hướng dẫn cài đặt & Triển khai
```

---

## 🚀 Hướng Dẫn Cài Đặt Từ Đầu

### Bước 1: Khởi tạo Project Supabase
1. Truy cập [https://supabase.com](https://supabase.com) và tạo một Project mới (miễn phí).
2. Vào mục **SQL Editor** ở thanh bên trái.
3. Chạy lần lượt 5 file SQL trong thư mục `supabase/` theo đúng thứ tự:
   - `01_profiles_and_roles.sql`
   - `02_curriculum_and_classes.sql`
   - `03_student_progress.sql`
   - `04_quiz_assignments_and_xp.sql`
   - `05_leaderboard_and_promotion.sql`
4. Vào mục **Authentication ➔ Providers ➔ Email ➔ Gạt TẮT nút "Confirm email"** (để học sinh đăng ký xong là vào học được ngay mà không cần xác nhận hòm thư).

### Bước 2: Điền cấu hình API
1. Vào Supabase Dashboard ➔ **Project Settings ➔ API**.
2. Sao chép `Project URL` và `anon public key` (chuỗi dài bắt đầu bằng `eyJhbGciOi...`).
3. Mở file `js/config.js` trong thư mục dự án và dán vào:
   ```javascript
   window.SUPABASE_CONFIG = {
     url: 'https://xyzcompany.supabase.co',
     anonKey: 'eyJhbGciOi...',
     usernameDomain: 'minhngochsk.local'
   };
   ```

### Bước 3: Tạo tài khoản Admin đầu tiên
1. Mở file `index.html` trên trình duyệt và đăng ký tài khoản đầu tiên (ví dụ với username: `admin`, họ tên: `Quản trị viên Minh Ngọc`, mật khẩu: `123456`).
2. Mở lại **Supabase Dashboard ➔ SQL Editor** và chạy câu lệnh SQL sau để nâng quyền tài khoản đó lên Quản trị viên cao nhất:
   ```sql
   update public.profiles
   set role = 'admin'
   where username = 'admin';
   ```
3. Đăng nhập lại với tài khoản `admin`, hệ thống sẽ tự động chuyển bạn vào Trung tâm Quản trị (`admin/classes.html`)!

---

## 💻 Cách Chạy Trên Máy Tính (Local)

Vì dự án là mã nguồn web thuần, bạn có thể chạy bằng bất kỳ công cụ nào dưới đây:

### Cách 1: Dùng VS Code Extension (Dễ nhất)
- Cài tiện ích **Live Server** trên Visual Studio Code.
- Chuột phải vào file `index.html` ➔ Chọn **Open with Live Server**.

### Cách 2: Dùng Python
Mở Terminal / PowerShell tại thư mục `my-web/` và chạy:
```bash
python -m http.server 8000
```
Truy cập: `http://localhost:8000`

### Cách 3: Dùng Node.js
```bash
npx serve .
```

---

## 🌐 Hướng Dẫn Triển Khai (Deploy Lên Web)

### 1. Triển khai lên Vercel / Netlify / Cloudflare Pages (Khuyên dùng)
- Đẩy mã nguồn lên kho lưu trữ GitHub của bạn.
- Đăng nhập vào Vercel (hoặc Netlify), nhấn **Add New Project** ➔ Chọn repo `my-web`.
- Ở phần **Build Command** và **Output Directory**: Để trống (vì là static site).
- Nhấn **Deploy**. Chỉ mất 5 giây là trang web của bạn đã online với tên miền miễn phí dạng `ten-trung-tam.vercel.app`.

### 2. Triển khai lên GitHub Pages (100% Miễn phí)
- Vào kho lưu trữ trên GitHub ➔ Chọn **Settings ➔ Pages**.
- Mục **Branch**: Chọn `main`, thư mục `/root` ➔ Nhấn **Save**.
- Trang web sẽ online tại: `https://<ten-user>.github.io/<ten-repo>/`.

### 3. Tự Host trên máy chủ NAS cá nhân (Synology / QNAP / Docker Nginx)
- **Synology NAS**: Cài đặt ứng dụng **Web Station** ➔ Tạo máy chủ Web tĩnh trỏ thư mục gốc vào `my-web/`.
- **Docker Nginx**: Đặt file vào thư mục `/usr/share/nginx/html`.
- **Database Postgres**: Toàn bộ các file trong `supabase/` được viết bằng **chuẩn Postgres SQL** (PostgreSQL 14+), do đó bạn hoàn toàn có thể chạy trực tiếp trên cơ sở dữ liệu PostgreSQL tự host trên NAS hoặc VPS cá nhân mà không bị phụ thuộc vào bất kỳ dịch vụ độc quyền nào.

---

## 🔒 Quy Định Bảo Mật

- Anon key là public key của Supabase được thiết kế nằm an toàn ở trình duyệt. Lớp bảo vệ duy nhất và tuyệt đối là **Row Level Security (RLS)** trên từng bảng database.
- Học sinh tuyệt đối không thể tự nâng role, không thể tự sửa XP, không thể gian lận bảng xếp hạng. Mọi thao tác tính điểm đều chạy qua các hàm SQL an toàn (`security definer`) ở phía máy chủ.
- Tuyệt đối không đưa `service_role` key vào mã nguồn client.
