// src/controllers/employer/employerOps.controller.js
const bcrypt = require("bcryptjs");
const { Job, Application, Employer } = require("../../models");
const { APPLICATION_STATUS } = require("../../config/constants");

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
  if (!fullName || !fullName.trim() || !email || !email.trim() || !password) {
    req.flash("error", "Vui lòng nhập đầy đủ họ tên, email và mật khẩu khởi tạo cho chuyên viên.");
    return res.redirect("/employer/team");
  }

  if (password.length < 8) {
    req.flash("error", "Mật khẩu khởi tạo phải có độ dài tối thiểu 8 ký tự.");
    return res.redirect("/employer/team");
  }

  const cleanEmail = email.trim().toLowerCase();
  const employer = await Employer.findById(req.user._id);

  // Kiểm tra trùng email trong nhóm hoặc với email công ty
  const isExist = (employer.teamMembers || []).some((m) => m.email === cleanEmail);
  if (isExist || employer.email === cleanEmail) {
    req.flash("error", "Email này đã tồn tại trong danh sách nhóm tuyển dụng.");
    return res.redirect("/employer/team");
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  employer.teamMembers.push({
    fullName: fullName.trim(),
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
