// src/controllers/employer/employerAuth.controller.js
const { Employer } = require("../../models");
const { EMPLOYER_STATUS } = require("../../config/constants");
const { hashPassword, comparePassword, signUserToken } = require("../../services/auth.service");
const {
  employerSignupSchema,
  loginSchema,
  changePasswordSchema,
} = require("../../validators/auth.validator");
const slugify = require("../../utils/slugify");
const env = require("../../config/env");

const renderSignup = (req, res) => {
  res.render("pages/employer-signup", {
    title: "Đăng ký (Nhà tuyển dụng)",
    errors: {},
    old: {},
  });
};

const postSignup = async (req, res) => {
  const result = employerSignupSchema.safeParse(req.body);
  if (!result.success) {
    const errors = {};
    result.error.errors.forEach((err) => {
      errors[err.path[0]] = err.message;
    });
    return res.status(400).render("pages/employer-signup", {
      title: "Đăng ký (Nhà tuyển dụng)",
      errors,
      old: req.body,
    });
  }

  const { companyName, email, password } = result.data;
  const existing = await Employer.findOne({ email });
  if (existing) {
    return res.status(400).render("pages/employer-signup", {
      title: "Đăng ký (Nhà tuyển dụng)",
      errors: { email: "Email này đã được sử dụng. Vui lòng chọn email khác." },
      old: req.body,
    });
  }

  const hashedPassword = await hashPassword(password);
  const status = env.EMPLOYER_REQUIRE_APPROVAL ? EMPLOYER_STATUS.PENDING : EMPLOYER_STATUS.ACTIVE;
  const slug = slugify(companyName, true);

  const employer = await Employer.create({
    companyName,
    slug,
    email,
    password: hashedPassword,
    status,
    approvedAt: status === EMPLOYER_STATUS.ACTIVE ? new Date() : null,
  });

  const token = signUserToken(employer, "employer");
  res.cookie("itj_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  if (status === EMPLOYER_STATUS.PENDING) {
    req.flash("success", "Đăng ký thành công! Tài khoản của bạn đang chờ quản trị viên phê duyệt.");
  } else {
    req.flash("success", "Đăng ký thành công tài khoản Nhà tuyển dụng!");
  }
  res.redirect("/employer/company-profile");
};

const renderLogin = (req, res) => {
  res.render("pages/employer-login", {
    title: "Đăng nhập (Nhà tuyển dụng)",
    next: req.query.next || "",
    errors: {},
    old: {},
  });
};

const postLogin = async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).render("pages/employer-login", {
      title: "Đăng nhập (Nhà tuyển dụng)",
      errors: { general: "Email hoặc mật khẩu không đúng" },
      old: req.body,
      next: req.body.next || "",
    });
  }

  const { email, password } = result.data;
  const employer = await Employer.findOne({ email, deletedAt: null }).select("+password");

  if (!employer) {
    return res.status(400).render("pages/employer-login", {
      title: "Đăng nhập (Nhà tuyển dụng)",
      errors: { general: "Email hoặc mật khẩu không đúng" },
      old: req.body,
      next: req.body.next || "",
    });
  }

  if (employer.status === EMPLOYER_STATUS.BANNED) {
    const reasonMsg = employer.banReason ? ` Lí do: ${employer.banReason}` : "";
    return res.status(403).render("pages/employer-login", {
      title: "Đăng nhập (Nhà tuyển dụng)",
      errors: { general: `Tài khoản công ty đã bị khóa.${reasonMsg}` },
      old: req.body,
      next: req.body.next || "",
    });
  }

  const isMatch = await comparePassword(password, employer.password);
  if (!isMatch) {
    return res.status(400).render("pages/employer-login", {
      title: "Đăng nhập (Nhà tuyển dụng)",
      errors: { general: "Email hoặc mật khẩu không đúng" },
      old: req.body,
      next: req.body.next || "",
    });
  }

  employer.lastLoginAt = new Date();
  await employer.save();

  const token = signUserToken(employer, "employer");
  res.cookie("itj_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  req.flash("success", `Chào mừng đại diện ${employer.companyName} đã quay trở lại!`);
  const redirectUrl = req.body.next && req.body.next.startsWith("/") ? req.body.next : "/employer/jobs";
  res.redirect(redirectUrl);
};

const postLogout = (req, res) => {
  res.clearCookie("itj_token");
  req.flash("success", "Đã đăng xuất thành công.");
  res.redirect("/");
};

const renderChangePassword = (req, res) => {
  res.render("pages/change-password", {
    title: "Đổi mật khẩu (Nhà tuyển dụng)",
    userRole: "employer",
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
      title: "Đổi mật khẩu (Nhà tuyển dụng)",
      userRole: "employer",
      errors,
      old: req.body,
    });
  }

  const { currentPassword, newPassword } = result.data;
  const employer = await Employer.findById(req.user._id).select("+password");

  const isMatch = await comparePassword(currentPassword, employer.password);
  if (!isMatch) {
    return res.status(400).render("pages/change-password", {
      title: "Đổi mật khẩu (Nhà tuyển dụng)",
      userRole: "employer",
      errors: { currentPassword: "Mật khẩu hiện tại không chính xác" },
      old: req.body,
    });
  }

  employer.password = await hashPassword(newPassword);
  employer.tokenVersion = (employer.tokenVersion || 0) + 1; // Hủy phiên cũ
  await employer.save();

  const newToken = signUserToken(employer, "employer");
  res.cookie("itj_token", newToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  req.flash("success", "Đổi mật khẩu thành công!");
  res.redirect("/employer/company-profile");
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
