// tests/ai.test.js
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const aiService = require("../src/services/ai.service");
const { Employer, Job } = require("../src/models");
const { EMPLOYER_STATUS, JOB_MODERATION } = require("../src/config/constants");

let mongoServer;
let testJob;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const employer = await Employer.create({
    companyName: "Google Tech Vietnam",
    slug: "google-tech-vietnam",
    email: "hr@googlevn.com",
    password: "Password123@",
    city: "ho-chi-minh",
    status: EMPLOYER_STATUS.ACTIVE,
  });

  testJob = await Job.create({
    employerId: employer._id,
    title: "Senior NodeJS & Cloud Engineer",
    slug: "senior-nodejs-cloud-engineer",
    salaryMin: 2000,
    salaryMax: 3500,
    position: "senior",
    workingForm: "flexible",
    skills: [{ name: "NodeJS", slug: "nodejs" }, { name: "Docker", slug: "docker" }],
    city: "ho-chi-minh",
    description: "<p>Phát triển hệ thống Microservices quy mô lớn trên nền tảng AWS và NodeJS.</p>",
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
  });
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});

describe("Hệ thống Trí Tuệ Nhân Tạo (VN.ITJobs AI Suite)", () => {
  test("Feature 1: matchCvWithJob - So khớp CV và phát hiện kỹ năng", async () => {
    const cvSample = `
      Lê Văn An - Backend Developer
      Kỹ năng chuyên môn: NodeJS, ExpressJS, MongoDB, RESTful API, Git.
      Kinh nghiệm 4 năm xây dựng API backend chịu tải cao.
    `;

    const result = await aiService.matchCvWithJob(cvSample, testJob);
    expect(result).toBeDefined();
    expect(typeof result.matchScore).toBe("number");
    expect(result.matchScore).toBeGreaterThanOrEqual(0);
    expect(result.matchScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.matchedSkills)).toBe(true);
    expect(Array.isArray(result.advice)).toBe(true);
  });

  test("Feature 2: generateInterviewPrep - Sinh câu hỏi phỏng vấn theo vị trí", async () => {
    const questions = await aiService.generateInterviewPrep(testJob);
    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBeGreaterThanOrEqual(4);
    expect(questions[0]).toHaveProperty("question");
    expect(questions[0]).toHaveProperty("type");
    expect(questions[0]).toHaveProperty("suggestedAnswer");
  });

  test("Feature 3: generateJobDescription - Sinh bản mô tả việc làm (JD)", async () => {
    const jd = await aiService.generateJobDescription({
      title: "Chuyên viên ReactJS Frontend",
      position: "middle",
      skills: [{ name: "ReactJS" }, { name: "TailwindCSS" }],
      workingForm: "office",
      city: "ha-noi",
    });

    expect(jd).toBeDefined();
    expect(jd.title).toContain("ReactJS");
    expect(jd.descriptionHtml).toBeDefined();
    expect(jd.descriptionHtml.length).toBeGreaterThan(50);
  });

  test("Feature 4: screenAndSummarizeCv - Tóm tắt và xếp hạng CV ứng viên", async () => {
    const cvSample = "Nguyễn Văn B, 3 năm làm NodeJS và Docker, tự tin xử lý kiến trúc hệ thống.";
    const screen = await aiService.screenAndSummarizeCv(cvSample, testJob);

    expect(screen).toBeDefined();
    expect(typeof screen.matchScore).toBe("number");
    expect(typeof screen.executiveSummary).toBe("string");
    expect(Array.isArray(screen.strengths)).toBe(true);
    expect(["hire_interview", "consider", "reject"]).toContain(screen.recommendation);
  });

  test("Feature 5: moderateJobContent - Quét an toàn và phát hiện từ khóa lừa đảo", async () => {
    // Tin sạch
    const safeJob = {
      title: "Java Backend Developer",
      description: "Lập trình ứng dụng ngân hàng Spring Boot, lương thưởng minh bạch theo năng lực.",
      companyName: "FPT Software",
      salary: "1500$ - 2500$",
    };
    const safeRes = await aiService.moderateJobContent(safeJob);
    expect(safeRes.isSafe).toBe(true);
    expect(safeRes.riskLevel).toBe("safe");

    // Tin có dấu hiệu rủi ro/lừa đảo
    const scamJob = {
      title: "Việc nhẹ lương cao tuyển gấp",
      description: "Cần nạp tiền cọc 500k để nhận tài liệu dự án, nhận lương trong ngày theo hoa hồng cược.",
      companyName: "Công ty Đầu Tư Ảo",
      salary: "5000$",
    };
    const scamRes = await aiService.moderateJobContent(scamJob);
    expect(scamRes.isSafe).toBe(false);
    expect(["warning", "danger"]).toContain(scamRes.riskLevel);
    expect(scamRes.flags.length).toBeGreaterThan(0);
  });

  test("Feature 6: generateMarketInsights - Báo cáo xu hướng thị trường IT", async () => {
    const insights = await aiService.generateMarketInsights({
      totalJobs: 25,
      totalEmployers: 10,
      topSkillsList: "ReactJS, NodeJS, Golang, AWS",
    });

    expect(insights).toBeDefined();
    expect(Array.isArray(insights.hotSkills)).toBe(true);
    expect(typeof insights.salaryTrends).toBe("string");
    expect(typeof insights.hiringDemand).toBe("string");
  });

  test("Tiện ích extractTextFromPdf - Xử lý an toàn khi buffer không hợp lệ", async () => {
    const textEmpty = await aiService.extractTextFromPdf(null);
    expect(textEmpty).toBe("");

    const textInvalid = await aiService.extractTextFromPdf(Buffer.from("invalid-pdf-content"));
    expect(textInvalid).toBe("");
  });

  test("CSRF Protection: POST /api/ai/interview-prep bị chặn nếu thiếu CSRF token", async () => {
    const res = await request(app)
      .post("/api/ai/interview-prep")
      .send({ jobId: testJob._id });
    
    // Bị chặn bảo mật CSRF
    expect([403, 302]).toContain(res.status);
  });
});
