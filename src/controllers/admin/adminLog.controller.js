// src/controllers/admin/adminLog.controller.js
const { AuditLog, Admin } = require("../../models");
const paginate = require("../../utils/pagination");

const renderLogs = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const { adminId, action } = req.query;

  const filter = {};
  if (adminId) {
    filter.adminId = adminId;
  }
  if (action && action.trim()) {
    filter.action = new RegExp(action.trim(), "i");
  }

  const total = await AuditLog.countDocuments(filter);
  const pagination = paginate(total, page, 20);

  const [logs, adminList] = await Promise.all([
    AuditLog.find(filter)
      .populate("adminId", "fullName email")
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Admin.find({}).select("fullName email _id").lean(),
  ]);

  res.render("admin/logs/index", {
    title: "Nhật ký hệ thống (Audit Logs) - VN.ITJobs Admin",
    logs,
    adminList,
    pagination,
    filter: {
      adminId: adminId || "",
      action: action || "",
    },
  });
};

module.exports = {
  renderLogs,
};
