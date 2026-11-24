// tests/qa_slice1_admin_auth.test.js
const crypto = require("crypto");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/app");
const env = require("../src/config/env");
const blogService = require("../src/services/blog.service");
const mailService = require("../src/services/mail.service");
const storageService = require("../src/services/storage.service");
const { hashPassword } = require("../src/services/auth.service");
const { createRateLimiters } = require("../src/middlewares/rateLimit.middleware");
const {
  Admin,
  Employer,
  Candidate,
  Job,
  Application,
  AuditLog,
  Feedback,
  Review,
  Article,
  SavedJob,
  CompanyFollow,
  JobAlert,
  Notification,
  Otp,
  Setting,
} = require("../src/models");
const {
  ADMIN_ROLES,
  ADMIN_STATUS,
  EMPLOYER_STATUS,
  CANDIDATE_STATUS,
  JOB_MODERATION,
} = require("../src/config/constants");

jest.setTimeout(35000);

let mongoServer;
const adminPath = env.ADMIN_PATH || "admin";

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});

beforeEach(async () => {
  jest.restoreAllMocks();
  await Promise.all([
    Admin.deleteMany({}),
    Employer.deleteMany({}),
    Candidate.deleteMany({}),
    Job.deleteMany({}),
    Application.deleteMany({}),
    AuditLog.deleteMany({}),
    Feedback.deleteMany({}),
    Review.deleteMany({}),
    Article.deleteMany({}),
    SavedJob.deleteMany({}),
    CompanyFollow.deleteMany({}),
    JobAlert.deleteMany({}),
    Notification.deleteMany({}),
    Otp.deleteMany({}),
    Setting.deleteMany({}),
  ]);
});

function mergeCookies(oldCookies = [], newCookies = []) {
  const map = new Map();
  [...oldCookies, ...newCookies].forEach((c) => {
    const name = c.split("=")[0].trim();
    map.set(name, c);
  });
  return Array.from(map.values());
}

async function getCsrfAndCookies(url, existingCookies = []) {
  const req = request(app).get(url);
  if (existingCookies.length) {
    req.set("Cookie", existingCookies);
  }
  const res = await req;
  const newCookies = res.headers["set-cookie"] || [];
  const merged = mergeCookies(existingCookies, newCookies);
  const csrfMatch =
    res.text.match(/name="_csrf"\s+value="([^"]+)"/) ||
    res.text.match(/meta name="csrf-token" content="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";
  return { cookies: merged, csrfToken, res };
}

async function createAndLoginAdmin(role = ADMIN_ROLES.SUPERADMIN, customEmail = null) {
  const passwordHash = await bcrypt.hash("AdminPass123!", 10);
  const admin = await Admin.create({
    fullName: role === ADMIN_ROLES.SUPERADMIN ? "Super Admin QA" : "Moderator Admin QA",
    email: customEmail || `${role}.qa@vnitjobs.vn`,
    password: passwordHash,
    role,
    status: ADMIN_STATUS.ACTIVE,
  });

  const init = await getCsrfAndCookies(`/${adminPath}/login`);
  const loginRes = await request(app)
    .post(`/${adminPath}/login`)
    .set("Cookie", init.cookies)
    .type("form")
    .send({
      email: admin.email,
      password: "AdminPass123!",
      _csrf: init.csrfToken,
    });

  const cookies = mergeCookies(init.cookies, loginRes.headers["set-cookie"] || []);
  return { admin, cookies };
}

