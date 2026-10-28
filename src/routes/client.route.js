// src/routes/client.route.js
const express = require("express");
const path = require("path");
const router = express.Router();
const clientController = require("../controllers/client/client.controller");
const salaryController = require("../controllers/client/salary.controller");
const jobAlertController = require("../controllers/client/jobAlert.controller");
const candidateCompanyFollow = require("../controllers/candidate/candidateCompanyFollow.controller");
const blogController = require("../controllers/client/blog.controller");
const notificationController = require("../controllers/client/notification.controller");
const sitemapController = require("../controllers/sitemap.controller");
const mcpController = require("../controllers/mcp.controller");
const asyncHandler = require("../utils/asyncHandler");
const { Candidate, Employer, Admin } = require("../models");
const { signUserToken, signAdminToken } = require("../services/auth.service");
const env = require("../config/env");
const { requireCandidate } = require("../middlewares/auth.middleware");
const { uploadCvMiddleware } = require("../middlewares/upload.middleware");
const { doubleCsrfProtection } = require("../middlewares/csrf.middleware");
const isSafeRedirect = require("../utils/sanitizeRedirect");

router.get("/", asyncHandler(clientController.renderIndex));
router.get("/search", asyncHandler(clientController.renderSearch));
router.get("/api/search/suggestions", asyncHandler(clientController.getSearchSuggestions));
router.get("/api/v1/search/suggestions", asyncHandler(clientController.getSearchSuggestions));
router.get("/companies", asyncHandler(clientController.renderCompanyList));
router.get("/companies/:slug", asyncHandler(clientController.renderCompanyDetails));

// Trust Anchor Pages (About, Contact, Privacy) & Developer Portal
router.get("/about", asyncHandler(clientController.renderAbout));
router.get("/contact", asyncHandler(clientController.renderContact));
router.get("/privacy", asyncHandler(clientController.renderPrivacy));
router.get("/docs", asyncHandler(clientController.renderDocs));

// Machine-readable discovery & Agent resources
router.get("/sitemap.xml", asyncHandler(sitemapController.renderSitemap));

router.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.sendFile(path.join(__dirname, "../../public/robots.txt"));
});

router.get("/llms.txt", (req, res) => {
  res.type("text/plain; charset=utf-8");
  res.sendFile(path.join(__dirname, "../../public/llms.txt"));
});

router.get("/llms-full.txt", (req, res) => {
  res.type("text/plain; charset=utf-8");
  res.sendFile(path.join(__dirname, "../../public/llms-full.txt"));
});

router.get("/.well-known/agent-instructions.md", (req, res) => {
  res.type("text/markdown; charset=utf-8");
  res.sendFile(path.join(__dirname, "../../public/.well-known/agent-instructions.md"));
});

router.get("/openapi.json", (req, res) => {
  res.type("application/json; charset=utf-8");
  res.sendFile(path.join(__dirname, "../../public/openapi.json"));
});

// Model Context Protocol (MCP) endpoints
router.get("/.well-known/mcp", mcpController.getMcpManifest);
router.get("/.well-known/mcp.json", mcpController.getMcpManifest);
router.post("/.well-known/mcp", asyncHandler(mcpController.postMcp));

router.get("/mcp", mcpController.getMcp);
router.post("/mcp", asyncHandler(mcpController.postMcp));
router.get("/api/v1/mcp", mcpController.getMcp);
router.post("/api/v1/mcp", asyncHandler(mcpController.postMcp));
router.post(
  "/companies/:id/follow",
  requireCandidate,
  doubleCsrfProtection,
  asyncHandler(candidateCompanyFollow.postToggleFollowCompany)
);
router.post(
  "/companies/:slug/reviews",
  doubleCsrfProtection,
  asyncHandler(clientController.postCompanyReview)
);

// Tra cứu lương IT (Salary Benchmark & Calculator)
router.get("/salary", asyncHandler(salaryController.renderSalaryBenchmark));
router.get("/api/salary/calculate", asyncHandler(salaryController.getSalaryApi));
router.get("/api/v1/salary/calculate", asyncHandler(salaryController.getSalaryApi));

// Đăng ký nhận thông báo việc làm mới (Job Alert)
router.post("/job-alerts", doubleCsrfProtection, asyncHandler(jobAlertController.postSubscribeJobAlert));
router.get("/job-alerts/unsubscribe/:token", asyncHandler(jobAlertController.getUnsubscribeJobAlert));

// IT Blog & Cẩm nang nghề nghiệp lập trình viên
router.get("/blog", asyncHandler(blogController.renderBlogList));
router.get("/blog/:slug", asyncHandler(blogController.renderBlogDetails));

// API Thông báo trực tiếp In-App
router.get("/api/notifications", asyncHandler(notificationController.getNotificationsApi));
router.post("/api/notifications/:id/read", doubleCsrfProtection, asyncHandler(notificationController.markReadApi));
router.post("/api/notifications/read-all", doubleCsrfProtection, asyncHandler(notificationController.markAllReadApi));

router.post(
  "/api/feedback",
  asyncHandler(clientController.postSubmitFeedback)
);
router.post(
  "/api/v1/feedback",
  asyncHandler(clientController.postSubmitFeedback)
);
router.post(
  "/api/chat-assistant",
  doubleCsrfProtection,
  asyncHandler(clientController.postChatAssistant)
);
router.get("/jobs/:slug", asyncHandler(clientController.renderJobDetails));
router.post(
  "/jobs/:slug/apply",
  requireCandidate,
  uploadCvMiddleware,
  doubleCsrfProtection,
  asyncHandler(clientController.postApplyJob)
);

// Dev helpers exclusively for test suites (blocked in development & production)
if (env.NODE_ENV === "test") {
  router.get("/_dev/login-candidate", async (req, res) => {
    const candidate = (await Candidate.findOne({})) || { _id: "67b8f9e01234567890abcdef", fullName: "Lê Văn A", tokenVersion: 0 };
    const token = signUserToken(candidate, "candidate");
    res.cookie("itj_token", token, { httpOnly: true, sameSite: "lax" });
    res.redirect(isSafeRedirect(req.query.to) ? req.query.to : "/");
  });

  router.get("/_dev/login-employer", async (req, res) => {
    let employer;
    if (req.query.active === "1") {
      employer = await Employer.findOne({ status: "active" });
    } else {
      employer = (await Employer.findOne({ status: "pending" })) || (await Employer.findOne({}));
    }
    if (!employer) {
      employer = { _id: "67b8f9e01234567890abcdee", companyName: "Công ty Công Nghệ TechCorp", status: "active", tokenVersion: 0, city: "ha-noi" };
    }
    const token = signUserToken(employer, "employer");
    res.cookie("itj_token", token, { httpOnly: true, sameSite: "lax" });
    res.redirect(isSafeRedirect(req.query.to) ? req.query.to : "/employer/company-profile");
  });

  router.get("/_dev/login-admin", async (req, res) => {
    let admin = await Admin.findOne({});
    if (!admin) {
      const bcrypt = require("bcryptjs");
      const hash = await bcrypt.hash("AdminPass123", 10);
      admin = await Admin.create({
        fullName: "Super Administrator",
        email: "superadmin@admin.vn",
        password: hash,
        role: "superadmin",
        status: "active",
      });
    }
    const token = signAdminToken(admin);
    res.cookie("itj_admin_token", token, { httpOnly: true, sameSite: "lax" });
    res.redirect(isSafeRedirect(req.query.to) ? req.query.to : `/${env.ADMIN_PATH}`);
  });
}

module.exports = router;
