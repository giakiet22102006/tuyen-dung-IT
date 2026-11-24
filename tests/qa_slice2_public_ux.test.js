// tests/qa_slice2_public_ux.test.js
// Slice 2: Public Web, Search, Salary, Client JS, Header/Mobile, MCP & API Docs
const request = require("supertest");
const fs = require("fs");
const path = require("path");
const pug = require("pug");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../src/app");
const { Candidate, Employer, Job, Application, Review, Feedback, Article, Skill } = require("../src/models");
const { EMPLOYER_STATUS, CANDIDATE_STATUS, JOB_MODERATION } = require("../src/config/constants");
const { hashPassword } = require("../src/services/auth.service");
const { searchJobs, pickFirstString, normalizeFilterArray } = require("../src/services/job.service");
const { getCompanyMapData } = require("../src/utils/googleMaps");
const { parseSalaryInput } = require("../src/controllers/client/salary.controller");
const { executeTool } = require("../src/services/aiTools.service");

// Bọc generateItProfilePdf bằng spy nhưng vẫn chạy bản thật (controller destructure lúc require)
jest.mock("../src/services/pdfGenerator.service", () => {
  const actual = jest.requireActual("../src/services/pdfGenerator.service");
  return { ...actual, generateItProfilePdf: jest.fn(actual.generateItProfilePdf) };
});

jest.setTimeout(30000);

let mongoServer;
let employer;
let jobs = [];

const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

function mergeCookies(oldCookies = [], newCookies = []) {
  const map = new Map();
  [...oldCookies, ...newCookies].forEach((c) => map.set(c.split("=")[0].trim(), c));
  return Array.from(map.values());
}

async function getCsrf(url, existing = []) {
  const req = request(app).get(url);
  if (existing.length) req.set("Cookie", existing);
  const res = await req;
  const cookies = mergeCookies(existing, res.headers["set-cookie"] || []);
  const m = res.text.match(/name="_csrf"\s+value="([^"]+)"/) || res.text.match(/name="csrf-token"\s+content="([^"]+)"/);
  return { cookies, csrfToken: m ? m[1] : "", res };
}

async function loginCandidate(email = "slice2.candidate@test.com") {
  const cand = await Candidate.create({
    fullName: "Nguyễn Văn Slice Hai",
    email,
    password: await hashPassword("Password123"),
    phone: "0987654321",
    status: CANDIDATE_STATUS.ACTIVE,
    isEmailVerified: true,
  });
  const init = await getCsrf("/candidate/login");
  const loginRes = await request(app)
    .post("/candidate/login")
    .set("Cookie", init.cookies)
    .type("form")
    .send({ email, password: "Password123", _csrf: init.csrfToken });
  return { candidate: cand, cookies: mergeCookies(init.cookies, loginRes.headers["set-cookie"] || []) };
}

async function loginEmployer(email = "slice2.hr@test.com") {
  const emp = await Employer.create({
    companyName: "Công ty HR Slice Hai",
    slug: "cong-ty-hr-" + email.split("@")[0].replace(/[^a-z0-9]/g, "-"),
    email,
    password: await hashPassword("Password123"),
    city: "ha-noi",
    address: "Hà Nội",
    status: EMPLOYER_STATUS.ACTIVE,
    isEmailVerified: true,
  });
  const init = await getCsrf("/employer/login");
  const loginRes = await request(app)
    .post("/employer/login")
    .set("Cookie", init.cookies)
    .type("form")
    .send({ email, password: "Password123", _csrf: init.csrfToken });
  return { employer: emp, cookies: mergeCookies(init.cookies, loginRes.headers["set-cookie"] || []) };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  employer = await Employer.create({
    companyName: "Techcombank",
    slug: "techcombank",
    email: "hr@techcombank.test",
    password: "Password123",
    city: "ha-noi",
    address: "191 Bà Triệu",
    status: EMPLOYER_STATUS.ACTIVE,
  });
  await Skill.create({ name: "ReactJS", slug: "reactjs" });
  await Skill.create({ name: "NodeJS", slug: "nodejs" });
  await Skill.create({ name: "C++", slug: "c-plus-plus" });

  // 11 job (>9) để test phân trang / clamp
  for (let i = 0; i < 11; i++) {
    jobs.push(
      await Job.create({
        employerId: employer._id,
        title: `Backend Engineer ${i}`,
        slug: `backend-engineer-${i}`,
        salaryMin: i === 0 ? null : 1000,
        salaryMax: i === 0 ? null : 2000,
        position: "middle",
        workingForm: "office",
        skills: [
          { name: "NodeJS", slug: "nodejs" },
          ...(i % 2 === 0 ? [{ name: "ReactJS", slug: "reactjs" }] : []),
        ],
        city: "ha-noi",
        benefits: ["macbook"],
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
      })
    );
  }
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});

