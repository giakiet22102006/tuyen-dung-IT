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

/**
 * Gửi email thư mời phỏng vấn trực tiếp từ Nhà tuyển dụng tới Ứng viên
 */
async function sendInterviewInvitationEmail({
  toEmail,
  candidateName,
  companyName,
  jobTitle,
  subject,
  content,
  interviewDate,
  location,
  replyTo,
  contactPhone,
  icsContent,
}) {
  const mailTransporter = getTransporter();
  const safeSubject = subject || `[VN.ITJobs] Thư mời phỏng vấn vị trí ${jobTitle} - ${companyName}`;

  // Format content newlines to HTML <p> / <br>
  const formattedContent = String(content || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim() ? `<p style="margin: 0 0 10px 0; line-height: 1.6; color: #333333;">${line}</p>` : `<br/>`)
    .join("");

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E0E0E0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
      <div style="background-color: #000071; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 1px;">VN.ITJobs</h1>
        <p style="color: #A6A6A6; margin: 6px 0 0; font-size: 13px;">Cổng thông tin việc làm IT hàng đầu Việt Nam</p>
      </div>

      <div style="padding: 28px 24px;">
        <div style="display: inline-block; background-color: #E8F5E9; color: #2E7D32; font-size: 12px; font-weight: bold; padding: 4px 10px; border-radius: 4px; margin-bottom: 12px;">
          🎉 HỒ SƠ ĐÃ ĐƯỢC DUYỆT PHÙ HỢP
        </div>
        <h2 style="color: #121212; font-size: 19px; margin: 0 0 16px 0;">Thư Mời Phỏng Vấn: ${jobTitle}</h2>
        <p style="color: #555555; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">
          Kính gửi bạn <strong>${candidateName}</strong>,<br/>
          Công ty <strong>${companyName}</strong> đã xem xét hồ sơ ứng tuyển của bạn trên VN.ITJobs và trân trọng gửi lời mời tham dự buổi phỏng vấn.
        </p>

        <!-- Chi tiết lịch hẹn -->
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
          <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #1E293B; text-transform: uppercase; letter-spacing: 0.5px;">THÔNG TIN PHỎNG VẤN</h3>
          ${interviewDate ? `<div style="margin-bottom: 8px; font-size: 14px; color: #334155;"><strong>⏱️ Thời gian:</strong> ${interviewDate}</div>` : ""}
          ${location ? `<div style="margin-bottom: 8px; font-size: 14px; color: #334155;"><strong>📍 Hình thức / Địa điểm:</strong> ${location}</div>` : ""}
          ${replyTo ? `<div style="margin-bottom: 8px; font-size: 14px; color: #334155;"><strong>📧 Email Nhà tuyển dụng:</strong> <a href="mailto:${replyTo}" style="color: #0088FF; text-decoration: none;">${replyTo}</a></div>` : ""}
          ${contactPhone ? `<div style="margin-bottom: 4px; font-size: 14px; color: #334155;"><strong>📞 Số điện thoại liên hệ:</strong> ${contactPhone}</div>` : ""}
        </div>

        <!-- Lời nhắn từ NTD -->
        <div style="background-color: #ffffff; border-left: 4px solid #0088FF; padding: 12px 16px; margin-bottom: 24px;">
          <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #0088FF; text-transform: uppercase;">Lời nhắn từ Nhà tuyển dụng:</h4>
          ${formattedContent}
        </div>

        <div style="text-align: center; margin: 28px 0 10px;">
          <a href="mailto:${replyTo || ""}?subject=Re: [Phản hồi phỏng vấn] ${jobTitle} - ${candidateName}" style="display: inline-block; background-color: #0088FF; color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px;">
            ✉️ Trả Lời Email Nhà Tuyển Dụng
          </a>
        </div>
        <p style="text-align: center; font-size: 12px; color: #888888; margin-top: 8px;">
          Bạn có thể bấm trả lời trực tiếp email này hoặc gọi hotline của nhà tuyển dụng.
        </p>
      </div>

      <div style="background-color: #F7F7F7; padding: 16px; text-align: center; color: #888888; font-size: 12px;">
        Thư mời được gửi từ <strong>${companyName}</strong> thông qua cổng tuyển dụng <strong>VN.ITJobs</strong>.<br/>
        © 2026 VN.ITJobs. Mọi quyền được bảo lưu.
      </div>
    </div>
  `;

  if (mailTransporter) {
    try {
      const mailOptions = {
        from: env.SMTP_FROM,
        to: toEmail,
        replyTo: replyTo || undefined,
        subject: safeSubject,
        text: `Chào ${candidateName}, Công ty ${companyName} mời bạn tham gia phỏng vấn vị trí ${jobTitle}. Thời gian: ${interviewDate || "Thỏa thuận"}. Địa điểm: ${location || "Trao đổi qua email"}. Chi tiết: ${content}`,
        html: htmlContent,
      };

      if (icsContent) {
        mailOptions.attachments = [
          {
            filename: "interview-invitation.ics",
            content: icsContent,
            contentType: "text/calendar; charset=utf-8; method=REQUEST",
          },
        ];
        mailOptions.icalEvent = {
          filename: "interview-invitation.ics",
          method: "REQUEST",
          content: icsContent,
        };
      }

      const info = await mailTransporter.sendMail(mailOptions);
      console.log(`📧 Đã gửi thư mời phỏng vấn tới ${toEmail}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`❌ Lỗi gửi email thư mời phỏng vấn: ${err.message}`);
      throw new Error("Không thể gửi email thư mời phỏng vấn lúc này: " + err.message);
    }
  } else {
    console.log("=================================================");
    console.log(`📧 [MÔ PHỎNG EMAIL THƯ MỜI PHỎNG VẤN] Tới: ${toEmail}`);
    console.log(`🏢 Công ty: ${companyName} | Vị trí: ${jobTitle}`);
    console.log(`📅 Thời gian: ${interviewDate} | 📍 Địa điểm: ${location}`);
    console.log(`✉️ Tiêu đề: ${safeSubject}`);
    console.log("=================================================");
    return { success: true, simulated: true };
  }
}

