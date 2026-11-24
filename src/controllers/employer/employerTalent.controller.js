// src/controllers/employer/employerTalent.controller.js
const { Candidate, Job } = require("../../models");
const { CITIES, POSITIONS, JOB_MODERATION, EMPLOYER_STATUS } = require("../../config/constants");
const { createNotification } = require("../../services/notification.service");
const { generateItProfilePdf } = require("../../services/pdfGenerator.service");
const { setPdfInlineHeaders } = require("../../services/storage.service");
const paginate = require("../../utils/pagination");
const normalizeVi = require("../../utils/normalizeVi");
const { escapeRegex, isValidObjectId, getSafeBackRedirect, safeUrl } = require("../../utils/securityHelpers");

const ALLOWED_CITY_VALUES = new Set(CITIES.map((c) => c.value));
const ALLOWED_POSITION_VALUES = new Set(POSITIONS.map((p) => p.value));
const MAX_SKILL_TERMS = 8;

// Tiền tố/hậu tố pháp lý & ngành nghề chung chung — bỏ đi để "FPT" khớp "Công ty Cổ phần FPT Software"
// Cụm nhiều từ được bỏ trước (theo biên từ) để không xóa nhầm từ đơn có nghĩa như "nam" trong "Nam A Bank"
const GENERIC_COMPANY_PHRASES = [
  "trach nhiem huu han", "mot thanh vien", "thanh vien", "cong ty", "co phan", "tap doan", "viet nam",
];
const GENERIC_COMPANY_TOKENS = new Set([
  "tnhh", "cp", "vietnam", "group", "corp", "corporation", "software", "telecom", "technology",
  "technologies", "solutions", "jsc", "ltd", "co", "inc", "llc", "mtv",
]);

/**
 * Chuẩn hóa tên công ty thành mảng token có nghĩa:
 * bỏ dấu tiếng Việt → bỏ ký tự đặc biệt → bỏ tiền tố/hậu tố chung ("cong ty", "tnhh", "jsc"...)
 */