describe("QA-B01 / QA-P08: /contact", () => {
  test("form render type=contact và hiển thị thông tin từ siteSetting", async () => {
    const res = await request(app).get("/contact");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/name="type"\s+value="contact"/);
    expect(res.text).not.toMatch(/name="type"\s+value="other"/);
    expect(res.text).toContain("Keangnam Landmark 72"); // fallback / giá trị mặc định của Setting
    expect(res.text).toContain("contact@vn-itjobs.com");
  });

  test("submit form HTML thường => flash + redirect (không in JSON thô), lưu type=contact", async () => {
    const init = await getCsrf("/contact");
    const res = await request(app)
      .post("/api/feedback")
      .set("Cookie", init.cookies)
      .set("Referer", "http://127.0.0.1/contact")
      .type("form")
      .send({
        _csrf: init.csrfToken,
        type: "contact",
        contactName: "Khách Liên Hệ",
        contactEmail: "khach@example.com",
        title: "Hợp tác truyền thông",
        content: "Chúng tôi muốn hợp tác với VN.ITJobs.",
      });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/contact");
    const saved = await Feedback.findOne({ contactEmail: "khach@example.com" });
    expect(saved).toBeTruthy();
    expect(saved.type).toBe("contact");
  });

  test("form HTML thiếu nội dung => redirect (không JSON); AJAX/JSON vẫn trả JSON 400", async () => {
    const init = await getCsrf("/contact");
    const html = await request(app)
      .post("/api/feedback")
      .set("Cookie", init.cookies)
      .type("form")
      .send({ _csrf: init.csrfToken, type: "contact", content: "" });
    expect(html.status).toBe(302);

    const ajax = await request(app)
      .post("/api/feedback")
      .set("Cookie", init.cookies)
      .set("Accept", "application/json")
      .set("x-csrf-token", init.csrfToken)
      .type("form")
      .send({ type: "contact", content: "" });
    expect(ajax.status).toBe(400);
    expect(ajax.body.success).toBe(false);
  });
});

