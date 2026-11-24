// tests/qa_slice4_employer_ats.test.js
// Slice 4 — Employer ATS, CV Viewer/Rating, Talent Pool privacy, HR Team RBAC, Analytics, AI gating
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../src/app");
const { Candidate, Employer, Job, Application, Notification, CompanyFollow } = require("../src/models");
const { EMPLOYER_STATUS, CANDIDATE_STATUS, JOB_MODERATION, APPLICATION_STATUS } = require("../src/config/constants");
const { hashPassword, signUserToken, comparePassword } = require("../src/services/auth.service");
const { saveCvBuffer } = require("../src/services/storage.service");
const googleAuthService = require("../src/services/googleAuth.service");
const {
  isHiddenFromEmployer,
  parseSkillTerms,
} = require("../src/controllers/employer/employerTalent.controller");
const { parseVietnamDateTime, toVietnamParts } = require("../src/controllers/employer/employerCv.controller");
const { computeConversionRate } = require("../src/controllers/employer/employerOps.controller");
const { parseSalaryInput, htmlToPlainText, plainTextToHtml } = require("../src/controllers/employer/employerJob.controller");

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
  await Promise.all([
    Candidate.deleteMany({}),
    Employer.deleteMany({}),
    Job.deleteMany({}),
    Application.deleteMany({}),
    Notification.deleteMany({}),
    CompanyFollow.deleteMany({}),
  ]);
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let seq = 0;
const uniq = (p) => `${p}-${Date.now()}-${++seq}`;

function mergeCookies(oldCookies = [], newCookies = []) {
  const map = new Map();
  [...oldCookies, ...newCookies].forEach((c) => map.set(c.split("=")[0].trim(), c.split(";")[0]));
  return Array.from(map.values());
}

async function getCsrf(url, cookies) {
  const res = await request(app).get(url).set("Cookie", cookies);
  const merged = mergeCookies(cookies, res.headers["set-cookie"] || []);
  const m = res.text.match(/name="_csrf"\s+value="([^"]+)"/) || res.text.match(/name="csrf-token"\s+content="([^"]+)"/);
  return { cookies: merged, csrfToken: m ? m[1] : "", res };
}

async function createEmployer(overrides = {}) {
  return Employer.create({
    companyName: overrides.companyName || "Công ty ABC",
    slug: uniq("cong-ty"),
    email: overrides.email || `${uniq("owner")}@abc.vn`,
    password: await hashPassword("Password123"),
    status: overrides.status || EMPLOYER_STATUS.ACTIVE,
    isEmailVerified: true,
    authProvider: overrides.authProvider || "local",
    teamMembers: overrides.teamMembers || [],
    deletedAt: overrides.deletedAt || null,
    description: overrides.description || "",
  });
}

function ownerCookies(emp) {
  return [`itj_token=${signUserToken(emp, "employer")}`];
}

function memberCookies(emp, member) {
  return [`itj_token=${signUserToken(emp, "employer", { memberId: member._id.toString(), tv: member.tokenVersion || 0 })}`];
}

async function createCandidate(overrides = {}) {
  return Candidate.create({
    fullName: overrides.fullName || "Nguyễn Văn Ứng Viên",
    email: overrides.email || `${uniq("cand")}@mail.vn`,
    password: await hashPassword("Password123"),
    status: CANDIDATE_STATUS.ACTIVE,
    isEmailVerified: true,
    itProfile: {
      title: "Fullstack Developer",
      level: "middle",
      yearsOfExperience: 3,
      skills: overrides.skills || ["ReactJS"],
      openToWork: true,
      hideFromCurrentCompany: overrides.hide || "",
      preferredCity: "ha-noi",
      workExperience: [{ company: "Công ty Tiếng Việt", position: "Kỹ sư phần mềm", startDate: "2022-01", endDate: "", isCurrent: true, description: "Phát triển hệ thống" }],
      ...(overrides.itProfile || {}),
    },
  });
}

async function createJob(emp, overrides = {}) {
  return Job.create({
    employerId: emp._id,
    title: overrides.title || "NodeJS Developer",
    slug: uniq("job"),
    position: "middle",
    workingForm: "office",
    city: "ha-noi",
    employerActive: overrides.employerActive !== undefined ? overrides.employerActive : true,
    moderation: JOB_MODERATION.VISIBLE,
    viewsCount: overrides.viewsCount || 0,
    deletedAt: overrides.deletedAt || null,
  });
}

