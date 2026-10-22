const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const { Admin, Employer, Candidate, Job, Application, AuditLog } = require("../src/models");
const { ADMIN_ROLES, ADMIN_STATUS, EMPLOYER_STATUS, CANDIDATE_STATUS, JOB_MODERATION } = require("../src/config/constants");
const env = require("../src/config/env");

let mongoServer;
const adminPath = env.ADMIN_PATH || "admin";

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Admin.deleteMany({});
  await Employer.deleteMany({});
  await Candidate.deleteMany({});
  await Job.deleteMany({});
  await Application.deleteMany({});
  await AuditLog.deleteMany({});
});

describe("Phase 6: Admin Portal Integration Tests", () => {
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
    const csrfMatch = res.text.match(/name="_csrf"\s+value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : "";
    return { cookies: merged, csrfToken, res };
  }

  async function createAndLoginAdmin(role = ADMIN_ROLES.SUPERADMIN) {
    const passwordHash = await bcrypt.hash("AdminPass123", 12);
    const admin = await Admin.create({
      fullName: role === ADMIN_ROLES.SUPERADMIN ? "Super Admin" : "Regular Admin",
      email: `${role}@admin.vn`,
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
        password: "AdminPass123",
        _csrf: init.csrfToken,
      });

    const authCookies = mergeCookies(init.cookies, loginRes.headers["set-cookie"] || []);
    return { admin, cookies: authCookies };
  }

  describe("1. Admin Authentication & Role Isolation", () => {
    test("Chưa đăng nhập truy cập /admin -> chuyển hướng về /admin/login", async () => {
      const res = await request(app).get(`/${adminPath}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain(`/${adminPath}/login`);
    });

    test("Đăng nhập Admin thành công với thông tin chính xác", async () => {
      const { admin, cookies } = await createAndLoginAdmin();
      expect(cookies.some((c) => c.includes("itj_admin_token"))).toBe(true);

      const dashboardRes = await request(app).get(`/${adminPath}`).set("Cookie", cookies);
      expect(dashboardRes.status).toBe(200);
      expect(dashboardRes.text).toContain("Bảng điều khiển Hệ thống");
      expect(dashboardRes.text).toContain(admin.fullName);
    });

    test("Đăng nhập Admin thất bại khi sai mật khẩu", async () => {
      const passwordHash = await bcrypt.hash("AdminPass123", 12);
      await Admin.create({
        fullName: "Test Admin",
        email: "wrongpass@admin.vn",
        password: passwordHash,
        status: ADMIN_STATUS.ACTIVE,
      });

      const init = await getCsrfAndCookies(`/${adminPath}/login`);
      const res = await request(app)
        .post(`/${adminPath}/login`)
        .set("Cookie", init.cookies)
        .type("form")
        .send({
          email: "wrongpass@admin.vn",
          password: "WrongPassword",
          _csrf: init.csrfToken,
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain("Email hoặc mật khẩu không chính xác");
    });

    test("Cách ly token: Cookie itj_token của Ứng viên không thể truy cập trang /admin", async () => {
      const passwordHash = await bcrypt.hash("Password123", 10);
      const cand = await Candidate.create({
        fullName: "Fake Admin",
        email: "fake@cand.com",
        password: passwordHash,
      });

      const init = await getCsrfAndCookies("/candidate/login");
      const loginRes = await request(app)
        .post("/candidate/login")
        .set("Cookie", init.cookies)
        .type("form")
        .send({
          email: cand.email,
          password: "Password123",
          _csrf: init.csrfToken,
        });

      const candCookies = mergeCookies(init.cookies, loginRes.headers["set-cookie"] || []);
      const adminAccess = await request(app).get(`/${adminPath}`).set("Cookie", candCookies);
      expect(adminAccess.status).toBe(302);
      expect(adminAccess.headers.location).toContain(`/${adminPath}/login`);
    });

    test("Đăng xuất Admin xóa sạch cookie itj_admin_token", async () => {
      const { cookies } = await createAndLoginAdmin();
      const page = await getCsrfAndCookies(`/${adminPath}`, cookies);

      const logoutRes = await request(app)
        .post(`/${adminPath}/logout`)
        .set("Cookie", page.cookies)
        .type("form")
        .send({ _csrf: page.csrfToken });

      expect(logoutRes.status).toBe(302);
      expect(logoutRes.headers.location).toBe(`/${adminPath}/login`);

      const setCookies = logoutRes.headers["set-cookie"] || [];
      expect(setCookies.some((c) => c.includes("itj_admin_token=;"))).toBe(true);
    });
  });

  describe("2. Admin Dashboard & Thống kê", () => {
    test("GET /admin hiển thị số liệu thống kê đầy đủ", async () => {
      const { cookies } = await createAndLoginAdmin();

      await Employer.create({
        companyName: "Công ty Chờ Duyệt",
        slug: "cong-ty-cho-duyet",
        email: "pending@test.com",
        password: "Pass",
        status: EMPLOYER_STATUS.PENDING,
      });

      const res = await request(app).get(`/${adminPath}`).set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain("Tổng Ứng viên");
      expect(res.text).toContain("Tổng Nhà tuyển dụng");
      expect(res.text).toContain("NTD Chờ duyệt");
      expect(res.text).toContain("Công ty Chờ Duyệt");
    });
  });

  describe("3. Quản lý Nhà tuyển dụng (Employers)", () => {
    test("GET /admin/employers hiển thị danh sách và số lượng job", async () => {
      const { cookies } = await createAndLoginAdmin();
      const emp = await Employer.create({
        companyName: "Công ty FPT Software",
        slug: "fpt-software",
        email: "fpt@fpt.com",
        password: "Pass",
        status: EMPLOYER_STATUS.ACTIVE,
      });

      await Job.create({
        employerId: emp._id,
        title: "Java Senior Dev",
        slug: "java-senior-dev",
        position: "senior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const res = await request(app).get(`/${adminPath}/employers`).set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain("Công ty FPT Software");
      expect(res.text).toContain("fpt@fpt.com");
    });

    test("POST /admin/employers/:id/approve phê duyệt NTD pending và kích hoạt job", async () => {
      const { cookies } = await createAndLoginAdmin();
      const emp = await Employer.create({
        companyName: "Công ty Khởi Nghiệp AI",
        slug: "cong-ty-khoi-nghiep-ai",
        email: "ai@startup.vn",
        password: "Pass",
        status: EMPLOYER_STATUS.PENDING,
      });

      const job = await Job.create({
        employerId: emp._id,
        title: "AI Researcher",
        slug: "ai-researcher-job",
        position: "senior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: false,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const page = await getCsrfAndCookies(`/${adminPath}/employers`, cookies);
      const approveRes = await request(app)
        .post(`/${adminPath}/employers/${emp._id}/approve`)
        .set("Cookie", page.cookies)
        .type("form")
        .send({ _csrf: page.csrfToken });

      expect(approveRes.status).toBe(302);

      const updatedEmp = await Employer.findById(emp._id);
      expect(updatedEmp.status).toBe(EMPLOYER_STATUS.ACTIVE);
      expect(updatedEmp.approvedAt).not.toBeNull();

      const updatedJob = await Job.findById(job._id);
      expect(updatedJob.employerActive).toBe(true);

      // Verify AuditLog recorded
      const log = await AuditLog.findOne({ targetId: String(emp._id), action: "employer.approve" });
      expect(log).toBeTruthy();
    });

    test("POST /admin/employers/:id/ban khóa tài khoản NTD, tăng tokenVersion và ẩn job", async () => {
      const { cookies } = await createAndLoginAdmin();
      const emp = await Employer.create({
        companyName: "Công ty Vi Phạm",
        slug: "cong-ty-vi-pham",
        email: "vipham@test.com",
        password: "Pass",
        status: EMPLOYER_STATUS.ACTIVE,
        tokenVersion: 1,
      });

      const job = await Job.create({
        employerId: emp._id,
        title: "Tuyển dụng lừa đảo",
        slug: "tuyen-dung-lua-dao",
        position: "fresher",
        workingForm: "remote",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const page = await getCsrfAndCookies(`/${adminPath}/employers/${emp._id}`, cookies);
      const banRes = await request(app)
        .post(`/${adminPath}/employers/${emp._id}/ban`)
        .set("Cookie", page.cookies)
        .type("form")
        .send({
          _csrf: page.csrfToken,
          reason: "Đăng tin giả mạo lừa tiền ứng viên",
        });

      expect(banRes.status).toBe(302);

      const updatedEmp = await Employer.findById(emp._id);
      expect(updatedEmp.status).toBe(EMPLOYER_STATUS.BANNED);
      expect(updatedEmp.banReason).toBe("Đăng tin giả mạo lừa tiền ứng viên");
      expect(updatedEmp.tokenVersion).toBe(2);

      const updatedJob = await Job.findById(job._id);
      expect(updatedJob.employerActive).toBe(false);
    });

    test("POST /admin/employers/:id/reset-password sinh mật khẩu tạm mới và tăng tokenVersion", async () => {
      const { cookies } = await createAndLoginAdmin();
      const emp = await Employer.create({
        companyName: "Công ty Cần Reset MK",
        slug: "cong-ty-can-reset-mk",
        email: "reset@test.com",
        password: "OldPasswordHash",
        tokenVersion: 0,
      });

      const page = await getCsrfAndCookies(`/${adminPath}/employers/${emp._id}`, cookies);
      const resetRes = await request(app)
        .post(`/${adminPath}/employers/${emp._id}/reset-password`)
        .set("Cookie", page.cookies)
        .type("form")
        .send({ _csrf: page.csrfToken });

      expect(resetRes.status).toBe(302);

      const updatedEmp = await Employer.findById(emp._id);
      expect(updatedEmp.password).not.toBe("OldPasswordHash");
      expect(updatedEmp.tokenVersion).toBe(1);
    });

    test("POST /admin/jobs/:id/moderation ẩn hoặc hiện tin tuyển dụng", async () => {
      const { cookies } = await createAndLoginAdmin();
      const emp = await Employer.create({
        companyName: "Công ty Test Moderation",
        slug: "cong-ty-test-mod",
        email: "mod@test.com",
        password: "Pass",
      });

      const job = await Job.create({
        employerId: emp._id,
        title: "Việc làm kiểm duyệt",
        slug: "viec-lam-kiem-duyet",
        position: "junior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const page = await getCsrfAndCookies(`/${adminPath}/employers/${emp._id}`, cookies);
      const toggleRes = await request(app)
        .post(`/${adminPath}/jobs/${job._id}/moderation`)
        .set("Cookie", page.cookies)
        .type("form")
        .send({ _csrf: page.csrfToken });

      expect(toggleRes.status).toBe(302);

      const updatedJob = await Job.findById(job._id);
      expect(updatedJob.moderation).toBe(JOB_MODERATION.HIDDEN);
    });
  });

  describe("4. Quản lý Ứng viên (Candidates)", () => {
    test("POST /admin/candidates/:id/ban khóa tài khoản Ứng viên", async () => {
      const { cookies } = await createAndLoginAdmin();
      const cand = await Candidate.create({
        fullName: "Ứng Viên Spam",
        email: "spam@cand.com",
        password: "Pass",
        status: CANDIDATE_STATUS.ACTIVE,
        tokenVersion: 0,
      });

      const page = await getCsrfAndCookies(`/${adminPath}/candidates/${cand._id}`, cookies);
      const banRes = await request(app)
        .post(`/${adminPath}/candidates/${cand._id}/ban`)
        .set("Cookie", page.cookies)
        .type("form")
        .send({
          _csrf: page.csrfToken,
          reason: "Spam nộp hồ sơ ảo",
        });

      expect(banRes.status).toBe(302);

      const updatedCand = await Candidate.findById(cand._id);
      expect(updatedCand.status).toBe(CANDIDATE_STATUS.BANNED);
      expect(updatedCand.banReason).toBe("Spam nộp hồ sơ ảo");
      expect(updatedCand.tokenVersion).toBe(1);
    });

    test("POST /admin/candidates/:id/unban mở khóa Ứng viên", async () => {
      const { cookies } = await createAndLoginAdmin();
      const cand = await Candidate.create({
        fullName: "Ứng Viên Bị Khóa",
        email: "locked@cand.com",
        password: "Pass",
        status: CANDIDATE_STATUS.BANNED,
      });

      const page = await getCsrfAndCookies(`/${adminPath}/candidates/${cand._id}`, cookies);
      const unbanRes = await request(app)
        .post(`/${adminPath}/candidates/${cand._id}/unban`)
        .set("Cookie", page.cookies)
        .type("form")
        .send({ _csrf: page.csrfToken });

      expect(unbanRes.status).toBe(302);

      const updatedCand = await Candidate.findById(cand._id);
      expect(updatedCand.status).toBe(CANDIDATE_STATUS.ACTIVE);
    });
  });

  describe("5. Nhật ký hệ thống (Audit Logs)", () => {
    test("GET /admin/logs hiển thị danh sách nhật ký hành động", async () => {
      const { admin, cookies } = await createAndLoginAdmin();

      await AuditLog.create({
        adminId: admin._id,
        action: "employer.approve",
        targetType: "Employer",
        targetId: "67b8f9e01234567890abcdef",
        meta: { companyName: "Công ty Test Log" },
      });

      const res = await request(app).get(`/${adminPath}/logs`).set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain("employer.approve");
      expect(res.text).toContain("Công ty Test Log");
    });
  });
});
