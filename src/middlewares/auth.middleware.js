// src/middlewares/auth.middleware.js
const mongoose = require("mongoose");
const { verifyUserToken, verifyAdminToken } = require("../services/auth.service");
const { Candidate, Employer, Admin } = require("../models");
const { ADMIN_STATUS, ADMIN_ROLES, CANDIDATE_STATUS, EMPLOYER_STATUS } = require("../config/constants");
const env = require("../config/env");
const isSafeRedirect = require("../utils/sanitizeRedirect");
const { getSafeBackRedirect } = require("../utils/securityHelpers");

const AUTH_COOKIE_CLEAR_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

const CONFLICT_COOKIE_OPTIONS = {
  ...AUTH_COOKIE_CLEAR_OPTIONS,
  maxAge: 60 * 1000,
};

function clearCookieCleanly(req, res, cookieName) {
  res.clearCookie(cookieName, AUTH_COOKIE_CLEAR_OPTIONS);
  if (req.cookies && cookieName in req.cookies) {
    delete req.cookies[cookieName];
  }
}

function isApiRequest(req) {
  return Boolean(
    req.originalUrl?.startsWith("/api") ||
      req.baseUrl?.startsWith("/api") ||
      req.path?.startsWith("/api") ||
      req.xhr ||
      req.headers?.accept?.includes("json")
  );
}

function getSafeReturnUrl(req) {
  const candidateUrl =
    req && req.method === "GET"
      ? req.originalUrl || "/"
      : getSafeBackRedirect(req, "/");
  return encodeURIComponent(isSafeRedirect(candidateUrl) ? candidateUrl : "/");
}

/**
 * Middleware phân giải phiên đăng nhập từ cookie `itj_token` (Ứng viên / Nhà tuyển dụng)
 * Kiểm tra ngay lập tức ObjectId, role hợp lệ, status, deletedAt và tokenVersion trong DB
 */
