// tests/admin_setting.test.js
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../src/app");
const { Admin, Setting, AuditLog } = require("../src/models");
const { ADMIN_ROLES } = require("../src/config/constants");
const { hashPassword } = require("../src/services/auth.service");

let mongoServer;

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
  await Admin.deleteMany({});
  await Setting.deleteMany({});
  await AuditLog.deleteMany({});
});

describe("Admin About Settings Management & Dynamic /about Page", () => {
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
    const m =
      res.text.match(/name="_csrf"\s+value="([^"]+)"/) ||
      res.text.match(/meta name="csrf-token" content="([^"]+)"/);
    return {
      csrfToken: m ? m[1] : "",
      cookies: merged,
    };
  }

  async function createAndLoginAdmin() {
    const passwordHash = await hashPassword("AdminSecret123!");
    const admin = await Admin.create({
      fullName: "Super Administrator",
      email: "admin_test@vnitjobs.vn",
      password: passwordHash,
      role: ADMIN_ROLES.SUPERADMIN,
      isActive: true,
      twoFactorSecret: "MOCK2FASECRET1234",
    });

    const { csrfToken: loginCsrf, cookies: c1 } = await getCsrfAndCookies("/admin/login");

    const loginRes = await request(app)
      .post("/admin/login")
      .set("Cookie", c1)
      .send({
        _csrf: loginCsrf,
        email: "admin_test@vnitjobs.vn",
        password: "AdminSecret123!",
      });

    const c2 = mergeCookies(c1, loginRes.headers["set-cookie"] || []);

    const { csrfToken: verifyCsrf, cookies: c3 } = await getCsrfAndCookies(
      "/admin/verify-2fa",
      c2
    );

    const verifyRes = await request(app)
      .post("/admin/verify-2fa")
      .set("Cookie", c3)
      .send({
        _csrf: verifyCsrf,
        otp: "123456",
      });

    const sessionCookies = mergeCookies(c3, verifyRes.headers["set-cookie"] || []);

    return { admin, sessionCookies };
  }

  test("1. Setting.getSettings() returns default settings when collection is empty", async () => {
    const settings = await Setting.getSettings();
    expect(settings).toBeDefined();
    expect(settings.key).toBe("system_settings");
    expect(settings.about.title).toBe("Về chúng tôi - VN.ITJobs");
    expect(settings.about.statsJobs).toBe("880+");
  });

  test("2. Public GET /about renders default about information", async () => {
    const res = await request(app).get("/about");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Về chúng tôi - VN.ITJobs");
    expect(res.text).toContain("880+");
  });

  test("3. Public GET /about with Accept: text/markdown returns markdown format", async () => {
    const res = await request(app).get("/about").set("Accept", "text/markdown");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.text).toContain("# Về chúng tôi - VN.ITJobs");
    expect(res.text).toContain("880+");
  });

  test("4. Unauthenticated access to /admin/settings/about redirects to login", async () => {
    const res = await request(app).get("/admin/settings/about");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/admin/login");
  });

  test("5. Admin can view the edit form at /admin/settings/about", async () => {
    const { sessionCookies } = await createAndLoginAdmin();
    const res = await request(app)
      .get("/admin/settings/about")
      .set("Cookie", sessionCookies);

    expect(res.status).toBe(200);
    expect(res.text).toContain("Cấu hình Trang Về chúng tôi");
    expect(res.text).toContain('name="title"');
    expect(res.text).toContain('name="statsJobs"');
  });

  test("6. Admin updates about info and changes reflect on public page and audit log", async () => {
    const { sessionCookies } = await createAndLoginAdmin();

    const { csrfToken, cookies } = await getCsrfAndCookies(
      "/admin/settings/about",
      sessionCookies
    );

    const updatePayload = {
      _csrf: csrfToken,
      title: "Hệ Sinh Thái Tuyển Dụng Công Nghệ VN.ITJobs 2026",
      subtitle: "Nâng tầm kỹ sư Việt Nam vươn ra toàn cầu.",
      overviewParagraph1: "VN.ITJobs được xây dựng với sứ mệnh phụng sự cộng đồng công nghệ.",
      overviewParagraph2: "Hơn 50+ kỹ năng lập trình với thuật toán AI Matching hiện đại.",
      vision: "Trở thành kỳ lân tuyển dụng công nghệ tại Đông Nam Á.",
      mission: "Kết nối đúng người đúng việc trong thời gian nhanh nhất.",
      statsJobs: "2.500+",
      statsJobsLabel: "Việc làm mở tuyển mỗi ngày",
      statsCompanies: "3.000+",
      statsCompaniesLabel: "Doanh nghiệp công nghệ",
      statsCandidates: "500.000+",
      statsCandidatesLabel: "Kỹ sư phần mềm đã kết nối",
      companyName: "Công ty Cổ phần Công nghệ VN.ITJobs Toàn Cầu",
      businessCode: "0109998888",
      headOffice: "Tòa nhà FPT Cầu Giấy, Hà Nội",
      branchOffice: "Saigon High-Tech Park, TP.HCM",
      email: "support@vnitjobs.vn",
      hotline: "1900 6868",
    };

    const postRes = await request(app)
      .post("/admin/settings/about")
      .set("Cookie", cookies)
      .send(updatePayload);

    expect(postRes.status).toBe(302);
    expect(postRes.headers.location).toContain("/admin/settings/about");

    // Check DB
    const updatedSettings = await Setting.getSettings();
    expect(updatedSettings.about.title).toBe("Hệ Sinh Thái Tuyển Dụng Công Nghệ VN.ITJobs 2026");
    expect(updatedSettings.about.statsJobs).toBe("2.500+");
    expect(updatedSettings.about.companyName).toBe("Công ty Cổ phần Công nghệ VN.ITJobs Toàn Cầu");

    // Check AuditLog
    const log = await AuditLog.findOne({ action: "settings.about.update" });
    expect(log).toBeDefined();
    expect(log.targetType).toBe("System");

    // Check Public HTML
    const publicRes = await request(app).get("/about");
    expect(publicRes.status).toBe(200);
    expect(publicRes.text).toContain("Hệ Sinh Thái Tuyển Dụng Công Nghệ VN.ITJobs 2026");
    expect(publicRes.text).toContain("2.500+");
    expect(publicRes.text).toContain("Công ty Cổ phần Công nghệ VN.ITJobs Toàn Cầu");

    // Check Public Markdown
    const markdownRes = await request(app).get("/about").set("Accept", "text/markdown");
    expect(markdownRes.status).toBe(200);
    expect(markdownRes.text).toContain("# Hệ Sinh Thái Tuyển Dụng Công Nghệ VN.ITJobs 2026");
    expect(markdownRes.text).toContain("2.500+");

    // Check Global Footer synchronization across all pages (e.g. /search)
    const searchRes = await request(app).get("/search");
    expect(searchRes.status).toBe(200);
    expect(searchRes.text).toContain("Trụ sở: Tòa nhà FPT Cầu Giấy, Hà Nội");
    expect(searchRes.text).toContain("Hotline: 1900 6868");
    expect(searchRes.text).toContain("Email: support@vnitjobs.vn");
  });
});
