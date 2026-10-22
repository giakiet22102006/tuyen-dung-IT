# VN.ITJobs - Nền Tảng Tuyển Dụng IT & Cổng Quản Trị Chuyên Biệt

[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![TailwindCSS v4](https://img.shields.io/badge/TailwindCSS-v4.3-blue.svg)](https://tailwindcss.com/)
[![MongoDB & Mongoose](https://img.shields.io/badge/Mongoose-8.13-brightgreen.svg)](https://mongoosejs.com/)
[![Test Coverage](https://img.shields.io/badge/Tests-58%20Passed%20(100%25)-success.svg)]()

**VN.ITJobs** là ứng dụng web tuyển dụng công nghệ thông tin toàn diện và bảo mật cao, được xây dựng theo kiến trúc **Server-Side Rendering (SSR)** với **Express.js**, **Pug Template Engine**, **Tailwind CSS v4** và **MongoDB/Mongoose**. Hệ thống tích hợp đầy đủ phân hệ Công khai, cổng thông tin Ứng viên, cổng Nhà tuyển dụng và cổng Quản trị Admin chuyên biệt.

Dự án tuân thủ nghiêm ngặt nguyên tắc **Zero Redesign**: giữ nguyên $100\%$ bố cục, cây cấu trúc DOM, lớp CSS và phong cách thẩm mỹ của bộ template gốc.

---

## 1. Công Nghệ Sử Dụng (Tech Stack)

- **Backend Runtime:** Node.js (CommonJS, tương thích Node 18, 20, 22, 24).
- **Web Framework:** Express.js 4.x (SSR, Router đa tầng, Middleware kiến trúc sạch).
- **Template Engine:** Pug (Jade) kết hợp hệ thống Mixins tái sử dụng.
- **Styling:** Tailwind CSS v4 CLI (Biên dịch tối ưu hóa `--minify`, phông chữ Google Fonts `Lexend`).
- **Database & ODM:** MongoDB với Mongoose 8.x (Compound Indexes, Multikey Indexes, TTL Indexes).
- **Bộ nhớ đệm (Caching):** In-Memory `node-cache` (TTL 300s cho danh mục, thành phố, kỹ năng).
- **Xác thực & Bảo mật:**
  - JWT qua cookie `HttpOnly` độc lập (`itj_token` cho người dùng, `itj_admin_token` cho Quản trị viên).
  - Cơ chế **TokenVersion** thu hồi phiên tức thời khi đổi mật khẩu hoặc bị khóa.
  - Chống tấn công CSRF bằng thư viện hiện đại `csrf-csrf` (Double Submit Cookie).
  - Bảo vệ HTTP Headers qua `helmet`, chống crawl trang admin bằng `X-Robots-Tag: noindex, nofollow`.
  - Giới hạn tần suất request (`express-rate-limit`) chống brute-force đăng nhập.
  - Khử độc dữ liệu HTML (`sanitize-html`) chống tấn công XSS trong bài đăng tuyển dụng.
- **Xử lý Tệp & Lưu trữ:**
  - `multer` (bộ nhớ RAM `memoryStorage`) kết hợp `file-type` kiểm tra magic bytes thực tế.
  - `sharp` tự động nén và chuẩn hóa ảnh Logo / Avatar / Việc làm sang định dạng **WebP**.
  - File CV của ứng viên được lưu trữ tại thư mục riêng tư bảo mật `storage/private/cv/`, chỉ phục vụ qua route stream có xác thực quyền sở hữu.
- **Kiểm thử Tự động:** Jest + Supertest (Bao phủ $100\%$ các luồng nghiệp vụ với 58/58 test cases).
- **Môi trường cơ sở dữ liệu:** Tự động fallback sang `mongodb-memory-server` nếu chưa cài đặt hoặc chưa khởi động dịch vụ MongoDB cục bộ.

---

## 2. Cấu Trúc Thư Mục Dự Án

```text
vn-itjobs/
├── public/
│   ├── assets/
│   │   ├── css/tailwind.css        # File CSS compiled từ Tailwind v4 CLI
│   │   ├── images/                 # Ảnh nền, icon, demo tĩnh
│   │   └── js/main.js              # JavaScript điều hướng phân trang
│   └── uploads/                    # Thư mục lưu trữ ảnh công khai (WebP)
│       ├── avatars/                # Avatar ứng viên
│       ├── logos/                  # Logo công ty
│       └── jobs/                   # Ảnh bài đăng tuyển dụng
├── storage/
│   └── private/
│       └── cv/                     # Thư mục lưu trữ file PDF CV bảo mật (ngoài tầm web)
├── src/
│   ├── app.js                      # Cấu hình Express app & middlewares
│   ├── server.js                   # Điểm khởi động HTTP Server
│   ├── config/                     # Cấu hình ENV, Database, Hằng số Enum
│   ├── controllers/
│   │   ├── client/                 # Controllers trang chủ, tìm kiếm, công ty, chi tiết job
│   │   ├── candidate/              # Controllers Auth, Profile, Ứng tuyển của Ứng viên
│   │   ├── employer/               # Controllers Auth, Công ty, Việc làm, Quản lý CV
│   │   └── admin/                  # Controllers Quản trị Admin, Dashboard, Khóa/Duyệt, Logs
│   ├── middlewares/                # Auth, CSRF, Upload, RateLimit, Locals, Flash
│   ├── models/                     # Mongoose Models & Index Definitions
│   ├── routes/                     # Định tuyến Express (client, candidate, employer, admin)
│   ├── services/                   # Business logic (Auth, Job, Menu, Storage, Audit)
│   ├── styles/input.css            # File nguồn Tailwind CSS v4
│   ├── utils/                      # Helpers: slugify, normalizeVi, formatSalary, pagination
│   └── scripts/                    # Scripts: seed.js, create-admin.js, benchmark.js
├── tests/                          # Bộ kiểm thử tự động Jest & Supertest (6 test suites)
├── views/                          # Giao diện Pug SSR
│   ├── layouts/                    # Layout: default.pug (Client) & admin.pug (Admin)
│   ├── pages/                      # Các trang Client, Candidate, Employer
│   ├── admin/                      # Toàn bộ view của cổng Quản trị Admin
│   ├── partials/                   # Header, Footer, Flash alerts
│   └── mixins/                     # Card việc làm, Card công ty
├── PERFORMANCE.md                  # Báo cáo kiểm chuẩn hiệu năng trên 10.000 bản ghi
├── DECISIONS.md                    # Nhật ký quyết định kiến trúc dự án
└── README.md                       # Tài liệu hướng dẫn dự án
```

---

## 3. Hướng Dẫn Cài Đặt & Khởi Chạy

### 3.1. Yêu cầu Tiên quyết
- Node.js phiên bản $\ge 18.0.0$ (Khuyến nghị Node 20 LTS hoặc 22 LTS).
- Trình quản lý gói `npm`.
- (Tùy chọn) Dịch vụ MongoDB chạy tại `mongodb://localhost:27017`. Nếu chưa có, hệ thống sẽ tự động kích hoạt **MongoDB In-Memory** không cần cài đặt.

### 3.2. Cài đặt Thư viện
```bash
npm install
```

### 3.3. Cấu hình Môi trường (.env)
Tạo file `.env` tại thư mục gốc của dự án với nội dung mẫu:
```env
PORT=3000
NODE_ENV=development
TRUST_PROXY=false

# Kết nối Cơ sở dữ liệu (Nếu không kết nối được sẽ tự bật In-Memory MongoDB)
MONGODB_URI=mongodb://localhost:27017/vn_itjobs

# Khóa bí mật Cookie & JWT (Tối thiểu 32 ký tự ngẫu nhiên)
COOKIE_SECRET=itjobs_super_secret_cookie_key_32chars_min!
JWT_SECRET=itjobs_jwt_secret_token_key_for_users_32chars_min!
ADMIN_JWT_SECRET=itjobs_admin_jwt_secret_token_key_32chars_min!

# Tiền tố đường dẫn Quản trị viên
ADMIN_PATH=admin

# Yêu cầu Quản trị viên phê duyệt Nhà tuyển dụng trước khi đăng tin
EMPLOYER_REQUIRE_APPROVAL=true

# Trình điều khiển lưu trữ file
STORAGE_DRIVER=local
```

### 3.4. Biên dịch Giao diện Tailwind CSS v4
```bash
# Biên dịch một lần (Minified)
npm run build:css

# Hoặc bật chế độ theo dõi thay đổi (Watch mode)
npm run watch:css
```

### 3.5. Nạp Dữ Liệu Mẫu (Database Seeding)
Hệ thống cung cấp sẵn dữ liệu mẫu thực tế tiếng Việt phong phú:
```bash
# Chế độ tiêu chuẩn (44 kỹ năng, 10 công ty, 30 ứng viên, 40 việc làm, 25 CV)
npm run seed

# Hoặc chế độ Dữ liệu lớn BIG DATA (10.000 việc làm, 500 công ty, 2.000 ứng viên, 2.000 CV)
npm run seed -- --big
```

### 3.6. Tạo Tài khoản Superadmin Đầu Tiên
Khởi tạo tài khoản Quản trị viên cao cấp nhất qua giao diện dòng lệnh tương tác hoặc tham số CLI:
```bash
npm run create-admin
# Nhập Email và Mật khẩu (tối thiểu 8 ký tự) theo lời nhắc trên màn hình
```

### 3.7. Khởi động Ứng dụng
```bash
# Chế độ phát triển (Tự động tải lại với Nodemon)
npm run dev

# Chế độ sản phẩm (Production)
npm start
```
Ứng dụng sẽ hoạt động tại địa chỉ: `http://localhost:3000`  
Cổng Quản trị Admin tại: `http://localhost:3000/admin`

---

## 4. Tài Khoản Dùng Thử Mẫu (Sau khi Seed)

| Vai trò | Email đăng nhập | Mật khẩu | Chức năng chính |
| :--- | :--- | :--- | :--- |
| **Superadmin** | `superadmin@admin.vn` | `AdminPass123` | Quản trị toàn hệ thống, Dashboard, Phê duyệt/Khóa NTD, Audit Logs, Xóa vĩnh viễn |
| **Nhà tuyển dụng (Active)** | `lgcns@gmail.com` | `Password123` | Hồ sơ công ty, Đăng tin, Chỉnh sửa/Xóa việc làm, Quản lý & Xem xét CV ứng tuyển |
| **Nhà tuyển dụng (Pending)** | `contact@nexttech.vn` | `Password123` | Tài khoản chờ duyệt (Hiển thị banner cảnh báo, bị chặn tạo tin mới) |
| **Ứng viên** | `levana@gmail.com` | `Password123` | Cập nhật hồ sơ, Nộp CV file PDF, Theo dõi danh sách việc làm đã nộp, Rút hồ sơ |

---

## 5. Các Lệnh Thực Thi Hệ Thống

| Câu lệnh | Mô tả tác vụ |
| :--- | :--- |
| `npm run dev` | Khởi động server phát triển cùng nodemon tại cổng 3000 |
| `npm start` | Chạy server môi trường chính thức |
| `npm run build:css` | Biên dịch tối ưu hóa Tailwind CSS v4 sang `public/assets/css/tailwind.css` |
| `npm run seed` | Làm sạch DB và nạp bộ dữ liệu mẫu chuẩn |
| `npm run seed -- --big`| Nạp bộ dữ liệu thử tải lớn: 10.000 tin tuyển dụng |
| `npm run benchmark` | Chạy kịch bản đo lường hiệu năng truy vấn, chứng minh Zero COLLSCAN |
| `npm run create-admin`| Script tương tác tạo tài khoản Superadmin an toàn |
| `npm test` | Chạy toàn bộ 58 bài kiểm thử tự động với Jest & Supertest |

---

## 6. Kết Quả Kiểm Chuẩn & Đảm Bảo Chất Lượng

- **Kiểm thử tự động (Unit & Integration Tests):** 100% vượt qua 58 test cases trên 6 bộ kiểm thử (`auth`, `utils`, `public`, `employer`, `application`, `admin`).
- **Zero N+1 Query:** Toàn bộ các thao tác đếm số việc làm và đếm số CV ở trang danh sách đều được tối ưu hóa qua 1 lệnh aggregation duy nhất.
- **Tốc độ truy vấn trên 10.000 bản ghi:** Xem chi tiết tại [**PERFORMANCE.md**](./PERFORMANCE.md) (Thời gian phản hồi truy vấn từ $1 - 5\text{ms}$, 100% sử dụng IXSCAN, ZERO COLLSCAN).
- **Quyết định kiến trúc:** Xem chi tiết tại [**DECISIONS.md**](./DECISIONS.md).