describe("QA-B11 / QA-M05: /search query params, clamp & filter retention", () => {
  test("helper pickFirstString / normalizeFilterArray không crash với mảng", () => {
    expect(pickFirstString(["", "  a ", "b"])).toBe("a");
    expect(pickFirstString({ x: 1 })).toBe("");
    expect(normalizeFilterArray(["a", "a", " b ", 5, ""])).toEqual(["a", "b"]);
  });

  test.each([
    "/search?skill=reactjs&skill=nodejs",
    "/search?city=ha-noi&city=da-nang",
    "/search?position=middle&position=senior",
    "/search?benefit=macbook&benefit=hybrid",
    "/search?keyword=react&keyword=node",
    "/search?workingForm=office&workingForm=remote",
  ])("GET %s không sập 500", async (url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
  });

  test("nhiều skill => $in (job có ReactJS hoặc NodeJS)", async () => {
    const out = await searchJobs({ skill: ["reactjs", "nodejs"] });
    expect(out.pagination.totalItems).toBe(11);
    const only = await searchJobs({ skill: "reactjs" });
    expect(only.pagination.totalItems).toBe(6);
  });

  test("QA-M01: tìm theo tên công ty trả về job của công ty", async () => {
    const res = await request(app).get("/search?keyword=Techcombank");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Backend Engineer");
    const out = await searchJobs({ keyword: "techcombank" });
    expect(out.pagination.totalItems).toBe(11);
  });

  test("page vượt ngưỡng được kéo về trang cuối hợp lệ (có kết quả)", async () => {
    const out = await searchJobs({ page: "99" });
    expect(out.pagination.currentPage).toBe(2);
    expect(out.jobs.length).toBe(2);
    const res = await request(app).get("/search?page=99");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Backend Engineer");
  });

  test("pagination search có link Trước & giữ bộ lọc, mã hóa query", async () => {
    const res = await request(app).get("/search?skill=nodejs&keyword=" + encodeURIComponent("Back end&x") + "&page=1");
    expect(res.status).toBe(200);
    const ok = await request(app).get("/search?skill=nodejs&page=1");
    expect(ok.text).toMatch(/href="\/search\?page=2&(amp;)?skill=nodejs"/);
    expect(ok.text).toContain('rel="next"');
  });

  test("search form & pill giữ skill/benefit đang chọn", async () => {
    const res = await request(app).get("/search?skill=nodejs&benefit=macbook");
    expect(res.text).toMatch(/<input type="hidden" name="skill" value="nodejs"/);
    expect(res.text).toMatch(/<input type="hidden" name="benefit" value="macbook"/);
  });

  test("QA-M05: job/công ty không tồn tại trả 404 bằng pages/404", async () => {
    const jobRes = await request(app).get("/jobs/khong-ton-tai");
    expect(jobRes.status).toBe(404);
    expect(jobRes.text).toContain("404");
    expect(jobRes.text).not.toContain("Chưa có nhà tuyển dụng nào");
    const compRes = await request(app).get("/companies/khong-ton-tai");
    expect(compRes.status).toBe(404);
    expect(compRes.text).toContain("404");
  });

  test("/companies?page=99 kéo về trang cuối & pagination link tuyệt đối", async () => {
    const res = await request(app).get("/companies?page=99");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Techcombank");
    expect(res.text).toContain("grid-cols-1 sm:grid-cols-2");
  });
});

