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
async function callGemini(prompt, systemInstruction = "", timeoutMs = 10000) {
  if (!aiClient) return null;
  const primaryModel = env.GEMINI_MODEL || "gemini-3.5-flash";
  const candidateModels = [primaryModel, "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"].filter(Boolean);
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

/**
 * AI Sinh Cẩm Nang IT tự động theo chủ đề và đối tượng
 */
async function generateArticleWithAi({ topic, targetAudience = "all", category = "tech_trends" }) {
  const audienceLabel =
    targetAudience === "employer"
      ? "Nhà tuyển dụng & Quản lý IT (HR Tech, Tech Lead, Engineering Manager)"
      : targetAudience === "candidate"
      ? "Ứng viên Lập trình viên IT (Junior/Middle/Senior Software Engineer)"
      : "Cả Ứng viên IT và Nhà tuyển dụng";

  const prompt = `
Bạn là Trưởng ban biên tập Cẩm nang Công nghệ & Tuyển dụng IT tại sàn việc làm VN.ITJobs.
Hãy sáng tạo một bài viết cẩm nang IT chuyên sâu, thực tế và cuốn hút dựa trên yêu cầu sau:

- Chủ đề / Ý tưởng: "${topic}"
- Đối tượng độc giả mục tiêu: ${audienceLabel}
- Chuyên mục mong muốn: ${category}

Yêu cầu xuất bản:
1. Tiêu đề: Cuốn hút, chuẩn SEO, phản ánh đúng trọng tâm vấn đề.
2. Slug: Không dấu, nối bằng gạch ngang (kebab-case).
3. Đoạn tóm tắt (Lead Summary): 2-3 câu súc tích dẫn dắt người đọc vào bài viết.
4. Nội dung bài viết (content): Định dạng bằng HTML semantic đẹp mắt (dùng <h2>, <h3>, <p>, <ul>, <li>, <strong>, <code>, <blockquote> nếu cần). Bài viết có cấu trúc rõ ràng từ 3-5 luận điểm chính, số liệu hoặc ví dụ minh họa thực tiễn, phân tích chuyên môn sâu sắc.
5. Tags: 3-5 tags từ khóa công nghệ / nghề nghiệp liên quan.
6. Thời gian đọc ước tính: (số phút, ví dụ: 6).
7. Danh mục phù hợp nhất: một trong [career_roadmap, interview_tips, salary_insights, tech_trends, recruitment_tips].

Vui lòng trả về DUY NHẤT một chuỗi JSON hợp lệ theo cấu trúc:
{
  "title": "Tiêu đề bài viết",
  "slug": "tieu-de-bai-viet",
  "category": "${category}",
  "targetAudience": "${targetAudience}",
  "summary": "Tóm tắt ngắn gọn",
  "content": "<h2>1. Tiêu đề mục</h2><p>Nội dung...</p>",
  "tags": ["Tag1", "Tag2", "Tag3"],
  "readingTime": 6
}
`;

  try {
    const raw = await callGemini(
      prompt,
      "Bạn là chuyên gia biên tập công nghệ & nhân sự IT. Luôn chỉ trả về JSON hợp lệ."
    );
    const parsed = parseJsonFromLlm(raw);
    if (parsed && parsed.title && parsed.content) {
      return {
        title: parsed.title,
        slug: parsed.slug || require("../utils/slugify")(parsed.title),
        category: parsed.category || category,
        targetAudience: parsed.targetAudience || targetAudience,
        summary: parsed.summary || "",
        content: parsed.content,
        tags: Array.isArray(parsed.tags) ? parsed.tags : ["IT", "KinhNghiem"],
        readingTime: parseInt(parsed.readingTime, 10) || 5,
        isOriginal: true,
      };
    }
  } catch (err) {
    console.error("Lỗi AI generateArticleWithAi:", err.message);
  }

  // Fallback thông minh nếu không gọi được Gemini
  const slugify = require("../utils/slugify");
  const fallbackTitle = topic.trim().length > 5 ? topic.trim() : "Cẩm Nang Phát Triển Kỹ Năng IT Toàn Diện 2026";
  return {
    title: fallbackTitle,
    slug: slugify(fallbackTitle),
    category,
    targetAudience,
    summary: `Phân tích chuyên sâu và các góc nhìn thực tiễn về chủ đề ${fallbackTitle} dành cho cộng đồng công nghệ VN.ITJobs.`,
    content: `
      <h2>1. Tổng quan vấn đề</h2>
      <p>Trong bối cảnh thị trường công nghệ thông tin ngày càng cạnh tranh, việc nắm bắt sâu sắc các kỹ năng và xu hướng mới là chìa khóa then chốt giúp bứt phá sự nghiệp.</p>
      <h2>2. Các yếu tố cốt lõi cần lưu ý</h2>
      <ul>
        <li><strong>Nền tảng vững vàng:</strong> Làm chủ tư duy giải quyết vấn đề và kiến trúc hệ thống bền vững.</li>
        <li><strong>Cập nhật liên tục:</strong> Thích ứng với các công cụ tự động hóa, quy trình CI/CD và trí tuệ nhân tạo.</li>
        <li><strong>Kỹ năng giao tiếp:</strong> Năng lực trình bày giải pháp và phối hợp nhóm hiệu quả.</li>
      </ul>
      <h2>3. Lời khuyên hành động thực tế</h2>
      <p>Hãy xây dựng kế hoạch hành động cụ thể theo từng tháng, đo lường tiến độ và tích cực tham gia đóng góp cho các dự án thực tế.</p>
    `,
    tags: ["IT Career", "CongNghe", "KinhNghiem"],
    readingTime: 5,
    isOriginal: true,
  };
}

/**
 * AI Trích xuất, tổng hợp & biên tập bài viết từ nguồn ngoài (Content Curation)
 */
async function curateArticleFromSourceWithAi({ sourceUrl = "", rawContent = "", targetAudience = "all" }) {
  let sourceName = "";
  let fetchedText = "";
  let extractedThumbnail = "";
  let extractedOriginalAuthor = "";
  let extractedPageTitle = "";

  // 1. Phân tích tên domain nguồn từ URL
  if (sourceUrl && sourceUrl.trim()) {
    try {
      const urlObj = new URL(sourceUrl.trim());
      const host = urlObj.hostname.replace(/^www\./, "");
      if (host.includes("medium.com")) sourceName = "Medium";
      else if (host.includes("viblo.asia")) sourceName = "Viblo";
      else if (host.includes("dev.to")) sourceName = "Dev.to";
      else if (host.includes("techcrunch.com")) sourceName = "TechCrunch";
      else if (host.includes("itviec.com")) sourceName = "ITviec Blog";
      else if (host.includes("topdev.vn")) sourceName = "TopDev Blog";
      else if (host.includes("topcv.vn")) sourceName = "TopCV";
      else if (host.includes("github.com")) sourceName = "GitHub Blog";
      else sourceName = host;
    } catch (e) {
      sourceName = "Internet";
    }
  }

  // 2. Nếu có URL mà chưa có rawContent, cố gắng fetch nhanh văn bản trang và trích xuất nội dung bài viết chính
  if (sourceUrl && (!rawContent || rawContent.trim().length < 50)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(sourceUrl.trim(), {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      clearTimeout(timeout);
      if (res.ok) {
        const html = await res.text();

        // Trích xuất metadata ảnh thumbnail và tác giả
        const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)
          || html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
        if (ogImageMatch && ogImageMatch[1]) {
          extractedThumbnail = ogImageMatch[1].trim();
        }

        const authorMatch = html.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i)
          || html.match(/<meta\s+property=["']article:author["']\s+content=["']([^"']+)["']/i)
          || html.match(/class=["'][^"']*(?:author-name|author vcard|author__name)[^"']*["'][^>]*>([^<]+)</i);
        if (authorMatch && authorMatch[1]) {
          extractedOriginalAuthor = authorMatch[1].trim();
        }

        const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)
          || html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          extractedPageTitle = titleMatch[1].replace(/\|.*$/i, "").replace(/-.*$/i, "").trim();
        }

        // Lọc thẻ nhiễu: script, style, header, nav, footer, aside, form, svg
        let clean = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
          .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
          .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
          .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
          .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, "")
          .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, "")
          .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");

        // Ưu tiên trích xuất vùng nội dung bài viết chính: <article>, .td-post-content, .entry-content, .post-content, hoặc từ <h1
        let mainHtml = "";
        const articleMatch = clean.match(/<article[\s\S]*?<\/article>/i);
        if (articleMatch) {
          mainHtml = articleMatch[0];
        } else {
          const contentDivMatch = clean.match(/<div[^>]*class=["'][^"']*(?:td-post-content|entry-content|post-content|article-content|blog-content)[^"']*["'][\s\S]*?<\/div>/i);
          if (contentDivMatch) {
            mainHtml = contentDivMatch[0];
          } else {
            const h1Idx = clean.indexOf("<h1");
            if (h1Idx !== -1) {
              mainHtml = clean.substring(h1Idx, h1Idx + 20000);
            } else {
              mainHtml = clean;
            }
          }
        }

        fetchedText = mainHtml
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 10000);
      } else {
        console.warn(`[AI Curate] Không thể tải trực tiếp URL (HTTP ${res.status}), chuyển sang suy luận chủ đề từ đường dẫn.`);
        const urlObj = new URL(sourceUrl.trim());
        const slugPart = urlObj.pathname.split("/").filter(Boolean).pop() || "";
        const topicInferred = slugPart.replace(/[-_]+/g, " ").replace(/\.html?$/i, "").trim();
        if (topicInferred) {
          extractedPageTitle = topicInferred.charAt(0).toUpperCase() + topicInferred.slice(1);
        }
      }
    } catch (fetchErr) {
      console.warn("⚠️ Không thể fetch trực tiếp URL nguồn:", fetchErr.message);
      try {
        const urlObj = new URL(sourceUrl.trim());
        const slugPart = urlObj.pathname.split("/").filter(Boolean).pop() || "";
        const topicInferred = slugPart.replace(/[-_]+/g, " ").replace(/\.html?$/i, "").trim();
        if (topicInferred) {
          extractedPageTitle = topicInferred.charAt(0).toUpperCase() + topicInferred.slice(1);
        }
      } catch (e) {}
    }
  }

  const textToAnalyze = (rawContent && rawContent.trim().length > 30 ? rawContent : fetchedText).trim();

  const prompt = `
Bạn là Trưởng ban biên tập tại cổng thông tin công nghệ VN.ITJobs.
Nhiệm vụ: Hãy nghiên cứu toàn bộ thông tin nguồn dưới đây và TIẾN HÀNH BIÊN TẬP LẠI (Content Curation) thành một bài viết CẨM NANG IT HOÀN CHỈNH, CHUYÊN SÂU, CÓ CHIỀU SÂU VÀ QUY MÔ NỘI DUNG ĐẠT TỐI THIỂU 60% – 70% SO VỚI BÀI VIẾT GỐC (Ước tính khoảng 1.200 – 1.800 từ).
TUYỆT ĐỐI KHÔNG ĐƯỢC TÓM TẮT SƠ SÀI, KHÔNG RÚT GỌN VẮN TẮT CHỈ VÀI DÒNG. BÀI VIẾT PHẢI ĐẦY ĐỦ CÁC LUẬN ĐIỂM, PHÂN TÍCH, VÍ DỤ VÀ CÁC BƯỚC HÀNH ĐỘNG CỤ THỂ.

Thông tin nguồn tham khảo:
- Link bài viết: ${sourceUrl || "N/A"}
- Nguồn xuất bản: ${sourceName || "N/A"}
- Tiêu đề gốc tham khảo: ${extractedPageTitle || "N/A"}
- Tác giả gốc nếu có: ${extractedOriginalAuthor || "N/A"}
- Đối tượng độc giả mục tiêu: ${targetAudience} (${targetAudience === "employer" ? "Nhà tuyển dụng / Doanh nghiệp IT" : targetAudience === "candidate" ? "Sinh viên / Lập trình viên / Ứng viên IT" : "Toàn bộ cộng đồng IT"})
- Toàn bộ nội dung bài viết gốc cần phân tích:
"""
${textToAnalyze ? textToAnalyze.substring(0, 8500) : "Chưa có nội dung thô chi tiết, hãy biên soạn một cẩm nang toàn diện, đầy đủ nhất dựa trên chủ đề: " + (extractedPageTitle || sourceUrl)}
"""

YÊU CẦU ĐỊNH DẠNG VÀ CẤU TRÚC BÀI VIẾT BẮT BUỘC (ĐỂ HIỂN THỊ CSS ĐẸP MẮT):
1. Tiêu đề (title): Tiếng Việt chuyên nghiệp, hấp dẫn, chuẩn SEO, phản ánh đúng toàn bộ tinh thần cẩm nang.
2. Đường dẫn tĩnh (slug): Dạng kebab-case không dấu (vd: cam-nang-it-cho-sinh-vien-lap-trinh).
3. Đoạn tóm tắt (summary): Từ 2-3 câu súc tích nêu bật lý do và giá trị then chốt mà cẩm nang mang lại.
4. Chuyên mục (category): Đặt tên chuyên mục phù hợp (ví dụ: "Cẩm Nang Sinh Viên IT", "Kinh Nghiệm Phỏng Vấn", "Lộ Trình Nghề Nghiệp", "Xu Hướng Công Nghệ", ...).
5. Nội dung bài viết (content): Bắt buộc định dạng HTML ngữ nghĩa phong phú:
   - Tối thiểu 5 - 7 mục lớn <h2> làm tiêu đề cho từng phần bài viết.
   - Mỗi phần <h2> phải có từ 2 - 3 tiểu mục <h3> kèm đoạn văn phân tích chi tiết <p> (mỗi đoạn 3 - 5 câu, diễn giải sâu sắc và có ví dụ minh họa).
   - Danh sách các bước triển khai, các tiêu chí hoặc checklist dùng thẻ <ul><li> hoặc <ol><li>, sử dụng <strong> để nhấn mạnh cụm từ khóa đầu dòng.
   - Sử dụng ít nhất 2 - 3 thẻ <blockquote> để tạo các khung Callout lời khuyên vàng từ chuyên gia hoặc các cảnh báo/lưu ý đắt giá.
   - Sử dụng thẻ <code> để làm nổi bật các thuật ngữ kỹ thuật, công nghệ, lệnh code (vd: <code>Git</code>, <code>Docker</code>, <code>RESTful API</code>).
   - Nếu có thể, tạo 1 bảng <table> so sánh các phương án hoặc tiêu chí đánh giá.
6. Thẻ từ khóa (tags): Mảng 4-6 tags liên quan.
7. Thời gian đọc (readingTime): Ước tính từ 7-12 phút.
8. Nguồn (sourceName): Tên website/báo nguồn.
9. Tác giả gốc (originalAuthor): Tên tác giả nếu có.
10. Ảnh đại diện (thumbnail): Link URL ảnh nếu có, hoặc để trống.

Vui lòng trả về DUY NHẤT định dạng JSON:
{
  "title": "Tiêu đề tiếng Việt",
  "slug": "slug-bai-viet",
  "category": "Cẩm Nang Sinh Viên IT",
  "targetAudience": "${targetAudience}",
  "summary": "Tóm tắt...",
  "content": "<h2>1. Đề mục lớn</h2><p>Phân tích chi tiết...</p><h3>1.1. Chi tiết</h3><p>Nội dung...</p><ul><li><strong>Ý cốt lõi:</strong> Diễn giải...</li></ul><blockquote>Lời khuyên từ chuyên gia...</blockquote>",
  "tags": ["Tag1", "Tag2", "Tag3"],
  "readingTime": 8,
  "sourceName": "${sourceName || "Nguồn tham khảo"}",
  "sourceUrl": "${sourceUrl || ""}",
  "originalAuthor": "${extractedOriginalAuthor || ""}",
  "thumbnail": "${extractedThumbnail || ""}"
}
`;

  try {
    const raw = await callGemini(
      prompt,
      "Bạn là biên tập viên cao cấp. Luôn trả về định dạng JSON thuần không kèm giải thích."
    );
    const parsed = parseJsonFromLlm(raw);
    if (parsed && parsed.title && parsed.content) {
      return {
        title: parsed.title,
        slug: parsed.slug || require("../utils/slugify")(parsed.title),
        category: parsed.category || "career_roadmap",
        targetAudience: parsed.targetAudience || targetAudience,
        summary: parsed.summary || "",
        content: parsed.content,
        thumbnail: parsed.thumbnail || extractedThumbnail || "",
        tags: Array.isArray(parsed.tags) ? parsed.tags : ["CongNghe", "TríchNguồn"],
        readingTime: parseInt(parsed.readingTime, 10) || 7,
        sourceName: parsed.sourceName || sourceName || "Nguồn tham khảo",
        sourceUrl: sourceUrl.trim(),
        originalAuthor: parsed.originalAuthor || extractedOriginalAuthor || "",
        isOriginal: false,
      };
    }
  } catch (err) {
    console.error("Lỗi AI curateArticleFromSourceWithAi:", err.message);
  }

  // Fallback chất lượng cao nếu Gemini không phản hồi
  const slugify = require("../utils/slugify");
  const fallbackTopic = extractedPageTitle || "Cẩm Nang Định Hướng Nghề Nghiệp & Phát Triển Kỹ Năng IT";
  return {
    title: fallbackTopic,
    slug: slugify(fallbackTopic),
    category: "Cẩm Nang Sinh Viên IT",
    targetAudience,
    summary: `Phân tích chuyên sâu và cẩm nang hướng dẫn thực chiến được tổng hợp và biên tập từ ${sourceName || "nguồn công nghệ uy tín"}.`,
    thumbnail: extractedThumbnail || "",
    content: `
      <h2>1. Giới thiệu & Bối cảnh ngành IT hiện nay</h2>
      <p>Trong bối cảnh công nghệ thông tin phát triển với tốc độ chóng mặt, yêu cầu từ các doanh nghiệp tuyển dụng không ngừng gia tăng. Bài viết này được tổng hợp và biên tập từ <strong>${sourceName || "nguồn công nghệ"}</strong> nhằm mang đến góc nhìn toàn diện, giúp độc giả nắm vững lộ trình phát triển bài bản và giảm thiểu rủi ro trên con đường sự nghiệp.</p>
      
      <h2>2. Những năng lực và tư duy cốt lõi cần chuẩn bị</h2>
      <p>Để tạo dựng lợi thế cạnh tranh bền vững trên thị trường lao động, mỗi cá nhân cần tập trung hoàn thiện bộ kỹ năng theo mô hình chữ T (T-shaped skills):</p>
      <ul>
        <li><strong>Nền tảng kỹ thuật vững vàng:</strong> Hiểu rõ bản chất cấu trúc dữ liệu, giải thuật, mạng máy tính và tư duy hướng đối tượng.</li>
        <li><strong>Năng lực tự nghiên cứu và làm chủ công cụ mới:</strong> Thành thạo các hệ thống quản lý mã nguồn <code>Git</code>, quy trình <code>CI/CD</code> và ứng dụng công cụ hỗ trợ AI một cách thông minh.</li>
        <li><strong>Kỹ năng mềm và phối hợp nhóm:</strong> Khả năng trình bày giải pháp kỹ thuật, lắng nghe phản hồi và làm việc theo phương pháp <code>Agile / Scrum</code>.</li>
      </ul>

      <blockquote>
        <strong>Lời khuyên từ chuyên gia:</strong> Đừng chỉ dừng lại ở việc đọc tài liệu lý thuyết. Giá trị thực sự của một kỹ sư IT nằm ở số lượng dòng code thực chiến và những bài toán thực tế đã giải quyết thành công.
      </blockquote>

      <h2>3. Lộ trình hành động từng bước để bứt phá</h2>
      <h3>3.1. Giai đoạn 1: Chuẩn hóa kiến thức và xây dựng dự án mẫu (Portfolio)</h3>
      <p>Hãy bắt đầu bằng việc xây dựng từ 2 đến 3 dự án cá nhân có chiều sâu thay vì làm quá nhiều dự án đơn giản. Dự án cần có tài liệu hướng dẫn <code>README.md</code> chỉn chu, mã nguồn sạch sẽ và đường link chạy thử (live demo) trực tiếp.</p>
      
      <h3>3.2. Giai đoạn 2: Tối ưu hồ sơ ứng tuyển và rèn luyện kỹ năng phỏng vấn</h3>
      <p>Một bản CV chuẩn mực cần nêu bật những đóng góp định lượng (ví dụ: tối ưu hóa thời gian tải trang 30%, xử lý hàng ngàn request đồng thời) thay vì chỉ liệt kê các công nghệ đã từng nghe qua.</p>

      <h2>4. Những sai lầm phổ biến cần tuyệt đối tránh</h2>
      <ul>
        <li><strong>Học theo xu hướng một cách hời hợt:</strong> Chạy theo các công nghệ mới nổi nhưng bỏ quên các nguyên lý nền tảng cơ bản.</li>
        <li><strong>Thiếu tính chủ động trong giao tiếp:</strong> E ngại việc đặt câu hỏi hoặc trao đổi với người hướng dẫn và đồng nghiệp khi gặp khó khăn.</li>
      </ul>

      <blockquote>
        <strong>Lưu ý quan trọng:</strong> Hành trình trở thành một kỹ sư phần mềm xuất sắc là một cuộc chạy marathon đường dài, đòi hỏi sự kiên trì và kỷ luật tự giác mỗi ngày.
      </blockquote>

      <h2>5. Tổng kết và kế hoạch hành động</h2>
      <p>Hy vọng cẩm nang này sẽ trở thành kim chỉ nam hữu ích đồng hành cùng bạn trên chặng đường chinh phục các mục tiêu nghề nghiệp. Hãy bắt tay vào hành động ngay hôm nay bằng cách vạch ra kế hoạch học tập cụ thể cho từng tuần và từng tháng!</p>
    `,
    tags: ["CamNangIT", "TríchNguồn", "KyNangIT", "DinhHuong"],
    readingTime: 8,
    sourceName: sourceName || "Nguồn tham khảo",
    sourceUrl: sourceUrl.trim(),
    originalAuthor: extractedOriginalAuthor || "",
    isOriginal: false,
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
  generateArticleWithAi,
  curateArticleFromSourceWithAi,
};
