// tests/qa_slice3_candidate_pdf.test.js
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const pdfParse = require("pdf-parse");

const app = require("../src/app");
const { Candidate, Employer, Job, Application, JobAlert, SavedJob, Otp, StoredFile } = require("../src/models");
const {
  CANDIDATE_STATUS,
  EMPLOYER_STATUS,
  JOB_MODERATION,
  APPLICATION_STATUS,
} = require("../src/config/constants");
const { hashPassword, comparePassword } = require("../src/services/auth.service");
const { generateItProfilePdf, toAscii } = require("../src/services/pdfGenerator.service");
const { notifyMatchingSubscribers, isAlertEligibleByFrequency } = require("../src/services/jobAlert.service");
const mailService = require("../src/services/mail.service");
const googleAuthService = require("../src/services/googleAuth.service");
const { saveCvBuffer, getCVPath } = require("../src/services/storage.service");

let mongoServer;
jest.setTimeout(30000);

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
  await Promise.all([
    Candidate.deleteMany({}),
    Employer.deleteMany({}),
    Job.deleteMany({}),
    Application.deleteMany({}),
    JobAlert.deleteMany({}),
    SavedJob.deleteMany({}),
    Otp.deleteMany({}),
    StoredFile.deleteMany({}),
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
  const csrfMatch = res.text.match(/name="_csrf"\s+value="([^"]+)"/);
  const metaMatch = res.text.match(/name="csrf-token"\s+content="([^"]+)"/);
  const csrfToken = (csrfMatch && csrfMatch[1]) || (metaMatch && metaMatch[1]) || "";
  return { cookies: merged, csrfToken, res };
}

async function createAndLoginCandidate(overrides = {}) {
  const rawPassword = overrides.rawPassword || "Password123";
  const passwordHash = await hashPassword(rawPassword);
  const cand = await Candidate.create({
    fullName: overrides.fullName || "Nguyễn Gia Kiệt",
    email: overrides.email || `cand.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@test.com`,
    password: passwordHash,
    phone: overrides.phone || "0987654321",
    authProvider: overrides.authProvider || "local",
    googleId: overrides.googleId || null,
    status: CANDIDATE_STATUS.ACTIVE,
    isEmailVerified: overrides.isEmailVerified !== undefined ? overrides.isEmailVerified : true,
    itProfile: overrides.itProfile || {},
  });

  const init = await getCsrfAndCookies("/candidate/login");
  const loginRes = await request(app)
    .post("/candidate/login")
    .set("Cookie", init.cookies)
    .type("form")
    .send({
      email: cand.email,
      password: rawPassword,
      _csrf: init.csrfToken,
    });

  const cookies = mergeCookies(init.cookies, loginRes.headers["set-cookie"] || []);
  return { candidate: cand, cookies };
}

async function createEmployerAndJob(overrides = {}) {
  const passwordHash = await hashPassword("Password123");
  const slugSuffix = Math.random().toString(36).slice(2, 7);
  const emp = await Employer.create({
    companyName: overrides.companyName || "Công ty Công nghệ Việt",
    slug: overrides.empSlug || `cong-ty-viet-${slugSuffix}`,
    email: overrides.empEmail || `hr.${slugSuffix}@company.vn`,
    password: passwordHash,
    city: "ho-chi-minh",
    status: EMPLOYER_STATUS.ACTIVE,
    isEmailVerified: true,
  });

  const job = await Job.create({
    employerId: emp._id,
    title: overrides.jobTitle || "Senior NodeJS Developer",
    slug: overrides.jobSlug || `senior-nodejs-${slugSuffix}`,
    position: "senior",
    workingForm: "flexible",
    city: "ho-chi-minh",
    salaryMin: 1500,
    salaryMax: 3000,
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
  });

  return { employer: emp, job };
}

