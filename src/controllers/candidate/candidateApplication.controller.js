// src/controllers/candidate/candidateApplication.controller.js
const fs = require("fs");
const { Application } = require("../../models");
const { getCVPath, deleteCV } = require("../../services/storage.service");
const paginate = require("../../utils/pagination");

const renderAppliedJobs = async (req, res) => {
  const page = req.query.page || 1;
  const filter = {
    candidateId: req.user._id,
    hiddenByCandidate: false,
  };

  const total = await Application.countDocuments(filter);
  const pagination = paginate(total, page, 9);

  const applications = await Application.find(filter)
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .populate({
      path: "jobId",
      select: "title slug salaryMin salaryMax position workingForm city address deletedAt",
    })
    .populate({
      path: "employerId",
      select: "companyName slug logo email phone",
    })
    .lean();

  res.render("pages/applied-jobs", {
    title: "Quản lý CV đã gửi (Ứng viên)",
    applications,
    pagination,
  });
};

const postWithdrawApplication = async (req, res) => {
  const application = await Application.findOne({
    _id: req.params.id,
    candidateId: req.user._id,
    hiddenByCandidate: false,
  });

  if (!application) {
    req.flash("error", "Không tìm thấy hồ sơ ứng tuyển.");
    return res.redirect("/candidate/applied-jobs");
  }

  // Nút Xóa chỉ khả dụng khi status=pending (rút hồ sơ)
  if (application.status !== "pending") {
    req.flash("error", "Hồ sơ đã được nhà tuyển dụng xem xét, bạn không thể rút vào lúc này.");
    return res.redirect("/candidate/applied-jobs");
  }

  application.hiddenByCandidate = true;

  // Khi cả hai phía cùng ẩn thì xóa vĩnh viễn bản ghi và file PDF
  if (application.hiddenByEmployer === true) {
    if (application.cv && application.cv.key) {
      deleteCV(application.cv.key);
    }
    await Application.findByIdAndDelete(application._id);
  } else {
    await application.save();
  }

  req.flash("success", "Đã rút hồ sơ ứng tuyển thành công.");
  res.redirect("/candidate/applied-jobs");
};

const streamCandidateCv = async (req, res) => {
  const application = await Application.findOne({
    _id: req.params.id,
    candidateId: req.user._id,
    hiddenByCandidate: false,
  });

  if (!application || !application.cv || !application.cv.key) {
    return res.status(404).send("Không tìm thấy file CV.");
  }

  const filePath = getCVPath(application.cv.key);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send("File CV không tồn tại trên hệ thống lưu trữ.");
  }

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${encodeURIComponent(application.cv.originalName || "CV.pdf")}"`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });

  fs.createReadStream(filePath).pipe(res);
};

const postRespondInterview = async (req, res) => {
  const { responseStatus, note } = req.body;
  if (!["confirmed", "rescheduled"].includes(responseStatus)) {
    req.flash("error", "Trạng thái phản hồi không hợp lệ.");
    return res.redirect("/candidate/applied-jobs");
  }

  const application = await Application.findOne({
    _id: req.params.id,
    candidateId: req.user._id,
    hiddenByCandidate: false,
  }).populate("jobId", "title").populate("employerId", "companyName");

  if (!application || !application.interviewSchedule || !application.interviewSchedule.scheduledAt) {
    req.flash("error", "Không tìm thấy lịch phỏng vấn cần phản hồi.");
    return res.redirect("/candidate/applied-jobs");
  }

  application.interviewSchedule.candidateResponse = {
    status: responseStatus,
    note: note ? note.trim() : "",
    respondedAt: new Date(),
  };

  if (responseStatus === "confirmed") {
    application.interviewSchedule.status = "confirmed";
  } else if (responseStatus === "rescheduled") {
    application.interviewSchedule.status = "rescheduled";
  }

  await application.save();

  // Bắn thông báo In-App cho Nhà tuyển dụng
  const { createNotification } = require("../../services/notification.service");
  const actionText = responseStatus === "confirmed" ? "đã XÁC NHẬN tham gia" : "đã ĐỀ NGHỊ ĐỔI LỊCH";
  createNotification({
    recipientId: application.employerId._id,
    recipientType: "employer",
    title: `Ứng viên ${actionText} phỏng vấn`,
    message: `Ứng viên ${application.fullName} ${actionText} phỏng vấn vị trí "${application.jobId ? application.jobId.title : 'việc làm'}". ${note ? `Ghi chú: ${note.trim()}` : ''}`,
    link: `/employer/cvs/${application._id}`,
    type: "interview_response",
  }).catch(() => {});

  req.flash(
    "success",
    responseStatus === "confirmed"
      ? "Đã xác nhận tham gia phỏng vấn thành công!"
      : "Đã gửi đề xuất dời lịch phỏng vấn đến nhà tuyển dụng!"
  );
  res.redirect("/candidate/applied-jobs");
};

module.exports = {
  renderAppliedJobs,
  postWithdrawApplication,
  streamCandidateCv,
  postRespondInterview,
};
