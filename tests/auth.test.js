const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../src/app");
const { Candidate, Employer } = require("../src/models");
const { CANDIDATE_STATUS, EMPLOYER_STATUS } = require("../src/config/constants");
const { hashPassword } = require("../src/services/auth.service");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Candidate.deleteMany({});
  await Employer.deleteMany({});
});

describe("Phase 2: Auth & Role Isolation Tests", () => {
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

  describe("Candidate Auth", () => {
    test("Đăng ký ứng viên thành công", async () => {
      const { cookies, csrfToken } = await getCsrfAndCookies("/candidate/signup");
      const res = await request(app)
        .post("/candidate/signup")
        .set("Cookie", cookies)
        .send({
          _csrf: csrfToken,
          fullName: "Nguyễn Văn Test",
          email: "candidate.test@gmail.com",
          password: "Password123",
        });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/");
      expect(res.headers["set-cookie"]).toBeDefined();
      const hasToken = res.headers["set-cookie"].some((c) => c.includes("itj_token="));
      expect(hasToken).toBe(true);

      const created = await Candidate.findOne({ email: "candidate.test@gmail.com" });
      expect(created).not.toBeNull();
      expect(created.fullName).toBe("Nguyễn Văn Test");
    });

    test("Đăng ký thất bại khi mật khẩu không có số", async () => {
      const { cookies, csrfToken } = await getCsrfAndCookies("/candidate/signup");
      const res = await request(app)
        .post("/candidate/signup")
        .set("Cookie", cookies)
        .send({
          _csrf: csrfToken,
          fullName: "Nguyễn Văn Test",
          email: "candidate.test@gmail.com",
          password: "passwordwithoutnumber",
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain("Mật khẩu phải chứa ít nhất một chữ số");
    });

    test("Đăng nhập ứng viên thành công và chặn tài khoản bị khóa", async () => {
      const hashedPassword = await hashPassword("Password123");
      const candidate = await Candidate.create({
        fullName: "Lê Thị B",
        email: "candidate.b@gmail.com",
        password: hashedPassword,
        status: CANDIDATE_STATUS.ACTIVE,
      });

      const { cookies, csrfToken } = await getCsrfAndCookies("/candidate/login");

      // 1. Đăng nhập đúng
      const resSuccess = await request(app)
        .post("/candidate/login")
        .set("Cookie", cookies)
        .send({
          _csrf: csrfToken,
          email: "candidate.b@gmail.com",
          password: "Password123",
        });

      expect(resSuccess.status).toBe(302);
      const authCookie = resSuccess.headers["set-cookie"].find((c) => c.includes("itj_token="));
      expect(authCookie).toBeDefined();

      // 2. Bị ban tài khoản -> không đăng nhập được
      candidate.status = CANDIDATE_STATUS.BANNED;
      candidate.banReason = "Vi phạm chính sách cộng đồng";
      await candidate.save();

      const resBanned = await request(app)
        .post("/candidate/login")
        .set("Cookie", cookies)
        .send({
          _csrf: csrfToken,
          email: "candidate.b@gmail.com",
          password: "Password123",
        });

      expect(resBanned.status).toBe(403);
      expect(resBanned.text).toContain("Tài khoản của bạn đã bị khóa");
    });

    test("Đổi mật khẩu ứng viên thành công và tăng tokenVersion", async () => {
      const hashedPassword = await hashPassword("Password123");
      const candidate = await Candidate.create({
        fullName: "Nguyễn Đổi Pass",
        email: "doipass@gmail.com",
        password: hashedPassword,
        status: CANDIDATE_STATUS.ACTIVE,
      });

      // Login
      const { cookies: loginCookies, csrfToken: loginCsrf } = await getCsrfAndCookies("/candidate/login");
      const loginRes = await request(app)
        .post("/candidate/login")
        .set("Cookie", loginCookies)
        .send({
          _csrf: loginCsrf,
          email: "doipass@gmail.com",
          password: "Password123",
        });

      const authCookies = mergeCookies(loginCookies, loginRes.headers["set-cookie"] || []);

      // Truy cập trang change-password
      const { cookies: cpCookies, csrfToken: cpCsrf } = await getCsrfAndCookies("/candidate/change-password", authCookies);

      // Submit đổi mật khẩu
      const cpRes = await request(app)
        .post("/candidate/change-password")
        .set("Cookie", cpCookies)
        .send({
          _csrf: cpCsrf,
          currentPassword: "Password123",
          newPassword: "NewPassword456",
          confirmPassword: "NewPassword456",
        });

      expect(cpRes.status).toBe(302);
      expect(cpRes.headers.location).toBe("/candidate/profile");

      const updated = await Candidate.findById(candidate._id);
      expect(updated.tokenVersion).toBe(1);
    });
  });

  describe("Employer Auth & Cross-role Isolation", () => {
    test("Đăng ký nhà tuyển dụng thành công và mặc định chờ duyệt (pending)", async () => {
      const { cookies, csrfToken } = await getCsrfAndCookies("/employer/signup");
      const res = await request(app)
        .post("/employer/signup")
        .set("Cookie", cookies)
        .send({
          _csrf: csrfToken,
          companyName: "Công ty Công nghệ Alpha",
          email: "alpha@tech.com",
          password: "Password123",
        });

      expect(res.status).toBe(302);
      const employer = await Employer.findOne({ email: "alpha@tech.com" });
      expect(employer).not.toBeNull();
      expect(employer.status).toBe(EMPLOYER_STATUS.PENDING);
    });

    test("Đăng xuất thành công và xóa cookie itj_token", async () => {
      const hashedPassword = await hashPassword("Password123");
      await Candidate.create({
        fullName: "Logout Test",
        email: "logout@test.com",
        password: hashedPassword,
        status: CANDIDATE_STATUS.ACTIVE,
      });

      const { cookies: loginCookies, csrfToken: loginCsrf } = await getCsrfAndCookies("/candidate/login");
      const loginRes = await request(app)
        .post("/candidate/login")
        .set("Cookie", loginCookies)
        .send({
          _csrf: loginCsrf,
          email: "logout@test.com",
          password: "Password123",
        });

      const authCookies = mergeCookies(loginCookies, loginRes.headers["set-cookie"] || []);
      const { cookies: homeCookies, csrfToken: logoutCsrf } = await getCsrfAndCookies("/", authCookies);

      const logoutRes = await request(app)
        .post("/candidate/logout")
        .set("Cookie", homeCookies)
        .send({ _csrf: logoutCsrf });

      expect(logoutRes.status).toBe(302);
      const clearCookie = logoutRes.headers["set-cookie"].find((c) => c.includes("itj_token=;"));
      expect(clearCookie).toBeDefined();
    });

    test("Cô lập quyền: Ứng viên không được vào trang nội bộ của Nhà tuyển dụng", async () => {
      const hashedPassword = await hashPassword("Password123");
      await Candidate.create({
        fullName: "Ứng Viên Test",
        email: "cand@test.com",
        password: hashedPassword,
        status: CANDIDATE_STATUS.ACTIVE,
      });

      const { cookies, csrfToken } = await getCsrfAndCookies("/candidate/login");
      const loginRes = await request(app)
        .post("/candidate/login")
        .set("Cookie", cookies)
        .send({
          _csrf: csrfToken,
          email: "cand@test.com",
          password: "Password123",
        });

      const candCookie = loginRes.headers["set-cookie"];

      const empRes = await request(app)
        .get("/employer/jobs")
        .set("Cookie", candCookie);

      expect(empRes.status).toBe(302);
      expect(empRes.headers.location).toContain("/employer/login");
    });
  });
});
