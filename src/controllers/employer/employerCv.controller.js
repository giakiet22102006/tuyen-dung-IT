// src/controllers/employer/employerCv.controller.js
const fs = require("fs");
const { Application, Job, Employer } = require("../../models");
const { APPLICATION_STATUS } = require("../../config/constants");
const { getCVPath, deleteCV } = require("../../services/storage.service");
const { sendInterviewInvitationEmail } = require("../../services/mail.service");
const { draftInterviewInvitation } = require("../../services/ai.service");
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
  const { status } = req.body;
  if (![APPLICATION_STATUS.APPROVED, APPLICATION_STATUS.REJECTED].includes(status)) {
    req.flash("error", "Trạng thái duyệt không hợp lệ.");
    return res.redirect(req.headers.referer || "/employer/cvs");
  }

  const application = await Application.findOne({
    _id: req.params.id,
    employerId: req.user._id,
    hiddenByEmployer: false,
  });

  if (!application) {
    req.flash("error", "Không tìm thấy hồ sơ CV yêu cầu.");
    return res.redirect("/employer/cvs");
  }

  application.status = status;
  application.reviewedAt = new Date();
  await application.save();

  const statusLabel = status === APPLICATION_STATUS.APPROVED ? "Đã duyệt phù hợp" : "Đã từ chối";
  req.flash("success", `Cập nhật trạng thái hồ sơ thành công: ${statusLabel}.`);
  res.redirect(req.headers.referer || `/employer/cvs/${application._id}`);
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
    content: content.trim(),
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

module.exports = {
  renderManageCv,
  renderCvDetails,
  postCvStatus,
  postDeleteCv,
  postSendInterviewInvite,
  postAiDraftInterviewInvite,
  streamEmployerCvPdf,
};
