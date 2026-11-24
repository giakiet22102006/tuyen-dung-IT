// src/controllers/admin/adminLog.controller.js
const { AuditLog, Admin } = require("../../models");
const paginate = require("../../utils/pagination");
const { escapeRegex, isValidObjectId } = require("../../utils/securityHelpers");

const renderLogs = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const adminId = isValidObjectId(req.query.adminId) ? req.query.adminId : "";
  const action = typeof req.query.action === "string" ? req.query.action.trim().slice(0, 100) : "";

  const filter = {};
  if (adminId) {
    filter.adminId = adminId;
  }
  if (action) {
    filter.action = new RegExp(escapeRegex(action), "i");
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
