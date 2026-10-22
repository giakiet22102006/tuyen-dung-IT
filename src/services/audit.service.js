// src/services/audit.service.js
const { AuditLog } = require("../models");

/**
 * Ghi lại nhật ký thao tác của Admin
 * @param {Object} params
 * @param {string|ObjectId} params.adminId ID của admin thực hiện
 * @param {string} params.action Tên hành động (vd: "employer.approve", "candidate.ban")
 * @param {string} params.targetType Loại đối tượng ("Employer" | "Candidate" | "Job" | "System")
 * @param {string} params.targetId ID của đối tượng bị tác động
 * @param {Object} [params.meta] Dữ liệu bổ sung (lý do khóa, mật khẩu tạm đã đổi, ...)
 * @param {string} [params.ip] IP của admin
 */
async function logAdminAction({ adminId, action, targetType, targetId, meta = {}, ip = "" }) {
  try {
    await AuditLog.create({
      adminId,
      action,
      targetType,
      targetId: String(targetId),
      meta,
      ip: ip || "",
    });
  } catch (err) {
    console.error("Lỗi ghi AuditLog:", err.message);
  }
}

module.exports = {
  logAdminAction,
};
