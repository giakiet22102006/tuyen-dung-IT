// src/controllers/employer/employerAuth.controller.js
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Employer, Otp } = require("../../models");
const { EMPLOYER_STATUS } = require("../../config/constants");
const { hashPassword, comparePassword, signUserToken } = require("../../services/auth.service");
const { sendRegistrationOtpEmail, sendSecurityAlertEmail } = require("../../services/mail.service");
const {
  employerSignupSchema,
  loginSchema,
  changePasswordSchema,
} = require("../../validators/auth.validator");
const slugify = require("../../utils/slugify");
const env = require("../../config/env");
const isSafeRedirect = require("../../utils/sanitizeRedirect");

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
  const cleanEmail = email.toLowerCase().trim();
  const existing = await Employer.findOne({ email: cleanEmail });

  if (existing) {
    if (existing.isEmailVerified !== false) {
      return res.status(400).render("pages/employer-signup", {
        title: "Đăng ký (Nhà tuyển dụng)",
        errors: { email: "Email này đã được sử dụng. Vui lòng chọn email khác hoặc Đăng nhập." },
        old: req.body,
      });
    }

    // Cập nhật lại thông tin nếu chưa xác thực email
    existing.companyName = companyName;
    existing.password = await hashPassword(password);
    await existing.save();

    const otpCode = crypto.randomInt(100000, 999999).toString();
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otpCode, salt);

    await Otp.deleteMany({ email: cleanEmail, userType: "employer", type: "register" });
    await Otp.create({
      email: cleanEmail,
      otpHash,
      userType: "employer",
      type: "register",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    try {
      await sendRegistrationOtpEmail(cleanEmail, otpCode, "employer");
    } catch (err) {
      console.error("Lỗi gửi email đăng ký NTD:", err.message);
    }

    req.flash("success", "Tài khoản công ty đã được cập nhật. Vui lòng nhập mã OTP gửi về Gmail để kích hoạt!");
    return res.redirect(`/employer/verify-registration?email=${encodeURIComponent(cleanEmail)}`);
  }

  const hashedPassword = await hashPassword(password);
  const status = env.EMPLOYER_REQUIRE_APPROVAL ? EMPLOYER_STATUS.PENDING : EMPLOYER_STATUS.ACTIVE;
  const slug = slugify(companyName, true);

  await Employer.create({
    companyName,
    slug,
    email: cleanEmail,
    password: hashedPassword,
    status,
    isEmailVerified: false, // Bắt buộc phải xác thực email
    approvedAt: status === EMPLOYER_STATUS.ACTIVE ? new Date() : null,
  });

  // Tạo mã OTP xác thực đăng ký
  const otpCode = crypto.randomInt(100000, 999999).toString();
  const salt = await bcrypt.genSalt(10);
  const otpHash = await bcrypt.hash(otpCode, salt);

  await Otp.deleteMany({ email: cleanEmail, userType: "employer", type: "register" });
  await Otp.create({
    email: cleanEmail,
    otpHash,
    userType: "employer",
    type: "register",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  try {
    await sendRegistrationOtpEmail(cleanEmail, otpCode, "employer");
  } catch (err) {
    console.error("Lỗi gửi email đăng ký NTD:", err.message);
  }

  req.flash("success", "Đăng ký thành công! Vui lòng nhập mã xác thực OTP gửi về Gmail để kích hoạt tài khoản công ty.");
  res.redirect(`/employer/verify-registration?email=${encodeURIComponent(cleanEmail)}`);
};

// Giao diện nhập mã OTP kích hoạt tài khoản nhà tuyển dụng
const renderVerifyRegistration = (req, res) => {
  const email = (req.query.email || "").toLowerCase().trim();
  if (!email) {
    return res.redirect("/employer/signup");
  }
  res.render("pages/verify-registration", {
    title: "Xác thực Email đăng ký (Nhà tuyển dụng)",
    userRole: "employer",
    email,
    errors: {},
  });
};

// Xử lý xác thực mã OTP kích hoạt nhà tuyển dụng
const postVerifyRegistration = async (req, res) => {
  const { email, otp } = req.body;
  const cleanEmail = (email || "").toLowerCase().trim();
  const cleanOtp = (otp || "").trim();

  if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).render("pages/verify-registration", {
      title: "Xác thực Email đăng ký (Nhà tuyển dụng)",
      userRole: "employer",
      email: cleanEmail,
      errors: { otp: "Mã OTP phải gồm đúng 6 chữ số." },
    });
  }

  const otpRecord = await Otp.findOne({
    email: cleanEmail,
    userType: "employer",
    type: "register",
    expiresAt: { $gt: new Date() },
  });

  if (!otpRecord) {
    return res.status(400).render("pages/verify-registration", {
      title: "Xác thực Email đăng ký (Nhà tuyển dụng)",
      userRole: "employer",
      email: cleanEmail,
      errors: { otp: "Mã OTP đã hết hạn hoặc không tồn tại. Vui lòng bấm 'Gửi lại mã OTP'." },
    });
  }

  if (otpRecord.attempts >= 5) {
    await Otp.deleteOne({ _id: otpRecord._id });
    return res.status(400).render("pages/verify-registration", {
      title: "Xác thực Email đăng ký (Nhà tuyển dụng)",
      userRole: "employer",
      email: cleanEmail,
      errors: { otp: "Bạn đã nhập sai mã quá 5 lần. Vui lòng bấm gửi lại mã mới." },
    });
  }

  const isMatch = await bcrypt.compare(cleanOtp, otpRecord.otpHash);
  if (!isMatch) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    const remaining = 5 - otpRecord.attempts;
    return res.status(400).render("pages/verify-registration", {
      title: "Xác thực Email đăng ký (Nhà tuyển dụng)",
      userRole: "employer",
      email: cleanEmail,
      errors: { otp: `Mã OTP không chính xác. Bạn còn ${remaining} lần thử.` },
    });
  }

  // Khớp OTP -> Kích hoạt email công ty
  const employer = await Employer.findOne({ email: cleanEmail });
  if (!employer) {
    req.flash("error", "Không tìm thấy thông tin tài khoản công ty.");
    return res.redirect("/employer/signup");
  }

  employer.isEmailVerified = true;
  employer.tokenVersion = (employer.tokenVersion || 0) + 1;
  await employer.save();

  // Xóa mã OTP đã dùng
  await Otp.deleteMany({ email: cleanEmail, userType: "employer", type: "register" });

  // Tự động đăng nhập
  const token = signUserToken(employer, "employer");
  res.cookie("itj_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  req.flash("success", "Xác thực email thành công! Tài khoản công ty đã được kích hoạt.");
  res.redirect("/employer/company-profile");
};

