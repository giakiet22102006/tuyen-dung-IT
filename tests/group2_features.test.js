// tests/group2_features.test.js
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../src/app");
const { Candidate, Employer, Job, JobAlert, CompanyFollow } = require("../src/models");
const { EMPLOYER_STATUS, CANDIDATE_STATUS, JOB_MODERATION } = require("../src/config/constants");
const { hashPassword } = require("../src/services/auth.service");
const salaryService = require("../src/services/salary.service");
const { notifyMatchingSubscribers } = require("../src/services/jobAlert.service");

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
  await JobAlert.deleteMany({});
  await CompanyFollow.deleteMany({});
});

describe("Nhóm 2: Killer Features (Salary Benchmark, Job Alert, Follow Company)", () => {
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
      fullName: overrides.fullName || "Trần Ứng Viên",
      email: overrides.email || "candidate-test2@test.com",
      password: passwordHash,
      status: CANDIDATE_STATUS.ACTIVE,
      isEmailVerified: true,
      ...overrides,
    });

    const { cookies, csrfToken } = await getCsrfAndCookies("/candidate/login");
    const loginRes = await request(app)
      .post("/candidate/login")
      .set("Cookie", cookies)
      .send({
        _csrf: csrfToken,
        email: cand.email,
        password: "Password123",
      });

    const authCookies = mergeCookies(cookies, loginRes.headers["set-cookie"] || []);
    return { candidate: cand, authCookies };
  }

  async function createEmployer(overrides = {}) {
    const passwordHash = await hashPassword("Password123");
    return await Employer.create({
      companyName: overrides.companyName || "Công Ty VinaTech",
      email: overrides.email || "vinatech@test.com",
      slug: overrides.slug || "cong-ty-vinatech",
      password: passwordHash,
      status: EMPLOYER_STATUS.ACTIVE,
      city: overrides.city || "ho-chi-minh",
      ...overrides,
    });
  }

  // -------------------------------------------------------------
  // Feature 1: Tra cứu & So sánh Lương IT (Salary Benchmark & Calculator)
  // -------------------------------------------------------------
  describe("Feature 1: Tra cứu & So sánh Lương IT (/salary)", () => {
    test("salaryService tính toán đúng baseline và rank phân vị thị trường", async () => {
      const stats = await salaryService.getSalaryStats({
        position: "junior",
        skill: "golang",
        city: "ho-chi-minh",
      });

      expect(stats).toBeDefined();
      expect(stats.position).toBe("Junior");
      expect(stats.salaryMin).toBeGreaterThan(14000000);
      expect(stats.salaryMedian).toBeGreaterThan(20000000);

      // Đánh giá mức lương 25 triệu (ở khoảng giữa min và max)
      const evaluation = salaryService.evaluateSalaryRank(25000000, stats);
      expect(evaluation).toBeDefined();
      expect(evaluation.percentile).toBeGreaterThanOrEqual(25);
      expect(evaluation.percentile).toBeLessThanOrEqual(99);

      // Đánh giá mức lương rất cao (vượt max) -> top phân vị
      const highEval = salaryService.evaluateSalaryRank(100000000, stats);
      expect(highEval.percentile).toBeGreaterThanOrEqual(90);
    });

    test("GET /salary render giao diện tra cứu lương thành công", async () => {
      const res = await request(app).get("/salary?position=middle&skill=reactjs&city=ha-noi&salary=30000000");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Tra Cứu &amp; So Sánh Mức Lương IT");
      expect(res.text).toContain("Thang Lương Vị Trí Middle");
    });

    test("GET /api/salary/calculate trả về JSON thống kê chính xác", async () => {
      const res = await request(app).get("/api/salary/calculate?position=senior&skill=python&city=ho-chi-minh&salary=60000000");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats.position).toBe("Senior");
      expect(res.body.evaluation.amount).toBe(60000000);
    });
  });

  // -------------------------------------------------------------
  // Feature 2: Đăng ký Nhận thông báo việc làm mới (Job Alert)
  // -------------------------------------------------------------
  describe("Feature 2: Đăng ký Thông báo việc làm mới (Job Alert)", () => {
    test("POST /job-alerts tạo mới subscription thành công và hủy bằng unsubscribe token", async () => {
      const { cookies, csrfToken } = await getCsrfAndCookies("/salary");

      // Đăng ký nhận thông báo
      const subscribeRes = await request(app)
        .post("/job-alerts")
        .set("Cookie", cookies)
        .set("Accept", "application/json")
        .send({
          _csrf: csrfToken,
          email: "alert-dev@gmail.com",
          keyword: "ReactJS",
          city: "ho-chi-minh",
          position: "junior",
        });

      expect(subscribeRes.status).toBe(200);
      expect(subscribeRes.body.success).toBe(true);

      const alert = await JobAlert.findOne({ email: "alert-dev@gmail.com" });
      expect(alert).toBeDefined();
      expect(alert.isActive).toBe(true);
      expect(alert.keyword).toBe("ReactJS");
      expect(alert.unsubscribeToken).toBeTruthy();

      // Hủy đăng ký qua 1-click token
      const unsubRes = await request(app).get(`/job-alerts/unsubscribe/${alert.unsubscribeToken}`);
      expect(unsubRes.status).toBe(200);
      expect(unsubRes.text).toContain("Hủy Nhận Thông Báo Thành Công");

      const reloaded = await JobAlert.findById(alert._id);
      expect(reloaded.isActive).toBe(false);
    });

    test("notifyMatchingSubscribers quét đúng ứng viên và gửi email", async () => {
      // Tạo 2 alert: 1 alert khớp với Golang, 1 alert chỉ nhận Java
      const alert1 = await JobAlert.create({
        email: "golang-fan@test.com",
        keyword: "Golang",
        city: "ho-chi-minh",
        position: "senior",
        isActive: true,
      });

      const alert2 = await JobAlert.create({
        email: "java-fan@test.com",
        keyword: "Java",
        city: "ha-noi",
        position: "junior",
        isActive: true,
      });

      const mockJob = {
        title: "Senior Golang Backend Engineer",
        slug: "senior-golang-backend-engineer",
        city: "ho-chi-minh",
        position: "senior",
        skills: [{ name: "Golang", slug: "golang" }],
        salaryMin: 40000000,
        salaryMax: 70000000,
      };

      // Kích hoạt quét & gửi email
      await notifyMatchingSubscribers(mockJob, { companyName: "Tech Unicorn" });

      const reloaded1 = await JobAlert.findById(alert1._id);
      const reloaded2 = await JobAlert.findById(alert2._id);

      // Alert 1 khớp nên được cập nhật lastSentAt
      expect(reloaded1.lastSentAt).not.toBeNull();
      // Alert 2 không khớp nên lastSentAt vẫn null
      expect(reloaded2.lastSentAt).toBeNull();
    });

    test("Quản lý Job Alert trong trang ứng viên: toggle & delete", async () => {
      const { candidate, authCookies } = await createAndLoginCandidate();
      const alert = await JobAlert.create({
        candidateId: candidate._id,
        email: candidate.email,
        keyword: "DevOps",
        isActive: true,
      });

      // Xem danh sách alert
      const listRes = await request(app).get("/candidate/job-alerts").set("Cookie", authCookies);
      expect(listRes.status).toBe(200);
      expect(listRes.text).toContain("DevOps");

      // Lấy CSRF token cho thao tác toggle
      const { cookies, csrfToken } = await getCsrfAndCookies("/candidate/job-alerts", authCookies);

      // Tạm dừng alert (toggle)
      const toggleRes = await request(app)
        .post(`/candidate/job-alerts/${alert._id}/toggle`)
        .set("Cookie", cookies)
        .set("Accept", "application/json")
        .set("x-csrf-token", csrfToken);

      expect(toggleRes.status).toBe(200);
      expect(toggleRes.body.isActive).toBe(false);

      // Xóa alert
      const delRes = await request(app)
        .post(`/candidate/job-alerts/${alert._id}/delete`)
        .set("Cookie", cookies)
        .set("Accept", "application/json")
        .set("x-csrf-token", csrfToken);

      expect(delRes.status).toBe(200);
      const exists = await JobAlert.findById(alert._id);
      expect(exists).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // Feature 3: Theo dõi Công ty (Follow Company)
  // -------------------------------------------------------------
  describe("Feature 3: Theo dõi Công ty (Follow Company)", () => {
    test("POST /companies/:id/follow bật/tắt theo dõi và cập nhật số followers", async () => {
      const { candidate, authCookies } = await createAndLoginCandidate();
      const employer = await createEmployer({ companyName: "VinaTech Corp" });

      const { cookies, csrfToken } = await getCsrfAndCookies(`/companies/${employer.slug}`, authCookies);

      // Lần 1: Bấm Theo dõi
      const followRes = await request(app)
        .post(`/companies/${employer._id}/follow`)
        .set("Cookie", cookies)
        .set("Accept", "application/json")
        .set("x-csrf-token", csrfToken);

      expect(followRes.status).toBe(200);
      expect(followRes.body.success).toBe(true);
      expect(followRes.body.followed).toBe(true);
      expect(followRes.body.followersCount).toBe(1);

      // Kiểm tra trong DB
      const record = await CompanyFollow.findOne({ candidateId: candidate._id, employerId: employer._id });
      expect(record).toBeDefined();

      // Lần 2: Bấm Bỏ theo dõi
      const unfollowRes = await request(app)
        .post(`/companies/${employer._id}/follow`)
        .set("Cookie", cookies)
        .set("Accept", "application/json")
        .set("x-csrf-token", csrfToken);

      expect(unfollowRes.status).toBe(200);
      expect(unfollowRes.body.followed).toBe(false);
      expect(unfollowRes.body.followersCount).toBe(0);
    });

    test("GET /candidate/followed-companies hiển thị đúng danh sách công ty đã theo dõi", async () => {
      const { candidate, authCookies } = await createAndLoginCandidate();
      const employer = await createEmployer({ companyName: "Google Singapore Partner" });

      // Tạo follow
      await CompanyFollow.create({ candidateId: candidate._id, employerId: employer._id });

      // Tạo 1 job đang mở của công ty
      await Job.create({
        employerId: employer._id,
        title: "Staff Cloud Engineer",
        slug: "staff-cloud-engineer",
        position: "senior",
        workingForm: "office",
        city: "ho-chi-minh",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const res = await request(app).get("/candidate/followed-companies").set("Cookie", authCookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain("Google Singapore Partner");
      expect(res.text).toContain("1 việc làm");
    });
  });
});
