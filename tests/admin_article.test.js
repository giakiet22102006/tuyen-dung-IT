// tests/admin_article.test.js
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../src/app");
const { Admin, Article, AuditLog } = require("../src/models");
const { ADMIN_ROLES } = require("../src/config/constants");
const { hashPassword } = require("../src/services/auth.service");
const blogService = require("../src/services/blog.service");
const aiService = require("../src/services/ai.service");

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
  await Article.deleteMany({});
  await AuditLog.deleteMany({});
});

describe("Admin Article Management & AI Content Curation", () => {
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
    const m = res.text.match(/name="_csrf"\s+value="([^"]+)"/) || res.text.match(/meta name="csrf-token" content="([^"]+)"/);
    const csrfToken = m ? m[1] : "";
    return { cookies: merged, csrfToken, res };
  }

  async function createAndLoginAdmin() {
    const hashedPassword = await hashPassword("Admin@123456");
    const admin = await Admin.create({
      username: "admin_tester",
      fullName: "Super Admin Tester",
      email: "admin_tester@vnitjobs.vn",
      password: hashedPassword,
      role: ADMIN_ROLES.SUPERADMIN,
      isActive: true,
      twoFactorEnabled: false,
    });

    const { cookies, csrfToken } = await getCsrfAndCookies("/admin/login");
    const loginRes = await request(app)
      .post("/admin/login")
      .set("Cookie", cookies)
      .send({
        email: "admin_tester@vnitjobs.vn",
        password: "Admin@123456",
        _csrf: csrfToken,
      });

    const authCookies = mergeCookies(cookies, loginRes.headers["set-cookie"] || []);
    return { admin, authCookies };
  }

  test("1. Blog service hỗ trợ lọc bài viết theo đối tượng độc giả (Candidate / Employer)", async () => {
    await blogService.ensureSeedArticles();

    // Lọc theo Ứng viên
    const candResult = await blogService.getArticles({
      audience: blogService.TARGET_AUDIENCES.CANDIDATE,
    });
    expect(candResult.articles.length).toBeGreaterThanOrEqual(1);
    expect(candResult.articles.some((a) => a.targetAudience === "employer")).toBe(false);

    // Lọc theo Nhà tuyển dụng
    const empResult = await blogService.getArticles({
      audience: blogService.TARGET_AUDIENCES.EMPLOYER,
    });
    expect(empResult.articles.length).toBeGreaterThanOrEqual(1);
    expect(empResult.articles.some((a) => a.targetAudience === "employer")).toBe(true);
  });

  test("2. AI service tự động sinh nội dung và trích xuất nguồn (Fallback & Generation)", async () => {
    // Test AI Sinh bài viết mới
    const genArticle = await aiService.generateArticleWithAi({
      topic: "Bí quyết phỏng vấn Golang Senior",
      targetAudience: "candidate",
      category: "interview_tips",
    });
    expect(genArticle.title).toBeDefined();
    expect(genArticle.content).toContain("<h");
    expect(genArticle.tags.length).toBeGreaterThan(0);
    expect(genArticle.isOriginal).toBe(true);

    // Test AI Curation trích nguồn từ internet
    const curArticle = await aiService.curateArticleFromSourceWithAi({
      sourceUrl: "https://medium.com/@dev/micro-frontends-guide",
      rawContent: "Micro frontends architecture is an architectural style where independently deliverable frontend applications are composed into a greater whole.",
      targetAudience: "all",
    });
    expect(curArticle.title).toBeDefined();
    expect(curArticle.sourceName).toBe("Medium");
    expect(curArticle.sourceUrl).toBe("https://medium.com/@dev/micro-frontends-guide");
    expect(curArticle.isOriginal).toBe(false);
  });

  test("3. Admin tạo bài viết mới và trích xuất nguồn thành công", async () => {
    const { authCookies } = await createAndLoginAdmin();
    const { cookies, csrfToken } = await getCsrfAndCookies("/admin/articles/create", authCookies);

    const postRes = await request(app)
      .post("/admin/articles/create")
      .set("Cookie", cookies)
      .send({
        _csrf: csrfToken,
        title: "Kinh Nghiệm Săn Đón Kỹ Sư AI Hàng Đầu 2026",
        slug: "kinh-nghiem-san-don-ky-su-ai-2026",
        category: "recruitment_tips",
        targetAudience: "employer",
        summary: "Bí quyết thu hút và tuyển chọn nhân tài AI chất lượng cao.",
        content: "<h2>1. Đặt đề bài thực chiến</h2><p>Đánh giá năng lực RAG và LLM tuning của ứng viên.</p>",
        tags: "AI, Recruiting, HRTech",
        readingTime: 6,
        isOriginal: "false",
        sourceName: "Tech Talent Journal",
        sourceUrl: "https://example.com/ai-recruiting",
        originalAuthor: "John Doe",
        isPublished: "true",
      });

    expect(postRes.status).toBe(302);
    expect(postRes.headers.location).toBe("/admin/articles");

    const created = await Article.findOne({ slug: "kinh-nghiem-san-don-ky-su-ai-2026" });
    expect(created).toBeDefined();
    expect(created.targetAudience).toBe("employer");
    expect(created.isOriginal).toBe(false);
    expect(created.sourceName).toBe("Tech Talent Journal");

    // Kiểm tra Audit Log đã được ghi
    const audit = await AuditLog.findOne({ action: "article.create", targetId: created._id.toString() });
    expect(audit).toBeDefined();
  });

  test("4. Admin bật/tắt xuất bản, sửa và xóa bài viết", async () => {
    const { authCookies } = await createAndLoginAdmin();

    const art = await Article.create({
      title: "Bài viết test sửa xóa",
      slug: "bai-viet-test-sua-xoa",
      summary: "Tóm tắt test",
      content: "<p>Nội dung test</p>",
      isPublished: true,
    });

    const { cookies, csrfToken } = await getCsrfAndCookies("/admin/articles", authCookies);

    // Toggle publish
    const toggleRes = await request(app)
      .post(`/admin/articles/${art._id}/toggle-publish`)
      .set("Cookie", cookies)
      .send({ _csrf: csrfToken });

    expect(toggleRes.status).toBe(302);
    const toggled = await Article.findById(art._id);
    expect(toggled.isPublished).toBe(false);

    // Edit article
    const editRes = await request(app)
      .post(`/admin/articles/${art._id}/edit`)
      .set("Cookie", cookies)
      .send({
        _csrf: csrfToken,
        title: "Bài viết đã cập nhật",
        slug: "bai-viet-da-cap-nhat",
        category: "tech_trends",
        targetAudience: "candidate",
        summary: "Tóm tắt đã đổi",
        content: "<p>Nội dung mới</p>",
        isPublished: "true",
      });

    expect(editRes.status).toBe(302);
    const edited = await Article.findById(art._id);
    expect(edited.title).toBe("Bài viết đã cập nhật");
    expect(edited.isPublished).toBe(true);

    // Delete article
    const deleteRes = await request(app)
      .post(`/admin/articles/${art._id}/delete`)
      .set("Cookie", cookies)
      .send({ _csrf: csrfToken });

    expect(deleteRes.status).toBe(302);
    const deleted = await Article.findById(art._id);
    expect(deleted).toBeNull();
  });

  test("5. API AI generate và AI curate trả về kết quả JSON hợp lệ cho Admin", async () => {
    const { authCookies } = await createAndLoginAdmin();
    const { cookies, csrfToken } = await getCsrfAndCookies("/admin/articles/create", authCookies);

    // Test API /admin/articles/ai-generate
    const genRes = await request(app)
      .post("/admin/articles/ai-generate")
      .set("Cookie", cookies)
      .set("x-csrf-token", csrfToken)
      .send({
        topic: "Lộ trình học DevOps cho người mới bắt đầu",
        targetAudience: "candidate",
      });

    expect(genRes.status).toBe(200);
    expect(genRes.body.success).toBe(true);
    expect(genRes.body.data.title).toBeDefined();

    // Test API /admin/articles/ai-curate
    const curateRes = await request(app)
      .post("/admin/articles/ai-curate")
      .set("Cookie", cookies)
      .set("x-csrf-token", csrfToken)
      .send({
        sourceUrl: "https://viblo.asia/p/tong-quan-ve-microservices",
        rawContent: "Kiến trúc microservices chia nhỏ hệ thống thành các dịch vụ độc lập...",
        targetAudience: "all",
      });

    expect(curateRes.status).toBe(200);
    expect(curateRes.body.success).toBe(true);
    expect(curateRes.body.data.sourceName).toBe("Viblo");
    expect(curateRes.body.data.isOriginal).toBe(false);
  });

  test("6. Khóa bài viết độc quyền (isGated): Khách vãng lai bị khóa, đúng tài khoản thì mở khóa", async () => {
    const gatedCandArticle = await Article.create({
      title: "Bài viết khóa cho Ứng viên",
      slug: "bai-viet-khoa-cho-ung-vien",
      category: "interview_tips",
      targetAudience: "candidate",
      isGated: true,
      summary: "Tóm tắt bài viết độc quyền cho Ứng viên",
      content: "<p>Nội dung siêu bí mật cho ứng viên</p>",
      isPublished: true,
    });

    // 1. Khách vãng lai truy cập -> bị khóa (thấy hộp thông báo đăng nhập Ứng viên)
    const guestRes = await request(app).get(`/blog/${gatedCandArticle.slug}`);
    expect(guestRes.status).toBe(200);
    expect(guestRes.text).toContain("Đăng Nhập Tài Khoản Ứng Viên Để Mở Khóa Bài Viết");
    expect(guestRes.text).not.toContain("Nội dung siêu bí mật cho ứng viên");

    // 2. Tạo và đăng nhập tài khoản Ứng viên
    const { Candidate } = require("../src/models");
    const { signUserToken } = require("../src/services/auth.service");
    const cand = await Candidate.create({
      fullName: "Ứng Viên VIP",
      email: "candidate_vip@test.com",
      password: "HashedPassword123",
      isEmailVerified: true,
      status: "active",
      tokenVersion: 1,
    });

    const token = signUserToken(cand, "candidate");

    // 3. Ứng viên truy cập -> mở khóa toàn văn
    const candRes = await request(app)
      .get(`/blog/${gatedCandArticle.slug}`)
      .set("Cookie", [`itj_token=${token}`]);

    expect(candRes.status).toBe(200);
    expect(candRes.text).toContain("Nội dung siêu bí mật cho ứng viên");
    expect(candRes.text).not.toContain("Đăng Nhập Tài Khoản Ứng Viên Để Mở Khóa Bài Viết");
  });
});
