// tests/passwordReset.test.js
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const { Candidate, Employer, Otp } = require("../src/models");
const { CANDIDATE_STATUS, EMPLOYER_STATUS } = require("../src/config/constants");

jest.setTimeout(30000);

let mongoServer;
let testCandidateEmail = "reset-candidate@example.com";
let testEmployerEmail = "reset-employer@example.com";

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(mongoServer.getUri());

  // Tạo ứng viên mẫu
  const passwordHash = await bcrypt.hash("OldPass123", 10);
  await Candidate.create({
    fullName: "Test Reset Candidate",
    email: testCandidateEmail,
    password: passwordHash,
    status: CANDIDATE_STATUS.ACTIVE,
  });

  // Tạo NTD mẫu
  await Employer.create({
    companyName: "Reset Test Company",
    slug: "reset-test-company",
    email: testEmployerEmail,
    password: passwordHash,
    status: EMPLOYER_STATUS.ACTIVE,
  });
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});

describe("Password Reset & OTP via Gmail Suite", () => {
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

  describe("Candidate Password Reset Flow", () => {
    it("should render forgot password form for candidate", async () => {
      const res = await request(app).get("/candidate/forgot-password");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Quên mật khẩu (Ứng viên)");
    });

    it("should return 400 if email is not found", async () => {
      const { cookies, csrfToken } = await getCsrfAndCookies("/candidate/forgot-password");
      const res = await request(app)
        .post("/candidate/forgot-password")
        .set("Cookie", cookies)
        .send({
          email: "nonexistent@example.com",
          _csrf: csrfToken,
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain("Không tìm thấy tài khoản");
    });

    it("should generate OTP and redirect to verify-otp for valid email", async () => {
      const { cookies, csrfToken } = await getCsrfAndCookies("/candidate/forgot-password");
      const res = await request(app)
        .post("/candidate/forgot-password")
        .set("Cookie", cookies)
        .send({
          email: testCandidateEmail,
          _csrf: csrfToken,
        });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("/candidate/verify-otp");

      const otpRecord = await Otp.findOne({ email: testCandidateEmail, userType: "candidate" });
      expect(otpRecord).toBeDefined();
      expect(otpRecord.otpHash).toBeDefined();
    });

    it("should reject invalid OTP code", async () => {
      const { cookies, csrfToken } = await getCsrfAndCookies(
        `/candidate/verify-otp?email=${encodeURIComponent(testCandidateEmail)}`
      );

      const res = await request(app)
        .post("/candidate/verify-otp")
        .set("Cookie", cookies)
        .send({
          email: testCandidateEmail,
          otp: "000000",
          _csrf: csrfToken,
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain("Mã OTP không chính xác");
    });

    it("should verify correct OTP and allow password reset", async () => {
      const salt = await bcrypt.genSalt(10);
      const otpHash = await bcrypt.hash("123456", salt);
      await Otp.deleteMany({ email: testCandidateEmail });
      await Otp.create({
        email: testCandidateEmail,
        otpHash,
        userType: "candidate",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      const { cookies, csrfToken } = await getCsrfAndCookies(
        `/candidate/verify-otp?email=${encodeURIComponent(testCandidateEmail)}`
      );

      const verifyRes = await request(app)
        .post("/candidate/verify-otp")
        .set("Cookie", cookies)
        .send({
          email: testCandidateEmail,
          otp: "123456",
          _csrf: csrfToken,
        });

      expect(verifyRes.status).toBe(302);
      expect(verifyRes.headers.location).toContain("/candidate/reset-password");

      const urlParams = new URL("http://localhost" + verifyRes.headers.location);
      const resetToken = urlParams.searchParams.get("token");
      expect(resetToken).toBeDefined();

      const { cookies: resetCookies, csrfToken: tokenReset } = await getCsrfAndCookies(
        `/candidate/reset-password?email=${encodeURIComponent(testCandidateEmail)}&token=${resetToken}`,
        cookies
      );

      const resetRes = await request(app)
        .post("/candidate/reset-password")
        .set("Cookie", resetCookies)
        .send({
          email: testCandidateEmail,
          token: resetToken,
          newPassword: "NewSecretPassword123",
          confirmPassword: "NewSecretPassword123",
          _csrf: tokenReset,
        });

      expect(resetRes.status).toBe(302);
      expect(resetRes.headers.location).toBe("/candidate/login");

      const candidate = await Candidate.findOne({ email: testCandidateEmail }).select("+password");
      const isNewMatch = await bcrypt.compare("NewSecretPassword123", candidate.password);
      expect(isNewMatch).toBe(true);

      const checkOtp = await Otp.findOne({ email: testCandidateEmail });
      expect(checkOtp).toBeNull();
    });
  });

  describe("Employer Password Reset Flow", () => {
    it("should render forgot password form for employer", async () => {
      const res = await request(app).get("/employer/forgot-password");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Quên mật khẩu (Nhà tuyển dụng)");
    });
  });
});
