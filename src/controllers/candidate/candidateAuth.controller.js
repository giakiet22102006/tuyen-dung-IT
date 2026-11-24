// src/controllers/candidate/candidateAuth.controller.js
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { Candidate, Otp } = require("../../models");
const { CANDIDATE_STATUS } = require("../../config/constants");
const { hashPassword, comparePassword, signUserToken } = require("../../services/auth.service");
const { sendRegistrationOtpEmail, sendSecurityAlertEmail } = require("../../services/mail.service");
const {
  candidateSignupSchema,
  loginSchema,
  changePasswordSchema,
} = require("../../validators/auth.validator");
const env = require("../../config/env");
const isSafeRedirect = require("../../utils/sanitizeRedirect");

const SIGNUP_NEXT_COOKIE = "itj_signup_next";

const setInitialPasswordSchema = z
  .object({
    newPassword: z
      .string({ required_error: "Mật khẩu không được để trống" })
      .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
      .regex(/[A-Za-z]/, "Mật khẩu phải chứa ít nhất một chữ cái")
      .regex(/[0-9]/, "Mật khẩu phải chứa ít nhất một chữ số"),
    confirmPassword: z
      .string({ required_error: "Xác nhận mật khẩu không được để trống" })
      .min(1, "Vui lòng xác nhận mật khẩu mới"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });

function getSafeNext(raw) {
  return isSafeRedirect(raw) ? raw : "";
}

function setSignupNextCookie(res, nextUrl) {
  if (!nextUrl) return;
  res.cookie(SIGNUP_NEXT_COOKIE, nextUrl, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60 * 1000,
  });
}

