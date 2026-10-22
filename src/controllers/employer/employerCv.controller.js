// src/controllers/employer/employerCv.controller.js
const fs = require("fs");
const { Application, Job } = require("../../models");
const { APPLICATION_STATUS } = require("../../config/constants");
const { getCVPath, deleteCV } = require("../../services/storage.service");
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
  streamEmployerCvPdf,
};