async function createApplication(emp, job, cand, overrides = {}) {
  return Application.create({
    jobId: job._id,
    employerId: emp._id,
    candidateId: cand._id,
    fullName: cand.fullName,
    email: cand.email,
    phone: "0912345678",
    cv: overrides.cv || { key: `cv-${"a".repeat(32)}.pdf`, originalName: "CV.pdf" },
    status: overrides.status || APPLICATION_STATUS.PENDING,
    ...(overrides.extra || {}),
  });
}

const FAKE_PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

// ---------------------------------------------------------------------------
// 1. Unit tests — thuần logic
// ---------------------------------------------------------------------------
describe("Slice 4 — Unit helpers", () => {
  test("QA-B09: isHiddenFromEmployer khớp chuẩn hóa theo token, bỏ tiền tố pháp lý", () => {
    expect(isHiddenFromEmployer("FPT", "FPT Software")).toBe(true);
    expect(isHiddenFromEmployer("FPT, Viettel", "FPT Software")).toBe(true);
    expect(isHiddenFromEmployer("fpt; viettel", "Công ty Cổ phần FPT")).toBe(true);
    expect(isHiddenFromEmployer("Công ty TNHH Viettel Telecom", "Tập đoàn Viettel")).toBe(true);
    expect(isHiddenFromEmployer("Tiki | Shopee", "SHOPEE VIỆT NAM")).toBe(true);
    // Không ẩn nhầm: khớp theo biên từ, không phải chuỗi con
    expect(isHiddenFromEmployer("FPT", "FPTShop Retail")).toBe(false);
    expect(isHiddenFromEmployer("Viettel", "FPT Software")).toBe(false);
    expect(isHiddenFromEmployer("", "FPT Software")).toBe(false);
    expect(isHiddenFromEmployer("Software", "FPT Software")).toBe(false);
  });

  test("QA-M12: parseSkillTerms tách dấu phẩy/chấm phẩy, giữ C++/C#", () => {
    expect(parseSkillTerms("ReactJS, NodeJS; C++ |C#")).toEqual(["ReactJS", "NodeJS", "C++", "C#"]);
    expect(parseSkillTerms("reactjs, ReactJS")).toEqual(["reactjs"]);
  });

  test("QA-M10: parseVietnamDateTime luôn hiểu theo +07:00 và không nhảy 00:30 → 09:30", () => {
    expect(parseVietnamDateTime("2026-12-01", "00:30").toISOString()).toBe("2026-11-30T17:30:00.000Z");
    expect(parseVietnamDateTime("2026-12-01", "09:30").toISOString()).toBe("2026-12-01T02:30:00.000Z");
    expect(parseVietnamDateTime("2026-02-31", "09:00")).toBeNull();
    expect(parseVietnamDateTime("01/12/2026", "09:00")).toBeNull();
    expect(parseVietnamDateTime("2026-12-01", "25:00")).toBeNull();
    expect(toVietnamParts(new Date("2026-11-30T17:30:00Z"))).toEqual({ date: "2026-12-01", time: "00:30" });
  });

  test("QA-M12: computeConversionRate bị chặn trong [0, 100]", () => {
    expect(computeConversionRate(4, 3)).toBe(100);
    expect(computeConversionRate(1, 3)).toBe(33.3);
    expect(computeConversionRate(5, 0)).toBe(0);
  });

  test("QA-M11: parseSalaryInput chặn số âm và parse '0' đúng", () => {
    expect(parseSalaryInput("0")).toEqual({ value: 0 });
    expect(parseSalaryInput("")).toEqual({ value: null });
    expect(parseSalaryInput("1500")).toEqual({ value: 1500 });
    expect(parseSalaryInput("-100").error).toBeTruthy();
    expect(parseSalaryInput("abc").error).toBeTruthy();
  });

  test("QA-m04: HTML mô tả công ty ↔ văn bản thuần", () => {
    const plain = htmlToPlainText("<p>Môi trường &amp; văn hóa</p><ul><li>MacBook</li><li>Lương T13</li></ul>");
    expect(plain).not.toMatch(/<p>|&amp;/);
    expect(plain).toContain("Môi trường & văn hóa");
    expect(plain).toContain("- MacBook");
    const html = plainTextToHtml("Đoạn 1\ndòng 2\n\nĐoạn 2 & 3");
    expect(html).toContain("<p>");
    expect(html).toContain("<br");
    expect(html).toContain("&amp;");
    const pasted = plainTextToHtml("<p>Giới thiệu</p><script>alert(1)</script>");
    expect(pasted).not.toContain("<script>");
  });
});

