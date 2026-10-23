// src/controllers/client/client.controller.js
const {
  getTotalPublicJobsCount,
  getTopEmployers,
  searchJobs,
  getCompanyList,
  getCompanyDetails,
  getJobDetails,
} = require("../../services/job.service");
const { getAutocompleteSuggestions } = require("../../services/fuzzySearch.service");
const { CITIES, POSITIONS, WORKING_FORMS, JOB_MODERATION, EMPLOYER_STATUS } = require("../../config/constants");
const { Skill, Job, Application, Review, Employer, Feedback } = require("../../models");
const { uploadCV } = require("../../services/storage.service");

const renderIndex = async (req, res) => {
  const [totalPublicJobs, topEmployers] = await Promise.all([
    getTotalPublicJobsCount(),
    getTopEmployers(9),
  ]);

  const topSkills = (res.locals.menuData && res.locals.menuData.skills) || [];

  res.render("pages/index", {
    title: "Trang chủ - VN.ITJobs",
    totalPublicJobs,
    topEmployers,
    topSkills,
    cities: CITIES,
    selectedCity: "",
    keyword: "",
  });
};

const renderSearch = async (req, res) => {
  const { city, keyword, skill, position, workingForm, company, page, exact } = req.query;

  const [searchResult, totalPublicJobs] = await Promise.all([
    searchJobs(req.query),
    getTotalPublicJobsCount(),
  ]);

  const topSkills = (res.locals.menuData && res.locals.menuData.skills) || [];

  const {
    jobs,
    pagination,
    isFuzzyApplied,
    originalKeyword,
    suggestedKeyword,
    didYouMean,
  } = searchResult;

  // Xác định tiêu đề hiển thị
  let searchTitle = `${pagination.totalItems} việc làm IT`;
  if (isFuzzyApplied) {
    searchTitle = `${pagination.totalItems} việc làm cho từ khóa gợi ý <span class="text-[#0088FF]">"${suggestedKeyword}"</span>`;
  } else if (skill) {
    searchTitle = `${pagination.totalItems} việc làm <span class="text-[#0088FF]">${skill}</span>`;
  } else if (keyword) {
    searchTitle = `${pagination.totalItems} việc làm cho từ khóa <span class="text-[#0088FF]">"${keyword}"</span>`;
  } else if (city) {
    const foundCity = CITIES.find((c) => c.value === city);
    searchTitle = `${pagination.totalItems} việc làm tại <span class="text-[#0088FF]">${foundCity ? foundCity.label : city}</span>`;
  }

  res.render("pages/search", {
    title: "Kết quả tìm kiếm - VN.ITJobs",
    searchTitle,
    jobs,
    pagination,
    totalPublicJobs,
    topSkills,
    cities: CITIES,
    positions: POSITIONS,
    workingForms: WORKING_FORMS,
    selectedCity: city || "",
    selectedPosition: position || "",
    selectedWorkingForm: workingForm || "",
    keyword: keyword || "",
    selectedSkill: skill || "",
    isFuzzyApplied: !!isFuzzyApplied,
    originalKeyword: originalKeyword || "",
    suggestedKeyword: suggestedKeyword || "",
    didYouMean: didYouMean || "",
    exact: exact === "true",
  });
};

const renderCompanyList = async (req, res) => {
  const page = req.query.page || 1;
  const { employers, pagination } = await getCompanyList(page, 9);

  res.render("pages/company-list", {
    title: "Danh sách công ty - VN.ITJobs",
    employers,
    pagination,
  });
};

const renderCompanyDetails = async (req, res) => {
  const data = await getCompanyDetails(req.params.slug);
  if (!data) {
    return res.status(404).render("pages/index", {
      title: "Không tìm thấy công ty",
      flash: { error: "Không tìm thấy thông tin công ty yêu cầu hoặc công ty đã ngừng hoạt động." },
    });
  }

  // Lấy danh sách đánh giá của công ty
  const reviews = await Review.find({
    employerId: data.company._id,
    isApproved: true,
  })
    .sort({ createdAt: -1 })
    .lean();

  const totalReviews = reviews.length;
  const avgRating =
    totalReviews > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
      : null;

  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    if (ratingCounts[r.rating] !== undefined) ratingCounts[r.rating]++;
  });

  res.render("pages/company-details", {
    title: `${data.company.companyName} - VN.ITJobs`,
    company: data.company,
    jobs: data.jobs,
    reviews,
    totalReviews,
    avgRating,
    ratingCounts,
  });
};

