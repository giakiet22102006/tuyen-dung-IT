// tests/group1_features.test.js
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../src/app");
const { Candidate, Employer, Job, Application, SavedJob } = require("../src/models");
const { EMPLOYER_STATUS, CANDIDATE_STATUS, JOB_MODERATION, BENEFITS } = require("../src/config/constants");
const { hashPassword } = require("../src/services/auth.service");
const { generateItProfilePdf } = require("../src/services/pdfGenerator.service");

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
  await SavedJob.deleteMany({});
});

describe("Nhóm 1: Tính Năng Chuẩn ITviec (Saved Jobs, IT Benefits, Online IT Profile)", () => {
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

  async function createAndLoginCandidate(overrides = {}) {
    const passwordHash = await hashPassword("Password123");
    const cand = await Candidate.create({
      fullName: overrides.fullName || "Nguyễn Văn IT",
      email: overrides.email || "candidate-it@test.com",
      password: passwordHash,
      phone: overrides.phone || "0912345678",
      status: CANDIDATE_STATUS.ACTIVE,
      isEmailVerified: true,
      itProfile: overrides.itProfile || {
        title: "Senior Fullstack Engineer",
        level: "senior",
        yearsOfExperience: 4,
        bio: "Lập trình viên đam mê công nghệ cao cấp.",
        skills: ["ReactJS", "NodeJS", "TypeScript"],
        workExperience: [
          {
            company: "FPT Software",
            position: "Fullstack Developer",
            startDate: "2022",
            endDate: "2025",
            isCurrent: true,
            description: "Phát triển hệ thống Microservices.",
          },
        ],
      },
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

    const authCookies = mergeCookies(init.cookies, loginRes.headers["set-cookie"] || []);
    return { candidate: cand, cookies: authCookies };
  }

  async function createAndLoginEmployer() {
    const passwordHash = await hashPassword("Password123");
    const emp = await Employer.create({
      companyName: "Kite Tech Global",
      slug: "kite-tech-global",
      email: "hr@kitetech.com",
      password: passwordHash,
      city: "ha-noi",
      address: "Duy Tan, Cau Giay, Ha Noi",
      status: EMPLOYER_STATUS.ACTIVE,
      isEmailVerified: true,
    });

    const init = await getCsrfAndCookies("/employer/login");
    const loginRes = await request(app)
      .post("/employer/login")
      .set("Cookie", init.cookies)
      .type("form")
      .send({
        email: emp.email,
        password: "Password123",
        _csrf: init.csrfToken,
      });

    const authCookies = mergeCookies(init.cookies, loginRes.headers["set-cookie"] || []);
    return { employer: emp, cookies: authCookies };
  }

  // TEST 1: SAVED JOBS (Lưu việc làm yêu thích)
  describe("1. Tính năng Lưu Việc Làm Yêu Thích (Bookmark / Saved Jobs)", () => {
    test("POST /candidate/saved-jobs/:jobId/toggle - Lưu và bỏ lưu việc làm", async () => {
      const { candidate, cookies } = await createAndLoginCandidate();
      const { employer } = await createAndLoginEmployer();

      const job = await Job.create({
        employerId: employer._id,
        title: "Senior ReactJS Engineer",
        slug: "senior-reactjs-engineer-job",
        position: "senior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
        benefits: ["macbook", "salary13"],
      });

      const page = await getCsrfAndCookies("/", cookies);

      // Lần 1: Lưu việc làm
      const saveRes = await request(app)
        .post(`/candidate/saved-jobs/${job._id}/toggle`)
        .set("Cookie", page.cookies)
        .set("x-csrf-token", page.csrfToken)
        .send();

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.success).toBe(true);
      expect(saveRes.body.saved).toBe(true);

      const savedCount = await SavedJob.countDocuments({ candidateId: candidate._id, jobId: job._id });
      expect(savedCount).toBe(1);

      // Xem danh sách việc làm đã lưu
      const listRes = await request(app)
        .get("/candidate/saved-jobs")
        .set("Cookie", cookies);

      expect(listRes.status).toBe(200);
      expect(listRes.text).toContain("Senior ReactJS Engineer");

      // Lần 2: Bỏ lưu
      const unsaveRes = await request(app)
        .post(`/candidate/saved-jobs/${job._id}/toggle`)
        .set("Cookie", page.cookies)
        .set("x-csrf-token", page.csrfToken)
        .send();

      expect(unsaveRes.status).toBe(200);
      expect(unsaveRes.body.saved).toBe(false);

      const countAfter = await SavedJob.countDocuments({ candidateId: candidate._id, jobId: job._id });
      expect(countAfter).toBe(0);
    });
  });

  // TEST 2: IT PERKS & BENEFITS (Đãi ngộ IT)
  describe("2. Tính năng Đãi ngộ đặc thù IT (Macbook, Lương T13, Hybrid...)", () => {
    test("Đăng tin việc làm có chọn đãi ngộ và lọc việc làm theo đãi ngộ tại /search", async () => {
      const { employer, cookies } = await createAndLoginEmployer();

      const page = await getCsrfAndCookies("/employer/jobs/create", cookies);

      const createRes = await request(app)
        .post("/employer/jobs/create")
        .set("Cookie", page.cookies)
        .type("form")
        .send({
          _csrf: page.csrfToken,
          title: "DevOps Kubernetes Specialist",
          salaryMin: "30000000",
          salaryMax: "50000000",
          position: "senior",
          workingForm: "flexible",
          skills: "Kubernetes, Docker, AWS",
          description: "<p>Mo ta cong viec DevOps</p>",
          benefits: ["macbook", "hybrid", "insurance"],
        });

      expect(createRes.status).toBe(302);

      const job = await Job.findOne({ title: "DevOps Kubernetes Specialist" });
      expect(job).not.toBeNull();
      expect(job.benefits).toContain("macbook");
      expect(job.benefits).toContain("hybrid");

      // Tìm kiếm công việc theo bộ lọc benefit=macbook
      const searchRes = await request(app).get("/search?benefit=macbook");
      expect(searchRes.status).toBe(200);
      expect(searchRes.text).toContain("DevOps Kubernetes Specialist");
    });
  });

  // TEST 3: ONLINE IT PROFILE & 1-CLICK APPLY
  describe("3. Hồ sơ IT Profile Trực Tuyến & Ứng tuyển 1-Click", () => {
    test("GET & POST /candidate/it-profile cập nhật hồ sơ trực tuyến", async () => {
      const { candidate, cookies } = await createAndLoginCandidate();

      const page = await getCsrfAndCookies("/candidate/it-profile", cookies);
      expect(page.res.status).toBe(200);
      expect(page.res.text).toContain("Hồ sơ IT Profile Trực Tuyến");

      const updateRes = await request(app)
        .post("/candidate/it-profile")
        .set("Cookie", page.cookies)
        .type("form")
        .send({
          _csrf: page.csrfToken,
          title: "Lead AI Engineer",
          level: "lead",
          yearsOfExperience: 6,
          bio: "Chuyên gia phát triển ứng dụng AI & LLM.",
          skills: "Python, PyTorch, Gemini, Node.js",
          githubUrl: "https://github.com/my-ai-repo",
          linkedinUrl: "https://linkedin.com/in/my-ai-profile",
        });

      expect(updateRes.status).toBe(302);

      const updated = await Candidate.findById(candidate._id);
      expect(updated.itProfile.title).toBe("Lead AI Engineer");
      expect(updated.itProfile.level).toBe("lead");
      expect(updated.itProfile.yearsOfExperience).toBe(6);
      expect(updated.itProfile.skills).toContain("Python");
    });

    test("Ứng tuyển bằng IT Profile Trực Tuyến (applyType=it_profile)", async () => {
      const { candidate, cookies } = await createAndLoginCandidate();
      const { employer } = await createAndLoginEmployer();

      const job = await Job.create({
        employerId: employer._id,
        title: "Golang Backend Architect",
        slug: "golang-backend-architect-job",
        position: "manager",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const page = await getCsrfAndCookies(`/jobs/${job.slug}`, cookies);

      // Ứng viên nộp CV bằng 1-Click IT Profile (không gửi file upload)
      const applyRes = await request(app)
        .post(`/jobs/${job.slug}/apply`)
        .set("Cookie", page.cookies)
        .type("form")
        .send({
          _csrf: page.csrfToken,
          fullName: candidate.fullName,
          email: candidate.email,
          phone: candidate.phone,
          applyType: "it_profile",
        });

      expect(applyRes.status).toBe(302);

      const appDoc = await Application.findOne({ jobId: job._id, candidateId: candidate._id });
      expect(appDoc).not.toBeNull();
      expect(appDoc.cv).toBeDefined();
      expect(appDoc.cv.key).toBeDefined();
      expect(appDoc.cv.originalName).toContain("IT_Profile");
      expect(appDoc.cv.size).toBeGreaterThan(0);
    });

    test("Hàm generateItProfilePdf sinh buffer PDF hợp lệ", async () => {
      const { candidate } = await createAndLoginCandidate();
      const buffer = await generateItProfilePdf(candidate, "Fullstack Developer");
      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(100);
      // Header chuẩn PDF %PDF
      expect(buffer.toString("utf8", 0, 4)).toBe("%PDF");
    });
  });
});
