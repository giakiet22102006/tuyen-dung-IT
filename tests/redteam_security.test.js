// tests/redteam_security.test.js
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/app");
const env = require("../src/config/env");
const {
  escapeRegex,
  isValidObjectId,
  stripMongoOperators,
  safeUrl,
  getSafeBackRedirect,
  sanitizeSingleLine,
  safeJsonForScript,
} = require("../src/utils/securityHelpers");
const { getCompanyMapData, sanitizeGoogleMapsInput } = require("../src/utils/googleMaps");
const formatJobDescription = require("../src/utils/formatJobDescription");
const { generateIcsEvent } = require("../src/utils/calendar");
const { sanitizeArticleHtml } = require("../src/utils/sanitizeHtml");
const { isPrivateOrReservedIp, isSafeExternalUrl } = require("../src/services/ai.service");
const { getCompanyDetails, getJobDetails } = require("../src/services/job.service");
const googleAuthService = require("../src/services/googleAuth.service");
const { hashPassword, signUserToken, signAdminToken } = require("../src/services/auth.service");
const { Candidate, Employer, Admin, Job, Otp } = require("../src/models");
const { CANDIDATE_STATUS, EMPLOYER_STATUS, ADMIN_STATUS, ADMIN_ROLES, JOB_MODERATION } = require("../src/config/constants");

let mongoServer;
const adminPath = env.ADMIN_PATH || "admin";

jest.setTimeout(30000);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    Candidate.deleteMany({}),
    Employer.deleteMany({}),
    Admin.deleteMany({}),
    Job.deleteMany({}),
    Otp.deleteMany({}),
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
  if (existingCookies.length) req.set("Cookie", existingCookies);
  const res = await req;
  const cookies = mergeCookies(existingCookies, res.headers["set-cookie"] || []);
  const inputMatch = res.text.match(/name="_csrf"\s+value="([^"]+)"/);
  const metaMatch = res.text.match(/name="csrf-token"\s+content="([^"]+)"/);
  return { csrfToken: (inputMatch && inputMatch[1]) || (metaMatch && metaMatch[1]) || "", cookies };
}

