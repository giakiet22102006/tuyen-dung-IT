// src/routes/admin.route.js
const express = require("express");
const router = express.Router();

const adminAuth = require("../controllers/admin/adminAuth.controller");
const adminDashboard = require("../controllers/admin/adminDashboard.controller");
const adminEmployer = require("../controllers/admin/adminEmployer.controller");
const adminCandidate = require("../controllers/admin/adminCandidate.controller");
const adminLog = require("../controllers/admin/adminLog.controller");
const adminFeedback = require("../controllers/admin/adminFeedback.controller");

const { requireAdmin, requireSuperAdmin, adminSecurityHeaders } = require("../middlewares/auth.middleware");
const { doubleCsrfProtection } = require("../middlewares/csrf.middleware");
const { adminLoginRateLimiter } = require("../middlewares/rateLimit.middleware");
const asyncHandler = require("../utils/asyncHandler");

// Áp dụng header bảo mật chống robot cho toàn bộ trang Admin
router.use(adminSecurityHeaders);

// Auth routes
router.get("/login", adminAuth.renderLogin);
router.post("/login", adminLoginRateLimiter, doubleCsrfProtection, asyncHandler(adminAuth.postLogin));
router.get("/verify-2fa", adminAuth.renderVerify2Fa);
router.post("/verify-2fa", adminLoginRateLimiter, doubleCsrfProtection, asyncHandler(adminAuth.postVerify2Fa));
router.post("/resend-2fa", adminLoginRateLimiter, doubleCsrfProtection, asyncHandler(adminAuth.postResend2Fa));
router.post("/logout", doubleCsrfProtection, adminAuth.postLogout);

// Dashboard
router.get("/", requireAdmin, asyncHandler(adminDashboard.renderDashboard));

// Quản lý Nhà tuyển dụng
router.get("/employers", requireAdmin, asyncHandler(adminEmployer.renderList));
router.get("/employers/create", requireAdmin, adminEmployer.renderCreate);
router.post("/employers/create", requireAdmin, doubleCsrfProtection, asyncHandler(adminEmployer.postCreate));
router.post("/employers/bulk", requireAdmin, doubleCsrfProtection, asyncHandler(adminEmployer.postBulkAction));
router.get("/employers/:id", requireAdmin, asyncHandler(adminEmployer.renderDetail));
router.get("/employers/:id/edit", requireAdmin, asyncHandler(adminEmployer.renderEdit));
router.post("/employers/:id/edit", requireAdmin, doubleCsrfProtection, asyncHandler(adminEmployer.postEdit));
router.post("/employers/:id/approve", requireAdmin, doubleCsrfProtection, asyncHandler(adminEmployer.postApprove));
router.post("/employers/:id/ban", requireAdmin, doubleCsrfProtection, asyncHandler(adminEmployer.postBan));
router.post("/employers/:id/unban", requireAdmin, doubleCsrfProtection, asyncHandler(adminEmployer.postUnban));
router.post("/employers/:id/reset-password", requireAdmin, doubleCsrfProtection, asyncHandler(adminEmployer.postResetPassword));
router.post("/employers/:id/delete", requireAdmin, doubleCsrfProtection, asyncHandler(adminEmployer.postSoftDelete));
router.post("/employers/:id/restore", requireAdmin, doubleCsrfProtection, asyncHandler(adminEmployer.postRestore));
router.post("/employers/:id/hard-delete", requireAdmin, requireSuperAdmin, doubleCsrfProtection, asyncHandler(adminEmployer.postHardDelete));
router.post("/jobs/:id/moderation", requireAdmin, doubleCsrfProtection, asyncHandler(adminEmployer.postToggleJobModeration));

// Quản lý Ứng viên
router.get("/candidates", requireAdmin, asyncHandler(adminCandidate.renderList));
router.get("/candidates/create", requireAdmin, adminCandidate.renderCreate);
router.post("/candidates/create", requireAdmin, doubleCsrfProtection, asyncHandler(adminCandidate.postCreate));
router.post("/candidates/bulk", requireAdmin, doubleCsrfProtection, asyncHandler(adminCandidate.postBulkAction));
router.get("/candidates/:id", requireAdmin, asyncHandler(adminCandidate.renderDetail));
router.get("/candidates/:id/edit", requireAdmin, asyncHandler(adminCandidate.renderEdit));
router.post("/candidates/:id/edit", requireAdmin, doubleCsrfProtection, asyncHandler(adminCandidate.postEdit));
router.post("/candidates/:id/ban", requireAdmin, doubleCsrfProtection, asyncHandler(adminCandidate.postBan));
router.post("/candidates/:id/unban", requireAdmin, doubleCsrfProtection, asyncHandler(adminCandidate.postUnban));
router.post("/candidates/:id/reset-password", requireAdmin, doubleCsrfProtection, asyncHandler(adminCandidate.postResetPassword));
router.post("/candidates/:id/delete", requireAdmin, doubleCsrfProtection, asyncHandler(adminCandidate.postSoftDelete));
router.post("/candidates/:id/restore", requireAdmin, doubleCsrfProtection, asyncHandler(adminCandidate.postRestore));
router.post("/candidates/:id/hard-delete", requireAdmin, requireSuperAdmin, doubleCsrfProtection, asyncHandler(adminCandidate.postHardDelete));

// Nhật ký hệ thống (Audit Logs)
router.get("/logs", requireAdmin, asyncHandler(adminLog.renderLogs));

// Quản lý Báo cáo sự cố & Đánh giá web
router.get("/feedbacks", requireAdmin, asyncHandler(adminFeedback.renderFeedbacks));
router.post("/feedbacks/:id/status", requireAdmin, doubleCsrfProtection, asyncHandler(adminFeedback.postUpdateStatus));
router.post("/feedbacks/:id/delete", requireAdmin, doubleCsrfProtection, asyncHandler(adminFeedback.postDeleteFeedback));

module.exports = router;
