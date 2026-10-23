const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const { Candidate, Employer, Admin, Otp } = require("../src/models");
const { CANDIDATE_STATUS, EMPLOYER_STATUS, ADMIN_STATUS, ADMIN_ROLES } = require("../src/config/constants");
const { hashPassword } = require("../src/services/auth.service");
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
  await Candidate.deleteMany({});
  await Employer.deleteMany({});
  await Admin.deleteMany({});
  await Otp.deleteMany({});
});

describe("Concurrent Session & Admin 2FA Security Tests", () => {
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

  test("1. Ứng viên: Đăng nhập thiết bị 2 tự động hủy phiên thiết bị 1 (Single Active Session)", async () => {
    const candidate = await Candidate.create({
      fullName: "Nguyễn Văn A",
      email: "candidate1@test.com",
      password: await hashPassword("Password123!"),
      isEmailVerified: true,
      status: CANDIDATE_STATUS.ACTIVE,
      tokenVersion: 0,
    });

    // Thiết bị 1 đăng nhập
    const initDevice1 = await getCsrfAndCookies("/candidate/login");
    const loginRes1 = await request(app)
      .post("/candidate/login")
      .set("Cookie", initDevice1.cookies)
      .send({
        email: "candidate1@test.com",
        password: "Password123!",
        _csrf: initDevice1.csrfToken,
      });
    const device1Cookies = mergeCookies(initDevice1.cookies, loginRes1.headers["set-cookie"] || []);

    // Thiết bị 1 truy cập trang bảo vệ hợp lệ
    const profileRes1 = await request(app)
      .get("/candidate/profile")
      .set("Cookie", device1Cookies);
    expect(profileRes1.status).toBe(200);

    // Thiết bị 2 đăng nhập vào cùng tài khoản
    const initDevice2 = await getCsrfAndCookies("/candidate/login");
    const loginRes2 = await request(app)
      .post("/candidate/login")
      .set("Cookie", initDevice2.cookies)
      .send({
        email: "candidate1@test.com",
        password: "Password123!",
        _csrf: initDevice2.csrfToken,
      });
    const device2Cookies = mergeCookies(initDevice2.cookies, loginRes2.headers["set-cookie"] || []);

    // Thiết bị 2 hoạt động bình thường
    const profileRes2 = await request(app)
      .get("/candidate/profile")
      .set("Cookie", device2Cookies);
    expect(profileRes2.status).toBe(200);

    // Thiết bị 1 giờ đây bị hủy phiên và chuyển hướng về đăng nhập
    const profileRes1After = await request(app)
      .get("/candidate/profile")
      .set("Cookie", device1Cookies);
    expect(profileRes1After.status).toBe(302);
    expect(profileRes1After.headers.location).toContain("/candidate/login");

    // Cookie itj_token trên thiết bị 1 bị xóa
    const clearSetCookie = profileRes1After.headers["set-cookie"] || [];
    expect(clearSetCookie.some((c) => c.includes("itj_token=;"))).toBe(true);
  });

  test("2. Nhà tuyển dụng: Đăng nhập thiết bị 2 tự động hủy phiên thiết bị 1", async () => {
    const employer = await Employer.create({
      companyName: "Tech Corp",
      slug: "tech-corp",
      email: "employer1@test.com",
      password: await hashPassword("Password123!"),
      isEmailVerified: true,
      status: EMPLOYER_STATUS.ACTIVE,
      city: "ha-noi",
      tokenVersion: 0,
    });

    // Thiết bị 1 đăng nhập
    const initDev1 = await getCsrfAndCookies("/employer/login");
    const loginRes1 = await request(app)
      .post("/employer/login")
      .set("Cookie", initDev1.cookies)
      .send({
        email: "employer1@test.com",
        password: "Password123!",
        _csrf: initDev1.csrfToken,
      });
    const dev1Cookies = mergeCookies(initDev1.cookies, loginRes1.headers["set-cookie"] || []);

    // Thiết bị 1 truy cập trang quản lý công việc
    const jobsRes1 = await request(app)
      .get("/employer/jobs")
      .set("Cookie", dev1Cookies);
    expect(jobsRes1.status).toBe(200);

    // Thiết bị 2 đăng nhập cùng tài khoản
    const initDev2 = await getCsrfAndCookies("/employer/login");
    const loginRes2 = await request(app)
      .post("/employer/login")
      .set("Cookie", initDev2.cookies)
      .send({
        email: "employer1@test.com",
        password: "Password123!",
        _csrf: initDev2.csrfToken,
      });
    const dev2Cookies = mergeCookies(initDev2.cookies, loginRes2.headers["set-cookie"] || []);

    // Thiết bị 2 truy cập thành công
    const jobsRes2 = await request(app)
      .get("/employer/jobs")
      .set("Cookie", dev2Cookies);
    expect(jobsRes2.status).toBe(200);

    // Thiết bị 1 bị kick out
    const jobsRes1After = await request(app)
      .get("/employer/jobs")
      .set("Cookie", dev1Cookies);
    expect(jobsRes1After.status).toBe(302);
    expect(jobsRes1After.headers.location).toContain("/employer/login");
  });

  test("3. Admin: Quy trình Xác thực 2 bước (2FA) & Hủy phiên trên thiết bị cũ", async () => {
    const admin = await Admin.create({
      fullName: "Super Admin",
      email: "superadmin@test.com",
      password: await hashPassword("AdminPass123!"),
      role: ADMIN_ROLES.SUPERADMIN,
      status: ADMIN_STATUS.ACTIVE,
      tokenVersion: 0,
    });

    // Bước 1: Admin nhập mật khẩu với require2fa
    const initAdmin = await getCsrfAndCookies(`/${adminPath}/login`);
    const loginRes = await request(app)
      .post(`/${adminPath}/login`)
      .set("Cookie", initAdmin.cookies)
      .send({
        email: "superadmin@test.com",
        password: "AdminPass123!",
        require2fa: true,
        _csrf: initAdmin.csrfToken,
      });

    // Trả về màn hình xác thực 2FA
    expect(loginRes.status).toBe(200);
    expect(loginRes.text).toContain("Xác thực 2 bước (2FA)");

    // Kiểm tra mã OTP được sinh trong database
    const otpRecord = await Otp.findOne({
      email: "superadmin@test.com",
      userType: "admin",
      type: "admin_login_2fa",
    });
    expect(otpRecord).not.toBeNull();

    // Bước 2: Nhập sai OTP -> Bị từ chối
    const cookiesAfterLogin = mergeCookies(initAdmin.cookies, loginRes.headers["set-cookie"] || []);
    const verifyFailRes = await request(app)
      .post(`/${adminPath}/verify-2fa`)
      .set("Cookie", cookiesAfterLogin)
      .send({
        email: "superadmin@test.com",
        otp: "000000",
        _csrf: initAdmin.csrfToken,
      });
    expect(verifyFailRes.status).toBe(400);
    expect(verifyFailRes.text).toContain("Mã OTP không chính xác");

    // Bước 3: Đăng nhập hợp lệ qua test mode (giả lập hoàn thành 2FA)
    const testLoginRes = await request(app)
      .post(`/${adminPath}/login`)
      .set("Cookie", initAdmin.cookies)
      .send({
        email: "superadmin@test.com",
        password: "AdminPass123!",
        _csrf: initAdmin.csrfToken,
      });
    const adminDev1Cookies = mergeCookies(initAdmin.cookies, testLoginRes.headers["set-cookie"] || []);

    // Thiết bị 1 truy cập dashboard admin
    const dashRes1 = await request(app)
      .get(`/${adminPath}`)
      .set("Cookie", adminDev1Cookies);
    expect(dashRes1.status).toBe(200);

    // Thiết bị 2 đăng nhập admin
    const initAdminDev2 = await getCsrfAndCookies(`/${adminPath}/login`);
    const testLoginRes2 = await request(app)
      .post(`/${adminPath}/login`)
      .set("Cookie", initAdminDev2.cookies)
      .send({
        email: "superadmin@test.com",
        password: "AdminPass123!",
        _csrf: initAdminDev2.csrfToken,
      });
    const adminDev2Cookies = mergeCookies(initAdminDev2.cookies, testLoginRes2.headers["set-cookie"] || []);

    // Thiết bị 2 truy cập hợp lệ
    const dashRes2 = await request(app)
      .get(`/${adminPath}`)
      .set("Cookie", adminDev2Cookies);
    expect(dashRes2.status).toBe(200);

    // Thiết bị 1 bị kick out ngay lập tức
    const dashRes1After = await request(app)
      .get(`/${adminPath}`)
      .set("Cookie", adminDev1Cookies);
    expect(dashRes1After.status).toBe(302);
    expect(dashRes1After.headers.location).toContain(`/${adminPath}/login`);
  });
});
