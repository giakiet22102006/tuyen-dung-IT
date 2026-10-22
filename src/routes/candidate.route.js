// src/routes/candidate.route.js
const express = require("express");
const router = express.Router();
const candidateAuth = require("../controllers/candidate/candidateAuth.controller");
const candidateProfile = require("../controllers/candidate/candidateProfile.controller");
const candidateApplication = require("../controllers/candidate/candidateApplication.controller");
const { requireCandidate, requireGuest } = require("../middlewares/auth.middleware");
const { doubleCsrfProtection } = require("../middlewares/csrf.middleware");
const { loginRateLimiter } = require("../middlewares/rateLimit.middleware");
const { uploadAvatarMiddleware } = require("../middlewares/upload.middleware");
const asyncHandler = require("../utils/asyncHandler");

// Guest routes
router.get("/signup", requireGuest, candidateAuth.renderSignup);
router.post("/signup", requireGuest, doubleCsrfProtection, asyncHandler(candidateAuth.postSignup));

router.get("/login", requireGuest, candidateAuth.renderLogin);
router.post("/login", requireGuest, loginRateLimiter, doubleCsrfProtection, asyncHandler(candidateAuth.postLogin));

// Authenticated routes
router.post("/logout", doubleCsrfProtection, candidateAuth.postLogout);

router.get("/change-password", requireCandidate, candidateAuth.renderChangePassword);
router.post("/change-password", requireCandidate, doubleCsrfProtection, asyncHandler(candidateAuth.postChangePassword));

// Hồ sơ cá nhân
router.get("/profile", requireCandidate, asyncHandler(candidateProfile.renderProfile));
router.post("/profile", requireCandidate, uploadAvatarMiddleware, doubleCsrfProtection, asyncHandler(candidateProfile.postProfile));

// Quản lý CV đã nộp (Ứng tuyển)
router.get("/applied-jobs", requireCandidate, asyncHandler(candidateApplication.renderAppliedJobs));
router.post("/applied-jobs/:id/delete", requireCandidate, doubleCsrfProtection, asyncHandler(candidateApplication.postWithdrawApplication));
router.get("/applied-jobs/:id/pdf", requireCandidate, asyncHandler(candidateApplication.streamCandidateCv));

module.exports = router;