function clearSignupNextCookie(res) {
  res.clearCookie(SIGNUP_NEXT_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

function buildVerifyRegistrationUrl(email, nextUrl) {
  const qs = [`email=${encodeURIComponent(email)}`];
  if (nextUrl) {
    qs.push(`next=${encodeURIComponent(nextUrl)}`);
  }
  return `/candidate/verify-registration?${qs.join("&")}`;
}

const renderSignup = (req, res) => {
  res.render("pages/candidate-signup", {
    title: "Đăng ký (Ứng viên)",
    next: getSafeNext(req.query.next),
    errors: {},
    old: {},
  });
};

const postSignup = async (req, res) => {
  const nextUrl = getSafeNext(req.body.next || req.query.next);
  const result = candidateSignupSchema.safeParse(req.body);
  if (!result.success) {
    const errors = {};
    result.error.errors.forEach((err) => {
      errors[err.path[0]] = err.message;
    });
    return res.status(400).render("pages/candidate-signup", {
      title: "Đăng ký (Ứng viên)",
      next: nextUrl,
      errors,
      old: req.body,
    });
  }

  const { fullName, email, password } = result.data;
  const cleanEmail = email.toLowerCase().trim();
  // Tra cứu bao gồm cả tài khoản đã xóa mềm để xử lý rõ ràng thay vì để văng lỗi E11000
  const existing = await Candidate.findOne({ email: cleanEmail });

  if (existing) {
    if (existing.deletedAt) {
      return res.status(400).render("pages/candidate-signup", {
        title: "Đăng ký (Ứng viên)",
        next: nextUrl,
        errors: {
          email: "Tài khoản gắn với email này đã bị xóa hoặc vô hiệu hóa. Vui lòng dùng email khác hoặc liên hệ quản trị viên.",
        },
        old: req.body,
      });
    }

    // Nếu tài khoản đã tồn tại và ĐÃ xác thực email
    if (existing.isEmailVerified !== false) {
      return res.status(400).render("pages/candidate-signup", {
        title: "Đăng ký (Ứng viên)",
        next: nextUrl,
        errors: { email: "Email này đã được sử dụng. Vui lòng chọn email khác hoặc Đăng nhập." },
        old: req.body,
      });
    }

    // Tài khoản chưa xác thực email: KHÔNG âm thầm ghi đè mật khẩu/họ tên trước khi xác minh quyền sở hữu OTP
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otpCode, salt);

    await Otp.deleteMany({ email: cleanEmail, userType: "candidate", type: "register" });
    const createdOtp = await Otp.create({
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
      await Otp.deleteOne({ _id: createdOtp._id }).catch(() => {});
      return res.status(503).render("pages/candidate-signup", {
        title: "Đăng ký (Ứng viên)",
        next: nextUrl,
        errors: { general: "Không thể gửi email xác thực OTP lúc này. Vui lòng thử lại sau." },
        old: req.body,
      });
    }

    setSignupNextCookie(res, nextUrl);
    req.flash("success", "Email này đang chờ xác thực. Chúng tôi đã gửi lại mã OTP mới tới hòm thư của bạn!");
    return res.redirect(buildVerifyRegistrationUrl(cleanEmail, nextUrl));
  }

  const hashedPassword = await hashPassword(password);
  const createdCandidate = await Candidate.create({
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
  const createdOtp = await Otp.create({
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
    await Otp.deleteOne({ _id: createdOtp._id }).catch(() => {});
    await Candidate.deleteOne({ _id: createdCandidate._id }).catch(() => {});
    return res.status(503).render("pages/candidate-signup", {
      title: "Đăng ký (Ứng viên)",
      next: nextUrl,
      errors: { general: "Không thể gửi email xác thực OTP lúc này. Vui lòng thử lại sau." },
      old: req.body,
    });
  }

  setSignupNextCookie(res, nextUrl);
  req.flash("success", "Đăng ký thành công! Vui lòng nhập mã xác thực OTP gửi về Gmail để kích hoạt tài khoản.");
  res.redirect(buildVerifyRegistrationUrl(cleanEmail, nextUrl));
};

// Giao diện nhập mã OTP kích hoạt tài khoản
const renderVerifyRegistration = (req, res) => {
  const email = (req.query.email || "").toLowerCase().trim();
  const nextUrl = getSafeNext(req.query.next || req.cookies?.[SIGNUP_NEXT_COOKIE]);
  if (!email) {
    return res.redirect(nextUrl ? `/candidate/signup?next=${encodeURIComponent(nextUrl)}` : "/candidate/signup");
  }
  if (req.query.next && nextUrl) {
    setSignupNextCookie(res, nextUrl);
  }
  res.render("pages/verify-registration", {
    title: "Xác thực Email đăng ký (Ứng viên)",
    userRole: "candidate",
    email,
    next: nextUrl,
    errors: {},
  });
};

// Xử lý xác thực mã OTP kích hoạt
const postVerifyRegistration = async (req, res) => {
  const { email, otp } = req.body;
  const cleanEmail = (email || "").toLowerCase().trim();
  const cleanOtp = (otp || "").trim();
  const nextUrl = getSafeNext(req.body.next || req.query.next || req.cookies?.[SIGNUP_NEXT_COOKIE]);

  if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).render("pages/verify-registration", {
      title: "Xác thực Email đăng ký (Ứng viên)",
      userRole: "candidate",
      email: cleanEmail,
      next: nextUrl,
      errors: { otp: "Mã OTP phải gồm đúng 6 chữ số." },
    });
  }

  // Tăng attempts nguyên tử TRƯỚC khi chạy bcrypt.compare để chống Race Condition brute-force
  const otpRecord = await Otp.findOneAndUpdate(
    {
      email: cleanEmail,
      userType: "candidate",
      type: "register",
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 5 },
    },
    { $inc: { attempts: 1 } },
    { new: true }
  );

  if (!otpRecord) {
    await Otp.deleteMany({
      email: cleanEmail,
      userType: "candidate",
      type: "register",
      attempts: { $gte: 5 },
    });
    return res.status(400).render("pages/verify-registration", {
      title: "Xác thực Email đăng ký (Ứng viên)",
      userRole: "candidate",
      email: cleanEmail,
      next: nextUrl,
      errors: { otp: "Mã OTP đã hết hạn, không tồn tại hoặc đã vượt quá 5 lần thử. Vui lòng bấm 'Gửi lại mã OTP'." },
    });
  }

  const isMatch = await bcrypt.compare(cleanOtp, otpRecord.otpHash);
  if (!isMatch) {
    if (otpRecord.attempts >= 5) {
      await Otp.deleteOne({ _id: otpRecord._id });
      return res.status(400).render("pages/verify-registration", {
        title: "Xác thực Email đăng ký (Ứng viên)",
        userRole: "candidate",
        email: cleanEmail,
        next: nextUrl,
        errors: { otp: "Bạn đã nhập sai mã quá 5 lần. Vui lòng bấm gửi lại mã mới." },
      });
    }
    const remaining = Math.max(0, 5 - otpRecord.attempts);
    return res.status(400).render("pages/verify-registration", {
      title: "Xác thực Email đăng ký (Ứng viên)",
      userRole: "candidate",
      email: cleanEmail,
      next: nextUrl,
      errors: { otp: `Mã OTP không chính xác. Bạn còn ${remaining} lần thử.` },
    });
  }

  // Khớp OTP -> Kích hoạt tài khoản ứng viên
  const candidate = await Candidate.findOne({ email: cleanEmail, deletedAt: null });
  if (!candidate) {
    req.flash("error", "Không tìm thấy thông tin tài khoản.");
    return res.redirect("/candidate/signup");
  }

  candidate.isEmailVerified = true;
  candidate.tokenVersion = (candidate.tokenVersion || 0) + 1;
  await candidate.save();

  // Xóa mã OTP đã dùng và cookie next tạm
  await Otp.deleteMany({ email: cleanEmail, userType: "candidate", type: "register" });
  clearSignupNextCookie(res);

  // Tự động đăng nhập
  const token = signUserToken(candidate, "candidate");
  res.cookie("itj_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  req.flash("success", "Xác thực email thành công! Chào mừng bạn gia nhập VN.ITJobs.");
  res.redirect(nextUrl || "/");
};

// Gửi lại mã OTP đăng ký
const postResendRegistrationOtp = async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || "").toLowerCase().trim();
  const nextUrl = getSafeNext(req.body.next || req.query.next || req.cookies?.[SIGNUP_NEXT_COOKIE]);

  const candidate = await Candidate.findOne({ email: cleanEmail, deletedAt: null });
  if (!candidate || candidate.isEmailVerified) {
    req.flash("error", "Tài khoản không tồn tại hoặc đã được xác thực trước đó.");
    return res.redirect(nextUrl ? `/candidate/login?next=${encodeURIComponent(nextUrl)}` : "/candidate/login");
  }

  const otpCode = crypto.randomInt(100000, 999999).toString();
  const salt = await bcrypt.genSalt(10);
  const otpHash = await bcrypt.hash(otpCode, salt);

  await Otp.deleteMany({ email: cleanEmail, userType: "candidate", type: "register" });
  const createdOtp = await Otp.create({
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
    await Otp.deleteOne({ _id: createdOtp._id }).catch(() => {});
    req.flash("error", "Không thể gửi lại email xác thực OTP lúc này. Vui lòng thử lại sau.");
    return res.redirect(buildVerifyRegistrationUrl(cleanEmail, nextUrl));
  }

  req.flash("success", `Đã gửi lại mã OTP mới tới hòm thư ${cleanEmail}. Vui lòng kiểm tra email!`);
  res.redirect(buildVerifyRegistrationUrl(cleanEmail, nextUrl));
};

const renderLogin = (req, res) => {
  if (req.cookies?.itj_session_conflict) {
    res.clearCookie("itj_session_conflict", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    if (req.flash) {
      req.flash("error", "⚠️ Phiên làm việc đã kết thúc do tài khoản vừa đăng nhập trên một thiết bị/trình duyệt khác. Nếu không phải bạn, hãy đổi mật khẩu ngay!");
    }
  }

  res.render("pages/candidate-login", {
    title: "Đăng nhập (Ứng viên)",
    next: getSafeNext(req.query.next),
    errors: {},
    old: {},
  });
};

const postLogin = async (req, res) => {
  const nextUrl = getSafeNext(req.body.next);
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).render("pages/candidate-login", {
      title: "Đăng nhập (Ứng viên)",
      errors: { general: "Email hoặc mật khẩu không đúng" },
      old: req.body,
      next: nextUrl,
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
      next: nextUrl,
    });
  }

  if (candidate.status === CANDIDATE_STATUS.BANNED) {
    const reasonMsg = candidate.banReason ? ` Lí do: ${candidate.banReason}` : "";
    return res.status(403).render("pages/candidate-login", {
      title: "Đăng nhập (Ứng viên)",
      errors: { general: `Tài khoản của bạn đã bị khóa.${reasonMsg}` },
      old: req.body,
      next: nextUrl,
    });
  }

  // Chặn đăng nhập nếu chưa xác thực email
  if (candidate.isEmailVerified === false) {
    return res.status(403).render("pages/candidate-login", {
      title: "Đăng nhập (Ứng viên)",
      errors: { general: "Tài khoản của bạn chưa xác thực email. Vui lòng xác thực trước khi đăng nhập." },
      unverifiedEmail: cleanEmail,
      old: req.body,
      next: nextUrl,
    });
  }

  const isMatch = await comparePassword(password, candidate.password);
  if (!isMatch) {
    return res.status(400).render("pages/candidate-login", {
      title: "Đăng nhập (Ứng viên)",
      errors: { general: "Email hoặc mật khẩu không đúng" },
      old: req.body,
      next: nextUrl,
    });
  }

  // Tăng tokenVersion để hủy phiên trên các thiết bị cũ (Single Active Session)
  candidate.tokenVersion = (candidate.tokenVersion || 0) + 1;
  candidate.lastLoginAt = new Date();
  await candidate.save();

  const token = signUserToken(candidate, "candidate");
  res.cookie("itj_token", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Gửi email cảnh báo bảo mật tới ứng viên (chạy nền)
  sendSecurityAlertEmail({
    toEmail: candidate.email,
    fullName: candidate.fullName,
    userType: "candidate",
    ip: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
    userAgent: req.headers["user-agent"] || "Trình duyệt web",
    loginTime: candidate.lastLoginAt,
  }).catch((err) => console.error("Lỗi gửi email cảnh báo bảo mật ứng viên:", err.message));

  req.flash("success", "Đăng nhập thành công!");
  res.redirect(nextUrl || "/");
};

const postLogout = async (req, res) => {
  if (req.user && req.user._id && req.role === "candidate") {
    // Hủy hiệu lực JWT phía server ngay lập tức
    await Candidate.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } }).catch(() => {});
  }
  res.clearCookie("itj_token", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  req.flash("success", "Đăng xuất thành công!");
  res.redirect("/");
};