/**
 * Gửi email thông báo kết quả và lý do từ chối hồ sơ tới Ứng viên
 */
async function sendRejectionEmail({
  toEmail,
  candidateName,
  companyName,
  jobTitle,
  reason,
  note,
  replyTo,
}) {
  const mailTransporter = getTransporter();
  const safeSubject = `[VN.ITJobs] Thông báo kết quả ứng tuyển vị trí ${jobTitle} - ${companyName}`;
  const defaultReason = reason || "Chưa phù hợp với yêu cầu của vị trí tại thời điểm này";

  const formattedNote = note
    ? String(note)
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.trim() ? `<p style="margin: 0 0 10px 0; line-height: 1.6; color: #475569;">${line}</p>` : `<br/>`)
        .join("")
    : "";

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E0E0E0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
      <div style="background-color: #000071; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 1px;">VN.ITJobs</h1>
        <p style="color: #A6A6A6; margin: 6px 0 0; font-size: 13px;">Cổng thông tin việc làm IT hàng đầu Việt Nam</p>
      </div>

      <div style="padding: 28px 24px;">
        <div style="display: inline-block; background-color: #FEE2E2; color: #991B1B; font-size: 12px; font-weight: bold; padding: 4px 10px; border-radius: 4px; margin-bottom: 12px;">
          📋 THÔNG BÁO KẾT QUẢ ỨNG TUYỂN
        </div>
        <h2 style="color: #121212; font-size: 19px; margin: 0 0 16px 0;">Kết Quả Ứng Tuyển: ${jobTitle}</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
          Kính gửi bạn <strong>${candidateName}</strong>,<br/>
          Lời đầu tiên, Ban Tuyển dụng công ty <strong>${companyName}</strong> chân thành cảm ơn bạn đã quan tâm và dành thời gian gửi hồ sơ ứng tuyển cho vị trí <strong>${jobTitle}</strong>.
        </p>

        <!-- Lý do từ chối -->
        <div style="background-color: #FFF5F5; border-left: 4px solid #EF4444; border-radius: 4px; padding: 14px 16px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #991B1B; text-transform: uppercase; letter-spacing: 0.5px;">Phản hồi từ Nhà tuyển dụng:</h4>
          <div style="font-size: 14px; color: #7F1D1D; font-weight: 600; margin-bottom: ${note ? '8px' : '0'};">
            • Lý do: ${defaultReason}
          </div>
          ${formattedNote ? `<div style="font-size: 13px; color: #475569; font-style: italic; border-top: 1px dashed #FECACA; padding-top: 8px; margin-top: 8px;">${formattedNote}</div>` : ""}
        </div>

        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
          Mặc dù rất tiếc vì chưa thể đồng hành cùng bạn ở vị trí này tại thời điểm hiện tại, chúng tôi xin phép được lưu lại hồ sơ của bạn trong hệ thống cơ sở dữ liệu nhân tài. Khi có cơ hội và dự án mới phù hợp hơn với định hướng của bạn, chúng tôi sẽ chủ động liên hệ lại.
        </p>

        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
          Chúc bạn luôn dồi dào sức khỏe, may mắn và sớm tìm được cơ hội nghề nghiệp ưng ý trên con đường sự nghiệp!
        </p>

        <div style="text-align: center; margin: 24px 0 10px;">
          <a href="https://tuyen-dung-it.vercel.app/search" style="display: inline-block; background-color: #0088FF; color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px;">
            🔍 Khám Phá Các Cơ Hội IT Khác
          </a>
        </div>
      </div>

      <div style="background-color: #F7F7F7; padding: 16px; text-align: center; color: #888888; font-size: 12px;">
        Thông báo được gửi từ <strong>${companyName}</strong> thông qua cổng tuyển dụng <strong>VN.ITJobs</strong>.<br/>
        © 2026 VN.ITJobs. Mọi quyền được bảo lưu.
      </div>
    </div>
  `;

  if (mailTransporter) {
    try {
      const info = await mailTransporter.sendMail({
        from: env.SMTP_FROM,
        to: toEmail,
        replyTo: replyTo || undefined,
        subject: safeSubject,
        text: `Chào ${candidateName}, Công ty ${companyName} cảm ơn bạn đã ứng tuyển vị trí ${jobTitle}. Sau khi xem xét, rất tiếc hồ sơ của bạn chưa phù hợp ở thời điểm này: ${defaultReason}. Lời nhắn: ${note || ""}`,
        html: htmlContent,
      });
      console.log(`📧 Đã gửi email từ chối tới ${toEmail}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`❌ Lỗi gửi email thông báo từ chối: ${err.message}`);
      return { success: false, error: err.message };
    }
  } else {
    console.log("=================================================");
    console.log(`📧 [MÔ PHỎNG EMAIL THÔNG BÁO TỪ CHỐI CV] Tới: ${toEmail}`);
    console.log(`🏢 Công ty: ${companyName} | Vị trí: ${jobTitle}`);
    console.log(`❌ Lý do: ${defaultReason}`);
    console.log(`📝 Lời nhắn: ${note || "Không có"}`);
    console.log(`✉️ Tiêu đề: ${safeSubject}`);
    console.log("=================================================");
    return { success: true, simulated: true };
  }
}

