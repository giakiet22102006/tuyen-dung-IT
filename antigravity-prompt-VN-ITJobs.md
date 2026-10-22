# PROMPT CHO ANTIGRAVITY: Backend + Trang Admin cho website VN.ITJobs

> Cách dùng: giải nén `Tuyen-dung-IT.rar` vào workspace (bỏ `node_modules`), mở bằng Antigravity ở **Planning mode**, rồi dán toàn bộ nội dung từ mục "VAI TRÒ" trở xuống.

---

## VAI TRÒ

Bạn là Senior Backend Engineer (Node.js) kiêm Tech Lead. Nhiệm vụ: biến project giao diện tĩnh **VN.ITJobs** (website tuyển dụng IT, code tay bằng Pug + Tailwind) thành một ứng dụng web hoàn chỉnh, có backend tối ưu, an toàn, dễ bảo trì, đồng thời xây thêm **khu vực Admin** để quản trị tài khoản Nhà tuyển dụng và Ứng viên.

## CÁCH LÀM VIỆC

1. **Trước khi viết code**: đọc toàn bộ `views/**` và `assets/css/style.css`, sau đó tạo **Implementation Plan** + **Task List**, rồi **dừng chờ tôi duyệt**.
2. Làm theo từng Phase ở mục 11. Cuối mỗi phase: chạy test, chạy app, **dùng browser agent mở từng trang vừa làm để kiểm tra** (desktop 1280px và mobile 375px), đính kèm screenshot/walkthrough.
3. Những gì tôi đã quyết bên dưới thì **không hỏi lại**. Chỗ nào thiếu thông tin, chọn mặc định hợp lý và ghi vào `DECISIONS.md` (mỗi quyết định 1–2 dòng, kèm lý do).
4. Tên biến, hàm, collection, route viết **tiếng Anh**; comment trong code và toàn bộ text hiển thị cho người dùng viết **tiếng Việt** (giống phong cách hiện tại, ví dụ `//- Hết Danh sách công ty`).

---

## 1. BỐI CẢNH PROJECT HIỆN TẠI

- Stack hiện tại: **Pug** + **Tailwind CSS v4 (CDN browser build)** + Font Awesome 6 + font Lexend. Script `start` hiện chỉ chạy `pug -w ./views/pages -o ./ -P` để biên dịch ra file `.html` tĩnh. **Chưa có server, database, JS phía client.**
- Cấu trúc: `views/layouts/default.pug`, `views/partials/{header,footer,section1}.pug`, `views/pages/*.pug` (17 trang), `assets/css/style.css`, `assets/images/`.
- Màu thương hiệu: `#000065` / `#000071` (nền header/footer), `#0088FF` (nút chính), `#DEDEDE` (viền), `#121212` (chữ). Class Tailwind dùng giá trị tùy ý (`font-[700]`, `py-[60px]`...), breakpoint tùy chỉnh `sm 576 / md 768 / lg 992 / xl 1200`, container `.contain` (1184px).
- Hai vai trò hiện có: **Ứng viên** (candidate) và **Nhà tuyển dụng** (employer). Mỗi nhà tuyển dụng = 1 công ty (đăng ký bằng "Tên công ty").

## 2. NGUYÊN TẮC BẤT BIẾN VỀ GIAO DIỆN

- **Không thiết kế lại giao diện.** Giữ nguyên bố cục, class Tailwind, màu, khoảng cách, thứ tự phần tử của các file `.pug` hiện có. Chỉ được: gắn dữ liệu động (`#{}`, `each`, `if`), thêm `name`/`id`/`for`/`action`/`method`/`value`, thêm hiển thị lỗi, và các sửa lỗi ở mục 10.
- Mọi trang mới (Admin, edit-jobs, 404/500, đổi mật khẩu...) phải **cùng ngôn ngữ thiết kế**: cùng bảng màu, cùng kiểu input (`border border-[#DEDEDE] rounded-[4px] py-[11px] px-[20px]`), cùng kiểu nút `bg-[#0088FF]`, cùng viết class Tailwind inline trong Pug, thụt lề 4 space.
- Chuyển các đoạn lặp thành **mixin/partial** (card công ty, card việc làm, pagination, form field, badge trạng thái) nhưng DOM và class sinh ra phải y hệt bản hiện tại.
- Giữ các file `.html` đã build: chuyển vào `legacy-html/` để đối chiếu, **không xóa**.

