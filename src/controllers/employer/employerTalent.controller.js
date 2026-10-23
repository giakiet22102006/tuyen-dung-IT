// src/controllers/employer/employerTalent.controller.js
const { Candidate, Job } = require("../../models");
const { CITIES, POSITIONS, JOB_MODERATION } = require("../../config/constants");
const { createNotification } = require("../../services/notification.service");
const paginate = require("../../utils/pagination");

/**
 * Hiển thị Kho Ứng viên IT & Săn đầu người (Talent Pool)
 */
const renderTalentPool = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const { skill, level, city, keyword } = req.query;

  const filter = {
    deletedAt: null,
    status: "active",
    "itProfile.openToWork": { $ne: false },
    "itProfile.title": { $exists: true, $ne: "" },
  };

  // Bảo vệ quyền riêng tư: Ẩn với công ty hiện tại nếu ứng viên cài đặt
  if (req.user && req.user.companyName) {
    const currentName = req.user.companyName.trim();
    filter["itProfile.hideFromCurrentCompany"] = {
      $not: { $regex: new RegExp(`^${currentName}$`, "i") },
    };
  }

  if (level) {
    filter["itProfile.level"] = level;
  }

  if (city) {
    filter["itProfile.preferredCity"] = city;
  }

  if (skill) {
    filter["itProfile.skills"] = { $regex: new RegExp(`^${skill.trim()}$`, "i") };
  }

  if (keyword) {
    const kw = keyword.trim();
    filter.$or = [
      { fullName: { $regex: kw, $options: "i" } },
      { "itProfile.title": { $regex: kw, $options: "i" } },
      { "itProfile.skills": { $regex: kw, $options: "i" } },
      { "itProfile.bio": { $regex: kw, $options: "i" } },
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
    selectedSkill: skill || "",
    selectedLevel: level || "",
    selectedCity: city || "",
    keyword: keyword || "",
  });
};

/**
 * Gửi lời mời ứng tuyển trực tiếp đến Ứng viên (Headhunt Invite)
 */
const postInviteCandidate = async (req, res) => {
  const { jobId, message } = req.body;
  const candidateId = req.params.id;

  const [candidate, job] = await Promise.all([
    Candidate.findOne({ _id: candidateId, deletedAt: null, status: "active" }),
    Job.findOne({
      _id: jobId,
      employerId: req.user._id,
      employerActive: true,
      moderation: JOB_MODERATION.VISIBLE,
      deletedAt: null,
    }),
  ]);

  if (!candidate || !job) {
    req.flash("error", "Không tìm thấy thông tin ứng viên hoặc công việc tuyển dụng.");
    return res.redirect("/employer/candidates");
  }

  const inviteMsg = message && message.trim()
    ? message.trim()
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
  res.redirect(req.headers.referer || "/employer/candidates");
};

module.exports = {
  renderTalentPool,
  postInviteCandidate,
};
