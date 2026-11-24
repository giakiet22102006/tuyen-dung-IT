// src/controllers/employer/employerOps.controller.js
const bcrypt = require("bcryptjs");
const { Job, Application, Employer } = require("../../models");
const { APPLICATION_STATUS, APPLICATION_STATUS_LABELS } = require("../../config/constants");
const { isValidObjectId } = require("../../utils/securityHelpers");

const PIPELINE_STAGES = Object.values(APPLICATION_STATUS); // 6 vòng: pending → approved → interviewing → offered → hired / rejected
const PASSWORD_POLICY_REGEX = /(?=.*[a-zA-Z])(?=.*[0-9])/;

/**
 * Tỷ lệ chuyển đổi CV/View luôn bị chặn trong [0, 100] — tránh hiển thị 133.3% khi view
 * chưa kịp ghi nhận (job mới, bot chặn, cache) hoặc dữ liệu seed lệch.
 * Trả về 0 khi chưa có lượt xem (UI kiểm tra views === 0 để hiển thị "—" thay vì 0% gây hiểu nhầm).
 */
function computeConversionRate(applications, views) {
  if (!views || views <= 0) return 0;
  return Math.min(100, Number(((applications / views) * 100).toFixed(1)));
}

/**
 * Báo cáo & Phân tích tuyển dụng (Recruitment Analytics Dashboard)
 */
const renderAnalytics = async (req, res) => {
  const employerId = req.user._id;

  const jobs = await Job.find({ employerId, deletedAt: null })
    .select("title slug position city viewsCount employerActive moderation createdAt")
    .sort({ createdAt: -1 })
    .lean();

  // Chỉ đếm hồ sơ thuộc các tin tuyển dụng còn tồn tại (bỏ job đã xóa mềm) để tử số khớp mẫu số
  const jobIds = jobs.map((j) => j._id);
  const applications = jobIds.length
    ? await Application.find({ employerId, hiddenByEmployer: false, jobId: { $in: jobIds } })
      .select("jobId status createdAt")
      .lean()
    : [];

  const totalJobs = jobs.length;
  const activeJobsCount = jobs.filter((j) => j.employerActive && j.moderation === "visible").length;
  const totalViews = jobs.reduce((sum, j) => sum + (j.viewsCount || 0), 0);
  const totalApplications = applications.length;
  const conversionRate = computeConversionRate(totalApplications, totalViews);

  // Phân bổ trạng thái ứng viên theo đủ 6 vòng ATS
  const pipelineStats = PIPELINE_STAGES.reduce((acc, st) => {
    acc[st] = 0;
    return acc;
  }, {});

  applications.forEach((app) => {
    const st = app.status || APPLICATION_STATUS.PENDING;
    if (pipelineStats[st] !== undefined) {
      pipelineStats[st]++;
    }
  });

  // Đếm số lượng ứng tuyển cho từng tin tuyển dụng
  const appCountByJob = new Map();
  applications.forEach((app) => {
    const jId = app.jobId ? app.jobId.toString() : "";
    if (jId) {
      appCountByJob.set(jId, (appCountByJob.get(jId) || 0) + 1);
    }
  });

  const jobsWithStats = jobs.map((job) => {
    const jobApps = appCountByJob.get(job._id.toString()) || 0;
    const views = job.viewsCount || 0;
    return {
      ...job,
      applicationsCount: jobApps,
      conversionRate: computeConversionRate(jobApps, views),
    };
  });

  res.render("pages/employer-analytics", {
    title: "Báo cáo & Phân tích Hiệu suất Tuyển dụng - VN.ITJobs",
    totalJobs,
    activeJobsCount,
    totalViews,
    totalApplications,
    conversionRate,
    pipelineStats,
    pipelineStages: PIPELINE_STAGES,
    statusLabels: APPLICATION_STATUS_LABELS,
    jobs: jobsWithStats,
  });
};

/**
 * Hiển thị Quản lý Đội ngũ Tuyển dụng (Recruiter Team Members)
 */
const renderTeam = async (req, res) => {
  const employer = await Employer.findById(req.user._id).select("teamMembers companyName email");
  const members = (employer && employer.teamMembers) || [];
  const currentMember = req.user.currentMember || null;

  res.render("pages/employer-team", {
    title: "Quản lý Đội ngũ Tuyển dụng (HR Team) - VN.ITJobs",
    members,
    companyName: req.user.companyName,
    ownerEmail: req.user.email,
    isOwner: !currentMember,
    currentMemberId: currentMember && currentMember._id ? currentMember._id.toString() : "",
  });
};

/**
 * Quyền quản lý 1 thành viên: Owner quản lý tất cả; Admin phụ chỉ quản lý được Chuyên viên (recruiter),
 * không được đụng tới Admin khác (chống leo thang/khóa chéo giữa các admin phụ)
 */
function canManageMember(req, member) {
  if (!member) return false;
  if (!req.user.currentMember) return true; // Owner
  return member.role !== "admin";
}

/**
 * Thêm chuyên viên tuyển dụng mới vào nhóm công ty
 */
