// src/controllers/admin/adminDashboard.controller.js
const { Candidate, Employer, Job, Application } = require("../../models");
const { EMPLOYER_STATUS } = require("../../config/constants");

const renderDashboard = async (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const [
    totalCandidates,
    totalEmployers,
    pendingEmployersCount,
    totalJobs,
    totalApplications,
    latestPendingEmployers,
    latestRegisteredEmployers,
    candidateRegistrations,
    employerRegistrations,
  ] = await Promise.all([
    Candidate.countDocuments({ deletedAt: null }),
    Employer.countDocuments({ deletedAt: null }),
    Employer.countDocuments({ status: EMPLOYER_STATUS.PENDING, deletedAt: null }),
    Job.countDocuments({ deletedAt: null }),
    Application.countDocuments({}),
    Employer.find({ status: EMPLOYER_STATUS.PENDING, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Employer.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Candidate.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+07:00" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Employer.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+07:00" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  // Chuẩn bị dữ liệu 30 ngày cho Chart.js (theo giờ Việt Nam)
  const dates = [];
  const candidateCounts = [];
  const employerCounts = [];

  const candMap = new Map(candidateRegistrations.map((r) => [r._id, r.count]));
  const empMap = new Map(employerRegistrations.map((r) => [r._id, r.count]));

  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    const displayLabel = `${d.getDate()}/${d.getMonth() + 1}`;

    dates.push(displayLabel);
    candidateCounts.push(candMap.get(dateStr) || 0);
    employerCounts.push(empMap.get(dateStr) || 0);
  }

  // Số lượng đăng ký hôm nay
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayCandidates = candMap.get(todayStr) || 0;
  const todayEmployers = empMap.get(todayStr) || 0;

  res.render("admin/dashboard", {
    title: "Bảng điều khiển Quản trị - VN.ITJobs",
    stats: {
      totalCandidates,
      totalEmployers,
      pendingEmployers: pendingEmployersCount,
      totalJobs,
      totalApplications,
    },
    latestPendingEmployers,
    latestRegisteredEmployers,
    chartData: {
      labels: dates,
      candidates: candidateCounts,
      employers: employerCounts,
      todayCandidates,
      todayEmployers,
    },
  });
};

module.exports = {
  renderDashboard,
};
