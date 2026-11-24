// src/middlewares/rateLimit.middleware.js
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const env = require("../config/env");

const MAX_EMAIL_KEY_LENGTH = 254;

/**
 * Chuẩn hóa địa chỉ IP qua ipKeyGenerator (nhóm dải IPv6 /64 chống xoay vòng IPv6)
 */
function normalizeClientIp(req) {
  const rawIp = (req && (req.ip || req.socket?.remoteAddress)) || "127.0.0.1";
  return ipKeyGenerator(rawIp);
}

/**
 * Trích xuất email an toàn chống Type Confusion (array/object injection từ JSON hoặc urlencoded)
 * và giới hạn độ dài tối đa 254 ký tự chuẩn RFC 5321 để bảo vệ RAM của MemoryStore.
 */
function extractSafeEmail(req) {
  const rawEmail = req && req.body && typeof req.body.email === "string" ? req.body.email : "";
  return rawEmail.toLowerCase().trim().slice(0, MAX_EMAIL_KEY_LENGTH);
}

/**
 * Định danh AI Rate Limit chỉ dựa trên IP chuẩn hóa và principal ĐÃ XÁC THỰC (req.user / req.admin).
 * Tuyệt đối không ghép giá trị cookie thô chưa xác thực để chặn tấn công xoay vòng cookie giả (cookie rotation bypass).
 */
function buildAiRateLimitKey(req) {
  const ip = normalizeClientIp(req);
  if (req && req.user && req.user._id) {
    return `ai_${ip}_user_${String(req.user._id)}`;
  }
  if (req && req.admin && req.admin._id) {
    return `ai_${ip}_admin_${String(req.admin._id)}`;
  }
  return `ai_${ip}_anon`;
}

/**
 * Ghép tuần tự nhiều lớp rate-limiter thành một Express middleware duy nhất
 * (VD: Lớp 1 giới hạn theo IP+Email, Lớp 2 trần cứng theo IP để chặn Credential Stuffing & OTP Bombing).
 */
function composeLimiters(...limiters) {
  return (req, res, next) => {
    let idx = 0;
    const step = (err) => {
      if (err) return next(err);
      if (res.headersSent) return;
      const current = limiters[idx++];
      if (!current) return next();
      return current(req, res, step);
    };
    return step();
  };
}

function loginLimitHandler(req, res) {
  if (req.flash) {
    req.flash("error", "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng quay lại sau 15 phút.");
  }
  const returnUrl = (req.originalUrl || "").includes("employer") ? "/employer/login" : "/candidate/login";
  return res.redirect(returnUrl);
}

function adminLoginLimitHandler(req, res) {
  if (req.flash) {
    req.flash("error", "Đăng nhập trang Quản trị thất bại quá nhiều lần. Vui lòng thử lại sau 15 phút.");
  }
  const adminPath = env.ADMIN_PATH || "admin";
  return res.redirect(`/${adminPath}/login`);
}

function admin2faVerifyLimitHandler(req, res) {
  if (req.flash) {
    req.flash("error", "Bạn đã nhập mã xác thực 2FA quá nhiều lần. Vui lòng thử lại sau 15 phút.");
  }
  const adminPath = env.ADMIN_PATH || "admin";
  if (req.cookies && req.cookies.itj_admin_2fa_challenge) {
    return res.redirect(`/${adminPath}/verify-2fa`);
  }
  return res.redirect(`/${adminPath}/login`);
}