## 3. STACK CHỐT

| Hạng mục | Lựa chọn |
|---|---|
| Runtime / Framework | Node.js ≥ 20 LTS, **Express 4/5**, render server-side bằng **Pug** (không đổi sang SPA) |
| Database | **MongoDB + Mongoose** (job có mảng skills/images, hợp document model) |
| Auth | **JWT trong cookie httpOnly** (SameSite=Lax, Secure ở production) + `tokenVersion`; hash mật khẩu bằng **bcryptjs** (cost 12) |
| Validate | **Zod** (middleware `validate(schema)`; lỗi thì render lại đúng trang cũ kèm `errors` và `old`) |
| Upload | **multer (memoryStorage)** + **sharp** (ảnh → webp, resize) + **file-type** (kiểm tra magic bytes). Lớp trừu tượng `storage` có 2 driver: `local` (mặc định) và `cloudinary` (bật qua env) |
| Bảo mật | helmet (CSP cấu hình riêng), express-rate-limit, `csrf-csrf` (double-submit cookie), express-mongo-sanitize, hpp, sanitize-html |
| Hiệu năng | compression, cache tĩnh, `node-cache` (TTL 5 phút) cho dữ liệu menu/số liệu trang chủ |
| Log | pino + pino-http (request id) |
| Test | Jest + Supertest + mongodb-memory-server |
| CSS | **Tailwind v4 CLI** build ra `public/assets/css/tailwind.css` (bỏ CDN browser build ở production; xem mục 10) |
| Dev | nodemon, ESLint + Prettier, `docker-compose.yml` (mongo), `.env.example` |

Không dùng session server-side. Flash message dùng cookie ký, sống 1 request.

## 4. CẤU TRÚC THƯ MỤC MỤC TIÊU

```
src/
  app.js                 # tạo express app (không listen) để test
  server.js              # connect DB, listen, graceful shutdown
  config/                # env.js (validate bằng zod), db.js, constants.js, security.js
  models/                # candidate, employer, admin, job, skill, application, auditLog
  routes/                # client.route.js, candidate.route.js, employer.route.js, admin.route.js
  controllers/           # chia thư mục client/, candidate/, employer/, admin/
  services/              # nghiệp vụ: auth, job, search, application, upload(storage), admin-user, stats
  middlewares/           # auth (requireCandidate/requireEmployer/requireAdmin), locals, validate,
                         # upload, rateLimit, csrf, flash, error, notFound
  validators/            # zod schema theo từng form
  utils/                 # slugify, normalizeVi (bỏ dấu), pagination, formatSalary, labels, asyncHandler
  scripts/               # seed.js, create-admin.js
views/                   # giữ cấu trúc cũ, thêm views/admin/**, views/mixins/**, views/errors/**
public/assets/           # chuyển từ assets/ hiện tại (phục vụ ở URL /assets/...)
storage/private/cv/      # CV PDF, KHÔNG public (đưa vào .gitignore)
legacy-html/
```

## 5. DATA MODEL (Mongoose, bật `timestamps`)

Dùng `constants.js` làm nguồn duy nhất cho các enum và nhãn tiếng Việt.

- **Thành phố**: `ha-noi` = Hà Nội, `da-nang` = Đà Nẵng, `ho-chi-minh` = TP. Hồ Chí Minh (+ `khac` = Khác). Dùng chung cho ô chọn thành phố ở trang tìm kiếm, hồ sơ công ty, tạo job.
- **Cấp bậc** (`position`): `intern`, `fresher`, `junior`, `middle`, `senior`, `manager` (nhãn: Intern, Fresher, Junior, Middle, Senior, Manager).
- **Hình thức** (`workingForm`): `office` = Tại văn phòng, `remote` = Từ xa, `flexible` = Linh hoạt.