/**
 * Gửi email thông báo việc làm mới phù hợp (Job Alert)
 */
async function sendJobAlertEmail({ toEmail, alert, job, companyName }) {
  const mailTransporter = getTransporter();
  const safeTitle = job.title || "Việc làm IT mới";
  const salaryDisplay =
    job.salaryMin && job.salaryMax
      ? `${(job.salaryMin / 1000000).toFixed(0)} - ${(job.salaryMax / 1000000).toFixed(0)} Triệu VNĐ`
      : job.salaryMin
      ? `Từ ${(job.salaryMin / 1000000).toFixed(0)} Triệu VNĐ`
      : "Thương lượng";

  const appUrl = env.APP_URL || "https://tuyen-dung-it.vercel.app";
  const jobUrl = `${appUrl}/jobs/${job.slug}`;
  const unsubUrl = `${appUrl}/job-alerts/unsubscribe/${alert.unsubscribeToken}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #000071; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">VN.ITJobs</h1>
        <p style="color: #9FDB7C; margin: 6px 0 0; font-size: 13px; font-weight: 600;">Thông Báo Việc Làm Mới Dành Cho Bạn 🔔</p>
      </div>

      <div style="padding: 24px; background-color: #ffffff;">
        <p style="color: #334155; font-size: 14px; margin-top: 0;">
          Xin chào! Chúng tôi vừa tìm thấy một vị trí công việc mới phù hợp với cài đặt thông báo của bạn:
        </p>

        <div style="background-color: #F8FAFC; border: 1px solid #CBD5E1; border-left: 4px solid #0088FF; border-radius: 6px; padding: 18px; margin: 20px 0;">
          <h2 style="font-size: 17px; font-weight: bold; margin: 0 0 8px; color: #000071;">
            <a href="${jobUrl}" style="color: #000071; text-decoration: none;">${safeTitle}</a>
          </h2>
          <div style="font-size: 14px; color: #475569; font-weight: 600; margin-bottom: 6px;">
            🏢 ${companyName || "Công ty công nghệ hàng đầu"}
          </div>
          <div style="font-size: 14px; color: #EA1E30; font-weight: bold; margin-bottom: 8px;">
            💰 Mức lương: ${salaryDisplay}
          </div>
          <div style="font-size: 13px; color: #64748B;">
            📍 Khu vực: ${job.city || "Toàn quốc"} • Cấp bậc: ${job.position || "Tất cả cấp bậc"}
          </div>
        </div>

        <div style="text-align: center; margin: 24px 0 16px;">
          <a href="${jobUrl}" style="display: inline-block; background-color: #0088FF; color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px;">
            👉 Xem Chi Tiết & Ứng Tuyển Ngay
          </a>
        </div>

        <p style="color: #94A3B8; font-size: 12px; margin-top: 24px; border-top: 1px solid #E2E8F0; padding-top: 14px; text-align: center;">
          Bạn nhận được email này vì đã đăng ký thông báo việc làm trên VN.ITJobs.<br/>
          Nếu không muốn nhận thông báo này nữa, bạn có thể <a href="${unsubUrl}" style="color: #0088FF; text-decoration: underline;">hủy đăng ký tại đây</a> bất kỳ lúc nào.
        </p>
      </div>

      <div style="background-color: #F1F5F9; padding: 14px; text-align: center; color: #64748B; font-size: 11px;">
        © 2026 VN.ITJobs. Nền tảng tuyển dụng IT hàng đầu Việt Nam.
      </div>
    </div>
  `;

  if (mailTransporter) {
    try {
      const info = await mailTransporter.sendMail({
        from: env.SMTP_FROM,
        to: toEmail,
        subject: `[VN.ITJobs] Việc làm IT mới: ${safeTitle} - ${companyName || ""}`,
        html: htmlContent,
      });
      console.log(`📧 Đã gửi Job Alert tới ${toEmail}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`❌ Lỗi gửi Job Alert: ${err.message}`);
      return { success: false, error: err.message };
    }
  } else {
    console.log("=================================================");
    console.log(`📧 [MÔ PHỎNG JOB ALERT EMAIL] Tới: ${toEmail}`);
    console.log(`💼 Job: ${safeTitle} | Công ty: ${companyName}`);
    console.log(`💰 Lương: ${salaryDisplay}`);
    console.log(`🔗 Link: ${jobUrl}`);
    console.log("=================================================");
    return { success: true, simulated: true };
  }
}

/**
 * Gửi email cảnh báo bảo mật khi tài khoản đăng nhập trên thiết bị mới
 */
async function sendSecurityAlertEmail({ toEmail, fullName, userType, ip, userAgent, loginTime }) {
  const mailTransporter = getTransporter();
  const title = userType === "employer" ? "Nhà tuyển dụng" : "Ứng viên";
  const formattedTime = loginTime ? new Date(loginTime).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : new Date().toLocaleString("vi-VN");

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E5E7EB; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #000065; margin: 0; font-size: 24px;">VN.<span style="color: #0088FF;">ITJobs</span></h2>
        <p style="color: #6B7280; font-size: 14px; margin-top: 4px;">Nền tảng tuyển dụng IT hàng đầu Việt Nam</p>
      </div>
      <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 14px 18px; border-radius: 4px; margin-bottom: 20px;">
        <h3 style="color: #92400E; margin: 0 0 6px 0; font-size: 16px;">⚠️ Cảnh báo bảo mật: Phát hiện đăng nhập từ thiết bị mới</h3>
        <p style="color: #78350F; margin: 0; font-size: 13px;">Phiên làm việc trên các thiết bị cũ đã tự động bị vô hiệu hóa để bảo vệ an toàn cho tài khoản của bạn.</p>
      </div>
      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        Xin chào <strong>${fullName || toEmail}</strong>,
      </p>
      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        Tài khoản ${title} của bạn trên hệ thống <strong>VN.ITJobs</strong> vừa được đăng nhập thành công với thông tin sau:
      </p>
      <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 16px; margin: 18px 0; font-size: 13.5px; line-height: 1.8;">
        <div>⏰ <strong>Thời gian:</strong> ${formattedTime} (Giờ Việt Nam)</div>
        <div>🌐 <strong>Địa chỉ IP:</strong> <code style="background-color: #E5E7EB; padding: 2px 6px; border-radius: 4px;">${ip || "Không xác định"}</code></div>
        <div>💻 <strong>Thiết bị / Trình duyệt:</strong> ${userAgent || "Không xác định"}</div>
      </div>
      <p style="color: #EF4444; font-size: 13.5px; font-weight: bold; line-height: 1.6;">
        Nếu đây KHÔNG PHẢI là bạn, rất có thể mật khẩu tài khoản của bạn đã bị lộ. Vui lòng đăng nhập lại và thực hiện ĐỔI MẬT KHẨU ngay lập tức để bảo vệ tài khoản!
      </p>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
      <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
        Email này được gửi tự động từ hệ thống bảo mật VN.ITJobs. Vui lòng không trả lời email này.
      </p>
    </div>
  `;

  if (mailTransporter) {
    try {
      const info = await mailTransporter.sendMail({
        from: env.SMTP_FROM,
        to: toEmail,
        subject: `[Cảnh báo bảo mật VN.ITJobs] Phát hiện đăng nhập mới cho tài khoản ${fullName || toEmail}`,
        html: htmlContent,
      });
      console.log(`📧 Đã gửi cảnh báo đăng nhập tới ${toEmail}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`❌ Lỗi gửi email cảnh báo bảo mật: ${err.message}`);
      return { success: false, error: err.message };
    }
  } else {
    console.log("=================================================");
    console.log(`📧 [MÔ PHỎNG EMAIL CẢNH BÁO BẢO MẬT] Tới: ${toEmail}`);
    console.log(`👤 Người dùng: ${fullName} (${title}) | IP: ${ip}`);
    console.log(`💻 Thiết bị: ${userAgent}`);
    console.log(`⏰ Thời gian: ${formattedTime}`);
    console.log("=================================================");
    return { success: true, simulated: true };
  }
}

/**
 * Gửi mã OTP xác thực 2 bước (2FA) khi Admin đăng nhập
 */
async function sendAdmin2faOtpEmail(toEmail, otpCode, adminName) {
  const mailTransporter = getTransporter();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E5E7EB; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #000065; margin: 0; font-size: 24px;">VN.<span style="color: #0088FF;">ITJobs</span> <span style="font-size: 13px; background-color: #0088FF; color: white; padding: 2px 8px; border-radius: 4px;">ADMIN</span></h2>
        <p style="color: #6B7280; font-size: 14px; margin-top: 4px;">Hệ thống Quản trị viên An toàn Cấp cao</p>
      </div>
      <p style="color: #374151; font-size: 15px; line-height: 1.6;">
        Xin chào Quản trị viên <strong>${adminName || toEmail}</strong>,
      </p>
      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        Bạn vừa yêu cầu đăng nhập vào Bảng điều khiển Quản trị viên <strong>VN.ITJobs</strong>. Dưới đây là mã xác thực 2 bước (2FA) của bạn:
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <span style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #000065; background-color: #EEF2FF; border: 2px dashed #6366F1; padding: 12px 28px; border-radius: 8px;">
          ${otpCode}
        </span>
      </div>
      <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #991B1B; margin-bottom: 18px;">
        ⚠️ <strong>Lưu ý bảo mật tối cao:</strong> Mã xác thực có hiệu lực trong vòng <strong>5 phút</strong>. Tuyệt đối không chia sẻ mã này cho bất kỳ ai. Nếu bạn không yêu cầu đăng nhập, vui lòng đổi mật khẩu ngay lập tức.
      </div>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
      <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
        Email này được gửi tự động từ hệ thống bảo mật Admin VN.ITJobs.
      </p>
    </div>
  `;

  if (mailTransporter) {
    try {
      const info = await mailTransporter.sendMail({
        from: env.SMTP_FROM,
        to: toEmail,
        subject: `[VN.ITJobs Admin] Mã xác thực 2 bước (2FA): ${otpCode}`,
        html: htmlContent,
      });
      console.log(`📧 Đã gửi mã 2FA tới Admin ${toEmail}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`❌ Lỗi gửi mã 2FA Admin: ${err.message}`);
      return { success: false, error: err.message };
    }
  } else {
    console.log("=================================================");
    console.log(`🔐 [MÔ PHỎNG 2FA ADMIN OTP] Đã gửi tới: ${toEmail}`);
    console.log(`🔑 MÃ 2FA QUẢN TRỊ VIÊN: ${otpCode} (Hết hạn sau 5 phút)`);
    console.log("=================================================");
    return { success: true, simulated: true };
  }
}

module.exports = {
  sendOtpEmail,
  sendRegistrationOtpEmail,
  sendInterviewInvitationEmail,
  sendRejectionEmail,
  sendJobAlertEmail,
  sendSecurityAlertEmail,
  sendAdmin2faOtpEmail,
};
