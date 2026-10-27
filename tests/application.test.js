const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const fs = require("fs");
const app = require("../src/app");
const { Candidate, Employer, Job, Application } = require("../src/models");
const { EMPLOYER_STATUS, CANDIDATE_STATUS, JOB_MODERATION, APPLICATION_STATUS } = require("../src/config/constants");
const { hashPassword } = require("../src/services/auth.service");
const { getCVPath } = require("../src/services/storage.service");

let mongoServer;

jest.setTimeout(20000);

const validPdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");

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
});

describe("Phase 5: Candidate Profile, Application & Employer CV Management Tests", () => {
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
      fullName: overrides.fullName || "Nguyễn Văn Ứng Viên",
      email: overrides.email || "candidate@test.com",
      password: passwordHash,
      phone: overrides.phone || "0987654321",
      status: CANDIDATE_STATUS.ACTIVE,
      isEmailVerified: overrides.isEmailVerified !== undefined ? overrides.isEmailVerified : true,
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

  async function createAndLoginEmployer(overrides = {}) {
    const passwordHash = await hashPassword("Password123");
    const emp = await Employer.create({
      companyName: overrides.companyName || "Công ty Tuyển Dụng",
      slug: overrides.slug || "cong-ty-tuyen-dung",
      email: overrides.email || "employer@tuyendung.com",
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

  describe("1. Candidate Profile (/candidate/profile)", () => {
    test("GET /candidate/profile hiển thị đúng thông tin ứng viên", async () => {
      const { candidate, cookies } = await createAndLoginCandidate();
      const res = await request(app).get("/candidate/profile").set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain(candidate.fullName);
      expect(res.text).toContain(candidate.email);
    });

    test("POST /candidate/profile cập nhật họ tên và số điện thoại", async () => {
      const { candidate, cookies } = await createAndLoginCandidate();
      const page = await getCsrfAndCookies("/candidate/profile", cookies);

      const updateRes = await request(app)
        .post("/candidate/profile")
        .set("Cookie", page.cookies)
        .field("_csrf", page.csrfToken)
        .field("fullName", "Nguyễn Văn Đã Đổi Tên")
        .field("phone", "0911223344");

      expect(updateRes.status).toBe(302);
      expect(updateRes.headers.location).toBe("/candidate/profile");

      const updated = await Candidate.findById(candidate._id);
      expect(updated.fullName).toBe("Nguyễn Văn Đã Đổi Tên");
      expect(updated.phone).toBe("0911223344");
    });
  });

  describe("2. Job Apply (POST /jobs/:slug/apply)", () => {
    test("Chưa đăng nhập ứng tuyển -> chuyển hướng sang /candidate/login?next=...", async () => {
      const { employer } = await createAndLoginEmployer();
      const job = await Job.create({
        employerId: employer._id,
        title: "NodeJS Developer",
        slug: "nodejs-developer-slug",
        position: "middle",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const res = await request(app)
        .post(`/jobs/${job.slug}/apply`)
        .attach("cv", validPdfBuffer, "cv.pdf");

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("/candidate/login");
    });

    test("Ứng viên nộp CV thành công kèm file PDF chuẩn", async () => {
      const { employer } = await createAndLoginEmployer();
      const job = await Job.create({
        employerId: employer._id,
        title: "Golang Senior",
        slug: "golang-senior-job",
        position: "senior",
        workingForm: "remote",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const { candidate, cookies } = await createAndLoginCandidate();
      const page = await getCsrfAndCookies(`/jobs/${job.slug}`, cookies);

      const applyRes = await request(app)
        .post(`/jobs/${job.slug}/apply`)
        .set("Cookie", page.cookies)
        .field("_csrf", page.csrfToken)
        .field("fullName", candidate.fullName)
        .field("email", candidate.email)
        .field("phone", candidate.phone)
        .attach("cv", validPdfBuffer, "my-cv.pdf");

      expect(applyRes.status).toBe(302);
      expect(applyRes.headers.location).toBe(`/jobs/${job.slug}`);

      const application = await Application.findOne({ jobId: job._id, candidateId: candidate._id });
      expect(application).toBeTruthy();
      expect(application.fullName).toBe(candidate.fullName);
      expect(application.cv.originalName).toBe("my-cv.pdf");
      expect(application.status).toBe("pending");
      expect(application.viewed).toBe(false);

      // File được lưu an toàn trong private storage
      const filePath = getCVPath(application.cv.key);
      expect(filePath).toBeTruthy();
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test("Chặn nộp trùng: cùng một ứng viên nộp 2 lần cho 1 công việc sẽ bị từ chối", async () => {
      const { employer } = await createAndLoginEmployer();
      const job = await Job.create({
        employerId: employer._id,
        title: "ReactJS Dev",
        slug: "reactjs-dev-job",
        position: "fresher",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const { candidate, cookies } = await createAndLoginCandidate();
      const page1 = await getCsrfAndCookies(`/jobs/${job.slug}`, cookies);

      // Lần 1
      await request(app)
        .post(`/jobs/${job.slug}/apply`)
        .set("Cookie", page1.cookies)
        .field("_csrf", page1.csrfToken)
        .field("fullName", candidate.fullName)
        .field("email", candidate.email)
        .field("phone", candidate.phone)
        .attach("cv", validPdfBuffer, "cv.pdf");

      // Lần 2
      const page2 = await getCsrfAndCookies(`/jobs/${job.slug}`, cookies);
      const res2 = await request(app)
        .post(`/jobs/${job.slug}/apply`)
        .set("Cookie", page2.cookies)
        .field("_csrf", page2.csrfToken)
        .field("fullName", candidate.fullName)
        .field("email", candidate.email)
        .field("phone", candidate.phone)
        .attach("cv", validPdfBuffer, "cv.pdf");

      expect(res2.status).toBe(302);
      const appCount = await Application.countDocuments({ jobId: job._id, candidateId: candidate._id });
      expect(appCount).toBe(1);
    });
  });

  describe("3. Quản lý CV đã gửi & Rút hồ sơ (/candidate/applied-jobs)", () => {
    test("GET /candidate/applied-jobs hiển thị danh sách công việc đã ứng tuyển", async () => {
      const { employer } = await createAndLoginEmployer();
      const job = await Job.create({
        employerId: employer._id,
        title: "Frontend Intern",
        slug: "frontend-intern-job",
        position: "intern",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const { candidate, cookies } = await createAndLoginCandidate();

      await Application.create({
        jobId: job._id,
        employerId: employer._id,
        candidateId: candidate._id,
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        cv: { key: "cv-mock.pdf", originalName: "cv.pdf" },
      });

      const res = await request(app).get("/candidate/applied-jobs").set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain("Frontend Intern");
      expect(res.text).toContain(employer.companyName);
    });

    test("Ứng viên rút hồ sơ khi đang pending thành công", async () => {
      const { employer } = await createAndLoginEmployer();
      const job = await Job.create({
        employerId: employer._id,
        title: "Tester QA",
        slug: "tester-qa-job",
        position: "junior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const { candidate, cookies } = await createAndLoginCandidate();
      const appDoc = await Application.create({
        jobId: job._id,
        employerId: employer._id,
        candidateId: candidate._id,
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        cv: { key: "cv-mock.pdf", originalName: "cv.pdf" },
        status: "pending",
      });

      const page = await getCsrfAndCookies("/candidate/applied-jobs", cookies);

      const deleteRes = await request(app)
        .post(`/candidate/applied-jobs/${appDoc._id}/delete`)
        .set("Cookie", page.cookies)
        .type("form")
        .send({ _csrf: page.csrfToken });

      expect(deleteRes.status).toBe(302);
      expect(deleteRes.headers.location).toBe("/candidate/applied-jobs");

      const check = await Application.findById(appDoc._id);
      expect(check.hiddenByCandidate).toBe(true);

      // Danh sách applied-jobs của candidate không còn hiển thị nữa
      const listRes = await request(app).get("/candidate/applied-jobs").set("Cookie", page.cookies);
      expect(listRes.text).not.toContain("Tester QA");
    });
  });

  describe("4. Quản lý CV phía Nhà tuyển dụng (/employer/cvs)", () => {
    test("GET /employer/cvs hiển thị danh sách CV nhận được", async () => {
      const { employer, cookies } = await createAndLoginEmployer();
      const job = await Job.create({
        employerId: employer._id,
        title: "Product Manager",
        slug: "product-manager-job",
        position: "manager",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const { candidate } = await createAndLoginCandidate();

      await Application.create({
        jobId: job._id,
        employerId: employer._id,
        candidateId: candidate._id,
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        cv: { key: "cv-test.pdf", originalName: "cv.pdf" },
      });

      const res = await request(app).get("/employer/cvs").set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain("Product Manager");
      expect(res.text).toContain(candidate.fullName);
    });

    test("GET /employer/cvs/:id xem chi tiết và tự động đánh dấu đã xem (viewed = true)", async () => {
      const { employer, cookies } = await createAndLoginEmployer();
      const job = await Job.create({
        employerId: employer._id,
        title: "Security Engineer",
        slug: "security-engineer-job",
        position: "senior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const { candidate } = await createAndLoginCandidate();

      const appDoc = await Application.create({
        jobId: job._id,
        employerId: employer._id,
        candidateId: candidate._id,
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        cv: { key: "cv-test.pdf", originalName: "cv.pdf" },
        viewed: false,
      });

      const res = await request(app).get(`/employer/cvs/${appDoc._id}`).set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain("Thông tin CV");
      expect(res.text).toContain(candidate.fullName);

      // Verify viewed updated to true
      const updated = await Application.findById(appDoc._id);
      expect(updated.viewed).toBe(true);
    });

    test("POST /employer/cvs/:id/status duyệt hoặc từ chối hồ sơ", async () => {
      const { employer, cookies } = await createAndLoginEmployer();
      const job = await Job.create({
        employerId: employer._id,
        title: "AI Engineer",
        slug: "ai-engineer-job",
        position: "middle",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const { candidate } = await createAndLoginCandidate();

      const appDoc = await Application.create({
        jobId: job._id,
        employerId: employer._id,
        candidateId: candidate._id,
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        cv: { key: "cv-test.pdf", originalName: "cv.pdf" },
        status: APPLICATION_STATUS.PENDING,
      });

      const page = await getCsrfAndCookies("/employer/cvs", cookies);

      const approveRes = await request(app)
        .post(`/employer/cvs/${appDoc._id}/status`)
        .set("Cookie", page.cookies)
        .type("form")
        .send({
          _csrf: page.csrfToken,
          status: APPLICATION_STATUS.APPROVED,
        });

      expect(approveRes.status).toBe(302);

      const check = await Application.findById(appDoc._id);
      expect(check.status).toBe(APPLICATION_STATUS.APPROVED);
      expect(check.reviewedAt).not.toBeNull();
    });

    test("POST /employer/cvs/:id/status từ chối hồ sơ kèm lý do và ứng viên xem được lý do", async () => {
      const { employer, cookies: empCookies } = await createAndLoginEmployer();
      const job = await Job.create({
        employerId: employer._id,
        title: "Golang Backend Developer",
        slug: "golang-backend-dev-job",
        position: "senior",
        workingForm: "office",
        city: "ho-chi-minh",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const { candidate, cookies: candCookies } = await createAndLoginCandidate({
        email: "cand-reject-test@test.com",
        fullName: "Lê Văn Ứng Viên",
      });

      const appDoc = await Application.create({
        jobId: job._id,
        employerId: employer._id,
        candidateId: candidate._id,
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        cv: { key: "cv-golang-test.pdf", originalName: "cv.pdf" },
        status: APPLICATION_STATUS.PENDING,
      });

      const page = await getCsrfAndCookies("/employer/cvs", empCookies);

      // NTD gọi POST từ chối kèm lý do và lời nhắn
      const rejectRes = await request(app)
        .post(`/employer/cvs/${appDoc._id}/status`)
        .set("Cookie", page.cookies)
        .type("form")
        .send({
          _csrf: page.csrfToken,
          status: APPLICATION_STATUS.REJECTED,
          rejectionReason: "Kỹ năng Golang chưa đáp ứng yêu cầu Senior",
          rejectionNote: "Cảm ơn bạn. Dự án yêu cầu tối thiểu 3 năm kinh nghiệm với kiến trúc Microservices và gRPC.",
        });

      expect(rejectRes.status).toBe(302);

      const check = await Application.findById(appDoc._id);
      expect(check.status).toBe(APPLICATION_STATUS.REJECTED);
      expect(check.rejectionReason).toBe("Kỹ năng Golang chưa đáp ứng yêu cầu Senior");
      expect(check.rejectionNote).toContain("Microservices");
      expect(check.rejectedAt).not.toBeNull();

      // Kiểm tra ứng viên truy cập trang CV đã gửi thấy lý do từ chối
      const candPage = await request(app)
        .get("/candidate/applied-jobs")
        .set("Cookie", candCookies);

      expect(candPage.status).toBe(200);
      expect(candPage.text).toContain("Kỹ năng Golang chưa đáp ứng yêu cầu Senior");
      expect(candPage.text).toContain("Microservices");

      // Kiểm tra endpoint AI draft rejection
      const aiDraftRes = await request(app)
        .post(`/employer/cvs/${appDoc._id}/ai-draft-rejection`)
        .set("Cookie", page.cookies)
        .send({
          _csrf: page.csrfToken,
          reasonType: "Chưa đủ kinh nghiệm yêu cầu",
        });

      expect(aiDraftRes.status).toBe(200);
      expect(aiDraftRes.body.success).toBe(true);
      expect(aiDraftRes.body.content).toBeDefined();
    });

    test("POST /employer/cvs/:id/invite gửi thư mời phỏng vấn và cập nhật trạng thái approved", async () => {
      const { employer, cookies } = await createAndLoginEmployer();
      const job = await Job.create({
        employerId: employer._id,
        title: "Frontend Lead",
        slug: "frontend-lead-job",
        position: "senior",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const { candidate } = await createAndLoginCandidate();

      const appDoc = await Application.create({
        jobId: job._id,
        employerId: employer._id,
        candidateId: candidate._id,
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        cv: { key: "cv-test.pdf", originalName: "cv.pdf" },
        status: APPLICATION_STATUS.PENDING,
      });

      const page = await getCsrfAndCookies("/employer/cvs", cookies);

      const inviteRes = await request(app)
        .post(`/employer/cvs/${appDoc._id}/invite`)
        .set("Cookie", page.cookies)
        .type("form")
        .send({
          _csrf: page.csrfToken,
          subject: "Thư mời phỏng vấn Frontend Lead",
          content: "Trân trọng mời bạn tham dự phỏng vấn lúc 9h sáng thứ Hai.",
          interviewDate: "09:00 Thứ Hai",
          location: "Google Meet",
        });

      expect(inviteRes.status).toBe(302);

      const check = await Application.findById(appDoc._id);
      expect(check.status).toBe(APPLICATION_STATUS.APPROVED);
      expect(check.interviewInvitation).toBeDefined();
      expect(check.interviewInvitation.sentAt).not.toBeNull();
      expect(check.interviewInvitation.subject).toBe("Thư mời phỏng vấn Frontend Lead");
      expect(check.interviewInvitation.interviewDate).toBe("09:00 Thứ Hai");
    });

    test("Cách ly bảo mật: Employer B không thể xem hoặc cập nhật CV nộp vào Employer A", async () => {
      const { employer: empA } = await createAndLoginEmployer({ companyName: "Công ty A", email: "a@cv.com", slug: "cong-ty-a" });
      const { cookies: cookiesB } = await createAndLoginEmployer({ companyName: "Công ty B", email: "b@cv.com", slug: "cong-ty-b" });

      const jobA = await Job.create({
        employerId: empA._id,
        title: "Job A",
        slug: "job-a",
        position: "intern",
        workingForm: "office",
        city: "ha-noi",
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      });

      const { candidate } = await createAndLoginCandidate();

      const appA = await Application.create({
        jobId: jobA._id,
        employerId: empA._id,
        candidateId: candidate._id,
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        cv: { key: "cv-a.pdf", originalName: "cv.pdf" },
      });

      // B cố GET chi tiết CV của A
      const getRes = await request(app).get(`/employer/cvs/${appA._id}`).set("Cookie", cookiesB);
      expect(getRes.status).toBe(302);
      expect(getRes.headers.location).toBe("/employer/cvs");

      // B cố POST đổi status CV của A
      const pageB = await getCsrfAndCookies("/employer/cvs", cookiesB);
      const postRes = await request(app)
        .post(`/employer/cvs/${appA._id}/status`)
        .set("Cookie", pageB.cookies)
        .type("form")
        .send({
          _csrf: pageB.csrfToken,
          status: APPLICATION_STATUS.APPROVED,
        });
      expect(postRes.status).toBe(302);

      const unmolested = await Application.findById(appA._id);
      expect(unmolested.status).toBe(APPLICATION_STATUS.PENDING);
    });
  });
});