**Candidate**: `fullName`, `email` (unique, lowercase, trim), `password` (select:false), `phone`, `avatar {url,key}`, `status` (`active|banned`), `banReason`, `bannedAt`, `tokenVersion`, `lastLoginAt`, `deletedAt`, `searchText`.

**Employer** (= công ty): `companyName`, `slug` (unique), `email` (unique), `password`, `phone`, `logo {url,key}`, `city`, `address`, `companyModel`, `companySize`, `workingTime`, `overtime`, `description` (HTML đã sanitize), `status` (`pending|active|banned`), `banReason`, `approvedAt`, `approvedBy`, `tokenVersion`, `lastLoginAt`, `deletedAt`, `searchText`.

**Admin**: `fullName`, `email` (unique), `password`, `role` (`superadmin|admin`), `status`, `tokenVersion`, `lastLoginAt`.

**Job**: `employerId`, `title`, `slug` (unique, dạng `ten-viec-lam-xxxxxx`), `salaryMin`, `salaryMax` (USD, có thể rỗng), `position`, `workingForm`, `skills [{name, slug}]`, `images [{url,key}]` (tối đa 5), `description` (HTML đã sanitize), `city` + `address` (snapshot từ employer lúc tạo, và **đồng bộ lại bằng `updateMany` khi employer sửa thành phố/địa chỉ**), `employerActive` (bool, đồng bộ theo trạng thái employer), `moderation` (`visible|hidden`, do admin), `deletedAt`, `searchText` (tiêu đề + skills, đã bỏ dấu, lowercase).

**Skill**: `name`, `slug` (unique). Khi employer nhập "Các công nghệ" (phân tách bằng dấu phẩy) thì upsert vào Skill và nhúng `{name, slug}` vào Job.

**Application** (CV đã nộp): `jobId`, `employerId`, `candidateId`, `fullName`, `email`, `phone`, `cv {key, originalName, size}`, `viewed` (bool), `status` (`pending|approved|rejected`), `reviewedAt`, `hiddenByEmployer`, `hiddenByCandidate`.

**AuditLog**: `adminId`, `action`, `targetType`, `targetId`, `meta`, `ip` (TTL 365 ngày).

**Index bắt buộc** (và kiểm chứng bằng `explain()`, xem mục 9):
- Candidate/Employer/Admin: `email` unique; `{status:1, deletedAt:1, createdAt:-1}`; text index hoặc regex prefix trên `searchText`.
- Employer: `slug` unique; `{status:1, city:1}`.
- Job: `slug` unique; compound theo bộ lọc công khai `{employerActive:1, moderation:1, deletedAt:1, city:1, position:1, workingForm:1, createdAt:-1}`; `{employerId:1, deletedAt:1, createdAt:-1}`; multikey `skills.slug`; text trên `searchText`.
- Application: unique `{jobId:1, candidateId:1}`; `{employerId:1, hiddenByEmployer:1, createdAt:-1}`; `{candidateId:1, hiddenByCandidate:1, createdAt:-1}`.

## 6. BẢNG ROUTE ↔ FILE PUG

Public (không cần đăng nhập):

| Pug | Route | Ghi chú |
|---|---|---|
| index | `GET /` | số việc làm ở `section1` = đếm job công khai (cache); "Nhà tuyển dụng hàng đầu" = 9 công ty nhiều việc làm nhất |
| search | `GET /search?city&keyword&skill&position&workingForm&company&page` | khớp form `section1` và 2 ô lọc Cấp bậc, Hình thức; tiêu đề "76 việc làm `reactjs`" động |
| company-list | `GET /companies?page` | 9 công ty/trang |
| company-details | `GET /companies/:slug` | thông tin + danh sách việc làm của công ty |
| job-details | `GET /jobs/:slug` | 3 ảnh đầu hiển thị như thiết kế; form ứng tuyển ở `#boxApply` |

Ứng viên (prefix `/candidate`):

