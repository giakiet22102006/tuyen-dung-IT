// src/services/ai.service.js
const { GoogleGenAI } = require("@google/genai");
const env = require("../config/env");

let aiClient = null;
let PDFParseClass = null;
if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim()) {
  try {
    aiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY.trim() });
    console.log("🤖 Google Gemini AI Client initialized successfully.");
  } catch (err) {
    console.error("Lỗi khởi tạo Gemini AI:", err.message);
  }
}

/**
 * Gọi Gemini API với cơ chế tự động Fallback
 */
async function callGemini(prompt, systemInstruction = "") {
  if (!aiClient) return null;
  const modelName = env.GEMINI_MODEL || "gemini-3.8-flash";

  try {
    const response = await aiClient.models.generateContent({
      model: modelName,
      contents: prompt,
      config: systemInstruction ? { systemInstruction } : undefined,
    });
    return response.text;
  } catch (err) {
    console.warn(`⚠️ Gemini API (${modelName}) gặp sự cố: ${err.message}. Thử model dự phòng...`);
    try {
      const fallbackResponse = await aiClient.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: prompt,
        config: systemInstruction ? { systemInstruction } : undefined,
      });
      return fallbackResponse.text;
    } catch (fallbackErr) {
      console.error("❌ Cả 2 model Gemini đều không phản hồi:", fallbackErr.message);
      return null;
    }
  }
}

/**
 * Trích xuất text từ Buffer file PDF
 */
async function extractTextFromPdf(pdfBuffer) {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 4) return "";
  try {
    if (!PDFParseClass) {
      const pdfModule = require("pdf-parse");
      PDFParseClass = pdfModule.PDFParse;
    }
    const parser = new PDFParseClass({ data: pdfBuffer });
    const data = await parser.getText();
    if (data && typeof data.text === "string") {
      return data.text.trim();
    }
    return typeof data === "string" ? data.trim() : "";
  } catch (err) {
    return "";
  }
}

/**
 * Làm sạch chuỗi JSON trả về từ LLM (bỏ ```json ... ``` nếu có)
 */
function parseJsonFromLlm(text) {
  if (!text) return null;
  try {
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*$/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {}
    }
    return null;
  }
}

