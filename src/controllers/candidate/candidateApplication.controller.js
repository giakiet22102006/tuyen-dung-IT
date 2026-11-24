// src/controllers/candidate/candidateApplication.controller.js
const { Application } = require("../../models");
const { APPLICATION_STATUS } = require("../../config/constants");
const { ensureCVBuffer, setPdfInlineHeaders, deleteCV } = require("../../services/storage.service");
const { generateIcsEvent } = require("../../utils/calendar");
const paginate = require("../../utils/pagination");

/**
 * Chuyển đổi văn bản chứa thẻ HTML thô (<p>, <br>, &amp;...) thành plain-text sạch khi hiển thị
 */
function htmlToPlainText(input) {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const renderAppliedJobs = async (req, res) => {
  const page = req.query.page || 1;
  const filter = {
    candidateId: req.user._id,
    hiddenByCandidate: false,
  };

  const total = await Application.countDocuments(filter);
  const pagination = paginate(total, page, 9);

  const rawApplications = await Application.find(filter)
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

  const applications = rawApplications.map((app) => ({
    ...app,
    rejectionReason: htmlToPlainText(app.rejectionReason),
    rejectionNote: htmlToPlainText(app.rejectionNote),
    interviewInvitation: app.interviewInvitation
      ? {
          ...app.interviewInvitation,
          subject: htmlToPlainText(app.interviewInvitation.subject),
          content: htmlToPlainText(app.interviewInvitation.content),
        }
      : app.interviewInvitation,
    interviewSchedule: app.interviewSchedule
      ? {
          ...app.interviewSchedule,
          notes: htmlToPlainText(app.interviewSchedule.notes),
        }
      : app.interviewSchedule,
  }));

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

  // Nút Rút hồ sơ chỉ khả dụng khi status === pending
  if (application.status !== APPLICATION_STATUS.PENDING) {
    req.flash("error", "Hồ sơ đã được nhà tuyển dụng xem xét, bạn không thể rút vào lúc này.");
    return res.redirect("/candidate/applied-jobs");
  }

  const cvKey = application.cv?.key;
  // Xóa hẳn bản ghi để phía Nhà tuyển dụng không còn thấy hồ sơ đã rút và ứng viên có thể nộp lại CV mới
  await Application.deleteOne({ _id: application._id });
  if (cvKey) {
    deleteCV(cvKey);
  }

  req.flash("success", "Đã rút hồ sơ ứng tuyển thành công. Bạn có thể nộp lại CV mới nếu cần.");
  res.redirect("/candidate/applied-jobs");
};

const streamCandidateCv = async (req, res) => {
  const application = await Application.findOne({
    _id: req.params.id,
    candidateId: req.user._id,
    hiddenByCandidate: false,
  }).lean();

  if (!application || !application.cv || !application.cv.key) {
    return res.status(404).send("Không tìm thấy file CV.");
  }

  const pdfBuffer = await ensureCVBuffer(application.cv.key);
  if (!pdfBuffer) {
    return res.status(404).send("File CV không tồn tại trên hệ thống lưu trữ.");
  }

  setPdfInlineHeaders(res, application.cv.originalName || "CV.pdf");
  return res.send(pdfBuffer);
};

const downloadInterviewIcs = async (req, res) => {
  const application = await Application.findOne({
    _id: req.params.id,
    candidateId: req.user._id,
    hiddenByCandidate: false,
  })
    .populate("jobId", "title")
    .populate("employerId", "companyName email")
    .lean();

  if (!application || !application.interviewSchedule || !application.interviewSchedule.scheduledAt) {
    return res.status(404).send("Không tìm thấy lịch phỏng vấn.");
  }

  const schedule = application.interviewSchedule;
  const jobTitle = application.jobId ? application.jobId.title : "Vị trí IT";
  const companyName = application.employerId ? application.employerId.companyName : "Nhà tuyển dụng";
  const locationText =
    schedule.locationType === "online"
      ? schedule.meetingLink || "Phỏng vấn trực tuyến (Online)"
      : schedule.locationAddress || "Văn phòng công ty";

  const vnTimeStr = new Date(schedule.scheduledAt).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });

  const descriptionLines = [
    `Phỏng vấn vị trí ${jobTitle} tại ${companyName}.`,
    `Thời gian (Giờ Việt Nam): ${vnTimeStr} (${schedule.durationMinutes || 60} phút).`,
    schedule.interviewers ? `Người phỏng vấn: ${schedule.interviewers}` : "",
    schedule.notes ? `Ghi chú: ${htmlToPlainText(schedule.notes)}` : "",
  ].filter(Boolean);

  const icsContent = generateIcsEvent({
    title: `Phỏng vấn: ${jobTitle} - ${companyName}`,
    description: descriptionLines.join("\n"),
    location: locationText,
    startDate: schedule.scheduledAt,
    durationMinutes: schedule.durationMinutes || 60,
    organizerName: companyName,
    organizerEmail: application.employerId?.email || "recruitment@vn-itjobs.com",
    attendeeName: application.fullName || req.user.fullName || "Ứng viên",
    attendeeEmail: application.email || req.user.email || "",
    meetingUrl: schedule.locationType === "online" ? schedule.meetingLink : "",
  });

  res.set({
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `attachment; filename="interview-${application._id}.ics"`,
    "Cache-Control": "private, no-store",
  });
  return res.send(icsContent);
};

