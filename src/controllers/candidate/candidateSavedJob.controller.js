// src/controllers/candidate/candidateSavedJob.controller.js
const { SavedJob, Job } = require("../../models");
const paginate = require("../../utils/pagination");

const toggleSaveJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const candidateId = req.user._id;

    const job = await Job.findOne({ _id: jobId, deletedAt: null });
    if (!job) {
      return res.status(404).json({ success: false, message: "Công việc không tồn tại hoặc đã bị xóa." });
    }

    const existing = await SavedJob.findOne({ candidateId, jobId });
    if (existing) {
      await SavedJob.findByIdAndDelete(existing._id);
      return res.json({
        success: true,
        saved: false,
        message: "Đã bỏ lưu việc làm khỏi danh sách yêu thích.",
      });
    }

    await SavedJob.create({ candidateId, jobId });
    return res.json({
      success: true,
      saved: true,
      message: "Đã lưu việc làm vào danh sách yêu thích!",
    });
  } catch (err) {
    console.error("Lỗi toggleSaveJob:", err);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống khi lưu việc làm." });
  }
};

const renderSavedJobs = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const candidateId = req.user._id;

  const total = await SavedJob.countDocuments({ candidateId });
  const pagination = paginate(total, page, 9);

  const savedList = await SavedJob.find({ candidateId })
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .populate({
      path: "jobId",
      populate: {
        path: "employerId",
        select: "companyName slug logo city",
      },
      select: "title slug salaryMin salaryMax position workingForm skills benefits city moderation employerActive deletedAt createdAt",
    })
    .lean();

  // Lọc ra các công việc hợp lệ
  const savedJobs = savedList.map((item) => ({
    _id: item._id,
    savedAt: item.createdAt,
    job: item.jobId,
    isAvailable: item.jobId && !item.jobId.deletedAt && item.jobId.employerActive && item.jobId.moderation === "visible",
  }));

  res.render("pages/saved-jobs", {
    title: "Việc làm đã lưu (Ứng viên) - VN.ITJobs",
    savedJobs,
    pagination,
  });
};

const postRemoveSavedJob = async (req, res) => {
  const { id } = req.params;
  const candidateId = req.user._id;

  const saved = await SavedJob.findOne({ _id: id, candidateId });
  if (saved) {
    await SavedJob.findByIdAndDelete(saved._id);
    req.flash("success", "Đã xóa công việc khỏi danh sách đã lưu.");
  }

  res.redirect("/candidate/saved-jobs");
};

module.exports = {
  toggleSaveJob,
  renderSavedJobs,
  postRemoveSavedJob,
};