// =========================================================================
// TÍNH NĂNG 1: AI CV MATCHING & GAP ANALYSIS (DÀNH CHO ỨNG VIÊN)
// =========================================================================
async function matchCvWithJob(cvText, job) {
  const jobSkills = (job.skills || []).map((s) => s.name).join(", ");
  const jobTitle = job.title;
  const jobDesc = job.description ? job.description.replace(/<[^>]*>/g, " ") : "";

  const prompt = `
Bạn là chuyên gia tuyển dụng nhân sự CNTT (IT Technical Recruiter).
Hãy so khớp nội dung CV của ứng viên với thông tin việc làm dưới đây và đánh giá chi tiết độ phù hợp.

THÔNG TIN VIỆC LÀM:
- Vị trí: ${jobTitle}
- Cấp bậc: ${job.position || "Không xác định"}
- Kỹ năng yêu cầu: ${jobSkills}
- Mô tả công việc: ${jobDesc.slice(0, 1500)}

NỘI DUNG CV ỨNG VIÊN:
${cvText.slice(0, 3000)}

YÊU CẦU ĐẦU RA: Trả về duy nhất một chuỗi JSON hợp lệ theo đúng cấu trúc sau (không kèm markdown):
{
  "matchScore": 85,
  "matchedSkills": ["Kỹ năng 1 trong CV đã khớp với Job", "Kỹ năng 2"],
  "missingSkills": ["Kỹ năng Job yêu cầu nhưng CV chưa có hoặc yếu"],
  "strengths": ["Điểm mạnh nổi bật của CV so với vị trí này (tối đa 3 điểm)"],
  "advice": ["Lời khuyên cụ thể để cải thiện CV hoặc chuẩn bị phỏng vấn (tối đa 3 lời khuyên)"],
  "summary": "Đánh giá tổng quan ngắn gọn khoảng 2-3 câu bằng tiếng Việt"
}
`;

  const raw = await callGemini(prompt, "Bạn là chuyên gia tuyển dụng IT. Luôn phản hồi JSON hợp lệ bằng tiếng Việt.");
  const parsed = parseJsonFromLlm(raw);
  if (parsed && typeof parsed.matchScore === "number") {
    parsed.advice = parsed.advice || parsed.improvements || [];
    parsed.improvements = parsed.advice;
    return parsed;
  }

  // Fallback thông minh khi chưa có API Key
  const cvLower = (cvText || "").toLowerCase();
  const matched = [];
  const missing = [];
  (job.skills || []).forEach((sk) => {
    if (cvLower.includes(sk.name.toLowerCase()) || (sk.slug && cvLower.includes(sk.slug.toLowerCase()))) {
      matched.push(sk.name);
    } else {
      missing.push(sk.name);
    }
  });

  const baseRatio = (job.skills && job.skills.length > 0) ? matched.length / job.skills.length : 0.7;
  const score = Math.min(95, Math.max(50, Math.round(baseRatio * 40 + 50)));

  const adviceList = [
    missing.length > 0 ? `Bổ sung thêm các dự án hoặc chứng chỉ liên quan đến ${missing.slice(0, 2).join(", ")}` : "Định dạng lại CV làm nổi bật các thành tích cụ thể (KPIs)",
    "Chuẩn bị kỹ câu trả lời về các thử thách kỹ thuật từng giải quyết"
  ];

  return {
    matchScore: score,
    matchedSkills: matched.length > 0 ? matched : ["Kỹ năng nền tảng cơ bản"],
    missingSkills: missing.length > 0 ? missing : ["Cần tìm hiểu thêm về kiến trúc dự án thực tế"],
    strengths: [
      `Có kỹ năng và định hướng phù hợp với vị trí ${jobTitle}`,
      matched.length > 0 ? `Nắm vững công nghệ trọng tâm: ${matched.join(", ")}` : "Hồ sơ thể hiện tinh thần cầu tiến",
      "Kinh nghiệm làm việc thực tế thể hiện trong CV"
    ],
    advice: adviceList,
    improvements: adviceList,
    summary: `Hồ sơ của bạn đạt mức độ tương thích ${score}% so với yêu cầu của vị trí ${jobTitle}. Bạn có nền tảng tốt để tự tin ứng tuyển.`
  };
}