| Pug | Route |
|---|---|
| candidate-signup / candidate-login | `GET+POST /candidate/signup`, `GET+POST /candidate/login`, `POST /candidate/logout` |
| candidate-profile | `GET+POST /candidate/profile` (họ tên, avatar, email, SĐT) |
| (mới) change-password | `GET+POST /candidate/change-password` |
| applied-jobs | `GET /candidate/applied-jobs?page`, `GET /candidate/applied-jobs/:id` (nút Xem: xem file CV của mình), `POST /candidate/applied-jobs/:id/delete` |
| (form trong job-details) | `POST /jobs/:slug/apply` (multipart) |

Nhà tuyển dụng (prefix `/employer`):

| Pug | Route |
|---|---|
| employer-signup / employer-login | `GET+POST /employer/signup`, `GET+POST /employer/login`, `POST /employer/logout` |
| company-profile | `GET+POST /employer/company-profile` |
| (mới) change-password | `GET+POST /employer/change-password` |
| manage-jobs | `GET /employer/jobs?page` |
| create-jobs | `GET+POST /employer/jobs/create` |
| (mới) edit-jobs | `GET+POST /employer/jobs/:id/edit` (tái sử dụng chung partial form với create-jobs) |
| (nút Xóa) | `POST /employer/jobs/:id/delete` (soft delete) |
| manage-CV | `GET /employer/cvs?page` |
| CV-details | `GET /employer/cvs/:id` (tự đặt `viewed=true`), `GET /employer/cvs/:id/file` (stream PDF) |
| (nút) | `POST /employer/cvs/:id/approve`, `/reject`, `/delete` |

Chỉ dùng **GET và POST** (không method-override). Nút Sửa/Xóa/Duyệt/Từ chối là form POST nhỏ kèm CSRF token; hành động xóa có `confirm()` ở client.

## 7. NGHIỆP VỤ CHI TIẾT

**Xác thực & phân quyền**
- Cookie `itj_token` (ứng viên/nhà tuyển dụng, payload `{id, role, tv}`), cookie riêng `itj_admin_token` (path `/admin`, secret khác). Token của ứng viên **không thể** dùng cho route employer/admin và ngược lại.
- Mỗi request có đăng nhập: load user bằng `.select(...).lean()`, kiểm tra `status`, `deletedAt`, `tokenVersion`. Nhờ vậy **ban/xóa/đổi mật khẩu có hiệu lực ngay lập tức**.
- Tài khoản bị ban đăng nhập sẽ thấy thông báo rõ lý do (nếu có). Employer `pending` đăng nhập được nhưng bị chặn tạo/sửa job, hiển thị banner "Tài khoản đang chờ duyệt". Cấu hình qua env `EMPLOYER_REQUIRE_APPROVAL` (mặc định `true`; `false` thì employer đăng ký xong là `active`).
- Đăng nhập: thông báo lỗi chung "Email hoặc mật khẩu không đúng", rate limit 10 lần/15 phút theo IP + email. Mật khẩu ≥ 8 ký tự, có chữ và số. Sau đổi mật khẩu thì tăng `tokenVersion`.
- Middleware `locals` gắn vào mọi view: `currentUser`, `role`, `flash`, `csrfToken`, `menuData` (cache), helper (`formatSalary`, `labels`, `formatDate`, `paginate`).

**Header động** (`header.pug`): khách giữ nguyên thiết kế hiện tại. Đã đăng nhập thì khối "Đăng Nhập / Đăng Ký" bên phải đổi thành tên + dropdown cùng phong cách menu hiện có (ứng viên: Thông tin cá nhân, CV đã gửi, Đổi mật khẩu, Đăng xuất; nhà tuyển dụng: Thông tin công ty, Quản lý công việc, Quản lý CV, Đổi mật khẩu, Đăng xuất). Menu "Việc làm IT theo kỹ năng / công ty / thành phố" và "Top Công Ty IT" lấy từ DB (top 5 skill, 5 công ty, 3 thành phố) và được cache.

