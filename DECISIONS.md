# Tài liệu Ghi nhận Quyết định Kiến trúc (DECISIONS.md)

Tài liệu này tổng hợp các quyết định kỹ thuật và kiến trúc cốt lõi đã được áp dụng trong quá trình xây dựng hệ thống **VN.ITJobs**.

---

## 1. Kiến trúc Server-Side Rendering (Express + Pug) thay vì SPA (React/Vue)

### Bối cảnh & Yêu cầu
Dự án được khởi tạo từ bộ giao diện tĩnh viết bằng template Pug và Tailwind CSS v4. Yêu cầu số một là **Zero Redesign**: giữ nguyên $100\%$ cấu trúc DOM, thứ tự phần tử, class styling, không được thiết kế lại hoặc làm sai lệch giao diện.

### Quyết định
Sử dụng mô hình **Express.js + Pug Template Engine (SSR)** kết hợp các Controller phục vụ trực tiếp HTML.
- **Ưu điểm:**
  - Kế thừa trực tiếp toàn bộ template gốc trong `views/`, bảo toàn $100\%$ tính thẩm mỹ và giao diện.
  - Tối ưu hóa SEO vượt trội cho các trang tin tuyển dụng công khai (`/jobs/:slug`, `/companies/:slug`).
  - Đơn giản hóa kiến trúc: Không cần duy trì 2 project riêng (Frontend SPA và Backend REST API), giảm độ trễ mạng giữa client và server.

---

## 2. Xác thực JWT qua HttpOnly Cookie kết hợp `tokenVersion`

### Bối cảnh & Yêu cầu
JWT thông thường có nhược điểm cố hữu: một khi đã phát hành, server không thể thu hồi token trước khi hết hạn (stateless). Khi người dùng bị khóa tài khoản hoặc đổi mật khẩu, token cũ vẫn có thể tiếp tục truy cập.

### Quyết định
- Lưu trữ JWT trong cookie `HttpOnly` với cờ `sameSite: 'lax'`, `secure: production`.
- Bổ sung trường `tokenVersion: { type: Number, default: 0 }` trong các model `Candidate`, `Employer` và `Admin`.
- Trong payload JWT chứa `{ id, role, tv }`.
- Trên mỗi request, middleware `authenticateUser` / `authenticateAdmin` truy vấn nhanh tài khoản bằng `.select("-password").lean()` để kiểm tra `status === 'active'`, `deletedAt === null` và `user.tokenVersion === payload.tv`.
- Khi người dùng đổi mật khẩu hoặc bị Quản trị viên khóa tài khoản:
  `user.tokenVersion += 1; await user.save();`
  Toàn bộ các phiên đăng nhập cũ trên mọi thiết bị lập tức bị vô hiệu hóa mà không cần hạ tầng Redis Blacklist phức tạp.

---

## 3. Cách ly Độc lập Phân quyền Admin (`itj_admin_token`)

### Quyết định
- Khu vực Quản trị Admin chạy trên tiền tố cấu hình linh hoạt qua biến môi trường `ADMIN_PATH` (mặc định `/admin`).
- Sử dụng tên cookie hoàn toàn riêng biệt `itj_admin_token` và khóa ký mật riêng `ADMIN_JWT_SECRET`.
- Tuyệt đối không tái sử dụng token giữa User thường và Admin. Một ứng viên hoặc nhà tuyển dụng đang đăng nhập không thể sử dụng phiên đó để thâm nhập trang Admin.
- Toàn bộ trang Admin được bảo vệ bởi header `X-Robots-Tag: noindex, nofollow` và bộ giới hạn tần suất đăng nhập chặt chẽ (`adminLoginRateLimiter`: 5 lần thử/15 phút).

---

## 4. Bảo vệ Chống tấn công CSRF (Double Submit Cookie qua `csrf-csrf`)

