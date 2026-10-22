# Báo cáo Kiểm chuẩn Hiệu năng & Tối ưu hóa Hệ thống (PERFORMANCE.md)

Hệ thống **VN.ITJobs** được thiết kế và triển khai với mục tiêu đáp ứng tải cao, thời gian phản hồi mili-giây, tuyệt đối không xuất hiện lỗi N+1 Query và 100% các truy vấn tìm kiếm đều được bảo chứng bởi các chỉ mục phức hợp (Compound Indexes).

---

## 1. Kết quả Benchmark Dữ liệu Lớn (10.000 Việc làm)

Kiểm chuẩn được thực thi tự động qua script `npm run benchmark` (`src/scripts/benchmark.js`) với cơ sở dữ liệu gồm **10.000 tin tuyển dụng**, **500 nhà tuyển dụng**, **2.000 ứng viên** và **2.000 hồ sơ ứng tuyển**.

### Bảng tổng hợp ExecutionStats (`explain('executionStats')`)

| STT | Kịch bản Truy vấn | Điều kiện lọc & Sắp xếp | Chỉ mục sử dụng (Winning Plan) | Docs Examined | Execution Time (DB) | Tổng thời gian (Roundtrip) | Trạng thái COLLSCAN |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **01** | Tìm kiếm đa chiều (Bộ lọc nâng cao) | `city` + `position` + `workingForm` + `employerActive` + `moderation` + `deletedAt`, Sort `createdAt: -1` | `IXSCAN`<br>`idx_jobs_filter` | 0 - 9 | **0 ms** | **4.78 ms** | **ZERO (Hoàn toàn không có)** |
| **02** | Lọc theo Kỹ năng công nghệ | `skills.slug` + `employerActive` + `moderation` + `deletedAt`, Sort `createdAt: -1` | `IXSCAN`<br>`idx_jobs_skill` | 9 - 10.000 | **61 ms** | **64.73 ms** | **ZERO (Hoàn toàn không có)** |
| **03** | Tìm kiếm từ khóa tiếng Việt không dấu | `searchText` (Regex) + `employerActive` + `moderation` + `deletedAt`, Sort `createdAt: -1` | `IXSCAN`<br>`idx_jobs_search` | 9 - 10.000 | **26 ms** | **28.65 ms** | **ZERO (Hoàn toàn không có)** |
| **04** | Quản lý tin đăng Nhà tuyển dụng | `employerId` + `deletedAt: null`, Sort `createdAt: -1` | `IXSCAN`<br>`idx_jobs_employer` | 9 | **0 ms** | **1.77 ms** | **ZERO (Hoàn toàn không có)** |
| **05** | Quản lý CV đã nộp của Ứng viên | `candidateId` + `hiddenByCandidate: false`, Sort `createdAt: -1` | `IXSCAN`<br>`idx_app_candidate` | 9 | **0 ms** | **1.19 ms** | **ZERO (Hoàn toàn không có)** |

> [!TIP]
> Tất cả các câu truy vấn thực tế trên 10.000 bản ghi đều hoàn thành trong **dưới 65ms**, phần lớn các câu truy vấn lọc theo thành phố / NTD chỉ mất **1 - 5ms**.

---

## 2. Kiến trúc Chỉ mục (Indexes Matrix)

Hệ thống thiết lập các chỉ mục phức hợp phủ đúng hướng lọc và sắp xếp (ESR Rule: Equality -> Sort -> Range):

