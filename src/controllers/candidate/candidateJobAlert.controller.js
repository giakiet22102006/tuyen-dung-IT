// src/controllers/candidate/candidateJobAlert.controller.js
const { JobAlert } = require("../../models");

/**
 * Hiển thị trang quản lý thông báo việc làm của ứng viên
 */
async function renderCandidateJobAlerts(req, res) {
  const alerts = await JobAlert.find({
    $or: [{ candidateId: req.user._id }, { email: req.user.email }],
  })
    .sort({ createdAt: -1 })
    .lean();

  res.render("pages/candidate-job-alerts", {
    title: "Thông Báo Việc Làm (Job Alerts) | VN.ITJobs",
    alerts,
  });
}

/**
 * Bật / tắt kích hoạt thông báo việc làm
 */
async function postToggleJobAlert(req, res) {
  try {
    const { id } = req.params;
    const alert = await JobAlert.findOne({
      _id: id,
      $or: [{ candidateId: req.user._id }, { email: req.user.email }],
    });

    if (!alert) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(404).json({ success: false, message: "Không tìm thấy thông báo việc làm!" });
      }
      req.flash("error", "Không tìm thấy thông báo việc làm!");
      return res.redirect("/candidate/job-alerts");
    }

    alert.isActive = !alert.isActive;
    await alert.save();

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({
        success: true,
        isActive: alert.isActive,
        message: alert.isActive ? "Đã bật thông báo việc làm" : "Đã tạm dừng thông báo việc làm",
      });
    }

    req.flash("success", alert.isActive ? "Đã kích hoạt lại thông báo việc làm!" : "Đã tạm dừng thông báo việc làm!");
    return res.redirect("/candidate/job-alerts");
  } catch (error) {
    console.error("Lỗi toggle Job Alert:", error);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ success: false, message: "Có lỗi xảy ra!" });
    }
    req.flash("error", "Có lỗi xảy ra!");
    return res.redirect("/candidate/job-alerts");
  }
}

/**
 * Xóa thông báo việc làm
 */
async function postDeleteJobAlert(req, res) {
  try {
    const { id } = req.params;
    await JobAlert.deleteOne({
      _id: id,
      $or: [{ candidateId: req.user._id }, { email: req.user.email }],
    });

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, message: "Đã xóa thông báo việc làm!" });
    }

    req.flash("success", "Đã xóa thông báo việc làm!");
    return res.redirect("/candidate/job-alerts");
  } catch (error) {
    console.error("Lỗi xóa Job Alert:", error);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ success: false, message: "Có lỗi xảy ra!" });
    }
    req.flash("error", "Có lỗi xảy ra khi xóa thông báo!");
    return res.redirect("/candidate/job-alerts");
  }
}

module.exports = {
  renderCandidateJobAlerts,
  postToggleJobAlert,
  postDeleteJobAlert,
};