function normalizeCompanyTokens(name) {
  if (!name || typeof name !== "string") return [];
  let text = ` ${normalizeVi(name).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
  for (const phrase of GENERIC_COMPANY_PHRASES) {
    text = text.split(` ${phrase} `).join(" ");
  }
  return text
    .split(" ")
    .filter((tok) => tok && !GENERIC_COMPANY_TOKENS.has(tok));
}

/**
 * Kiểm tra mảng `needle` có xuất hiện như một dãy token liên tiếp trong `haystack` (khớp theo biên từ,
 * tránh "fpt" khớp nhầm "fptshop" hoặc "ai" khớp nhầm "thai")
 */
function containsTokenSequence(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let matched = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * QA-B09: Ứng viên có muốn ẩn hồ sơ khỏi công ty của Nhà tuyển dụng hiện tại hay không.
 * - Tách danh sách chặn theo `, ; | / xuống dòng`
 * - Chuẩn hóa tiếng Việt + bỏ tiền tố/hậu tố pháp lý
 * - Ẩn nếu từ khóa chặn (≥ 2 ký tự) khớp dãy token trong tên công ty HR hoặc ngược lại
 */
function isHiddenFromEmployer(hideFromCurrentCompany, employerCompanyName) {
  if (!hideFromCurrentCompany || typeof hideFromCurrentCompany !== "string") return false;
  const employerTokens = normalizeCompanyTokens(employerCompanyName);
  if (!employerTokens.length) return false;

  const blockedEntries = hideFromCurrentCompany.split(/[,;|/\n]+/);
  for (const entry of blockedEntries) {
    const blockedTokens = normalizeCompanyTokens(entry);
    if (!blockedTokens.length || blockedTokens.join(" ").length < 2) continue;
    if (
      containsTokenSequence(employerTokens, blockedTokens) ||
      containsTokenSequence(blockedTokens, employerTokens)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Tách chuỗi kỹ năng "ReactJS, NodeJS; C++" thành mảng regex khớp chính xác (không phân biệt hoa thường)
 */
function parseSkillTerms(rawSkill) {
  if (!rawSkill || typeof rawSkill !== "string") return [];
  const seen = new Set();
  return rawSkill
    .split(/[,;|\n]+/)
    .map((s) => s.trim().slice(0, 60))
    .filter((s) => {
      const key = s.toLowerCase();
      if (!s || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SKILL_TERMS);
}

function ensureActiveEmployer(req, res) {
  if (!req.user || req.user.status !== EMPLOYER_STATUS.ACTIVE) {
    const msg = "Tài khoản công ty của bạn đang chờ phê duyệt. Vui lòng đợi Admin kích hoạt trước khi truy cập Kho Ứng viên IT.";
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      res.status(403).json({ success: false, message: msg });
    } else {
      req.flash("error", msg);
      res.redirect("/employer/company-profile");
    }
    return false;
  }
  return true;
}

const BASE_TALENT_FILTER = Object.freeze({
  deletedAt: null,
  status: "active",
  "itProfile.openToWork": { $ne: false },
  "itProfile.title": { $exists: true, $ne: "" },
});

/**
 * Tìm ứng viên Open to Work được phép hiển thị cho công ty hiện tại (dùng chung cho chi tiết / PDF / mời)
 */
async function findVisibleCandidate(candidateId, companyName, select) {
  if (!isValidObjectId(candidateId)) return null;
  const query = Candidate.findOne({ ...BASE_TALENT_FILTER, _id: candidateId });
  if (select) query.select(select);
  const candidate = await query.lean();
  if (!candidate) return null;
  const hideValue = candidate.itProfile ? candidate.itProfile.hideFromCurrentCompany : "";
  if (isHiddenFromEmployer(hideValue, companyName)) return null;
  return candidate;
}

/**
 * Hiển thị Kho Ứng viên IT & Săn đầu người (Talent Pool)
 */
const renderTalentPool = async (req, res) => {
  // Chỉ doanh nghiệp đã được phê duyệt (ACTIVE) mới được xem hồ sơ & email ứng viên
  if (!ensureActiveEmployer(req, res)) return;

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const skill = typeof req.query.skill === "string" ? req.query.skill.trim().slice(0, 200) : "";
  const level = typeof req.query.level === "string" && ALLOWED_POSITION_VALUES.has(req.query.level) ? req.query.level : "";
  const city = typeof req.query.city === "string" && ALLOWED_CITY_VALUES.has(req.query.city) ? req.query.city : "";
  const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim().slice(0, 100) : "";

  const filter = { ...BASE_TALENT_FILTER };

  if (level) {
    filter["itProfile.level"] = level;
  }

  if (city) {
    filter["itProfile.preferredCity"] = city;
  }

  const skillTerms = parseSkillTerms(skill);
  if (skillTerms.length) {
    // Ứng viên chỉ cần khớp MỘT trong các kỹ năng nhập vào (OR) — escape regex chống ReDoS/C++ lỗi cú pháp
    filter["itProfile.skills"] = {
      $in: skillTerms.map((s) => new RegExp(`^${escapeRegex(s)}$`, "i")),
    };
  }

  if (keyword) {
    const escapedKw = escapeRegex(keyword);
    filter.$or = [
      { fullName: { $regex: escapedKw, $options: "i" } },
      { "itProfile.title": { $regex: escapedKw, $options: "i" } },
      { "itProfile.skills": { $regex: escapedKw, $options: "i" } },
      { "itProfile.bio": { $regex: escapedKw, $options: "i" } },
    ];
  }

  // Bảo vệ quyền riêng tư (QA-B09): chỉ quét nhóm ứng viên có cài đặt ẩn công ty (thường rất nhỏ),
  // so khớp chuẩn hóa ở tầng ứng dụng rồi loại trừ bằng $nin để phân trang/đếm tổng vẫn chính xác.
  const companyName = req.user.companyName || "";
  const restricted = await Candidate.find({
    ...filter,
    "itProfile.hideFromCurrentCompany": { $exists: true, $nin: [null, ""] },
  })
    .select("_id itProfile.hideFromCurrentCompany")
    .lean();
  const hiddenIds = restricted
    .filter((c) => isHiddenFromEmployer(c.itProfile && c.itProfile.hideFromCurrentCompany, companyName))
    .map((c) => c._id);
  if (hiddenIds.length) {
    filter._id = { $nin: hiddenIds };
  }

  const total = await Candidate.countDocuments(filter);
  const pagination = paginate(total, page, 12);

  const [candidates, activeJobs] = await Promise.all([
    Candidate.find(filter)
      .select("fullName email avatar itProfile.title itProfile.level itProfile.yearsOfExperience itProfile.bio itProfile.skills itProfile.preferredCity itProfile.expectedSalary itProfile.updatedAt createdAt")
      .sort({ "itProfile.updatedAt": -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Job.find({
      employerId: req.user._id,
      employerActive: true,
      moderation: JOB_MODERATION.VISIBLE,
      deletedAt: null,
    })
      .select("title slug")
      .lean(),
  ]);

  // Query string an toàn cho link phân trang (encodeURIComponent để C++/C# không phá URL)
  const qsParts = [];
  if (keyword) qsParts.push(`keyword=${encodeURIComponent(keyword)}`);
  if (level) qsParts.push(`level=${encodeURIComponent(level)}`);
  if (city) qsParts.push(`city=${encodeURIComponent(city)}`);
  if (skill) qsParts.push(`skill=${encodeURIComponent(skill)}`);

  res.render("pages/employer-talent-pool", {
    title: "Săn Ứng Viên IT & Kho Hồ Sơ (Talent Pool) - VN.ITJobs",
    candidates,
    activeJobs,
    pagination,
    cities: CITIES,
    positions: POSITIONS,
    selectedSkill: skill,
    selectedLevel: level,
    selectedCity: city,
    keyword,
    filterQuery: qsParts.join("&"),
  });
};

/**
 * Xem toàn bộ IT Profile của ứng viên (JSON cho modal hoặc trang HTML fallback)
 */
const renderCandidateProfile = async (req, res) => {
  if (!ensureActiveEmployer(req, res)) return;

  const candidate = await findVisibleCandidate(
    req.params.id,
    req.user.companyName,
    "fullName email phone avatar itProfile createdAt"
  );

  const wantsJson = req.xhr || req.headers.accept?.includes("application/json");
  if (!candidate) {
    if (wantsJson) {
      return res.status(404).json({ success: false, message: "Không tìm thấy ứng viên hoặc ứng viên không công khai hồ sơ." });
    }
    req.flash("error", "Không tìm thấy ứng viên hoặc ứng viên không công khai hồ sơ.");
    return res.redirect("/employer/candidates");
  }

  const it = candidate.itProfile || {};
  const profile = {
    _id: candidate._id,
    fullName: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone || "",
    avatarUrl: candidate.avatar && candidate.avatar.url ? candidate.avatar.url : "",
    title: it.title || "",
    level: it.level || "",
    yearsOfExperience: it.yearsOfExperience || 0,
    bio: it.bio || "",
    skills: it.skills || [],
    expectedSalary: it.expectedSalary || 0,
    preferredCity: it.preferredCity || "",
    githubUrl: safeUrl(it.githubUrl) || "",
    linkedinUrl: safeUrl(it.linkedinUrl) || "",
    portfolioUrl: safeUrl(it.portfolioUrl) || "",
    workExperience: it.workExperience || [],
    projects: (it.projects || []).map((p) => ({ ...p, link: safeUrl(p.link) || "" })),
    education: it.education || [],
    certificates: it.certificates || [],
    updatedAt: it.updatedAt || null,
    pdfUrl: `/employer/candidates/${candidate._id}/pdf`,
  };

  if (wantsJson) {
    return res.json({ success: true, candidate: profile });
  }

  // Fallback không có JS: tải trực tiếp PDF IT Profile
  return res.redirect(profile.pdfUrl);
};

/**
 * Xuất PDF IT Profile (Unicode tiếng Việt) của ứng viên cho Nhà tuyển dụng xem inline
 */
const streamCandidateProfilePdf = async (req, res) => {
  if (!ensureActiveEmployer(req, res)) return;

  const candidate = await findVisibleCandidate(
    req.params.id,
    req.user.companyName,
    "fullName email phone itProfile"
  );
  if (!candidate) {
    return res.status(404).send("Không tìm thấy ứng viên hoặc ứng viên không công khai hồ sơ.");
  }

  const buffer = await generateItProfilePdf(candidate, (candidate.itProfile && candidate.itProfile.title) || "");
  const safeName = String(candidate.fullName || "Ung_vien").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 60);
  setPdfInlineHeaders(res, `IT_Profile_${safeName}.pdf`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Length", buffer.length);
  return res.end(buffer);
};

/**
 * Gửi lời mời ứng tuyển trực tiếp đến Ứng viên (Headhunt Invite)
 */
const postInviteCandidate = async (req, res) => {
  if (!req.user || req.user.status !== EMPLOYER_STATUS.ACTIVE) {
    req.flash("error", "Tài khoản công ty chưa được phê duyệt để gửi lời mời ứng tuyển.");
    return res.redirect("/employer/company-profile");
  }

  const { jobId, message } = req.body;
  const candidateId = req.params.id;

  if (!isValidObjectId(candidateId) || !isValidObjectId(jobId)) {
    req.flash("error", "Mã ứng viên hoặc công việc không hợp lệ.");
    return res.redirect("/employer/candidates");
  }

  const [candidate, job] = await Promise.all([
    Candidate.findOne({
      _id: candidateId,
      deletedAt: null,
      status: "active",
      "itProfile.openToWork": { $ne: false },
    })
      .select("fullName itProfile.hideFromCurrentCompany")
      .lean(),
    Job.findOne({
      _id: jobId,
      employerId: req.user._id,
      employerActive: true,
      moderation: JOB_MODERATION.VISIBLE,
      deletedAt: null,
    }),
  ]);

  const hiddenFromThisCompany = candidate &&
    isHiddenFromEmployer(candidate.itProfile && candidate.itProfile.hideFromCurrentCompany, req.user.companyName);

  if (!candidate || !job || hiddenFromThisCompany) {
    req.flash("error", "Không tìm thấy ứng viên phù hợp hoặc công việc tuyển dụng.");
    return res.redirect("/employer/candidates");
  }

  const inviteMsg = typeof message === "string" && message.trim()
    ? message.trim().slice(0, 1000)
    : `Công ty ${req.user.companyName} rất ấn tượng với hồ sơ của bạn và trân trọng mời bạn tham khảo, ứng tuyển vào vị trí "${job.title}".`;

  // Bắn thông báo In-App cho Ứng viên
  await createNotification({
    recipientId: candidate._id,
    recipientType: "candidate",
    title: `Lời mời ứng tuyển từ ${req.user.companyName}`,
    message: inviteMsg,
    link: `/jobs/${job.slug}`,
    type: "talent_invite",
  });

  req.flash(
    "success",
    `Đã gửi lời mời ứng tuyển thành công đến ứng viên ${candidate.fullName}!`
  );
  res.redirect(getSafeBackRedirect(req, "/employer/candidates"));
};

module.exports = {
  renderTalentPool,
  renderCandidateProfile,
  streamCandidateProfilePdf,
  postInviteCandidate,
  isHiddenFromEmployer,
  normalizeCompanyTokens,
  parseSkillTerms,
};
