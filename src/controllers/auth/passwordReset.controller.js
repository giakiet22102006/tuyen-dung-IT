// src/controllers/auth/passwordReset.controller.js
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Candidate, Employer, Otp } = require("../../models");
const { hashPassword } = require("../../services/auth.service");
const { sendOtpEmail } = require("../../services/mail.service");

// Helper lấy tên hiển thị role
const getRoleLabel = (userType) => (userType === "employer" ? "Nhà tuyển dụng" : "Ứng viên");

const HEX_TOKEN_REGEX = /^[a-f0-9]{64}$/i;
const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// 1. Giao diện Nhập Email quên mật khẩu
const renderForgotPassword = (userType) => (req, res) => {
  res.render("pages/forgot-password", {
    title: `Quên mật khẩu (${getRoleLabel(userType)})`,
    userRole: userType,
    errors: {},
    old: {},
  });
};

// 2. Xử lý gửi OTP qua Email
const postForgotPassword = (userType) => async (req, res) => {
  const { email } = req.body;

  if (typeof email !== "string" || !email.includes("@")) {
    return res.status(400).render("pages/forgot-password", {
      title: `Quên mật khẩu (${getRoleLabel(userType)})`,
      userRole: userType,
      errors: { email: "Vui lòng nhập địa chỉ email hợp lệ" },
      old: req.body,
    });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Kiểm tra tài khoản có tồn tại không (với Employer, tìm cả teamMembers phụ)
  const Model = userType === "employer" ? Employer : Candidate;
  let user = await Model.findOne({ email: cleanEmail, deletedAt: null });
  if (!user && userType === "employer") {
    user = await Employer.findOne({ "teamMembers.email": cleanEmail, deletedAt: null }).select(
      "+teamMembers.password"
    );
  }

  if (!user) {
    return res.status(400).render("pages/forgot-password", {
      title: `Quên mật khẩu (${getRoleLabel(userType)})`,
      userRole: userType,
      errors: { email: "Không tìm thấy tài khoản với email này trên hệ thống." },
      old: req.body,
    });
  }

  if (user.status === "banned") {
    return res.status(403).render("pages/forgot-password", {
      title: `Quên mật khẩu (${getRoleLabel(userType)})`,
      userRole: userType,
      errors: { email: "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ ban quản trị." },
      old: req.body,
    });
  }

  // Sinh mã OTP 6 số ngẫu nhiên
  const otpCode = crypto.randomInt(100000, 999999).toString();
  const salt = await bcrypt.genSalt(10);
  const otpHash = await bcrypt.hash(otpCode, salt);

  // Xóa các OTP quên mật khẩu cũ của email này (không đụng OTP mục đích khác)
  await Otp.deleteMany({ email: cleanEmail, userType, type: "forgot_password" });

  // Lưu OTP mới với hạn sử dụng 10 phút
  await Otp.create({
    email: cleanEmail,
    otpHash,
    userType,
    type: "forgot_password",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 phút
  });

  // Gửi email qua Nodemailer / Gmail SMTP
  try {
    await sendOtpEmail(cleanEmail, otpCode, userType);
  } catch (err) {
    return res.status(500).render("pages/forgot-password", {
      title: `Quên mật khẩu (${getRoleLabel(userType)})`,
      userRole: userType,
      errors: { email: "Không thể gửi email OTP lúc này. Vui lòng thử lại sau." },
      old: req.body,
    });
  }

  req.flash("success", `Mã xác thực OTP gồm 6 chữ số đã được gửi tới email ${cleanEmail}. Vui lòng kiểm tra hộp thư!`);
  res.redirect(`/${userType}/verify-otp?email=${encodeURIComponent(cleanEmail)}`);
};

// 3. Giao diện Nhập mã OTP
const renderVerifyOtp = (userType) => (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
  if (!email) {
    return res.redirect(`/${userType}/forgot-password`);
  }

  res.render("pages/verify-otp", {
    title: `Xác thực mã OTP (${getRoleLabel(userType)})`,
    userRole: userType,
    email,
    errors: {},
  });
};

// 4. Xử lý Xác thực mã OTP
const postVerifyOtp = (userType) => async (req, res) => {
  const { email, otp } = req.body;
  const cleanEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
  const cleanOtp = typeof otp === "string" ? otp.trim() : "";

  if (!cleanEmail || !cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).render("pages/verify-otp", {
      title: `Xác thực mã OTP (${getRoleLabel(userType)})`,
      userRole: userType,
      email: cleanEmail,
      errors: { otp: "Mã OTP phải gồm chính xác 6 chữ số." },
    });
  }

  // Tăng attempts nguyên tử TRƯỚC khi chạy bcrypt.compare để chống Race Condition brute-force
  const otpRecord = await Otp.findOneAndUpdate(
    {
      email: cleanEmail,
      userType,
      type: "forgot_password",
      isVerified: { $ne: true },
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 5 },
    },
    { $inc: { attempts: 1 } },
    { new: true }
  );

  if (!otpRecord) {
    await Otp.deleteMany({
      email: cleanEmail,
      userType,
      type: "forgot_password",
      attempts: { $gte: 5 },
    });
    return res.status(400).render("pages/verify-otp", {
      title: `Xác thực mã OTP (${getRoleLabel(userType)})`,
      userRole: userType,
      email: cleanEmail,
      errors: { otp: "Mã OTP đã hết hạn, không tồn tại hoặc đã vượt quá 5 lần thử. Vui lòng yêu cầu mã mới." },
    });
  }

  const isMatch = await bcrypt.compare(cleanOtp, otpRecord.otpHash);
  if (!isMatch) {
    if (otpRecord.attempts >= 5) {
      await Otp.deleteOne({ _id: otpRecord._id });
      return res.status(400).render("pages/verify-otp", {
        title: `Xác thực mã OTP (${getRoleLabel(userType)})`,
        userRole: userType,
        email: cleanEmail,
        errors: { otp: "Bạn đã nhập sai mã quá 5 lần. Vui lòng yêu cầu gửi mã mới." },
      });
    }
    const remaining = Math.max(0, 5 - otpRecord.attempts);
    return res.status(400).render("pages/verify-otp", {
      title: `Xác thực mã OTP (${getRoleLabel(userType)})`,
      userRole: userType,
      email: cleanEmail,
      errors: { otp: `Mã OTP không chính xác. Bạn còn ${remaining} lần thử.` },
    });
  }

  // Khớp OTP thành công -> Tạo resetToken ngẫu nhiên 256-bit và lưu dạng SHA-256 hash vào DB
  const resetToken = crypto.randomBytes(32).toString("hex");
  otpRecord.isVerified = true;
  otpRecord.resetToken = hashResetToken(resetToken);
  await otpRecord.save();

  res.redirect(`/${userType}/reset-password?email=${encodeURIComponent(cleanEmail)}&token=${resetToken}`);
};

