// tests/googleAuth.test.js
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const googleAuthService = require("../src/services/googleAuth.service");
const { Candidate, Employer } = require("../src/models");
const { CANDIDATE_STATUS, EMPLOYER_STATUS } = require("../src/config/constants");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});

describe("Tích hợp Đăng nhập Google (Google OAuth 2.0)", () => {
  test("Redirect to Google Auth returns notice if GOOGLE_CLIENT_ID is not configured", async () => {
    const origConfigured = googleAuthService.isGoogleConfigured;
    googleAuthService.isGoogleConfigured = () => false;
    try {
      const resCandidate = await request(app).get("/candidate/auth/google");
      expect(resCandidate.status).toBe(302);
      expect(resCandidate.headers.location).toContain("/candidate/login");

      const resEmployer = await request(app).get("/employer/auth/google");
      expect(resEmployer.status).toBe(302);
      expect(resEmployer.headers.location).toContain("/employer/login");
    } finally {
      googleAuthService.isGoogleConfigured = origConfigured;
    }
  });

  test("googleAuthService.getCallbackUrl calculates proper dynamic callback", () => {
    const reqMock = {
      protocol: "https",
      get: (h) => (h === "host" ? "tuyen-dung-it.vercel.app" : ""),
      headers: {},
    };

    const candidateCb = googleAuthService.getCallbackUrl("candidate", reqMock);
    expect(candidateCb).toBe("https://tuyen-dung-it.vercel.app/candidate/auth/google/callback");

    const employerCb = googleAuthService.getCallbackUrl("employer", reqMock);
    expect(employerCb).toBe("https://tuyen-dung-it.vercel.app/employer/auth/google/callback");
  });

  test("Google Auth Callback with missing code redirects to login with error", async () => {
    const res = await request(app).get("/candidate/auth/google/callback?error=access_denied");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/candidate/login");

    const resEmp = await request(app).get("/employer/auth/google/callback?error=access_denied");
    expect(resEmp.status).toBe(302);
    expect(resEmp.headers.location).toBe("/employer/login");
  });

  test("Candidate and Employer models accept googleId and authProvider", async () => {
    const candidate = await Candidate.create({
      fullName: "Nguyễn Văn Test Google",
      email: "test.google.candidate@example.com",
      password: "hashed_dummy_password",
      googleId: "google-sub-12345",
      authProvider: "google",
      isEmailVerified: true,
      status: CANDIDATE_STATUS.ACTIVE,
    });

    expect(candidate.googleId).toBe("google-sub-12345");
    expect(candidate.authProvider).toBe("google");
    expect(candidate.isEmailVerified).toBe(true);

    const employer = await Employer.create({
      companyName: "Google Partner Vietnam",
      slug: "google-partner-vietnam-test",
      email: "hr.google.partner@example.com",
      password: "hashed_dummy_password",
      googleId: "google-sub-67890",
      authProvider: "google",
      isEmailVerified: true,
      status: EMPLOYER_STATUS.PENDING,
    });

    expect(employer.googleId).toBe("google-sub-67890");
    expect(employer.authProvider).toBe("google");
    expect(employer.isEmailVerified).toBe(true);
  });
});