// ---------------------------------------------------------------------------
// 2. CV Viewer, Rating, 6 trạng thái ATS (QA-B02, QA-B07, QA-P04, QA-P05)
// ---------------------------------------------------------------------------
describe("Slice 4 — CV Details, PDF iframe & Rating", () => {
  test("QA-B02: sao chấm điểm xuất data-value 1..5, PDF dùng <iframe>, rating POST trả 200", async () => {
    const emp = await createEmployer();
    const cand = await createCandidate();
    const job = await createJob(emp);
    const stored = await saveCvBuffer(FAKE_PDF, "CV Nguyễn Văn A.pdf");
    const appDoc = await createApplication(emp, job, cand, { cv: { key: stored.key, originalName: stored.originalName } });
    const cookies = ownerCookies(emp);

    const page = await request(app).get(`/employer/cvs/${appDoc._id}`).set("Cookie", cookies);
    expect(page.status).toBe(200);
    for (let i = 1; i <= 5; i++) expect(page.text).toContain(`data-value="${i}"`);
    expect(page.text).not.toContain('data-value="star"');
    expect(page.text).toMatch(new RegExp(`<iframe[^>]*src="/employer/cvs/${appDoc._id}/pdf"`));
    expect(page.text).not.toContain("<embed");

    const pdfRes = await request(app).get(`/employer/cvs/${appDoc._id}/pdf`).set("Cookie", cookies);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers["content-type"]).toContain("application/pdf");
    expect(pdfRes.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(pdfRes.headers["content-security-policy"]).toContain("frame-ancestors 'self'");

    const { cookies: c2, csrfToken } = await getCsrf(`/employer/cvs/${appDoc._id}`, cookies);
    const ok = await request(app)
      .post(`/employer/cvs/${appDoc._id}/rating`)
      .set("Cookie", c2)
      .set("x-csrf-token", csrfToken)
      .set("Accept", "application/json")
      .send({ rating: 4 });
    expect(ok.status).toBe(200);
    expect(ok.body.rating).toBe(4);

    const bad = await request(app)
      .post(`/employer/cvs/${appDoc._id}/rating`)
      .set("Cookie", c2)
      .set("x-csrf-token", csrfToken)
      .set("Accept", "application/json")
      .send({ rating: "star" });
    expect(bad.status).toBe(400);
  });

  test("QA-B02: thiếu file CV → thông báo rõ ràng, không render iframe; PDF route 404", async () => {
    const emp = await createEmployer();
    const cand = await createCandidate();
    const job = await createJob(emp);
    const appDoc = await createApplication(emp, job, cand);
    const cookies = ownerCookies(emp);

    const page = await request(app).get(`/employer/cvs/${appDoc._id}`).set("Cookie", cookies);
    expect(page.status).toBe(200);
    expect(page.text).not.toMatch(/<iframe[^>]*src="\/employer\/cvs\//);
    expect(page.text).toContain("Không tìm thấy file CV PDF");

    const pdfRes = await request(app).get(`/employer/cvs/${appDoc._id}/pdf`).set("Cookie", cookies);
    expect(pdfRes.status).toBe(404);
  });

  test("QA-B07 + QA-P04: hiển thị badge vòng Phỏng vấn/Offer và thanh lọc Job + Trạng thái", async () => {
    const emp = await createEmployer();
    const cand = await createCandidate();
    const job = await createJob(emp, { title: "Senior Golang" });
    await createApplication(emp, job, cand, { status: APPLICATION_STATUS.OFFERED });
    const cookies = ownerCookies(emp);

    const list = await request(app).get("/employer/cvs").set("Cookie", cookies);
    expect(list.status).toBe(200);
    expect(list.text).toContain("Đề nghị (Offer)");
    expect(list.text).toContain('name="status"');
    expect(list.text).toContain('name="jobId"');
    ["pending", "approved", "interviewing", "offered", "hired", "rejected"].forEach((st) => {
      expect(list.text).toContain(`value="${st}"`);
    });

    const filtered = await request(app).get("/employer/cvs?status=hired").set("Cookie", cookies);
    expect(filtered.text).toContain("Không có hồ sơ nào khớp bộ lọc");
  });

  test("QA-m07: đổi trạng thái CV bắn thông báo chuông cho ứng viên", async () => {
    const emp = await createEmployer();
    const cand = await createCandidate();
    const job = await createJob(emp);
    const appDoc = await createApplication(emp, job, cand);
    const { cookies, csrfToken } = await getCsrf(`/employer/cvs/${appDoc._id}`, ownerCookies(emp));

    const res = await request(app)
      .post(`/employer/cvs/${appDoc._id}/status`)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrfToken)
      .set("Accept", "application/json")
      .send({ status: "interviewing" });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    const notif = await Notification.findOne({ recipientId: cand._id, type: "status_change" });
    expect(notif).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 3. Lịch phỏng vấn múi giờ VN & .ics (QA-M10, QA-M09)
// ---------------------------------------------------------------------------
describe("Slice 4 — Interview schedule (+07:00) & .ics", () => {
  test("QA-M10: 00:30 giờ VN lưu đúng UTC, offline xóa meetingLink, tải .ics được", async () => {
    const emp = await createEmployer({ companyName: "VN Tech" });
    const cand = await createCandidate();
    const job = await createJob(emp);
    const appDoc = await createApplication(emp, job, cand);
    const { cookies, csrfToken } = await getCsrf(`/employer/cvs/${appDoc._id}`, ownerCookies(emp));

    const nextYear = new Date().getUTCFullYear() + 1;
    const res = await request(app)
      .post(`/employer/cvs/${appDoc._id}/schedule`)
      .set("Cookie", cookies)
      .type("form")
      .send({
        _csrf: csrfToken,
        scheduledDate: `${nextYear}-03-15`,
        scheduledTime: "00:30",
        durationMinutes: "45",
        locationType: "offline",
        meetingLink: "https://meet.google.com/abc-defg-hij",
        locationAddress: "Tầng 5, Keangnam",
      });
    expect(res.status).toBe(302);

    const saved = await Application.findById(appDoc._id).lean();
    expect(saved.status).toBe("interviewing");
    expect(new Date(saved.interviewSchedule.scheduledAt).toISOString()).toBe(`${nextYear}-03-14T17:30:00.000Z`);
    expect(saved.interviewSchedule.meetingLink).toBe("");
    expect(saved.interviewSchedule.locationType).toBe("offline");

    const ics = await request(app).get(`/employer/cvs/${appDoc._id}/ics`).set("Cookie", cookies);
    expect(ics.status).toBe(200);
    expect(ics.headers["content-type"]).toContain("text/calendar");
    expect(ics.headers["content-disposition"]).toContain("attachment");
    expect(ics.text).toContain("BEGIN:VCALENDAR");
    expect(ics.text).toContain(`DTSTART:${nextYear}0314T173000Z`);
  });

  test("QA-M10: ngày không tồn tại hoặc quá khứ bị từ chối", async () => {
    const emp = await createEmployer();
    const cand = await createCandidate();
    const job = await createJob(emp);
    const appDoc = await createApplication(emp, job, cand);
    const { cookies, csrfToken } = await getCsrf(`/employer/cvs/${appDoc._id}`, ownerCookies(emp));

    for (const [d, t] of [["2030-02-31", "09:00"], ["2020-01-01", "09:00"]]) {
      await request(app)
        .post(`/employer/cvs/${appDoc._id}/schedule`)
        .set("Cookie", cookies)
        .type("form")
        .send({ _csrf: csrfToken, scheduledDate: d, scheduledTime: t, locationType: "online" });
    }
    const saved = await Application.findById(appDoc._id).lean();
    expect(saved.interviewSchedule && saved.interviewSchedule.scheduledAt).toBeFalsy();

    const ics = await request(app).get(`/employer/cvs/${appDoc._id}/ics`).set("Cookie", cookies);
    expect(ics.status).toBe(302);
  });

  test("QA-M09: Ghi chú nội bộ lấy tên chuyên viên đang đăng nhập, bỏ qua req.body.author", async () => {
    const emp = await createEmployer({
      teamMembers: [{ fullName: "Trần Thị HR", email: `${uniq("hr")}@abc.vn`, password: await hashPassword("Password123"), role: "recruiter" }],
    });
    const member = emp.teamMembers[0];
    const cand = await createCandidate();
    const job = await createJob(emp);
    const appDoc = await createApplication(emp, job, cand);
    const { cookies, csrfToken } = await getCsrf(`/employer/cvs/${appDoc._id}`, memberCookies(emp, member));

    const res = await request(app)
      .post(`/employer/cvs/${appDoc._id}/notes`)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrfToken)
      .set("Accept", "application/json")
      .send({ content: "Ứng viên mạnh về NodeJS", author: "CEO Giả Mạo" });
    expect(res.status).toBe(200);
    const saved = await Application.findById(appDoc._id).lean();
    expect(saved.internalNotes[0].author).toBe("Trần Thị HR");
  });
});

// ---------------------------------------------------------------------------
// 4. Talent Pool privacy, multi-skill, profile & PDF (QA-B09, QA-M12, QA-B06)
// ---------------------------------------------------------------------------
describe("Slice 4 — Talent Pool", () => {
  test("QA-B09: ẩn ứng viên khỏi 'FPT Software' khi họ chặn 'FPT, Viettel' (list, profile, PDF, invite)", async () => {
    const fpt = await createEmployer({ companyName: "FPT Software" });
    const other = await createEmployer({ companyName: "Công ty ABC" });
    const hidden = await createCandidate({ fullName: "Ứng Viên Bí Mật", hide: "FPT, Viettel" });
    await createCandidate({ fullName: "Ứng Viên Công Khai" });

    const fptList = await request(app).get("/employer/candidates").set("Cookie", ownerCookies(fpt));
    expect(fptList.status).toBe(200);
    expect(fptList.text).toContain("Ứng Viên Công Khai");
    expect(fptList.text).not.toContain("Ứng Viên Bí Mật");

    const otherList = await request(app).get("/employer/candidates").set("Cookie", ownerCookies(other));
    expect(otherList.text).toContain("Ứng Viên Bí Mật");

    const profile = await request(app)
      .get(`/employer/candidates/${hidden._id}`)
      .set("Cookie", ownerCookies(fpt))
      .set("Accept", "application/json");
    expect(profile.status).toBe(404);

    const pdf = await request(app).get(`/employer/candidates/${hidden._id}/pdf`).set("Cookie", ownerCookies(fpt));
    expect(pdf.status).toBe(404);

    const job = await createJob(fpt);
    const { cookies, csrfToken } = await getCsrf("/employer/candidates", ownerCookies(fpt));
    await request(app)
      .post(`/employer/candidates/${hidden._id}/invite`)
      .set("Cookie", cookies)
      .type("form")
      .send({ _csrf: csrfToken, jobId: job._id.toString(), message: "Mời bạn" });
    expect(await Notification.countDocuments({ recipientId: hidden._id })).toBe(0);
  });

  test("QA-M12: tìm nhiều kỹ năng 'ReactJS, NodeJS' + xem hồ sơ JSON + PDF Unicode", async () => {
    const emp = await createEmployer();
    const react = await createCandidate({ fullName: "Dev React", skills: ["ReactJS"] });
    await createCandidate({ fullName: "Dev Node", skills: ["NodeJS"] });
    await createCandidate({ fullName: "Dev Java", skills: ["Java"] });
    const cookies = ownerCookies(emp);

    const res = await request(app).get(`/employer/candidates?skill=${encodeURIComponent("ReactJS, NodeJS")}`).set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.text).toContain("Dev React");
    expect(res.text).toContain("Dev Node");
    expect(res.text).not.toContain("Dev Java");

    const profile = await request(app)
      .get(`/employer/candidates/${react._id}`)
      .set("Cookie", cookies)
      .set("Accept", "application/json");
    expect(profile.status).toBe(200);
    expect(profile.body.candidate.fullName).toBe("Dev React");
    expect(profile.body.candidate.workExperience.length).toBe(1);
    expect(profile.body.candidate.pdfUrl).toBe(`/employer/candidates/${react._id}/pdf`);

    const pdf = await request(app).get(`/employer/candidates/${react._id}/pdf`).set("Cookie", cookies);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  test("QA-B06: link phân trang encodeURIComponent cho C++ và có nút Trước/Sau", async () => {
    const emp = await createEmployer();
    for (let i = 0; i < 13; i++) {
      await createCandidate({ fullName: `Dev Cpp ${i}`, skills: ["C++"] });
    }
    const res = await request(app).get(`/employer/candidates?skill=${encodeURIComponent("C++")}`).set("Cookie", ownerCookies(emp));
    expect(res.status).toBe(200);
    expect(res.text).toContain("skill=C%2B%2B");
    expect(res.text).toContain("page=2");
    expect(res.text).not.toContain("page=undefined");
    expect(res.text).toContain("Sau");
  });

  test("QA-m06: NTD pending bị chặn xem hồ sơ chi tiết ứng viên", async () => {
    const emp = await createEmployer({ status: EMPLOYER_STATUS.PENDING });
    const cand = await createCandidate();
    const res = await request(app)
      .get(`/employer/candidates/${cand._id}`)
      .set("Cookie", ownerCookies(emp))
      .set("Accept", "application/json");
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 5. Analytics 6 vòng + conversion ≤ 100% (QA-B07, QA-M12)
// ---------------------------------------------------------------------------
describe("Slice 4 — Analytics", () => {
  test("Đếm đủ 6 vòng, bỏ job đã xóa mềm, tỷ lệ chuyển đổi không vượt 100%", async () => {
    const emp = await createEmployer();
    const job = await createJob(emp, { viewsCount: 3 });
    const deletedJob = await createJob(emp, { viewsCount: 0, deletedAt: new Date() });
    const statuses = ["pending", "approved", "interviewing", "offered", "hired", "rejected"];
    for (const st of statuses) {
      const c = await createCandidate();
      await createApplication(emp, job, c, { status: st });
    }
    const ghost = await createCandidate();
    await createApplication(emp, deletedJob, ghost, { status: "hired" });

    const res = await request(app).get("/employer/analytics").set("Cookie", ownerCookies(emp));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("133.3%");
    expect(res.text).toContain("100%");
    statuses.forEach((st) => expect(res.text).toContain(`data-stage="${st}"`));
    expect(res.text).not.toMatch(/Đang đánh giá/);
    // 6 hồ sơ của job còn tồn tại (job đã xóa mềm bị loại khỏi tử số)
    expect(res.text).toMatch(/Hồ sơ CV nộp về<\/div><div[^>]*>6</);
  });
});

// ---------------------------------------------------------------------------
// 6. RBAC đội ngũ HR (QA-B10, QA-M09)
// ---------------------------------------------------------------------------
describe("Slice 4 — HR Team RBAC", () => {
  test("Recruiter không sửa được hồ sơ công ty, không đăng/xóa tin, không xóa CV", async () => {
    const emp = await createEmployer({
      companyName: "Công ty Gốc",
      teamMembers: [{ fullName: "Recruiter A", email: `${uniq("rec")}@abc.vn`, password: await hashPassword("Password123"), role: "recruiter" }],
    });
    const member = emp.teamMembers[0];
    const job = await createJob(emp);
    const cand = await createCandidate();
    const appDoc = await createApplication(emp, job, cand);
    const { cookies, csrfToken } = await getCsrf("/employer/company-profile", memberCookies(emp, member));

    const profilePage = await request(app).get("/employer/company-profile").set("Cookie", cookies);
    expect(profilePage.text).toContain("Chế độ chỉ xem");

    const upd = await request(app)
      .post("/employer/company-profile")
      .set("Cookie", cookies)
      .field("_csrf", csrfToken)
      .field("companyName", "Bị Đổi Tên");
    expect(upd.status).toBe(302);
    expect((await Employer.findById(emp._id).lean()).companyName).toBe("Công ty Gốc");

    const createPage = await request(app).get("/employer/jobs/create").set("Cookie", cookies);
    expect(createPage.status).toBe(302);

    await request(app).post(`/employer/jobs/${job._id}/delete`).set("Cookie", cookies).type("form").send({ _csrf: csrfToken });
    expect((await Job.findById(job._id).lean()).deletedAt).toBeNull();

    await request(app).post(`/employer/cvs/${appDoc._id}/delete`).set("Cookie", cookies).type("form").send({ _csrf: csrfToken });
    expect((await Application.findById(appDoc._id).lean()).hiddenByEmployer).toBe(false);
  });

  test("Admin phụ không xóa/cấp lại mật khẩu Admin khác; Owner cấp lại mật khẩu thành viên được", async () => {
    const emp = await createEmployer({
      teamMembers: [
        { fullName: "Admin Một", email: `${uniq("ad1")}@abc.vn`, password: await hashPassword("Password123"), role: "admin" },
        { fullName: "Admin Hai", email: `${uniq("ad2")}@abc.vn`, password: await hashPassword("Password123"), role: "admin" },
      ],
    });
    const [admin1, admin2] = emp.teamMembers;

    const asAdmin1 = await getCsrf("/employer/team", memberCookies(emp, admin1));
    await request(app)
      .post(`/employer/team/${admin2._id}/delete`)
      .set("Cookie", asAdmin1.cookies)
      .type("form")
      .send({ _csrf: asAdmin1.csrfToken });
    await request(app)
      .post(`/employer/team/${admin2._id}/reset-password`)
      .set("Cookie", asAdmin1.cookies)
      .type("form")
      .send({ _csrf: asAdmin1.csrfToken, newPassword: "Hacked12345" });
    let reloaded = await Employer.findById(emp._id).select("+teamMembers.password");
    expect(reloaded.teamMembers.length).toBe(2);
    expect(await comparePassword("Password123", reloaded.teamMembers[1].password)).toBe(true);

    const asOwner = await getCsrf("/employer/team", ownerCookies(emp));
    expect(asOwner.res.text).toContain("Cấp lại mật khẩu");
    const reset = await request(app)
      .post(`/employer/team/${admin2._id}/reset-password`)
      .set("Cookie", asOwner.cookies)
      .type("form")
      .send({ _csrf: asOwner.csrfToken, newPassword: "NewPass2026" });
    expect(reset.status).toBe(302);
    reloaded = await Employer.findById(emp._id).select("+teamMembers.password");
    const target = reloaded.teamMembers.find((m) => m._id.toString() === admin2._id.toString());
    expect(await comparePassword("NewPass2026", target.password)).toBe(true);
    expect(target.tokenVersion).toBe((admin2.tokenVersion || 0) + 1);
  });
});

// ---------------------------------------------------------------------------
// 7. Google OAuth cho teamMember & tài khoản xóa mềm (QA-B10, QA-M08)
// ---------------------------------------------------------------------------
describe("Slice 4 — Google OAuth Employer", () => {
  function mockGoogle(profile) {
    jest.spyOn(googleAuthService, "verifyOAuthState").mockReturnValue({ valid: true, next: "/employer/cvs" });
    jest.spyOn(googleAuthService, "getCallbackUrl").mockReturnValue("http://localhost/employer/auth/google/callback");
    jest.spyOn(googleAuthService, "exchangeCodeForTokens").mockResolvedValue({ access_token: "tok" });
    jest.spyOn(googleAuthService, "fetchGoogleUserInfo").mockResolvedValue({ email_verified: true, sub: uniq("sub"), name: "HR Google", ...profile });
  }

  test("Email của teamMember đăng nhập vào đúng công ty, không tạo công ty rỗng", async () => {
    const memberEmail = `${uniq("hr")}@company.vn`;
    const emp = await createEmployer({
      teamMembers: [{ fullName: "HR Team", email: memberEmail, password: await hashPassword("Password123"), role: "recruiter" }],
    });
    mockGoogle({ email: memberEmail });

    const res = await request(app).get("/employer/auth/google/callback?code=abc&state=xyz");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/employer/cvs");
    expect(await Employer.countDocuments({ email: memberEmail })).toBe(0);
    const tokenCookie = (res.headers["set-cookie"] || []).find((c) => c.startsWith("itj_token="));
    expect(tokenCookie).toBeTruthy();
    const jwt = require("jsonwebtoken");
    const payload = jwt.decode(tokenCookie.split(";")[0].replace("itj_token=", ""));
    expect(payload.id).toBe(emp._id.toString());
    expect(payload.memberId).toBe(emp.teamMembers[0]._id.toString());
  });

  test("Email thuộc công ty đã xóa mềm → báo lỗi rõ ràng, không E11000", async () => {
    const email = `${uniq("deleted")}@company.vn`;
    await createEmployer({ email, deletedAt: new Date() });
    mockGoogle({ email });
    const res = await request(app).get("/employer/auth/google/callback?code=abc&state=xyz");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/employer/login");
    expect(await Employer.countDocuments({ email })).toBe(1);
  });

  test("QA-M08: Owner tạo bằng Google đặt mật khẩu lần đầu không cần mật khẩu hiện tại", async () => {
    const emp = await createEmployer({ authProvider: "google" });
    const { cookies, csrfToken, res: page } = await getCsrf("/employer/change-password", ownerCookies(emp));
    expect(page.status).toBe(200);
    const res = await request(app)
      .post("/employer/change-password")
      .set("Cookie", cookies)
      .type("form")
      .send({ _csrf: csrfToken, newPassword: "BrandNew2026", confirmPassword: "BrandNew2026" });
    expect(res.status).toBe(302);
    const saved = await Employer.findById(emp._id).select("+password");
    expect(await comparePassword("BrandNew2026", saved.password)).toBe(true);
    expect(saved.authProvider).toBe("local");
  });
});

// ---------------------------------------------------------------------------
// 8. Jobs: lương, tạm dừng tin, pending gating, follower notification (QA-M11, QA-m06, QA-m07, QA-m04)
// ---------------------------------------------------------------------------
describe("Slice 4 — Jobs & company profile", () => {
  test("QA-M11: từ chối lương âm, lưu '0' đúng là 0", async () => {
    const emp = await createEmployer();
    const { cookies, csrfToken } = await getCsrf("/employer/jobs/create", ownerCookies(emp));

    const neg = await request(app)
      .post("/employer/jobs/create")
      .set("Cookie", cookies)
      .field("_csrf", csrfToken)
      .field("title", "Job Lương Âm")
      .field("position", "middle")
      .field("workingForm", "office")
      .field("salaryMin", "-500")
      .field("salaryMax", "1000");
    expect(neg.status).toBe(400);
    expect(await Job.countDocuments({ title: "Job Lương Âm" })).toBe(0);

    const zero = await request(app)
      .post("/employer/jobs/create")
      .set("Cookie", cookies)
      .field("_csrf", csrfToken)
      .field("title", "Job Lương Không")
      .field("position", "middle")
      .field("workingForm", "office")
      .field("salaryMin", "0")
      .field("salaryMax", "2000");
    expect(zero.status).toBe(302);
    const job = await Job.findOne({ title: "Job Lương Không" }).lean();
    expect(job.salaryMin).toBe(0);
    expect(job.salaryMax).toBe(2000);
  });

  test("QA-m07: đăng tin mới báo chuông cho ứng viên theo dõi công ty", async () => {
    const emp = await createEmployer();
    const follower = await createCandidate();
    await CompanyFollow.create({ candidateId: follower._id, employerId: emp._id });
    const { cookies, csrfToken } = await getCsrf("/employer/jobs/create", ownerCookies(emp));
    await request(app)
      .post("/employer/jobs/create")
      .set("Cookie", cookies)
      .field("_csrf", csrfToken)
      .field("title", "Tin Mới Cho Follower")
      .field("position", "middle")
      .field("workingForm", "office");
    await new Promise((r) => setTimeout(r, 200));
    expect(await Notification.countDocuments({ recipientId: follower._id })).toBe(1);
  });

  test("QA-m07: Tạm dừng / Mở lại tin tuyển dụng", async () => {
    const emp = await createEmployer();
    const job = await createJob(emp);
    const { cookies, csrfToken, res } = await getCsrf("/employer/jobs", ownerCookies(emp));
    expect(res.text).toContain("Tạm dừng");
    await request(app).post(`/employer/jobs/${job._id}/toggle-active`).set("Cookie", cookies).type("form").send({ _csrf: csrfToken });
    expect((await Job.findById(job._id).lean()).employerActive).toBe(false);
    await request(app).post(`/employer/jobs/${job._id}/toggle-active`).set("Cookie", cookies).type("form").send({ _csrf: csrfToken });
    expect((await Job.findById(job._id).lean()).employerActive).toBe(true);
  });

  test("QA-m06: NTD pending bị chặn mở form đăng tin & AI tạo JD; nút đăng tin bị làm mờ", async () => {
    const emp = await createEmployer({ status: EMPLOYER_STATUS.PENDING });
    const cookies = ownerCookies(emp);
    const createPage = await request(app).get("/employer/jobs/create").set("Cookie", cookies);
    expect(createPage.status).toBe(302);
    expect(createPage.headers.location).toBe("/employer/jobs");

    const { cookies: c2, csrfToken, res: jobsPage } = await getCsrf("/employer/jobs", cookies);
    expect(jobsPage.text).toContain('aria-disabled="true"');
    const jd = await request(app)
      .post("/api/ai/generate-jd")
      .set("Cookie", c2)
      .set("x-csrf-token", csrfToken)
      .set("Accept", "application/json")
      .send({ title: "Backend Developer" });
    expect(jd.status).toBe(403);
  });

  test("QA-m04: textarea mô tả công ty hiển thị văn bản thuần, không lộ <p>/&amp;", async () => {
    const emp = await createEmployer({ description: "<p>Văn hóa &amp; con người</p><ul><li>MacBook</li></ul>" });
    const res = await request(app).get("/employer/company-profile").set("Cookie", ownerCookies(emp));
    const textarea = res.text.match(/<textarea[^>]*id="companyDescription"[^>]*>([\s\S]*?)<\/textarea>/);
    expect(textarea).toBeTruthy();
    expect(textarea[1]).not.toContain("&lt;p&gt;");
    expect(textarea[1]).toContain("Văn hóa &amp; con người"); // Pug escape 1 lần "&" → hiển thị đúng "&"
    expect(textarea[1]).toContain("- MacBook");
  });
});

// ---------------------------------------------------------------------------
// 9. AI Screening (QA-M13)
// ---------------------------------------------------------------------------
describe("Slice 4 — AI screening", () => {
  test("Thiếu file PDF → 422, không chấm điểm bừa", async () => {
    const emp = await createEmployer();
    const cand = await createCandidate();
    const job = await createJob(emp);
    const appDoc = await createApplication(emp, job, cand);
    const { cookies, csrfToken } = await getCsrf(`/employer/cvs/${appDoc._id}`, ownerCookies(emp));
    const res = await request(app)
      .post(`/api/ai/screen-cv/${appDoc._id}`)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrfToken)
      .set("Accept", "application/json")
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  test("PDF không đọc được chữ (< 20 ký tự) → 422", async () => {
    const emp = await createEmployer();
    const cand = await createCandidate();
    const job = await createJob(emp);
    const stored = await saveCvBuffer(FAKE_PDF, "scan.pdf");
    const appDoc = await createApplication(emp, job, cand, { cv: { key: stored.key, originalName: "scan.pdf" } });
    const { cookies, csrfToken } = await getCsrf(`/employer/cvs/${appDoc._id}`, ownerCookies(emp));
    const res = await request(app)
      .post(`/api/ai/screen-cv/${appDoc._id}`)
      .set("Cookie", cookies)
      .set("x-csrf-token", csrfToken)
      .set("Accept", "application/json")
      .send({});
    expect(res.status).toBe(422);
  });
});