const postRespondInterview = async (req, res) => {
  const { responseStatus, note } = req.body;
  if (!["confirmed", "rescheduled", "declined"].includes(responseStatus)) {
    req.flash("error", "Trạng thái phản hồi không hợp lệ.");
    return res.redirect("/candidate/applied-jobs");
  }

  const application = await Application.findOne({
    _id: req.params.id,
    candidateId: req.user._id,
    hiddenByCandidate: false,
  })
    .populate("jobId", "title")
    .populate("employerId", "companyName");

  if (!application || !application.interviewSchedule || !application.interviewSchedule.scheduledAt) {
    req.flash("error", "Không tìm thấy lịch phỏng vấn cần phản hồi.");
    return res.redirect("/candidate/applied-jobs");
  }

  const cleanNote = note ? String(note).trim().slice(0, 1000) : "";

  application.interviewSchedule.candidateResponse = {
    status: responseStatus,
    note: cleanNote,
    respondedAt: new Date(),
  };

  if (responseStatus === "confirmed") {
    application.interviewSchedule.status = "confirmed";
  } else if (responseStatus === "rescheduled") {
    application.interviewSchedule.status = "rescheduled";
  } else if (responseStatus === "declined") {
    application.interviewSchedule.status = "cancelled";
  }

  await application.save();

  // Bắn thông báo In-App cho Nhà tuyển dụng
  const { createNotification } = require("../../services/notification.service");
  const actionMap = {
    confirmed: "đã XÁC NHẬN tham gia",
    rescheduled: "đã ĐỀ NGHỊ ĐỔI LỊCH",
    declined: "đã TỪ CHỐI lịch",
  };
  const actionText = actionMap[responseStatus];

  if (application.employerId && application.employerId._id) {
    createNotification({
      recipientId: application.employerId._id,
      recipientType: "employer",
      title: `Ứng viên ${actionText} phỏng vấn`,
      message: `Ứng viên ${application.fullName} ${actionText} phỏng vấn vị trí "${application.jobId ? application.jobId.title : "việc làm"}". ${cleanNote ? `Ghi chú: ${cleanNote}` : ""}`,
      link: `/employer/cvs/${application._id}`,
      type: "interview_response",
    }).catch(() => {});
  }

  const flashMap = {
    confirmed: "Đã xác nhận tham gia phỏng vấn thành công!",
    rescheduled: "Đã gửi đề xuất dời lịch phỏng vấn đến nhà tuyển dụng!",
    declined: "Đã gửi thông báo từ chối lịch phỏng vấn đến nhà tuyển dụng.",
  };

  req.flash("success", flashMap[responseStatus]);
  res.redirect("/candidate/applied-jobs");
};

module.exports = {
  renderAppliedJobs,
  postWithdrawApplication,
  streamCandidateCv,
  downloadInterviewIcs,
  postRespondInterview,
  htmlToPlainText,
};