describe("Slice 3 QA Remediation: Candidate Flows, Unicode PDF, Withdraw, Auth & Job Alerts", () => {
  describe("1. QA-B12: TrueType Vietnamese Unicode PDF, PreferredCity, Certificates & Preview Route", () => {
    test("Font Roboto-Regular.ttf & Roboto-Bold.ttf tồn tại và có header TTF hợp lệ", () => {
      const regPath = path.join(__dirname, "../src/assets/fonts/Roboto-Regular.ttf");
      const boldPath = path.join(__dirname, "../src/assets/fonts/Roboto-Bold.ttf");
      expect(fs.existsSync(regPath)).toBe(true);
      expect(fs.existsSync(boldPath)).toBe(true);

      const regBuf = fs.readFileSync(regPath);
      const boldBuf = fs.readFileSync(boldPath);
      expect(regBuf.length).toBeGreaterThan(100000);
      expect(boldBuf.length).toBeGreaterThan(100000);
      expect(regBuf.slice(0, 4).toString("hex")).toBe("00010000");
      expect(boldBuf.slice(0, 4).toString("hex")).toBe("00010000");
      expect(toAscii("Nguyễn Gia Kiệt - Đà Nẵng")).toBe("Nguyen Gia Kiet - Da Nang");
    });

    test("generateItProfilePdf xuất đúng dấu tiếng Việt không Mojibake và không bị lột dấu", async () => {
      const mockCandidate = {
        fullName: "Nguyễn Gia Kiệt",
        email: "kiet.nguyen@vnitjobs.vn",
        phone: "0912345678",
        itProfile: {
          title: "Kỹ sư Phần mềm Cao cấp",
          level: "senior",
          yearsOfExperience: 5,
          preferredCity: "ho-chi-minh",
          bio: "Chuyên gia xây dựng hệ thống phân tán độ sẵn sàng cao tại TP. Hồ Chí Minh.",
          skills: ["Node.js", "C++", "Kỹ thuật dữ liệu", "PostgreSQL"],
          workExperience: [
            {
              company: "Công ty Cổ phần Công nghệ Việt",
              position: "Trưởng nhóm Phát triển",
              startDate: "Tháng 03/2022",
              endDate: "",
              isCurrent: true,
              description: "Thiết kế kiến trúc microservice và tối ưu hiệu năng truy vấn.",
            },
          ],
          projects: [
            {
              name: "Cổng Việc Làm Công Nghệ",
              role: "Kiến trúc sư hệ thống",
              techStack: "Node.js, MongoDB, Docker",
              description: "Phục vụ hàng chục nghìn ứng viên lập trình viên Việt Nam.",
            },
          ],
          education: [
            {
              school: "Đại học Bách Khoa TP.HCM",
              major: "Khoa học Máy tính",
              gradYear: "2020",
            },
          ],
          certificates: [
            {
              name: "Chứng chỉ AWS Solutions Architect",
              organization: "Amazon Web Services",
              year: "2024",
            },
          ],
        },
      };

      const pdfBuffer = await generateItProfilePdf(mockCandidate, "Kỹ sư Backend");
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.toString("latin1", 0, 5)).toBe("%PDF-");

      const parsed = await pdfParse(pdfBuffer);
      expect(parsed.text).toContain("NGUYỄN GIA KIỆT");
      expect(parsed.text).toContain("Kỹ sư Phần mềm Cao cấp");
      expect(parsed.text).toContain("TP. Hồ Chí Minh");
      expect(parsed.text).toContain("Kỹ thuật dữ liệu");
      expect(parsed.text).toContain("Trưởng nhóm Phát triển");
      expect(parsed.text).toContain("Hiện tại");
      expect(parsed.text).toContain("Cổng Việc Làm Công Nghệ");
      expect(parsed.text).toContain("Đại học Bách Khoa TP.HCM");
      expect(parsed.text).toContain("Chứng chỉ AWS Solutions Architect");
      expect(parsed.text).toContain("Amazon Web Services");
    });

    test("IT Profile lưu preferredCity + certificates, giữ nguyên preferredCity khi bỏ trống, và stream GET /candidate/it-profile/pdf", async () => {
      const { candidate, cookies } = await createAndLoginCandidate({
        fullName: "Trần Thị Minh Thư",
      });

      const page1 = await getCsrfAndCookies("/candidate/it-profile", cookies);
      expect(page1.res.status).toBe(200);
      expect(page1.res.text).toContain('name="preferredCity"');
      expect(page1.res.text).toContain('id="certificatesList"');
      expect(page1.res.text).toContain('id="btnAddCert"');
      expect(page1.res.text).toContain("/candidate/it-profile/pdf");
      expect(page1.res.text).toContain("USD / tháng — $");
      expect(page1.res.text).toContain('id="openToWorkLabel"');

      // Lưu preferredCity = ho-chi-minh và certificates
      const certsPayload = JSON.stringify([
        { name: "Kubernetes CKA", organization: "CNCF", year: "2025" },
      ]);
      const save1 = await request(app)
        .post("/candidate/it-profile")
        .set("Cookie", page1.cookies)
        .type("form")
        .send({
          _csrf: page1.csrfToken,
          title: "Kỹ sư DevOps",
          level: "senior",
          yearsOfExperience: 4,
          expectedSalary: 2200,
          preferredCity: "ho-chi-minh",
          skills: "Docker, Kubernetes, Terraform",
          certificates: certsPayload,
          openToWork: "true",
        });

      expect(save1.status).toBe(302);
      let updated = await Candidate.findById(candidate._id).lean();
      expect(updated.itProfile.preferredCity).toBe("ho-chi-minh");
      expect(updated.itProfile.certificates).toHaveLength(1);
      expect(updated.itProfile.certificates[0].name).toBe("Kubernetes CKA");

      // Submit lần 2 KHÔNG truyền preferredCity -> phải giữ nguyên "ho-chi-minh", không bị ép về "ha-noi"
      const page2 = await getCsrfAndCookies("/candidate/it-profile", cookies);
      const save2 = await request(app)
        .post("/candidate/it-profile")
        .set("Cookie", page2.cookies)
        .type("form")
        .send({
          _csrf: page2.csrfToken,
          title: "Kỹ sư DevOps Senior",
          level: "senior",
          yearsOfExperience: 5,
          skills: "Docker, Kubernetes",
          certificates: certsPayload,
        });
      expect(save2.status).toBe(302);
      updated = await Candidate.findById(candidate._id).lean();
      expect(updated.itProfile.preferredCity).toBe("ho-chi-minh");
      expect(updated.itProfile.openToWork).toBe(false);

      // Xem trước PDF qua GET /candidate/it-profile/pdf
      const pdfRes = await request(app)
        .get("/candidate/it-profile/pdf")
        .set("Cookie", cookies)
        .buffer(true)
        .parse((res, cb) => {
          const data = [];
          res.on("data", (chunk) => data.push(chunk));
          res.on("end", () => cb(null, Buffer.concat(data)));
        });

      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers["content-type"]).toContain("application/pdf");
      expect(pdfRes.headers["x-frame-options"]).toBe("SAMEORIGIN");
      expect(pdfRes.headers["content-security-policy"]).toContain("frame-ancestors 'self'");
      const parsed = await pdfParse(pdfRes.body);
      expect(parsed.text).toContain("TRẦN THỊ MINH THƯ");
      expect(parsed.text).toContain("Kubernetes CKA");
      expect(parsed.text).toContain("TP. Hồ Chí Minh");
    });
  });

  describe("2. QA-B08: Real Withdraw (xóa thật để nộp lại) & Safe CV Preview (ensureCVBuffer)", () => {
    test("Rút hồ sơ pending sẽ xóa bản ghi + CV và cho phép ứng viên nộp lại CV mới", async () => {
      const { candidate, cookies } = await createAndLoginCandidate();
      const { employer, job } = await createEmployerAndJob();

      // Nộp CV lần 1
      const pageApply1 = await getCsrfAndCookies(`/jobs/${job.slug}`, cookies);
      const apply1 = await request(app)
        .post(`/jobs/${job.slug}/apply`)
        .set("Cookie", pageApply1.cookies)
        .field("_csrf", pageApply1.csrfToken)
        .field("fullName", candidate.fullName)
        .field("email", candidate.email)
        .field("phone", candidate.phone)
        .attach("cv", validPdfBuffer, "cv-v1.pdf");

      expect(apply1.status).toBe(302);
      const app1 = await Application.findOne({ jobId: job._id, candidateId: candidate._id });
      expect(app1).not.toBeNull();
      const oldCvKey = app1.cv.key;

      // Rút hồ sơ đang pending
      const appliedPage = await getCsrfAndCookies("/candidate/applied-jobs", cookies);
      const withdrawRes = await request(app)
        .post(`/candidate/applied-jobs/${app1._id}/delete`)
        .set("Cookie", appliedPage.cookies)
        .type("form")
        .send({ _csrf: appliedPage.csrfToken });

      expect(withdrawRes.status).toBe(302);
      expect(withdrawRes.headers.location).toBe("/candidate/applied-jobs");

      // Bản ghi Application đã bị xóa hẳn khỏi DB (Employer cũng không còn thấy!)
      const deletedCheck = await Application.findById(app1._id);
      expect(deletedCheck).toBeNull();
      expect(getCVPath(oldCvKey)).toBeNull();

      // Nộp lại CV lần 2 cho cùng job thành công (không bị chặn duplicate!)
      const pageApply2 = await getCsrfAndCookies(`/jobs/${job.slug}`, cookies);
      const apply2 = await request(app)
        .post(`/jobs/${job.slug}/apply`)
        .set("Cookie", pageApply2.cookies)
        .field("_csrf", pageApply2.csrfToken)
        .field("fullName", candidate.fullName)
        .field("email", candidate.email)
        .field("phone", candidate.phone)
        .attach("cv", validPdfBuffer, "cv-v2-fixed.pdf");

      expect(apply2.status).toBe(302);
      const app2 = await Application.findOne({ jobId: job._id, candidateId: candidate._id, employerId: employer._id });
      expect(app2).not.toBeNull();
      expect(app2.cv.originalName).toBe("cv-v2-fixed.pdf");
    });

    test("GET /candidate/applied-jobs/:id/pdf khôi phục được PDF từ MongoDB StoredFile sau cold start và đặt header SAMEORIGIN", async () => {
      const { candidate, cookies } = await createAndLoginCandidate();
      const { employer, job } = await createEmployerAndJob();

      const saved = await saveCvBuffer(validPdfBuffer, "CV_ColdStart.pdf");
      // Xóa file trên đĩa để mô phỏng cold start /tmp bị xóa
      const diskPath = getCVPath(saved.key);
      if (diskPath && fs.existsSync(diskPath)) {
        fs.unlinkSync(diskPath);
      }

      const appDoc = await Application.create({
        jobId: job._id,
        employerId: employer._id,
        candidateId: candidate._id,
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        cv: saved,
      });

      const res = await request(app)
        .get(`/candidate/applied-jobs/${appDoc._id}/pdf`)
        .set("Cookie", cookies);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
      expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'self'");
    });
  });

  describe("3. QA-B07, QA-M10, QA-m04 & QA-P05: 6 Status Badges, .ics Download, Plain-Text Notes & Decline Interview", () => {
    test("Hiển thị đủ 6 trạng thái ATS, lọc sạch thẻ HTML thô, tải lịch .ics và từ chối phỏng vấn (declined)", async () => {
      const { candidate, cookies } = await createAndLoginCandidate();
      const statuses = [
        APPLICATION_STATUS.PENDING,
        APPLICATION_STATUS.APPROVED,
        APPLICATION_STATUS.INTERVIEWING,
        APPLICATION_STATUS.OFFERED,
        APPLICATION_STATUS.HIRED,
        APPLICATION_STATUS.REJECTED,
      ];

      let interviewingApp = null;
      for (const st of statuses) {
        const { employer, job } = await createEmployerAndJob({ jobTitle: `Job ${st}` });
        const doc = await Application.create({
          jobId: job._id,
          employerId: employer._id,
          candidateId: candidate._id,
          fullName: candidate.fullName,
          email: candidate.email,
          phone: candidate.phone,
          cv: { key: "cv-mock.pdf", originalName: "cv.pdf" },
          status: st,
          rejectionReason: st === APPLICATION_STATUS.REJECTED ? "<p>Chưa đủ kinh nghiệm &amp; kỹ năng</p>" : "",
          rejectionNote: st === APPLICATION_STATUS.REJECTED ? "<p>Cảm ơn bạn<br/>Hẹn gặp lại &amp; chúc may mắn</p>" : "",
          interviewSchedule:
            st === APPLICATION_STATUS.INTERVIEWING
              ? {
                  scheduledAt: new Date("2026-12-01T02:30:00.000Z"), // 09:30 +07:00
                  durationMinutes: 60,
                  locationType: "online",
                  meetingLink: "https://meet.google.com/abc-defg-hij",
                  notes: "<p>Chuẩn bị laptop &amp; mic</p>",
                  status: "pending",
                }
              : undefined,
        });
        if (st === APPLICATION_STATUS.INTERVIEWING) interviewingApp = doc;
      }

      const listRes = await request(app).get("/candidate/applied-jobs").set("Cookie", cookies);
      expect(listRes.status).toBe(200);
      expect(listRes.text).toContain("Chờ duyệt");
      expect(listRes.text).toContain("Phù hợp");
      expect(listRes.text).toContain("Phỏng vấn");
      expect(listRes.text).toContain("Đề nghị (Offer)");
      expect(listRes.text).toContain("Đã tuyển");
      expect(listRes.text).toContain("Đã từ chối");
      // Không lộ thẻ <p> hay &amp; thô
      expect(listRes.text).not.toContain("&lt;p&gt;");
      expect(listRes.text).toContain("Chưa đủ kinh nghiệm");
      expect(listRes.text).toContain("Tải lịch (.ics)");
      expect(listRes.text).toContain(`/candidate/applied-jobs/${interviewingApp._id}/ics`);

      // Tải file .ics
      const icsRes = await request(app)
        .get(`/candidate/applied-jobs/${interviewingApp._id}/ics`)
        .set("Cookie", cookies);
      expect(icsRes.status).toBe(200);
      expect(icsRes.headers["content-type"]).toContain("text/calendar");
      expect(icsRes.headers["content-disposition"]).toContain(".ics");
      expect(icsRes.text).toContain("BEGIN:VCALENDAR");
      expect(icsRes.text).toContain("BEGIN:VEVENT");
      expect(icsRes.text).toContain("DTSTART:20261201T023000Z");

      // Ứng viên chọn "Từ chối phỏng vấn" (declined)
      const csrfPage = await getCsrfAndCookies("/candidate/applied-jobs", cookies);
      const declineRes = await request(app)
        .post(`/candidate/applied-jobs/${interviewingApp._id}/respond-interview`)
        .set("Cookie", csrfPage.cookies)
        .type("form")
        .send({
          _csrf: csrfPage.csrfToken,
          responseStatus: "declined",
          note: "Em đã nhận offer khác, cảm ơn công ty!",
        });

      expect(declineRes.status).toBe(302);
      const reloaded = await Application.findById(interviewingApp._id).lean();
      expect(reloaded.interviewSchedule.candidateResponse.status).toBe("declined");
      expect(reloaded.interviewSchedule.status).toBe("cancelled");
    });
  });

  describe("4. QA-M11: Job Alert Weekly Frequency & Salary Formatting", () => {
    test("sendJobAlertEmail hiển thị mức lương USD chuẩn thay vì 0 - 0 Triệu VNĐ", async () => {
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      try {
        await mailService.sendJobAlertEmail({
          toEmail: "dev@test.com",
          alert: { unsubscribeToken: "tok123" },
          job: {
            title: "Senior Backend Engineer",
            slug: "senior-backend",
            salaryMin: 1500,
            salaryMax: 2800,
            city: "ho-chi-minh",
            position: "senior",
          },
          companyName: "VN Tech",
        });

        const joinedLogs = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
        expect(joinedLogs).not.toContain("Triệu VNĐ");
        expect(joinedLogs).toContain("1.500$ - 2.800$");
      } finally {
        logSpy.mockRestore();
      }
    });

    test("JobAlert hỗ trợ tần suất weekly trong service và giao diện /candidate/job-alerts", async () => {
      const { candidate, cookies } = await createAndLoginCandidate();

      const weeklyFresh = await JobAlert.create({
        candidateId: candidate._id,
        email: candidate.email,
        keyword: "Rust",
        city: "ho-chi-minh",
        frequency: "weekly",
        isActive: true,
        lastSentAt: null,
      });

      const weeklyRecent = await JobAlert.create({
        email: "recent.weekly@test.com",
        keyword: "Rust",
        city: "ho-chi-minh",
        frequency: "weekly",
        isActive: true,
        lastSentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 ngày trước (< 7 ngày)
      });

      expect(isAlertEligibleByFrequency(weeklyFresh)).toBe(true);
      expect(isAlertEligibleByFrequency(weeklyRecent)).toBe(false);

      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      try {
        await notifyMatchingSubscribers(
          {
            title: "Senior Rust Systems Engineer",
            slug: "senior-rust",
            city: "ho-chi-minh",
            position: "senior",
            salaryMin: 2000,
            salaryMax: 3500,
            skills: [{ name: "Rust", slug: "rust" }],
          },
          { companyName: "Rust Labs" }
        );
      } finally {
        logSpy.mockRestore();
      }

      const freshAfter = await JobAlert.findById(weeklyFresh._id);
      const recentAfter = await JobAlert.findById(weeklyRecent._id);
      expect(freshAfter.lastSentAt).not.toBeNull();
      expect(recentAfter.lastSentAt.getTime()).toBe(weeklyRecent.lastSentAt.getTime());

      // Trang /candidate/job-alerts hiển thị "Hàng tuần" & nhãn thành phố tiếng Việt
      const res = await request(app).get("/candidate/job-alerts").set("Cookie", cookies);
      expect(res.status).toBe(200);
      expect(res.text).toContain("Hàng tuần");
      expect(res.text).toContain("TP. Hồ Chí Minh");
    });
  });

  describe("5. QA-M06, QA-M07, QA-M08 & QA-M02: Auth ?next=, Unverified Non-Mutation, Google No-Password, Soft-Delete & AJAX", () => {
    test("Giữ nguyên ?next= xuyên suốt luồng Login <-> Signup -> Verify OTP -> đích đến", async () => {
      const loginPage = await request(app).get("/candidate/login?next=%2Fjobs%2Fsenior-nodejs");
      expect(loginPage.status).toBe(200);
      expect(loginPage.text).toContain("/candidate/signup?next=%2Fjobs%2Fsenior-nodejs");

      const signupInit = await getCsrfAndCookies("/candidate/signup?next=%2Fjobs%2Fsenior-nodejs");
      expect(signupInit.res.status).toBe(200);
      expect(signupInit.res.text).toContain('name="next" value="/jobs/senior-nodejs"');
      expect(signupInit.res.text).toContain("/candidate/login?next=%2Fjobs%2Fsenior-nodejs");

      const signupRes = await request(app)
        .post("/candidate/signup")
        .set("Cookie", signupInit.cookies)
        .type("form")
        .send({
          _csrf: signupInit.csrfToken,
          fullName: "Lê Minh Quân",
          email: "quan.next@test.com",
          password: "Password123",
          confirmPassword: "Password123",
          next: "/jobs/senior-nodejs",
        });

      expect(signupRes.status).toBe(302);
      expect(signupRes.headers.location).toContain("/candidate/verify-registration?email=quan.next%40test.com");
      expect(signupRes.headers.location).toContain("next=%2Fjobs%2Fsenior-nodejs");

      const cookiesAfterSignup = mergeCookies(signupInit.cookies, signupRes.headers["set-cookie"] || []);
      const otpDoc = await Otp.findOne({ email: "quan.next@test.com", type: "register" });
      otpDoc.otpHash = await bcrypt.hash("654321", await bcrypt.genSalt(10));
      await otpDoc.save();

      const verifyPage = await getCsrfAndCookies(signupRes.headers.location, cookiesAfterSignup);
      const verifyRes = await request(app)
        .post("/candidate/verify-registration")
        .set("Cookie", verifyPage.cookies)
        .type("form")
        .send({
          _csrf: verifyPage.csrfToken,
          email: "quan.next@test.com",
          otp: "654321",
        });

      expect(verifyRes.status).toBe(302);
      expect(verifyRes.headers.location).toBe("/jobs/senior-nodejs");
    });

    test("Signup lại email chưa xác thực không âm thầm ghi đè mật khẩu/họ tên trước khi xác minh OTP", async () => {
      const originalHash = await hashPassword("OriginalPass1");
      await Candidate.create({
        fullName: "Chủ Sở Hữu Thật",
        email: "unverified.owner@test.com",
        password: originalHash,
        isEmailVerified: false,
        status: CANDIDATE_STATUS.ACTIVE,
      });

      const init = await getCsrfAndCookies("/candidate/signup");
      const res = await request(app)
        .post("/candidate/signup")
        .set("Cookie", init.cookies)
        .type("form")
        .send({
          _csrf: init.csrfToken,
          fullName: "Kẻ Mạo Danh",
          email: "unverified.owner@test.com",
          password: "AttackerPass99",
          confirmPassword: "AttackerPass99",
        });

      expect(res.status).toBe(302);
      const cand = await Candidate.findOne({ email: "unverified.owner@test.com" }).select("+password");
      expect(cand.fullName).toBe("Chủ Sở Hữu Thật");
      expect(await comparePassword("OriginalPass1", cand.password)).toBe(true);
      expect(await comparePassword("AttackerPass99", cand.password)).toBe(false);
    });

    test("Tài khoản xóa mềm bị chặn gọn trên Signup và Google OAuth callback (không văng E11000)", async () => {
      const pw = await hashPassword("Password123");
      await Candidate.create({
        fullName: "Đã Xóa Mềm",
        email: "softdeleted@test.com",
        password: pw,
        isEmailVerified: true,
        status: CANDIDATE_STATUS.ACTIVE,
        deletedAt: new Date(),
      });

      // 1. Signup bằng email xóa mềm -> 400 rõ ràng
      const init = await getCsrfAndCookies("/candidate/signup");
      const signupRes = await request(app)
        .post("/candidate/signup")
        .set("Cookie", init.cookies)
        .type("form")
        .send({
          _csrf: init.csrfToken,
          fullName: "Người Mới",
          email: "softdeleted@test.com",
          password: "Password123",
          confirmPassword: "Password123",
        });
      expect(signupRes.status).toBe(400);
      expect(signupRes.text).toContain("đã bị xóa hoặc vô hiệu hóa");

      // 2. Google OAuth Callback bằng email xóa mềm -> redirect /candidate/login không văng E11000
      const origVerify = googleAuthService.verifyOAuthState;
      const origExchange = googleAuthService.exchangeCodeForTokens;
      const origFetch = googleAuthService.fetchGoogleUserInfo;
      googleAuthService.verifyOAuthState = () => ({ valid: true, next: "/" });
      googleAuthService.exchangeCodeForTokens = async () => ({ access_token: "mock-token" });
      googleAuthService.fetchGoogleUserInfo = async () => ({
        sub: "google-sub-softdel",
        email: "softdeleted@test.com",
        email_verified: true,
        name: "Soft Deleted User",
      });

      try {
        const cbRes = await request(app).get("/candidate/auth/google/callback?code=abc&state=xyz");
        expect(cbRes.status).toBe(302);
        expect(cbRes.headers.location).toBe("/candidate/login");
        const count = await Candidate.countDocuments({ email: "softdeleted@test.com" });
        expect(count).toBe(1);
      } finally {
        googleAuthService.verifyOAuthState = origVerify;
        googleAuthService.exchangeCodeForTokens = origExchange;
        googleAuthService.fetchGoogleUserInfo = origFetch;
      }
    });

    test("Tài khoản Google chưa có mật khẩu có thể thiết lập mật khẩu mà không cần currentPassword", async () => {
      const { candidate, cookies } = await createAndLoginCandidate({
        email: "google.nopass@test.com",
        authProvider: "google",
        googleId: "google-uid-9999",
      });

      const cpPage = await getCsrfAndCookies("/candidate/change-password", cookies);
      expect(cpPage.res.status).toBe(200);
      expect(cpPage.res.text).toContain("Thiết lập mật khẩu");
      expect(cpPage.res.text).not.toContain('name="currentPassword"');

      const postRes = await request(app)
        .post("/candidate/change-password")
        .set("Cookie", cpPage.cookies)
        .type("form")
        .send({
          _csrf: cpPage.csrfToken,
          newPassword: "MyNewPass2026",
          confirmPassword: "MyNewPass2026",
        });

      expect(postRes.status).toBe(302);
      expect(postRes.headers.location).toBe("/candidate/profile");

      const updated = await Candidate.findById(candidate._id).select("+password");
      expect(updated.authProvider).toBe("local");
      expect(updated.googleId).toBe("google-uid-9999");
      expect(await comparePassword("MyNewPass2026", updated.password)).toBe(true);

      // Token mới vẫn truy cập /candidate/profile thành công
      const newCookies = mergeCookies(cpPage.cookies, postRes.headers["set-cookie"] || []);
      const profileRes = await request(app).get("/candidate/profile").set("Cookie", newCookies);
      expect(profileRes.status).toBe(200);
    });

    test("POST /candidate/logout khi đã hết phiên không bị 403 CSRF mà redirect sạch về /candidate/login", async () => {
      const res = await request(app).post("/candidate/logout");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/candidate/login");
    });

    test("POST /candidate/saved-jobs/:id/remove hỗ trợ JSON AJAX và views có Accept/X-Requested-With headers", async () => {
      const { candidate, cookies } = await createAndLoginCandidate();
      const { job } = await createEmployerAndJob();
      const savedDoc = await SavedJob.create({ candidateId: candidate._id, jobId: job._id });

      const savedPage = await getCsrfAndCookies("/candidate/saved-jobs", cookies);
      expect(savedPage.res.status).toBe(200);
      expect(savedPage.res.text).toContain("'Accept': 'application/json'");
      expect(savedPage.res.text).toContain("'X-Requested-With': 'XMLHttpRequest'");

      const followPage = await request(app).get("/candidate/followed-companies").set("Cookie", cookies);
      expect(followPage.status).toBe(200);
      expect(followPage.text).toContain("'Accept': 'application/json'");
      expect(followPage.text).toContain("'X-Requested-With': 'XMLHttpRequest'");

      const delRes = await request(app)
        .post(`/candidate/saved-jobs/${savedDoc._id}/remove`)
        .set("Cookie", savedPage.cookies)
        .set("Accept", "application/json")
        .set("X-Requested-With", "XMLHttpRequest")
        .set("x-csrf-token", savedPage.csrfToken);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
      expect(await SavedJob.findById(savedDoc._id)).toBeNull();
    });
  });
});
