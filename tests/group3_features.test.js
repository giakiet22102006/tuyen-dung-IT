// tests/group3_features.test.js
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../src/app");
const { Candidate, Employer, Job, Application, Article } = require("../src/models");
const { EMPLOYER_STATUS, CANDIDATE_STATUS, JOB_MODERATION, APPLICATION_STATUS } = require("../src/config/constants");
const { hashPassword } = require("../src/services/auth.service");
const blogService = require("../src/services/blog.service");

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
  await Candidate.deleteMany({});
  await Employer.deleteMany({});
  await Job.deleteMany({});
  await Application.deleteMany({});
  await Article.deleteMany({});
});

describe("Nhóm 3: Value-added Features (Hiring Pipeline ATS & IT Career Blog)", () => {
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

  async function createAndLoginEmployer(overrides = {}) {
    const passwordHash = await hashPassword("Password123");
    const emp = await Employer.create({
      companyName: overrides.companyName || "Tech Unicorn VN",
      email: overrides.email || "recruiter@unicorn.com",
      slug: overrides.slug || "tech-unicorn-vn",
      password: passwordHash,
      status: EMPLOYER_STATUS.ACTIVE,
      isEmailVerified: true,
      city: "ho-chi-minh",
      ...overrides,
    });

    const { cookies, csrfToken } = await getCsrfAndCookies("/employer/login");
    const loginRes = await request(app)
      .post("/employer/login")
      .set("Cookie", cookies)
      .send({
        _csrf: csrfToken,
        email: emp.email,
        password: "Password123",
      });

    const authCookies = mergeCookies(cookies, loginRes.headers["set-cookie"] || []);
    return { employer: emp, authCookies };
  }

  async function createCandidate(overrides = {}) {
    const passwordHash = await hashPassword("Password123");
    return await Candidate.create({
      fullName: overrides.fullName || "Trần Kỹ Sư",
      email: overrides.email || "engineer@test.com",
      password: passwordHash,
      status: CANDIDATE_STATUS.ACTIVE,
      isEmailVerified: true,
      ...overrides,
    });
  }

  // -------------------------------------------------------------
  // Feature 1: Bảng Kanban Quản lý Ứng viên (Hiring Pipeline)
  // -------------------------------------------------------------
  describe("Feature 1: Bảng Kanban Quản lý Ứng viên nhiều vòng (Hiring Pipeline ATS)", () => {
    test("GET /employer/pipeline hiển thị giao diện Kanban với các cột phân loại chuẩn", async () => {
      const { employer, authCookies } = await createAndLoginEmployer();
      const cand = await createCandidate();

      const job = await Job.create({
        employerId: employer._id,
        title: "Senior ReactJS Engineer",
        slug: "senior-reactjs-engineer",
        position: "senior",
        workingForm: "office",
        city: "ho-chi-minh",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      // Tạo hồ sơ ứng tuyển
      await Application.create({
        jobId: job._id,
        employerId: employer._id,
        candidateId: cand._id,
        fullName: cand.fullName,
        email: cand.email,
        phone: "0901234567",
        cv: { key: "mock.pdf", originalName: "CV.pdf" },
        status: APPLICATION_STATUS.PENDING,
      });

      const res = await request(app).get("/employer/pipeline").set("Cookie", authCookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain("Hiring Pipeline (Kanban ATS)");
      expect(res.text).toContain("Chờ Duyệt");
      expect(res.text).toContain("Phỏng Vấn");
      expect(res.text).toContain("Offer");
      expect(res.text).toContain(cand.fullName);
    });

    test("POST /employer/cvs/:id/status (AJAX) chuyển đổi vòng ứng viên mượt mà", async () => {
      const { employer, authCookies } = await createAndLoginEmployer();
      const cand = await createCandidate();

      const job = await Job.create({
        employerId: employer._id,
        title: "DevOps Specialist",
        slug: "devops-specialist",
        position: "middle",
        workingForm: "office",
        city: "ho-chi-minh",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const appDoc = await Application.create({
        jobId: job._id,
        employerId: employer._id,
        candidateId: cand._id,
        fullName: cand.fullName,
        email: cand.email,
        phone: "0909888777",
        cv: { key: "mock.pdf", originalName: "CV.pdf" },
        status: APPLICATION_STATUS.PENDING,
      });

      const { cookies, csrfToken } = await getCsrfAndCookies("/employer/pipeline", authCookies);

      // Chuyển sang vòng Phỏng vấn (interviewing)
      const moveRes1 = await request(app)
        .post(`/employer/cvs/${appDoc._id}/status`)
        .set("Cookie", cookies)
        .set("Accept", "application/json")
        .set("x-csrf-token", csrfToken)
        .send({ status: APPLICATION_STATUS.INTERVIEWING });

      expect(moveRes1.status).toBe(200);
      expect(moveRes1.body.success).toBe(true);
      expect(moveRes1.body.status).toBe(APPLICATION_STATUS.INTERVIEWING);

      // Chuyển sang vòng Offer (offered)
      const moveRes2 = await request(app)
        .post(`/employer/cvs/${appDoc._id}/status`)
        .set("Cookie", cookies)
        .set("Accept", "application/json")
        .set("x-csrf-token", csrfToken)
        .send({ status: APPLICATION_STATUS.OFFERED });

      expect(moveRes2.status).toBe(200);
      expect(moveRes2.body.status).toBe(APPLICATION_STATUS.OFFERED);

      const reloaded = await Application.findById(appDoc._id);
      expect(reloaded.status).toBe(APPLICATION_STATUS.OFFERED);
    });
  });

  // -------------------------------------------------------------
  // Feature 2: IT Career Blog & Guides
  // -------------------------------------------------------------
  describe("Feature 2: IT Career Blog & Cẩm nang nghề nghiệp", () => {
    test("blogService khởi tạo seed data và lấy danh sách bài viết", async () => {
      const result = await blogService.getArticles({ page: 1, limit: 10 });
      expect(result.articles.length).toBeGreaterThanOrEqual(5);
      expect(result.total).toBeGreaterThanOrEqual(5);

      // Lọc theo danh mục
      const roadmapResult = await blogService.getArticles({
        category: blogService.ARTICLE_CATEGORIES.CAREER_ROADMAP,
      });
      expect(roadmapResult.articles.length).toBeGreaterThanOrEqual(1);
    });

    test("GET /blog render danh sách bài viết và hỗ trợ tìm kiếm", async () => {
      const res = await request(app).get("/blog");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Cẩm Nang IT");
      expect(res.text).toContain("Roadmap Fullstack Web Developer 2026");

      // Tìm kiếm theo từ khóa
      const searchRes = await request(app).get("/blog?search=System+Design");
      expect(searchRes.status).toBe(200);
      expect(searchRes.text).toContain("System Design");
    });

    test("GET /blog/:slug hiển thị chi tiết bài viết và tăng lượt xem", async () => {
      await blogService.ensureSeedArticles();
      const firstArticle = await Article.findOne({ isPublished: true });
      expect(firstArticle).toBeDefined();

      const initialViews = firstArticle.views;

      const res = await request(app).get(`/blog/${firstArticle.slug}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain(firstArticle.title);
      expect(res.text).toContain("Sẵn sàng bứt phá sự nghiệp IT?");

      const reloaded = await Article.findById(firstArticle._id);
      expect(reloaded.views).toBe(initialViews + 1);
    });
  });
});