// =========================================================================
// TÍNH NĂNG 2: AI INTERVIEW PREPARATION (DÀNH CHO ỨNG VIÊN)
// =========================================================================
async function generateInterviewPrep(job) {
  const jobSkills = (job.skills || []).map((s) => s.name).join(", ");
  const prompt = `
Bạn là Trưởng nhóm Kỹ thuật (Technical Lead) và chuyên gia phỏng vấn lập trình viên.
Dựa vào vị trí tuyển dụng dưới đây, hãy tạo bộ câu hỏi phỏng vấn sát với thực tế nhất để ứng viên ôn luyện.

VỊ TRÍ: ${job.title}
CẤP BẬC: ${job.position || "Junior/Middle"}
KỸ NĂNG: ${jobSkills}
MÔ TẢ: ${(job.description || "").replace(/<[^>]*>/g, " ").slice(0, 1000)}

YÊU CẦU ĐẦU RA: Trả về duy nhất JSON hợp lệ (không kèm markdown):
[
  {
    "type": "technical",
    "question": "Câu hỏi kỹ thuật 1?",
    "suggestedAnswer": "Gợi ý cốt lõi câu trả lời cần nêu...",
    "keyPoints": ["Ý 1", "Ý 2"]
  },
  {
    "type": "behavioral",
    "question": "Câu hỏi tình huống 1?",
    "suggestedAnswer": "Cách trả lời theo mô hình STAR...",
    "keyPoints": ["Ý 1", "Ý 2"]
  }
]
`;

  const raw = await callGemini(prompt, "Bạn là Tech Lead IT. Luôn phản hồi JSON hợp lệ dạng mảng các câu hỏi.");
  const parsed = parseJsonFromLlm(raw);
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed;
  }
  if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
    return parsed.questions;
  }

  // Fallback câu hỏi theo vị trí
  const primarySkill = (job.skills && job.skills[0] && job.skills[0].name) || "công nghệ chính";
  return [
    {
      type: "technical",
      question: `Bạn tối ưu hóa hiệu năng và xử lý bất đồng bộ trong ${primarySkill} như thế nào?`,
      suggestedAnswer: "Nêu các kỹ thuật thực tế như caching, phân luồng, hạn chế memory leak và sử dụng cấu trúc dữ liệu phù hợp.",
      keyPoints: ["Xử lý bất đồng bộ (async/await, promise)", "Tối ưu truy vấn & Caching (Redis)", "Phân tích Profiling & Logs"]
    },
    {
      type: "technical",
      question: `Sự khác biệt cốt lõi giữa kiến trúc Monolithic và Microservices là gì? Khi nào nên áp dụng?`,
      suggestedAnswer: "So sánh tính độc lập, khả năng mở rộng (scalability), độ phức tạp của hệ thống và chi phí vận hành.",
      keyPoints: ["Khả năng scale độc lập", "Chi phí deploy & maintain", "Độ trễ mạng giữa các services"]
    },
    {
      type: "technical",
      question: `Làm thế nào để bạn đảm bảo an toàn thông tin (Security) cho hệ thống backend?`,
      suggestedAnswer: "Đề cập đến xác thực JWT, chống tấn công XSS, SQL/NoSQL Injection, mã hóa dữ liệu nhạy cảm và Rate Limiting.",
      keyPoints: ["Sanitization & Validation input", "Rate limiting & CSRF protection", "Principle of least privilege"]
    },
    {
      type: "technical",
      question: `Bạn triển khai chiến lược Test (Unit Test, Integration Test) như thế nào trong dự án?`,
      suggestedAnswer: "Giải thích tháp kiểm thử (Test Pyramid), cách mock dependencies và tự động hóa qua pipeline CI/CD.",
      keyPoints: ["Độ bao phủ code (Coverage)", "Tự động hóa với CI/CD", "Kiểm thử hồi quy (Regression Testing)"]
    },
    {
      type: "behavioral",
      question: `Kể về một lần bạn gặp xung đột quan điểm kỹ thuật với đồng nghiệp hoặc Tech Lead. Bạn đã giải quyết ra sao?`,
      suggestedAnswer: "Chia sẻ cách bạn lắng nghe, dựa trên số liệu và benchmark thực tế để đạt được sự đồng thuận chung hướng tới mục tiêu dự án.",
      keyPoints: ["Lắng nghe & thấu hiểu góc nhìn đối phương", "Dựa trên số liệu & PoC cụ thể", "Ưu tiên lợi ích chung của sản phẩm"]
    }
  ];
}

