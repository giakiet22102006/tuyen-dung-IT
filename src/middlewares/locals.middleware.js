// src/middlewares/locals.middleware.js
const { generateToken } = require("./csrf.middleware");
const { getMenuData } = require("../services/menu.service");
const formatSalary = require("../utils/formatSalary");
const formatJobDescription = require("../utils/formatJobDescription");
const labels = require("../utils/labels");
const { safeUrl, safeJsonForScript } = require("../utils/securityHelpers");
const env = require("../config/env");
const { SavedJob, Setting } = require("../models");

function sanitizeLocalUser(user) {
  if (!user || typeof user !== "object") return null;
  const plain = typeof user.toObject === "function" ? user.toObject() : { ...user };
  delete plain.password;
  if (Array.isArray(plain.teamMembers)) {
    plain.teamMembers = plain.teamMembers.map((member) => {
      if (!member || typeof member !== "object") return member;
      const copy = { ...member };
      delete copy.password;
      return copy;
    });
  }
  if (plain.currentMember && typeof plain.currentMember === "object") {
    const memberCopy = { ...plain.currentMember };
    delete memberCopy.password;
    plain.currentMember = memberCopy;
  }
  return plain;
}

async function localsMiddleware(req, res, next) {
  res.locals.currentUser = sanitizeLocalUser(req.user);
  res.locals.role = req.role || null;
  res.locals.currentAdmin = sanitizeLocalUser(req.admin);
  res.locals.adminPath = env.ADMIN_PATH || "admin";
  res.locals.currentPath = req.path;

  // Lấy danh sách ID các việc làm đã lưu nếu là Candidate
  res.locals.savedJobIds = new Set();
  if (req.role === "candidate" && req.user && req.user._id) {
    try {
      const savedDocs = await SavedJob.find({ candidateId: req.user._id }).select("jobId").lean();
      res.locals.savedJobIds = new Set(savedDocs.map((s) => s.jobId.toString()));
    } catch (_) {
      res.locals.savedJobIds = new Set();
    }
  }

  // Đếm thông báo chưa đọc cho Candidate hoặc Employer
  res.locals.unreadNotificationCount = 0;
  if (req.user && req.user._id && (req.role === "candidate" || req.role === "employer")) {
    try {
      const { getUnreadCount } = require("../services/notification.service");
      res.locals.unreadNotificationCount = await getUnreadCount(req.user._id, req.role);
    } catch (_) {
      res.locals.unreadNotificationCount = 0;
    }
  }

  // Helpers
  res.locals.formatSalary = formatSalary;
  res.locals.formatJobDescription = formatJobDescription;
  res.locals.labels = labels;
  res.locals.safeUrl = safeUrl;
  res.locals.safeJson = safeJsonForScript;
  res.locals.formatDate = (date) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("vi-VN");
  };
  res.locals.formatDateTime = (date) => {
    if (!date) return "";
    return new Date(date).toLocaleString("vi-VN");
  };

  // CSRF token
  try {
    res.locals.csrfToken = generateToken(req, res);
  } catch (err) {
    console.error("Lỗi generateToken:", err);
    res.locals.csrfToken = "";
  }

  // Cached menu data
  try {
    res.locals.menuData = await getMenuData();
  } catch (err) {
    res.locals.menuData = { skills: [], topEmployers: [], cities: [] };
  }

  // Cached site settings (About, contact, address in Footer)
  try {
    const settings = await Setting.getSettings();
    res.locals.siteSetting = settings.about || {};
  } catch (err) {
    res.locals.siteSetting = {};
  }

  next();
}

module.exports = localsMiddleware;
