// src/services/mail.service.js
const nodemailer = require("nodemailer");
const env = require("../config/env");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (env.SMTP_USER && env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

/**
 * Gửi email chứa mã OTP đặt lại mật khẩu
 * @param {string} toEmail 
 * @param {string} otpCode 
 * @param {string} userType 'candidate' | 'employer'
 */
async function sendOtpEmail(toEmail, otpCode, userType = "candidate") {
  const mailTransporter = getTransporter();
  const roleName = userType === "employer" ? "Nhà tuyển dụng" : "Ứng viên";

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #E0E0E0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #000071; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: bold; letter-spacing: 1px;">VN.ITJobs</h1>
        <p style="color: #A6A6A6; margin: 6px 0 0; font-size: 14px;">Cổng thông tin việc làm IT hàng đầu Việt Nam</p>
      </div>
      <div style="padding: 30px; background-color: #ffffff;">
        <h2 style="color: #121212; font-size: 18px; margin-top: 0;">Yêu cầu đặt lại mật khẩu (${roleName})</h2>
        <p style="color: #555555; font-size: 14px; line-height: 1.6;">
          Chào bạn, chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản liên kết với địa chỉ email: <strong>${toEmail}</strong>.
        </p>
        <p style="color: #555555; font-size: 14px; line-height: 1.6;">
          Dưới đây là mã xác thực OTP của bạn:
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <span style="display: inline-block; background-color: #F0F7FF; border: 2px dashed #0088FF; color: #000071; font-size: 32px; font-weight: bold; letter-spacing: 6px; padding: 14px 28px; border-radius: 8px;">
            ${otpCode}
          </span>
        </div>
        <p style="color: #777777; font-size: 13px; line-height: 1.5;">
          ⏱️ Mã OTP này có hiệu lực trong vòng <strong>10 phút</strong>. Vì lý do an toàn, vui lòng <strong>không chia sẻ</strong> mã này cho bất kỳ ai.
        </p>
        <p style="color: #999999; font-size: 12px; margin-top: 24px; border-top: 1px solid #EEEEEE; padding-top: 16px;">
          Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email này. Tài khoản của bạn vẫn an toàn.
        </p>
      </div>
      <div style="background-color: #F7F7F7; padding: 16px; text-align: center; color: #888888; font-size: 12px;">
        © 2026 VN.ITJobs. Mọi quyền được bảo lưu.
      </div>
    </div>
  `;

  if (mailTransporter) {
    try {
      const info = await mailTransporter.sendMail({
        from: env.SMTP_FROM,
        to: toEmail,
        subject: `[VN.ITJobs] Mã xác thực đặt lại mật khẩu: ${otpCode}`,
        text: `Mã xác thực OTP của bạn là: ${otpCode}. Mã này có hiệu lực trong 10 phút.`,
        html: htmlContent,
      });
      console.log(`📧 Đã gửi email OTP tới ${toEmail}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`❌ Lỗi gửi email qua SMTP: ${err.message}`);
      // Nếu gửi mail thất bại, ném lỗi để controller xử lý
      throw new Error("Không thể gửi email xác thực. Vui lòng thử lại sau.");
    }
  } else {
    // Chế độ mô phỏng khi chưa điền thông tin SMTP (Development / Test)
    console.log("=================================================");
    console.log(`📧 [MÔ PHỎNG EMAIL] Đã gửi OTP tới: ${toEmail}`);
    console.log(`🔑 MÃ OTP: ${otpCode} (Hết hạn sau 10 phút)`);
    console.log("=================================================");
    return { success: true, simulated: true };
  }
}

/**
 * Gửi email chứa mã OTP xác thực kích hoạt tài khoản khi Đăng ký
 * @param {string} toEmail 
 * @param {string} otpCode 
 * @param {string} userType 'candidate' | 'employer'
 */
async function sendRegistrationOtpEmail(toEmail, otpCode, userType = "candidate") {
  const mailTransporter = getTransporter();
  const roleName = userType === "employer" ? "Nhà tuyển dụng" : "Ứng viên";

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #E0E0E0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #000071; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: bold; letter-spacing: 1px;">VN.ITJobs</h1>
        <p style="color: #A6A6A6; margin: 6px 0 0; font-size: 14px;">Cổng thông tin việc làm IT hàng đầu Việt Nam</p>
      </div>
      <div style="padding: 30px; background-color: #ffffff;">
        <h2 style="color: #121212; font-size: 18px; margin-top: 0;">Xác thực kích hoạt tài khoản (${roleName})</h2>
        <p style="color: #555555; font-size: 14px; line-height: 1.6;">
          Chào mừng bạn đến với <strong>VN.ITJobs</strong>! Cảm ơn bạn đã đăng ký tài khoản với email: <strong>${toEmail}</strong>.
        </p>
        <p style="color: #555555; font-size: 14px; line-height: 1.6;">
          Để xác thực bạn là chủ sở hữu hợp pháp của hòm thư này và kích hoạt tài khoản, vui lòng sử dụng mã xác thực OTP sau:
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <span style="display: inline-block; background-color: #EBF8FF; border: 2px dashed #0088FF; color: #000071; font-size: 32px; font-weight: bold; letter-spacing: 6px; padding: 14px 28px; border-radius: 8px;">
            ${otpCode}
          </span>
        </div>
        <p style="color: #777777; font-size: 13px; line-height: 1.5;">
          ⏱️ Mã OTP này có hiệu lực trong vòng <strong>10 phút</strong>. Nếu bạn không tạo tài khoản này, vui lòng bỏ qua email này.
        </p>
      </div>
      <div style="background-color: #F7F7F7; padding: 16px; text-align: center; color: #888888; font-size: 12px;">
        © 2026 VN.ITJobs. Mọi quyền được bảo lưu.
      </div>
    </div>
  `;

  if (mailTransporter) {
    try {
      const info = await mailTransporter.sendMail({
        from: env.SMTP_FROM,
        to: toEmail,
        subject: `[VN.ITJobs] Mã xác thực đăng ký tài khoản: ${otpCode}`,
        text: `Mã xác thực đăng ký tài khoản của bạn là: ${otpCode}. Mã này có hiệu lực trong 10 phút.`,
        html: htmlContent,
      });
      console.log(`📧 Đã gửi email kích hoạt tới ${toEmail}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`❌ Lỗi gửi email kích hoạt qua SMTP: ${err.message}`);
      throw new Error("Không thể gửi email xác thực lúc này. Vui lòng thử lại sau.");
    }
  } else {
    console.log("=================================================");
    console.log(`📧 [MÔ PHỎNG EMAIL ĐĂNG KÝ] Đã gửi OTP tới: ${toEmail}`);
    console.log(`🔑 MÃ KÍCH HOẠT: ${otpCode} (Hết hạn sau 10 phút)`);
    console.log("=================================================");
    return { success: true, simulated: true };
  }
}

module.exports = {
  sendOtpEmail,
  sendRegistrationOtpEmail,
};