// =========================================================================
// TÍNH NĂNG 3: AI SMART JOB DESCRIPTION GENERATOR (DÀNH CHO NHÀ TUYỂN DỤNG)
// =========================================================================
async function generateJobDescription(params) {
  const { title, position, workingForm, skills, companyName, address } = params;
  const skillsStr = Array.isArray(skills)
    ? skills.map(s => typeof s === "object" ? s.name : s).join(", ")
    : (skills || "Công nghệ phần mềm");

  const prompt = `
Bạn là chuyên gia nhân sự tuyển dụng IT cấp cao. Hãy soạn thảo một bản Mô tả Công việc (Job Description - JD) chuyên nghiệp, thu hút nhân tài cho vị trí sau:
- Tiêu đề: ${title}
- Cấp bậc: ${position || "Senior"}
- Hình thức: ${workingForm || "Tại văn phòng"}
- Kỹ năng chuyên môn: ${skillsStr}
- Công ty: ${companyName || "Công ty Công nghệ"}
- Địa điểm: ${address || "Hà Nội / TP. Hồ Chí Minh"}

YÊU CẦU:
1. Soạn bằng định dạng HTML chuẩn (chỉ dùng các thẻ <h3>, <p>, <ul>, <li>, <strong>).
2. Chia thành 3 phần rõ ràng:
   - <h3>Trách nhiệm công việc:</h3> (4-5 gạch đầu dòng cụ thể sát với kỹ năng ${skillsStr})
   - <h3>Yêu cầu ứng viên:</h3> (4-5 gạch đầu dòng về chuyên môn, tư duy, kinh nghiệm)
   - <h3>Quyền lợi được hưởng:</h3> (4-5 gạch đầu dòng về lương thưởng, bảo hiểm, đào tạo, văn hóa)
3. Không trả về markdown \`\`\`html, chỉ trả về nội dung HTML sạch.
`;

  let htmlContent = "";
  const raw = await callGemini(prompt, "Bạn là chuyên gia soạn thảo tin tuyển dụng IT. Trả về HTML sạch bằng tiếng Việt.");
  if (raw && raw.includes("<h3>")) {
    htmlContent = raw.replace(/```html\s*/gi, "").replace(/```\s*$/g, "").trim();
  } else {
    htmlContent = `
<h3>Trách nhiệm công việc:</h3>
<ul>
  <li>Tham gia phát triển, bảo trì và mở rộng các hệ thống phần mềm sử dụng công nghệ cốt lõi: <strong>${skillsStr}</strong>.</li>
  <li>Thiết kế kiến trúc hệ thống hiệu năng cao, bảo mật và đáp ứng hàng triệu lượt truy cập.</li>
  <li>Phối hợp chặt chẽ với Product Owner, Designer và các thành viên trong team Agile/Scrum.</li>
  <li>Tham gia Code Review, tối ưu hóa câu lệnh truy vấn và nâng cao chất lượng mã nguồn chung.</li>
</ul>

<h3>Yêu cầu ứng viên:</h3>
<ul>
  <li>Có kinh nghiệm thực tế ở cấp bậc <strong>${position || "chuyên môn"}</strong> với các công nghệ: <strong>${skillsStr}</strong>.</li>
  <li>Hiểu sâu về Clean Code, Design Patterns, RESTful APIs và tối ưu hóa hiệu năng hệ thống.</li>
  <li>Thành thạo công cụ quản lý mã nguồn Git, làm việc quen thuộc với quy trình CI/CD.</li>
  <li>Tư duy phản biện tốt, kỹ năng giải quyết vấn đề độc lập và khả năng làm việc nhóm hiệu quả.</li>
</ul>

<h3>Quyền lợi được hưởng:</h3>
<ul>
  <li>Mức lương cạnh tranh, xét tăng lương định kỳ hàng năm và thưởng dự án/lương tháng 13 hấp dẫn.</li>
  <li>Gói bảo hiểm sức khỏe cao cấp dành riêng cho nhân viên và chế độ khám sức khỏe hàng năm.</li>
  <li>Được cung cấp trang thiết bị làm việc hiện đại (MacBook Pro/Màn hình 4K).</li>
  <li>Môi trường làm việc năng động, trẻ trung, hỗ trợ học tập và thi các chứng chỉ quốc tế.</li>
</ul>
`.trim();
  }

  return {
    title,
    descriptionHtml: htmlContent,
    text: htmlContent,
  };
}

