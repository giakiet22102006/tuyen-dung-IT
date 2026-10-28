// src/controllers/employer/employerCv.controller.js
const fs = require("fs");
const { Application, Job } = require("../../models");
const { APPLICATION_STATUS } = require("../../config/constants");
const { getCVPath, deleteCV } = require("../../services/storage.service");
const { sendInterviewInvitationEmail, sendRejectionEmail } = require("../../services/mail.service");
const { draftInterviewInvitation, draftRejectionLetter } = require("../../services/ai.service");
const sanitizeHtml = require("../../utils/sanitizeHtml");
const paginate = require("../../utils/pagination");

const renderManageCv = async (req, res) => {
  const page = req.query.page || 1;
  const filter = {
    employerId: req.user._id,
    hiddenByEmployer: false,
  };

  // Lọc theo Job nếu có
  if (req.query.jobId) {
    filter.jobId = req.query.jobId;
  }

  // Lọc theo trạng thái nếu có
  if (req.query.status && Object.values(APPLICATION_STATUS).includes(req.query.status)) {
    filter.status = req.query.status;
  }

  const total = await Application.countDocuments(filter);
  const pagination = paginate(total, page, 9);

  const [applications, jobs] = await Promise.all([
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate({
        path: "jobId",
        select: "title slug salaryMin salaryMax position workingForm",
      })
      .populate({
        path: "candidateId",
        select: "fullName email phone avatar",
      })
      .lean(),
    Job.find({ employerId: req.user._id, deletedAt: null })
      .select("title _id")
      .lean(),
  ]);

  res.render("pages/manage-CV", {
    title: "Quản lý CV (Nhà tuyển dụng)",
    applications,
    jobs,
    pagination,
    filterJobId: req.query.jobId || "",
    filterStatus: req.query.status || "",
  });
};

const renderCvDetails = async (req, res) => {
  const application = await Application.findOne({
    _id: req.params.id,
    employerId: req.user._id,
    hiddenByEmployer: false,
  })
    .populate({
      path: "jobId",
      select: "title slug salaryMin salaryMax position workingForm skills city address description",
    })
    .populate({
      path: "candidateId",
      select: "fullName email phone avatar",
    });

  if (!application) {
    req.flash("error", "Không tìm thấy hồ sơ CV yêu cầu.");
    return res.redirect("/employer/cvs");
  }

  // Đánh dấu đã xem nếu chưa xem
  if (!application.viewed) {
    application.viewed = true;
    await application.save();
  }

  res.render("pages/CV-details", {
    title: `Chi tiết CV - ${application.fullName}`,
    application: application.toObject(),
  });
};

const postCvStatus = async (req, res) => {
  const { status, rejectionReason, rejectionNote, sendEmail } = req.body;
  if (!Object.values(APPLICATION_STATUS).includes(status)) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(400).json({ success: false, message: "Trạng thái tuyển dụng không hợp lệ." });
    }
    req.flash("error", "Trạng thái duyệt không hợp lệ.");
    return res.redirect(req.headers.referer || "/employer/cvs");
  }

  const application = await Application.findOne({
    _id: req.params.id,
    employerId: req.user._id,
    hiddenByEmployer: false,
  }).populate("jobId", "title slug");

  if (!application) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ CV yêu cầu." });
    }
    req.flash("error", "Không tìm thấy hồ sơ CV yêu cầu.");
    return res.redirect("/employer/cvs");
  }

  application.status = status;
  application.reviewedAt = new Date();

  if (status === APPLICATION_STATUS.REJECTED) {
    application.rejectionReason = rejectionReason ? rejectionReason.trim() : (application.rejectionReason || "Chưa phù hợp với yêu cầu vị trí tại thời điểm này");
    application.rejectionNote = rejectionNote ? sanitizeHtml(rejectionNote.trim()) : "";
    application.rejectedAt = new Date();

    const shouldSendEmail = sendEmail === "true" || sendEmail === "on" || sendEmail === true;
    if (shouldSendEmail && application.email) {
      try {
        await sendRejectionEmail({
          toEmail: application.email,
          candidateName: application.fullName,
          companyName: req.user.companyName || "Nhà tuyển dụng",
          jobTitle: application.jobId ? application.jobId.title : "Vị trí tuyển dụng",
          reason: application.rejectionReason,
          note: application.rejectionNote,
          replyTo: req.user.email,
        });
      } catch (err) {
        console.error("Lỗi khi gửi email từ chối:", err.message);
      }
    }
  } else {
    application.rejectionReason = "";
    application.rejectionNote = "";
    application.rejectedAt = null;
  }

  await application.save();

  const { APPLICATION_STATUS_LABELS } = require("../../config/constants");
  const statusLabel = APPLICATION_STATUS_LABELS[status] || status;

  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.json({
      success: true,
      status: application.status,
      statusLabel,
      message: `Đã chuyển ứng viên sang vòng: ${statusLabel}.`,
    });
  }

  req.flash("success", `Cập nhật trạng thái hồ sơ thành công: ${statusLabel}.`);
  res.redirect(req.headers.referer || `/employer/cvs/${application._id}`);
};