describe("Red-Team Security Hardening Regression Suite", () => {
  describe("[C-01] Admin 2FA Password-Factor Bypass & Email Enumeration", () => {
    test("POST /resend-2fa và /verify-2fa bị chặn khi không có signed challenge cookie", async () => {
      const passwordHash = await hashPassword("SuperSecret123!");
      await Admin.create({
        fullName: "Root Admin",
        email: "root.admin@vnitjobs.vn",
        password: passwordHash,
        role: ADMIN_ROLES.SUPERADMIN,
        status: ADMIN_STATUS.ACTIVE,
      });

      const { csrfToken, cookies } = await getCsrfAndCookies(`/${adminPath}/login`);

      const resendRes = await request(app)
        .post(`/${adminPath}/resend-2fa`)
        .set("Cookie", cookies)
        .send({ email: "root.admin@vnitjobs.vn", _csrf: csrfToken });

      expect(resendRes.status).toBe(302);
      expect(resendRes.headers.location).toBe(`/${adminPath}/login`);
      // Không được sinh OTP khi chưa xác thực mật khẩu
      const otpCount = await Otp.countDocuments({ email: "root.admin@vnitjobs.vn" });
      expect(otpCount).toBe(0);

      const verifyRes = await request(app)
        .post(`/${adminPath}/verify-2fa`)
        .set("Cookie", cookies)
        .send({ email: "root.admin@vnitjobs.vn", otp: "123456", _csrf: csrfToken });
      expect(verifyRes.status).toBe(302);
      expect(verifyRes.headers.location).toBe(`/${adminPath}/login`);
    });

    test("Admin 2FA hợp lệ với signed challenge cookie đăng nhập thành công", async () => {
      const passwordHash = await hashPassword("SuperSecret123!");
      await Admin.create({
        fullName: "Root Admin",
        email: "valid2fa.admin@vnitjobs.vn",
        password: passwordHash,
        role: ADMIN_ROLES.SUPERADMIN,
        status: ADMIN_STATUS.ACTIVE,
      });

      const { csrfToken, cookies } = await getCsrfAndCookies(`/${adminPath}/login`);
      const loginRes = await request(app)
        .post(`/${adminPath}/login`)
        .set("Cookie", cookies)
        .send({
          email: "valid2fa.admin@vnitjobs.vn",
          password: "SuperSecret123!",
          require2fa: true,
          _csrf: csrfToken,
        });

      expect(loginRes.status).toBe(200);
      const setCookies = loginRes.headers["set-cookie"] || [];
      expect(setCookies.some((c) => c.startsWith("itj_admin_2fa_challenge="))).toBe(true);

      // Ghi đè OTP hash biết trước để kiểm chứng verify-2fa
      const knownHash = await bcrypt.hash("654321", 10);
      await Otp.updateOne(
        { email: "valid2fa.admin@vnitjobs.vn", type: "admin_login_2fa" },
        { $set: { otpHash: knownHash } }
      );

      const merged = mergeCookies(cookies, setCookies);
      const verifyRes = await request(app)
        .post(`/${adminPath}/verify-2fa`)
        .set("Cookie", merged)
        .send({ otp: "654321", _csrf: csrfToken });

      expect(verifyRes.status).toBe(302);
      expect(verifyRes.headers.location).toBe(`/${adminPath}`);
      expect((verifyRes.headers["set-cookie"] || []).some((c) => c.startsWith("itj_admin_token="))).toBe(true);
    });
  });

  describe("[H-01] NoSQL Operator Injection & Hashed Password Reset Token", () => {
    test("stripMongoOperators loại bỏ $ operators, dotted paths và prototype pollution keys", () => {
      const payload = {
        email: "victim@test.com",
        token: { $ne: null },
        "nested.key": "bad",
        __proto__: { polluted: true },
        nested: { $gt: "", safe: "ok" },
      };
      stripMongoOperators(payload);
      expect(payload.token).toEqual({});
      expect(payload["nested.key"]).toBeUndefined();
      expect(payload.nested.$gt).toBeUndefined();
      expect(payload.nested.safe).toBe("ok");
      expect(({}).polluted).toBeUndefined();
    });

    test("POST /candidate/reset-password chặn object NoSQLi {$ne: null} và dùng SHA-256 hash", async () => {
      const oldPassHash = await hashPassword("OldPassword123");
      await Candidate.create({
        fullName: "Victim User",
        email: "victim.reset@test.com",
        password: oldPassHash,
        isEmailVerified: true,
        status: CANDIDATE_STATUS.ACTIVE,
      });

      const realToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(realToken).digest("hex");
      await Otp.create({
        email: "victim.reset@test.com",
        otpHash: await bcrypt.hash("111111", 10),
        userType: "candidate",
        type: "forgot_password",
        isVerified: true,
        resetToken: tokenHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      const { csrfToken, cookies } = await getCsrfAndCookies("/candidate/forgot-password");
      const attackRes = await request(app)
        .post("/candidate/reset-password")
        .set("Cookie", cookies)
        .set("x-csrf-token", csrfToken)
        .send({
          email: "victim.reset@test.com",
          token: { $ne: null },
          newPassword: "HackedPassword123",
          confirmPassword: "HackedPassword123",
        });

      expect(attackRes.status).toBe(302);
      expect(attackRes.headers.location).toBe("/candidate/forgot-password");

      const stillVictim = await Candidate.findOne({ email: "victim.reset@test.com" }).select("+password");
      expect(await bcrypt.compare("OldPassword123", stillVictim.password)).toBe(true);
      expect(await bcrypt.compare("HackedPassword123", stillVictim.password)).toBe(false);
    });
  });

  describe("[H-02] Google OAuth Login CSRF (state nonce cookie)", () => {
    test("verifyOAuthState chặn callback không có cookie nonce hoặc sai role", () => {
      let savedNonce = "";
      const mockRes = {
        cookie: (_name, val) => {
          savedNonce = val;
        },
        clearCookie: jest.fn(),
      };
      const state = googleAuthService.createOAuthState("candidate", "/candidate/profile", mockRes);
      expect(savedNonce.length).toBe(64);

      // Hợp lệ
      const ok = googleAuthService.verifyOAuthState(
        state,
        "candidate",
        { cookies: { [googleAuthService.OAUTH_STATE_COOKIE]: savedNonce } },
        mockRes
      );
      expect(ok).toEqual({ valid: true, next: "/candidate/profile" });

      // Thiếu cookie -> chặn Login CSRF
      const noCookie = googleAuthService.verifyOAuthState(state, "candidate", { cookies: {} }, mockRes);
      expect(noCookie.valid).toBe(false);

      // Sai role
      const wrongRole = googleAuthService.verifyOAuthState(
        state,
        "employer",
        { cookies: { [googleAuthService.OAUTH_STATE_COOKIE]: savedNonce } },
        mockRes
      );
      expect(wrongRole.valid).toBe(false);
    });

    test("Callback Google không có itj_oauth_state cookie bị từ chối trước khi gọi Google API", async () => {
      const forgedState = Buffer.from(JSON.stringify({ role: "candidate", next: "/", nonce: "fake" })).toString("base64url");
      const res = await request(app).get(`/candidate/auth/google/callback?code=fake-code&state=${forgedState}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/candidate/login");
      expect((res.headers["set-cookie"] || []).some((c) => c.startsWith("itj_token="))).toBe(false);
    });
  });

  describe("[H-03] OTP Brute-Force TOCTOU Race Condition Guard", () => {
    test("7 request sai song song lập tức tiêu hết hạn mức 5 lần thử và hủy OTP", async () => {
      const otpHash = await bcrypt.hash("987654", 10);
      await Otp.create({
        email: "race.otp@test.com",
        otpHash,
        userType: "candidate",
        type: "forgot_password",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      const { csrfToken, cookies } = await getCsrfAndCookies("/candidate/verify-otp?email=race.otp@test.com");

      const wrongAttempts = Array.from({ length: 7 }, (_, i) =>
        request(app)
          .post("/candidate/verify-otp")
          .set("Cookie", cookies)
          .send({
            email: "race.otp@test.com",
            otp: `00000${i}`,
            _csrf: csrfToken,
          })
      );
      await Promise.all(wrongAttempts);

      // Ngay cả khi gửi OTP ĐÚNG ngay sau đó cũng bị chặn vì đã vượt 5 lần thử
      const validRes = await request(app)
        .post("/candidate/verify-otp")
        .set("Cookie", cookies)
        .send({
          email: "race.otp@test.com",
          otp: "987654",
          _csrf: csrfToken,
        });
      expect(validRes.status).toBe(400);
    });
  });

  describe("[H-04 & H-05] Employer Team BFLA & teamMembers.password Hash Protection", () => {
    test("Recruiter không được truy cập /employer/team và teamMembers.password không lộ ở public query", async () => {
      const ownerPass = await hashPassword("OwnerPass123!");
      const recruiterPass = await hashPassword("RecruiterPass123!");

      const emp = await Employer.create({
        companyName: "SecCorp Vietnam",
        slug: "seccorp-vietnam",
        email: "owner@seccorp.vn",
        password: ownerPass,
        status: EMPLOYER_STATUS.ACTIVE,
        isEmailVerified: true,
        teamMembers: [
          {
            fullName: "HR Recruiter",
            email: "hr@seccorp.vn",
            password: recruiterPass,
            role: "recruiter",
            tokenVersion: 1,
          },
        ],
      });

      await Job.create({
        employerId: emp._id,
        title: "Security Engineer",
        slug: "security-engineer-seccorp",
        position: "senior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      // H-05: Query public không bao giờ chứa password hash của teamMembers
      const publicCompany = await getCompanyDetails("seccorp-vietnam");
      expect(publicCompany.company.password).toBeUndefined();
      expect(publicCompany.company.teamMembers).toBeUndefined();

      const publicJob = await getJobDetails("security-engineer-seccorp");
      expect(publicJob.job.employerId.password).toBeUndefined();
      expect(publicJob.job.employerId.teamMembers).toBeUndefined();

      const defaultFind = await Employer.findById(emp._id).lean();
      expect(defaultFind.teamMembers[0].password).toBeUndefined();

      // H-04: Recruiter bị chặn khi gọi /employer/team
      const member = emp.teamMembers[0];
      const recruiterToken = signUserToken(emp, "employer", {
        memberId: member._id.toString(),
        memberName: member.fullName,
        memberEmail: member.email,
        memberRole: "recruiter",
        tv: 1,
      });

      const teamGetRes = await request(app)
        .get("/employer/team")
        .set("Cookie", [`itj_token=${recruiterToken}`]);
      expect(teamGetRes.status).toBe(302);
      expect(teamGetRes.headers.location).toBe("/employer/company-profile");

      const { csrfToken, cookies } = await getCsrfAndCookies("/employer/company-profile", [`itj_token=${recruiterToken}`]);
      const teamPostRes = await request(app)
        .post("/employer/team")
        .set("Cookie", cookies)
        .send({
          fullName: "Rogue Admin",
          email: "rogue@seccorp.vn",
          password: "RoguePassword123",
          role: "admin",
          _csrf: csrfToken,
        });
      expect(teamPostRes.status).toBe(302);
      expect(teamPostRes.headers.location).toBe("/employer/company-profile");

      const reloaded = await Employer.findById(emp._id).lean();
      expect(reloaded.teamMembers.length).toBe(1);
    });
  });

  describe("[H-07, H-08, H-09, M-06, L-06] XSS, Google Maps Iframe, ICS CRLF & Safe Helpers", () => {
    test("googleMaps chặn javascript: URI và iframe nguồn lạ", () => {
      expect(sanitizeGoogleMapsInput("javascript:alert(1)")).toBe("");
      expect(sanitizeGoogleMapsInput('<iframe src="https://evil.com/phish"></iframe>')).toBe("");
      expect(
        sanitizeGoogleMapsInput('<iframe src="https://www.google.com/maps/embed?pb=!1m18"></iframe>')
      ).toContain("https://www.google.com/maps/embed");

      const mapData = getCompanyMapData({
        companyName: "EvilCorp",
        address: "",
        googleMapsUrl: "javascript:alert(document.domain)",
      });
      expect(mapData).toBeNull();
    });

    test("safeUrl, sanitizeArticleHtml, safeJsonForScript và sanitizeSingleLine hoạt động chuẩn", () => {
      expect(safeUrl("javascript:alert(1)")).toBe("");
      expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
      expect(safeUrl("https://vn-itjobs.com/path")).toBe("https://vn-itjobs.com/path");
      expect(safeUrl("/jobs/node-dev", { allowRelative: true })).toBe("/jobs/node-dev");
      expect(safeUrl("//evil.com", { allowRelative: true })).toBe("");

      const cleanArt = sanitizeArticleHtml(
        '<h2>OK</h2><script>alert(1)</script><figure class="x"><img src="https://cdn.example.com/a.png" alt="Chart" onerror="alert(2)" /><figcaption>Cap</figcaption></figure><table><tr><td>1</td></tr></table><a href="javascript:alert(3)">x</a>'
      );
      expect(cleanArt).not.toContain("<script");
      expect(cleanArt).not.toContain("onerror");
      expect(cleanArt).not.toContain("javascript:");
      expect(cleanArt).toContain("<figure>");
      expect(cleanArt).toContain('src="https://cdn.example.com/a.png"');
      expect(cleanArt).toContain("<figcaption>Cap</figcaption>");
      expect(cleanArt).toContain("<table><tr><td>1</td></tr></table>");

      const safeScript = safeJsonForScript({ x: "</script><script>alert(1)</script>" });
      expect(safeScript).not.toContain("</script>");
      expect(safeScript).toContain("\\u003c/script\\u003e");

      expect(sanitizeSingleLine("Subject\r\nBcc: evil@attacker.com")).not.toMatch(/[\r\n]/);
    });

    test("generateIcsEvent chặn CRLF / Property Injection và javascript: meetingUrl", () => {
      const ics = generateIcsEvent({
        title: "Interview\r\nATTENDEE:mailto:evil@attacker.com",
        description: "Line1\r\nLine2",
        location: "Office\r\nX-INJECTED:1",
        startDate: new Date("2026-12-01T09:00:00Z"),
        organizerName: 'Boss"\r\nX-BAD:1',
        organizerEmail: "hr@corp.vn\r\nBcc:x@y.z",
        attendeeName: "Dev",
        attendeeEmail: "dev@test.com",
        meetingUrl: "javascript:alert(1)",
      });

      const lines = ics.split("\r\n");
      expect(lines.some((l) => l.startsWith("X-INJECTED:"))).toBe(false);
      expect(lines.some((l) => l.startsWith("X-BAD:"))).toBe(false);
      expect(ics).not.toContain("javascript:");
      expect(lines.filter((l) => l.startsWith("ATTENDEE")).length).toBe(1);
    });
  });

  describe("[H-10 & H-11] SSRF Private IP Blocking & Linear-Time ReDoS Protection", () => {
    test("isPrivateOrReservedIp & isSafeExternalUrl chặn loopback, RFC1918, metadata, IPv6-mapped, decimal IP", () => {
      expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIp("10.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIp("172.16.5.1")).toBe(true);
      expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
      expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
      expect(isPrivateOrReservedIp("::1")).toBe(true);
      expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
      expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
      expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);

      expect(isSafeExternalUrl("http://127.0.0.1:8080/admin")).toBe(false);
      expect(isSafeExternalUrl("http://[::ffff:127.0.0.1]/")).toBe(false);
      expect(isSafeExternalUrl("http://2130706433/")).toBe(false);
      expect(isSafeExternalUrl("http://0x7f000001/")).toBe(false);
      expect(isSafeExternalUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
      expect(isSafeExternalUrl("http://metadata.google.internal/")).toBe(false);
      expect(isSafeExternalUrl("https://viblo.asia/p/test")).toBe(true);
    });

    test("formatJobDescription chạy tuyến tính < 100ms trên chuỗi tấn công ReDoS", () => {
      const evilInput = "<a>" + " ".repeat(4000) + "!";
      const start = Date.now();
      const out = formatJobDescription(evilInput);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(150);
      expect(typeof out).toBe("string");

      expect(escapeRegex("(a+)+$")).toBe("\\(a\\+\\)\\+\\$");
      expect(isValidObjectId("507f1f77bcf86cd799439011")).toBe(true);
      expect(isValidObjectId("123456789012")).toBe(false);
    });
  });

  describe("[H-12] MCP Batch Amplification & JSON-RPC 2.0 Validation", () => {
    test("POST /mcp chặn batch > 10 phần tử và validate jsonrpc version", async () => {
      const bigBatch = Array.from({ length: 11 }, (_, i) => ({
        jsonrpc: "2.0",
        id: i + 1,
        method: "ping",
      }));
      const batchRes = await request(app).post("/mcp").send(bigBatch);
      expect(batchRes.status).toBe(400);
      expect(batchRes.body.error.code).toBe(-32600);

      const badVerRes = await request(app).post("/mcp").send({ jsonrpc: "1.0", id: 1, method: "ping" });
      expect(badVerRes.status).toBe(200);
      expect(badVerRes.body.error.code).toBe(-32600);
    });
  });

  describe("[M-01, M-03, M-05, M-07, M-08, L-03, L-04] AuthZ, Logout Revoke, Hidden Job AI & Safe Redirect", () => {
    test("Employer PENDING bị chặn khỏi Kho Ứng viên IT (/employer/candidates)", async () => {
      const pendingEmp = await Employer.create({
        companyName: "Pending Startup",
        slug: "pending-startup",
        email: "pending@startup.vn",
        password: await hashPassword("Pass12345"),
        status: EMPLOYER_STATUS.PENDING,
        isEmailVerified: true,
      });
      const token = signUserToken(pendingEmp, "employer");
      const res = await request(app)
        .get("/employer/candidates")
        .set("Cookie", [`itj_token=${token}`]);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/employer/company-profile");
    });

    test("Candidate POST /candidate/logout tăng tokenVersion phía server để vô hiệu hóa JWT cũ", async () => {
      const cand = await Candidate.create({
        fullName: "Logout Tester",
        email: "logout.tester@test.com",
        password: await hashPassword("Pass12345"),
        status: CANDIDATE_STATUS.ACTIVE,
        isEmailVerified: true,
        tokenVersion: 1,
      });
      const oldToken = signUserToken(cand, "candidate");
      const { csrfToken, cookies } = await getCsrfAndCookies("/candidate/profile", [`itj_token=${oldToken}`]);

      const logoutRes = await request(app)
        .post("/candidate/logout")
        .set("Cookie", cookies)
        .send({ _csrf: csrfToken });
      expect(logoutRes.status).toBe(302);

      // Thử dùng lại JWT cũ đã bị đánh cắp -> bị đá về login
      const replayRes = await request(app)
        .get("/candidate/profile")
        .set("Cookie", [`itj_token=${oldToken}`]);
      expect(replayRes.status).toBe(302);
      expect(replayRes.headers.location).toContain("/candidate/login");
    });

    test("Public AI endpoints trả 404 với tin tuyển dụng đã bị ẩn hoặc xóa mềm", async () => {
      const emp = await Employer.create({
        companyName: "Hidden Job Co",
        slug: "hidden-job-co",
        email: "hidden@co.vn",
        password: await hashPassword("Pass12345"),
        status: EMPLOYER_STATUS.ACTIVE,
        isEmailVerified: true,
      });
      const hiddenJob = await Job.create({
        employerId: emp._id,
        title: "Secret Internal Role",
        slug: "secret-internal-role",
        position: "senior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.HIDDEN,
      });

      const { csrfToken, cookies } = await getCsrfAndCookies("/");
      const res = await request(app)
        .post("/api/ai/interview-prep")
        .set("Cookie", cookies)
        .set("x-csrf-token", csrfToken)
        .send({ jobId: hiddenJob._id.toString() });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test("getSafeBackRedirect chặn Referer ngoài domain và trang search không 500 khi page âm", async () => {
      const fakeReq = {
        headers: { referer: "https://evil.com/phishing", host: "tuyen-dung-it.vercel.app" },
        get: (h) => (h.toLowerCase() === "host" ? "tuyen-dung-it.vercel.app" : ""),
      };
      expect(getSafeBackRedirect(fakeReq, "/employer/cvs")).toBe("/employer/cvs");

      const searchRes = await request(app).get("/search?page=-5");
      expect(searchRes.status).toBe(200);
      const compRes = await request(app).get("/companies?page=-3");
      expect(compRes.status).toBe(200);
    });

    test("Admin thường không được sửa /settings/about và ObjectId sai ở Admin route không gây 500", async () => {
      const normalAdmin = await Admin.create({
        fullName: "Normal Moderator",
        email: "mod@vnitjobs.vn",
        password: await hashPassword("ModPass123!"),
        role: ADMIN_ROLES.ADMIN,
        status: ADMIN_STATUS.ACTIVE,
      });
      const token = signAdminToken(normalAdmin);
      const { csrfToken, cookies } = await getCsrfAndCookies(`/${adminPath}/settings/about`, [
        `itj_admin_token=${token}`,
      ]);

      const settingsPost = await request(app)
        .post(`/${adminPath}/settings/about`)
        .set("Cookie", cookies)
        .send({ title: "Hacked About", _csrf: csrfToken });
      expect(settingsPost.status).toBe(302);
      expect(settingsPost.headers.location).toBe(`/${adminPath}`);

      const badIdRes = await request(app)
        .get(`/${adminPath}/employers/invalid-object-id`)
        .set("Cookie", [`itj_admin_token=${token}`]);
      expect(badIdRes.status).toBe(302);
      expect(badIdRes.headers.location).toBe(`/${adminPath}`);
    });

    test("Chặn trùng email chéo công ty khi thêm teamMember và không gây 500 với ObjectId sai ở Employer/Candidate/Sitemap", async () => {
      const empA = await Employer.create({
        companyName: "Company Alpha",
        slug: "company-alpha",
        email: "owner@alpha.vn",
        password: await hashPassword("AlphaPass123"),
        status: EMPLOYER_STATUS.ACTIVE,
        isEmailVerified: true,
        teamMembers: [
          {
            fullName: "Alpha Recruiter",
            email: "recruiter@alpha.vn",
            password: await hashPassword("RecPass123"),
            role: "recruiter",
          },
        ],
      });
      const empB = await Employer.create({
        companyName: "Company Beta",
        slug: "company-beta",
        email: "owner@beta.vn",
        password: await hashPassword("BetaPass123"),
        status: EMPLOYER_STATUS.ACTIVE,
        isEmailVerified: true,
      });

      const betaToken = signUserToken(empB, "employer");
      const { csrfToken, cookies } = await getCsrfAndCookies("/employer/team", [`itj_token=${betaToken}`]);

      // Company B cố tình thêm email đang thuộc về Company A (owner hoặc recruiter) -> phải bị từ chối
      await request(app)
        .post("/employer/team")
        .set("Cookie", cookies)
        .send({
          fullName: "Collision HR",
          email: "recruiter@alpha.vn",
          password: "ValidPassword123",
          role: "recruiter",
          _csrf: csrfToken,
        });

      const reloadedBeta = await Employer.findById(empB._id).lean();
      expect((reloadedBeta.teamMembers || []).length).toBe(0);
      expect(empA).toBeDefined();

      // ObjectId sai trên route Employer trả 302 thay vì 500 CastError
      const badEmpIdRes = await request(app)
        .get("/employer/cvs/not-a-valid-objectid")
        .set("Cookie", [`itj_token=${betaToken}`]);
      expect(badEmpIdRes.status).toBe(302);

      // ObjectId sai trên AJAX route Candidate trả 400 thay vì 500 CastError
      const cand = await Candidate.create({
        fullName: "Cand Param Test",
        email: "cand.param@test.com",
        password: await hashPassword("CandPass123"),
        status: CANDIDATE_STATUS.ACTIVE,
        isEmailVerified: true,
      });
      const candToken = signUserToken(cand, "candidate");
      const candCsrf = await getCsrfAndCookies("/", [`itj_token=${candToken}`]);

      const badSaveRes = await request(app)
        .post("/candidate/saved-jobs/bad-job-id/toggle")
        .set("Cookie", candCsrf.cookies)
        .set("Accept", "application/json")
        .set("x-csrf-token", candCsrf.csrfToken);
      expect(badSaveRes.status).toBe(400);

      const badNotifRes = await request(app)
        .post("/api/notifications/bad-notif-id/read")
        .set("Cookie", candCsrf.cookies)
        .set("Accept", "application/json")
        .set("x-csrf-token", candCsrf.csrfToken);
      expect(badNotifRes.status).toBe(400);

      // Sitemap XML không chứa công ty đã xóa mềm và trả XML hợp lệ
      await Employer.create({
        companyName: "Deleted Ghost Co",
        slug: "deleted-ghost-co",
        email: "ghost@co.vn",
        password: await hashPassword("GhostPass123"),
        status: EMPLOYER_STATUS.ACTIVE,
        deletedAt: new Date(),
      });
      const sitemapRes = await request(app).get("/sitemap.xml");
      expect(sitemapRes.status).toBe(200);
      expect(sitemapRes.text).toContain("/companies/company-alpha");
      expect(sitemapRes.text).not.toContain("/companies/deleted-ghost-co");
    });
  });
});
