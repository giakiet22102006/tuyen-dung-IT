const express = require("express");
const path = require("path");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const env = require("./config/env");

const flashMiddleware = require("./middlewares/flash.middleware");
const { authenticateUser, authenticateAdmin } = require("./middlewares/auth.middleware");
const localsMiddleware = require("./middlewares/locals.middleware");
const { apiRateLimiter } = require("./middlewares/rateLimit.middleware");

const clientRoutes = require("./routes/client.route");
const candidateRoutes = require("./routes/candidate.route");
const employerRoutes = require("./routes/employer.route");
const adminRoutes = require("./routes/admin.route");
const aiRoutes = require("./routes/ai.route");

const app = express();

// Trust proxy if configured
if (env.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

// Security headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com",
        ],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        frameSrc: [
          "'self'",
          "https://www.google.com",
          "https://maps.google.com",
          "https://*.google.com",
        ],
        objectSrc: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Compression tối ưu hóa tốc độ tải trang
app.use(
  compression({
    threshold: 512,
    level: 6,
  })
);

// Database connection middleware (cho serverless & standard)
const { connectDB } = require("./config/db");
app.use(async (req, res, next) => {
  // Bỏ qua tài nguyên tĩnh & tệp định danh máy đọc
  if (
    req.path.startsWith("/assets") ||
    req.path.startsWith("/uploads") ||
    req.path === "/favicon.ico" ||
    req.path === "/robots.txt" ||
    req.path === "/llms.txt" ||
    req.path === "/llms-full.txt" ||
    req.path === "/openapi.json" ||
    req.path.startsWith("/.well-known/")
  ) {
    return next();
  }
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("❌ Database connection failure:", err.message);
    const displayError = env.NODE_ENV === "production"
      ? "Lỗi kết nối cơ sở dữ liệu. Vui lòng liên hệ ban quản trị hệ thống."
      : String(err.message || "").replace(/[&<>"']/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s] || s));
    return res.status(500).send(`
      <div style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h2 style="color: #dc2626;">❌ Không thể kết nối cơ sở dữ liệu MongoDB</h2>
        <p>Chi tiết: <strong>${displayError}</strong></p>
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px auto; max-width: 600px; text-align: left;">
          <p><strong>Nguyên nhân phổ biến nhất trên Vercel:</strong></p>
          <p>Trên <strong>MongoDB Atlas</strong>, bạn chưa mở quyền truy cập IP cho Cloud.</p>
          <ol>
            <li>Vào <a href="https://cloud.mongodb.com/" target="_blank">cloud.mongodb.com</a></li>
            <li>Chọn mục <strong>Network Access</strong> (ở menu bên trái)</li>
            <li>Bấm <strong>Add IP Address</strong> $\rightarrow$ chọn <strong>ALLOW ACCESS FROM ANYWHERE</strong> (IP <code>0.0.0.0/0</code>)</li>
            <li>Bấm <strong>Confirm</strong> và đợi 1 phút rồi F5 tải lại trang.</li>
          </ol>
        </div>
      </div>
    `);
  }
});

// Body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser(env.COOKIE_SECRET));

// Static files với maxAge tối ưu
app.use(
  "/assets",
  express.static(path.join(__dirname, "../public/assets"), {
    maxAge: "7d",
    etag: true,
  })
);
const uploadStaticDir = process.env.VERCEL ? "/tmp/uploads" : path.join(__dirname, "../public/uploads");
app.use("/uploads", express.static(uploadStaticDir));

// View engine với Pug compiled view cache
app.set("views", path.join(__dirname, "../views"));
app.set("view engine", "pug");
if (env.NODE_ENV === "production" || process.env.VERCEL) {
  app.enable("view cache");
}

// Global middlewares
app.use(flashMiddleware);
app.use(authenticateUser);
app.use(authenticateAdmin);
app.use(localsMiddleware);

// Rate limiting & versioning headers cho REST APIs & MCP endpoints (RFC standard rate-limit headers)
app.use("/api", (req, res, next) => {
  res.setHeader("API-Version", "1.0.0");
  next();
}, apiRateLimiter);
app.use("/mcp", apiRateLimiter);

// Mount routes
app.use("/", clientRoutes);
app.use("/candidate", candidateRoutes);
app.use("/employer", employerRoutes);
app.use("/" + env.ADMIN_PATH, adminRoutes);
app.use("/api/ai", aiRoutes);

// Healthcheck
app.get("/healthz", (req, res) => res.status(200).json({ status: "ok" }));

// 404 handler
app.use((req, res) => {
  res.status(404);
  res.vary("Accept");

  const accept = req.get("accept") || "";

  // Check if client explicitly requests Markdown or prefers Markdown over HTML
  const wantsMarkdown =
    accept.includes("text/markdown") &&
    (!accept.includes("text/html") || req.accepts(["text/markdown", "text/html"]) === "text/markdown");

  if (wantsMarkdown) {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    return res.send(
`# 404 - Not Found

The requested resource was not found on VN.ITJobs.
Địa chỉ hoặc tài nguyên bạn yêu cầu không tồn tại trên hệ thống VN.ITJobs.

Please refer to the following available resources:
- AI Agent Discovery Index: [https://tuyen-dung-it.vercel.app/llms.txt](https://tuyen-dung-it.vercel.app/llms.txt)
- Agent Instructions: [https://tuyen-dung-it.vercel.app/.well-known/agent-instructions.md](https://tuyen-dung-it.vercel.app/.well-known/agent-instructions.md)
- Developer Portal & API Docs: [https://tuyen-dung-it.vercel.app/docs](https://tuyen-dung-it.vercel.app/docs)
- OpenAPI Specification: [https://tuyen-dung-it.vercel.app/openapi.json](https://tuyen-dung-it.vercel.app/openapi.json)
- Model Context Protocol (MCP) Server: [https://tuyen-dung-it.vercel.app/mcp](https://tuyen-dung-it.vercel.app/mcp)
- XML Sitemap: [https://tuyen-dung-it.vercel.app/sitemap.xml](https://tuyen-dung-it.vercel.app/sitemap.xml)
- Homepage: [https://tuyen-dung-it.vercel.app/](https://tuyen-dung-it.vercel.app/)
`
    );
  }

  if (req.xhr || accept.includes("application/json") || req.path.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.json({
      success: false,
      error: "NotFound",
      message: "Tài nguyên hoặc đường dẫn yêu cầu không tồn tại (404 Not Found).",
      links: {
        homepage: "/",
        docs: "/docs",
        llms: "/llms.txt",
        sitemap: "/sitemap.xml",
      },
    });
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.render("pages/404", {
    title: "404 - Không tìm thấy trang | VN.ITJobs",
  }, (err, html) => {
    if (err) {
      return res.send(
        `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>404 - Không tìm thấy trang | VN.ITJobs</title></head><body><h1>404 - Không tìm thấy trang</h1><p>Địa chỉ bạn yêu cầu không tồn tại trên hệ thống VN.ITJobs.</p><p><a href="/">Quay về Trang chủ</a> | <a href="/docs">Tài liệu API</a> | <a href="/llms.txt">llms.txt</a> | <a href="/sitemap.xml">Sitemap</a></p></body></html>`
      );
    }
    return res.send(html);
  });
});

// Error handler (CSRF & server errors)
app.use((err, req, res, _next) => {
  if (err.code === "EBADCSRFTOKEN" || err.message?.includes("csrf")) {
    if (req.xhr || req.headers.accept?.includes("json") || req.path.startsWith("/api")) {
      return res.status(403).json({ success: false, message: "Mã bảo mật (CSRF) không hợp lệ hoặc đã hết hạn." });
    }
    if (req.flash) {
      req.flash("error", "Phiên làm việc đã hết hạn hoặc mã bảo mật (CSRF) không hợp lệ. Vui lòng thử lại.");
    }
    return res.redirect(req.headers.referer || "/");
  }

  console.error("Unhandled Error:", err);
  if (req.xhr || req.headers.accept?.includes("json") || req.path.startsWith("/api")) {
    return res.status(500).json({ success: false, message: "Đã xảy ra lỗi máy chủ nội bộ: " + err.message });
  }
  res.status(500).send("Đã xảy ra lỗi máy chủ nội bộ (500)");
});

module.exports = app;