/**
 * Hiển thị Bảng Kanban Quản lý Ứng viên nhiều vòng (Hiring Pipeline ATS)
 */
const renderHiringPipeline = async (req, res) => {
  const filter = {
    employerId: req.user._id,
    hiddenByEmployer: false,
  };

  if (req.query.jobId) {
    filter.jobId = req.query.jobId;
  }

  if (req.query.keyword) {
    const kw = req.query.keyword.trim();
    filter.$or = [
      { fullName: { $regex: kw, $options: "i" } },
      { email: { $regex: kw, $options: "i" } },
      { phone: { $regex: kw, $options: "i" } },
    ];
  }

  const [applications, jobs] = await Promise.all([
    Application.find(filter)
      .sort({ updatedAt: -1 })
      .populate({
        path: "jobId",
        select: "title slug salaryMin salaryMax position workingForm skills",
      })
      .populate({
        path: "candidateId",
        select: "fullName email phone avatar itProfile",
      })
      .lean(),
    Job.find({ employerId: req.user._id, deletedAt: null })
      .select("title _id")
      .lean(),
  ]);

  // Phân chia hồ sơ thành 6 giai đoạn Kanban
  const pipeline = {
    pending: [],
    approved: [],
    interviewing: [],
    offered: [],
    hired: [],
    rejected: [],
  };

  applications.forEach((app) => {
    const st = app.status || "pending";
    if (pipeline[st]) {
      pipeline[st].push(app);
    } else {
      pipeline.pending.push(app);
    }
  });

  const counts = {
    total: applications.length,
    pending: pipeline.pending.length,
    approved: pipeline.approved.length,
    interviewing: pipeline.interviewing.length,
    offered: pipeline.offered.length,
    hired: pipeline.hired.length,
    rejected: pipeline.rejected.length,
  };

  res.render("pages/employer-pipeline", {
    title: "Hiring Pipeline - Quản lý Ứng viên Theo Vòng Tuyển Dụng | VN.ITJobs",
    pipeline,
    counts,
    jobs,
    filterJobId: req.query.jobId || "",
    filterKeyword: req.query.keyword || "",
  });
};

const postDeleteCv = async (req, res) => {
  const application = await Application.findOne({
    _id: req.params.id,
    employerId: req.user._id,
  });

  if (!application) {
    req.flash("error", "Không tìm thấy hồ sơ CV để xóa.");
    return res.redirect("/employer/cvs");
  }

  application.hiddenByEmployer = true;

  // Khi cả hai phía cùng ẩn thì xóa vĩnh viễn bản ghi và file PDF
  if (application.hiddenByCandidate === true) {
    if (application.cv && application.cv.key) {
      deleteCV(application.cv.key);
    }
    await Application.findByIdAndDelete(application._id);
  } else {
    await application.save();
  }

  req.flash("success", "Đã xóa hồ sơ CV khỏi danh sách quản lý.");
  res.redirect("/employer/cvs");
};

