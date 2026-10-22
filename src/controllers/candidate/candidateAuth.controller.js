// src/controllers/candidate/candidateAuth.controller.js
const { Candidate } = require("../../models");
const { CANDIDATE_STATUS } = require("../../config/constants");
const { hashPassword, comparePassword, signUserToken } = require("../../services/auth.service");
const {
  candidateSignupSchema,
  loginSchema,
  changePasswordSchema,
} = require("../../validators/auth.validator");
const env = require("../../config/env");

const renderSignup = (req, res) => {
  res.render("pages/candidate-signup", {
    title: "Đăng ký (Ứng viên)",
    errors: {},
    old: {},
  });
};

const postSignup = async (req, res) => {
  const result = candidateSignupSchema.safeParse(req.body);
  if (!result.success) {
    const errors = {};
    result.error.errors.forEach((err) => {
      errors[err.path[0]] = err.message;
    });
    return res.status(400).render("pages/candidate-signup", {
      title: "Đăng ký (Ứng viên)",
      errors,
      old: req.body,
    });
  }

  const { fullName, email, password } = result.data;
  const existing = await Candidate.findOne({ email });
  if (existing) {
    return res.status(400).render("pages/candidate-signup", {
      title: "Đăng ký (Ứng viên)",
      errors: { email: "Email này đã được sử dụng. Vui lòng chọn email khác." },
      old: req.body,
    });
  }

  const hashedPassword = await hashPassword(password);
  const candidate = await Candidate.create({
    fullName,
    email,
    password: hashedPassword,
    status: CANDIDATE_STATUS.ACTIVE,
  });

  const token = signUserToken(candidate, "candidate");
  res.cookie("itj_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  req.flash("success", "Đăng ký tài khoản Ứng viên thành công!");
  res.redirect("/");
};

const renderLogin = (req, res) => {
  res.render("pages/candidate-login", {
    title: "Đăng nhập (Ứng viên)",
    next: req.query.next || "",
    errors: {},
    old: {},
  });
};

const postLogin = async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).render("pages/candidate-login", {
      title: "Đăng nhập (Ứng viên)",
      errors: { general: "Email hoặc mật khẩu không đúng" },
      old: req.body,
      next: req.body.next || "",
    });
  }

  const { email, password } = result.data;
  const candidate = await Candidate.findOne({ email, deletedAt: null }).select("+password");

  if (!candidate) {
    return res.status(400).render("pages/candidate-login", {
      title: "Đăng nhập (Ứng viên)",
      errors: { general: "Email hoặc mật khẩu không đúng" },
      old: req.body,
      next: req.body.next || "",
    });
  }

  if (candidate.status === CANDIDATE_STATUS.BANNED) {
    const reasonMsg = candidate.banReason ? ` Lí do: ${candidate.banReason}` : "";
    return res.status(403).render("pages/candidate-login", {
      title: "Đăng nhập (Ứng viên)",
      errors: { general: `Tài khoản của bạn đã bị khóa.${reasonMsg}` },
      old: req.body,
      next: req.body.next || "",
    });
  }

  const isMatch = await comparePassword(password, candidate.password);
  if (!isMatch) {
    return res.status(400).render("pages/candidate-login", {
      title: "Đăng nhập (Ứng viên)",
      errors: { general: "Email hoặc mật khẩu không đúng" },
      old: req.body,
      next: req.body.next || "",
    });
  }

  candidate.lastLoginAt = new Date();
  await candidate.save();

  const token = signUserToken(candidate, "candidate");
  res.cookie("itj_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  req.flash("success", `Chào mừng ${candidate.fullName} đã quay trở lại!`);
  const redirectUrl = req.body.next && req.body.next.startsWith("/") ? req.body.next : "/";
  res.redirect(redirectUrl);
};

const postLogout = (req, res) => {
  res.clearCookie("itj_token");
  req.flash("success", "Đã đăng xuất thành công.");
  res.redirect("/");
};

const renderChangePassword = (req, res) => {
  res.render("pages/change-password", {
    title: "Đổi mật khẩu (Ứng viên)",
    userRole: "candidate",
    errors: {},
    old: {},
  });
};

const postChangePassword = async (req, res) => {
  const result = changePasswordSchema.safeParse(req.body);
  if (!result.success) {
    const errors = {};
    result.error.errors.forEach((err) => {
      errors[err.path[0]] = err.message;
    });
    return res.status(400).render("pages/change-password", {
      title: "Đổi mật khẩu (Ứng viên)",
      userRole: "candidate",
      errors,
      old: req.body,
    });
  }

  const { currentPassword, newPassword } = result.data;
  const candidate = await Candidate.findById(req.user._id).select("+password");

  const isMatch = await comparePassword(currentPassword, candidate.password);
  if (!isMatch) {
    return res.status(400).render("pages/change-password", {
      title: "Đổi mật khẩu (Ứng viên)",
      userRole: "candidate",
      errors: { currentPassword: "Mật khẩu hiện tại không chính xác" },
      old: req.body,
    });
  }

  candidate.password = await hashPassword(newPassword);
  candidate.tokenVersion = (candidate.tokenVersion || 0) + 1; // Hủy mọi phiên cũ
  await candidate.save();

  // Đặt token mới với tokenVersion đã cập nhật
  const newToken = signUserToken(candidate, "candidate");
  res.cookie("itj_token", newToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  req.flash("success", "Đổi mật khẩu thành công!");
  res.redirect("/candidate/profile");
};

module.exports = {
  renderSignup,
  postSignup,
  renderLogin,
  postLogin,
  postLogout,
  renderChangePassword,
  postChangePassword,
};