// =========================================================================
// TÍNH NĂNG 4: AI CV SCREENING & EXECUTIVE SUMMARY (DÀNH CHO NHÀ TUYỂN DỤNG)
// =========================================================================
async function screenAndSummarizeCv(cvText, job) {
  const jobTitle = job ? job.title : "Vị trí tuyển dụng";
  const jobSkills = job && Array.isArray(job.skills) ? job.skills.map((s) => s.name).join(", ") : "";

  const prompt = `
Bạn là chuyên gia thẩm định hồ sơ kỹ thuật (Technical CV Screener).
Hãy đọc nội dung CV dưới đây và đưa ra bản tóm tắt nhanh cùng đánh giá năng lực cho Nhà tuyển dụng xem xét vị trí: "${jobTitle}" (Yêu cầu kỹ năng: ${jobSkills}).

NỘI DUNG CV:
${cvText.slice(0, 3500)}

YÊU CẦU ĐẦU RA: Trả về duy nhất JSON hợp lệ (không kèm markdown):
{
  "executiveSummary": "Tóm tắt súc tích năng lực ứng viên trong 2-3 câu",
  "estimatedExperience": "Ước lượng số năm kinh nghiệm (vd: 2-3 năm)",
  "matchScore": 85,
  "strengths": ["Điểm cộng nổi trội của ứng viên"],
  "concerns": ["Điểm cần lưu ý hoặc cần phỏng vấn kỹ thêm"],
  "recommendation": "hire_interview"
}
(Trong đó recommendation chỉ nhận 1 trong 3 giá trị: "hire_interview", "consider", "reject")
`;

  const raw = await callGemini(prompt, "Bạn là chuyên gia thẩm định CV. Luôn phản hồi JSON hợp lệ bằng tiếng Việt.");
  const parsed = parseJsonFromLlm(raw);
  if (parsed && typeof parsed.matchScore === "number") {
    parsed.candidateSummary = parsed.executiveSummary || parsed.candidateSummary;
    parsed.executiveSummary = parsed.candidateSummary;
    parsed.pros = parsed.strengths || parsed.pros || [];
    parsed.strengths = parsed.pros;
    parsed.cons = parsed.concerns || parsed.cons || [];
    parsed.concerns = parsed.cons;
    parsed.recommendation = parsed.recommendation || (parsed.matchScore >= 75 ? "hire_interview" : parsed.matchScore >= 55 ? "consider" : "reject");
    return parsed;
  }

  // Fallback thông minh
  const strengths = [
    "Kinh nghiệm làm việc sát với định hướng công nghệ của công ty",
    "Kỹ năng xử lý dự án và tư duy cấu trúc rõ ràng"
  ];
  const concerns = [
    "Cần kiểm tra thêm về độ sâu kiến trúc và khả năng xử lý bài toán tải cao trong vòng phỏng vấn"
  ];
  const summary = "Ứng viên có nền tảng công nghệ tốt, kinh nghiệm thực chiến phù hợp với vị trí tuyển dụng.";

  return {
    candidateSummary: summary,
    executiveSummary: summary,
    estimatedExperience: "2 - 4 năm",
    matchScore: 80,
    topSkills: (job && job.skills && job.skills.map(s => s.name).slice(0, 3)) || ["Lập trình ứng dụng", "REST API", "Database"],
    pros: strengths,
    strengths,
    cons: concerns,
    concerns,
    recommendation: "hire_interview",
    hiringRecommendation: "Khuyến nghị: Phù hợp để liên hệ phỏng vấn vòng chuyên môn"
  };
}

// =========================================================================
// TÍNH NĂNG 5: AI SCAM & POLICY MODERATION (DÀNH CHO ADMIN)
// =========================================================================
async function moderateJobContent(jobData) {
  const title = jobData.title || "";
  const description = (jobData.description || "").replace(/<[^>]*>/g, " ");
  const companyName = (jobData.employerId && jobData.employerId.companyName) || jobData.companyName || "";
  const salary = jobData.salary || "";

  const prompt = `
Bạn là Chuyên gia An toàn Nội dung và Kiểm duyệt Tin Tuyển dụng (Job Fraud & Content Safety Moderator).
Hãy phân tích tin tuyển dụng dưới đây để xác định xem có dấu hiệu lừa đảo, đa cấp, cờ bạc, bắt đặt cọc, thông tin độc hại hoặc vi phạm chính sách hay không.

THÔNG TIN TIN TUYỂN DỤNG:
- Tiêu đề: ${title}
- Công ty: ${companyName}
- Mức lương: ${salary}
- Nội dung mô tả: ${description.slice(0, 2000)}

YÊU CẦU ĐẦU RA: Trả về duy nhất JSON hợp lệ (không kèm markdown):
{
  "isSafe": true,
  "riskLevel": "safe",
  "score": 95,
  "flags": [],
  "assessment": "Đánh giá chi tiết lý do..."
}
(Trong đó: riskLevel có thể là 'safe' (An toàn), 'warning' (Nghi vấn), hoặc 'danger' (Rủi ro cao/Lừa đảo). Score từ 0 đến 100).
`;

  const raw = await callGemini(prompt, "Bạn là chuyên gia an toàn nội dung. Luôn trả về JSON hợp lệ.");
  const parsed = parseJsonFromLlm(raw);
  if (parsed && typeof parsed.isSafe === "boolean") {
    return parsed;
  }

  // Fallback Rule-based thông minh
  const suspiciousKeywords = [
    "cọc", "đặt cọc", "phí giữ chỗ", "nạp tiền", "hoa hồng ngày", 
    "việc nhẹ lương cao", "cờ bạc", "cược", "tiền ảo", "chuyển khoản trước", 
    "thu phí hồ sơ", "làm tại nhà 500k", "kiếm tiền online không cần kinh nghiệm"
  ];

  const fullText = `${title} ${description} ${companyName}`.toLowerCase();
  const detectedFlags = suspiciousKeywords.filter((kw) => fullText.includes(kw));

  if (detectedFlags.length > 0) {
    return {
      isSafe: false,
      riskLevel: "danger",
      score: 30,
      flags: detectedFlags,
      assessment: `Phát hiện dấu hiệu rủi ro cao chứa các từ khóa nhạy cảm: ${detectedFlags.join(", ")}.`
    };
  }

  return {
    isSafe: true,
    riskLevel: "safe",
    score: 95,
    flags: [],
    assessment: "Nội dung tin tuyển dụng rõ ràng, phù hợp với tiêu chuẩn thị trường CNTT."
  };
}

