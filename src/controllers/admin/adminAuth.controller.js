// src/controllers/admin/adminAuth.controller.js
const bcrypt = require("bcryptjs");
const { Admin } = require("../../models");
const { ADMIN_STATUS } = require("../../config/constants");
const { signAdminToken } = require("../../services/auth.service");
const { logAdminAction } = require("../../services/audit.service");
const env = require("../../config/env");

const renderLogin = (req, res) => {
  if (req.admin) {
    return res.redirect(`/${env.ADMIN_PATH}`);
  }

  res.render("admin/login", {
    title: "Đăng nhập Quản trị viên - VN.ITJobs",
    errors: {},
    old: {},
  });
};

const postLogin = async (req, res) => {
  const { email, password } = req.body;
  const adminPath = env.ADMIN_PATH || "admin";

  if (!email || !password) {
    return res.status(400).render("admin/login", {
      title: "Đăng nhập Quản trị viên - VN.ITJobs",
      errors: { general: "Vui lòng nhập đầy đủ Email và Mật khẩu" },
      old: req.body,
    });
  }

  const admin = await Admin.findOne({
    email: email.toLowerCase().trim(),
    status: ADMIN_STATUS.ACTIVE,
  }).select("+password");

  if (!admin) {
    return res.status(400).render("admin/login", {
      title: "Đăng nhập Quản trị viên - VN.ITJobs",
      errors: { general: "Email hoặc mật khẩu không chính xác" },
      old: req.body,
    });
  }

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    return res.status(400).render("admin/login", {
      title: "Đăng nhập Quản trị viên - VN.ITJobs",
      errors: { general: "Email hoặc mật khẩu không chính xác" },
      old: req.body,
    });
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  const token = signAdminToken(admin);
  res.cookie("itj_admin_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
  });

  await logAdminAction({
    adminId: admin._id,
    action: "admin.login",
    targetType: "System",
    targetId: admin._id,
    meta: { email: admin.email, role: admin.role },
    ip: req.ip,
  });

  req.flash("success", `Xin chào, ${admin.fullName}!`);
  res.redirect(`/${adminPath}`);
};

const postLogout = (req, res) => {
  res.clearCookie("itj_admin_token");
  const adminPath = env.ADMIN_PATH || "admin";
  req.flash("success", "Đã đăng xuất khỏi trang Quản trị.");
  res.redirect(`/${adminPath}/login`);
};

module.exports = {
  renderLogin,
  postLogin,
  postLogout,
};