describe("QA-B03 / QA-m02 / QA-B12: Job apply UX", () => {
  test("Khách: nút Ứng tuyển ngay là link tới login ?next, không mở modal", async () => {
    const res = await request(app).get("/jobs/backend-engineer-1");
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/candidate/login?next=/jobs/backend-engineer-1"');
    expect(res.text).not.toContain("btn-open-quick-apply");
  });

  test("Candidate chưa nộp có nút mở modal; đã nộp => '✓ Đã ứng tuyển'", async () => {
    const { candidate, cookies } = await loginCandidate();
    const before = await request(app).get("/jobs/backend-engineer-2").set("Cookie", cookies);
    expect(before.text).toContain("btn-open-quick-apply");
    expect(before.text).not.toContain("Đã ứng tuyển");

    await Application.create({
      jobId: jobs[2]._id,
      employerId: employer._id,
      candidateId: candidate._id,
      fullName: "A",
      email: "a@test.com",
      phone: "0987654321",
      cv: { key: "x.pdf", originalName: "x.pdf", size: 10 },
    });
    const after = await request(app).get("/jobs/backend-engineer-2").set("Cookie", cookies);
    expect(after.text).toContain("✓ Đã ứng tuyển");
    expect(after.text).toContain('href="/candidate/applied-jobs"');
    expect(after.text).not.toContain("btn-open-quick-apply");
  });

  test("Employer: nút bị vô hiệu hóa", async () => {
    const { cookies } = await loginEmployer();
    const res = await request(app).get("/jobs/backend-engineer-3").set("Cookie", cookies);
    expect(res.text).toContain("Tài khoản Nhà tuyển dụng");
    expect(res.text).toMatch(/<button[^>]*disabled/);
    expect(res.text).not.toContain("btn-open-quick-apply");
  });

  test("job-details không còn khối flash trùng lặp", () => {
    expect(read("views/pages/job-details.pug")).not.toMatch(/if flash/);
  });

  test("IT Profile PDF dùng tên/SĐT/email vừa sửa trong modal", async () => {
    const pdfService = require("../src/services/pdfGenerator.service");
    const spy = pdfService.generateItProfilePdf;
    spy.mockClear();
    const { candidate, cookies } = await loginCandidate("pdf.candidate@test.com");
    await Candidate.updateOne(
      { _id: candidate._id },
      { $set: { "itProfile.title": "Backend Dev", "itProfile.skills": ["NodeJS"] } }
    );
    const init = await getCsrf("/jobs/backend-engineer-4", cookies);
    await request(app)
      .post("/jobs/backend-engineer-4/apply")
      .set("Cookie", init.cookies)
      .field("_csrf", init.csrfToken)
      .field("fullName", "Tên Sửa Trong Modal")
      .field("email", "modal@test.com")
      .field("phone", "0911222333")
      .field("applyType", "it_profile");
    expect(spy).toHaveBeenCalled();
    const arg = spy.mock.calls[0][0];
    expect(arg.fullName).toBe("Tên Sửa Trong Modal");
    expect(arg.phone).toBe("0911222333");
    expect(arg.email).toBe("modal@test.com");
  });
});

describe("QA-M03 / QA-P02: Salary benchmark", () => {
  test("parseSalaryInput xử lý số âm / lẻ / nhóm nghìn đúng", () => {
    expect(parseSalaryInput("18500000")).toEqual({ value: 18500000, error: null });
    expect(parseSalaryInput("25.000.000").value).toBe(25000000);
    expect(parseSalaryInput("-25000000").value).toBeNull();
    expect(parseSalaryInput("-25000000").error).toBeTruthy();
    expect(parseSalaryInput("25000000.50").value).toBeNull();
    expect(parseSalaryInput("25000000.50").error).toBeTruthy();
    expect(parseSalaryInput("abc").error).toBeTruthy();
    expect(parseSalaryInput("").error).toBeNull();
  });

  test("trang /salary: step=100000, ghi chú VNĐ vs USD, từ chối số âm", async () => {
    const ok = await request(app).get("/salary?salary=18500000");
    expect(ok.status).toBe(200);
    expect(ok.text).toContain('step="100000"');
    expect(ok.text).not.toContain('step="1000000"');
    expect(ok.text).toContain("USD");
    expect(ok.text).toContain("Phân vị lương của bạn");

    const neg = await request(app).get("/salary?salary=-25000000");
    expect(neg.status).toBe(200);
    expect(neg.text).not.toContain("Phân vị lương của bạn");
    expect(neg.text).toContain("không được là số âm");
  });

  test("API /api/salary/calculate: salary âm => 400, hợp lệ => evaluation", async () => {
    const bad = await request(app).get("/api/salary/calculate?salary=-1");
    expect(bad.status).toBe(400);
    const decimal = await request(app).get("/api/salary/calculate?salary=25000000.50");
    expect(decimal.status).toBe(400);
    const good = await request(app).get("/api/salary/calculate?position=junior&salary=20000000");
    expect(good.status).toBe(200);
    expect(good.body.evaluation.amount).toBe(20000000);
  });

  test("bảng lộ trình lương nhân hệ số kỹ năng/thành phố", async () => {
    const base = await request(app).get("/salary?position=junior");
    const golang = await request(app).get("/salary?position=junior&skill=golang");
    expect(base.text).toContain("x1.00");
    expect(golang.text).toContain("x1.25");
    // Junior median 20 Tr * 1.25 = 25.0 Tr
    expect(golang.text).toContain("25.0 Tr");
  });
});

