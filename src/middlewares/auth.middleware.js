// src/middlewares/auth.middleware.js
const { verifyUserToken, verifyAdminToken } = require("../services/auth.service");
const { Candidate, Employer, Admin } = require("../models");
const { CANDIDATE_STATUS, EMPLOYER_STATUS, ADMIN_STATUS, ADMIN_ROLES } = require("../config/constants");
const env = require("../config/env");

/**
 * Middleware phân giải phiên đăng nhập từ cookie `itj_token` (Ứng viên / Nhà tuyển dụng)
 * Kiểm tra ngay lập tức status, deletedAt và tokenVersion trong DB
 */
async function authenticateUser(req, res, next) {
  req.user = null;
  req.role = null;

  const token = req.cookies.itj_token;
  if (!token) return next();

  const payload = verifyUserToken(token);
  if (!payload || !payload.id || !payload.role) {
    res.clearCookie("itj_token");
    return next();
  }

  try {
    let user = null;
    if (payload.role === "candidate") {
      user = await Candidate.findOne({ _id: payload.id, deletedAt: null })
        .select("-password")
        .lean();

      // Kiểm tra trạng thái bị ban hoặc tokenVersion bị tăng sau đổi mật khẩu
      if (!user || user.status === CANDIDATE_STATUS.BANNED || user.tokenVersion !== payload.tv) {
        res.clearCookie("itj_token");
        return next();
      }
    } else if (payload.role === "employer") {
      user = await Employer.findOne({ _id: payload.id, deletedAt: null })
        .select("-password")
        .lean();

      // Employer bị ban hoặc tokenVersion không khớp
      if (!user || user.status === EMPLOYER_STATUS.BANNED || user.tokenVersion !== payload.tv) {
        res.clearCookie("itj_token");
        return next();
      }
    }

    if (user) {
      req.user = user;
      req.role = payload.role;
    }
  } catch (err) {
    console.error("Lỗi xác thực người dùng:", err);
  }

  next();
}

/**
 * Middleware phân giải phiên đăng nhập từ cookie `itj_admin_token` (Admin)
 */
async function authenticateAdmin(req, res, next) {
  req.admin = null;
  res.locals.currentAdmin = null;

  const token = req.cookies.itj_admin_token;
  if (!token) return next();

  const payload = verifyAdminToken(token);
  if (!payload || !payload.id) {
    res.clearCookie("itj_admin_token");
    return next();
  }

  try {
    const admin = await Admin.findOne({
      _id: payload.id,
      status: ADMIN_STATUS.ACTIVE,
    })
      .select("-password")
      .lean();

    if (!admin || admin.tokenVersion !== payload.tv) {
      res.clearCookie("itj_admin_token");
      return next();
    }

    req.admin = admin;
    res.locals.currentAdmin = admin;
  } catch (err) {
    console.error("Lỗi xác thực admin:", err);
  }

  next();
}

/**
 * Bắt buộc vai trò Ứng viên (Candidate)
 */
function requireCandidate(req, res, next) {
  if (!req.user || req.role !== "candidate") {
    const isApi = req.originalUrl?.startsWith("/api") || req.baseUrl?.startsWith("/api") || req.path?.startsWith("/api") || req.xhr || req.headers.accept?.includes("json");
    if (isApi) {
      return res.status(401).json({ success: false, message: "Vui lòng đăng nhập với tư cách Ứng viên." });
    }
    if (req.flash) {
      req.flash("error", "Vui lòng đăng nhập với tư cách Ứng viên để tiếp tục.");
    }
    const returnUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/candidate/login?next=${returnUrl}`);
  }
  next();
}

/**
 * Bắt buộc vai trò Nhà tuyển dụng (Employer)
 */
function requireEmployer(req, res, next) {
  if (!req.user || req.role !== "employer") {
    const isApi = req.originalUrl?.startsWith("/api") || req.baseUrl?.startsWith("/api") || req.path?.startsWith("/api") || req.xhr || req.headers.accept?.includes("json");
    if (isApi) {
      return res.status(401).json({ success: false, message: "Vui lòng đăng nhập với tư cách Nhà tuyển dụng." });
    }
    if (req.flash) {
      req.flash("error", "Vui lòng đăng nhập với tư cách Nhà tuyển dụng để tiếp tục.");
    }
    const returnUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/employer/login?next=${returnUrl}`);
  }
  next();
}

/**
 * Bắt buộc quyền Quản trị viên (Admin)
 */
function requireAdmin(req, res, next) {
  if (!req.admin) {
    const isApi = req.originalUrl?.startsWith("/api") || req.baseUrl?.startsWith("/api") || req.path?.startsWith("/api") || req.xhr || req.headers.accept?.includes("json");
    if (isApi) {
      return res.status(401).json({ success: false, message: "Vui lòng đăng nhập vào trang Quản trị viên." });
    }
    if (req.flash) {
      req.flash("error", "Vui lòng đăng nhập vào trang Quản trị.");
    }
    const adminPath = env.ADMIN_PATH || "admin";
    const returnUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/${adminPath}/login?next=${returnUrl}`);
  }
  next();
}

/**
 * Bắt buộc quyền Superadmin
 */
function requireSuperAdmin(req, res, next) {
  if (!req.admin || req.admin.role !== ADMIN_ROLES.SUPERADMIN) {
    if (req.flash) {
      req.flash("error", "Chỉ Superadmin mới có quyền thực hiện thao tác này.");
    }
    const adminPath = env.ADMIN_PATH || "admin";
    return res.redirect(`/${adminPath}`);
  }
  next();
}

/**
 * Header bảo mật chống crawl cho trang Admin
 */
function adminSecurityHeaders(req, res, next) {
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
}

/**
 * Yêu cầu chưa đăng nhập User thường (dành cho trang signup / login)
 */
function requireGuest(req, res, next) {
  if (req.user) {
    if (req.role === "employer") {
      return res.redirect("/employer/jobs");
    }
    return res.redirect("/");
  }
  next();
}

module.exports = {
  authenticateUser,
  authenticateAdmin,
  requireCandidate,
  requireEmployer,
  requireAdmin,
  requireSuperAdmin,
  adminSecurityHeaders,
  requireGuest,
};
