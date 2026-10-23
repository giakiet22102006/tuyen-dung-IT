// src/services/pdfGenerator.service.js
const PDFDocument = require("pdfkit");

/**
 * Loại bỏ dấu tiếng Việt an toàn khi xuất PDF với standard Helvetica font
 */
function toAscii(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Sinh buffer file PDF chuẩn từ hồ sơ IT Profile của Ứng viên
 * @param {Object} candidate - Đối tượng Candidate từ Mongoose
 * @param {string} jobTitle - Tên công việc ứng tuyển (tùy chọn)
 * @returns {Promise<Buffer>}
 */
function generateItProfilePdf(candidate, jobTitle = "") {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 36, bottom: 36, left: 40, right: 40 },
        info: {
          Title: `CV - ${candidate.fullName || "Candidate"}`,
          Author: candidate.fullName || "VN.ITJobs Candidate",
          Subject: `IT Profile for ${jobTitle || "Developer"}`,
        },
      });

      const buffers = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      const profile = candidate.itProfile || {};
      const fullName = toAscii(candidate.fullName || "UNG VIEN IT");
      const title = toAscii(profile.title || "Software Engineer");
      const email = candidate.email || "";
      const phone = candidate.phone || "";
      const expYears = profile.yearsOfExperience ? `${profile.yearsOfExperience} nam kinh nghiem` : "";
      const level = profile.level ? `Cap bac: ${toAscii(profile.level).toUpperCase()}` : "";

      // 1. Header Banner
      doc.rect(40, 36, 515, 65).fill("#000071");

      doc.fillColor("#FFFFFF").fontSize(20).font("Helvetica-Bold");
      doc.text(fullName.toUpperCase(), 55, 48, { width: 485 });

      doc.fillColor("#9FDB7C").fontSize(12).font("Helvetica");
      doc.text(title + (level ? ` | ${level}` : "") + (expYears ? ` | ${expYears}` : ""), 55, 74, { width: 485 });

      doc.y = 112;

      // 2. Contact Information Bar
      doc.rect(40, 108, 515, 24).fill("#F3F4F6");
      doc.fillColor("#374151").fontSize(9).font("Helvetica");

      const contacts = [
        email ? `Email: ${email}` : null,
        phone ? `Phone: ${phone}` : null,
        profile.githubUrl ? `GitHub: ${profile.githubUrl}` : null,
        profile.linkedinUrl ? `LinkedIn: ${profile.linkedinUrl}` : null,
      ].filter(Boolean);

      doc.text(contacts.join("   |   "), 48, 115, { width: 500, align: "center" });

      doc.y = 142;

      // Helper function to draw Section Header
      function drawSection(titleText) {
        doc.moveDown(0.6);
        const y = doc.y;
        doc.rect(40, y, 515, 20).fill("#EEF2F6");
        doc.fillColor("#000071").fontSize(11).font("Helvetica-Bold");
        doc.text(titleText.toUpperCase(), 48, y + 5);
        doc.moveDown(0.7);
      }

      // 3. Professional Summary (Bio)
      if (profile.bio && profile.bio.trim()) {
        drawSection("1. GIOI THIEU BAN THAN (SUMMARY)");
        doc.fillColor("#1F2937").fontSize(10).font("Helvetica");
        doc.text(toAscii(profile.bio.trim()), 45, doc.y, { width: 505, lineGap: 3 });
      }

      // 4. Technical Skills
      const skills = profile.skills && profile.skills.length > 0 ? profile.skills : [];
      if (skills.length > 0) {
        drawSection("2. KY NANG CHUYEN MON (TECHNICAL SKILLS)");
        doc.fillColor("#1F2937").fontSize(10).font("Helvetica-Bold");
        doc.text("Cong nghe & Kien thuc chuyen mon: ", 45, doc.y, { continued: true });
        doc.font("Helvetica").text(skills.join(", "));
      }

      // 5. Work Experience
      const works = profile.workExperience || [];
      if (works.length > 0) {
        drawSection("3. KINH NGHIEM LAM VIEC (WORK EXPERIENCE)");
        works.forEach((w) => {
          if (!w.company && !w.position) return;
          doc.fillColor("#111827").fontSize(10).font("Helvetica-Bold");
          const comp = toAscii(w.company || "Cong ty IT");
          const pos = toAscii(w.position || "Developer");
          const period = `${w.startDate || ""} - ${w.isCurrent ? "Hien tai" : (w.endDate || "")}`;
          doc.text(`${pos} @ ${comp}`, 45, doc.y, { continued: true, width: 360 });
          doc.font("Helvetica").fillColor("#6B7280").fontSize(9).text(`(${period})`, { align: "right" });

          if (w.description) {
            doc.fillColor("#374151").fontSize(9.5).font("Helvetica");
            doc.text(toAscii(w.description), 55, doc.y + 2, { width: 495, lineGap: 2 });
          }
          doc.moveDown(0.5);
        });
      }

      // 6. Featured Projects
      const projects = profile.projects || [];
      if (projects.length > 0) {
        drawSection("4. DU AN TIEU BIEU (PROJECTS)");
        projects.forEach((p) => {
          if (!p.name) return;
          doc.fillColor("#111827").fontSize(10).font("Helvetica-Bold");
          doc.text(`- Du an: ${toAscii(p.name)}`, 45, doc.y);
          if (p.role || p.techStack) {
            doc.fillColor("#4B5563").fontSize(9).font("Helvetica");
            const meta = [
              p.role ? `Vai tro: ${toAscii(p.role)}` : null,
              p.techStack ? `Tech Stack: ${toAscii(p.techStack)}` : null,
              p.link ? `Link: ${p.link}` : null,
            ].filter(Boolean);
            doc.text(meta.join(" | "), 55, doc.y + 1);
          }
          if (p.description) {
            doc.fillColor("#374151").fontSize(9).font("Helvetica");
            doc.text(toAscii(p.description), 55, doc.y + 2, { width: 495, lineGap: 2 });
          }
          doc.moveDown(0.4);
        });
      }

      // 7. Education & Certificates
      const edu = profile.education || [];
      const certs = profile.certificates || [];
      if (edu.length > 0 || certs.length > 0) {
        drawSection("5. HOC VAN & CHUNG CHI (EDUCATION & CERTIFICATIONS)");
        edu.forEach((e) => {
          if (!e.school) return;
          doc.fillColor("#111827").fontSize(9.5).font("Helvetica-Bold");
          doc.text(`- ${toAscii(e.school)}`, 45, doc.y, { continued: true });
          doc.font("Helvetica").fillColor("#4B5563").text(` - ${toAscii(e.major || "Cong nghe thong tin")} (${e.gradYear || ""})`);
        });
        certs.forEach((c) => {
          if (!c.name) return;
          doc.fillColor("#111827").fontSize(9.5).font("Helvetica-Bold");
          doc.text(`- Chung chi: ${toAscii(c.name)}`, 45, doc.y, { continued: true });
          doc.font("Helvetica").fillColor("#4B5563").text(` (${toAscii(c.organization || "")} - ${c.year || ""})`);
        });
      }

      // Footer
      doc.moveDown(1);
      doc.fillColor("#9CA3AF").fontSize(8).font("Helvetica");
      doc.text("Ho so duoc tao tu dong tu VN.ITJobs Profile Builder (tuyen-dung-it.vercel.app)", 40, 780, {
        align: "center",
        width: 515,
      });

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
