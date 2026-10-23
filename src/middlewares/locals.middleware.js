// src/middlewares/locals.middleware.js
const { generateToken } = require("./csrf.middleware");
const { getMenuData } = require("../services/menu.service");
const formatSalary = require("../utils/formatSalary");
const labels = require("../utils/labels");
const env = require("../config/env");
const { SavedJob } = require("../models");

async function localsMiddleware(req, res, next) {
  res.locals.currentUser = req.user || null;
  res.locals.role = req.role || null;
  res.locals.currentAdmin = req.admin || null;
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

  // Helpers
  res.locals.formatSalary = formatSalary;
  res.locals.labels = labels;
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

  next();
}

module.exports = localsMiddleware;
