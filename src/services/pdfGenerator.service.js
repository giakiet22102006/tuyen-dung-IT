// src/services/pdfGenerator.service.js
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { getCityLabel, getPositionLabel } = require("../utils/labels");

const REGULAR_FONT_PATH = path.join(__dirname, "../assets/fonts/Roboto-Regular.ttf");
const BOLD_FONT_PATH = path.join(__dirname, "../assets/fonts/Roboto-Bold.ttf");

/**
 * Loại bỏ dấu tiếng Việt an toàn khi xuất PDF với standard Helvetica font (fallback)
 */
function toAscii(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function hasUnicodeFonts() {
  try {
    return fs.existsSync(REGULAR_FONT_PATH) && fs.existsSync(BOLD_FONT_PATH);
  } catch {
    return false;
  }
}

/**
 * Sinh buffer file PDF chuẩn từ hồ sơ IT Profile của Ứng viên
 * Hỗ trợ font TrueType Unicode tiếng Việt (Roboto), fallback về Helvetica + toAscii nếu thiếu font
 * @param {Object} candidate - Đối tượng Candidate từ Mongoose
 * @param {string} jobTitle - Tên công việc ứng tuyển (tùy chọn)
 * @returns {Promise<Buffer>}
 */
function generateItProfilePdf(candidate, jobTitle = "") {
  return new Promise((resolve, reject) => {
    try {
      const useUnicode = hasUnicodeFonts();
      const txt = (val) => (useUnicode ? String(val || "") : toAscii(val || ""));

      // compress: false để giữ bảng XRef cổ điển tương thích tốt với cả trình duyệt lẫn pdf-parse (AI Screening)
      const doc = new PDFDocument({
        size: "A4",
        compress: false,
        margins: { top: 36, bottom: 44, left: 40, right: 40 },
        info: {
          Title: `CV - ${candidate?.fullName || "Candidate"}`,
          Author: candidate?.fullName || "VN.ITJobs Candidate",
          Subject: `IT Profile for ${jobTitle || "Developer"}`,
        },
      });

      const buffers = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      let fontRegular = "Helvetica";
      let fontBold = "Helvetica-Bold";
      if (useUnicode) {
        doc.registerFont("VN-Regular", REGULAR_FONT_PATH);
        doc.registerFont("VN-Bold", BOLD_FONT_PATH);
        fontRegular = "VN-Regular";
        fontBold = "VN-Bold";
      }

      const profile = candidate?.itProfile || {};
      const rawFullName = candidate?.fullName || (useUnicode ? "Ứng viên IT" : "UNG VIEN IT");
      const fullName = txt(rawFullName);
      const displayName = useUnicode ? fullName.toLocaleUpperCase("vi-VN") : fullName.toUpperCase();
      const title = txt(profile.title || "Software Engineer");
      const email = txt(candidate?.email || "");
      const phone = txt(candidate?.phone || "");
      const preferredCityLabel = profile.preferredCity ? txt(getCityLabel(profile.preferredCity)) : "";
      const expYears = profile.yearsOfExperience
        ? txt(`${profile.yearsOfExperience} năm kinh nghiệm`)
        : "";
      const level = profile.level
        ? txt(`Cấp bậc: ${getPositionLabel(profile.level)}`)
        : "";

      // 1. Header Banner
      doc.rect(40, 36, 515, 70).fill("#000071");

      doc.fillColor("#FFFFFF").fontSize(19).font(fontBold);
      doc.text(displayName, 55, 48, { width: 485 });

      const subtitleParts = [title, level, expYears].filter(Boolean);
      doc.fillColor("#9FDB7C").fontSize(11).font(fontRegular);
      doc.text(subtitleParts.join("  |  "), 55, 76, { width: 485 });

      // 2. Contact Information Bar
      const contacts = [
        email ? `Email: ${email}` : null,
        phone ? `${txt("Điện thoại")}: ${phone}` : null,
        preferredCityLabel ? `${txt("Khu vực")}: ${preferredCityLabel}` : null,
        profile.githubUrl ? `GitHub: ${txt(profile.githubUrl)}` : null,
        profile.linkedinUrl ? `LinkedIn: ${txt(profile.linkedinUrl)}` : null,
        profile.portfolioUrl ? `Portfolio: ${txt(profile.portfolioUrl)}` : null,
      ].filter(Boolean);

      const contactText = contacts.join("   |   ");
      doc.fontSize(8.5).font(fontRegular);
      const contactHeight = Math.max(24, doc.heightOfString(contactText, { width: 495 }) + 12);
      const contactTop = 112;
      doc.rect(40, contactTop, 515, contactHeight).fill("#F3F4F6");
      doc.fillColor("#374151").fontSize(8.5).font(fontRegular);
      doc.text(contactText, 50, contactTop + 6, { width: 495, align: "center" });

      doc.y = contactTop + contactHeight + 10;

      function ensureSpace(minHeight = 60) {
        if (doc.y + minHeight > doc.page.height - 56) {
          doc.addPage();
        }
      }

      // Helper function to draw Section Header
      function drawSection(titleText) {
        ensureSpace(70);
        doc.moveDown(0.5);
        const y = doc.y;
        doc.rect(40, y, 515, 22).fill("#EEF2F6");
        doc.fillColor("#000071").fontSize(10.5).font(fontBold);
        const heading = useUnicode ? titleText.toLocaleUpperCase("vi-VN") : toAscii(titleText).toUpperCase();
        doc.text(heading, 48, y + 5, { width: 500 });
        doc.y = y + 28;
      }

      // 3. Professional Summary (Bio)
      if (profile.bio && profile.bio.trim()) {
        drawSection("1. Giới thiệu bản thân (Summary)");
        doc.fillColor("#1F2937").fontSize(9.5).font(fontRegular);
        doc.text(txt(profile.bio.trim()), 45, doc.y, { width: 505, lineGap: 3 });
      }

      // 4. Technical Skills
      const skills = Array.isArray(profile.skills) ? profile.skills.filter(Boolean) : [];
      if (skills.length > 0) {
        drawSection("2. Kỹ năng chuyên môn (Technical Skills)");
        doc.fillColor("#1F2937").fontSize(9.5).font(fontBold);
        doc.text(txt("Công nghệ & Kiến thức chuyên môn: "), 45, doc.y, { continued: true, width: 505 });
        doc.font(fontRegular).text(txt(skills.join(", ")));
      }

      // 5. Work Experience
      const works = Array.isArray(profile.workExperience) ? profile.workExperience : [];
      const validWorks = works.filter((w) => w && (w.company || w.position));
      if (validWorks.length > 0) {
        drawSection("3. Kinh nghiệm làm việc (Work Experience)");
        validWorks.forEach((w) => {
          ensureSpace(55);
          doc.fillColor("#111827").fontSize(10).font(fontBold);
          const comp = txt(w.company || "Công ty IT");
          const pos = txt(w.position || "Developer");
          const startStr = txt(w.startDate || "");
          const endStr = w.isCurrent ? txt("Hiện tại") : txt(w.endDate || "");
          const period = [startStr, endStr].filter(Boolean).join(" - ");

          doc.text(`${pos} @ ${comp}`, 45, doc.y, { continued: Boolean(period), width: 505 });
          if (period) {
            doc.font(fontRegular).fillColor("#6B7280").fontSize(9).text(`  (${period})`);
          }

          if (w.description && w.description.trim()) {
            doc.fillColor("#374151").fontSize(9.2).font(fontRegular);
            doc.text(txt(w.description.trim()), 55, doc.y + 2, { width: 495, lineGap: 2 });
          }
          doc.moveDown(0.5);
        });
      }

      // 6. Featured Projects
      const projects = Array.isArray(profile.projects) ? profile.projects : [];
      const validProjects = projects.filter((p) => p && p.name);
      if (validProjects.length > 0) {
        drawSection("4. Dự án tiêu biểu (Projects)");
        validProjects.forEach((p) => {
          ensureSpace(55);
          doc.fillColor("#111827").fontSize(10).font(fontBold);
          doc.text(`• ${txt("Dự án")}: ${txt(p.name)}`, 45, doc.y, { width: 505 });
          if (p.role || p.techStack || p.link) {
            doc.fillColor("#4B5563").fontSize(9).font(fontRegular);
            const meta = [
              p.role ? `${txt("Vai trò")}: ${txt(p.role)}` : null,
              p.techStack ? `Tech Stack: ${txt(p.techStack)}` : null,
              p.link ? `Link: ${txt(p.link)}` : null,
            ].filter(Boolean);
            doc.text(meta.join(" | "), 55, doc.y + 1, { width: 495 });
          }
          if (p.description && p.description.trim()) {
            doc.fillColor("#374151").fontSize(9.2).font(fontRegular);
            doc.text(txt(p.description.trim()), 55, doc.y + 2, { width: 495, lineGap: 2 });
          }
          doc.moveDown(0.45);
        });
      }

      // 7. Education & Certificates
      const edu = (Array.isArray(profile.education) ? profile.education : []).filter((e) => e && e.school);
      const certs = (Array.isArray(profile.certificates) ? profile.certificates : []).filter((c) => c && c.name);
      if (edu.length > 0 || certs.length > 0) {
        drawSection("5. Học vấn & Chứng chỉ (Education & Certifications)");
        edu.forEach((e) => {
          ensureSpace(30);
          doc.fillColor("#111827").fontSize(9.5).font(fontBold);
          doc.text(`• ${txt(e.school)}`, 45, doc.y, { continued: true, width: 505 });
          const majorPart = txt(e.major || "Công nghệ thông tin");
          const yearPart = e.gradYear ? ` (${txt(e.gradYear)})` : "";
          doc.font(fontRegular).fillColor("#4B5563").text(` — ${majorPart}${yearPart}`);
          doc.moveDown(0.25);
        });
        certs.forEach((c) => {
          ensureSpace(30);
          doc.fillColor("#111827").fontSize(9.5).font(fontBold);
          doc.text(`• ${txt("Chứng chỉ")}: ${txt(c.name)}`, 45, doc.y, { continued: true, width: 505 });
          const metaParts = [c.organization ? txt(c.organization) : "", c.year ? txt(c.year) : ""].filter(Boolean);
          doc.font(fontRegular).fillColor("#4B5563").text(metaParts.length ? ` (${metaParts.join(" - ")})` : "");
          doc.moveDown(0.25);
        });
      }

      // Footer
      doc.moveDown(1);
      ensureSpace(24);
      doc.fillColor("#9CA3AF").fontSize(8).font(fontRegular);
      doc.text(
        txt("Hồ sơ được tạo tự động từ VN.ITJobs Profile Builder (tuyen-dung-it.vercel.app)"),
        40,
        doc.y,
        {
          align: "center",
          width: 515,
        }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateItProfilePdf,
  toAscii,
};