const postAddTeamMember = async (req, res) => {
  const { fullName, email, password, role } = req.body;
  if (
    typeof fullName !== "string" || !fullName.trim() ||
    typeof email !== "string" || !email.trim() || !email.includes("@") ||
    typeof password !== "string" || !password
  ) {
    req.flash("error", "Vui lòng nhập đầy đủ họ tên, email hợp lệ và mật khẩu khởi tạo cho chuyên viên.");
    return res.redirect("/employer/team");
  }

  if (password.length < 8 || !PASSWORD_POLICY_REGEX.test(password)) {
    req.flash("error", "Mật khẩu khởi tạo phải có tối thiểu 8 ký tự, gồm cả chữ và số.");
    return res.redirect("/employer/team");
  }

  // Chỉ Chủ công ty mới được cấp quyền Quản trị nhóm (admin) cho thành viên mới
  const targetRole = role === "admin" ? "admin" : "recruiter";
  if (targetRole === "admin" && req.user.currentMember) {
    req.flash("error", "Chỉ Chủ tài khoản công ty mới có quyền thêm Quản trị viên nhóm.");
    return res.redirect("/employer/team");
  }

  const cleanEmail = email.trim().toLowerCase();
  const employer = await Employer.findById(req.user._id);

  if ((employer.teamMembers || []).length >= 50) {
    req.flash("error", "Đã đạt giới hạn tối đa 50 thành viên trong nhóm tuyển dụng.");
    return res.redirect("/employer/team");
  }

  // Kiểm tra trùng email trên toàn hệ thống Nhà tuyển dụng (chặn xung đột chéo giữa các công ty khi đăng nhập)
  const globalEmailConflict = await Employer.exists({
    $or: [{ email: cleanEmail }, { "teamMembers.email": cleanEmail }],
  });
  if (globalEmailConflict) {
    req.flash("error", "Email này đã được sử dụng trên hệ thống Nhà tuyển dụng.");
    return res.redirect("/employer/team");
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  employer.teamMembers.push({
    fullName: fullName.trim().slice(0, 120),
    email: cleanEmail,
    password: hashedPassword,
    role: targetRole,
    tokenVersion: 0,
    createdAt: new Date(),
  });

  await employer.save();
  req.flash("success", `Đã thêm chuyên viên tuyển dụng "${fullName.trim()}" (${cleanEmail}) thành công!`);
  res.redirect("/employer/team");
};

/**
 * Xóa thành viên khỏi nhóm tuyển dụng
 */
const postRemoveTeamMember = async (req, res) => {
  const { memberId } = req.params;
  if (!isValidObjectId(memberId)) {
    req.flash("error", "Mã thành viên không hợp lệ.");
    return res.redirect("/employer/team");
  }

  if (req.user.currentMember && req.user.currentMember._id.toString() === memberId) {
    req.flash("error", "Bạn không thể tự xóa chính tài khoản đang đăng nhập.");
    return res.redirect("/employer/team");
  }

  const employer = await Employer.findById(req.user._id);
  const target = (employer.teamMembers || []).find((m) => m._id.toString() === memberId);
  if (!target) {
    req.flash("error", "Không tìm thấy thành viên cần xóa.");
    return res.redirect("/employer/team");
  }

  if (!canManageMember(req, target)) {
    req.flash("error", "Chỉ Chủ tài khoản công ty mới có quyền xóa Quản trị viên nhóm khác.");
    return res.redirect("/employer/team");
  }

  employer.teamMembers = (employer.teamMembers || []).filter(
    (m) => m._id.toString() !== memberId
  );

  await employer.save();
  req.flash("success", "Đã xóa thành viên khỏi nhóm tuyển dụng.");
  res.redirect("/employer/team");
};

/**
 * Cấp lại mật khẩu cho thành viên nhóm (QA-M09): Owner (hoặc Admin phụ với Chuyên viên) đặt mật khẩu mới,
 * đồng thời tăng tokenVersion để đăng xuất mọi phiên cũ của thành viên đó.
 */
const postResetTeamMemberPassword = async (req, res) => {
  const { memberId } = req.params;
  const { newPassword } = req.body || {};

  if (!isValidObjectId(memberId)) {
    req.flash("error", "Mã thành viên không hợp lệ.");
    return res.redirect("/employer/team");
  }

  if (req.user.currentMember && req.user.currentMember._id.toString() === memberId) {
    req.flash("error", "Hãy dùng trang Đổi mật khẩu để thay đổi mật khẩu của chính bạn.");
    return res.redirect("/employer/team");
  }

  if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128 || !PASSWORD_POLICY_REGEX.test(newPassword)) {
    req.flash("error", "Mật khẩu mới phải có tối thiểu 8 ký tự, gồm cả chữ và số.");
    return res.redirect("/employer/team");
  }

  const employer = await Employer.findById(req.user._id).select("+teamMembers.password");
  const target = employer && (employer.teamMembers || []).find((m) => m._id.toString() === memberId);
  if (!target) {
    req.flash("error", "Không tìm thấy thành viên cần cấp lại mật khẩu.");
    return res.redirect("/employer/team");
  }

  if (!canManageMember(req, target)) {
    req.flash("error", "Chỉ Chủ tài khoản công ty mới có quyền cấp lại mật khẩu cho Quản trị viên nhóm.");
    return res.redirect("/employer/team");
  }

  target.password = await bcrypt.hash(newPassword, 12);
  target.tokenVersion = (target.tokenVersion || 0) + 1; // Hủy mọi phiên đăng nhập cũ của thành viên
  await employer.save();

  req.flash("success", `Đã cấp lại mật khẩu cho "${target.fullName}" (${target.email}). Hãy gửi mật khẩu mới cho thành viên qua kênh an toàn.`);
  res.redirect("/employer/team");
};

module.exports = {
  renderAnalytics,
  renderTeam,
  postAddTeamMember,
  postRemoveTeamMember,
  postResetTeamMemberPassword,
  computeConversionRate,
};