**Tìm kiếm**: lọc theo `city`, `position`, `workingForm`, `skill` (slug), `company` (slug), `keyword` (chuẩn hóa bỏ dấu + lowercase, khớp `searchText`). Chỉ trả job công khai (`employerActive:true, moderation:'visible', deletedAt:null`). Sắp xếp mới nhất. `Promise.all([find, countDocuments])`, `lean()`, `select` đúng trường cần cho card, populate công ty chỉ `companyName slug logo`. Phân trang 9 mục/trang, giới hạn `page` tối đa hợp lý; giữ nguyên `select` "Trang 1/2/3" (render từ tổng số trang, đổi trang bằng JS nhỏ trong `public/assets/js/main.js`, **không inline script**).

**Số việc làm của công ty** (card "5 Việc làm"): một lệnh `aggregate` nhóm theo `employerId` chỉ cho danh sách id của trang hiện tại, không N+1.

**Hiển thị lương**: `1.000$ - 1.500$` (định dạng `vi-VN`); chỉ có min thì "Từ 1.000$", chỉ có max thì "Tới 1.500$", không có thì "Thương lượng". Validate `min ≤ max`.

**Tạo / sửa / xóa job**: chỉ employer `active`. Tải tối đa 5 ảnh. Thao tác sửa/xóa chỉ trên job của chính mình (kiểm tra `employerId`, trả 404 nếu không phải của mình). Xóa là soft delete. Mô tả HTML phải qua `sanitize-html` với whitelist thẻ cơ bản; `description` hiển thị bằng `!{}` chỉ sau khi sanitize.

**Ứng tuyển**: yêu cầu ứng viên đã đăng nhập (chưa đăng nhập thì chuyển tới `/candidate/login?next=...`, đăng nhập xong quay lại). Form được điền sẵn họ tên, email, SĐT từ hồ sơ. File CV: **chỉ PDF, ≤ 5MB**, kiểm tra magic bytes, đổi tên ngẫu nhiên, lưu vào `storage/private/cv/`. Mỗi ứng viên chỉ nộp **một lần cho mỗi job** (unique index, báo lỗi thân thiện). Không cho ứng tuyển vào job không công khai.

**Quản lý CV (employer)**: danh sách phân trang, mới nhất trước, trạng thái hiển thị "Chưa xem/Đã xem" và "Chưa duyệt/Đã duyệt/Từ chối". Nút Xem → mở CV-details và đặt `viewed=true`. Duyệt/Từ chối cập nhật `status` + `reviewedAt`. File PDF được phục vụ qua route có xác thực (kiểm tra CV thuộc employer đó), header `Content-Type: application/pdf`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`. Thẻ `embed` trong CV-details trỏ tới route này.

**CV đã gửi (ứng viên)**: nút Xóa chỉ khả dụng khi `status=pending` (rút hồ sơ). "Xóa" mỗi phía chỉ đặt `hiddenByEmployer`/`hiddenByCandidate`; khi cả hai phía cùng ẩn thì xóa vĩnh viễn bản ghi và file PDF.

**Upload**: avatar/logo ≤ 2MB, ảnh job ≤ 3MB/ảnh; chỉ nhận jpg/png/webp; sharp resize (avatar/logo 400px, ảnh job rộng tối đa 1280px) và chuyển webp; xóa file cũ khi thay ảnh; không bao giờ dùng tên file người dùng đặt.

**Slug**: bỏ dấu tiếng Việt (xử lý đúng "đ"), kèm hậu tố ngắn để tránh trùng.

## 8. KHU VỰC ADMIN (MỚI)

Mục tiêu: admin quản trị **tài khoản Nhà tuyển dụng** và **Ứng viên**. URL prefix lấy từ env `ADMIN_PATH` (mặc định `admin`). Layout riêng `views/layouts/admin.pug`: sidebar trái màu `#000065` (Dashboard, Nhà tuyển dụng, Ứng viên, Nhật ký, Đăng xuất), vùng nội dung nền trắng, dùng đúng bảng màu và kiểu component của site; responsive (sidebar thu thành menu ở < 992px). Trang login admin dùng layout không có sidebar, giống form đăng nhập hiện có.

