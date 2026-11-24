// tests/security_audit.test.js
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/app");
const env = require("../src/config/env");
const isSafeRedirect = require("../src/utils/sanitizeRedirect");
const sanitizeHtml = require("../src/utils/sanitizeHtml");
const {
  sanitizeOriginalFilename,
  checkFileType,
  checkPdf,
  getCVPath,
  deleteFile,
} = require("../src/services/storage.service");
const { verifyUserToken, hashPassword, signAdminToken } = require("../src/services/auth.service");
const { resolveCsrfSessionIdentifier } = require("../src/middlewares/csrf.middleware");
const {
  createRateLimiters,
  normalizeClientIp,
  extractSafeEmail,
  buildAiRateLimitKey,
} = require("../src/middlewares/rateLimit.middleware");
const { Candidate, Employer, Admin, Job, Application } = require("../src/models");
const { CANDIDATE_STATUS, EMPLOYER_STATUS, ADMIN_STATUS, ADMIN_ROLES, JOB_MODERATION } = require("../src/config/constants");

let mongoServer;

jest.setTimeout(25000);

const VALID_PDF_BUFFER = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n");

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
    Application.deleteMany({}),
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

describe("Security & Middleware Hardening Audit Suite", () => {
  describe("1. Open Redirect & CRLF Defense (sanitizeRedirect)", () => {
    test("Chấp nhận các đường dẫn nội bộ hợp lệ", () => {
      expect(isSafeRedirect("/")).toBe(true);
      expect(isSafeRedirect("/jobs/senior-golang?tab=overview#apply")).toBe(true);
      expect(isSafeRedirect("/candidate/applied-jobs")).toBe(true);
      expect(isSafeRedirect.resolveSafeRedirect("/employer/jobs", "/")).toBe("/employer/jobs");
    });

    test("Chặn triệt để protocol-relative, backslash, encoded slash, control chars & whitespace lệch chuỗi", () => {
      expect(isSafeRedirect("//evil.example")).toBe(false);
      expect(isSafeRedirect("///evil.example")).toBe(false);
      expect(isSafeRedirect("/\\evil.example")).toBe(false);
      expect(isSafeRedirect("\\evil.example")).toBe(false);
      expect(isSafeRedirect("https://evil.example/login")).toBe(false);
      expect(isSafeRedirect("javascript:alert(1)")).toBe(false);
      expect(isSafeRedirect("/%2fevil.example")).toBe(false);
      expect(isSafeRedirect("/%5cevil.example")).toBe(false);
      expect(isSafeRedirect("/\x0b/evil.example")).toBe(false);
      expect(isSafeRedirect("/\x00/evil.example")).toBe(false);
      // Chặn chuỗi có CRLF hoặc khoảng trắng đầu/cuối khiến caller truyền bản gốc chưa trim vào res.redirect()
      expect(isSafeRedirect("/jobs\r\nSet-Cookie: hacked=1")).toBe(false);
      expect(isSafeRedirect(" /jobs")).toBe(false);
      expect(isSafeRedirect("\t/jobs")).toBe(false);
      expect(isSafeRedirect("/" + "a".repeat(3000))).toBe(false);
      expect(isSafeRedirect(null)).toBe(false);
      expect(isSafeRedirect(["/jobs"])).toBe(false);
      expect(isSafeRedirect.resolveSafeRedirect("//evil.example", "/safe")).toBe("/safe");
    });
  });

  describe("2. XSS, CSS Redressing & Reverse Tabnabbing Defense (sanitizeHtml)", () => {
    test("Loại bỏ thẻ độc hại, event handler, unclosed tag, style/class tùy ý và javascript/entity URI", () => {
      const dirty = [
        "<h3>Mô tả vị trí</h3>",
        '<p style="position:fixed;inset:0;z-index:99999;background:red" class="fixed inset-0 z-50">Đoạn văn hợp lệ</p>',
        "<script>window.__xss = 1;</script>",
        "<style>body { display: none !important; }</style>",
        '<img src="x" onerror="alert(1)">',
        "<svg onload=\"alert(2)\"><circle /></svg>",
        '<a href="javascript:alert(3)">Click JS</a>',
        '<a href="&#x6a;avascript:alert(4)">Entity JS</a>',
        '<a href="java&#x09;script:alert(5)">Tab JS</a>',
        '<a href="//evil.example/phish">Protocol Relative</a>',
        '<a href="https://vnitjobs.vn/docs" target="_blank">Tài liệu</a>',
        "<img src=x onerror=alert(6)",
      ].join("");

      for (const fn of [sanitizeHtml, sanitizeHtml.strictFallbackSanitize]) {
        const clean = fn(dirty);
        expect(clean).toContain("<h3>Mô tả vị trí</h3>");
        expect(clean).toContain("<p>Đoạn văn hợp lệ</p>");
        expect(clean).not.toContain("<script");
        expect(clean).not.toContain("<style");
        expect(clean).not.toContain("<svg");
        expect(clean).not.toContain("onerror");
        expect(clean).not.toContain("onload");
        expect(clean).not.toContain("position:fixed");
        expect(clean).not.toContain('class="');
        expect(clean).not.toContain("javascript:");
        expect(clean).not.toContain("&#x6a;avascript");
        expect(clean).not.toContain("//evil.example");
        // Tự động gắn rel="noopener noreferrer" khi target="_blank"
        expect(clean).toContain('href="https://vnitjobs.vn/docs"');
        expect(clean).toContain('target="_blank"');
        expect(clean).toContain('rel="noopener noreferrer"');
        // Thẻ mở dở không được tồn tại dưới dạng thẻ <img thực sự
        expect(clean).not.toMatch(/<img\b/i);
      }
    });
  });

  describe("3. Upload Fake MIME, Polyglot/JS PDF & Path Traversal Defense", () => {
    test("checkPdf chặn file giả mạo PDF, polyglot %PDF<script> và PDF nhúng /JavaScript hoặc /Launch", async () => {
      expect(await checkPdf(VALID_PDF_BUFFER)).toBe(true);
      expect(await checkPdf(Buffer.from("MZ\x90\x00\x03\x00\x00\x00not-a-pdf"))).toBe(false);
      // Chỉ có 4 byte %PDF kèm HTML script, thiếu header chuẩn & %%EOF
      expect(await checkPdf(Buffer.from("%PDF<script>alert(1)</script>"))).toBe(false);
      // Polyglot có %PDF-1.4 và %%EOF nhưng chứa thẻ <script> ở đầu
      expect(await checkPdf(Buffer.from("%PDF-1.4\n<script>alert(1)</script>\n%%EOF"))).toBe(false);
      // PDF nhúng mã thực thi /JavaScript hoặc /Launch khi mở inline
      const activeJsPdf = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Type /Action /S /JavaScript /JS (app.alert(1)) >>\nendobj\n%%EOF"
      );
      expect(await checkPdf(activeJsPdf)).toBe(false);
    });

    test("checkFileType kiểm tra đúng magic bytes nhị phân và chặn SVG/HTML giả mạo đuôi ảnh", async () => {
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');

      expect(await checkFileType(pngMagic)).toBeTruthy();
      expect(await checkFileType(svgBuffer)).toBeNull();
    });

    test("getCVPath, deleteFile và sanitizeOriginalFilename chặn Path Traversal, chấm đơn '.' (EISDIR) và ký tự điều khiển", () => {
      expect(getCVPath("../../package.json")).toBeNull();
      expect(getCVPath("..\\..\\package.json")).toBeNull();
      expect(getCVPath(".")).toBeNull();
      expect(getCVPath("..")).toBeNull();
      expect(getCVPath("cv-test\0.pdf")).toBeNull();
      expect(getCVPath({ $ne: null })).toBeNull();

      // deleteFile không ném lỗi và bỏ qua subfolder trái phép
      expect(() => deleteFile("../../package.json", "../")).not.toThrow();

      expect(sanitizeOriginalFilename("../../etc/passwd\r\n<script>.pdf")).toBe("passwdscript.pdf");
      expect(sanitizeOriginalFilename("..\\..\\Windows\\system32\\cmd.exe", "CV.pdf")).toBe("cmd.exe");
    });

    test("POST /api/ai/match-cv và POST /jobs/:slug/apply chặn ngay file giả mạo PDF (fake MIME / fake magic bytes)", async () => {
      const employer = await Employer.create({
        companyName: "SecOps Corp",
        slug: "secops-corp",
        email: "sec@secops.vn",
        password: await hashPassword("Password123!"),
        city: "ha-noi",
        status: EMPLOYER_STATUS.ACTIVE,
        isEmailVerified: true,
      });

      const job = await Job.create({
        employerId: employer._id,
        title: "Security Engineer",
        slug: "security-engineer-audit",
        position: "senior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const home = await getCsrfAndCookies("/");

      // 1. Gửi file thực thi giả mạo đuôi .pdf + Content-Type: application/pdf lên /api/ai/match-cv
      const fakePdfBuf = Buffer.from("MZ\x90\x00FakeExecutablePretendingToBePdf");
      const aiRes = await request(app)
        .post("/api/ai/match-cv")
        .set("Cookie", home.cookies)
        .set("x-csrf-token", home.csrfToken)
        .field("jobId", String(job._id))
        .attach("cv", fakePdfBuf, { filename: "resume.pdf", contentType: "application/pdf" });

      expect(aiRes.status).toBe(400);
      expect(aiRes.body.success).toBe(false);
      expect(aiRes.body.code).toBe("INVALID_MAGIC_BYTES");

      // 2. Ứng viên nộp file HTML đổi đuôi hoặc PDF chứa /JavaScript vào /jobs/:slug/apply -> bị từ chối, không tạo Application
      const candPass = await hashPassword("Password123!");
      const candidate = await Candidate.create({
        fullName: "Trần Bảo Mật",
        email: "cand.sec@test.com",
        password: candPass,
        phone: "0912345678",
        status: CANDIDATE_STATUS.ACTIVE,
        isEmailVerified: true,
      });

      const loginInit = await getCsrfAndCookies("/candidate/login");
      const loginRes = await request(app)
        .post("/candidate/login")
        .set("Cookie", loginInit.cookies)
        .type("form")
        .send({ email: candidate.email, password: "Password123!", _csrf: loginInit.csrfToken });
      const authCookies = mergeCookies(loginInit.cookies, loginRes.headers["set-cookie"] || []);
      const jobPage = await getCsrfAndCookies(`/jobs/${job.slug}`, authCookies);

      const jsPdfBuf = Buffer.from("%PDF-1.4\n1 0 obj << /S /JavaScript /JS (alert(1)) >> endobj\n%%EOF");
      const applyRes = await request(app)
        .post(`/jobs/${job.slug}/apply`)
        .set("Cookie", jobPage.cookies)
        .field("_csrf", jobPage.csrfToken)
        .field("fullName", candidate.fullName)
        .field("email", candidate.email)
        .field("phone", candidate.phone)
        .attach("cv", jsPdfBuf, { filename: "../../evil-cv.pdf", contentType: "application/pdf" });

      expect(applyRes.status).toBe(302);
      expect(applyRes.headers.location).toBe(`/jobs/${job.slug}`);
      expect(await Application.countDocuments({ jobId: job._id })).toBe(0);
    });
  });

  describe("4. CSRF, Cookie Binding, JWT Algorithm Pinning & SuperAdmin Guard", () => {
    test("Từ chối CSRF token truyền qua query string (?_csrf=...) để chống rò rỉ qua URL/Referer", async () => {
      const page = await getCsrfAndCookies("/candidate/login");
      const res = await request(app)
        .post(`/candidate/login?_csrf=${encodeURIComponent(page.csrfToken)}`)
        .set("Cookie", page.cookies)
        .set("Accept", "application/json")
        .send({ email: "someone@test.com", password: "Password123!" });

      expect(res.status).toBe(403);
    });

    test("CSRF Error Handler không chuyển hướng sang tên miền ngoài qua header Referer giả mạo", async () => {
      const res = await request(app)
        .post("/candidate/login")
        .set("Referer", "https://evil-phishing.example/fake-login")
        .type("form")
        .send({ email: "victim@test.com", password: "Password123!" });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/");
    });

    test("resolveCsrfSessionIdentifier bỏ qua cookie giả mạo chưa xác thực", () => {
      const fakeReq = {
        cookies: { itj_token: "forged.jwt.token", itj_admin_token: "forged.admin.token" },
        user: null,
        admin: null,
        originalUrl: "/candidate/profile",
      };
      expect(resolveCsrfSessionIdentifier(fakeReq)).toBe("anonymous");
    });

    test("JWT ghim cứng HS256 (chặn alg=none) và middleware xóa sạch cookie có role/id sai định dạng", async () => {
      const unsignedAlgNone = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(
        JSON.stringify({ id: "67b8f9e01234567890abcdef", role: "candidate", tv: 0 })
      ).toString("base64url")}.`;
      expect(verifyUserToken(unsignedAlgNone)).toBeNull();

      // Token ký đúng secret nhưng id không phải ObjectId hoặc role lạ ('superadmin' nhét vào user cookie)
      const badRoleToken = jwt.sign(
        { id: "not-an-object-id", role: "superadmin", tv: 0 },
        env.JWT_SECRET,
        { algorithm: "HS256" }
      );

      const res = await request(app)
        .get("/candidate/profile")
        .set("Cookie", [`itj_token=${badRoleToken}`]);

      expect(res.status).toBe(302);
      const setCookies = res.headers["set-cookie"] || [];
      expect(setCookies.some((c) => c.startsWith("itj_token=;"))).toBe(true);
    });

    test("requireSuperAdmin trả 403 JSON chuẩn xác khi Admin thường gọi qua XHR/API", async () => {
      const normalAdmin = await Admin.create({
        fullName: "Moderator Admin",
        email: "mod@vnitjobs.vn",
        password: await hashPassword("AdminPass123!"),
        role: ADMIN_ROLES.ADMIN,
        status: ADMIN_STATUS.ACTIVE,
        tokenVersion: 0,
      });

      const adminToken = signAdminToken(normalAdmin);
      const adminPrefix = `/${env.ADMIN_PATH || "admin"}`;
      const page = await getCsrfAndCookies(adminPrefix, [`itj_admin_token=${adminToken}`]);

      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`${adminPrefix}/candidates/${fakeId}/hard-delete`)
        .set("Cookie", page.cookies)
        .set("Accept", "application/json")
        .set("x-csrf-token", page.csrfToken)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe("5. Rate-Limit Spoofing, Email Rotation & Type-Confusion Defense", () => {
    test("extractSafeEmail không sập 500 khi nhận JSON array/object injection và normalizeClientIp gom đúng dải IPv6 /64", () => {
      expect(extractSafeEmail({ body: { email: ["a@b.com", "c@d.com"] } })).toBe("");
      expect(extractSafeEmail({ body: { email: { $ne: null } } })).toBe("");
      expect(extractSafeEmail({ body: { email: "  USER@Example.COM " } })).toBe("user@example.com");

      const ipv6HostA = normalizeClientIp({ ip: "2001:db8:abcd:1234::1" });
      const ipv6HostB = normalizeClientIp({ ip: "2001:db8:abcd:1234:ffff:1111:2222:3333" });
      expect(ipv6HostA).toBe(ipv6HostB);

      // buildAiRateLimitKey bỏ qua hoàn toàn cookie giả khi chưa xác thực
      const key1 = buildAiRateLimitKey({ ip: "203.0.113.10", cookies: { candidate_token: "spoof_1", itj_token: "spoof_a" } });
      const key2 = buildAiRateLimitKey({ ip: "203.0.113.10", cookies: { candidate_token: "spoof_2", itj_token: "spoof_b" } });
      expect(key1).toBe(key2);
    });

    test("Chặn xoay vòng cookie giả trên AI endpoint và chặn xoay vòng email hàng loạt (OTP Bombing) từ cùng 1 IP", async () => {
      const miniApp = express();
      miniApp.use(express.json());
      const { aiRateLimiter, otpRateLimiter } = createRateLimiters({
        enforceLimits: true,
        maxOverrides: {
          aiPerPrincipal: 2,
          aiPerIp: 3,
          otpPerEmail: 2,
          otpPerIp: 3,
        },
      });

      miniApp.post("/test-ai", aiRateLimiter, (_req, res) => res.json({ ok: true }));
      miniApp.post("/test-otp", otpRateLimiter, (_req, res) => res.status(200).send("sent"));

      // 1. Xoay vòng cookie giả liên tục từ cùng 1 IP vẫn bị chặn ở ngưỡng 2 request cho anon
      const r1 = await request(miniApp).post("/test-ai").set("Cookie", ["candidate_token=rand1"]).send({});
      const r2 = await request(miniApp).post("/test-ai").set("Cookie", ["candidate_token=rand2"]).send({});
      const r3 = await request(miniApp).post("/test-ai").set("Cookie", ["itj_token=rand3"]).send({});

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(429);
      expect(r3.body.code).toBe("AI_RATE_LIMITED");

      // 2. Xoay vòng nhiều email nạn nhân khác nhau từ cùng 1 IP (OTP Bombing) + payload array vẫn bị trần IP chặn
      const o1 = await request(miniApp).post("/test-otp").send({ email: "victim1@example.com" });
      const o2 = await request(miniApp).post("/test-otp").send({ email: "victim2@example.com" });
      const o3 = await request(miniApp).post("/test-otp").send({ email: ["array-injection@example.com"] });
      const o4 = await request(miniApp).post("/test-otp").send({ email: "victim4@example.com" });

      expect(o1.status).toBe(200);
      expect(o2.status).toBe(200);
      expect(o3.status).toBe(200);
      // Request thứ 4 vượt trần otpPerIp = 3 -> bị redirect chặn
      expect(o4.status).toBe(302);
    });
  });
});
