// src/controllers/employer/employerTalent.controller.js
const { Candidate, Job } = require("../../models");
const { CITIES, POSITIONS, JOB_MODERATION, EMPLOYER_STATUS } = require("../../config/constants");
const { createNotification } = require("../../services/notification.service");
const paginate = require("../../utils/pagination");
const { escapeRegex, isValidObjectId, getSafeBackRedirect } = require("../../utils/securityHelpers");

const ALLOWED_CITY_VALUES = new Set(CITIES.map((c) => c.value));
const ALLOWED_POSITION_VALUES = new Set(POSITIONS.map((p) => p.value));

/**
 * Hiển thị Kho Ứng viên IT & Săn đầu người (Talent Pool)
 */
const renderTalentPool = async (req, res) => {
  // Chỉ doanh nghiệp đã được phê duyệt (ACTIVE) mới được xem hồ sơ & email ứng viên
  if (!req.user || req.user.status !== EMPLOYER_STATUS.ACTIVE) {
    req.flash("error", "Tài khoản công ty của bạn đang chờ phê duyệt. Vui lòng đợi Admin kích hoạt trước khi truy cập Kho Ứng viên IT.");
    return res.redirect("/employer/company-profile");
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const skill = typeof req.query.skill === "string" ? req.query.skill.trim().slice(0, 60) : "";
  const level = typeof req.query.level === "string" && ALLOWED_POSITION_VALUES.has(req.query.level) ? req.query.level : "";
  const city = typeof req.query.city === "string" && ALLOWED_CITY_VALUES.has(req.query.city) ? req.query.city : "";
  const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim().slice(0, 100) : "";

  const filter = {
    deletedAt: null,
    status: "active",
    "itProfile.openToWork": { $ne: false },
    "itProfile.title": { $exists: true, $ne: "" },
  };

  // Bảo vệ quyền riêng tư: Ẩn với công ty hiện tại nếu ứng viên cài đặt
  if (req.user && req.user.companyName) {
    const escapedCompany = escapeRegex(req.user.companyName);
    if (escapedCompany) {
      filter["itProfile.hideFromCurrentCompany"] = {
        $not: { $regex: new RegExp(`^${escapedCompany}$`, "i") },
      };
    }
  }

  if (level) {
    filter["itProfile.level"] = level;
  }

  if (city) {
    filter["itProfile.preferredCity"] = city;
  }

  if (skill) {
    filter["itProfile.skills"] = { $regex: new RegExp(`^${escapeRegex(skill)}$`, "i") };
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

  const total = await Candidate.countDocuments(filter);
  const pagination = paginate(total, page, 12);

  const [candidates, activeJobs] = await Promise.all([
    Candidate.find(filter)
      .select("fullName email avatar itProfile createdAt")
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
  });
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

  const candidateFilter = {
    _id: candidateId,
    deletedAt: null,
    status: "active",
    "itProfile.openToWork": { $ne: false },
  };
  if (req.user.companyName) {
    const escapedCompany = escapeRegex(req.user.companyName);
    if (escapedCompany) {
      candidateFilter["itProfile.hideFromCurrentCompany"] = {
        $not: { $regex: new RegExp(`^${escapedCompany}$`, "i") },
      };
    }
  }

  const [candidate, job] = await Promise.all([
    Candidate.findOne(candidateFilter),
    Job.findOne({
      _id: jobId,
      employerId: req.user._id,
      employerActive: true,
      moderation: JOB_MODERATION.VISIBLE,
      deletedAt: null,
    }),
  ]);

  if (!candidate || !job) {
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
  postInviteCandidate,
};
