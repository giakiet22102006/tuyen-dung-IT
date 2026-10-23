// src/controllers/client/jobAlert.controller.js
const { JobAlert } = require("../../models");

/**
 * Đăng ký nhận thông báo việc làm mới (Hỗ trợ cả AJAX và submit form)
 */
async function postSubscribeJobAlert(req, res) {
  try {
    const { email, keyword = "", city = "", position = "", frequency = "instant" } = req.body;

    if (!email || !email.includes("@")) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(400).json({ success: false, message: "Vui lòng nhập địa chỉ email hợp lệ!" });
      }
      req.flash("error", "Vui lòng nhập địa chỉ email hợp lệ!");
      return res.redirect("back");
    }

    const cleanEmail = email.toLowerCase().trim();
    const candidateId = req.user && req.userType === "candidate" ? req.user._id : null;

    let alert = await JobAlert.findOne({
      email: cleanEmail,
      keyword: keyword.trim(),
      city: city.trim(),
      position: position.trim(),
    });

    if (alert) {
      alert.isActive = true;
      if (candidateId) alert.candidateId = candidateId;
      await alert.save();
    } else {
      alert = await JobAlert.create({
        email: cleanEmail,
        keyword: keyword.trim(),
        city: city.trim(),
        position: position.trim(),
        frequency,
        candidateId,
        isActive: true,
      });
    }

    const successMsg = "🎉 Đăng ký nhận thông báo việc làm thành công! Hệ thống sẽ gửi email cho bạn ngay khi có cơ hội mới.";

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, message: successMsg, alertId: alert._id });
    }

    req.flash("success", successMsg);
    return res.redirect("back");
  } catch (error) {
    console.error("Lỗi đăng ký Job Alert:", error);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ success: false, message: "Có lỗi xảy ra, vui lòng thử lại sau!" });
    }
    req.flash("error", "Có lỗi xảy ra khi đăng ký thông báo!");
    return res.redirect("back");
  }
}

/**
 * Hủy đăng ký nhận thông báo việc làm qua Token 1-Click
 */
async function getUnsubscribeJobAlert(req, res) {
  try {
    const { token } = req.params;
    const alert = await JobAlert.findOne({ unsubscribeToken: token });

    if (!alert) {
      return res.render("pages/job-alert-unsubscribed", {
        title: "Hủy Thông Báo Việc Làm | VN.ITJobs",
        status: "not_found",
        message: "Không tìm thấy thông báo việc làm hoặc liên kết đã hết hạn.",
      });
    }

    alert.isActive = false;
    await alert.save();

    return res.render("pages/job-alert-unsubscribed", {
      title: "Đã Hủy Nhận Thông Báo | VN.ITJobs",
      status: "success",
      email: alert.email,
      message: `Bạn đã hủy nhận thông báo việc làm thành công cho email: ${alert.email}. Bạn có thể đăng ký lại bất kỳ lúc nào trên website.`,
    });
  } catch (error) {
    console.error("Lỗi hủy Job Alert:", error);
    return res.render("pages/job-alert-unsubscribed", {
      title: "Lỗi Hủy Thông Báo | VN.ITJobs",
      status: "error",
      message: "Đã có lỗi xảy ra trong quá trình hủy đăng ký.",
    });
  }
}

module.exports = {
  postSubscribeJobAlert,
  getUnsubscribeJobAlert,
};