// 5. Giao diện Đặt lại mật khẩu mới
const renderResetPassword = (userType) => async (req, res) => {
  const { email, token } = req.query;

  // Chặn rò rỉ resetToken qua Referer header hoặc cache trình duyệt
  res.set("Referrer-Policy", "no-referrer");
  res.set("Cache-Control", "no-store");

  if (typeof email !== "string" || typeof token !== "string" || !HEX_TOKEN_REGEX.test(token)) {
    req.flash("error", "Đường dẫn không hợp lệ hoặc đã hết hạn.");
    return res.redirect(`/${userType}/forgot-password`);
  }

  const cleanEmail = email.toLowerCase().trim();
  const tokenHash = hashResetToken(token);
  const otpRecord = await Otp.findOne({
    email: cleanEmail,
    userType,
    type: "forgot_password",
    resetToken: tokenHash,
    isVerified: true,
    expiresAt: { $gt: new Date() },
  });

  if (!otpRecord) {
    req.flash("error", "Phiên xác thực đã hết hạn. Vui lòng thực hiện lại từ đầu.");
    return res.redirect(`/${userType}/forgot-password`);
  }

  res.render("pages/reset-password", {
    title: `Đặt lại mật khẩu mới (${getRoleLabel(userType)})`,
    userRole: userType,
    email: cleanEmail,
    token,
    errors: {},
  });
};

