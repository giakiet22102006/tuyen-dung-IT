// src/routes/employer.route.js
const express = require("express");
const router = express.Router();
const employerAuth = require("../controllers/employer/employerAuth.controller");
const passwordReset = require("../controllers/auth/passwordReset.controller");
const employerJob = require("../controllers/employer/employerJob.controller");
const employerCv = require("../controllers/employer/employerCv.controller");
const employerTalent = require("../controllers/employer/employerTalent.controller");
const employerOps = require("../controllers/employer/employerOps.controller");
const { requireEmployer, requireEmployerAdmin, requireGuest } = require("../middlewares/auth.middleware");
const { doubleCsrfProtection } = require("../middlewares/csrf.middleware");
const { loginRateLimiter, otpRateLimiter } = require("../middlewares/rateLimit.middleware");
const { uploadLogoMiddleware, uploadJobImagesMiddleware } = require("../middlewares/upload.middleware");
const asyncHandler = require("../utils/asyncHandler");
const { isValidObjectId } = require("../utils/securityHelpers");

// Validate ObjectId cho mọi tham số :id trên các route Nhà tuyển dụng (tránh CastError 500)
router.param("id", (req, res, next, id) => {
  if (!isValidObjectId(id)) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(400).json({ success: false, message: "Mã định danh (ID) không hợp lệ." });
    }
    if (req.flash) {
      req.flash("error", "Mã định danh (ID) không hợp lệ.");
    }
    return res.redirect("/employer/jobs");
  }
  next();
});

// Guest routes
router.get("/signup", requireGuest, employerAuth.renderSignup);
router.post("/signup", requireGuest, otpRateLimiter, doubleCsrfProtection, asyncHandler(employerAuth.postSignup));

// Xác thực Email kích hoạt tài khoản công ty
router.get("/verify-registration", requireGuest, employerAuth.renderVerifyRegistration);
router.post("/verify-registration", requireGuest, otpRateLimiter, doubleCsrfProtection, asyncHandler(employerAuth.postVerifyRegistration));
router.post("/resend-registration-otp", requireGuest, otpRateLimiter, doubleCsrfProtection, asyncHandler(employerAuth.postResendRegistrationOtp));

router.get("/login", requireGuest, employerAuth.renderLogin);
router.post("/login", requireGuest, loginRateLimiter, doubleCsrfProtection, asyncHandler(employerAuth.postLogin));

// Đăng nhập / Đăng ký nhanh với Google
router.get("/auth/google", requireGuest, employerAuth.redirectToGoogle);
router.get("/auth/google/callback", requireGuest, asyncHandler(employerAuth.handleGoogleCallback));

// Quên & Đặt lại mật khẩu (OTP qua Gmail)
router.get("/forgot-password", requireGuest, passwordReset.renderForgotPassword("employer"));
router.post("/forgot-password", requireGuest, otpRateLimiter, doubleCsrfProtection, asyncHandler(passwordReset.postForgotPassword("employer")));

router.get("/verify-otp", requireGuest, passwordReset.renderVerifyOtp("employer"));
router.post("/verify-otp", requireGuest, otpRateLimiter, doubleCsrfProtection, asyncHandler(passwordReset.postVerifyOtp("employer")));

router.get("/reset-password", requireGuest, asyncHandler(passwordReset.renderResetPassword("employer")));
router.post("/reset-password", requireGuest, otpRateLimiter, doubleCsrfProtection, asyncHandler(passwordReset.postResetPassword("employer")));

// Authenticated routes
router.post("/logout", doubleCsrfProtection, asyncHandler(employerAuth.postLogout));

router.get("/change-password", requireEmployer, employerAuth.renderChangePassword);
router.post("/change-password", requireEmployer, doubleCsrfProtection, asyncHandler(employerAuth.postChangePassword));

// Hồ sơ công ty
router.get("/company-profile", requireEmployer, asyncHandler(employerJob.renderCompanyProfile));
router.post("/company-profile", requireEmployer, uploadLogoMiddleware, doubleCsrfProtection, asyncHandler(employerJob.postCompanyProfile));

// Quản lý việc làm
router.get("/post-job", (req, res) => res.redirect("/employer/jobs/create"));
router.get("/jobs", requireEmployer, asyncHandler(employerJob.renderManageJobs));
router.get("/jobs/create", requireEmployer, employerJob.renderCreateJob);
router.post("/jobs/create", requireEmployer, uploadJobImagesMiddleware, doubleCsrfProtection, asyncHandler(employerJob.postCreateJob));
router.get("/jobs/:id/edit", requireEmployer, asyncHandler(employerJob.renderEditJob));
router.post("/jobs/:id/edit", requireEmployer, uploadJobImagesMiddleware, doubleCsrfProtection, asyncHandler(employerJob.postEditJob));
router.post("/jobs/:id/delete", requireEmployer, doubleCsrfProtection, asyncHandler(employerJob.postDeleteJob));

// Quản lý CV ứng tuyển & Hiring Pipeline
router.get("/cvs", requireEmployer, asyncHandler(employerCv.renderManageCv));
router.get("/pipeline", requireEmployer, asyncHandler(employerCv.renderHiringPipeline));
router.get("/cvs/:id", requireEmployer, asyncHandler(employerCv.renderCvDetails));
router.post("/cvs/:id/status", requireEmployer, doubleCsrfProtection, asyncHandler(employerCv.postCvStatus));
router.post("/cvs/:id/invite", requireEmployer, doubleCsrfProtection, asyncHandler(employerCv.postSendInterviewInvite));
router.post("/cvs/:id/ai-draft-invite", requireEmployer, doubleCsrfProtection, asyncHandler(employerCv.postAiDraftInterviewInvite));
router.post("/cvs/:id/ai-draft-rejection", requireEmployer, doubleCsrfProtection, asyncHandler(employerCv.postAiDraftRejection));
router.post("/cvs/:id/notes", requireEmployer, doubleCsrfProtection, asyncHandler(employerCv.postAddInternalNote));
router.post("/cvs/:id/rating", requireEmployer, doubleCsrfProtection, asyncHandler(employerCv.postUpdateRating));
router.post("/cvs/:id/schedule", requireEmployer, doubleCsrfProtection, asyncHandler(employerCv.postScheduleInterview));
router.post("/cvs/:id/delete", requireEmployer, doubleCsrfProtection, asyncHandler(employerCv.postDeleteCv));
router.get("/cvs/:id/pdf", requireEmployer, asyncHandler(employerCv.streamEmployerCvPdf));

// Kho Ứng viên IT & Săn đầu người (Talent Pool)
router.get("/candidates", requireEmployer, asyncHandler(employerTalent.renderTalentPool));
router.post("/candidates/:id/invite", requireEmployer, doubleCsrfProtection, asyncHandler(employerTalent.postInviteCandidate));

// Báo cáo & Phân tích tuyển dụng (Analytics)
router.get("/analytics", requireEmployer, asyncHandler(employerOps.renderAnalytics));

// Quản lý Đội ngũ Tuyển dụng (Multi-Recruiter Team) — chỉ Admin công ty mới được thao tác
router.get("/team", requireEmployer, requireEmployerAdmin, asyncHandler(employerOps.renderTeam));
router.post("/team", requireEmployer, requireEmployerAdmin, doubleCsrfProtection, asyncHandler(employerOps.postAddTeamMember));
router.post("/team/:memberId/delete", requireEmployer, requireEmployerAdmin, doubleCsrfProtection, asyncHandler(employerOps.postRemoveTeamMember));

module.exports = router;
