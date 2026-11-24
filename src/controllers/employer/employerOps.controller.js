// src/controllers/employer/employerOps.controller.js
const bcrypt = require("bcryptjs");
const { Job, Application, Employer } = require("../../models");
const { isValidObjectId } = require("../../utils/securityHelpers");

/**
 * Báo cáo & Phân tích tuyển dụng (Recruitment Analytics Dashboard)
 */
const renderAnalytics = async (req, res) => {
  const employerId = req.user._id;

  const [jobs, applications] = await Promise.all([
    Job.find({ employerId, deletedAt: null })
      .select("title slug position city viewsCount employerActive moderation createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    Application.find({ employerId, hiddenByEmployer: false })
      .select("jobId status createdAt")
      .lean(),
  ]);

  const totalJobs = jobs.length;
  const activeJobsCount = jobs.filter((j) => j.employerActive && j.moderation === "visible").length;
  const totalViews = jobs.reduce((sum, j) => sum + (j.viewsCount || 0), 0);
  const totalApplications = applications.length;

  const conversionRate = totalViews > 0
    ? ((totalApplications / totalViews) * 100).toFixed(1)
    : "0.0";

  // Phân bổ trạng thái ứng viên (Pipeline breakdown)
  const pipelineStats = {
    pending: 0,
    reviewing: 0,
    interviewing: 0,
    approved: 0,
    rejected: 0,
  };

  applications.forEach((app) => {
    if (pipelineStats[app.status] !== undefined) {
      pipelineStats[app.status]++;
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
    const rate = views > 0 ? ((jobApps / views) * 100).toFixed(1) : "0.0";
    return {
      ...job,
      applicationsCount: jobApps,
      conversionRate: rate,
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
    jobs: jobsWithStats,
  });
};

/**
 * Hiển thị Quản lý Đội ngũ Tuyển dụng (Recruiter Team Members)
 */
const renderTeam = async (req, res) => {
  const employer = await Employer.findById(req.user._id).select("teamMembers companyName email");
  const members = (employer && employer.teamMembers) || [];

  res.render("pages/employer-team", {
    title: "Quản lý Đội ngũ Tuyển dụng (HR Team) - VN.ITJobs",
    members,
    companyName: req.user.companyName,
    ownerEmail: req.user.email,
  });
};

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

  if (password.length < 8 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)) {
    req.flash("error", "Mật khẩu khởi tạo phải có tối thiểu 8 ký tự, gồm cả chữ và số.");
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
    role: role === "admin" ? "admin" : "recruiter",
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

  employer.teamMembers = (employer.teamMembers || []).filter(
    (m) => m._id.toString() !== memberId
  );

  await employer.save();
  req.flash("success", "Đã xóa thành viên khỏi nhóm tuyển dụng.");
  res.redirect("/employer/team");
};

module.exports = {
  renderAnalytics,
  renderTeam,
  postAddTeamMember,
  postRemoveTeamMember,
};
