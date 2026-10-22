const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../src/app");
const { Employer, Job, Skill } = require("../src/models");
const { EMPLOYER_STATUS, JOB_MODERATION } = require("../src/config/constants");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Setup test data
  const emp = await Employer.create({
    companyName: "Công ty Test Public",
    slug: "cong-ty-test-public",
    email: "test.public@gmail.com",
    password: "Password123",
    city: "ha-noi",
    address: "Keangnam, Hà Nội",
    status: EMPLOYER_STATUS.ACTIVE,
  });

  await Skill.create({ name: "ReactJS", slug: "reactjs" });

  await Job.create({
    employerId: emp._id,
    title: "Senior ReactJS Developer",
    slug: "senior-reactjs-developer-123456",
    salaryMin: 1500,
    salaryMax: 2500,
    position: "senior",
    workingForm: "office",
    skills: [{ name: "ReactJS", slug: "reactjs" }],
    city: "ha-noi",
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
  });
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});

describe("Phase 3: Public Pages Integration Tests", () => {
  test("GET / - Trang chủ hiển thị 200 và có tên nhà tuyển dụng hàng đầu", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Công ty Test Public");
    expect(res.text).toContain("Việc làm IT cho Developer");
  });

  test("GET /search - Tìm kiếm theo keyword trả về job khớp", async () => {
    const res = await request(app).get("/search?keyword=ReactJS");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Senior ReactJS Developer");
    expect(res.text).toContain("1.500$ - 2.500$");
  });

  test("GET /search - Lọc theo thành phố", async () => {
    const res = await request(app).get("/search?city=ha-noi");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Senior ReactJS Developer");

    const resEmpty = await request(app).get("/search?city=da-nang");
    expect(resEmpty.status).toBe(200);
    expect(resEmpty.text).toContain("Không tìm thấy việc làm nào");
  });

  test("GET /companies - Danh sách công ty hiển thị 200", async () => {
    const res = await request(app).get("/companies");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Công ty Test Public");
    expect(res.text).toContain("1 Việc làm");
  });

  test("GET /companies/:slug - Chi tiết công ty hợp lệ", async () => {
    const res = await request(app).get("/companies/cong-ty-test-public");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Công ty Test Public");
    expect(res.text).toContain("Công ty có 1 việc làm");
    expect(res.text).toContain("Senior ReactJS Developer");
  });

  test("GET /companies/:slug - Trả về 404 nếu slug không tồn tại", async () => {
    const res = await request(app).get("/companies/slug-khong-ton-tai");
    expect(res.status).toBe(404);
  });

  test("GET /jobs/:slug - Chi tiết việc làm hợp lệ", async () => {
    const res = await request(app).get("/jobs/senior-reactjs-developer-123456");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Senior ReactJS Developer");
    expect(res.text).toContain("1.500$ - 2.500$");
    expect(res.text).toContain("Công ty Test Public");
    expect(res.text).toContain("Gửi CV ứng tuyển");
  });

  test("GET /jobs/:slug - Trả về 404 nếu job không tồn tại", async () => {
    const res = await request(app).get("/jobs/job-khong-ton-tai");
    expect(res.status).toBe(404);
  });

  describe("Fuzzy Search & Typo Tolerance (Tìm kiếm mờ & Có phải bạn muốn tìm...)", () => {
    test("Fuzzy search tự động gợi ý và hiển thị kết quả khi gõ sai chính tả (recat -> react)", async () => {
      const res = await request(app).get("/search?keyword=recat");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Senior ReactJS Developer");
      expect(res.text).toContain("Không tìm thấy kết quả cho từ khóa");
      expect(res.text).toContain("react");
    });

    test("Người dùng chọn exact=true thì bỏ qua Fuzzy Search và không trả kết quả", async () => {
      const res = await request(app).get("/search?keyword=recat&exact=true");
      expect(res.status).toBe(200);
      expect(res.text).not.toContain("Senior ReactJS Developer");
      expect(res.text).toContain("Không tìm thấy việc làm nào phù hợp");
    });

    test("GET /api/search/suggestions trả về 'Có phải bạn muốn tìm...' khi có lỗi chính tả", async () => {
      const res = await request(app).get("/api/search/suggestions?q=pythn");
      expect(res.status).toBe(200);
      expect(res.body.didYouMean).toBeTruthy();
      expect(res.body.didYouMean.suggestion).toBe("python");
    });

    test("GET /api/search/suggestions trả về danh sách tiền tố khớp (autocomplete)", async () => {
      const res = await request(app).get("/api/search/suggestions?q=Rea");
      expect(res.status).toBe(200);
      expect(res.body.suggestions.length).toBeGreaterThan(0);
      const hasReact = res.body.suggestions.some((s) => s.text.toLowerCase().includes("react"));
      expect(hasReact).toBe(true);
    });
  });
});