### Quyết định
- Do sử dụng kiến trúc SSR với Form submit truyền thống và cookie xác thực, tấn công Cross-Site Request Forgery (CSRF) là nguy cơ trọng yếu.
- Sử dụng thư viện bảo mật hiện đại `csrf-csrf` (thay thế cho thư viện cũ đã bị deprecated `csurf`).
- Cấu hình lấy token linh hoạt từ `req.body._csrf` hoặc header `x-csrf-token`.
- Toàn bộ các thao tác chỉnh sửa dữ liệu, đổi mật khẩu, nộp CV, xóa mềm, duyệt tài khoản đều bắt buộc đi qua middleware `doubleCsrfProtection`.
- Xử lý mượt mà khi submit form upload `multipart/form-data`: Middleware multer chạy trước để bóc tách `req.body._csrf`, sau đó mới chuyển tới `doubleCsrfProtection`.

---

## 5. Lưu trữ File CV Riêng tư (Private Storage)

### Bối cảnh & Quy định An toàn Thông tin
File CV chứa thông tin nhạy cảm của ứng viên (họ tên, ngày sinh, số điện thoại, địa chỉ nhà, lịch sử học tập và làm việc). Nếu lưu trữ trong thư mục public (`public/uploads/...`), bất kỳ ai đoán được tên file hoặc bot crawler đều có thể tải xuống trái phép.

### Quyết định
- File CV được lưu vào thư mục riêng biệt ngoài tầm với của web server: `storage/private/cv/`.
- Tên file được đổi ngẫu nhiên hoàn toàn: `cv-<random_bytes_hex>.pdf`, không bao giờ dùng tên file nguyên bản của người dùng.
- File PDF chỉ được phục vụ thông qua các route có phân quyền:
  - Phía Nhà tuyển dụng: `/employer/cvs/:id/pdf` (Kiểm tra công ty sở hữu job).
  - Phía Ứng viên: `/candidate/applied-jobs/:id/pdf` (Kiểm tra ứng viên sở hữu hồ sơ).
- Khi stream file, thiết lập các header bảo vệ:
  `Content-Type: application/pdf`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`.

---

## 6. Kiểm tra Magic Bytes chống Upload File Giả mạo

### Quyết định
Không bao giờ tin tưởng MIME type hoặc đuôi file do người dùng gửi lên (`req.file.mimetype`).
- Với ảnh (Logo, Avatar, Job): Sử dụng `file-type` kiểm tra magic bytes thực tế của Buffer. Tiếp tục đưa qua bộ vi xử lý ảnh `sharp` để giải mã và tái tạo lại thành định dạng chuẩn WebP. Bất kỳ mã độc thực thi (php, exe, sh) nào nhúng trong file ảnh đều bị loại bỏ hoàn toàn.
- Với file CV: Kiểm tra header byte ma thuật `%PDF` (`0x25 0x50 0x44 0x46`) và `file-type` đảm bảo file thực sự là tài liệu PDF hợp lệ trước khi ghi vào đĩa.

---

## 7. Cơ chế Xóa Hồ sơ 2 Phía (Two-Sided Application Deletion)

### Quyết định
- Khi Ứng viên rút hồ sơ: Đánh dấu `hiddenByCandidate: true`.
- Khi Nhà tuyển dụng xóa CV khỏi danh sách: Đánh dấu `hiddenByEmployer: true`.
- Hồ sơ và file PDF vật lý chỉ bị xóa vĩnh viễn khỏi ổ cứng khi **cả hai phía cùng đánh dấu ẩn**:
  ```javascript
  if (application.hiddenByCandidate && application.hiddenByEmployer) {
    deleteCV(application.cv.key);
    await Application.findByIdAndDelete(application._id);
  }
  ```
  Quy tắc này giúp bảo toàn bằng chứng và lịch sử dữ liệu khi một trong hai phía chưa đồng ý xóa.

---

## 8. Tự động Khởi tạo In-Memory MongoDB Fallback

### Quyết định
Nhằm đảm bảo trải nghiệm phát triển và kiểm thử mượt mà nhất (Zero-friction developer experience):
- Nếu máy tính của nhà phát triển chưa chạy dịch vụ MongoDB cục bộ ở cổng 27017, hệ thống kết nối trong `src/config/db.js` sẽ tự động khởi động một instance **MongoDB In-Memory** ngầm qua `mongodb-memory-server`.
- Toàn bộ quá trình chạy test (`npm test`) hoặc benchmark diễn ra độc lập, sạch sẽ, không để lại rác dữ liệu và không đòi hỏi cài đặt MongoDB server phức tạp.