| Trang | Route | Chức năng |
|---|---|---|
| Đăng nhập | `GET+POST /admin/login`, `POST /admin/logout` | rate limit chặt hơn user thường |
| Dashboard | `GET /admin` | thẻ số liệu: tổng ứng viên, tổng nhà tuyển dụng, **NTD chờ duyệt**, tổng việc làm, tổng CV; biểu đồ đăng ký mới 30 ngày (Chart.js UMD pin version, từ cdnjs/jsdelivr); danh sách 5 NTD chờ duyệt mới nhất (nút Duyệt nhanh) |
| Danh sách NTD | `GET /admin/employers` | bảng: logo, tên công ty, email, thành phố, số job, trạng thái (badge màu), ngày tạo, thao tác. Lọc: từ khóa (tên/email/SĐT), trạng thái (pending/active/banned/đã xóa), thành phố, khoảng ngày; sắp xếp; phân trang 10/trang; **chọn nhiều + thao tác hàng loạt** (duyệt, khóa) |
| Chi tiết NTD | `GET /admin/employers/:id` | thông tin công ty, thống kê (số job, số CV nhận), danh sách job của họ (có nút ẩn/hiện job), lịch sử thao tác của admin lên tài khoản này |
| Sửa/Thêm NTD | `GET+POST /admin/employers/:id/edit`, `/admin/employers/create` | sửa thông tin cơ bản, tạo tài khoản NTD thủ công (mật khẩu tạm) |
| Danh sách ứng viên | `GET /admin/candidates` | bảng: avatar, họ tên, email, SĐT, số CV đã nộp, trạng thái, ngày tạo; lọc/sắp xếp/phân trang/thao tác hàng loạt như trên |
| Chi tiết ứng viên | `GET /admin/candidates/:id` | thông tin, danh sách CV đã nộp (tên job, công ty, trạng thái), lịch sử thao tác |
| Sửa/Thêm ứng viên | `GET+POST /admin/candidates/:id/edit`, `/admin/candidates/create` | như NTD |
| Nhật ký | `GET /admin/logs` | bảng AuditLog, lọc theo admin, hành động, ngày |

**Thao tác trên tài khoản** (cả NTD và ứng viên, đều là `POST` + CSRF, đều ghi AuditLog):
- **Duyệt** (chỉ NTD `pending` → `active`, ghi `approvedAt/approvedBy`).
- **Khóa** (nhập lý do bắt buộc; tăng `tokenVersion` để đá người dùng ra ngay) và **Mở khóa**.
- **Đặt lại mật khẩu**: sinh mật khẩu tạm ngẫu nhiên, hiển thị **một lần duy nhất** cho admin, tăng `tokenVersion`. Nếu có cấu hình SMTP thì gửi email (tùy chọn, không bắt buộc).
- **Xóa mềm** (đặt `deletedAt`, chặn đăng nhập) và **Khôi phục**. **Xóa vĩnh viễn** chỉ `superadmin`, có xác nhận 2 bước, kèm dọn file (avatar, logo, CV) và cascade dữ liệu liên quan.
- Khi NTD bị khóa/xóa/pending: `Job.employerActive=false` cho toàn bộ job của họ (bulk `updateMany`) → biến mất khỏi site công khai. Khi mở khóa/khôi phục thì bật lại. Công ty đó cũng không xuất hiện ở danh sách công ty.
- Admin không thể khóa/xóa chính mình; `admin` thường không được đụng tới tài khoản `superadmin`.

**Bảo mật admin**: cookie riêng, secret riêng, CSRF, rate limit, không index bởi robot (`X-Robots-Tag: noindex`), mọi route `/admin/**` (trừ login) qua `requireAdmin`. Script `npm run create-admin` tạo superadmin đầu tiên từ biến môi trường / prompt; **không** để mật khẩu mặc định trong code hay seed.

**Tùy chọn, làm cuối cùng nếu còn thời gian**: trang quản lý việc làm cho admin (ẩn/hiện job, `moderation`), trang quản lý tài khoản admin (chỉ superadmin).