async function authenticateUser(req, res, next) {
  req.user = null;
  req.role = null;

  const token = req.cookies?.itj_token;
  if (!token) return next();

  const payload = verifyUserToken(token);
  if (
    !payload ||
    !payload.id ||
    !mongoose.Types.ObjectId.isValid(payload.id) ||
    !["candidate", "employer"].includes(payload.role)
  ) {
    clearCookieCleanly(req, res, "itj_token");
    return next();
  }

  try {
    let user = null;
    if (payload.role === "candidate") {
      user = await Candidate.findOne({ _id: payload.id, deletedAt: null })
        .select("-password")
        .lean();

      if (!user || user.status === CANDIDATE_STATUS.BANNED) {
        clearCookieCleanly(req, res, "itj_token");
        return next();
      }

      // Phát hiện xung đột phiên: tokenVersion không khớp do vừa đăng nhập ở máy khác
      if (user.tokenVersion !== payload.tv) {
        clearCookieCleanly(req, res, "itj_token");
        req.sessionTerminatedByNewLogin = true;
        res.cookie("itj_session_conflict", "1", CONFLICT_COOKIE_OPTIONS);
        return next();
      }
    } else if (payload.role === "employer") {
      user = await Employer.findOne({ _id: payload.id, deletedAt: null })
        .select("-password -teamMembers.password")
        .lean();

      if (!user || user.status === EMPLOYER_STATUS.BANNED) {
        clearCookieCleanly(req, res, "itj_token");
        return next();
      }

      if (payload.memberId) {
        if (typeof payload.memberId !== "string" || !mongoose.Types.ObjectId.isValid(payload.memberId)) {
          clearCookieCleanly(req, res, "itj_token");
          return next();
        }
        // Phiên đăng nhập riêng của Chuyên viên tuyển dụng
        const member = (user.teamMembers || []).find(
          (m) => m._id && m._id.toString() === payload.memberId
        );
        if (!member || (member.tokenVersion || 0) !== payload.tv) {
          clearCookieCleanly(req, res, "itj_token");
          req.sessionTerminatedByNewLogin = true;
          res.cookie("itj_session_conflict", "1", CONFLICT_COOKIE_OPTIONS);
          return next();
        }
        user.currentMember = member;
      } else {
        // Phát hiện xung đột phiên: tokenVersion không khớp do vừa đăng nhập ở máy khác
        if (user.tokenVersion !== payload.tv) {
          clearCookieCleanly(req, res, "itj_token");
          req.sessionTerminatedByNewLogin = true;
          res.cookie("itj_session_conflict", "1", CONFLICT_COOKIE_OPTIONS);
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
  if (res.locals) {
    res.locals.currentAdmin = null;
  }

  const token = req.cookies?.itj_admin_token;
  if (!token) return next();

  const payload = verifyAdminToken(token);
  if (!payload || !payload.id || !mongoose.Types.ObjectId.isValid(payload.id)) {
    clearCookieCleanly(req, res, "itj_admin_token");
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
      clearCookieCleanly(req, res, "itj_admin_token");
      return next();
    }

    // Phát hiện xung đột phiên Admin: tokenVersion không khớp do đăng nhập máy khác
    if (admin.tokenVersion !== payload.tv) {
      clearCookieCleanly(req, res, "itj_admin_token");
      req.adminSessionTerminatedByNewLogin = true;
      res.cookie("itj_admin_session_conflict", "1", CONFLICT_COOKIE_OPTIONS);
      return next();
    }

    req.admin = admin;
    if (res.locals) {
      res.locals.currentAdmin = admin;
    }
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
    const hasConflict = Boolean(req.sessionTerminatedByNewLogin || req.cookies?.itj_session_conflict);
    if (hasConflict) {
      clearCookieCleanly(req, res, "itj_session_conflict");
    }
    if (isApiRequest(req)) {
      return res.status(401).json({
        success: false,
        message: hasConflict
          ? "Phiên làm việc đã kết thúc do tài khoản vừa được đăng nhập trên thiết bị khác."
          : "Vui lòng đăng nhập với tư cách Ứng viên để tiếp tục.",
      });
    }
    if (hasConflict && req.flash) {
      req.flash("error", "⚠️ Phiên làm việc đã kết thúc do tài khoản của bạn vừa đăng nhập trên một thiết bị/trình duyệt khác. Nếu không phải bạn, hãy đổi mật khẩu ngay!");
    } else if (req.flash) {
      req.flash("error", "Vui lòng đăng nhập với tư cách Ứng viên để tiếp tục.");
    }
    const returnUrl = getSafeReturnUrl(req);
    return res.redirect(`/candidate/login?next=${returnUrl}`);
  }
  next();
}

/**
 * Bắt buộc vai trò Nhà tuyển dụng (Employer)
 */
function requireEmployer(req, res, next) {
  if (!req.user || req.role !== "employer") {
    const hasConflict = Boolean(req.sessionTerminatedByNewLogin || req.cookies?.itj_session_conflict);
    if (hasConflict) {
      clearCookieCleanly(req, res, "itj_session_conflict");
    }
    if (isApiRequest(req)) {
      return res.status(401).json({
        success: false,
        message: hasConflict
          ? "Phiên làm việc đã kết thúc do tài khoản vừa được đăng nhập trên thiết bị khác."
          : "Vui lòng đăng nhập với tư cách Nhà tuyển dụng để tiếp tục.",
      });
    }
    if (hasConflict && req.flash) {
      req.flash("error", "⚠️ Phiên làm việc đã kết thúc do tài khoản của bạn vừa đăng nhập trên một thiết bị/trình duyệt khác. Nếu không phải bạn, hãy đổi mật khẩu ngay!");
    } else if (req.flash) {
      req.flash("error", "Vui lòng đăng nhập với tư cách Nhà tuyển dụng để tiếp tục.");
    }
    const returnUrl = getSafeReturnUrl(req);
    return res.redirect(`/employer/login?next=${returnUrl}`);
  }
  next();
}

/**
 * Bắt buộc quyền Quản trị viên công ty (chủ tài khoản Employer hoặc team member có role === "admin")
 * Chặn chuyên viên tuyển dụng (role === "recruiter") tự quản lý đội ngũ hoặc leo thang đặc quyền (BFLA)
 */
function requireEmployerAdmin(req, res, next) {
  if (!req.user || req.role !== "employer") {
    return requireEmployer(req, res, next);
  }
  if (req.user.currentMember && req.user.currentMember.role !== "admin") {
    if (isApiRequest(req)) {
      return res.status(403).json({
        success: false,
        message: "Chỉ Quản trị viên công ty mới có quyền thực hiện thao tác này.",
      });
    }
    if (req.flash) {
      req.flash("error", "Chỉ Quản trị viên công ty mới có quyền thực hiện thao tác này.");
    }
    return res.redirect("/employer/company-profile");
  }
  next();
}

/**
 * Bắt buộc tài khoản Chủ sở hữu công ty (Employer Owner — không phải teamMember phụ)
 */
function requireEmployerOwner(req, res, next) {
  if (!req.user || req.role !== "employer") {
    return requireEmployer(req, res, next);
  }
  if (req.user.currentMember) {
    if (isApiRequest(req)) {
      return res.status(403).json({
        success: false,
        message: "Chỉ tài khoản Chủ công ty mới có quyền thực hiện thao tác này.",
      });
    }
    if (req.flash) {
      req.flash("error", "Chỉ tài khoản Chủ công ty mới có quyền thực hiện thao tác này.");
    }
    return res.redirect("/employer/team");
  }
  next();
}

/**
 * Bắt buộc công ty đã được duyệt (status === "active") trước khi đăng/sửa tin, dùng AI tạo JD hoặc săn ứng viên
 */
function requireActiveEmployer(req, res, next) {
  if (!req.user || req.role !== "employer") {
    return requireEmployer(req, res, next);
  }
  if (req.user.status !== EMPLOYER_STATUS.ACTIVE) {
    const msg = "Tài khoản công ty đang chờ phê duyệt nên chưa thể thực hiện thao tác này.";
    if (isApiRequest(req)) {
      return res.status(403).json({ success: false, message: msg });
    }
    if (req.flash) {
      req.flash("error", msg);
    }
    return res.redirect("/employer/jobs");
  }
  next();
}

/**
 * Bắt buộc quyền Quản trị viên (Admin)
 */
function requireAdmin(req, res, next) {
  if (!req.admin) {
    const hasConflict = Boolean(req.adminSessionTerminatedByNewLogin || req.cookies?.itj_admin_session_conflict);
    if (hasConflict) {
      clearCookieCleanly(req, res, "itj_admin_session_conflict");
    }
    if (isApiRequest(req)) {
      return res.status(401).json({
        success: false,
        message: hasConflict
          ? "Phiên quản trị viên đã bị hủy do tài khoản Admin vừa được đăng nhập trên thiết bị khác."
          : "Vui lòng đăng nhập vào trang Quản trị để tiếp tục.",
      });
    }
    const adminPath = env.ADMIN_PATH || "admin";
    if (hasConflict && req.flash) {
      req.flash("error", "⚠️ Phiên quản trị viên đã bị hủy do tài khoản Admin vừa được đăng nhập trên một thiết bị khác.");
    } else if (req.flash) {
      req.flash("error", "Vui lòng đăng nhập vào trang Quản trị.");
    }
    const returnUrl = getSafeReturnUrl(req);
    return res.redirect(`/${adminPath}/login?next=${returnUrl}`);
  }
  next();
}

/**
 * Bắt buộc quyền Superadmin
 */
function requireSuperAdmin(req, res, next) {
  const adminPath = env.ADMIN_PATH || "admin";
  if (!req.admin) {
    if (isApiRequest(req)) {
      return res.status(401).json({
        success: false,
        message: "Vui lòng đăng nhập vào trang Quản trị để tiếp tục.",
      });
    }
    const returnUrl = getSafeReturnUrl(req);
    return res.redirect(`/${adminPath}/login?next=${returnUrl}`);
  }

  if (req.admin.role !== ADMIN_ROLES.SUPERADMIN) {
    if (isApiRequest(req)) {
      return res.status(403).json({
        success: false,
        message: "Chỉ Superadmin mới có quyền thực hiện thao tác này.",
      });
    }
    if (req.flash) {
      req.flash("error", "Chỉ Superadmin mới có quyền thực hiện thao tác này.");
    }
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
    const base = req.baseUrl || "";
    const isCandidateRoute = base.startsWith("/candidate");
    const isEmployerRoute = base.startsWith("/employer");

    if (req.role === "employer") {
      if (isCandidateRoute && req.flash) {
        req.flash("error", "Bạn đang đăng nhập bằng tài khoản Nhà tuyển dụng. Vui lòng đăng xuất trước nếu muốn chuyển sang tài khoản Ứng viên.");
      }
      return res.redirect("/employer/jobs");
    }
    if (req.role === "candidate") {
      if (isEmployerRoute && req.flash) {
        req.flash("error", "Bạn đang đăng nhập bằng tài khoản Ứng viên. Vui lòng đăng xuất trước nếu muốn chuyển sang tài khoản Nhà tuyển dụng.");
      }
      return res.redirect("/");
    }
    return res.redirect("/");
  }
  next();
}

/**
 * Nếu phiên đã hết hạn/đã đăng xuất từ tab khác trước khi bấm Đăng xuất, tránh trả lỗi 403 CSRF
 */
function bypassCsrfIfLoggedOut(type = "user", fallbackRedirect = "/") {
  return (req, res, next) => {
    const isAuthenticated = type === "admin" ? Boolean(req.admin) : Boolean(req.user);
    if (!isAuthenticated) {
      const cookieName = type === "admin" ? "itj_admin_token" : "itj_token";
      clearCookieCleanly(req, res, cookieName);
      if (req.flash) {
        req.flash("success", "Phiên làm việc đã kết thúc.");
      }
      return res.redirect(fallbackRedirect);
    }
    next();
  };
}

module.exports = {
  authenticateUser,
  authenticateAdmin,
  requireCandidate,
  requireEmployer,
  requireEmployerAdmin,
  requireEmployerOwner,
  requireActiveEmployer,
  requireAdmin,
  requireSuperAdmin,
  adminSecurityHeaders,
  requireGuest,
  bypassCsrfIfLoggedOut,
};
