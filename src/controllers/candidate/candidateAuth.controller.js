// src/controllers/candidate/candidateAuth.controller.js
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Candidate, Otp } = require("../../models");
const { CANDIDATE_STATUS } = require("../../config/constants");
const { hashPassword, comparePassword, signUserToken } = require("../../services/auth.service");
const { sendRegistrationOtpEmail } = require("../../services/mail.service");
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
  const cleanEmail = email.toLowerCase().trim();
  const existing = await Candidate.findOne({ email: cleanEmail });

  if (existing) {
    // Nếu tài khoản đã tồn tại và ĐÃ xác thực email
    if (existing.isEmailVerified !== false) {
      return res.status(400).render("pages/candidate-signup", {
        title: "Đăng ký (Ứng viên)",
        errors: { email: "Email này đã được sử dụng. Vui lòng chọn email khác hoặc Đăng nhập." },
        old: req.body,
      });
    }

    // Nếu tài khoản đã đăng ký trước đó nhưng CHƯA xác thực email -> cập nhật thông tin và gửi lại mã OTP
    existing.fullName = fullName;
    existing.password = await hashPassword(password);
    await existing.save();

    const otpCode = crypto.randomInt(100000, 999999).toString();
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otpCode, salt);

    await Otp.deleteMany({ email: cleanEmail, userType: "candidate", type: "register" });
    await Otp.create({
      email: cleanEmail,
      otpHash,
      userType: "candidate",
      type: "register",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    try {
      await sendRegistrationOtpEmail(cleanEmail, otpCode, "candidate");
    } catch (err) {
      console.error("Lỗi gửi email đăng ký:", err.message);
    }

    req.flash("success", "Tài khoản của bạn đã được cập nhật. Vui lòng nhập mã OTP gửi về Gmail để kích hoạt!");
    return res.redirect(`/candidate/verify-registration?email=${encodeURIComponent(cleanEmail)}`);
  }

  const hashedPassword = await hashPassword(password);
  await Candidate.create({
    fullName,
    email: cleanEmail,
    password: hashedPassword,
    status: CANDIDATE_STATUS.ACTIVE,
    isEmailVerified: false, // Bắt buộc phải xác thực email
  });

  // Tạo mã OTP xác thực
  const otpCode = crypto.randomInt(100000, 999999).toString();
  const salt = await bcrypt.genSalt(10);
  const otpHash = await bcrypt.hash(otpCode, salt);

  await Otp.deleteMany({ email: cleanEmail, userType: "candidate", type: "register" });
  await Otp.create({
    email: cleanEmail,
    otpHash,
    userType: "candidate",
    type: "register",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  try {
    await sendRegistrationOtpEmail(cleanEmail, otpCode, "candidate");
  } catch (err) {
    console.error("Lỗi gửi email đăng ký:", err.message);
  }

  req.flash("success", "Đăng ký thành công! Vui lòng nhập mã xác thực OTP gửi về Gmail để kích hoạt tài khoản.");
  res.redirect(`/candidate/verify-registration?email=${encodeURIComponent(cleanEmail)}`);
};

// Giao diện nhập mã OTP kích hoạt tài khoản
const renderVerifyRegistration = (req, res) => {
  const email = (req.query.email || "").toLowerCase().trim();
  if (!email) {
    return res.redirect("/candidate/signup");
  }
  res.render("pages/verify-registration", {
    title: "Xác thực Email đăng ký (Ứng viên)",
    userRole: "candidate",
    email,
    errors: {},
  });
};

// Xử lý xác thực mã OTP kích hoạt
const postVerifyRegistration = async (req, res) => {
  const { email, otp } = req.body;
  const cleanEmail = (email || "").toLowerCase().trim();
  const cleanOtp = (otp || "").trim();

  if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).render("pages/verify-registration", {
      title: "Xác thực Email đăng ký (Ứng viên)",
      userRole: "candidate",
      email: cleanEmail,
      errors: { otp: "Mã OTP phải gồm đúng 6 chữ số." },
    });
  }

  const otpRecord = await Otp.findOne({
    email: cleanEmail,
    userType: "candidate",
    type: "register",
    expiresAt: { $gt: new Date() },
  });

  if (!otpRecord) {
    return res.status(400).render("pages/verify-registration", {
      title: "Xác thực Email đăng ký (Ứng viên)",
      userRole: "candidate",
      email: cleanEmail,
      errors: { otp: "Mã OTP đã hết hạn hoặc không tồn tại. Vui lòng bấm 'Gửi lại mã OTP'." },
    });
  }

  if (otpRecord.attempts >= 5) {
    await Otp.deleteOne({ _id: otpRecord._id });
    return res.status(400).render("pages/verify-registration", {
      title: "Xác thực Email đăng ký (Ứng viên)",
      userRole: "candidate",
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
      title: "Xác thực Email đăng ký (Ứng viên)",
      userRole: "candidate",
      email: cleanEmail,
      errors: { otp: `Mã OTP không chính xác. Bạn còn ${remaining} lần thử.` },
    });
  }

  // Khớp OTP -> Kích hoạt tài khoản ứng viên
  const candidate = await Candidate.findOne({ email: cleanEmail });
  if (!candidate) {
    req.flash("error", "Không tìm thấy thông tin tài khoản.");
    return res.redirect("/candidate/signup");
  }

  candidate.isEmailVerified = true;
  await candidate.save();

  // Xóa mã OTP đã dùng
  await Otp.deleteMany({ email: cleanEmail, userType: "candidate", type: "register" });

  // Tự động đăng nhập
  const token = signUserToken(candidate, "candidate");
  res.cookie("itj_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  req.flash("success", "Xác thực email thành công! Chào mừng bạn gia nhập VN.ITJobs.");
  res.redirect("/");
};

// Gửi lại mã OTP đăng ký
const postResendRegistrationOtp = async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || "").toLowerCase().trim();

  const candidate = await Candidate.findOne({ email: cleanEmail });
  if (!candidate || candidate.isEmailVerified) {
    req.flash("error", "Tài khoản không tồn tại hoặc đã được xác thực trước đó.");
    return res.redirect("/candidate/login");
  }

  const otpCode = crypto.randomInt(100000, 999999).toString();
  const salt = await bcrypt.genSalt(10);
  const otpHash = await bcrypt.hash(otpCode, salt);

  await Otp.deleteMany({ email: cleanEmail, userType: "candidate", type: "register" });
  await Otp.create({
    email: cleanEmail,
    otpHash,
    userType: "candidate",
    type: "register",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  try {
    await sendRegistrationOtpEmail(cleanEmail, otpCode, "candidate");
  } catch (err) {
    console.error("Lỗi gửi lại mã OTP:", err.message);
  }

  req.flash("success", `Đã gửi lại mã OTP mới tới hòm thư ${cleanEmail}. Vui lòng kiểm tra email!`);
  res.redirect(`/candidate/verify-registration?email=${encodeURIComponent(cleanEmail)}`);
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
  const cleanEmail = email.toLowerCase().trim();
  const candidate = await Candidate.findOne({ email: cleanEmail, deletedAt: null }).select("+password");

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

  // Chặn đăng nhập nếu chưa xác thực email
  if (candidate.isEmailVerified === false) {
    return res.status(403).render("pages/candidate-login", {
      title: "Đăng nhập (Ứng viên)",
      errors: { general: "Tài khoản của bạn chưa xác thực email. Vui lòng xác thực trước khi đăng nhập." },
      unverifiedEmail: cleanEmail,
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

  // Cập nhật lastLoginAt
  candidate.lastLoginAt = new Date();
  await candidate.save();

  const token = signUserToken(candidate, "candidate");
  res.cookie("itj_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  req.flash("success", "Đăng nhập thành công!");
  const redirectUrl = req.body.next && req.body.next.startsWith("/") ? req.body.next : "/";
  res.redirect(redirectUrl);
};

const postLogout = (req, res) => {
  res.clearCookie("itj_token");
  req.flash("success", "Đăng xuất thành công!");
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

// Chuyển hướng sang Google OAuth Consent Screen
const redirectToGoogle = (req, res) => {
  const googleAuthService = require("../../services/googleAuth.service");
  if (!googleAuthService.isGoogleConfigured()) {
    req.flash("error", "Chưa cấu hình GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET để sử dụng đăng nhập Google.");
    return res.redirect("/candidate/login");
  }

  const nextUrl = req.query.next || "/";
  const authUrl = googleAuthService.getGoogleAuthUrl("candidate", nextUrl, req);
  res.redirect(authUrl);
};

// Xử lý callback sau khi người dùng đồng ý đăng nhập Google
const handleGoogleCallback = async (req, res) => {
  const googleAuthService = require("../../services/googleAuth.service");
  const { code, state, error } = req.query;

  if (error || !code) {
    req.flash("error", "Đăng nhập Google bị hủy hoặc gặp lỗi xác thực.");
    return res.redirect("/candidate/login");
  }

  let nextUrl = "/";
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
      if (decoded && decoded.next && decoded.next.startsWith("/")) {
        nextUrl = decoded.next;
      }
    } catch (e) {}
  }

  try {
    const redirectUri = googleAuthService.getCallbackUrl("candidate", req);
    const tokens = await googleAuthService.exchangeCodeForTokens(code, redirectUri);
    const profile = await googleAuthService.fetchGoogleUserInfo(tokens.access_token);

    if (!profile || !profile.email) {
      req.flash("error", "Không lấy được địa chỉ email từ tài khoản Google.");
      return res.redirect("/candidate/login");
    }

    const cleanEmail = profile.email.toLowerCase().trim();

    // Tìm ứng viên theo googleId hoặc email đã tồn tại
    let candidate = await Candidate.findOne({
      $or: [{ googleId: profile.sub }, { email: cleanEmail }],
      deletedAt: null,
    });

    if (candidate) {
      if (candidate.status === CANDIDATE_STATUS.BANNED) {
        const reasonMsg = candidate.banReason ? ` Lí do: ${candidate.banReason}` : "";
        req.flash("error", `Tài khoản của bạn đã bị khóa.${reasonMsg}`);
        return res.redirect("/candidate/login");
      }

      candidate.googleId = profile.sub;
      candidate.isEmailVerified = true;
      if (!candidate.avatar || !candidate.avatar.url) {
        candidate.avatar = { url: profile.picture || "", key: "" };
      }
      candidate.lastLoginAt = new Date();
      await candidate.save();
    } else {
      // Đăng ký mới tự động cho Ứng viên đăng nhập lần đầu
      const randomPass = crypto.randomBytes(32).toString("hex");
      const hashedPassword = await hashPassword(randomPass);

      candidate = await Candidate.create({
        fullName: profile.name || cleanEmail.split("@")[0],
        email: cleanEmail,
        password: hashedPassword,
        googleId: profile.sub,
        authProvider: "google",
        avatar: { url: profile.picture || "", key: "" },
        isEmailVerified: true,
        status: CANDIDATE_STATUS.ACTIVE,
        lastLoginAt: new Date(),
      });
    }

    const token = signUserToken(candidate, "candidate");
    res.cookie("itj_token", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    req.flash("success", "Đăng nhập tài khoản Google thành công!");
    res.redirect(nextUrl);
  } catch (err) {
    console.error("Lỗi Google Auth Candidate Callback:", err);
    req.flash("error", "Đăng nhập Google thất bại: " + err.message);
    res.redirect("/candidate/login");
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
