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
    Candidate.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Employer.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  // Chuẩn bị dữ liệu 30 ngày cho Chart.js
  const dates = [];
  const candidateCounts = [];
  const employerCounts = [];

  const candMap = new Map(candidateRegistrations.map((r) => [r._id, r.count]));
  const empMap = new Map(employerRegistrations.map((r) => [r._id, r.count]));

  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const displayLabel = `${d.getDate()}/${d.getMonth() + 1}`;

    dates.push(displayLabel);
    candidateCounts.push(candMap.get(dateStr) || 0);
    employerCounts.push(empMap.get(dateStr) || 0);
  }

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
    chartData: {
      labels: dates,
      candidates: candidateCounts,
      employers: employerCounts,
    },
  });
};

module.exports = {
  renderDashboard,
};
