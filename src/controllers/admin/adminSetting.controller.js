// src/controllers/admin/adminSetting.controller.js
const { Setting } = require("../../models");
const { logAdminAction } = require("../../services/audit.service");

/**
 * Hiển thị form cấu hình thông tin Về chúng tôi
 */
async function renderAboutSettings(req, res) {
  const settings = await Setting.getSettings();

  res.render("admin/settings/about", {
    title: "Cấu hình Về chúng tôi | Admin VN.ITJobs",
    currentPath: `/${res.locals.adminPath}/settings/about`,
    about: settings.about,
  });
}

/**
 * Xử lý cập nhật thông tin Về chúng tôi
 */
async function postAboutSettings(req, res) {
  const {
    title,
    subtitle,
    overviewParagraph1,
    overviewParagraph2,
    vision,
    mission,
    statsJobs,
    statsJobsLabel,
    statsCompanies,
    statsCompaniesLabel,
    statsCandidates,
    statsCandidatesLabel,
    companyName,
    businessCode,
    headOffice,
    branchOffice,
    email,
    hotline,
  } = req.body;

  if (!title || !title.trim()) {
    req.flash("error", "Tiêu đề trang không được để trống.");
    return res.redirect(`/${res.locals.adminPath}/settings/about`);
  }

  let settings = await Setting.findOne({ key: "system_settings" });
  if (!settings) {
    settings = new Setting({ key: "system_settings" });
  }

  settings.about = {
    title: title.trim(),
    subtitle: (subtitle || "").trim(),
    overviewParagraph1: (overviewParagraph1 || "").trim(),
    overviewParagraph2: (overviewParagraph2 || "").trim(),
    vision: (vision || "").trim(),
    mission: (mission || "").trim(),
    statsJobs: (statsJobs || "").trim(),
    statsJobsLabel: (statsJobsLabel || "").trim(),
    statsCompanies: (statsCompanies || "").trim(),
    statsCompaniesLabel: (statsCompaniesLabel || "").trim(),
    statsCandidates: (statsCandidates || "").trim(),
    statsCandidatesLabel: (statsCandidatesLabel || "").trim(),
    companyName: (companyName || "").trim(),
    businessCode: (businessCode || "").trim(),
    headOffice: (headOffice || "").trim(),
    branchOffice: (branchOffice || "").trim(),
    email: (email || "").trim(),
    hotline: (hotline || "").trim(),
  };

  await settings.save();

  await logAdminAction({
    adminId: req.admin ? req.admin._id : "system",
    action: "settings.about.update",
    targetType: "System",
    targetId: settings._id,
    meta: {
      updatedBy: req.admin ? req.admin.email : "admin",
      title: settings.about.title,
    },
    ip: req.ip,
  });

  req.flash("success", "Cập nhật thông tin 'Về chúng tôi' thành công.");
  return res.redirect(`/${res.locals.adminPath}/settings/about`);
}

module.exports = {
  renderAboutSettings,
  postAboutSettings,
};
