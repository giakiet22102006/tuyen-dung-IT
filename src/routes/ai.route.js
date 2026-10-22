// src/routes/ai.route.js
const express = require("express");
const router = express.Router();
const aiController = require("../controllers/ai/ai.controller");
const { requireEmployer, requireAdmin } = require("../middlewares/auth.middleware");
const { doubleCsrfProtection } = require("../middlewares/csrf.middleware");
const { uploadCvMiddleware } = require("../middlewares/upload.middleware");
const asyncHandler = require("../utils/asyncHandler");

// 1. Phân tích độ phù hợp CV (Công khai / Ứng viên)
router.post("/match-cv", uploadCvMiddleware, doubleCsrfProtection, asyncHandler(aiController.postMatchCv));

// 2. Luyện phỏng vấn với AI (Công khai / Ứng viên)
router.post("/interview-prep", doubleCsrfProtection, asyncHandler(aiController.postInterviewPrep));

// 3. AI sinh mô tả việc làm JD (Nhà tuyển dụng)
router.post("/generate-jd", requireEmployer, doubleCsrfProtection, asyncHandler(aiController.postGenerateJobDescription));

// 4. AI sàng lọc & tóm tắt CV (Nhà tuyển dụng)
router.post("/screen-cv/:applicationId", requireEmployer, doubleCsrfProtection, asyncHandler(aiController.postScreenCv));

// 5. AI kiểm tra gian lận & vi phạm chính sách tin tuyển dụng (Admin)
router.post("/moderate-job/:jobId", requireAdmin, doubleCsrfProtection, asyncHandler(aiController.postModerateJob));

// 6. AI báo cáo xu hướng thị trường IT (Admin)
router.get("/market-insights", requireAdmin, asyncHandler(aiController.getMarketInsights));

module.exports = router;