// 6. Xử lý Đặt lại mật khẩu mới
const postResetPassword = (userType) => async (req, res) => {
  const { email, token, newPassword, confirmPassword } = req.body;
  const cleanEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
  const safeToken = typeof token === "string" && HEX_TOKEN_REGEX.test(token) ? token : "";

  if (!cleanEmail || !safeToken) {
    req.flash("error", "Yêu cầu đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.");
    return res.redirect(`/${userType}/forgot-password`);
  }

  const renderWithError = (errMsg) => {
    return res.status(400).render("pages/reset-password", {
      title: `Đặt lại mật khẩu mới (${getRoleLabel(userType)})`,
      userRole: userType,
      email: cleanEmail,
      token: safeToken,
      errors: { newPassword: errMsg },
    });
  };

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return renderWithError("Mật khẩu mới phải có ít nhất 8 ký tự.");
  }

  if (!/(?=.*[a-zA-Z])(?=.*[0-9])/.test(newPassword)) {
    return renderWithError("Mật khẩu phải chứa ít nhất một chữ cái và một chữ số.");
  }

  if (newPassword !== confirmPassword) {
    return renderWithError("Mật khẩu xác nhận không khớp.");
  }

  // Tiêu thụ nguyên tử (one-time use) resetToken để chặn replay hoặc double-submit đồng thời
  const tokenHash = hashResetToken(safeToken);
  const otpRecord = await Otp.findOneAndDelete({
    email: cleanEmail,
    userType,
    type: "forgot_password",
    resetToken: tokenHash,
    isVerified: true,
    expiresAt: { $gt: new Date() },
  });

  if (!otpRecord) {
    req.flash("error", "Yêu cầu đặt lại mật khẩu đã hết hạn. Vui lòng thử lại.");
    return res.redirect(`/${userType}/forgot-password`);
  }

  // Cập nhật mật khẩu tài khoản (từ chối tài khoản đã xóa mềm hoặc bị khóa; hỗ trợ cả HR teamMember)
  let user = null;
  let isTeamMember = false;

  if (userType === "employer") {
    user = await Employer.findOne({ email: cleanEmail, deletedAt: null }).select("+teamMembers.password");
    if (!user) {
      user = await Employer.findOne({ "teamMembers.email": cleanEmail, deletedAt: null }).select(
        "+teamMembers.password"
      );
      isTeamMember = Boolean(user);
    }
  } else {
    user = await Candidate.findOne({ email: cleanEmail, deletedAt: null });
  }

  if (!user || user.status === "banned") {
    await Otp.deleteMany({ email: cleanEmail, userType, type: "forgot_password" });
    req.flash("error", "Tài khoản không tồn tại hoặc đã bị khóa.");
    return res.redirect(`/${userType}/login`);
  }

  if (isTeamMember) {
    const member = (user.teamMembers || []).find(
      (m) => m.email && m.email.toLowerCase().trim() === cleanEmail
    );
    if (!member) {
      await Otp.deleteMany({ email: cleanEmail, userType, type: "forgot_password" });
      req.flash("error", "Không tìm thấy tài khoản thành viên tương ứng.");
      return res.redirect(`/${userType}/login`);
    }
    member.password = await hashPassword(newPassword);
    member.tokenVersion = (member.tokenVersion || 0) + 1;
    await user.save();
  } else {
    user.password = await hashPassword(newPassword);
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Hủy mọi session cũ
    user.isEmailVerified = true; // Đã chứng minh quyền sở hữu hòm thư qua mã OTP
    await user.save();
  }

  // Xóa sạch mọi OTP forgot_password còn sót lại của email này
  await Otp.deleteMany({ email: cleanEmail, userType, type: "forgot_password" });

  req.flash("success", "Đặt lại mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới.");
  res.redirect(`/${userType}/login`);
};

module.exports = {
  renderForgotPassword,
  postForgotPassword,
  renderVerifyOtp,
  postVerifyOtp,
  renderResetPassword,
  postResetPassword,
};
