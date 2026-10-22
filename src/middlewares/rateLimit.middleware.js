// src/middlewares/rateLimit.middleware.js
const rateLimit = require("express-rate-limit");
const env = require("../config/env");

const isTest = process.env.NODE_ENV === "test";

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: isTest ? 1000 : 10, // tối đa 10 lần thử (nâng cao trong môi trường test)
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    keyGeneratorIpFallback: false,
  },
  keyGenerator: (req) => {
    const email = req.body && req.body.email ? req.body.email.toLowerCase().trim() : "";
    return `${req.ip}_${email}`;
  },
  handler: (req, res) => {
    if (req.flash) {
      req.flash("error", "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng quay lại sau 15 phút.");
    }
    const returnUrl = req.originalUrl.includes("employer") ? "/employer/login" : "/candidate/login";
    return res.redirect(returnUrl);
  },
});

const adminLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: isTest ? 1000 : 5, // tối đa 5 lần thử cho Admin (nâng cao trong môi trường test)
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    keyGeneratorIpFallback: false,
  },
  keyGenerator: (req) => {
    const email = req.body && req.body.email ? req.body.email.toLowerCase().trim() : "";
    return `admin_${req.ip}_${email}`;
  },
  handler: (req, res) => {
    if (req.flash) {
      req.flash("error", "Đăng nhập trang Quản trị thất bại quá nhiều lần. Vui lòng thử lại sau 15 phút.");
    }
    const adminPath = env.ADMIN_PATH || "admin";
    return res.redirect(`/${adminPath}/login`);
  },
});

const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: isTest ? 1000 : 5, // tối đa 5 yêu cầu gửi OTP trong 15 phút
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    keyGeneratorIpFallback: false,
  },
  keyGenerator: (req) => {
    const email = req.body && req.body.email ? req.body.email.toLowerCase().trim() : "";
    return `otp_${req.ip}_${email}`;
  },
  handler: (req, res) => {
    if (req.flash) {
      req.flash("error", "Bạn đã yêu cầu gửi mã OTP quá nhiều lần. Vui lòng thử lại sau 15 phút.");
    }
    const returnUrl = req.originalUrl.includes("employer") ? "/employer/forgot-password" : "/candidate/forgot-password";
    return res.redirect(returnUrl);
  },
});

module.exports = {
  loginRateLimiter,
  adminLoginRateLimiter,
  otpRateLimiter,
};
