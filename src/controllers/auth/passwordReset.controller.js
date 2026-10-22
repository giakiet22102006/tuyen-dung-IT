// src/controllers/auth/passwordReset.controller.js
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Candidate, Employer, Otp } = require("../../models");
const { hashPassword } = require("../../services/auth.service");
const { sendOtpEmail } = require("../../services/mail.service");

// Helper lấy tên hiển thị role
const getRoleLabel = (userType) => (userType === "employer" ? "Nhà tuyển dụng" : "Ứng viên");

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

  if (!email || !email.includes("@")) {
    return res.status(400).render("pages/forgot-password", {
      title: `Quên mật khẩu (${getRoleLabel(userType)})`,
      userRole: userType,
      errors: { email: "Vui lòng nhập địa chỉ email hợp lệ" },
      old: req.body,
    });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Kiểm tra tài khoản có tồn tại không
  const Model = userType === "employer" ? Employer : Candidate;
  const user = await Model.findOne({ email: cleanEmail, deletedAt: null });

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

  // Xóa các OTP cũ của email này
  await Otp.deleteMany({ email: cleanEmail, userType });

  // Lưu OTP mới với hạn sử dụng 10 phút
  await Otp.create({
    email: cleanEmail,
    otpHash,
    userType,
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
  const email = req.query.email || "";
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
  const cleanEmail = (email || "").toLowerCase().trim();
  const cleanOtp = (otp || "").trim();

  if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).render("pages/verify-otp", {
      title: `Xác thực mã OTP (${getRoleLabel(userType)})`,
      userRole: userType,
      email: cleanEmail,
      errors: { otp: "Mã OTP phải gồm chính xác 6 chữ số." },
    });
  }

  const otpRecord = await Otp.findOne({
    email: cleanEmail,
    userType,
    expiresAt: { $gt: new Date() },
  });

  if (!otpRecord) {
    return res.status(400).render("pages/verify-otp", {
      title: `Xác thực mã OTP (${getRoleLabel(userType)})`,
      userRole: userType,
      email: cleanEmail,
      errors: { otp: "Mã OTP đã hết hạn hoặc không tồn tại. Vui lòng yêu cầu mã mới." },
    });
  }

  // Kiểm tra số lần thử sai
  if (otpRecord.attempts >= 5) {
    await Otp.deleteOne({ _id: otpRecord._id });
    return res.status(400).render("pages/verify-otp", {
      title: `Xác thực mã OTP (${getRoleLabel(userType)})`,
      userRole: userType,
      email: cleanEmail,
      errors: { otp: "Bạn đã nhập sai mã quá 5 lần. Vui lòng yêu cầu gửi mã mới." },
    });
  }

  const isMatch = await bcrypt.compare(cleanOtp, otpRecord.otpHash);
  if (!isMatch) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    const remaining = 5 - otpRecord.attempts;
    return res.status(400).render("pages/verify-otp", {
      title: `Xác thực mã OTP (${getRoleLabel(userType)})`,
      userRole: userType,
      email: cleanEmail,
      errors: { otp: `Mã OTP không chính xác. Bạn còn ${remaining} lần thử.` },
    });
  }

  // Khớp OTP thành công -> Tạo resetToken tạm thời
  const resetToken = crypto.randomBytes(32).toString("hex");
  otpRecord.isVerified = true;
  otpRecord.resetToken = resetToken;
  await otpRecord.save();

  res.redirect(`/${userType}/reset-password?email=${encodeURIComponent(cleanEmail)}&token=${resetToken}`);
};

// 5. Giao diện Đặt lại mật khẩu mới
const renderResetPassword = (userType) => async (req, res) => {
  const { email, token } = req.query;

  if (!email || !token) {
    req.flash("error", "Đường dẫn không hợp lệ hoặc đã hết hạn.");
    return res.redirect(`/${userType}/forgot-password`);
  }

  const cleanEmail = email.toLowerCase().trim();
  const otpRecord = await Otp.findOne({
    email: cleanEmail,
    userType,
    resetToken: token,
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
  const cleanEmail = (email || "").toLowerCase().trim();

  const renderWithError = (errMsg) => {
    return res.status(400).render("pages/reset-password", {
      title: `Đặt lại mật khẩu mới (${getRoleLabel(userType)})`,
      userRole: userType,
      email: cleanEmail,
      token,
      errors: { newPassword: errMsg },
    });
  };

  if (!newPassword || newPassword.length < 8) {
    return renderWithError("Mật khẩu mới phải có ít nhất 8 ký tự.");
  }

  if (!/(?=.*[a-zA-Z])(?=.*[0-9])/.test(newPassword)) {
    return renderWithError("Mật khẩu phải chứa ít nhất một chữ cái và một chữ số.");
  }

  if (newPassword !== confirmPassword) {
    return renderWithError("Mật khẩu xác nhận không khớp.");
  }

  const otpRecord = await Otp.findOne({
    email: cleanEmail,
    userType,
    resetToken: token,
    isVerified: true,
    expiresAt: { $gt: new Date() },
  });

  if (!otpRecord) {
    req.flash("error", "Yêu cầu đặt lại mật khẩu đã hết hạn. Vui lòng thử lại.");
    return res.redirect(`/${userType}/forgot-password`);
  }

  // Cập nhật mật khẩu tài khoản
  const Model = userType === "employer" ? Employer : Candidate;
  const user = await Model.findOne({ email: cleanEmail });

  if (!user) {
    req.flash("error", "Không tìm thấy thông tin tài khoản.");
    return res.redirect(`/${userType}/login`);
  }

  user.password = await hashPassword(newPassword);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // Hủy mọi session cũ
  await user.save();

  // Xóa bản ghi OTP sau khi đã sử dụng thành công
  await Otp.deleteMany({ email: cleanEmail, userType });

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