## 9. HIỆU NĂNG & BẢO MẬT: CHECKLIST BẮT BUỘC

- Không N+1: dùng `populate` có `select`, hoặc `aggregate`/`$in` theo batch; luôn `lean()` cho trang chỉ đọc; luôn `select` trường cần thiết; `limit` có trần.
- Seed **10.000 job + 500 công ty + 2.000 ứng viên + 5.000 CV** (flag `--big`), chạy `explain('executionStats')` cho các truy vấn: trang chủ, search (có/không keyword), company-list, manage-CV, admin list. **Không được có COLLSCAN** trên các collection lớn; ghi kết quả vào `PERFORMANCE.md`.
- `compression()`, `Cache-Control` dài cho `/assets` (file có hash hoặc `maxAge` 7 ngày), ETag bật.
- Cache `node-cache` (TTL 300s) cho: số job tổng, top công ty, menu skill/city. Xóa cache khi có thay đổi liên quan.
- Helmet CSP: cho phép `'self'`, `cdnjs.cloudflare.com` (Font Awesome, Chart.js), `fonts.googleapis.com` + `fonts.gstatic.com`, ảnh `data:` và domain Cloudinary nếu bật, `object-src 'self'` và `frame-ancestors 'self'` để `embed` PDF cùng origin hoạt động. Không dùng `'unsafe-inline'` cho script; style inline nếu thật sự cần thì dùng nonce.
- CSRF cho mọi form POST; `express-mongo-sanitize`, `hpp`; sanitize HTML; giới hạn body (`1mb`) và kích thước file; `trust proxy` cấu hình qua env.
- `env.js` validate biến môi trường bằng zod và **dừng app** nếu thiếu `JWT_SECRET`, `ADMIN_JWT_SECRET`, `COOKIE_SECRET`, `MONGODB_URI`.
- Một `errorHandler` duy nhất: lỗi validate → render lại form; 403/404/500 → trang `views/errors/*.pug` đúng phong cách site; không lộ stack ở production.
- `GET /healthz`; graceful shutdown (đóng server + mongoose khi nhận SIGTERM).
- Test tối thiểu (Jest + Supertest): đăng ký/đăng nhập 2 vai trò; cô lập quyền (ứng viên không vào được `/employer/**`, `/admin/**`); employer không sửa được job của người khác; nộp CV (đúng PDF, sai định dạng, nộp trùng); ban employer làm job biến mất khỏi search; ban user có hiệu lực ngay; employer không tải được CV của employer khác.

## 10. LỖI GIAO DIỆN CẦN SỬA VÀ TRANG CÒN THIẾU

Đã đọc code, phát hiện các điểm sau. Sửa chúng (đây là các thay đổi duy nhất được phép ngoài việc gắn dữ liệu động):

1. `style.css`: `font-family: "Lexand"` sai chính tả → `"Lexend"` (hiện font không hề được áp dụng). Cũng sửa `@media (max-switch: 576px)` → `max-width`.
2. Đường dẫn tương đối `assets/css/style.css`, `assets/images/...` sẽ hỏng với route lồng nhau (`/employer/jobs/...`) → đổi thành tuyệt đối `/assets/...`.
3. Mọi `label(for="")` / `input(id="")` đang rỗng; mọi input thiếu `name` → điền `id`/`for`/`name` khớp nhau; nút submit thêm `type="submit"`.
4. "Mô tả chi tiết" ở `company-profile`, `create-jobs` đang là `input type=text` → đổi thành `textarea` (kèm trình soạn thảo rich-text nhẹ như TinyMCE từ cdnjs, sanitize ở server).
5. `company-profile.pug` thiếu `.contain` bao ngoài nên lệch bố cục so với các trang khác → thêm `.contain`.
6. `create-jobs`: select Cấp bậc chỉ có Intern/Middle, Hình thức chỉ có 2 mục → dùng đủ enum ở mục 5. "Các công nghệ" nhận chuỗi phân tách dấu phẩy (hiển thị lại thành tag).
7. Danh sách thành phố không đồng nhất giữa `section1` ("Đà Nẵng") và `company-profile` ("TP.HCM") → dùng chung một nguồn `constants.js`.
8. Form tìm kiếm ở `section1` đang không có `name`/`method`: thêm `method="GET" action="/search"`; ô chọn thành phố có option mặc định "Tất cả thành phố".
9. Form có `input type=file` phải có `enctype="multipart/form-data"`.
10. Production dùng **Tailwind CLI** thay cho CDN browser build: chuyển khối `@theme` (breakpoint tùy chỉnh) sang `src/styles/input.css` (`@import "tailwindcss"; @source "../../views";`), build ra `public/assets/css/tailwind.css`. Phải **so sánh ảnh chụp trước/sau** để chắc không lệch pixel (đặc biệt các class tùy ý như `line-clamp-[2]`). Nếu có lệch không xử lý được, giữ CDN ở dev và ghi vào `DECISIONS.md`.