describe("QA-M04: Company review", () => {
  async function postReview(cookies, body) {
    const init = await getCsrf("/companies/techcombank", cookies);
    return request(app)
      .post("/companies/techcombank/reviews")
      .set("Cookie", init.cookies)
      .type("form")
      .send({ _csrf: init.csrfToken, rating: "5", ...body });
  }

  test("company-details có maxlength cho title/pros/cons", async () => {
    const { cookies } = await loginCandidate("review.limit@test.com");
    const res = await request(app).get("/companies/techcombank").set("Cookie", cookies);
    expect(res.text).toMatch(/id="reviewTitle"[^>]*maxlength="120"/);
    expect(res.text).toMatch(/id="reviewPros"[^>]*maxlength="2000"/);
    expect(res.text).toMatch(/id="reviewCons"[^>]*maxlength="2000"/);
  });

  test("từ chối review quá dài (không 500)", async () => {
    const { cookies } = await loginCandidate("review.long@test.com");
    const res = await postReview(cookies, { title: "x".repeat(121), pros: "ok", cons: "ok" });
    expect(res.status).toBe(302);
    expect(await Review.countDocuments({ title: "x".repeat(121) })).toBe(0);
    const res2 = await postReview(cookies, { title: "ok", pros: "y".repeat(2001), cons: "" });
    expect(res2.status).toBe(302);
    expect(await Review.countDocuments({ title: "ok" })).toBe(0);
  });

  test("từ thường gặp (nhanh chóng, admin, roadmap, đụng chạm) KHÔNG bị ẩn; từ độc hại bị ẩn", async () => {
    const { cookies } = await loginCandidate("review.words@test.com");
    await postReview(cookies, {
      title: "Quy trình nhanh chóng",
      pros: "admin hỗ trợ tốt, roadmap rõ ràng, không đụng chạm cá nhân",
      cons: "",
    });
    const clean = await Review.findOne({ title: "Quy trình nhanh chóng" });
    expect(clean).toBeTruthy();
    expect(clean.isApproved).toBe(true);

    const { cookies: cookies2 } = await loginCandidate("review.toxic@test.com");
    await postReview(cookies2, { title: "Công ty lừa đảo", pros: "", cons: "vcl" });
    const toxic = await Review.findOne({ title: "Công ty lừa đảo" });
    expect(toxic).toBeTruthy();
    expect(toxic.isApproved).toBe(false);
  });
});

describe("QA-M08 / QA-M15: Gated blog & draft preview", () => {
  beforeAll(async () => {
    await Article.create({
      title: "Bài nháp bí mật",
      slug: "bai-nhap-bi-mat",
      summary: "Tóm tắt",
      content: "<p>Nội dung nháp</p>",
      isPublished: false,
    });
    await Article.create({
      title: "Bài dành riêng cho NTD",
      slug: "bai-ntd-gated",
      summary: "Tóm tắt NTD",
      content: "<p>Nội dung kín</p>",
      targetAudience: "employer",
      isGated: true,
      isPublished: true,
      publishedAt: new Date(),
    });
  });

  test("khách không xem được bài nháp (redirect /blog)", async () => {
    const res = await request(app).get("/blog/bai-nhap-bi-mat");
    expect(res.status).toBe(302);
  });

  test("admin xem trước được bài nháp", async () => {
    const login = await request(app).get("/_dev/login-admin");
    const cookies = login.headers["set-cookie"] || [];
    const res = await request(app).get("/blog/bai-nhap-bi-mat").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.text).toContain("Bài nháp bí mật");
    expect(res.text).toContain("xem trước");
  });

  test("đăng nhập sai vai trò => thông báo sai loại tài khoản thay vì link login", async () => {
    const { cookies } = await loginCandidate("blog.mismatch@test.com");
    const res = await request(app).get("/blog/bai-ntd-gated").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.text).toContain("Sai loại tài khoản");
    expect(res.text).not.toContain("Nội dung kín");
    expect(res.text).not.toContain('href="/employer/login?next=/blog/bai-ntd-gated"');
  });

  test("khách vẫn thấy link đăng nhập NTD", async () => {
    const res = await request(app).get("/blog/bai-ntd-gated");
    expect(res.text).toContain('href="/employer/login?next=/blog/bai-ntd-gated"');
  });

  test("blog list: query lặp không crash & link phân trang mã hóa", async () => {
    const res = await request(app).get("/blog?search=a&search=b&category=x&category=y");
    expect(res.status).toBe(200);
    const src = read("views/pages/blog-list.pug");
    expect(src).toContain("encodeURIComponent(selectedCategory)");
    expect(src).toContain("encodeURIComponent(selectedAudience)");
  });
});