function extractSafeRedirectEmail(req) {
  const bodyEmail = extractSafeEmail(req);
  if (bodyEmail && /^[^\s@<>'"\\]+@[^\s@<>'"\\]+$/.test(bodyEmail)) {
    return bodyEmail;
  }
  const rawQueryEmail = req && req.query && typeof req.query.email === "string" ? req.query.email : "";
  const queryEmail = rawQueryEmail.toLowerCase().trim().slice(0, MAX_EMAIL_KEY_LENGTH);
  if (queryEmail && /^[^\s@<>'"\\]+@[^\s@<>'"\\]+$/.test(queryEmail)) {
    return queryEmail;
  }
  return "";
}

function otpLimitHandler(req, res) {
  const url = req.originalUrl || req.url || "";
  const isVerifyAction =
    url.includes("/verify-registration") ||
    url.includes("/verify-otp") ||
    url.includes("/reset-password");

  if (req.flash) {
    req.flash(
      "error",
      isVerifyAction
        ? "Bạn đã thử xác thực mã OTP quá nhiều lần. Vui lòng thử lại sau 15 phút."
        : "Bạn đã yêu cầu gửi mã OTP quá nhiều lần. Vui lòng thử lại sau 15 phút."
    );
  }

  const role = url.includes("employer") ? "employer" : "candidate";

  if (url.includes("/signup")) {
    return res.redirect(`/${role}/signup`);
  }

  if (url.includes("/verify-registration") || url.includes("/resend-registration-otp")) {
    const safeEmail = extractSafeRedirectEmail(req);
    const qs = safeEmail ? `?email=${encodeURIComponent(safeEmail)}` : "";
    return res.redirect(`/${role}/verify-registration${qs}`);
  }

  return res.redirect(`/${role}/forgot-password`);
}

function apiLimitHandler(_req, res) {
  res.setHeader("Retry-After", 60);
  return res.status(429).json({
    type: "https://tuyen-dung-it.vercel.app/docs/errors#rate-limited",
    title: "Too Many Requests",
    status: 429,
    detail: "Bạn đã vượt quá hạn mức yêu cầu API (Rate limit exceeded). Vui lòng thử lại sau.",
    code: "RATE_LIMITED",
    retryAfterSeconds: 60,
  });
}

function aiLimitHandler(_req, res) {
  res.setHeader("Retry-After", 600);
  return res.status(429).json({
    success: false,
    code: "AI_RATE_LIMITED",
    message: "Bạn đã sử dụng tính năng AI quá nhiều lần trong thời gian ngắn. Vui lòng thử lại sau ít phút.",
  });
}

/**
 * Khởi tạo bộ Rate Limiters (cho phép truyền maxOverrides trong unit test bảo mật mà không ảnh hưởng suite chung)
 */
function createRateLimiters(options = {}) {
  const enforceInTest = Boolean(options.enforceLimits);
  const isTest = process.env.NODE_ENV === "test" && !enforceInTest;
  const maxCfg = options.maxOverrides || {};

  // 1. Login: Lớp IP+Email (10 lần/15p) + Trần cứng theo IP (25 lần/15p chống xoay email Credential Stuffing)
  const loginAccountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : (maxCfg.loginPerEmail ?? 10),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `login_acc_${normalizeClientIp(req)}_${extractSafeEmail(req)}`,
    handler: loginLimitHandler,
  });

  const loginIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : (maxCfg.loginPerIp ?? 25),
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => `login_ip_${normalizeClientIp(req)}`,
    handler: loginLimitHandler,
  });

  // 2. Admin Login: Lớp IP+Email (5 lần/15p) + Trần cứng theo IP (10 lần/15p)
  const adminAccountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : (maxCfg.adminPerEmail ?? 5),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `admin_acc_${normalizeClientIp(req)}_${extractSafeEmail(req)}`,
    handler: adminLoginLimitHandler,
  });

  const adminIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : (maxCfg.adminPerIp ?? 10),
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => `admin_ip_${normalizeClientIp(req)}`,
    handler: adminLoginLimitHandler,
  });

  // 2b. Admin 2FA Verify: tách bộ đếm riêng khỏi bước nhập mật khẩu (10 lần/15p theo IP)
  const admin2faVerifyRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : (maxCfg.admin2faVerifyPerIp ?? 10),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `admin_2fa_verify_ip_${normalizeClientIp(req)}`,
    handler: admin2faVerifyLimitHandler,
  });

  // 3. OTP Legacy (giữ tương thích đầy đủ với suite kiểm thử bảo mật): 5 lần/15p email, 10 lần/15p IP
  const otpAccountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : (maxCfg.otpPerEmail ?? 5),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `otp_acc_${normalizeClientIp(req)}_${extractSafeEmail(req)}`,
    handler: otpLimitHandler,
  });

  const otpIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : (maxCfg.otpPerIp ?? 10),
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => `otp_ip_${normalizeClientIp(req)}`,
    handler: otpLimitHandler,
  });

  // 3b. OTP Send (gửi/gửi lại mã OTP): 5 lần/15p email, 10 lần/15p IP chống SMTP OTP Bombing
  const otpSendAccountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : (maxCfg.otpSendPerEmail ?? maxCfg.otpPerEmail ?? 5),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `otp_send_acc_${normalizeClientIp(req)}_${extractSafeEmail(req)}`,
    handler: otpLimitHandler,
  });

  const otpSendIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : (maxCfg.otpSendPerIp ?? maxCfg.otpPerIp ?? 10),
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => `otp_send_ip_${normalizeClientIp(req)}`,
    handler: otpLimitHandler,
  });

  // 3c. OTP Verify & Reset Password (nhập mã OTP / lưu mật khẩu mới): 15 lần/15p email, 30 lần/15p IP
  const otpVerifyAccountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : (maxCfg.otpVerifyPerEmail ?? 15),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `otp_verify_acc_${normalizeClientIp(req)}_${extractSafeEmail(req)}`,
    handler: otpLimitHandler,
  });

  const otpVerifyIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : (maxCfg.otpVerifyPerIp ?? 30),
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => `otp_verify_ip_${normalizeClientIp(req)}`,
    handler: otpLimitHandler,
  });

  // 4. REST & MCP API: 120 req/phút theo IP chuẩn hóa
  const apiRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: isTest ? 1000 : (maxCfg.apiPerIp ?? 120),
    standardHeaders: "draft-7",
    legacyHeaders: true,
    keyGenerator: (req) => `api_${normalizeClientIp(req)}`,
    handler: apiLimitHandler,
  });

  // 5. AI Endpoints: Lớp IP+VerifiedPrincipal (12 lần/10p) + Trần cứng theo IP (30 lần/10p)
  const aiPrincipalLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: isTest ? 1000 : (maxCfg.aiPerPrincipal ?? 12),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: buildAiRateLimitKey,
    handler: aiLimitHandler,
  });

  const aiIpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: isTest ? 1000 : (maxCfg.aiPerIp ?? 30),
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => `ai_ip_${normalizeClientIp(req)}`,
    handler: aiLimitHandler,
  });

  return {
    loginRateLimiter: composeLimiters(loginIpLimiter, loginAccountLimiter),
    adminLoginRateLimiter: composeLimiters(adminIpLimiter, adminAccountLimiter),
    admin2faVerifyRateLimiter,
    otpRateLimiter: composeLimiters(otpIpLimiter, otpAccountLimiter),
    otpSendRateLimiter: composeLimiters(otpSendIpLimiter, otpSendAccountLimiter),
    otpVerifyRateLimiter: composeLimiters(otpVerifyIpLimiter, otpVerifyAccountLimiter),
    apiRateLimiter,
    aiRateLimiter: composeLimiters(aiIpLimiter, aiPrincipalLimiter),
  };
}

const defaultLimiters = createRateLimiters();

module.exports = {
  ...defaultLimiters,
  createRateLimiters,
  normalizeClientIp,
  extractSafeEmail,
  buildAiRateLimitKey,
  otpLimitHandler,
};