Trang cần tạo mới (cùng phong cách): `edit-jobs`, `change-password` (ứng viên/NTD), `errors/404`, `errors/500`, `errors/403`, và toàn bộ `views/admin/**`. Cân nhắc thêm banner "Tài khoản đang chờ duyệt" cho employer.

## 11. CÁC PHASE (mỗi phase dừng để tôi xem walkthrough)

- **Phase 0, Nền tảng**: tách repo theo mục 4, Express + Pug chạy được, nạp CSS, layout/partials/mixins, Tailwind CLI, chuyển `.html` cũ vào `legacy-html/`, `.env.example`, docker-compose, ESLint/Prettier. Nghiệm thu: các trang tĩnh render y hệt bản cũ (kèm so sánh screenshot).
- **Phase 1, Dữ liệu**: constants, models + index, utils (slug/bỏ dấu/format), `seed.js` (dữ liệu tiếng Việt thực tế + chế độ `--big`).
- **Phase 2, Auth**: đăng ký/đăng nhập/đăng xuất/đổi mật khẩu cho 2 vai trò, middleware, CSRF, rate limit, header động, flash message.
- **Phase 3, Trang công khai**: index, search, company-list, company-details, job-details (chưa gồm nộp CV).
- **Phase 4, Khu vực nhà tuyển dụng**: company-profile, manage-jobs, create/edit/xóa job, upload ảnh.
- **Phase 5, Ứng viên & CV**: candidate-profile, nộp CV, applied-jobs, manage-CV, CV-details, stream PDF bảo mật.
- **Phase 6, Admin**: toàn bộ mục 8.
- **Phase 7, Hoàn thiện**: test, `explain()` trên dữ liệu `--big`, `PERFORMANCE.md`, `README.md` (cài đặt, biến môi trường, lệnh, sơ đồ route), rà soát bảo mật.

## 12. TIÊU CHÍ NGHIỆM THU

- [ ] `docker compose up -d && npm i && npm run seed && npm run dev` chạy được ngay trên máy sạch.
- [ ] Mọi trang trong 17 file pug gốc hoạt động với dữ liệu thật; giao diện khớp bản gốc ở 375px và 1280px.
- [ ] Luồng đầy đủ: NTD đăng ký → (admin duyệt) → tạo job → ứng viên đăng ký → nộp CV → NTD xem/duyệt/từ chối → ứng viên thấy trạng thái.
- [ ] Admin quản trị được NTD và ứng viên: tìm/lọc, duyệt, khóa/mở khóa (có hiệu lực ngay), đặt lại mật khẩu, xóa mềm/khôi phục, thao tác hàng loạt; mọi thao tác có AuditLog.
- [ ] Không route nào truy cập chéo vai trò được; CV PDF không truy cập được bằng URL trực tiếp hay bởi người không có quyền.
- [ ] Không COLLSCAN ở các truy vấn chính trên bộ dữ liệu `--big`; trang chủ/search phản hồi < 200ms cục bộ.
- [ ] Toàn bộ test pass; không có `console.log` dư; không secret nào nằm trong repo.
- [ ] Có `DECISIONS.md`, `PERFORMANCE.md`, `README.md`.