describe("QA-M16 / QA-m05 / QA-B10: Header, mobile & MCP", () => {
  test("MCP notification => 202 không body; batch toàn notification => 202", async () => {
    const res = await request(app)
      .post("/mcp")
      .send({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(res.text).toBe("");

    const batch = await request(app)
      .post("/mcp")
      .send([{ jsonrpc: "2.0", method: "notifications/initialized" }]);
    expect(batch.status).toBe(202);

    const normal = await request(app).post("/mcp").send({ jsonrpc: "2.0", id: 7, method: "ping" });
    expect(normal.status).toBe(200);
    expect(normal.body.id).toBe(7);
  });

  test("header guest: pill AI dùng ?keyword=AI, không còn skill=aiengineer", async () => {
    const res = await request(app).get("/");
    expect(res.text).toContain("/search?keyword=AI");
    expect(res.text).not.toContain("skill=aiengineer");
  });

  test("header candidate: dropdown mobile-safe + mobile nav đủ link + trigger bàn phím", async () => {
    const { cookies } = await loginCandidate("header.cand@test.com");
    const res = await request(app).get("/").set("Cookie", cookies);
    expect(res.text).toContain("fixed left-3 right-3 top-[64px] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:w-[340px]");
    const mobile = res.text.slice(res.text.indexOf('id="mobileNav"'));
    expect(mobile).toContain("/candidate/followed-companies");
    expect(mobile).toContain("/candidate/job-alerts");
    expect(mobile).toContain("/candidate/change-password");
    expect(res.text).toContain("user-dropdown-trigger");
  });

  test("header employer owner thấy link Team (desktop & mobile)", async () => {
    const { cookies } = await loginEmployer("header.owner@test.com");
    const res = await request(app).get("/").set("Cookie", cookies);
    expect(res.text.match(/href="\/employer\/team"/g).length).toBe(2);
    const mobile = res.text.slice(res.text.indexOf('id="mobileNav"'));
    expect(mobile).toContain("/employer/analytics");
    expect(mobile).toContain("/employer/candidates");
  });

  test("header ẩn link Team cho recruiter sub-account (template)", () => {
    const html = pug.renderFile(path.join(__dirname, "..", "views/partials/header.pug"), {
      basedir: path.join(__dirname, "..", "views"),
      currentUser: {
        companyName: "ACME",
        currentMember: { fullName: "HR Một", role: "recruiter" },
      },
      role: "employer",
      csrfToken: "t",
      menuData: {},
      unreadNotificationCount: 0,
    });
    expect(html).not.toContain('href="/employer/team"');
    expect(html).toContain('href="/employer/analytics"');
    const admin = pug.renderFile(path.join(__dirname, "..", "views/partials/header.pug"), {
      basedir: path.join(__dirname, "..", "views"),
      currentUser: { companyName: "ACME", currentMember: { fullName: "HR Admin", role: "admin" } },
      role: "employer",
      csrfToken: "t",
      menuData: {},
      unreadNotificationCount: 0,
    });
    expect(admin).toContain('href="/employer/team"');
  });

  test("style.css hỗ trợ :focus-within & .is-open cho dropdown", () => {
    const css = read("public/assets/css/style.css");
    expect(css).toContain(".menu ul li:focus-within > ul");
    expect(css).toContain(".menu ul li.is-open > ul");
  });

  test("/sitemap.xml & /api không set cookie CSRF", async () => {
    const res = await request(app).get("/sitemap.xml");
    expect(res.status).toBe(200);
    const cookies = (res.headers["set-cookie"] || []).join(";");
    expect(cookies).not.toContain("itj_csrf");
  });
});

describe("QA-P07 / QA-P06 / QA-m01: 500 page, widget & flash", () => {
  test("views/pages/500.pug render đồng bộ giao diện 404", () => {
    const html = pug.renderFile(path.join(__dirname, "..", "views/pages/500.pug"), {
      basedir: path.join(__dirname, "..", "views"),
      title: "500",
      message: "boom <b>",
      flash: {},
      csrfToken: "t",
      menuData: {},
    });
    expect(html).toContain("500");
    expect(html).toContain("Quay về Trang chủ");
    expect(html).toContain("boom &lt;b&gt;");
  });

  test("feedback widget: Escape, click ngoài, hủy timer 2.2s, reset sao, maxlength", () => {
    const src = read("views/partials/feedback-widget.pug");
    expect(src).toContain('e.key === "Escape"');
    expect(src).toContain("e.target === modal");
    expect(src).toContain("clearTimeout(successTimer)");
    expect(src).toContain("resetStars");
    expect(src).toContain('maxlength="3000"');
    expect(src).toContain('maxlength="150"');
  });

  test.each([
    "contact", "search", "job-details", "company-list", "company-details",
    "salary-benchmark", "blog-list", "blog-details", "docs", "about", "privacy",
  ])("pages/%s không có khối `if flash` trùng với layout", (name) => {
    expect(read(`views/pages/${name}.pug`)).not.toMatch(/if flash/);
  });

  test("tất cả view đã chạm biên dịch được", () => {
    const files = [
      "views/pages/job-details.pug", "views/pages/search.pug", "views/pages/company-list.pug",
      "views/pages/company-details.pug", "views/pages/salary-benchmark.pug", "views/pages/blog-list.pug",
      "views/pages/blog-details.pug", "views/pages/contact.pug", "views/pages/404.pug",
      "views/pages/500.pug", "views/pages/docs.pug", "views/partials/header.pug",
      "views/partials/feedback-widget.pug", "views/partials/section1.pug",
    ];
    files.forEach((f) => {
      expect(() => pug.compileFile(path.join(__dirname, "..", f), { basedir: path.join(__dirname, "..", "views") })).not.toThrow();
    });
  });
});

describe("QA-B06 / QA-M02 / QA-B11 / QA-m09 / QA-P04: Client JS", () => {
  const main = read("public/assets/js/main.js");
  const ai = read("public/assets/js/ai-features.js");

  test("bookmark fetch gửi Accept/X-Requested-With/csrf + đồng bộ mọi nút + redirect login", () => {
    expect(main).toContain('Accept: "application/json"');
    expect(main).toContain('"X-Requested-With": "XMLHttpRequest"');
    expect(main).toContain('"x-csrf-token": csrfToken');
    expect(main).toContain(".btn-bookmark-job");
    expect(main).toContain("applyBookmarkState");
    expect(main).toContain("/candidate/login?next=");
  });

  test("notification: keepalive + bỏ qua polling khi tab ẩn", () => {
    expect(main).toContain("keepalive: true");
    expect(main).toContain("if (document.hidden) return;");
  });

  test("follow công ty gửi headers & xử lý 401/403", () => {
    const view = read("views/pages/company-details.pug");
    expect(view).toContain("'Accept': 'application/json'");
    expect(view).toContain("'X-Requested-With': 'XMLHttpRequest'");
    expect(view).toContain("res.status === 401 || res.status === 403");
  });

  test("modalAiInterview: mọi nhánh đóng đều reset body overflow", () => {
    const block = ai.slice(ai.indexOf("window.initAiInterviewPrep"), ai.indexOf("async function loadQuestions"));
    expect(block).toContain("function closeInterviewModal()");
    expect(block).toMatch(/closeInterviewModal\(\)[\s\S]*document\.body\.style\.overflow = ''/);
    expect(block).toContain("closeBtn.addEventListener('click', closeInterviewModal)");
    expect(block).toContain("e.target === modal");
    expect(block).toContain("e.key === 'Escape'");
  });

  test("Market Insights chống bắn 2 request", () => {
    expect(ai).toContain("__aiMarketInsightsLoading");
  });

  test("JS hợp lệ cú pháp", () => {
    expect(() => new Function(main)).not.toThrow();
    expect(() => new Function(ai)).not.toThrow();
  });
});

describe("QA-m08 / QA-m10 / QA-m12: Cards, maps, MCP formatting, docs sync", () => {
  test("googleMaps: city khac không nối ', Khác'", () => {
    const data = getCompanyMapData({ companyName: "ACME", address: "12 Lê Lợi", city: "khac" });
    expect(data.fullAddress).toBe("12 Lê Lợi");
    expect(data.fullAddress).not.toContain("Khác");
  });

  test("aiTools dùng formatSalary: lương thỏa thuận không in null$", async () => {
    const out = await executeTool("search_jobs", { keyword: "Backend Engineer 0" });
    const text = JSON.stringify(out);
    expect(text).not.toContain("null$");
    expect(text).toContain("Thương lượng");
  });

  test("getJobDetails an toàn khi employer bị xóa", async () => {
    const { getJobDetails } = require("../src/services/job.service");
    const orphan = await Job.create({
      employerId: new mongoose.Types.ObjectId(),
      title: "Orphan Job",
      slug: "orphan-job",
      position: "junior",
      workingForm: "office",
      city: "ha-noi",
      employerActive: true,
      moderation: JOB_MODERATION.VISIBLE,
    });
    await expect(getJobDetails(orphan.slug)).resolves.toBeNull();
    const res = await request(app).get("/jobs/orphan-job");
    expect(res.status).toBe(404);
  });

  test("job card đầy đủ field (position/workingForm/benefits) ở /salary", async () => {
    const res = await request(app).get("/salary?position=middle");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Backend Engineer");
  });

  test("docs / llms / openapi đồng bộ 6 MCP tools & schema salary", () => {
    const names = ["search_jobs", "get_job_details", "get_company_details", "calculate_salary", "list_companies", "get_platform_info"];
    const docs = read("views/pages/docs.pug");
    const llms = read("public/llms.txt");
    const full = read("public/llms-full.txt");
    names.forEach((n) => {
      expect(docs).toContain(n);
      expect(llms).toContain(n);
      expect(full).toContain(n);
    });
    const openapi = JSON.parse(read("public/openapi.json"));
    const props = openapi.components.schemas.SalaryCalculateResponse.properties;
    expect(props.stats).toBeTruthy();
    expect(props.evaluation).toBeTruthy();
    expect(props.data).toBeUndefined();
    expect(openapi.components.schemas.FeedbackSubmitRequest.properties.type.enum).toContain("contact");
    expect(openapi.paths["/mcp"].post.responses["202"]).toBeTruthy();
  });

  test("bin/cli.js đọc data.stats / data.evaluation", () => {
    const cli = read("bin/cli.js");
    expect(cli).toContain("data.stats");
    expect(cli).toContain("data.evaluation");
    expect(cli).not.toContain("data.data");
  });

  test("/docs markdown liệt kê 6 tools", async () => {
    const res = await request(app).get("/docs").set("Accept", "text/markdown");
    expect(res.status).toBe(200);
    expect(res.text).toContain("get_company_details");
  });
});
