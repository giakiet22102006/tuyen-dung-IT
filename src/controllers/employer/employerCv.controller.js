// src/controllers/employer/employerCv.controller.js
const { Application, Job } = require("../../models");
const { APPLICATION_STATUS, APPLICATION_STATUS_LABELS } = require("../../config/constants");
const { getCVPath, deleteCV, ensureCVBuffer, setPdfInlineHeaders } = require("../../services/storage.service");
const { sendInterviewInvitationEmail, sendRejectionEmail } = require("../../services/mail.service");
const { draftInterviewInvitation, draftRejectionLetter } = require("../../services/ai.service");
const { createNotification } = require("../../services/notification.service");
const { generateIcsEvent } = require("../../utils/calendar");
const sanitizeHtml = require("../../utils/sanitizeHtml");
const paginate = require("../../utils/pagination");
const env = require("../../config/env");
const { escapeRegex, isValidObjectId, safeUrl, getSafeBackRedirect } = require("../../utils/securityHelpers");

const VN_TIMEZONE = "Asia/Ho_Chi_Minh";
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function wantsJson(req) {
  return Boolean(req.xhr || req.headers.accept?.includes("application/json"));
}

/**
 * Danh tính người thao tác: Chuyên viên (teamMember) đang đăng nhập hoặc Chủ công ty.
 * Không bao giờ tin `req.body.author` để tránh giả mạo người ghi chú / người gửi thư.
 */
function getActorIdentity(req) {
  const member = req.user && req.user.currentMember;
  const companyName = (req.user && req.user.companyName) || "Nhà tuyển dụng";
  if (member) {
    return {
      name: member.fullName || "HR Recruiter",
      email: member.email || req.user.email || "",
      displayName: `${member.fullName || "HR Recruiter"} (${companyName})`,
      isMember: true,
      companyName,
    };
  }
  return {
    name: companyName,
    email: (req.user && req.user.email) || "",
    displayName: companyName,
    isMember: false,
    companyName,
  };
}

/**
 * Parse ngày/giờ phỏng vấn theo múi giờ Việt Nam (+07:00), độc lập với TZ của server (Vercel = UTC).
 * Trả về null nếu sai định dạng hoặc ngày không tồn tại (VD: 2026-02-31 bị JS tự cuộn sang tháng 3).
 */