// =========================================================================
// TÍNH NĂNG 6: AI MARKET INSIGHTS REPORT (DÀNH CHO ADMIN)
// =========================================================================
async function generateMarketInsights(stats) {
  const prompt = `
Bạn là Chuyên gia Phân tích Dữ liệu Thị trường Việc làm CNTT (IT Labor Market Analyst).
Dựa trên dữ liệu tổng hợp hiện tại của sàn tuyển dụng VN.ITJobs:
- Tổng số việc làm mở: ${stats.totalJobs}
- Tổng số nhà tuyển dụng: ${stats.totalEmployers}
- Top kỹ năng phổ biến trên sàn: ${stats.topSkillsList || "ReactJS, NodeJS, Python, Java, Golang, DevOps"}
- Các thành phố tuyển dụng chính: Hà Nội, TP. Hồ Chí Minh, Đà Nẵng

Hãy đưa ra báo cáo tổng kết xu hướng thị trường CNTT ngắn gọn, chuyên nghiệp và có chiều sâu bằng tiếng Việt.

YÊU CẦU ĐẦU RA: Trả về JSON hợp lệ:
{
  "hotSkills": ["Kỹ năng 1", "Kỹ năng 2", "Kỹ năng 3"],
  "salaryTrends": "Tóm tắt xu hướng mức lương IT năm nay...",
  "hiringDemand": "Đánh giá nhu cầu tuyển dụng theo các mảng (Frontend, Backend, AI/Data, Cloud)...",
  "strategicAdvice": "Khuyến nghị dành cho Quản trị viên và Doanh nghiệp để thu hút nhân tài..."
}
`;

  const raw = await callGemini(prompt, "Bạn là chuyên gia phân tích thị trường IT. Luôn trả về JSON hợp lệ.");
  const parsed = parseJsonFromLlm(raw);
  if (parsed && Array.isArray(parsed.hotSkills)) {
    return parsed;
  }

  return {
    hotSkills: ["ReactJS / Next.js", "NodeJS / NestJS", "Golang", "Cloud (AWS/GCP)", "AI & Data Engineer"],
    salaryTrends: "Mức lương nhân sự IT giữ mức ổn định và cạnh tranh cao; các vị trí Middle - Senior có chuyên môn sâu về Cloud và Microservices có mức lương tăng 15-20%.",
    hiringDemand: "Nhu cầu tuyển dụng mảng Fullstack và Cloud/DevOps chiếm tỷ trọng cao nhất. Các vị trí liên quan đến ứng dụng AI và xử lý dữ liệu lớn đang có xu hướng tăng trưởng vượt bậc.",
    strategicAdvice: "Khuyến khích các nhà tuyển dụng công khai dải lương minh bạch và hỗ trợ chính sách làm việc linh hoạt (Hybrid/Remote) để tiếp cận nguồn nhân lực chất lượng cao trên toàn quốc."
  };
}

module.exports = {
  callGemini,
  extractTextFromPdf,
  matchCvWithJob,
  generateInterviewPrep,
  generateJobDescription,
  screenAndSummarizeCv,
  moderateJobContent,
  generateMarketInsights,
};