const postSendInterviewInvite = async (req, res) => {
  const { subject, content, interviewDate, location } = req.body;
  const application = await Application.findOne({
    _id: req.params.id,
    employerId: req.user._id,
    hiddenByEmployer: false,
  }).populate("jobId", "title slug");

  if (!application) {
    req.flash("error", "Không tìm thấy hồ sơ CV yêu cầu.");
    return res.redirect("/employer/cvs");
  }

  if (!content || !content.trim()) {
    req.flash("error", "Nội dung thư mời phỏng vấn không được để trống.");
    return res.redirect(`/employer/cvs/${application._id}`);
  }

  // Cập nhật trạng thái duyệt nếu đang chờ
  if (application.status === APPLICATION_STATUS.PENDING) {
    application.status = APPLICATION_STATUS.APPROVED;
    application.reviewedAt = new Date();
  }

  application.interviewInvitation = {
    sentAt: new Date(),
    subject: subject ? subject.trim() : `[Thư Mời Phỏng Vấn] ${application.jobId ? application.jobId.title : ""}`,
    content: sanitizeHtml(content.trim()),
    employerEmail: req.user.email || "",
    employerPhone: req.user.phone || "",
    interviewDate: interviewDate ? interviewDate.trim() : "",
    location: location ? location.trim() : "",
  };

  await application.save();

  // Gửi email đến ứng viên
  try {
    await sendInterviewInvitationEmail({
      toEmail: application.email,
      candidateName: application.fullName,
      companyName: req.user.companyName || "Nhà tuyển dụng",
      jobTitle: application.jobId ? application.jobId.title : "Vị trí tuyển dụng",
      subject: application.interviewInvitation.subject,
      content: application.interviewInvitation.content,
      interviewDate: application.interviewInvitation.interviewDate,
      location: application.interviewInvitation.location,
      replyTo: req.user.email,
      contactPhone: req.user.phone,
    });
  } catch (err) {
    console.error("Lỗi khi gửi email thư mời:", err.message);
  }

  req.flash("success", `Đã gửi thư mời phỏng vấn thành công đến ứng viên (${application.email})!`);
  res.redirect(`/employer/cvs/${application._id}`);
};

const postAiDraftInterviewInvite = async (req, res) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      employerId: req.user._id,
      hiddenByEmployer: false,
    }).populate("jobId", "title");

    if (!application) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ." });
    }

    const { interviewType, interviewDate, location, notes } = req.body || {};
    const draft = await draftInterviewInvitation({
      candidateName: application.fullName,
      jobTitle: application.jobId ? application.jobId.title : "Lập trình viên",
      companyName: req.user.companyName || "Công ty",
      interviewType: interviewType || "Trực tiếp / Trực tuyến",
      interviewDate: interviewDate || "",
      location: location || "",
      notes: notes || "",
    });

    return res.json({ success: true, ...draft });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Lỗi tạo thư mời bằng AI: " + err.message });
  }
};

const postAiDraftRejection = async (req, res) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      employerId: req.user._id,
      hiddenByEmployer: false,
    }).populate("jobId", "title");

    if (!application) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ." });
    }

    const { reasonType, customNote } = req.body || {};
    const draft = await draftRejectionLetter({
      candidateName: application.fullName,
      jobTitle: application.jobId ? application.jobId.title : "Lập trình viên IT",
      companyName: req.user.companyName || "Nhà tuyển dụng",
      reasonType: reasonType || "Chưa đáp ứng đủ số năm kinh nghiệm theo yêu cầu",
      customNote: customNote || "",
    });

    return res.json({ success: true, ...draft });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Lỗi tạo lời nhắn từ chối: " + err.message });
  }
};