function parseVietnamDateTime(dateStr, timeStr) {
  if (typeof dateStr !== "string" || typeof timeStr !== "string") return null;
  const d = dateStr.trim();
  const t = timeStr.trim();
  if (!DATE_REGEX.test(d) || !TIME_REGEX.test(t)) return null;
  const [hh, mm] = t.split(":");
  const result = new Date(`${d}T${hh}:${mm}:00+07:00`);
  if (Number.isNaN(result.getTime())) return null;
  // Round-trip: ngày theo giờ VN phải trùng khớp chuỗi nhập vào
  const vnDate = new Date(result.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
  if (vnDate !== d) return null;
  return result;
}

/**
 * Tách Date thành { date: "YYYY-MM-DD", time: "HH:mm" } theo giờ Việt Nam (dùng pre-fill form)
 */
function toVietnamParts(dateValue) {
  if (!dateValue) return { date: "", time: "" };
  const dt = new Date(dateValue);
  if (Number.isNaN(dt.getTime())) return { date: "", time: "" };
  const iso = new Date(dt.getTime() + VN_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

function formatVietnamDateTime(dateValue) {
  return new Date(dateValue).toLocaleString("vi-VN", { timeZone: VN_TIMEZONE });
}

/**
 * Sinh nội dung iCalendar (.ics) cho lịch phỏng vấn đã lưu (dùng chung cho email & nút tải trực tiếp)
 */
function buildInterviewIcs(application, actor) {
  const schedule = application.interviewSchedule || {};
  const jobTitle = application.jobId && application.jobId.title ? application.jobId.title : "Vị trí tuyển dụng";
  const isOnline = schedule.locationType === "online";
  const cleanMeetingLink = isOnline ? safeUrl(schedule.meetingLink) : "";
  const finalLocation = isOnline
    ? (cleanMeetingLink ? `Google Meet / Zoom: ${cleanMeetingLink}` : "Online Meeting")
    : (schedule.locationAddress || "Văn phòng công ty");

  return generateIcsEvent({
    title: `Phỏng vấn vị trí ${jobTitle} - ${actor.companyName}`,
    description: `Buổi phỏng vấn giữa ${actor.companyName} và ứng viên ${application.fullName}.\nNgười phỏng vấn: ${schedule.interviewers || actor.name}\nGhi chú: ${schedule.notes || "Đúng giờ và chuẩn bị CV"}`,
    location: finalLocation,
    startDate: schedule.scheduledAt,
    durationMinutes: schedule.durationMinutes || 60,
    organizerName: actor.displayName,
    organizerEmail: actor.email,
    attendeeName: application.fullName,
    attendeeEmail: application.email,
    meetingUrl: cleanMeetingLink,
  });
}

const renderManageCv = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const filter = {
    employerId: req.user._id,
    hiddenByEmployer: false,
  };

  // Lọc theo Job nếu có (validate ObjectId chặt chẽ)
  const filterJobId = isValidObjectId(req.query.jobId) ? req.query.jobId : "";
  if (filterJobId) {
    filter.jobId = filterJobId;
  }

  // Lọc theo trạng thái nếu có
  const filterStatus =
    typeof req.query.status === "string" && Object.values(APPLICATION_STATUS).includes(req.query.status)
      ? req.query.status
      : "";
  if (filterStatus) {
    filter.status = filterStatus;
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
    filterJobId,
    filterStatus,
    statusOptions: Object.values(APPLICATION_STATUS),
    statusLabels: APPLICATION_STATUS_LABELS,
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

  // Kiểm tra file PDF tồn tại (ổ đĩa/tmp hoặc khôi phục từ MongoDB sau cold start Vercel)
  const cvKey = application.cv && application.cv.key;
  const cvExists = Boolean(cvKey) && (Boolean(getCVPath(cvKey)) || Boolean(await ensureCVBuffer(cvKey)));

  const schedule = application.interviewSchedule || {};
  const schedulePrefill = toVietnamParts(schedule.scheduledAt);

  res.render("pages/CV-details", {
    title: `Chi tiết CV - ${application.fullName}`,
    application: application.toObject(),
    cvExists,
    statusOptions: Object.values(APPLICATION_STATUS),
    statusLabels: APPLICATION_STATUS_LABELS,
    todayVN: toVietnamParts(new Date()).date,
    schedulePrefill,
  });
};

const postCvStatus = async (req, res) => {
  const { status, rejectionReason, rejectionNote, sendEmail } = req.body;
  if (!Object.values(APPLICATION_STATUS).includes(status)) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(400).json({ success: false, message: "Trạng thái tuyển dụng không hợp lệ." });
    }
    req.flash("error", "Trạng thái duyệt không hợp lệ.");
    return res.redirect(getSafeBackRedirect(req, "/employer/cvs"));
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

  const previousStatus = application.status;
  const actor = getActorIdentity(req);
  application.status = status;
  application.reviewedAt = new Date();

  if (status === APPLICATION_STATUS.REJECTED) {
    application.rejectionReason = typeof rejectionReason === "string" && rejectionReason.trim()
      ? rejectionReason.trim().slice(0, 500)
      : (application.rejectionReason || "Chưa phù hợp với yêu cầu vị trí tại thời điểm này");
    application.rejectionNote = typeof rejectionNote === "string" && rejectionNote.trim()
      ? sanitizeHtml(rejectionNote.trim().slice(0, 5000))
      : "";
    application.rejectedAt = new Date();

    const shouldSendEmail = sendEmail === "true" || sendEmail === "on" || sendEmail === true;
    if (shouldSendEmail && application.email) {
      try {
        await sendRejectionEmail({
          toEmail: application.email,
          candidateName: application.fullName,
          companyName: actor.companyName,
          jobTitle: application.jobId ? application.jobId.title : "Vị trí tuyển dụng",
          reason: application.rejectionReason,
          note: application.rejectionNote,
          replyTo: actor.email,
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

  const statusLabel = APPLICATION_STATUS_LABELS[status] || status;

  // Thông báo chuông cho ứng viên khi hồ sơ chuyển vòng (chạy nền, không chặn response)
  if (application.candidateId && previousStatus !== status) {
    createNotification({
      recipientId: application.candidateId,
      recipientType: "candidate",
      title: `Hồ sơ ứng tuyển được cập nhật: ${statusLabel}`,
      message: `${actor.companyName} đã chuyển hồ sơ của bạn cho vị trí "${application.jobId ? application.jobId.title : "Vị trí tuyển dụng"}" sang vòng: ${statusLabel}.`,
      link: "/candidate/applied-jobs",
      type: "status_change",
    }).catch(() => {});
  }

  if (wantsJson(req)) {
    return res.json({
      success: true,
      status: application.status,
      statusLabel,
      message: `Đã chuyển ứng viên sang vòng: ${statusLabel}.`,
    });
  }

  req.flash("success", `Cập nhật trạng thái hồ sơ thành công: ${statusLabel}.`);
  res.redirect(getSafeBackRedirect(req, `/employer/cvs/${application._id}`));
};

/**
 * Hiển thị Bảng Kanban Quản lý Ứng viên nhiều vòng (Hiring Pipeline ATS)
 */
const renderHiringPipeline = async (req, res) => {
  const filter = {
    employerId: req.user._id,
    hiddenByEmployer: false,
  };

  if (isValidObjectId(req.query.jobId)) {
    filter.jobId = req.query.jobId;
  }

  if (typeof req.query.keyword === "string" && req.query.keyword.trim()) {
    const kw = escapeRegex(req.query.keyword);
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

  if (typeof content !== "string" || !content.trim()) {
    req.flash("error", "Nội dung thư mời phỏng vấn không được để trống.");
    return res.redirect(`/employer/cvs/${application._id}`);
  }

  // Cập nhật trạng thái duyệt nếu đang chờ
  if (application.status === APPLICATION_STATUS.PENDING) {
    application.status = APPLICATION_STATUS.APPROVED;
    application.reviewedAt = new Date();
  }

  const actor = getActorIdentity(req);
  application.interviewInvitation = {
    sentAt: new Date(),
    subject: typeof subject === "string" && subject.trim() ? subject.trim().slice(0, 300) : `[Thư Mời Phỏng Vấn] ${application.jobId ? application.jobId.title : ""}`,
    content: sanitizeHtml(content.trim()),
    employerEmail: actor.email,
    employerPhone: req.user.phone || "",
    interviewDate: typeof interviewDate === "string" ? interviewDate.trim().slice(0, 200) : "",
    location: typeof location === "string" ? location.trim().slice(0, 300) : "",
  };

  await application.save();

  // Gửi email đến ứng viên
  try {
    await sendInterviewInvitationEmail({
      toEmail: application.email,
      candidateName: application.fullName,
      companyName: actor.companyName,
      jobTitle: application.jobId ? application.jobId.title : "Vị trí tuyển dụng",
      subject: application.interviewInvitation.subject,
      content: application.interviewInvitation.content,
      interviewDate: application.interviewInvitation.interviewDate,
      location: application.interviewInvitation.location,
      replyTo: actor.email,
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
    const msg = env.NODE_ENV === "production" ? "Lỗi tạo thư mời bằng AI. Vui lòng thử lại." : "Lỗi tạo thư mời bằng AI: " + err.message;
    return res.status(500).json({ success: false, message: msg });
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
    const msg = env.NODE_ENV === "production" ? "Lỗi tạo lời nhắn từ chối. Vui lòng thử lại." : "Lỗi tạo lời nhắn từ chối: " + err.message;
    return res.status(500).json({ success: false, message: msg });
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

  // Đọc Buffer an toàn: ổ đĩa/tmp → fallback MongoDB StoredFile (sống sót qua cold start Vercel)
  const buffer = await ensureCVBuffer(application.cv.key);
  if (!buffer) {
    return res.status(404).send("File CV không tồn tại trên hệ thống lưu trữ.");
  }

  // Ghi đè X-Frame-Options/CSP frame-ancestors = 'self' để <iframe> cùng origin hiển thị được PDF
  setPdfInlineHeaders(res, application.cv.originalName || "CV.pdf");
  // CV là dữ liệu cá nhân nhạy cảm: không cho proxy/browser cache lại
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Length", buffer.length);
  return res.end(buffer);
};

/**
 * Thêm ghi chú nội bộ cho hồ sơ ứng viên (HR Private Notes)
 * Tác giả luôn lấy từ phiên đăng nhập (teamMember hoặc Chủ công ty) — không tin req.body.author
 */
const postAddInternalNote = async (req, res) => {
  const { content } = req.body;
  if (typeof content !== "string" || !content.trim()) {
    if (wantsJson(req)) {
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
    if (wantsJson(req)) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ CV." });
    }
    req.flash("error", "Không tìm thấy hồ sơ CV.");
    return res.redirect("/employer/cvs");
  }

  const actor = getActorIdentity(req);
  const newNote = {
    author: actor.isMember ? actor.name : actor.companyName,
    content: content.trim().slice(0, 3000),
    createdAt: new Date(),
  };

  application.internalNotes.push(newNote);
  await application.save();

  if (wantsJson(req)) {
    return res.json({ success: true, message: "Đã thêm ghi chú nội bộ.", note: newNote });
  }

  req.flash("success", "Đã thêm ghi chú nội bộ thành công.");
  res.redirect(`/employer/cvs/${application._id}`);
};

/**
 * Chấm điểm đánh giá ứng viên (Scorecard 1 - 5 sao)
 */
const postUpdateRating = async (req, res) => {
  const raw = req.body ? req.body.rating : undefined;
  const rating = typeof raw === "number" ? raw : parseInt(raw, 10);
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
    return res.status(400).json({ success: false, message: "Điểm đánh giá phải là số nguyên từ 0 đến 5 sao." });
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
 * Ngày/giờ luôn được hiểu theo giờ Việt Nam (+07:00) bất kể TZ của máy chủ
 */
const postScheduleInterview = async (req, res) => {
  const body = req.body || {};
  const dateStr = body.scheduledDate || body.interviewDate;
  const timeStr = body.scheduledTime || body.interviewTime;
  const { durationMinutes, locationType, meetingLink, locationAddress, interviewers, notes } = body;

  const application = await Application.findOne({
    _id: req.params.id,
    employerId: req.user._id,
    hiddenByEmployer: false,
  }).populate("jobId", "title slug");

  if (!application) {
    req.flash("error", "Không tìm thấy hồ sơ ứng viên.");
    return res.redirect("/employer/cvs");
  }

  if (!dateStr || !timeStr) {
    req.flash("error", "Vui lòng chọn ngày và giờ phỏng vấn.");
    return res.redirect(`/employer/cvs/${application._id}`);
  }

  const scheduledAt = parseVietnamDateTime(dateStr, timeStr);
  if (!scheduledAt) {
    req.flash("error", "Ngày (YYYY-MM-DD) hoặc giờ phỏng vấn (HH:mm) không hợp lệ.");
    return res.redirect(`/employer/cvs/${application._id}`);
  }

  // Không cho đặt lịch ở quá khứ (cho phép trễ 5 phút do độ trễ thao tác)
  if (scheduledAt.getTime() < Date.now() - 5 * 60 * 1000) {
    req.flash("error", "Không thể đặt lịch phỏng vấn ở thời điểm đã qua.");
    return res.redirect(`/employer/cvs/${application._id}`);
  }

  const parsedDuration = parseInt(durationMinutes, 10);
  const duration = Number.isInteger(parsedDuration) && parsedDuration >= 15 && parsedDuration <= 480 ? parsedDuration : 60;
  const isOnline = locationType === "online";
  // Phỏng vấn Offline: xóa sạch meetingLink cũ để không gửi nhầm link phòng họp
  const cleanMeetingLink = isOnline ? safeUrl(typeof meetingLink === "string" ? meetingLink.trim() : "") : "";
  const cleanAddress = !isOnline && typeof locationAddress === "string" ? locationAddress.trim().slice(0, 300) : "";
  const actor = getActorIdentity(req);
  const finalLocation = isOnline
    ? (cleanMeetingLink ? `Google Meet / Zoom: ${cleanMeetingLink}` : "Online Meeting")
    : (cleanAddress || req.user.address || "Văn phòng công ty");

  application.interviewSchedule = {
    scheduledAt,
    durationMinutes: duration,
    locationType: isOnline ? "online" : "offline",
    meetingLink: cleanMeetingLink,
    locationAddress: isOnline ? "" : (cleanAddress || req.user.address || ""),
    interviewers: typeof interviewers === "string" && interviewers.trim() ? interviewers.trim().slice(0, 300) : actor.name,
    notes: typeof notes === "string" ? notes.trim().slice(0, 2000) : "",
    status: "pending",
    candidateResponse: { status: "", note: "", respondedAt: null },
  };

  application.status = APPLICATION_STATUS.INTERVIEWING;
  application.reviewedAt = new Date();
  application.rejectionReason = "";
  application.rejectionNote = "";
  application.rejectedAt = null;
  await application.save();

  const jobTitle = application.jobId ? application.jobId.title : "Vị trí tuyển dụng";
  const icsString = buildInterviewIcs(application, actor);
  const timeLabel = formatVietnamDateTime(scheduledAt);
  const notesText = application.interviewSchedule.notes;

  // Gửi email kèm file lịch .ics
  try {
    await sendInterviewInvitationEmail({
      toEmail: application.email,
      candidateName: application.fullName,
      companyName: actor.companyName,
      jobTitle,
      subject: `[Lịch Phỏng Vấn] ${jobTitle} - ${actor.companyName}`,
      content: `Kính mời bạn tham gia buổi phỏng vấn được xếp lịch cụ thể như sau:\n- Thời gian: ${timeLabel} (giờ Việt Nam)\n- Thời lượng dự kiến: ${duration} phút\n- Hình thức: ${isOnline ? "Phỏng vấn Online" : "Trực tiếp tại văn phòng"}\n- Địa điểm / Đường dẫn: ${finalLocation}\n- Người phỏng vấn: ${application.interviewSchedule.interviewers}\n- Ghi chú: ${notesText || "Không có"}\n\nFile lịch đính kèm có thể được thêm trực tiếp vào Google Calendar hoặc Outlook của bạn. Vui lòng xác nhận tham gia trên hệ thống!`,
      interviewDate: `${timeLabel} (${duration} phút)`,
      location: finalLocation,
      replyTo: actor.email,
      contactPhone: req.user.phone,
      icsContent: icsString,
    });
  } catch (err) {
    console.error("Lỗi gửi email lịch phỏng vấn:", err.message);
  }

  // Gửi thông báo In-App cho ứng viên
  createNotification({
    recipientId: application.candidateId,
    recipientType: "candidate",
    title: "Lịch phỏng vấn mới được thiết lập!",
    message: `${actor.companyName} đã lên lịch phỏng vấn lúc ${timeLabel}. Hãy bấm vào để xác nhận tham gia!`,
    link: "/candidate/applied-jobs",
    type: "interview_schedule",
  }).catch(() => {});

  req.flash("success", `Đã lên lịch phỏng vấn và gửi file sự kiện Calendar tới ứng viên (${application.email})!`);
  res.redirect(`/employer/cvs/${application._id}`);
};

/**
 * Tải trực tiếp file lịch phỏng vấn (.ics) cho HR từ trang chi tiết CV
 */
const downloadEmployerInterviewIcs = async (req, res) => {
  const application = await Application.findOne({
    _id: req.params.id,
    employerId: req.user._id,
    hiddenByEmployer: false,
  }).populate("jobId", "title slug");

  if (!application || !application.interviewSchedule || !application.interviewSchedule.scheduledAt) {
    if (wantsJson(req)) {
      return res.status(404).json({ success: false, message: "Hồ sơ này chưa có lịch phỏng vấn." });
    }
    req.flash("error", "Hồ sơ này chưa có lịch phỏng vấn để tải về.");
    return res.redirect(isValidObjectId(req.params.id) ? `/employer/cvs/${req.params.id}` : "/employer/cvs");
  }

  const icsString = buildInterviewIcs(application, getActorIdentity(req));
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="lich-phong-van-${application._id}.ics"`);
  res.setHeader("Cache-Control", "private, no-store");
  return res.send(icsString);
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
  downloadEmployerInterviewIcs,
  // Helpers export cho unit test
  parseVietnamDateTime,
  toVietnamParts,
  getActorIdentity,
};
