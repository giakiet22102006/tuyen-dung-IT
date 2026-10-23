// src/services/ai.service.js
const dns = require("dns");
if (dns && typeof dns.setDefaultResultOrder === "function") {
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch (e) {}
}

const { GoogleGenAI } = require("@google/genai");
const env = require("../config/env");

let aiClient = null;
if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim()) {
  try {
    aiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY.trim() });
    console.log("🤖 Google Gemini AI Client initialized successfully.");
  } catch (err) {
    console.error("Lỗi khởi tạo Gemini AI:", err.message);
  }
}

/**
 * Gọi Gemini API với cơ chế timeout an toàn và Fallback đa tầng
 */
async function callGemini(prompt, systemInstruction = "", timeoutMs = 12000) {
  if (!aiClient) return null;
  const primaryModel = env.GEMINI_MODEL || "gemini-3.8-flash";
  const candidateModels = [primaryModel, "gemini-3.5-flash-lite"];
  const modelsToTry = [...new Set(candidateModels)];

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelName = modelsToTry[i];
    let timeoutHandle;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("Timeout vượt quá hạn phản hồi")), timeoutMs);
        if (timeoutHandle && timeoutHandle.unref) timeoutHandle.unref();
      });
      const callPromise = aiClient.models.generateContent({
        model: modelName,
        contents: prompt,
        config: systemInstruction ? { systemInstruction } : undefined,
      });

      const response = await Promise.race([callPromise, timeoutPromise]);
      if (response && response.text) {
        return response.text;
      }
    } catch (err) {
      console.warn(`⚠️ Gemini API (${modelName}) không phản hồi: ${err.message}.`);
      if (i === modelsToTry.length - 1) {
        console.error("❌ Tất cả các model Gemini đều không phản hồi, chuyển sang phân tích thông minh nội bộ.");
      }
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  return null;
}

/**
 * Trích xuất text từ Buffer file PDF
 * - Cấp 1: pdf-parse@1.1.1 (Pure JavaScript, không native canvas, tương thích 100% Vercel Serverless & Node)
 * - Cấp 2: Gemini Multimodal Vision/OCR (Nếu PDF dạng ảnh scan / Canva flattened không có text stream)
 */
