// src/services/jobAlert.service.js
const { JobAlert, Employer } = require("../models");
const { sendJobAlertEmail } = require("./mail.service");

/**
 * Quét các thuê bao Job Alert đang kích hoạt và gửi email khi có job mới phù hợp
 * Chạy bất đồng bộ trong background để không chặn luồng đăng việc của NTD.
 */
async function notifyMatchingSubscribers(job, employer = null) {
  try {
    if (!job) return;

    let companyName = "";
    if (employer && employer.companyName) {
      companyName = employer.companyName;
    } else if (job.employerId) {
      const emp = await Employer.findById(job.employerId).select("companyName").lean();
      companyName = emp ? emp.companyName : "Công ty IT";
    }

    const query = {
      isActive: true,
    };

    const alerts = await JobAlert.find(query).lean();
    if (!alerts || alerts.length === 0) return;

    const jobTitleLower = (job.title || "").toLowerCase();
    const jobCity = job.city || "";
    const jobPosition = job.position || "";
    const jobSkills = (job.skills || []).map((s) => (typeof s === "string" ? s : s.name || s.slug || "").toLowerCase());

    const matchingAlerts = alerts.filter((alert) => {
      // Nếu có cài đặt city mà khác city của job -> skip
      if (alert.city && alert.city !== jobCity) {
        return false;
      }

      // Nếu có cài đặt position mà khác position của job -> skip
      if (alert.position && alert.position !== jobPosition) {
        return false;
      }

      // Nếu có keyword, kiểm tra xem có xuất hiện trong title hoặc skills không
      if (alert.keyword) {
        const kw = alert.keyword.toLowerCase().trim();
        const matchesTitle = jobTitleLower.includes(kw);
        const matchesSkill = jobSkills.some((s) => s.includes(kw));
        if (!matchesTitle && !matchesSkill) {
          return false;
        }
      }

      return true;
    });

    console.log(`🔔 Tìm thấy ${matchingAlerts.length} ứng viên phù hợp với job "${job.title}" để gửi Alert.`);

    // Gửi email cho từng subscriber (giới hạn tối đa 50 email mỗi lần để tránh rate limit)
    const targets = matchingAlerts.slice(0, 50);
    for (const alert of targets) {
      await sendJobAlertEmail({
        toEmail: alert.email,
        alert,
        job,
        companyName,
      });

      // Cập nhật lastSentAt
      await JobAlert.updateOne({ _id: alert._id }, { lastSentAt: new Date() });
    }
  } catch (err) {
    console.error("❌ Lỗi trong notifyMatchingSubscribers:", err.message);
  }
}

module.exports = {
  notifyMatchingSubscribers,
};
