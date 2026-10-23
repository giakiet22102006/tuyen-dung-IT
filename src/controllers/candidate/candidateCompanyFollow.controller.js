// src/controllers/candidate/candidateCompanyFollow.controller.js
const { CompanyFollow, Employer, Job } = require("../../models");
const { JOB_MODERATION, EMPLOYER_STATUS } = require("../../config/constants");

/**
 * AJAX Toggle theo dõi / bỏ theo dõi một công ty
 */
async function postToggleFollowCompany(req, res) {
  try {
    const { id } = req.params;

    // Kiểm tra employer có tồn tại không
    const employer = await Employer.findOne({
      _id: id,
      status: EMPLOYER_STATUS.ACTIVE,
      deletedAt: null,
    });

    if (!employer) {
      return res.status(404).json({ success: false, message: "Công ty không tồn tại hoặc đã ngừng hoạt động." });
    }

    const candidateId = req.user._id;
    const existing = await CompanyFollow.findOne({ candidateId, employerId: employer._id });

    let followed = false;
    if (existing) {
      await CompanyFollow.deleteOne({ _id: existing._id });
      followed = false;
    } else {
      await CompanyFollow.create({ candidateId, employerId: employer._id });
      followed = true;
    }

    const followersCount = await CompanyFollow.countDocuments({ employerId: employer._id });

    return res.json({
      success: true,
      followed,
      followersCount,
      message: followed ? `Đã theo dõi ${employer.companyName}` : `Đã bỏ theo dõi ${employer.companyName}`,
    });
  } catch (error) {
    console.error("Lỗi toggle follow company:", error);
    return res.status(500).json({ success: false, message: "Có lỗi xảy ra, vui lòng thử lại sau." });
  }
}

/**
 * Hiển thị danh sách các công ty mà ứng viên đang theo dõi
 */
async function renderFollowedCompanies(req, res) {
  const candidateId = req.user._id;

  const follows = await CompanyFollow.find({ candidateId })
    .populate({
      path: "employerId",
      match: { status: EMPLOYER_STATUS.ACTIVE, deletedAt: null },
      select: "companyName logo city address companyModel companySize slug",
    })
    .sort({ createdAt: -1 })
    .lean();

  // Lọc ra các follow mà employer vẫn hợp lệ
  const validFollows = follows.filter((f) => f.employerId);

  // Đếm số lượng việc làm đang mở của từng công ty
  const companyIds = validFollows.map((f) => f.employerId._id);
  const jobCounts = await Job.aggregate([
    {
      $match: {
        employerId: { $in: companyIds },
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
        deletedAt: null,
      },
    },
    { $group: { _id: "$employerId", count: { $sum: 1 } } },
  ]);

  const countMap = {};
  jobCounts.forEach((jc) => {
    countMap[jc._id.toString()] = jc.count;
  });

  const companiesWithCounts = validFollows.map((f) => ({
    ...f.employerId,
    followId: f._id,
    followedAt: f.createdAt,
    activeJobsCount: countMap[f.employerId._id.toString()] || 0,
  }));

  res.render("pages/candidate-followed-companies", {
    title: "Công Ty Đang Theo Dõi | VN.ITJobs",
    companies: companiesWithCounts,
  });
}

module.exports = {
  postToggleFollowCompany,
  renderFollowedCompanies,
};
