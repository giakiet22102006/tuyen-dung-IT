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

      if (!user || user.status === CANDIDATE_STATUS.BANNED) {
        res.clearCookie("itj_token");
        return next();
      }

      // Phát hiện xung đột phiên: tokenVersion không khớp do vừa đăng nhập ở máy khác
      if (user.tokenVersion !== payload.tv) {
        res.clearCookie("itj_token");
        req.sessionTerminatedByNewLogin = true;
        res.cookie("itj_session_conflict", "1", { httpOnly: true, maxAge: 60 * 1000 });
        return next();
      }
    } else if (payload.role === "employer") {
      user = await Employer.findOne({ _id: payload.id, deletedAt: null })
        .select("-password")
        .lean();

      if (!user || user.status === EMPLOYER_STATUS.BANNED) {
        res.clearCookie("itj_token");
        return next();
      }

      if (payload.memberId) {
        // Phiên đăng nhập riêng của Chuyên viên tuyển dụng
        const member = (user.teamMembers || []).find(
          (m) => m._id && m._id.toString() === payload.memberId
        );
        if (!member || (member.tokenVersion || 0) !== payload.tv) {
          res.clearCookie("itj_token");
          req.sessionTerminatedByNewLogin = true;
          res.cookie("itj_session_conflict", "1", { httpOnly: true, maxAge: 60 * 1000 });
          return next();
        }
        user.currentMember = member;
      } else {
        // Phát hiện xung đột phiên: tokenVersion không khớp do vừa đăng nhập ở máy khác
        if (user.tokenVersion !== payload.tv) {
          res.clearCookie("itj_token");
          req.sessionTerminatedByNewLogin = true;
          res.cookie("itj_session_conflict", "1", { httpOnly: true, maxAge: 60 * 1000 });
          return next();
        }
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

    if (!admin) {
      res.clearCookie("itj_admin_token");
      return next();
    }

    // Phát hiện xung đột phiên Admin: tokenVersion không khớp do đăng nhập máy khác
    if (admin.tokenVersion !== payload.tv) {
      res.clearCookie("itj_admin_token");
      req.adminSessionTerminatedByNewLogin = true;
      res.cookie("itj_admin_session_conflict", "1", { httpOnly: true, maxAge: 60 * 1000 });
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
      return res.status(401).json({ success: false, message: "Phiên làm việc đã kết thúc do tài khoản vừa được đăng nhập trên thiết bị khác." });
    }
    if (req.sessionTerminatedByNewLogin || req.cookies?.itj_session_conflict) {
      res.clearCookie("itj_session_conflict");
      if (req.flash) {
        req.flash("error", "⚠️ Phiên làm việc đã kết thúc do tài khoản của bạn vừa đăng nhập trên một thiết bị/trình duyệt khác. Nếu không phải bạn, hãy đổi mật khẩu ngay!");
      }
    } else if (req.flash) {
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
      return res.status(401).json({ success: false, message: "Phiên làm việc đã kết thúc do tài khoản vừa được đăng nhập trên thiết bị khác." });
    }
    if (req.sessionTerminatedByNewLogin || req.cookies?.itj_session_conflict) {
      res.clearCookie("itj_session_conflict");
      if (req.flash) {
        req.flash("error", "⚠️ Phiên làm việc đã kết thúc do tài khoản của bạn vừa đăng nhập trên một thiết bị/trình duyệt khác. Nếu không phải bạn, hãy đổi mật khẩu ngay!");
      }
    } else if (req.flash) {
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
      return res.status(401).json({ success: false, message: "Phiên quản trị viên đã bị hủy do tài khoản Admin vừa được đăng nhập trên thiết bị khác." });
    }
    const adminPath = env.ADMIN_PATH || "admin";
    if (req.adminSessionTerminatedByNewLogin || req.cookies?.itj_admin_session_conflict) {
      res.clearCookie("itj_admin_session_conflict");
      if (req.flash) {
        req.flash("error", "⚠️ Phiên quản trị viên đã bị hủy do tài khoản Admin vừa được đăng nhập trên một thiết bị khác.");
      }
    } else if (req.flash) {
      req.flash("error", "Vui lòng đăng nhập vào trang Quản trị.");
    }
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
