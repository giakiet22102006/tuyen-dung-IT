// src/middlewares/csrf.middleware.js
const { doubleCsrf } = require("csrf-csrf");
const env = require("../config/env");

function isAdminRouteContext(req) {
  const adminPrefix = `/${env.ADMIN_PATH || "admin"}`;
  const url = req.originalUrl || req.url || "";
  return (
    url === adminPrefix ||
    url.startsWith(`${adminPrefix}/`) ||
    url.startsWith(`${adminPrefix}?`) ||
    url.startsWith("/api/ai/moderate-job") ||
    url.startsWith("/api/ai/market-insights")
  );
}

/**
 * Định danh phiên CSRF dựa trên danh tính đã xác thực (req.admin / req.user + tokenVersion),
 * tuyệt đối không tin tưởng trực tiếp chuỗi cookie thô chưa qua verify chữ ký JWT để chống Cookie/Session Fixation.
 */
function resolveCsrfSessionIdentifier(req) {
  if (req.admin && req.admin._id && (isAdminRouteContext(req) || !req.user)) {
    return `admin:${req.admin._id}:${req.admin.tokenVersion || 0}`;
  }
  if (req.user && req.user._id) {
    const tv = req.user.currentMember
      ? req.user.currentMember.tokenVersion || 0
      : req.user.tokenVersion || 0;
    return `user:${req.role || "user"}:${req.user._id}:${tv}`;
  }
  return "anonymous";
}

const { generateCsrfToken, doubleCsrfProtection: rawDoubleCsrfProtection } = doubleCsrf({
  getSecret: () => env.COOKIE_SECRET,
  cookieName: "itj_csrf",
  cookieOptions: {
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    httpOnly: true,
    path: "/",
  },
  size: 32,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  // Chỉ nhận CSRF token từ body hoặc header x-csrf-token (loại bỏ req.query._csrf để tránh lộ token qua URL/Referer/Log)
  getCsrfTokenFromRequest: (req) => {
    const bodyToken = req.body && typeof req.body._csrf === "string" ? req.body._csrf : "";
    if (bodyToken) return bodyToken;
    const headerToken = req.headers && typeof req.headers["x-csrf-token"] === "string" ? req.headers["x-csrf-token"] : "";
    return headerToken || undefined;
  },
  getSessionIdentifier: resolveCsrfSessionIdentifier,
});

function generateToken(req, res, options) {
  if (!req.cookies) {
    req.cookies = {};
  }
  return generateCsrfToken(req, res, options);
}

function doubleCsrfProtection(req, res, next) {
  if (!req.cookies) {
    req.cookies = {};
  }
  return rawDoubleCsrfProtection(req, res, next);
}

module.exports = {
  generateToken,
  doubleCsrfProtection,
  resolveCsrfSessionIdentifier,
};