const streamEmployerCvPdf = async (req, res) => {
  const application = await Application.findOne({
    _id: req.params.id,
    employerId: req.user._id,
    hiddenByEmployer: false,
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

/**
 * Thêm ghi chú nội bộ cho hồ sơ ứng viên (HR Private Notes)
 */
const postAddInternalNote = async (req, res) => {
  const { content, author } = req.body;
  if (!content || !content.trim()) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(400).json({ success: false, message: "Nội dung ghi chú không được để trống." });
    }
    req.flash("error", "Nội dung ghi chú không được để trống.");
    return res.redirect(`/employer/cvs/${req.params.id}`);
  }

  const application = await Application.findOne({
    _id: req.params.id,
    employerId: req.user._id,
    hiddenByEmployer: false,
  });

  if (!application) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ CV." });
    }
    req.flash("error", "Không tìm thấy hồ sơ CV.");
    return res.redirect("/employer/cvs");
  }

  const newNote = {
    author: author ? author.trim() : (req.user.companyName || "HR Recruiter"),
    content: content.trim(),
    createdAt: new Date(),
  };

  application.internalNotes.push(newNote);
  await application.save();

  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.json({ success: true, message: "Đã thêm ghi chú nội bộ.", note: newNote });
  }

  req.flash("success", "Đã thêm ghi chú nội bộ thành công.");
  res.redirect(`/employer/cvs/${application._id}`);
};

/**
 * Chấm điểm đánh giá ứng viên (Scorecard 1 - 5 sao)
 */
const postUpdateRating = async (req, res) => {
  const rating = parseInt(req.body.rating, 10);
  if (isNaN(rating) || rating < 0 || rating > 5) {
    return res.status(400).json({ success: false, message: "Điểm đánh giá phải từ 0 đến 5 sao." });
  }

  const application = await Application.findOneAndUpdate(
    { _id: req.params.id, employerId: req.user._id, hiddenByEmployer: false },
    { rating },
    { new: true }
  );

  if (!application) {
    return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ CV." });
  }

  return res.json({ success: true, rating: application.rating, message: `Đã cập nhật đánh giá ${rating} sao.` });
};

/**
 * Thiết lập Lịch phỏng vấn thông minh & Đồng bộ iCalendar (.ics)
 */