async function extractTextFromPdf(pdfBuffer) {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 4) return "";

  // 1. Bước 1: Trích xuất text nhanh bằng pdf-parse chuẩn pure-JS
  try {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(pdfBuffer);
    if (data && typeof data.text === "string" && data.text.trim().length >= 20) {
      return data.text.trim();
    }
  } catch (parseErr) {
    console.warn("⚠️ [PDF Extractor] pdf-parse cảnh báo:", parseErr.message);
  }

  // 2. Bước 2 (Fallback): Nếu pdf-parse không đọc được hoặc PDF là dạng scan/ảnh (Canva, Photoshop không nhúng text stream), dùng Gemini Multimodal Vision/OCR
  if (aiClient) {
    try {
      const primaryModel = env.GEMINI_MODEL || "gemini-3.8-flash";
      const response = await aiClient.models.generateContent({
        model: primaryModel,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: pdfBuffer.toString("base64"),
                },
              },
              {
                text: "Hãy đọc và trích xuất toàn bộ nội dung văn bản trong file CV này dưới dạng plain text. Không thêm lời chào, nhận xét hay định dạng markdown, chỉ trả về nội dung của CV.",
              },
            ],
          },
        ],
      });

      if (response && response.text && response.text.trim().length >= 20) {
        return response.text.trim();
      }
    } catch (geminiOcrErr) {
      console.warn("⚠️ [PDF Extractor] Gemini Multimodal OCR không đọc được:", geminiOcrErr.message);
    }
  }

  return "";
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
// THẨM ĐỊNH ĐỘ PHÙ HỢP CV & NHẬN DIỆN CHUYÊN NGÀNH (CHỐNG CHẤM ĐIỂM ẢO)
// =========================================================================
function analyzeCvSuitability(cvText, job) {
  const text = (cvText || "").toLowerCase();
  const jobTitle = job ? (job.title || "").toLowerCase() : "";
  const jobSkills = job && Array.isArray(job.skills) ? job.skills : [];

  // 1. Nhận diện các ngành nghề ngoài CNTT
  const nonItDomains = [
    {
      name: "Kế toán / Kiểm toán / Thuế",
      keywords: ["kế toán", "kiểm toán", "thuế", "thu chi", "hóa đơn", "sổ sách", "báo cáo tài chính", "kế toán viên", "nghiệp vụ kế toán"],
    },
    {
      name: "Tài chính / Ngân hàng",
      keywords: ["tài chính", "ngân hàng", "tín dụng", "cho vay", "thẩm định giá", "chứng khoán"],
    },
    {
      name: "Hành chính / Nhân sự / Văn thư",
      keywords: ["hành chính nhân sự", "văn thư", "c&b", "bảo hiểm xã hội", "chấm công"],
    },
    {
      name: "Y tế / Dược phẩm",
      keywords: ["bác sĩ", "dược sĩ", "điều dưỡng", "y tá", "bệnh viện", "phòng khám"],
    },
    {
      name: "Xây dựng / Cơ khí chế tạo",
      keywords: ["kỹ sư xây dựng", "thi công công trình", "kết cấu thép", "trắc địa"],
    },
    {
      name: "Du lịch / Khách sạn / Nhà hàng",
      keywords: ["pha chế", "phục vụ", "lễ tân khách sạn", "hướng dẫn viên du lịch", "đầu bếp"],
    },
  ];

  let detectedNonItDomain = null;
  for (const domain of nonItDomains) {
    const hits = domain.keywords.filter((kw) => text.includes(kw));
    if (hits.length >= 2) {
      detectedNonItDomain = domain.name;
      break;
    }
  }

  // 2. Danh mục kỹ năng & từ khóa công nghệ thông tin
  const itTechKeywords = [
    "react", "reactjs", "javascript", "js", "typescript", "ts", "html", "css", "node", "nodejs",
    "express", "nest", "nestjs", "python", "django", "flask", "fastapi", "java", "spring", "springboot",
    "c#", ".net", "asp.net", "c++", "golang", "go", "php", "laravel", "sql", "mysql", "mongodb",
    "postgresql", "redis", "docker", "kubernetes", "aws", "gcp", "azure", "git", "github", "gitlab",
    "restful", "api", "graphql", "microservices", "frontend", "backend", "fullstack", "devops",
    "ci/cd", "vue", "vuejs", "angular", "nextjs", "nuxt", "flutter", "react native", "swift", "kotlin",
    "android", "ios", "qa", "qc", "tester", "automation test", "selenium"
  ];

  const matchedJobSkills = [];
  const missingJobSkills = [];
  jobSkills.forEach((sk) => {
    const sName = (sk.name || "").toLowerCase();
    const sSlug = (sk.slug || "").toLowerCase();
    if ((sName && text.includes(sName)) || (sSlug && text.includes(sSlug))) {
      matchedJobSkills.push(sk.name);
    } else {
      missingJobSkills.push(sk.name);
    }
  });

  // Tìm các kỹ năng IT chung xuất hiện trong CV
  const generalItSkillsInCv = itTechKeywords.filter((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return regex.test(text);
  });

  const isCompletelyUnrelated = Boolean(detectedNonItDomain && generalItSkillsInCv.length === 0 && matchedJobSkills.length === 0);
  const hasZeroSkills = matchedJobSkills.length === 0 && generalItSkillsInCv.length === 0;

  let calculatedScore = 0;
  let recommendation = "reject";

  if (isCompletelyUnrelated) {
    calculatedScore = 5;
    recommendation = "reject";
  } else if (hasZeroSkills) {
    calculatedScore = 10;
    recommendation = "reject";
  } else if (matchedJobSkills.length === 0) {
    calculatedScore = Math.min(30, 15 + generalItSkillsInCv.length * 3);
    recommendation = "reject";
  } else {
    const ratio = jobSkills.length > 0 ? (matchedJobSkills.length / jobSkills.length) : 0.6;
    calculatedScore = Math.min(95, Math.max(35, Math.round(ratio * 65 + generalItSkillsInCv.length * 3 + 15)));
    if (calculatedScore >= 75) recommendation = "hire_interview";
    else if (calculatedScore >= 50) recommendation = "consider";
    else recommendation = "reject";
  }

  return {
    calculatedScore,
    recommendation,
    detectedNonItDomain,
    matchedJobSkills,
    missingJobSkills: missingJobSkills.length > 0 ? missingJobSkills : (jobSkills.length > 0 ? jobSkills.map(s => s.name) : ["Kỹ năng lập trình chuyên môn"]),
    generalItSkillsInCv,
    isCompletelyUnrelated,
  };
}