const postCompanyReview = async (req, res) => {
  const { slug } = req.params;
  const company = await Employer.findOne({
    slug,
    status: EMPLOYER_STATUS.ACTIVE,
    deletedAt: null,
  });

  if (!company) {
    req.flash("error", "Công ty không tồn tại.");
    return res.redirect("/companies");
  }

  if (!req.user) {
    req.flash("error", "Vui lòng đăng nhập (Ứng viên hoặc Doanh nghiệp) để gửi đánh giá.");
    return res.redirect(`/companies/${slug}`);
  }

  const { rating, title, pros, cons } = req.body;
  const numRating = Number(rating);

  if (!numRating || numRating < 1 || numRating > 5) {
    req.flash("error", "Vui lòng chọn số sao đánh giá (1 - 5 sao).");
    return res.redirect(`/companies/${slug}#review-section`);
  }

  if (!title || !title.trim()) {
    req.flash("error", "Vui lòng nhập tiêu đề đánh giá.");
    return res.redirect(`/companies/${slug}#review-section`);
  }

  let authorRole = "candidate";
  let authorName = "Thành viên VN.ITJobs";
  let authorCandidateId = null;
  let authorEmployerId = null;

  if (req.role === "employer") {
    authorRole = "employer";
    authorName = req.user.companyName || "Đối tác doanh nghiệp";
    authorEmployerId = req.user._id;
  } else if (req.role === "candidate") {
    authorRole = "candidate";
    authorName = req.user.fullName || "Ứng viên";
    authorCandidateId = req.user._id;
  }

  // Bộ lọc từ khóa nhạy cảm cơ bản
  const badWords = ["lừa đảo", "chó", "mất dạy", "đụ", "dm", "đm", "vcl"];
  const fullContent = `${title} ${pros || ""} ${cons || ""}`.toLowerCase();
  const hasToxic = badWords.some((w) => fullContent.includes(w));

  const review = new Review({
    employerId: company._id,
    authorRole,
    authorCandidateId,
    authorEmployerId,
    authorName,
    rating: numRating,
    title: title.trim(),
    pros: pros ? pros.trim() : "",
    cons: cons ? cons.trim() : "",
    isApproved: !hasToxic,
  });

  await review.save();

  if (hasToxic) {
    req.flash("success", "Đánh giá của bạn đã được ghi nhận và đang chờ quản trị viên duyệt nội dung.");
  } else {
    req.flash("success", "Cảm ơn bạn đã gửi đánh giá công ty thành công!");
  }

  res.redirect(`/companies/${slug}#review-section`);
};

const postSubmitFeedback = async (req, res) => {
  try {
    const { type, rating, title, content, url, contactEmail, contactName } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập nội dung phản hồi." });
    }

    const feedback = new Feedback({
      type: ["bug", "rating", "suggestion"].includes(type) ? type : "bug",
      rating: rating ? Number(rating) : null,
      title: title ? title.trim() : "",
      content: content.trim(),
      url: url || "",
      contactEmail: contactEmail ? contactEmail.trim() : (req.user ? req.user.email : ""),
      contactName: contactName ? contactName.trim() : (req.user ? (req.user.fullName || req.user.companyName) : ""),
      userRole: req.role || "guest",
      userId: req.user ? req.user._id : null,
      status: "new",
    });

    await feedback.save();
    return res.json({
      success: true,
      message: "Cảm ơn bạn đã gửi phản hồi / báo cáo sự cố! Ban Quản trị VN.ITJobs đã tiếp nhận.",
    });
  } catch (err) {
    console.error("Lỗi gửi feedback:", err.message);
    return res.status(500).json({ success: false, message: "Không thể gửi phản hồi: " + err.message });
  }
};

const renderJobDetails = async (req, res) => {
  const data = await getJobDetails(req.params.slug);
  if (!data) {
    return res.status(404).render("pages/index", {
      title: "Không tìm thấy việc làm",
      flash: { error: "Việc làm này không tồn tại hoặc đã ngừng tuyển dụng." },
    });
  }

  res.render("pages/job-details", {
    title: `${data.job.title} - ${data.job.employerId.companyName}`,
    job: data.job,
    company: data.job.employerId,
    companyJobCount: data.companyJobCount,
  });
};

const postApplyJob = async (req, res) => {
  const { slug } = req.params;
  const job = await Job.findOne({
    slug,
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  });

  if (!job) {
    req.flash("error", "Việc làm này không tồn tại hoặc đã ngừng tuyển dụng.");
    return res.redirect("/");
  }

  // Kiểm tra nộp trùng
  const existingApp = await Application.findOne({
    jobId: job._id,
    candidateId: req.user._id,
  });

  if (existingApp) {
    req.flash("error", "Bạn đã ứng tuyển công việc này rồi.");
    return res.redirect(`/jobs/${slug}`);
  }

  const { fullName, email, phone } = req.body;
  if (!fullName || !fullName.trim() || !email || !email.trim() || !phone || !phone.trim()) {
    req.flash("error", "Vui lòng điền đầy đủ họ tên, email và số điện thoại.");
    return res.redirect(`/jobs/${slug}`);
  }

  if (!req.file) {
    req.flash("error", "Vui lòng tải lên file CV định dạng PDF.");
    return res.redirect(`/jobs/${slug}`);
  }

  let cvData;
  try {
    cvData = await uploadCV(req.file);
  } catch (err) {
    req.flash("error", err.message || "File CV không đúng định dạng PDF hợp lệ.");
    return res.redirect(`/jobs/${slug}`);
  }

  try {
    await Application.create({
      jobId: job._id,
      employerId: job.employerId,
      candidateId: req.user._id,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      cv: {
        key: cvData.key,
        originalName: req.file.originalname || "CV.pdf",
        size: req.file.size,
      },
      viewed: false,
      status: "pending",
    });
  } catch (err) {
    if (err.code === 11000) {
      req.flash("error", "Bạn đã ứng tuyển công việc này rồi.");
      return res.redirect(`/jobs/${slug}`);
    }
    throw err;
  }

  req.flash("success", "Nộp hồ sơ ứng tuyển thành công! Nhà tuyển dụng sẽ sớm liên hệ với bạn.");
  res.redirect(`/jobs/${slug}`);
};

const getSearchSuggestions = async (req, res) => {
  const { q } = req.query;
  const data = await getAutocompleteSuggestions(q || "", 6);
  res.json(data);
};

module.exports = {
  renderIndex,
  renderSearch,
  renderCompanyList,
  renderCompanyDetails,
  postCompanyReview,
  postSubmitFeedback,
  renderJobDetails,
  postApplyJob,
  getSearchSuggestions,
};
