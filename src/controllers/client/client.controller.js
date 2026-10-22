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
const { CITIES, POSITIONS, WORKING_FORMS, JOB_MODERATION } = require("../../config/constants");
const { Skill, Job, Application } = require("../../models");
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

  res.render("pages/company-details", {
    title: `${data.company.companyName} - VN.ITJobs`,
    company: data.company,
    jobs: data.jobs,
  });
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
  renderJobDetails,
  postApplyJob,
  getSearchSuggestions,
};