// Gửi lại mã OTP đăng ký nhà tuyển dụng
const postResendRegistrationOtp = async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || "").toLowerCase().trim();

  const employer = await Employer.findOne({ email: cleanEmail });
  if (!employer || employer.isEmailVerified) {
    req.flash("error", "Tài khoản không tồn tại hoặc đã được xác thực trước đó.");
    return res.redirect("/employer/login");
  }

  const otpCode = crypto.randomInt(100000, 999999).toString();
  const salt = await bcrypt.genSalt(10);
  const otpHash = await bcrypt.hash(otpCode, salt);

  await Otp.deleteMany({ email: cleanEmail, userType: "employer", type: "register" });
  await Otp.create({
    email: cleanEmail,
    otpHash,
    userType: "employer",
    type: "register",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  try {
    await sendRegistrationOtpEmail(cleanEmail, otpCode, "employer");
  } catch (err) {
    console.error("Lỗi gửi lại mã OTP NTD:", err.message);
  }

  req.flash("success", `Đã gửi lại mã OTP mới tới hòm thư ${cleanEmail}. Vui lòng kiểm tra email!`);
  res.redirect(`/employer/verify-registration?email=${encodeURIComponent(cleanEmail)}`);
};

const renderLogin = (req, res) => {
  if (req.cookies?.itj_session_conflict) {
    res.clearCookie("itj_session_conflict");
    if (req.flash) {
      req.flash("error", "⚠️ Phiên làm việc đã kết thúc do tài khoản vừa đăng nhập trên một thiết bị/trình duyệt khác. Nếu không phải bạn, hãy đổi mật khẩu ngay!");
    }
  }

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
  const cleanEmail = email.toLowerCase().trim();
  let employer = await Employer.findOne({ email: cleanEmail, deletedAt: null }).select("+password");
  let loggedInMember = null;

  if (!employer) {
    // Tìm kiếm trong danh sách Chuyên viên tuyển dụng (Team members)
    employer = await Employer.findOne({
      "teamMembers.email": cleanEmail,
      deletedAt: null,
    });

    if (employer) {
      loggedInMember = (employer.teamMembers || []).find((m) => m.email === cleanEmail);
    }
  }

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
      errors: { general: `Tài khoản của bạn đã bị khóa.${reasonMsg}` },
      old: req.body,
      next: req.body.next || "",
    });
  }

  // Chặn đăng nhập nếu chưa xác thực email
  if (employer.isEmailVerified === false) {
    return res.status(403).render("pages/employer-login", {
      title: "Đăng nhập (Nhà tuyển dụng)",
      errors: { general: "Tài khoản công ty chưa xác thực email. Vui lòng xác thực trước khi đăng nhập." },
      unverifiedEmail: employer.email,
      old: req.body,
      next: req.body.next || "",
    });
  }

  if (loggedInMember) {
    // Đăng nhập với tư cách Chuyên viên tuyển dụng
    const isMemberMatch = await comparePassword(password, loggedInMember.password || "");
    if (!isMemberMatch) {
      return res.status(400).render("pages/employer-login", {
        title: "Đăng nhập (Nhà tuyển dụng)",
        errors: { general: "Email hoặc mật khẩu không đúng" },
        old: req.body,
        next: req.body.next || "",
      });
    }

    // Tăng tokenVersion riêng của chuyên viên để quản lý phiên độc lập
    loggedInMember.tokenVersion = (loggedInMember.tokenVersion || 0) + 1;
    loggedInMember.lastLoginAt = new Date();
    await employer.save();

    const token = signUserToken(employer, "employer", {
      memberId: loggedInMember._id.toString(),
      memberName: loggedInMember.fullName,
      memberEmail: loggedInMember.email,
      memberRole: loggedInMember.role,
      tv: loggedInMember.tokenVersion,
    });

    res.cookie("itj_token", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    sendSecurityAlertEmail({
      toEmail: loggedInMember.email,
      fullName: loggedInMember.fullName,
      userType: "employer",
      ip: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
      userAgent: req.headers["user-agent"] || "Trình duyệt web",
      loginTime: loggedInMember.lastLoginAt,
    }).catch((err) => console.error("Lỗi gửi email cảnh báo bảo mật Chuyên viên:", err.message));

    req.flash("success", `Chào mừng chuyên viên ${loggedInMember.fullName} đăng nhập thành công!`);
    const redirectUrl = isSafeRedirect(req.body.next) ? req.body.next : "/employer/company-profile";
    return res.redirect(redirectUrl);
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

  // Tăng tokenVersion để hủy phiên trên các thiết bị cũ (Single Active Session)
  employer.tokenVersion = (employer.tokenVersion || 0) + 1;
  employer.lastLoginAt = new Date();
  await employer.save();

  const token = signUserToken(employer, "employer");
  res.cookie("itj_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Gửi email cảnh báo bảo mật tới nhà tuyển dụng (chạy nền)
  sendSecurityAlertEmail({
    toEmail: employer.email,
    fullName: employer.companyName,
    userType: "employer",
    ip: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
    userAgent: req.headers["user-agent"] || "Trình duyệt web",
    loginTime: employer.lastLoginAt,
  }).catch((err) => console.error("Lỗi gửi email cảnh báo bảo mật NTD:", err.message));

  req.flash("success", "Đăng nhập thành công!");
  const redirectUrl = isSafeRedirect(req.body.next) ? req.body.next : "/employer/company-profile";
  res.redirect(redirectUrl);
};

const postLogout = (req, res) => {
  res.clearCookie("itj_token");
  req.flash("success", "Đăng xuất thành công!");
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
  employer.tokenVersion = (employer.tokenVersion || 0) + 1; // Hủy mọi phiên cũ
  await employer.save();

  // Đặt token mới với tokenVersion đã cập nhật
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

// Chuyển hướng sang Google OAuth Consent Screen cho Nhà tuyển dụng
const redirectToGoogle = (req, res) => {
  const googleAuthService = require("../../services/googleAuth.service");
  if (!googleAuthService.isGoogleConfigured()) {
    req.flash("error", "Chưa cấu hình GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET để sử dụng đăng nhập Google.");
    return res.redirect("/employer/login");
  }

  const nextUrl = isSafeRedirect(req.query.next) ? req.query.next : "/employer/company-profile";
  const authUrl = googleAuthService.getGoogleAuthUrl("employer", nextUrl, req);
  res.redirect(authUrl);
};

// Xử lý callback sau khi Nhà tuyển dụng đồng ý đăng nhập Google
const handleGoogleCallback = async (req, res) => {
  const googleAuthService = require("../../services/googleAuth.service");
  const { code, state, error } = req.query;

  if (error || !code) {
    req.flash("error", "Đăng nhập Google bị hủy hoặc gặp lỗi xác thực.");
    return res.redirect("/employer/login");
  }

  let nextUrl = "/employer/company-profile";
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
      if (decoded && isSafeRedirect(decoded.next)) {
        nextUrl = decoded.next;
      }
    } catch (e) {}
  }

  try {
    const redirectUri = googleAuthService.getCallbackUrl("employer", req);
    const tokens = await googleAuthService.exchangeCodeForTokens(code, redirectUri);
    const profile = await googleAuthService.fetchGoogleUserInfo(tokens.access_token);

    if (!profile || !profile.email) {
      req.flash("error", "Không lấy được địa chỉ email từ tài khoản Google.");
      return res.redirect("/employer/login");
    }

    const cleanEmail = profile.email.toLowerCase().trim();

    // Tìm nhà tuyển dụng theo googleId hoặc email đã tồn tại
    let employer = await Employer.findOne({
      $or: [{ googleId: profile.sub }, { email: cleanEmail }],
      deletedAt: null,
    });

    if (employer) {
      if (employer.status === EMPLOYER_STATUS.BANNED) {
        const reasonMsg = employer.banReason ? ` Lí do: ${employer.banReason}` : "";
        req.flash("error", `Tài khoản công ty của bạn đã bị khóa.${reasonMsg}`);
        return res.redirect("/employer/login");
      }

      employer.googleId = profile.sub;
      employer.isEmailVerified = true;
      if (!employer.logo || !employer.logo.url) {
        employer.logo = { url: profile.picture || "", key: "" };
      }
      employer.tokenVersion = (employer.tokenVersion || 0) + 1;
      employer.lastLoginAt = new Date();
      await employer.save();
    } else {
      // Đăng ký mới tự động cho Nhà tuyển dụng đăng nhập lần đầu bằng Google
      const randomPass = crypto.randomBytes(32).toString("hex");
      const hashedPassword = await hashPassword(randomPass);

      const baseCompanyName = profile.name ? `Công ty ${profile.name}` : `Công ty ${cleanEmail.split("@")[0]}`;
      const slug = slugify(baseCompanyName, true);

      employer = await Employer.create({
        companyName: baseCompanyName,
        slug,
        email: cleanEmail,
        password: hashedPassword,
        googleId: profile.sub,
        authProvider: "google",
        logo: { url: profile.picture || "", key: "" },
        isEmailVerified: true,
        status: env.EMPLOYER_REQUIRE_APPROVAL ? EMPLOYER_STATUS.PENDING : EMPLOYER_STATUS.ACTIVE,
        city: "ha-noi",
        lastLoginAt: new Date(),
      });
    }

    const token = signUserToken(employer, "employer");
    res.cookie("itj_token", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    sendSecurityAlertEmail({
      toEmail: employer.email,
      fullName: employer.companyName,
      userType: "employer",
      ip: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
      userAgent: req.headers["user-agent"] || "Trình duyệt web",
      loginTime: employer.lastLoginAt,
    }).catch((err) => console.error("Lỗi gửi email cảnh báo bảo mật Google NTD:", err.message));

    req.flash("success", "Đăng nhập tài khoản Nhà tuyển dụng bằng Google thành công!");
    res.redirect(nextUrl);
  } catch (err) {
    console.error("Lỗi Google Auth Employer Callback:", err);
    req.flash("error", "Đăng nhập Google thất bại: " + err.message);
    res.redirect("/employer/login");
  }
};

module.exports = {
  renderSignup,
  postSignup,
  renderVerifyRegistration,
  postVerifyRegistration,
  postResendRegistrationOtp,
  renderLogin,
  postLogin,
  postLogout,
  renderChangePassword,
  postChangePassword,
  redirectToGoogle,
  handleGoogleCallback,
};
