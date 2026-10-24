const express = require("express");
const path = require("path");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const env = require("./config/env");

const flashMiddleware = require("./middlewares/flash.middleware");
const { authenticateUser, authenticateAdmin } = require("./middlewares/auth.middleware");
const localsMiddleware = require("./middlewares/locals.middleware");

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
  // Bỏ qua tài nguyên tĩnh
  if (req.path.startsWith("/assets") || req.path.startsWith("/uploads") || req.path === "/favicon.ico") {
    return next();
  }
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("❌ Database connection failure:", err.message);
    return res.status(500).send(`
      <div style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h2 style="color: #dc2626;">❌ Không thể kết nối cơ sở dữ liệu MongoDB</h2>
        <p>Chi tiết: <strong>${err.message}</strong></p>
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
  res.status(404).send("Trang không tồn tại (404)");
});

// Error handler (CSRF & server errors)
app.use((err, req, res, next) => {
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
