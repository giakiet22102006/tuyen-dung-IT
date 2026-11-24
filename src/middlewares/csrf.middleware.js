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
 * Định danh phiên CSRF riêng cho User/Public (tuyệt đối tách biệt với Admin để chống ghi đè cookie khi mở song song 2 vai trò)
 */
function resolveUserCsrfSessionIdentifier(req) {
  if (req && req.user && req.user._id) {
    const tv = req.user.currentMember
      ? req.user.currentMember.tokenVersion || 0
      : req.user.tokenVersion || 0;
    return `user:${req.role || "user"}:${req.user._id}:${tv}`;
  }
  return "anonymous";
}

/**
 * Định danh phiên CSRF riêng cho Admin Panel & Admin AI Endpoints
 */
function resolveAdminCsrfSessionIdentifier(req) {
  if (req && req.admin && req.admin._id) {
    return `admin:${req.admin._id}:${req.admin.tokenVersion || 0}`;
  }
  return "anonymous_admin";
}

/**
 * Định danh phiên CSRF thống nhất (giữ export cho unit tests và chẩn đoán)
 */
function resolveCsrfSessionIdentifier(req) {
  if (isAdminRouteContext(req)) {
    return resolveAdminCsrfSessionIdentifier(req);
  }
  if (req && req.admin && req.admin._id && !req.user) {
    return resolveAdminCsrfSessionIdentifier(req);
  }
  return resolveUserCsrfSessionIdentifier(req);
}

function extractCsrfTokenFromRequest(req) {
  const bodyToken = req.body && typeof req.body._csrf === "string" ? req.body._csrf : "";
  if (bodyToken) return bodyToken;
  const headerToken = req.headers && typeof req.headers["x-csrf-token"] === "string" ? req.headers["x-csrf-token"] : "";
  return headerToken || undefined;
}

const commonDoubleCsrfOptions = {
  getSecret: () => env.COOKIE_SECRET,
  cookieOptions: {
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    httpOnly: true,
    path: "/",
  },
  size: 32,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  // Chỉ nhận CSRF token từ body hoặc header x-csrf-token (loại bỏ req.query._csrf để tránh lộ token qua URL/Referer/Log)
  getCsrfTokenFromRequest: extractCsrfTokenFromRequest,
};

const userCsrf = doubleCsrf({
  ...commonDoubleCsrfOptions,
  cookieName: "itj_csrf",
  getSessionIdentifier: resolveUserCsrfSessionIdentifier,
});

const adminCsrf = doubleCsrf({
  ...commonDoubleCsrfOptions,
  cookieName: "itj_admin_csrf",
  getSessionIdentifier: resolveAdminCsrfSessionIdentifier,
});

function generateToken(req, res, options) {
  if (!req.cookies) {
    req.cookies = {};
  }
  const instance = isAdminRouteContext(req) ? adminCsrf : userCsrf;
  return instance.generateCsrfToken(req, res, options);
}

function doubleCsrfProtection(req, res, next) {
  if (!req.cookies) {
    req.cookies = {};
  }
  const instance = isAdminRouteContext(req) ? adminCsrf : userCsrf;
  return instance.doubleCsrfProtection(req, res, next);
}

module.exports = {
  generateToken,
  doubleCsrfProtection,
  resolveCsrfSessionIdentifier,
  resolveUserCsrfSessionIdentifier,
  resolveAdminCsrfSessionIdentifier,
  isAdminRouteContext,
};