const postScheduleInterview = async (req, res) => {
  const {
    scheduledDate,
    scheduledTime,
    durationMinutes,
    locationType,
    meetingLink,
    locationAddress,
    interviewers,
    notes,
  } = req.body;

  const application = await Application.findOne({
    _id: req.params.id,
    employerId: req.user._id,
    hiddenByEmployer: false,
  }).populate("jobId", "title slug");

  if (!application) {
    req.flash("error", "Không tìm thấy hồ sơ ứng viên.");
    return res.redirect("/employer/cvs");
  }

  if (!scheduledDate || !scheduledTime) {
    req.flash("error", "Vui lòng chọn ngày và giờ phỏng vấn.");
    return res.redirect(`/employer/cvs/${application._id}`);
  }

  // Kết hợp ngày và giờ
  const [hours, minutes] = scheduledTime.split(":").map(Number);
  const scheduledAt = new Date(scheduledDate);
  scheduledAt.setHours(hours || 9, minutes || 0, 0, 0);

  const duration = parseInt(durationMinutes, 10) || 60;
  const isOnline = locationType === "online";
  const finalLocation = isOnline
    ? (meetingLink ? `Google Meet / Zoom: ${meetingLink.trim()}` : "Online Meeting")
    : (locationAddress ? locationAddress.trim() : (req.user.address || "Văn phòng công ty"));

  application.interviewSchedule = {
    scheduledAt,
    durationMinutes: duration,
    locationType: isOnline ? "online" : "offline",
    meetingLink: meetingLink ? meetingLink.trim() : "",
    locationAddress: locationAddress ? locationAddress.trim() : "",
    interviewers: interviewers ? interviewers.trim() : (req.user.companyName || "Hội đồng tuyển dụng"),
    notes: notes ? notes.trim() : "",
    status: "pending",
    candidateResponse: { status: "", note: "", respondedAt: null },
  };

  application.status = APPLICATION_STATUS.INTERVIEWING;
  application.reviewedAt = new Date();
  await application.save();

  // Tạo file iCalendar .ics
  const { generateIcsEvent } = require("../../utils/calendar");
  const jobTitle = application.jobId ? application.jobId.title : "Vị trí tuyển dụng";
  const icsString = generateIcsEvent({
    title: `Phỏng vấn vị trí ${jobTitle} - ${req.user.companyName}`,
    description: `Buổi phỏng vấn giữa ${req.user.companyName} và ứng viên ${application.fullName}.\nNgười phỏng vấn: ${application.interviewSchedule.interviewers}\nGhi chú: ${notes || "Đúng giờ và chuẩn bị CV"}`,
    location: finalLocation,
    startDate: scheduledAt,
    durationMinutes: duration,
    organizerName: req.user.companyName,
    organizerEmail: req.user.email,
    attendeeName: application.fullName,
    attendeeEmail: application.email,
    meetingUrl: meetingLink,
  });

  // Gửi email kèm file lịch .ics
  try {
    await sendInterviewInvitationEmail({
      toEmail: application.email,
      candidateName: application.fullName,
      companyName: req.user.companyName || "Nhà tuyển dụng",
      jobTitle,
      subject: `[Lịch Phỏng Vấn] ${jobTitle} - ${req.user.companyName}`,
      content: `Kính mời bạn tham gia buổi phỏng vấn được xếp lịch cụ thể như sau:\n- Thời gian: ${scheduledAt.toLocaleString("vi-VN")}\n- Thời lượng dự kiến: ${duration} phút\n- Hình thức: ${isOnline ? "Phỏng vấn Online" : "Trực tiếp tại văn phòng"}\n- Địa điểm / Đường dẫn: ${finalLocation}\n- Người phỏng vấn: ${application.interviewSchedule.interviewers}\n- Ghi chú: ${notes || "Không có"}\n\nFile lịch đính kèm có thể được thêm trực tiếp vào Google Calendar hoặc Outlook của bạn. Vui lòng xác nhận tham gia trên hệ thống!`,
      interviewDate: `${scheduledAt.toLocaleString("vi-VN")} (${duration} phút)`,
      location: finalLocation,
      replyTo: req.user.email,
      contactPhone: req.user.phone,
      icsContent: icsString,
    });
  } catch (err) {
    console.error("Lỗi gửi email lịch phỏng vấn:", err.message);
  }

  // Gửi thông báo In-App cho ứng viên
  const { createNotification } = require("../../services/notification.service");
  createNotification({
    recipientId: application.candidateId,
    recipientType: "candidate",
    title: "Lịch phỏng vấn mới được thiết lập!",
    message: `${req.user.companyName} đã lên lịch phỏng vấn lúc ${scheduledAt.toLocaleString("vi-VN")}. Hãy bấm vào để xác nhận tham gia!`,
    link: "/candidate/applied-jobs",
    type: "interview_schedule",
  }).catch(() => {});

  req.flash("success", `Đã lên lịch phỏng vấn và gửi file sự kiện Calendar tới ứng viên (${application.email})!`);
  res.redirect(`/employer/cvs/${application._id}`);
};

module.exports = {
  renderManageCv,
  renderHiringPipeline,
  renderCvDetails,
  postCvStatus,
  postDeleteCv,
  postSendInterviewInvite,
  postAiDraftInterviewInvite,
  postAiDraftRejection,
  streamEmployerCvPdf,
  postAddInternalNote,
  postUpdateRating,
  postScheduleInterview,
};
