// src/routes/employer.route.js
const express = require("express");
const router = express.Router();
const employerAuth = require("../controllers/employer/employerAuth.controller");
const passwordReset = require("../controllers/auth/passwordReset.controller");
const employerJob = require("../controllers/employer/employerJob.controller");
const employerCv = require("../controllers/employer/employerCv.controller");
const { requireEmployer, requireGuest } = require("../middlewares/auth.middleware");
const { doubleCsrfProtection } = require("../middlewares/csrf.middleware");
const { loginRateLimiter, otpRateLimiter } = require("../middlewares/rateLimit.middleware");
const { uploadLogoMiddleware, uploadJobImagesMiddleware } = require("../middlewares/upload.middleware");
const asyncHandler = require("../utils/asyncHandler");

// Guest routes
router.get("/signup", requireGuest, employerAuth.renderSignup);
router.post("/signup", requireGuest, doubleCsrfProtection, asyncHandler(employerAuth.postSignup));

// Xác thực Email kích hoạt tài khoản công ty
router.get("/verify-registration", requireGuest, employerAuth.renderVerifyRegistration);
router.post("/verify-registration", requireGuest, doubleCsrfProtection, asyncHandler(employerAuth.postVerifyRegistration));
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
router.post("/verify-otp", requireGuest, doubleCsrfProtection, asyncHandler(passwordReset.postVerifyOtp("employer")));

router.get("/reset-password", requireGuest, asyncHandler(passwordReset.renderResetPassword("employer")));
router.post("/reset-password", requireGuest, doubleCsrfProtection, asyncHandler(passwordReset.postResetPassword("employer")));

// Authenticated routes
router.post("/logout", doubleCsrfProtection, employerAuth.postLogout);

router.get("/change-password", requireEmployer, employerAuth.renderChangePassword);
router.post("/change-password", requireEmployer, doubleCsrfProtection, asyncHandler(employerAuth.postChangePassword));

// Hồ sơ công ty
router.get("/company-profile", requireEmployer, asyncHandler(employerJob.renderCompanyProfile));
router.post("/company-profile", requireEmployer, uploadLogoMiddleware, doubleCsrfProtection, asyncHandler(employerJob.postCompanyProfile));

// Quản lý việc làm
router.get("/jobs", requireEmployer, asyncHandler(employerJob.renderManageJobs));
router.get("/jobs/create", requireEmployer, employerJob.renderCreateJob);
router.post("/jobs/create", requireEmployer, uploadJobImagesMiddleware, doubleCsrfProtection, asyncHandler(employerJob.postCreateJob));
router.get("/jobs/:id/edit", requireEmployer, asyncHandler(employerJob.renderEditJob));
router.post("/jobs/:id/edit", requireEmployer, uploadJobImagesMiddleware, doubleCsrfProtection, asyncHandler(employerJob.postEditJob));
router.post("/jobs/:id/delete", requireEmployer, doubleCsrfProtection, asyncHandler(employerJob.postDeleteJob));

// Quản lý CV ứng tuyển
router.get("/cvs", requireEmployer, asyncHandler(employerCv.renderManageCv));
router.get("/cvs/:id", requireEmployer, asyncHandler(employerCv.renderCvDetails));
router.post("/cvs/:id/status", requireEmployer, doubleCsrfProtection, asyncHandler(employerCv.postCvStatus));
router.post("/cvs/:id/invite", requireEmployer, doubleCsrfProtection, asyncHandler(employerCv.postSendInterviewInvite));
router.post("/cvs/:id/ai-draft-invite", requireEmployer, asyncHandler(employerCv.postAiDraftInterviewInvite));
router.post("/cvs/:id/ai-draft-rejection", requireEmployer, asyncHandler(employerCv.postAiDraftRejection));
router.post("/cvs/:id/delete", requireEmployer, doubleCsrfProtection, asyncHandler(employerCv.postDeleteCv));
router.get("/cvs/:id/pdf", requireEmployer, asyncHandler(employerCv.streamEmployerCvPdf));

module.exports = router;