const renderChangePassword = (req, res) => {
  const isGoogleNoPassword = Boolean(req.user && req.user.authProvider === "google" && !req.user.currentMember);
  res.render("pages/change-password", {
    title: isGoogleNoPassword ? "Thiết lập mật khẩu (Ứng viên)" : "Đổi mật khẩu (Ứng viên)",
    userRole: "candidate",
    isGoogleNoPassword,
    errors: {},
    old: {},
  });
};

const postChangePassword = async (req, res) => {
  const candidate = await Candidate.findById(req.user._id).select("+password");
  if (!candidate) {
    return res.redirect("/candidate/login");
  }

  const isGoogleNoPassword = Boolean(candidate.authProvider === "google" && !req.user.currentMember);
  const pageTitle = isGoogleNoPassword ? "Thiết lập mật khẩu (Ứng viên)" : "Đổi mật khẩu (Ứng viên)";

  if (isGoogleNoPassword) {
    const result = setInitialPasswordSchema.safeParse(req.body);
    if (!result.success) {
      const errors = {};
      result.error.errors.forEach((err) => {
        errors[err.path[0]] = err.message;
      });
      return res.status(400).render("pages/change-password", {
        title: pageTitle,
        userRole: "candidate",
        isGoogleNoPassword: true,
        errors,
        old: req.body,
      });
    }

    candidate.password = await hashPassword(result.data.newPassword);
    candidate.authProvider = "local"; // Giữ nguyên googleId để tiếp tục đăng nhập được cả 2 cách
    candidate.tokenVersion = (candidate.tokenVersion || 0) + 1;
    await candidate.save();

    const newToken = signUserToken(candidate, "candidate");
    res.cookie("itj_token", newToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    req.flash("success", "Thiết lập mật khẩu thành công! Từ giờ bạn có thể đăng nhập bằng cả Email và Google.");
    return res.redirect("/candidate/profile");
  }

  const result = changePasswordSchema.safeParse(req.body);
  if (!result.success) {
    const errors = {};
    result.error.errors.forEach((err) => {
      errors[err.path[0]] = err.message;
    });
    return res.status(400).render("pages/change-password", {
      title: pageTitle,
      userRole: "candidate",
      isGoogleNoPassword: false,
      errors,
      old: req.body,
    });
  }

  const { currentPassword, newPassword } = result.data;

  const isMatch = await comparePassword(currentPassword, candidate.password);
  if (!isMatch) {
    return res.status(400).render("pages/change-password", {
      title: pageTitle,
      userRole: "candidate",
      isGoogleNoPassword: false,
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

  const nextUrl = isSafeRedirect(req.query.next) ? req.query.next : "/";
  const authUrl = googleAuthService.getGoogleAuthUrl("candidate", nextUrl, req, res);
  res.redirect(authUrl);
};

// Xử lý callback sau khi người dùng đồng ý đăng nhập Google
const handleGoogleCallback = async (req, res) => {
  const googleAuthService = require("../../services/googleAuth.service");
  const { code, state, error } = req.query;

  if (error || !code || typeof code !== "string") {
    googleAuthService.verifyOAuthState(null, "candidate", req, res, "/");
    req.flash("error", "Đăng nhập Google bị hủy hoặc gặp lỗi xác thực.");
    return res.redirect("/candidate/login");
  }

  // Xác thực state nonce cookie để chống OAuth Login CSRF
  const stateCheck = googleAuthService.verifyOAuthState(state, "candidate", req, res, "/");
  if (!stateCheck.valid) {
    req.flash("error", "Phiên xác thực Google không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.");
    return res.redirect("/candidate/login");
  }
  const nextUrl = stateCheck.next;

  try {
    const redirectUri = googleAuthService.getCallbackUrl("candidate", req);
    const tokens = await googleAuthService.exchangeCodeForTokens(code, redirectUri);
    const profile = await googleAuthService.fetchGoogleUserInfo(tokens.access_token);

    if (!profile || !profile.email || !profile.sub) {
      req.flash("error", "Không lấy được địa chỉ email từ tài khoản Google.");
      return res.redirect("/candidate/login");
    }

    // Bắt buộc email đã được Google xác minh để chống chiếm đoạt tài khoản qua OAuth
    if (profile.email_verified !== true) {
      req.flash("error", "Tài khoản Google của bạn chưa xác minh email nên không thể đăng nhập.");
      return res.redirect("/candidate/login");
    }

    const cleanEmail = profile.email.toLowerCase().trim();

    // Tìm ứng viên theo googleId trước, sau đó theo email (BAO GỒM cả bản ghi xóa mềm để chặn E11000)
    let candidate = await Candidate.findOne({ googleId: profile.sub });
    if (!candidate) {
      candidate = await Candidate.findOne({ email: cleanEmail });
    }

    if (candidate && candidate.deletedAt) {
      req.flash(
        "error",
        "Tài khoản gắn với email này đã bị xóa hoặc vô hiệu hóa. Vui lòng liên hệ quản trị viên để được hỗ trợ."
      );
      return res.redirect("/candidate/login");
    }

    if (candidate) {
      // Không cho phép ghi đè googleId nếu tài khoản này đã gắn với một tài khoản Google khác
      if (candidate.googleId && candidate.googleId !== profile.sub) {
        req.flash("error", "Email này đã được liên kết với một tài khoản Google khác.");
        return res.redirect("/candidate/login");
      }

      if (candidate.status === CANDIDATE_STATUS.BANNED) {
        const reasonMsg = candidate.banReason ? ` Lí do: ${candidate.banReason}` : "";
        req.flash("error", `Tài khoản của bạn đã bị khóa.${reasonMsg}`);
        return res.redirect("/candidate/login");
      }

      if (!candidate.googleId) {
        candidate.googleId = profile.sub;
      }
      candidate.isEmailVerified = true;
      if (!candidate.avatar || !candidate.avatar.url) {
        candidate.avatar = { url: profile.picture || "", key: "" };
      }
      candidate.tokenVersion = (candidate.tokenVersion || 0) + 1;
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

    sendSecurityAlertEmail({
      toEmail: candidate.email,
      fullName: candidate.fullName,
      userType: "candidate",
      ip: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
      userAgent: req.headers["user-agent"] || "Trình duyệt web",
      loginTime: candidate.lastLoginAt,
    }).catch((err) => console.error("Lỗi gửi email cảnh báo bảo mật Google candidate:", err.message));

    req.flash("success", "Đăng nhập tài khoản Google thành công!");
    res.redirect(nextUrl);
  } catch (err) {
    console.error("Lỗi Google Auth Candidate Callback:", err);
    const errMsg = env.NODE_ENV === "production" ? "Đăng nhập Google thất bại. Vui lòng thử lại." : "Đăng nhập Google thất bại: " + err.message;
    req.flash("error", errMsg);
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