describe("Slice 1 QA Remediation Suite (Admin, Rate Limits, Password Reset & CMS)", () => {
  test("QA-B05 & QA-m03: Admin tạo mới NTD và Ứng viên tự động bật isEmailVerified=true (và approvedAt), avatar.svg trả 200", async () => {
    const { admin, cookies } = await createAndLoginAdmin();

    // 1. Kiểm tra /assets/images/avatar.svg không bị 404
    const avatarRes = await request(app).get("/assets/images/avatar.svg");
    expect(avatarRes.status).toBe(200);
    expect(avatarRes.headers["content-type"]).toContain("svg");

    // 2. Tạo Employer active qua Admin
    const empCreatePage = await getCsrfAndCookies(`/${adminPath}/employers/create`, cookies);
    const empCreateRes = await request(app)
      .post(`/${adminPath}/employers/create`)
      .set("Cookie", empCreatePage.cookies)
      .type("form")
      .send({
        _csrf: empCreatePage.csrfToken,
        companyName: "Công ty QA Admin Created",
        email: "emp-created@qa.vn",
        city: "ha-noi",
        status: EMPLOYER_STATUS.ACTIVE,
      });

    expect(empCreateRes.status).toBe(302);
    const createdEmp = await Employer.findOne({ email: "emp-created@qa.vn" });
    expect(createdEmp).toBeTruthy();
    expect(createdEmp.isEmailVerified).toBe(true);
    expect(createdEmp.approvedAt).not.toBeNull();
    expect(String(createdEmp.approvedBy)).toBe(String(admin._id));

    // Lấy mật khẩu tạm từ flash hiển thị trên trang chi tiết NTD và đăng nhập thật
    const empDetailRes = await request(app)
      .get(empCreateRes.headers.location)
      .set("Cookie", mergeCookies(empCreatePage.cookies, empCreateRes.headers["set-cookie"] || []));
    const empPassMatch = empDetailRes.text.match(/Itj@[a-f0-9]{8}/);
    expect(empPassMatch).toBeTruthy();

    const empLoginInit = await getCsrfAndCookies("/employer/login");
    const empLoginRes = await request(app)
      .post("/employer/login")
      .set("Cookie", empLoginInit.cookies)
      .type("form")
      .send({
        _csrf: empLoginInit.csrfToken,
        email: "emp-created@qa.vn",
        password: empPassMatch[0],
      });
    expect(empLoginRes.status).toBe(302);
    expect((empLoginRes.headers["set-cookie"] || []).some((c) => c.startsWith("itj_token="))).toBe(true);

    // 3. Tạo Candidate qua Admin
    const candCreatePage = await getCsrfAndCookies(`/${adminPath}/candidates/create`, cookies);
    const candCreateRes = await request(app)
      .post(`/${adminPath}/candidates/create`)
      .set("Cookie", candCreatePage.cookies)
      .type("form")
      .send({
        _csrf: candCreatePage.csrfToken,
        fullName: "Ứng viên QA Admin",
        email: "cand-created@qa.vn",
        phone: "0988111222",
      });

    expect(candCreateRes.status).toBe(302);
    const createdCand = await Candidate.findOne({ email: "cand-created@qa.vn" });
    expect(createdCand).toBeTruthy();
    expect(createdCand.isEmailVerified).toBe(true);

    const candDetailRes = await request(app)
      .get(candCreateRes.headers.location)
      .set("Cookie", mergeCookies(candCreatePage.cookies, candCreateRes.headers["set-cookie"] || []));
    const candPassMatch = candDetailRes.text.match(/Itj@[a-f0-9]{8}/);
    expect(candPassMatch).toBeTruthy();

    const candLoginInit = await getCsrfAndCookies("/candidate/login");
    const candLoginRes = await request(app)
      .post("/candidate/login")
      .set("Cookie", candLoginInit.cookies)
      .type("form")
      .send({
        _csrf: candLoginInit.csrfToken,
        email: "cand-created@qa.vn",
        password: candPassMatch[0],
      });
    expect(candLoginRes.status).toBe(302);
    expect((candLoginRes.headers["set-cookie"] || []).some((c) => c.startsWith("itj_token="))).toBe(true);
  });

  test("QA-B06, QA-P01 & QA-P08: Phân trang Admin encodeURIComponent, Duyệt nhanh, Sort dropdown & Feedbacks totalAllCount + contact badge + adminNote", async () => {
    const { cookies } = await createAndLoginAdmin();

    // Seed 12 NTD với từ khóa C++ để xuất hiện phân trang > 1 trang
    const empDocs = [];
    for (let i = 1; i <= 12; i++) {
      empDocs.push({
        companyName: `C++ Studio ${String(i).padStart(2, "0")}`,
        slug: `cpp-studio-${i}`,
        email: `cpp${i}@studio.vn`,
        password: "HashedPassword",
        city: "ha-noi",
        status: i === 1 ? EMPLOYER_STATUS.PENDING : EMPLOYER_STATUS.ACTIVE,
        isEmailVerified: true,
      });
    }
    await Employer.insertMany(empDocs);

    const empListRes = await request(app)
      .get(`/${adminPath}/employers?keyword=${encodeURIComponent("C++")}&sort=name-asc&page=1`)
      .set("Cookie", cookies);

    expect(empListRes.status).toBe(200);
    // Encode C++ -> C%2B%2B trong link phân trang & giữ sort=name-asc
    expect(empListRes.text).toContain("keyword=C%2B%2B");
    expect(empListRes.text).toContain("sort=name-asc");
    expect(empListRes.text).toContain("page=2");
    expect(empListRes.text).toContain("Duyệt nhanh");
    expect(empListRes.text).toContain("whitespace-nowrap");

    // Seed 17 Feedbacks (16 contact + 1 bug) để kiểm tra totalAllCount & phân trang số
    const fbDocs = [
      {
        type: "bug",
        title: "Lỗi nhỏ UI",
        content: "Chi tiết lỗi UI",
        status: "new",
      },
    ];
    for (let i = 1; i <= 16; i++) {
      fbDocs.push({
        type: "contact",
        title: `Liên hệ hợp tác #${i}`,
        content: `Nội dung liên hệ doanh nghiệp #${i}`,
        contactName: `Đối tác ${i}`,
        contactEmail: `partner${i}@corp.vn`,
        status: "new",
      });
    }
    await Feedback.insertMany(fbDocs);

    const fbPage = await getCsrfAndCookies(`/${adminPath}/feedbacks?type=contact&page=1`, cookies);
    expect(fbPage.res.status).toBe(200);
    // Thẻ Tổng phản hồi vẫn hiển thị 17 (toàn cục) dù đang lọc type=contact (16 bản ghi)
    expect(fbPage.res.text).toContain(">17<");
    expect(fbPage.res.text).toContain("📩 Liên hệ");
    expect(fbPage.res.text).toContain('name="adminNote"');
    expect(fbPage.res.text).toContain("?page=2&amp;type=contact");
  });

  test("QA-M04: Admin kiểm duyệt Đánh giá công ty (GET /reviews, toggle Approve/Hide, Delete + AuditLog)", async () => {
    const { cookies } = await createAndLoginAdmin();

    const emp = await Employer.create({
      companyName: "Review Target Corp",
      slug: "review-target-corp",
      email: "hr@reviewtarget.vn",
      password: "Pass",
      status: EMPLOYER_STATUS.ACTIVE,
      isEmailVerified: true,
    });

    const hiddenReview = await Review.create({
      employerId: emp._id,
      authorName: "Kỹ sư Ẩn Danh",
      rating: 4,
      title: "Quy trình phỏng vấn nhanh chóng, roadmap rõ ràng",
      pros: "Team thân thiện",
      cons: "Cần thêm ngân sách đào tạo",
      isApproved: false,
      toxicityScore: 60,
    });

    // 1. Lọc danh sách review đang bị ẩn
    const listPage = await getCsrfAndCookies(`/${adminPath}/reviews?status=hidden`, cookies);
    expect(listPage.res.status).toBe(200);
    expect(listPage.res.text).toContain("Quy trình phỏng vấn nhanh chóng, roadmap rõ ràng");
    expect(listPage.res.text).toContain("Đang ẩn");

    // 2. Bấm Duyệt hiển thị
    const toggleRes = await request(app)
      .post(`/${adminPath}/reviews/${hiddenReview._id}/toggle`)
      .set("Cookie", listPage.cookies)
      .type("form")
      .send({ _csrf: listPage.csrfToken });
    expect(toggleRes.status).toBe(302);

    const afterApprove = await Review.findById(hiddenReview._id);
    expect(afterApprove.isApproved).toBe(true);
    expect(
      await AuditLog.exists({ action: "review.approve", targetType: "Review", targetId: String(hiddenReview._id) })
    ).toBeTruthy();

    // 3. Xóa vĩnh viễn review
    const deleteRes = await request(app)
      .post(`/${adminPath}/reviews/${hiddenReview._id}/delete`)
      .set("Cookie", listPage.cookies)
      .type("form")
      .send({ _csrf: listPage.csrfToken });
    expect(deleteRes.status).toBe(302);
    expect(await Review.findById(hiddenReview._id)).toBeNull();
    expect(
      await AuditLog.exists({ action: "review.delete", targetType: "Review", targetId: String(hiddenReview._id) })
    ).toBeTruthy();
  });

  test("QA-M06: Tách biệt otpSendRateLimiter / otpVerifyRateLimiter / admin2faVerifyRateLimiter, đúng hướng redirect otpLimitHandler và bypassCsrfIfLoggedOut cho Admin", async () => {
    const miniApp = express();
    miniApp.use(express.urlencoded({ extended: false }));
    miniApp.use(express.json());

    const limiters = createRateLimiters({
      enforceLimits: true,
      maxOverrides: {
        otpSendPerEmail: 1,
        otpSendPerIp: 4,
        otpVerifyPerEmail: 2,
        otpVerifyPerIp: 4,
        admin2faVerifyPerIp: 2,
      },
    });

    miniApp.post("/candidate/signup", limiters.otpSendRateLimiter, (_req, res) => res.status(200).send("ok"));
    miniApp.post("/employer/resend-registration-otp", limiters.otpSendRateLimiter, (_req, res) =>
      res.status(200).send("ok")
    );
    miniApp.post("/employer/verify-registration", limiters.otpVerifyRateLimiter, (_req, res) =>
      res.status(200).send("verified")
    );
    miniApp.post("/admin/verify-2fa", limiters.admin2faVerifyRateLimiter, (_req, res) =>
      res.status(200).send("2fa-ok")
    );

    // 1. /candidate/signup vượt ngưỡng gửi OTP -> redirect về /candidate/signup (KHÔNG đẩy nhầm sang forgot-password!)
    expect((await request(miniApp).post("/candidate/signup").send({ email: "u1@test.com" })).status).toBe(200);
    const blockedSignup = await request(miniApp).post("/candidate/signup").send({ email: "u1@test.com" });
    expect(blockedSignup.status).toBe(302);
    expect(blockedSignup.headers.location).toBe("/candidate/signup");

    // 2. /employer/resend-registration-otp bị chặn -> redirect /employer/verify-registration?email=...
    expect(
      (await request(miniApp).post("/employer/resend-registration-otp").send({ email: "HR@Corp.vn" })).status
    ).toBe(200);
    const blockedResend = await request(miniApp)
      .post("/employer/resend-registration-otp")
      .send({ email: "HR@Corp.vn" });
    expect(blockedResend.status).toBe(302);
    expect(blockedResend.headers.location).toBe("/employer/verify-registration?email=hr%40corp.vn");

    // 3. Mặc dù otpSendRateLimiter đã chạm trần, otpVerifyRateLimiter vẫn cho phép nhập mã OTP độc lập!
    const verifyAttempt = await request(miniApp)
      .post("/employer/verify-registration")
      .send({ email: "hr@corp.vn", otp: "123456" });
    expect(verifyAttempt.status).toBe(200);

    // 4. admin2faVerifyRateLimiter chặn ở lần thứ 3 theo ngưỡng override
    expect((await request(miniApp).post("/admin/verify-2fa").send({ otp: "111111" })).status).toBe(200);
    expect((await request(miniApp).post("/admin/verify-2fa").send({ otp: "222222" })).status).toBe(200);
    const blocked2fa = await request(miniApp).post("/admin/verify-2fa").send({ otp: "333333" });
    expect(blocked2fa.status).toBe(302);
    expect(blocked2fa.headers.location).toBe(`/${adminPath}/login`);

    // 5. POST /admin/logout khi đã hết phiên (không kèm CSRF token) không văng 403 mà redirect sạch về /admin/login
    const loggedOutLogout = await request(app).post(`/${adminPath}/logout`).type("form").send({});
    expect(loggedOutLogout.status).toBe(302);
    expect(loggedOutLogout.headers.location).toBe(`/${adminPath}/login`);
  });

  test("QA-M07: replaceState trên verify-2fa / OTP / reset-password, bắt lỗi SMTP trong Admin 2FA, và bật isEmailVerified sau khi reset mật khẩu", async () => {
    const passwordHash = await hashPassword("AdminPass123!");
    await Admin.create({
      fullName: "2FA Admin",
      email: "2fa.smtp@vnitjobs.vn",
      password: passwordHash,
      role: ADMIN_ROLES.SUPERADMIN,
      status: ADMIN_STATUS.ACTIVE,
    });

    // 1. Khi SMTP lỗi trong postLogin -> trả 500, không cấp challenge cookie & không báo gửi thành công giả
    jest
      .spyOn(mailService, "sendAdmin2faOtpEmail")
      .mockResolvedValueOnce({ success: false, error: "SMTP Connection Refused" });

    const loginInit = await getCsrfAndCookies(`/${adminPath}/login`);
    const failedSmtpLogin = await request(app)
      .post(`/${adminPath}/login`)
      .set("Cookie", loginInit.cookies)
      .type("form")
      .send({
        _csrf: loginInit.csrfToken,
        email: "2fa.smtp@vnitjobs.vn",
        password: "AdminPass123!",
        require2fa: true,
      });

    expect(failedSmtpLogin.status).toBe(500);
    expect(failedSmtpLogin.text).toContain("Không thể gửi email xác thực 2FA");
    expect((failedSmtpLogin.headers["set-cookie"] || []).some((c) => c.startsWith("itj_admin_2fa_challenge="))).toBe(
      false
    );

    // 2. Khi SMTP hoạt động bình thường -> 200 render verify-2fa có chứa history.replaceState
    jest.restoreAllMocks();
    const okLogin = await request(app)
      .post(`/${adminPath}/login`)
      .set("Cookie", loginInit.cookies)
      .type("form")
      .send({
        _csrf: loginInit.csrfToken,
        email: "2fa.smtp@vnitjobs.vn",
        password: "AdminPass123!",
        require2fa: true,
      });

    expect(okLogin.status).toBe(200);
    expect(okLogin.text).toContain(`window.history.replaceState(null, "", "/${adminPath}/verify-2fa")`);

    // 3. Đặt lại mật khẩu cho Candidate chưa xác thực email -> tự động gán isEmailVerified = true & render replaceState khi gõ mật khẩu yếu
    const unverifiedCand = await Candidate.create({
      fullName: "Unverified Reset User",
      email: "unverified.reset@qa.vn",
      password: await hashPassword("OldPass123!"),
      isEmailVerified: false,
      status: CANDIDATE_STATUS.ACTIVE,
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await Otp.create({
      email: unverifiedCand.email,
      otpHash: await bcrypt.hash("123456", 10),
      userType: "candidate",
      type: "forgot_password",
      isVerified: true,
      resetToken: tokenHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const resetPage = await getCsrfAndCookies(
      `/candidate/reset-password?email=${encodeURIComponent(unverifiedCand.email)}&token=${rawToken}`
    );
    expect(resetPage.res.status).toBe(200);
    expect(resetPage.res.text).toContain("resetPasswordReplaceState");
    expect(resetPage.res.text).toContain(`token=${rawToken}`);

    // Nhập mật khẩu quá ngắn -> trả 400 nhưng vẫn giữ token trong data-url của replaceState & không tiêu hủy token DB
    const weakRes = await request(app)
      .post("/candidate/reset-password")
      .set("Cookie", resetPage.cookies)
      .type("form")
      .send({
        _csrf: resetPage.csrfToken,
        email: unverifiedCand.email,
        token: rawToken,
        newPassword: "short",
        confirmPassword: "short",
      });
    expect(weakRes.status).toBe(400);
    expect(weakRes.text).toContain(`token=${rawToken}`);

    // Đặt mật khẩu hợp lệ -> thành công và isEmailVerified === true
    const okResetRes = await request(app)
      .post("/candidate/reset-password")
      .set("Cookie", resetPage.cookies)
      .type("form")
      .send({
        _csrf: resetPage.csrfToken,
        email: unverifiedCand.email,
        token: rawToken,
        newPassword: "StrongPassword123",
        confirmPassword: "StrongPassword123",
      });
    expect(okResetRes.status).toBe(302);
    const refreshedCand = await Candidate.findById(unverifiedCand._id);
    expect(refreshedCand.isEmailVerified).toBe(true);
  });

  test("QA-M09: Tài khoản HR phụ (teamMembers) khôi phục mật khẩu qua OTP thành công và tăng member.tokenVersion", async () => {
    const ownerHash = await hashPassword("OwnerPass123!");
    const memberHash = await hashPassword("OldMemberPass123!");

    const employer = await Employer.create({
      companyName: "Team Reset Corp",
      slug: "team-reset-corp",
      email: "owner@teamreset.vn",
      password: ownerHash,
      status: EMPLOYER_STATUS.ACTIVE,
      isEmailVerified: true,
      teamMembers: [
        {
          fullName: "HR Recruiter Sub",
          email: "recruiter@teamreset.vn",
          password: memberHash,
          role: "recruiter",
          tokenVersion: 2,
        },
      ],
    });

    // 1. Yêu cầu quên mật khẩu bằng email của teamMember
    const forgotPage = await getCsrfAndCookies("/employer/forgot-password");
    const forgotRes = await request(app)
      .post("/employer/forgot-password")
      .set("Cookie", forgotPage.cookies)
      .type("form")
      .send({
        _csrf: forgotPage.csrfToken,
        email: "recruiter@teamreset.vn",
      });

    expect(forgotRes.status).toBe(302);
    expect(forgotRes.headers.location).toContain("/employer/verify-otp?email=recruiter%40teamreset.vn");

    // 2. Xác thực OTP và đặt mật khẩu mới cho teamMember
    const knownOtpHash = await bcrypt.hash("654321", 10);
    await Otp.updateOne(
      { email: "recruiter@teamreset.vn", userType: "employer", type: "forgot_password" },
      { $set: { otpHash: knownOtpHash } }
    );

    const verifyPage = await getCsrfAndCookies(
      "/employer/verify-otp?email=recruiter%40teamreset.vn",
      forgotPage.cookies
    );
    const verifyRes = await request(app)
      .post("/employer/verify-otp")
      .set("Cookie", verifyPage.cookies)
      .type("form")
      .send({
        _csrf: verifyPage.csrfToken,
        email: "recruiter@teamreset.vn",
        otp: "654321",
      });
    expect(verifyRes.status).toBe(302);
    const resetUrl = new URL("http://localhost" + verifyRes.headers.location);
    const resetToken = resetUrl.searchParams.get("token");

    const resetPage = await getCsrfAndCookies(verifyRes.headers.location, verifyPage.cookies);
    const resetRes = await request(app)
      .post("/employer/reset-password")
      .set("Cookie", resetPage.cookies)
      .type("form")
      .send({
        _csrf: resetPage.csrfToken,
        email: "recruiter@teamreset.vn",
        token: resetToken,
        newPassword: "NewMemberPass999",
        confirmPassword: "NewMemberPass999",
      });

    expect(resetRes.status).toBe(302);
    expect(resetRes.headers.location).toBe("/employer/login");

    const updatedEmp = await Employer.findById(employer._id).select("+password +teamMembers.password");
    // Mật khẩu của Owner không bị đụng chạm
    expect(await bcrypt.compare("OwnerPass123!", updatedEmp.password)).toBe(true);
    // Mật khẩu của teamMember đã đổi & tokenVersion tăng từ 2 -> 3
    expect(await bcrypt.compare("NewMemberPass999", updatedEmp.teamMembers[0].password)).toBe(true);
    expect(updatedEmp.teamMembers[0].tokenVersion).toBe(3);

    // 3. Nếu công ty bị khóa (banned), teamMember không được phép yêu cầu OTP quên mật khẩu
    await Employer.updateOne({ _id: employer._id }, { $set: { status: EMPLOYER_STATUS.BANNED } });
    const bannedForgotPage = await getCsrfAndCookies("/employer/forgot-password");
    const bannedRes = await request(app)
      .post("/employer/forgot-password")
      .set("Cookie", bannedForgotPage.cookies)
      .type("form")
      .send({
        _csrf: bannedForgotPage.csrfToken,
        email: "recruiter@teamreset.vn",
      });
    expect(bannedRes.status).toBe(403);
  });

  test("QA-M14 & QA-m06: Bulk Approve không bật job của công ty banned/deleted; Unban khôi phục đúng PENDING nếu chưa từng được duyệt", async () => {
    const { cookies } = await createAndLoginAdmin();

    const [pendingEmp, bannedUnapprovedEmp, bannedApprovedEmp, deletedEmp] = await Employer.create([
      {
        companyName: "Pending Co",
        slug: "pending-co",
        email: "pending@co.vn",
        password: "Pass",
        status: EMPLOYER_STATUS.PENDING,
        approvedAt: null,
      },
      {
        companyName: "Banned Never Approved Co",
        slug: "banned-never-approved-co",
        email: "banned1@co.vn",
        password: "Pass",
        status: EMPLOYER_STATUS.BANNED,
        approvedAt: null,
      },
      {
        companyName: "Banned Previously Approved Co",
        slug: "banned-prev-approved-co",
        email: "banned2@co.vn",
        password: "Pass",
        status: EMPLOYER_STATUS.BANNED,
        approvedAt: new Date(Date.now() - 86400000),
      },
      {
        companyName: "Soft Deleted Co",
        slug: "soft-deleted-co",
        email: "deleted@co.vn",
        password: "Pass",
        status: EMPLOYER_STATUS.PENDING,
        deletedAt: new Date(),
      },
    ]);

    const [pendingJob, bannedJob1, bannedJob2, deletedEmpJob] = await Job.create([
      {
        employerId: pendingEmp._id,
        title: "Pending Job",
        slug: "pending-job-qa",
        position: "junior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: false,
        moderation: JOB_MODERATION.VISIBLE,
      },
      {
        employerId: bannedUnapprovedEmp._id,
        title: "Banned Unapproved Job",
        slug: "banned-job-1",
        position: "junior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: false,
        moderation: JOB_MODERATION.VISIBLE,
      },
      {
        employerId: bannedApprovedEmp._id,
        title: "Banned Approved Job",
        slug: "banned-job-2",
        position: "senior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: false,
        moderation: JOB_MODERATION.VISIBLE,
      },
      {
        employerId: deletedEmp._id,
        title: "Deleted Emp Job",
        slug: "deleted-emp-job",
        position: "senior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: false,
        moderation: JOB_MODERATION.VISIBLE,
      },
    ]);

    // 1. Bulk approve tích chọn cả 4 công ty -> CHỈ bật job của pendingEmp!
    const page = await getCsrfAndCookies(`/${adminPath}/employers`, cookies);
    const bulkRes = await request(app)
      .post(`/${adminPath}/employers/bulk`)
      .set("Cookie", page.cookies)
      .type("form")
      .send({
        _csrf: page.csrfToken,
        action: "approve",
        ids: [
          String(pendingEmp._id),
          String(bannedUnapprovedEmp._id),
          String(bannedApprovedEmp._id),
          String(deletedEmp._id),
        ],
      });
    expect(bulkRes.status).toBe(302);

    expect((await Job.findById(pendingJob._id)).employerActive).toBe(true);
    expect((await Job.findById(bannedJob1._id)).employerActive).toBe(false);
    expect((await Job.findById(bannedJob2._id)).employerActive).toBe(false);
    expect((await Job.findById(deletedEmpJob._id)).employerActive).toBe(false);

    // 2. postApprove chặn công ty đã xóa mềm
    const approveDeletedRes = await request(app)
      .post(`/${adminPath}/employers/${deletedEmp._id}/approve`)
      .set("Cookie", page.cookies)
      .type("form")
      .send({ _csrf: page.csrfToken });
    expect(approveDeletedRes.status).toBe(302);
    expect((await Employer.findById(deletedEmp._id)).status).toBe(EMPLOYER_STATUS.PENDING);
    expect((await Job.findById(deletedEmpJob._id)).employerActive).toBe(false);

    // 3. postUnban công ty chưa từng được duyệt -> về PENDING & giữ employerActive: false
    await request(app)
      .post(`/${adminPath}/employers/${bannedUnapprovedEmp._id}/unban`)
      .set("Cookie", page.cookies)
      .type("form")
      .send({ _csrf: page.csrfToken });
    expect((await Employer.findById(bannedUnapprovedEmp._id)).status).toBe(EMPLOYER_STATUS.PENDING);
    expect((await Job.findById(bannedJob1._id)).employerActive).toBe(false);

    // 4. postUnban công ty đã có approvedAt -> về ACTIVE & bật employerActive: true
    await request(app)
      .post(`/${adminPath}/employers/${bannedApprovedEmp._id}/unban`)
      .set("Cookie", page.cookies)
      .type("form")
      .send({ _csrf: page.csrfToken });
    expect((await Employer.findById(bannedApprovedEmp._id)).status).toBe(EMPLOYER_STATUS.ACTIVE);
    expect((await Job.findById(bannedJob2._id)).employerActive).toBe(true);
  });

  test("QA-M15: Chuẩn hóa custom slug qua slugify() trong blog.service và khóa chế độ chỉ đọc /settings/about với Admin thường", async () => {
    // 1. Tạo bài viết với slug tiếng Việt có dấu & ký tự C++/.NET
    const art1 = await blogService.createArticle({
      title: "Lộ trình C++ & .NET 2026",
      slug: "Lộ Trình C++ & C# .NET Thực Chiến!",
      summary: "Tóm tắt bài viết",
      content: "<p>Nội dung chi tiết</p>",
    });
    expect(art1.slug).toBe("lo-trinh-c-plus-plus-c-sharp-dotnet-thuc-chien");

    // Trùng custom slug khi tạo bài thứ 2 -> tự động gắn hậu tố ngẫu nhiên hợp lệ
    const art2 = await blogService.createArticle({
      title: "Bài viết thứ hai",
      slug: "Lộ Trình C++ & C# .NET Thực Chiến!",
      summary: "Tóm tắt 2",
      content: "<p>Nội dung 2</p>",
    });
    expect(art2.slug).toMatch(/^lo-trinh-c-plus-plus-c-sharp-dotnet-thuc-chien-[a-z0-9]+$/);

    // Cập nhật bài viết với custom slug có dấu/khoảng trắng
    const updatedArt2 = await blogService.updateArticle(art2._id, {
      slug: "Bí Quyết Đàm Phán Lương Senior 2026",
    });
    expect(updatedArt2.slug).toBe("bi-quyet-dam-phan-luong-senior-2026");

    // 2. Admin thường mở /admin/settings/about thấy banner chỉ đọc, các ô disabled và không có nút Lưu thay đổi
    const { cookies: regularAdminCookies } = await createAndLoginAdmin(ADMIN_ROLES.ADMIN, "mod.about@vnitjobs.vn");
    const aboutRes = await request(app)
      .get(`/${adminPath}/settings/about`)
      .set("Cookie", regularAdminCookies);

    expect(aboutRes.status).toBe(200);
    expect(aboutRes.text).toContain("Chế độ chỉ đọc");
    expect(aboutRes.text).toContain("disabled");
    expect(aboutRes.text).not.toContain("Lưu thay đổi");
  });

  test("QA-m11: Hard-delete dọn sạch dữ liệu phụ & file, Ban/SoftDelete/ResetPassword tăng teamMembers tokenVersion, Admin tự đổi mật khẩu & nút AI Kiểm duyệt Job", async () => {
    const { admin, cookies } = await createAndLoginAdmin();

    const deleteFileSpy = jest.spyOn(storageService, "deleteFile");
    const deleteCvSpy = jest.spyOn(storageService, "deleteCV");

    // 1. Tạo Employer có logo, teamMember, job (có ảnh), application (có CV), follow, review, savedJob, notification, otp
    const emp = await Employer.create({
      companyName: "Cascade Delete Corp",
      slug: "cascade-delete-corp",
      email: "owner@cascade.vn",
      password: await hashPassword("Pass12345"),
      logo: { url: "/uploads/logos/logo-test1234.webp", key: "logo-test1234.webp" },
      status: EMPLOYER_STATUS.ACTIVE,
      tokenVersion: 1,
      teamMembers: [
        {
          fullName: "Sub HR",
          email: "subhr@cascade.vn",
          password: await hashPassword("SubPass123"),
          role: "recruiter",
          tokenVersion: 4,
        },
      ],
    });

    const cand = await Candidate.create({
      fullName: "Cascade Candidate",
      email: "cand@cascade.vn",
      password: await hashPassword("CandPass123"),
      avatar: { url: "/uploads/avatars/avatar-cand1234.webp", key: "avatar-cand1234.webp" },
      status: CANDIDATE_STATUS.ACTIVE,
    });

    const job = await Job.create({
      employerId: emp._id,
      title: "Backend Architect",
      slug: "backend-architect-cascade",
      position: "senior",
      workingForm: "office",
      city: "ha-noi",
      images: [{ url: "/uploads/jobs/job-img1234.webp", key: "job-img1234.webp" }],
      employerActive: true,
      moderation: JOB_MODERATION.VISIBLE,
    });

    // Kiểm tra trang chi tiết NTD có nút AI Kiểm duyệt gắn data-job-id
    const detailPage = await getCsrfAndCookies(`/${adminPath}/employers/${emp._id}`, cookies);
    expect(detailPage.res.status).toBe(200);
    expect(detailPage.res.text).toContain("AI Kiểm duyệt");
    expect(detailPage.res.text).toContain(`data-job-id="${job._id}"`);

    // Kiểm tra Ban -> tăng cả employer.tokenVersion VÀ teamMembers[0].tokenVersion
    await request(app)
      .post(`/${adminPath}/employers/${emp._id}/ban`)
      .set("Cookie", detailPage.cookies)
      .type("form")
      .send({ _csrf: detailPage.csrfToken, reason: "Test khóa đồng bộ teamMembers" });

    let empCheck = await Employer.findById(emp._id);
    expect(empCheck.tokenVersion).toBe(2);
    expect(empCheck.teamMembers[0].tokenVersion).toBe(5);

    // Kiểm tra Reset Password -> tăng tiếp cả 2 tokenVersion
    await request(app)
      .post(`/${adminPath}/employers/${emp._id}/reset-password`)
      .set("Cookie", detailPage.cookies)
      .type("form")
      .send({ _csrf: detailPage.csrfToken });

    empCheck = await Employer.findById(emp._id);
    expect(empCheck.tokenVersion).toBe(3);
    expect(empCheck.teamMembers[0].tokenVersion).toBe(6);

    // Kiểm tra Soft Delete -> tăng tiếp cả 2 tokenVersion
    await request(app)
      .post(`/${adminPath}/employers/${emp._id}/delete`)
      .set("Cookie", detailPage.cookies)
      .type("form")
      .send({ _csrf: detailPage.csrfToken });

    empCheck = await Employer.findById(emp._id);
    expect(empCheck.tokenVersion).toBe(4);
    expect(empCheck.teamMembers[0].tokenVersion).toBe(7);

    // Gắn các bản ghi liên kết phụ cho cả Employer và Candidate
    await Application.create({
      jobId: job._id,
      employerId: emp._id,
      candidateId: cand._id,
      fullName: cand.fullName,
      email: cand.email,
      phone: "0912345678",
      cv: { key: "cv-cascade-emp.pdf", originalName: "CV.pdf", size: 1024 },
    });
    await SavedJob.create({ candidateId: cand._id, jobId: job._id });
    await CompanyFollow.create({ candidateId: cand._id, employerId: emp._id });
    await Review.create({
      employerId: emp._id,
      authorCandidateId: cand._id,
      authorName: cand.fullName,
      rating: 5,
      title: "Great place",
    });
    await Notification.create([
      { recipientId: emp._id, recipientType: "employer", title: "TB NTD", message: "Msg" },
      { recipientId: cand._id, recipientType: "candidate", title: "TB UV", message: "Msg" },
    ]);
    await JobAlert.create({ email: cand.email, candidateId: cand._id, keyword: "NodeJS" });
    await Otp.create([
      {
        email: emp.email,
        otpHash: "h1",
        userType: "employer",
        expiresAt: new Date(Date.now() + 60000),
      },
      {
        email: cand.email,
        otpHash: "h2",
        userType: "candidate",
        expiresAt: new Date(Date.now() + 60000),
      },
    ]);

    // Hard-delete Employer
    const hardDelEmpRes = await request(app)
      .post(`/${adminPath}/employers/${emp._id}/hard-delete`)
      .set("Cookie", detailPage.cookies)
      .type("form")
      .send({ _csrf: detailPage.csrfToken });
    expect(hardDelEmpRes.status).toBe(302);

    expect(deleteFileSpy).toHaveBeenCalledWith("logo-test1234.webp", "logos");
    expect(deleteFileSpy).toHaveBeenCalledWith("job-img1234.webp", "jobs");
    expect(deleteCvSpy).toHaveBeenCalledWith("cv-cascade-emp.pdf");
    expect(await Employer.findById(emp._id)).toBeNull();
    expect(await Job.countDocuments({ employerId: emp._id })).toBe(0);
    expect(await Application.countDocuments({ employerId: emp._id })).toBe(0);
    expect(await SavedJob.countDocuments({ jobId: job._id })).toBe(0);
    expect(await CompanyFollow.countDocuments({ employerId: emp._id })).toBe(0);
    expect(await Review.countDocuments({ employerId: emp._id })).toBe(0);
    expect(await Notification.countDocuments({ recipientId: emp._id })).toBe(0);
    expect(await Otp.countDocuments({ email: emp.email })).toBe(0);

    // Hard-delete Candidate (tạo thêm 1 đơn mới của candidate sang công ty khác để test deleteCV phía candidate)
    const otherEmp = await Employer.create({
      companyName: "Other Corp",
      slug: "other-corp",
      email: "other@corp.vn",
      password: "Pass",
    });
    const otherJob = await Job.create({
      employerId: otherEmp._id,
      title: "DevOps Engineer",
      slug: "devops-other",
      position: "senior",
      workingForm: "remote",
      city: "ha-noi",
    });
    await Application.create({
      jobId: otherJob._id,
      employerId: otherEmp._id,
      candidateId: cand._id,
      fullName: cand.fullName,
      email: cand.email,
      phone: "0912345678",
      cv: { key: "cv-cascade-cand.pdf", originalName: "CV2.pdf", size: 2048 },
    });

    const hardDelCandRes = await request(app)
      .post(`/${adminPath}/candidates/${cand._id}/hard-delete`)
      .set("Cookie", detailPage.cookies)
      .type("form")
      .send({ _csrf: detailPage.csrfToken });
    expect(hardDelCandRes.status).toBe(302);

    expect(deleteFileSpy).toHaveBeenCalledWith("avatar-cand1234.webp", "avatars");
    expect(deleteCvSpy).toHaveBeenCalledWith("cv-cascade-cand.pdf");
    expect(await Candidate.findById(cand._id)).toBeNull();
    expect(await JobAlert.countDocuments({ candidateId: cand._id })).toBe(0);
    expect(await Notification.countDocuments({ recipientId: cand._id })).toBe(0);
    expect(await Otp.countDocuments({ email: cand.email })).toBe(0);

    // 2. Admin tự đổi mật khẩu tại /admin/change-password
    const cpPage = await getCsrfAndCookies(`/${adminPath}/change-password`, detailPage.cookies);
    expect(cpPage.res.status).toBe(200);
    expect(cpPage.res.text).toContain("Đổi mật khẩu Quản trị viên");

    const cpRes = await request(app)
      .post(`/${adminPath}/change-password`)
      .set("Cookie", cpPage.cookies)
      .type("form")
      .send({
        _csrf: cpPage.csrfToken,
        currentPassword: "AdminPass123!",
        newPassword: "NewAdminSecret99!",
        confirmPassword: "NewAdminSecret99!",
      });
    expect(cpRes.status).toBe(302);
    expect((cpRes.headers["set-cookie"] || []).some((c) => c.startsWith("itj_admin_token="))).toBe(true);

    const updatedAdmin = await Admin.findById(admin._id).select("+password");
    expect(await bcrypt.compare("NewAdminSecret99!", updatedAdmin.password)).toBe(true);
    expect(await AuditLog.exists({ action: "admin.changePassword", adminId: admin._id })).toBeTruthy();
  });
});
