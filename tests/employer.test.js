const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../src/app");
const { Candidate, Employer, Job, Skill } = require("../src/models");
const { EMPLOYER_STATUS, CANDIDATE_STATUS, JOB_MODERATION } = require("../src/config/constants");
const { hashPassword } = require("../src/services/auth.service");

let mongoServer;

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
  await Skill.deleteMany({});
});

describe("Phase 4: Employer Portal Integration Tests", () => {
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
      companyName: overrides.companyName || "Công ty ABC",
      slug: overrides.slug || "cong-ty-abc",
      email: overrides.email || "employer@abc.com",
      password: passwordHash,
      city: overrides.city || "ha-noi",
      address: overrides.address || "Tòa nhà Keangnam, Hà Nội",
      status: overrides.status || EMPLOYER_STATUS.ACTIVE,
      isEmailVerified: overrides.isEmailVerified !== undefined ? overrides.isEmailVerified : true,
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

  describe("Access Control & Role Isolation", () => {
    test("Chưa đăng nhập truy cập /employer/jobs -> redirect về /employer/login", async () => {
      const res = await request(app).get("/employer/jobs");
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("/employer/login");
    });

    test("Chưa đăng nhập truy cập /employer/company-profile -> redirect về /employer/login", async () => {
      const res = await request(app).get("/employer/company-profile");
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("/employer/login");
    });

    test("Ứng viên đăng nhập cố truy cập /employer/jobs -> bị chặn", async () => {
      const passwordHash = await hashPassword("Password123");
      const cand = await Candidate.create({
        fullName: "Nguyễn Văn Ứng Viên",
        email: "cand@test.com",
        password: passwordHash,
        status: CANDIDATE_STATUS.ACTIVE,
        isEmailVerified: true,
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

      const candCookies = mergeCookies(init.cookies, loginRes.headers["set-cookie"] || []);
      const res = await request(app).get("/employer/jobs").set("Cookie", candCookies);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("/employer/login");
    });
  });

  describe("Hồ sơ công ty (company-profile)", () => {
    test("GET /employer/company-profile hiển thị form thông tin công ty", async () => {
      const { employer, cookies } = await createAndLoginEmployer();
      const res = await request(app).get("/employer/company-profile").set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain(employer.companyName);
      expect(res.text).toContain(employer.email);
    });

    test("POST /employer/company-profile cập nhật thông tin và đồng bộ city/address cho Job", async () => {
      const { employer, cookies } = await createAndLoginEmployer();

      // Tạo một job của employer này ở Hà Nội
      const job = await Job.create({
        employerId: employer._id,
        title: "NodeJS Developer",
        slug: "nodejs-developer-abc",
        salaryMin: 1000,
        salaryMax: 2000,
        position: "middle",
        workingForm: "office",
        city: employer.city,
        address: employer.address,
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const page = await getCsrfAndCookies("/employer/company-profile", cookies);

      const updateRes = await request(app)
        .post("/employer/company-profile")
        .set("Cookie", page.cookies)
        .field("_csrf", page.csrfToken)
        .field("companyName", "Công ty ABC Đổi Tên")
        .field("city", "ho-chi-minh")
        .field("address", "Quận 1, TP. Hồ Chí Minh")
        .field("companyModel", "Product")
        .field("companySize", "50-100")
        .field("phone", "0901234567")
        .field("description", "<p>Mô tả công ty mới</p>");

      expect(updateRes.status).toBe(302);
      expect(updateRes.headers.location).toBe("/employer/company-profile");

      // Kiểm tra DB employer đã được cập nhật
      const updatedEmp = await Employer.findById(employer._id);
      expect(updatedEmp.companyName).toBe("Công ty ABC Đổi Tên");
      expect(updatedEmp.city).toBe("ho-chi-minh");
      expect(updatedEmp.address).toBe("Quận 1, TP. Hồ Chí Minh");

      // Kiểm tra job đã được đồng bộ city và address tự động
      const updatedJob = await Job.findById(job._id);
      expect(updatedJob.city).toBe("ho-chi-minh");
      expect(updatedJob.address).toBe("Quận 1, TP. Hồ Chí Minh");
    });
  });

  describe("Quản lý việc làm & Thêm mới (manage-jobs & create-jobs)", () => {
    test("GET /employer/jobs hiển thị danh sách tin tuyển dụng", async () => {
      const { employer, cookies } = await createAndLoginEmployer();

      await Job.create({
        employerId: employer._id,
        title: "Frontend VueJS Dev",
        slug: "frontend-vuejs-dev",
        salaryMin: 1200,
        salaryMax: 1800,
        position: "junior",
        workingForm: "office",
        city: employer.city,
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const res = await request(app).get("/employer/jobs").set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain("Frontend VueJS Dev");
    });

    test("GET /employer/jobs/create hiển thị form tạo mới", async () => {
      const { cookies } = await createAndLoginEmployer();
      const res = await request(app).get("/employer/jobs/create").set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain("Thêm mới công việc");
    });

    test("POST /employer/jobs/create tạo mới job và upsert skills thành công", async () => {
      const { employer, cookies } = await createAndLoginEmployer();
      const page = await getCsrfAndCookies("/employer/jobs/create", cookies);

      const createRes = await request(app)
        .post("/employer/jobs/create")
        .set("Cookie", page.cookies)
        .field("_csrf", page.csrfToken)
        .field("title", "Fullstack Node & React Developer")
        .field("salaryMin", "1500")
        .field("salaryMax", "3000")
        .field("position", "senior")
        .field("workingForm", "remote")
        .field("skills", "NodeJS, ReactJS, TypeScript")
        .field("description", "<h3>Tuyển dụng Senior</h3>");

      expect(createRes.status).toBe(302);
      expect(createRes.headers.location).toBe("/employer/jobs");

      const createdJob = await Job.findOne({ employerId: employer._id, title: "Fullstack Node & React Developer" });
      expect(createdJob).toBeTruthy();
      expect(createdJob.salaryMin).toBe(1500);
      expect(createdJob.salaryMax).toBe(3000);
      expect(createdJob.position).toBe("senior");
      expect(createdJob.workingForm).toBe("remote");
      expect(createdJob.skills.length).toBe(3);
      expect(createdJob.city).toBe(employer.city);

      // Verify skills upserted
      const skillCount = await Skill.countDocuments({ slug: { $in: ["nodejs", "reactjs", "typescript"] } });
      expect(skillCount).toBe(3);
    });

    test("POST /employer/jobs/create báo lỗi 400 nếu thiếu tiêu đề", async () => {
      const { cookies } = await createAndLoginEmployer();
      const page = await getCsrfAndCookies("/employer/jobs/create", cookies);

      const res = await request(app)
        .post("/employer/jobs/create")
        .set("Cookie", page.cookies)
        .field("_csrf", page.csrfToken)
        .field("title", "")
        .field("position", "middle")
        .field("workingForm", "office");

      expect(res.status).toBe(400);
      expect(res.text).toContain("Tên công việc không được để trống");
    });
  });

  describe("Chỉnh sửa & Xóa công việc (edit & delete jobs)", () => {
    test("GET /employer/jobs/:id/edit hiển thị form chỉnh sửa kèm dữ liệu cũ", async () => {
      const { employer, cookies } = await createAndLoginEmployer();
      const job = await Job.create({
        employerId: employer._id,
        title: "DevOps Engineer",
        slug: "devops-engineer",
        salaryMin: 2000,
        salaryMax: 3500,
        position: "senior",
        workingForm: "flexible",
        city: employer.city,
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const res = await request(app).get(`/employer/jobs/${job._id}/edit`).set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain("DevOps Engineer");
      expect(res.text).toContain("2000");
    });

    test("POST /employer/jobs/:id/edit cập nhật công việc thành công", async () => {
      const { employer, cookies } = await createAndLoginEmployer();
      const job = await Job.create({
        employerId: employer._id,
        title: "Golang Dev",
        slug: "golang-dev",
        salaryMin: 1000,
        salaryMax: 1500,
        position: "junior",
        workingForm: "office",
        city: employer.city,
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const page = await getCsrfAndCookies(`/employer/jobs/${job._id}/edit`, cookies);

      const editRes = await request(app)
        .post(`/employer/jobs/${job._id}/edit`)
        .set("Cookie", page.cookies)
        .field("_csrf", page.csrfToken)
        .field("title", "Senior Golang Engineer")
        .field("salaryMin", "2500")
        .field("salaryMax", "4000")
        .field("position", "senior")
        .field("workingForm", "remote")
        .field("skills", "Go, Docker, Kubernetes")
        .field("description", "Lead the backend team");

      expect(editRes.status).toBe(302);
      expect(editRes.headers.location).toBe("/employer/jobs");

      const updated = await Job.findById(job._id);
      expect(updated.title).toBe("Senior Golang Engineer");
      expect(updated.salaryMin).toBe(2500);
      expect(updated.position).toBe("senior");
      expect(updated.skills.length).toBe(3);
    });

    test("POST /employer/jobs/:id/delete xóa mềm công việc (deletedAt khác null)", async () => {
      const { employer, cookies } = await createAndLoginEmployer();
      const job = await Job.create({
        employerId: employer._id,
        title: "Job Sắp Bị Xóa",
        slug: "job-sap-bi-xoa",
        position: "intern",
        workingForm: "office",
        city: employer.city,
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const page = await getCsrfAndCookies("/employer/jobs", cookies);

      const deleteRes = await request(app)
        .post(`/employer/jobs/${job._id}/delete`)
        .set("Cookie", page.cookies)
        .type("form")
        .send({ _csrf: page.csrfToken });

      expect(deleteRes.status).toBe(302);
      expect(deleteRes.headers.location).toBe("/employer/jobs");

      const deletedJob = await Job.findById(job._id);
      expect(deletedJob.deletedAt).not.toBeNull();

      // Kiểm tra danh sách /employer/jobs không còn job này
      const listRes = await request(app).get("/employer/jobs").set("Cookie", page.cookies);
      expect(listRes.text).not.toContain("Job Sắp Bị Xóa");
    });

    test("Bảo mật đa khách thuê: Employer B không thể sửa hoặc xóa job của Employer A", async () => {
      const { employer: empA } = await createAndLoginEmployer({
        companyName: "Công ty A",
        email: "a@test.com",
        slug: "cong-ty-a",
      });
      const { cookies: cookiesB } = await createAndLoginEmployer({
        companyName: "Công ty B",
        email: "b@test.com",
        slug: "cong-ty-b",
      });

      const jobA = await Job.create({
        employerId: empA._id,
        title: "Bí mật Công ty A",
        slug: "bi-mat-cong-ty-a",
        position: "middle",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      // B cố GET form edit của A
      const getEditRes = await request(app)
        .get(`/employer/jobs/${jobA._id}/edit`)
        .set("Cookie", cookiesB);
      expect(getEditRes.status).toBe(302);
      expect(getEditRes.headers.location).toBe("/employer/jobs");

      // B cố POST delete job của A
      const pageB = await getCsrfAndCookies("/employer/jobs", cookiesB);
      const postDeleteRes = await request(app)
        .post(`/employer/jobs/${jobA._id}/delete`)
        .set("Cookie", pageB.cookies)
        .type("form")
        .send({ _csrf: pageB.csrfToken });
      expect(postDeleteRes.status).toBe(302);
      expect(postDeleteRes.headers.location).toBe("/employer/jobs");

      // Job A vẫn tồn tại bình thường
      const checkJobA = await Job.findById(jobA._id);
      expect(checkJobA.deletedAt).toBeNull();
    });
  });

  describe("Ràng buộc trạng thái Pending của Nhà tuyển dụng", () => {
    test("Tài khoản Pending không thể vào trang tạo job", async () => {
      const { cookies } = await createAndLoginEmployer({
        companyName: "Công ty Mới Đăng Ký",
        email: "pending@test.com",
        slug: "cong-ty-moi-dang-ky",
        status: EMPLOYER_STATUS.PENDING,
      });

      const res = await request(app).get("/employer/jobs/create").set("Cookie", cookies);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/employer/jobs");
    });
  });
});