// =========================================================================
// TÍNH NĂNG 1: AI CV MATCHING & GAP ANALYSIS (DÀNH CHO ỨNG VIÊN)
// =========================================================================
async function matchCvWithJob(cvText, job) {
  const suitability = analyzeCvSuitability(cvText, job);
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

QUY TẮC ĐÁNH GIÁ CHUYÊN MÔN NGHIÊM NGẶT:
1. NẾU ỨNG VIÊN TRÁI NGÀNH (Ví dụ: CV thuộc lĩnh vực Kế toán, Kiểm toán, Ngân hàng, Văn thư, Bán hàng... nộp vào việc làm Lập trình/IT mà không hề có kỹ năng lập trình):
   - "matchScore" BẮT BUỘC dưới 15% (chỉ cho từ 0 đến 15 điểm).
   - "matchedSkills": Phải để mảng rỗng [] nếu không có kỹ năng IT nào khớp.
   - "missingSkills": Liệt kê toàn bộ kỹ năng công nghệ mà vị trí yêu cầu.
   - "summary": Phải nêu rõ ứng viên thuộc ngành khác, không đáp ứng yêu cầu kỹ thuật của vị trí.
   - TUYỆT ĐỐI KHÔNG chấm điểm cao hoặc khen ngợi không đúng thực tế.
2. NẾU CÓ KỸ NĂNG KHỚP:
   - Điểm "matchScore" phản ánh tỷ lệ đáp ứng kỹ năng kỹ thuật và kinh nghiệm thực tế.

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

  const raw = await callGemini(prompt, "Bạn là chuyên gia tuyển dụng IT nghiêm túc và công tâm. Luôn phản hồi JSON hợp lệ bằng tiếng Việt.");
  const parsed = parseJsonFromLlm(raw);
  if (parsed && typeof parsed.matchScore === "number") {
    // Guard-rail: Ngăn chặn LLM chấm điểm ảo khi ứng viên trái ngành hoàn toàn
    if (suitability.isCompletelyUnrelated) {
      parsed.matchScore = Math.min(parsed.matchScore, 10);
      parsed.matchedSkills = suitability.matchedJobSkills;
      parsed.missingSkills = suitability.missingJobSkills;
      parsed.summary = `Hồ sơ của bạn thuộc chuyên môn ${suitability.detectedNonItDomain}, hoàn toàn không có kỹ năng lập trình hay kinh nghiệm CNTT đáp ứng vị trí ${jobTitle} (Độ phù hợp: ${parsed.matchScore}%).`;
    }
    parsed.advice = parsed.advice || parsed.improvements || [];
    parsed.improvements = parsed.advice;
    return parsed;
  }

  // Fallback thông minh dựa trên phân tích chuyên môn thực tế
  if (suitability.isCompletelyUnrelated) {
    const adviceList = [
      `Vị trí ${jobTitle} đòi hỏi kiến thức chuyên môn về lập trình phần mềm (${suitability.missingJobSkills.join(", ")}).`,
      "Nếu bạn có định hướng chuyển ngành sang CNTT, cần tham gia các khóa đào tạo bài bản và xây dựng dự án mẫu (portfolio) trước khi nộp đơn.",
      "Cân nhắc tìm kiếm các vị trí đúng chuyên môn " + suitability.detectedNonItDomain + " để có cơ hội việc làm tốt nhất."
    ];
    return {
      matchScore: suitability.calculatedScore, // 5%
      matchedSkills: [],
      missingSkills: suitability.missingJobSkills,
      strengths: [
        `Kinh nghiệm làm việc và nền tảng trong lĩnh vực chuyên môn cũ (${suitability.detectedNonItDomain})`,
        "Có các kỹ năng mềm cơ bản như làm việc nhóm và giao tiếp"
      ],
      advice: adviceList,
      improvements: adviceList,
      summary: `Hồ sơ của bạn thuộc lĩnh vực ${suitability.detectedNonItDomain}, hoàn toàn không có kỹ năng lập trình hay kinh nghiệm CNTT phù hợp với vị trí ${jobTitle} (Độ phù hợp: ${suitability.calculatedScore}%).`
    };
  }

  // Fallback cho trường hợp CV thông thường
  const adviceList = [
    suitability.missingJobSkills.length > 0
      ? `Bổ sung thêm các dự án hoặc chứng chỉ liên quan đến: ${suitability.missingJobSkills.slice(0, 2).join(", ")}`
      : "Định dạng lại CV làm nổi bật các thành tích cụ thể (KPIs)",
    "Chuẩn bị kỹ câu trả lời về các thử thách kỹ thuật từng giải quyết"
  ];

  return {
    matchScore: suitability.calculatedScore,
    matchedSkills: suitability.matchedJobSkills.length > 0 ? suitability.matchedJobSkills : [],
    missingSkills: suitability.missingJobSkills,
    strengths: [
      suitability.matchedJobSkills.length > 0 ? `Nắm vững công nghệ trọng tâm: ${suitability.matchedJobSkills.join(", ")}` : "Hồ sơ thể hiện kỹ năng làm việc nghiêm túc",
      "Kinh nghiệm làm việc được trình bày rõ ràng"
    ],
    advice: adviceList,
    improvements: adviceList,
    summary: `Hồ sơ của bạn đạt mức độ tương thích ${suitability.calculatedScore}% so với yêu cầu của vị trí ${jobTitle}.`
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
  const suitability = analyzeCvSuitability(cvText, job);
  const jobTitle = job ? job.title : "Vị trí tuyển dụng";
  const jobSkills = job && Array.isArray(job.skills) ? job.skills.map((s) => s.name).join(", ") : "";

  const prompt = `
Bạn là chuyên gia thẩm định hồ sơ kỹ thuật (Technical CV Screener).
Hãy đọc nội dung CV dưới đây và đưa ra bản tóm tắt nhanh cùng đánh giá năng lực cho Nhà tuyển dụng xem xét vị trí: "${jobTitle}" (Yêu cầu kỹ năng: ${jobSkills}).

NỘI DUNG CV:
${cvText.slice(0, 3500)}

QUY TẮC THẨM ĐỊNH NGHIÊM NGẶT:
1. NẾU ỨNG VIÊN TRÁI NGÀNH HOÀN TOÀN (Ví dụ: CV thuộc ngành Kế toán, Kiểm toán, Ngân hàng, Y tế, Lễ tân... nộp vào vị trí Lập trình viên IT mà không có kỹ năng lập trình):
   - Điểm "matchScore" BẮT BUỘC dưới 15% (từ 0 đến 15 điểm).
   - "recommendation" BẮT BUỘC là "reject" (Từ chối).
   - "concerns": Chỉ ra rõ ứng viên không có kỹ năng công nghệ và trái ngành.
   - TUYỆT ĐỐI KHÔNG đánh giá "hire_interview" hoặc khen ngợi không đúng thực tế.
2. NẾU ĐÁP ỨNG KỸ NĂNG:
   - "matchScore" và "recommendation" tỷ lệ thuận với mức độ đáp ứng kỹ năng kỹ thuật và số năm kinh nghiệm.

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

  const raw = await callGemini(prompt, "Bạn là chuyên gia thẩm định CV nghiêm túc, công tâm. Luôn phản hồi JSON hợp lệ bằng tiếng Việt.");
  const parsed = parseJsonFromLlm(raw);
  if (parsed && typeof parsed.matchScore === "number") {
    // Guard-rail: Ngăn chặn LLM chấm điểm ảo khi ứng viên trái ngành hoàn toàn
    if (suitability.isCompletelyUnrelated) {
      parsed.matchScore = Math.min(parsed.matchScore, 10);
      parsed.recommendation = "reject";
      parsed.executiveSummary = `Ứng viên có chuyên môn thuộc lĩnh vực ${suitability.detectedNonItDomain}, hoàn toàn không có kỹ năng lập trình hay kinh nghiệm công nghệ thông tin liên quan đến vị trí ${jobTitle}.`;
      parsed.candidateSummary = parsed.executiveSummary;
      parsed.concerns = [
        "Hồ sơ trái ngành hoàn toàn, không có bất kỳ kỹ năng lập trình nào theo yêu cầu",
        "Không có chứng chỉ, portfolio hoặc dự án kỹ thuật liên quan đến " + jobTitle,
        "Khuyến nghị từ chối hồ sơ vì không đáp ứng tiêu chuẩn chuyên môn"
      ];
    }

    parsed.candidateSummary = parsed.executiveSummary || parsed.candidateSummary;
    parsed.executiveSummary = parsed.candidateSummary;
    parsed.pros = parsed.strengths || parsed.pros || [];
    parsed.strengths = parsed.pros;
    parsed.cons = parsed.concerns || parsed.cons || [];
    parsed.concerns = parsed.cons;
    parsed.recommendation = parsed.recommendation || (parsed.matchScore >= 75 ? "hire_interview" : parsed.matchScore >= 50 ? "consider" : "reject");
    parsed.hiringRecommendation = parsed.recommendation === "hire_interview"
      ? "Khuyến nghị: Phù hợp để liên hệ phỏng vấn vòng chuyên môn"
      : (parsed.recommendation === "consider" ? "Khuyến nghị: Xem xét cân nhắc phỏng vấn sơ bộ" : "Khuyến nghị: Từ chối hồ sơ (Không phù hợp chuyên môn)");
    return parsed;
  }

  // Fallback thông minh dựa trên thẩm định thực tế
  if (suitability.isCompletelyUnrelated) {
    const summary = `Ứng viên có chuyên môn thuộc lĩnh vực ${suitability.detectedNonItDomain}, hoàn toàn không có kỹ năng lập trình hay kinh nghiệm công nghệ thông tin liên quan đến vị trí ${jobTitle}.`;
    return {
      candidateSummary: summary,
      executiveSummary: summary,
      estimatedExperience: "0 năm kinh nghiệm IT",
      matchScore: suitability.calculatedScore, // 5%
      topSkills: ["Kỹ năng văn phòng"],
      pros: [`Có kinh nghiệm làm việc trong lĩnh vực cũ (${suitability.detectedNonItDomain})`],
      strengths: [`Có kinh nghiệm làm việc trong lĩnh vực cũ (${suitability.detectedNonItDomain})`],
      cons: [
        "Hồ sơ trái ngành hoàn toàn, không có bất kỳ kỹ năng lập trình nào theo yêu cầu",
        "Không có chứng chỉ, portfolio hoặc dự án kỹ thuật liên quan đến " + jobTitle,
        "Khuyến nghị từ chối hồ sơ vì không đáp ứng tiêu chuẩn chuyên môn"
      ],
      concerns: [
        "Hồ sơ trái ngành hoàn toàn, không có bất kỳ kỹ năng lập trình nào theo yêu cầu",
        "Không có chứng chỉ, portfolio hoặc dự án kỹ thuật liên quan đến " + jobTitle,
        "Khuyến nghị từ chối hồ sơ vì không đáp ứng tiêu chuẩn chuyên môn"
      ],
      recommendation: "reject",
      hiringRecommendation: "Khuyến nghị: Từ chối hồ sơ (Trái ngành / Không đáp ứng chuyên môn kỹ thuật)"
    };
  }

  // Fallback cho CV thông thường
  const summary = `Ứng viên có mức độ đáp ứng ${suitability.calculatedScore}% so với yêu cầu của vị trí ${jobTitle}.`;
  return {
    candidateSummary: summary,
    executiveSummary: summary,
    estimatedExperience: "1 - 3 năm",
    matchScore: suitability.calculatedScore,
    topSkills: suitability.matchedJobSkills.length > 0 ? suitability.matchedJobSkills : ["Kỹ năng cơ bản"],
    pros: suitability.matchedJobSkills.length > 0 ? [`Nắm vững công nghệ: ${suitability.matchedJobSkills.join(", ")}`] : ["Tinh thần học hỏi"],
    strengths: suitability.matchedJobSkills.length > 0 ? [`Nắm vững công nghệ: ${suitability.matchedJobSkills.join(", ")}`] : ["Tinh thần học hỏi"],
    cons: suitability.missingJobSkills.length > 0 ? [`Cần kiểm tra kỹ năng về: ${suitability.missingJobSkills.join(", ")}`] : ["Cần kiểm tra kinh nghiệm thực tế"],
    concerns: suitability.missingJobSkills.length > 0 ? [`Cần kiểm tra kỹ năng về: ${suitability.missingJobSkills.join(", ")}`] : ["Cần kiểm tra kinh nghiệm thực tế"],
    recommendation: suitability.recommendation,
    hiringRecommendation: suitability.recommendation === "hire_interview"
      ? "Khuyến nghị: Phù hợp để liên hệ phỏng vấn vòng chuyên môn"
      : (suitability.recommendation === "consider" ? "Khuyến nghị: Xem xét cân nhắc phỏng vấn sơ bộ" : "Khuyến nghị: Từ chối hồ sơ (Không phù hợp chuyên môn)")
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

// =========================================================================
// TÍNH NĂNG 7: AI DRAFT INTERVIEW INVITATION (THƯ MỜI PHỎNG VẤN)
// =========================================================================
async function draftInterviewInvitation({
  candidateName = "Ứng viên",
  jobTitle = "Lập trình viên IT",
  companyName = "Công ty",
  interviewType = "Trực tiếp tại văn phòng",
  interviewDate = "",
  location = "",
  notes = "",
}) {
  const prompt = `
Bạn là Trợ lý Tuyển dụng Chuyên nghiệp (HR Tech Specialist) tại Việt Nam.
Hãy soạn một email Thư mời phỏng vấn (Interview Invitation) thật lịch sự, chuyên nghiệp, truyền cảm hứng và đầy đủ thông tin:
- Tên ứng viên: ${candidateName}
- Vị trí tuyển dụng: ${jobTitle}
- Tên công ty: ${companyName}
- Hình thức phỏng vấn: ${interviewType}
- Thời gian dự kiến: ${interviewDate || "[Thời gian do hai bên thống nhất]"}
- Địa điểm / Đường link họp: ${location || "[Sẽ cung cấp sau khi ứng viên xác nhận]"}
${notes ? `- Lưu ý thêm từ NTD: ${notes}` : ""}

YÊU CẦU:
1. Giọng văn: Trân trọng, thân thiện, khuyến khích ứng viên, chuyên nghiệp chuẩn doanh nghiệp IT.
2. Trả về định dạng JSON hợp lệ:
{
  "subject": "Tiêu đề thư (ví dụ: [Công ty ABC] Thư Mời Tham Dự Phỏng Vấn Vị Trí XYZ)",
  "content": "Nội dung toàn bộ bức thư bằng tiếng Việt (xuống dòng bằng \\n)"
}
`;

  const raw = await callGemini(prompt, "Bạn là chuyên gia tuyển dụng IT. Luôn trả về JSON hợp lệ.");
  const parsed = parseJsonFromLlm(raw);
  if (parsed && parsed.subject && parsed.content) {
    return parsed;
  }

  // Fallback chất lượng cao
  return {
    subject: `[${companyName}] Thư Mời Tham Gia Phỏng Vấn - Vị Trí ${jobTitle}`,
    content: `Kính gửi bạn ${candidateName},

Lời đầu tiên, Ban Tuyển dụng công ty ${companyName} xin gửi lời chào trân trọng và lời chúc sức khỏe đến bạn.

Sau khi xem xét hồ sơ năng lực và kinh nghiệm của bạn trên hệ thống tuyển dụng VN.ITJobs, chúng tôi rất ấn tượng với chuyên môn của bạn đối với vị trí ${jobTitle}. Vì vậy, chúng tôi trân trọng mời bạn tham dự buổi phỏng vấn trao đổi chi tiết hơn về định hướng công việc và các chế độ đãi ngộ tại công ty.

Thông tin chi tiết buổi phỏng vấn:
- Vị trí ứng tuyển: ${jobTitle}
- Hình thức: ${interviewType}
- Thời gian: ${interviewDate || "Thứ Hai tuần tới (hoặc thời gian thuận tiện cho bạn)"}
- Địa điểm / Meeting Link: ${location || "Văn phòng công ty hoặc Google Meet"}

Nếu thời gian trên chưa thuận tiện, bạn hoàn toàn có thể phản hồi lại email này để chúng ta cùng sắp xếp một khung giờ phù hợp nhất.

Rất mong sớm nhận được phản hồi xác nhận từ bạn!

Trân trọng,
Bộ phận Tuyển dụng Nhân tài - ${companyName}`
  };
}

// =========================================================================
// AI Feature 7: Draft Rejection Letter (Thư Từ Chối Lịch Sự & Văn Minh)
// =========================================================================
async function draftRejectionLetter({
  candidateName = "Ứng viên",
  jobTitle = "Lập trình viên IT",
  companyName = "Công ty",
  reasonType = "Chưa đáp ứng đủ số năm kinh nghiệm theo yêu cầu",
  customNote = "",
}) {
  const prompt = `
Bạn là Chuyên gia Tuyển dụng Nhân sự Chuyên nghiệp (HR Tech Specialist) tại Việt Nam.
Hãy soạn một lời nhắn / thư từ chối ứng viên (Candidate Rejection Note) bằng tiếng Việt thật tinh tế, lịch sự, tôn trọng thời gian của ứng viên và mang tính xây dựng:
- Tên ứng viên: ${candidateName}
- Vị trí ứng tuyển: ${jobTitle}
- Tên công ty: ${companyName}
- Lý do từ chối chính: ${reasonType}
${customNote ? `- Ghi chú thêm từ NTD: ${customNote}` : ""}

YÊU CẦU:
1. Thể hiện lòng biết ơn chân thành vì ứng viên đã quan tâm và nộp hồ sơ.
2. Trình bày lý do từ chối một cách khéo léo, nhã nhặn, không làm tổn thương hay nản lòng ứng viên.
3. Bày tỏ mong muốn lưu giữ thông tin hồ sơ cho các cơ hội tiếp theo trong tương lai khi có dự án phù hợp hơn.
4. Trả về đúng định dạng JSON hợp lệ:
{
  "reason": "Tóm tắt lý do ngắn gọn (1 câu)",
  "content": "Toàn văn nội dung lời nhắn gửi ứng viên (xuống dòng bằng \\n)"
}
`;

  try {
    const raw = await callGemini(prompt, "Bạn là chuyên gia nhân sự IT. Luôn trả về JSON hợp lệ.");
    const parsed = parseJsonFromLlm(raw);
    if (parsed && (parsed.reason || parsed.content)) {
      return {
        reason: parsed.reason || reasonType,
        content: parsed.content || "",
      };
    }
  } catch (err) {
    console.error("Lỗi AI draftRejectionLetter:", err.message);
  }

  // Fallback chất lượng cao
  return {
    reason: reasonType,
    content: `Chào bạn ${candidateName},

Cảm ơn bạn đã dành thời gian và sự quan tâm đến vị trí ${jobTitle} tại ${companyName}.

Sau khi xem xét kỹ lưỡng hồ sơ, chúng tôi nhận thấy các kỹ năng và kinh nghiệm hiện tại của bạn chưa thực sự tương thích với yêu cầu cụ thể của vị trí này ở giai đoạn hiện tại (${reasonType.toLowerCase()}).

Chúng tôi rất trân trọng tiềm năng của bạn và xin phép được lưu lại thông tin hồ sơ trong hệ thống dữ liệu nhân tài để có thể liên hệ lại khi có cơ hội phù hợp hơn trong tương lai.

Chúc bạn luôn thành công và sớm tìm được bến đỗ nghề nghiệp ưng ý!`,
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
  draftInterviewInvitation,
  draftRejectionLetter,
};