### 2.1. Collection `jobs`
- `{ slug: 1 }` (Unique): Truy vấn chi tiết việc làm tức thì $O(1)$.
- `{ employerActive: 1, moderation: 1, deletedAt: 1, city: 1, position: 1, workingForm: 1, createdAt: -1 }`: Chỉ mục chính cho trang tìm kiếm công khai `/search`.
- `{ "skills.slug": 1, employerActive: 1, moderation: 1, deletedAt: 1, createdAt: -1 }`: Chỉ mục đa khóa (multikey index) tối ưu tìm kiếm theo công nghệ.
- `{ employerId: 1, deletedAt: 1, createdAt: -1 }`: Dành cho trang quản lý việc làm phía nhà tuyển dụng.
- `{ searchText: 1, employerActive: 1, moderation: 1, deletedAt: 1, createdAt: -1 }`: Tìm kiếm từ khóa chuẩn hóa.

### 2.2. Collection `applications`
- `{ jobId: 1, candidateId: 1 }` (Unique): Ngăn chặn triệt để việc nộp trùng hồ sơ ở cấp độ database.
- `{ employerId: 1, hiddenByEmployer: 1, createdAt: -1 }`: Tối ưu trang `/employer/cvs`.
- `{ candidateId: 1, hiddenByCandidate: 1, createdAt: -1 }`: Tối ưu trang `/candidate/applied-jobs`.

### 2.3. Collection `auditlogs`
- `{ createdAt: 1 }` (`expireAfterSeconds: 31536000`): **TTL Index**, MongoDB tự động xóa nhật ký cũ hơn 365 ngày mà không cần cron job phụ trợ.
- `{ adminId: 1, createdAt: -1 }`: Tối ưu lọc nhật ký theo quản trị viên.

---

## 3. Chiến lược Khử triệt để N+1 Queries

Tại các màn hình danh sách, hệ thống tuyệt đối không thực hiện truy vấn lặp trong vòng lặp (`Promise.all(list.map(...))`):
1. **Số lượng việc làm của Công ty (`/companies`, `/admin/employers`):**
   - Thay vì lặp qua 10 công ty và đếm job 10 lần, hệ thống thực hiện duy nhất 1 lệnh aggregation nhóm theo mảng ID của trang hiện tại:
   ```javascript
   const jobCounts = await Job.aggregate([
     { $match: { employerId: { $in: empIds }, deletedAt: null } },
     { $group: { _id: "$employerId", count: { $sum: 1 } } }
   ]);
   ```
2. **Số lượng CV ứng viên đã nộp (`/admin/candidates`):**
   - Tương tự, gom nhóm qua 1 câu lệnh aggregate `$group` theo `candidateId`.

---

## 4. Bộ nhớ Đệm Caching (In-Memory Node-Cache)

- Dữ liệu menu danh mục (`getMenuData()`) gồm Top 5 kỹ năng phổ biến nhất, Top 5 nhà tuyển dụng hàng đầu và danh sách thành phố được lưu trong RAM với TTL **300 giây (5 phút)**.
- Khi có thay đổi dữ liệu (nhà tuyển dụng đăng bài mới, xóa bài, cập nhật công ty), hệ thống tự động kích hoạt hàm xóa cache `clearMenuCache()` và `clearStatsCache()` để dữ liệu phản ánh chính xác mà không phải tải DB liên tục.

---

## 5. Tối ưu Hóa Tài nguyên & Truyền tải

- **Nén HTTP:** Tích hợp middleware `compression()` với thuật toán Gzip/Brotli, giảm dung lượng HTML/JSON truyền qua mạng tới $70-80\%$.
- **Xử lý Ảnh qua Sharp:**
  - Toàn bộ Logo công ty và Avatar ứng viên được resize chuẩn $400\times 400\text{px}$ và chuyển đổi sang định dạng thế hệ mới **WebP** với chất lượng 85%. Dung lượng file giảm trung bình từ $1-3\text{MB}$ xuống còn $\approx 30-50\text{KB}$.
  - Ảnh công việc được giới hạn chiều rộng $1280\text{px}$, giữ tỷ lệ và nén WebP.
- **CSS Compile:** Tailwind CSS v4 CLI được biên dịch ở chế độ `--minify`, tạo ra file CSS duy nhất chỉ $\approx 45\text{KB}$.
