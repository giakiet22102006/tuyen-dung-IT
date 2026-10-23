// src/controllers/employer/employerJob.controller.js
const { Employer, Job, Skill } = require("../../models");
const { CITIES, POSITIONS, WORKING_FORMS, BENEFITS, EMPLOYER_STATUS, JOB_MODERATION } = require("../../config/constants");
const { uploadLogo, uploadJobImage, deleteFile } = require("../../services/storage.service");
const { clearStatsCache } = require("../../services/job.service");
const { clearMenuCache } = require("../../services/menu.service");
const sanitizeHtml = require("../../utils/sanitizeHtml");
const slugify = require("../../utils/slugify");
const paginate = require("../../utils/pagination");

// 1. Hồ sơ công ty
const renderCompanyProfile = async (req, res) => {
  const company = await Employer.findById(req.user._id).lean();
  res.render("pages/company-profile", {
    title: "Thông tin công ty",
    company,
    cities: CITIES,
    errors: {},
  });
};

const postCompanyProfile = async (req, res) => {
  const company = await Employer.findById(req.user._id);
  if (!company) {
    return res.status(404).redirect("/employer/login");
  }

  const {
    companyName,
    city,
    address,
    companyModel,
    companySize,
    workingTime,
    overtime,
    description,
    phone,
  } = req.body;

  if (!companyName || !companyName.trim()) {
    return res.status(400).render("pages/company-profile", {
      title: "Thông tin công ty",
      company: { ...company.toObject(), ...req.body },
      cities: CITIES,
      errors: { companyName: "Tên công ty không được để trống" },
    });
  }

  company.companyName = companyName.trim();
  company.city = city || company.city;
  company.address = (address || "").trim();
  company.companyModel = (companyModel || "").trim();
  company.companySize = (companySize || "").trim();
  company.workingTime = (workingTime || "").trim();
  company.overtime = (overtime || "").trim();
  company.description = sanitizeHtml(description);
  company.phone = (phone || "").trim();

  // Xử lý upload Logo nếu có
  if (req.file) {
    try {
      const uploaded = await uploadLogo(req.file);
      if (uploaded) {
        if (company.logo && company.logo.key) {
          deleteFile(company.logo.key, "logos");
        }
        company.logo = uploaded;
      }
    } catch (uploadErr) {
      return res.status(400).render("pages/company-profile", {
        title: "Thông tin công ty",
        company: { ...company.toObject(), ...req.body },
        cities: CITIES,
        errors: { logo: uploadErr.message },
      });
    }
  }

  await company.save();

  // Đồng bộ bắt buộc: cập nhật lại city và address cho toàn bộ job của employer này
  await Job.updateMany(
    { employerId: company._id },
    { city: company.city, address: company.address }
  );

  clearMenuCache();
  req.flash("success", "Cập nhật hồ sơ công ty thành công!");
  res.redirect("/employer/company-profile");
};

// 2. Quản lý việc làm
const renderManageJobs = async (req, res) => {
  const page = req.query.page || 1;
  const filter = {
    employerId: req.user._id,
    deletedAt: null,
  };

  const total = await Job.countDocuments(filter);
  const pagination = paginate(total, page, 9);

  const jobs = await Job.find(filter)
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean();

  res.render("pages/manage-jobs", {
    title: "Quản lý công việc",
    jobs,
    pagination,
  });
};

// 3. Đăng tin tuyển dụng mới
const renderCreateJob = (req, res) => {
  if (req.user.status === EMPLOYER_STATUS.PENDING) {
    req.flash("error", "Tài khoản của bạn đang chờ phê duyệt. Bạn chưa thể tạo tin tuyển dụng lúc này.");
    return res.redirect("/employer/jobs");
  }

  res.render("pages/create-jobs", {
    title: "Thêm mới công việc",
    positions: POSITIONS,
    workingForms: WORKING_FORMS,
    benefitsList: BENEFITS,
    errors: {},
    old: {},
  });
};

const postCreateJob = async (req, res) => {
  if (req.user.status === EMPLOYER_STATUS.PENDING) {
    req.flash("error", "Tài khoản của bạn đang chờ phê duyệt. Bạn chưa thể tạo tin tuyển dụng lúc này.");
    return res.redirect("/employer/jobs");
  }

  const {
    title,
    salaryMin,
    salaryMax,
    position,
    workingForm,
    skills,
    description,
    benefits,
  } = req.body;

  const errors = {};
  if (!title || !title.trim()) {
    errors.title = "Tên công việc không được để trống";
  }
  if (!position) {
    errors.position = "Vui lòng chọn cấp bậc";
  }
  if (!workingForm) {
    errors.workingForm = "Vui lòng chọn hình thức làm việc";
  }

  const minVal = salaryMin && !isNaN(Number(salaryMin)) ? Number(salaryMin) : null;
  const maxVal = salaryMax && !isNaN(Number(salaryMax)) ? Number(salaryMax) : null;
  if (minVal !== null && maxVal !== null && minVal > maxVal) {
    errors.salaryMax = "Mức lương tối đa phải lớn hơn hoặc bằng mức lương tối thiểu";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).render("pages/create-jobs", {
      title: "Thêm mới công việc",
      positions: POSITIONS,
      workingForms: WORKING_FORMS,
      benefitsList: BENEFITS,
      errors,
      old: req.body,
    });
  }

  // Xử lý đãi ngộ IT (benefits)
  let benefitList = [];
  if (Array.isArray(benefits)) {
    benefitList = benefits.filter(Boolean);
  } else if (typeof benefits === "string") {
    benefitList = [benefits].filter(Boolean);
  }

  // Xử lý skills (chuỗi phân tách bởi dấu phẩy)
  const skillList = [];
  if (skills && typeof skills === "string") {
    const rawSkills = skills.split(",").map((s) => s.trim()).filter(Boolean);
    for (const raw of rawSkills) {
      const skSlug = slugify(raw);
      // Upsert vào Skill collection
      await Skill.findOneAndUpdate(
        { slug: skSlug },
        { name: raw, slug: skSlug },
        { upsert: true, new: true }
      );
      skillList.push({ name: raw, slug: skSlug });
    }
  }

  // Xử lý upload danh sách ảnh
  const images = [];
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      try {
        const uploaded = await uploadJobImage(file);
        if (uploaded) images.push(uploaded);
      } catch (err) {
        // bỏ qua file lỗi hoặc thêm vào thông báo
      }
    }
  }

  // Nếu không có ảnh upload, dùng ảnh demo
  if (images.length === 0) {
    images.push(
      { url: "/assets/images/demo/demo1.png", key: "" },
      { url: "/assets/images/demo/demo2.png", key: "" },
      { url: "/assets/images/demo/demo3.png", key: "" }
    );
  }

  const slug = slugify(title, true);
  const sanitizedDesc = sanitizeHtml(description);

  await Job.create({
    employerId: req.user._id,
    title: title.trim(),
    slug,
    salaryMin: minVal,
    salaryMax: maxVal,
    position,
    workingForm,
    skills: skillList,
    benefits: benefitList,
    images,
    description: sanitizedDesc,
    city: req.user.city || "ha-noi",
    address: req.user.address || "",
    employerActive: req.user.status === EMPLOYER_STATUS.ACTIVE,
    moderation: JOB_MODERATION.VISIBLE,
  });

  clearStatsCache();
  clearMenuCache();
  req.flash("success", "Đăng tin tuyển dụng mới thành công!");
  res.redirect("/employer/jobs");
};

// 4. Chỉnh sửa việc làm
const renderEditJob = async (req, res) => {
  const job = await Job.findOne({
    _id: req.params.id,
    employerId: req.user._id,
    deletedAt: null,
  }).lean();

  if (!job) {
    req.flash("error", "Không tìm thấy công việc yêu cầu.");
    return res.status(404).redirect("/employer/jobs");
  }

  const skillString = (job.skills || []).map((s) => s.name).join(", ");

  res.render("pages/edit-jobs", {
    title: "Chỉnh sửa công việc",
    job,
    skillString,
    positions: POSITIONS,
    workingForms: WORKING_FORMS,
    benefitsList: BENEFITS,
    errors: {},
  });
};

const postEditJob = async (req, res) => {
  const job = await Job.findOne({
    _id: req.params.id,
    employerId: req.user._id,
    deletedAt: null,
  });

  if (!job) {
    req.flash("error", "Không tìm thấy công việc yêu cầu.");
    return res.status(404).redirect("/employer/jobs");
  }

  const {
    title,
    salaryMin,
    salaryMax,
    position,
    workingForm,
    skills,
    description,
    benefits,
  } = req.body;

  const errors = {};
  if (!title || !title.trim()) {
    errors.title = "Tên công việc không được để trống";
  }
  if (!position) {
    errors.position = "Vui lòng chọn cấp bậc";
  }
  if (!workingForm) {
    errors.workingForm = "Vui lòng chọn hình thức làm việc";
  }

  const minVal = salaryMin && !isNaN(Number(salaryMin)) ? Number(salaryMin) : null;
  const maxVal = salaryMax && !isNaN(Number(salaryMax)) ? Number(salaryMax) : null;
  if (minVal !== null && maxVal !== null && minVal > maxVal) {
    errors.salaryMax = "Mức lương tối đa phải lớn hơn hoặc bằng mức lương tối thiểu";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).render("pages/edit-jobs", {
      title: "Chỉnh sửa công việc",
      job: { ...job.toObject(), ...req.body },
      skillString: skills || "",
      positions: POSITIONS,
      workingForms: WORKING_FORMS,
      benefitsList: BENEFITS,
      errors,
    });
  }

  // Xử lý đãi ngộ IT (benefits)
  let benefitList = [];
  if (Array.isArray(benefits)) {
    benefitList = benefits.filter(Boolean);
  } else if (typeof benefits === "string") {
    benefitList = [benefits].filter(Boolean);
  }

  // Xử lý skills
  const skillList = [];
  if (skills && typeof skills === "string") {
    const rawSkills = skills.split(",").map((s) => s.trim()).filter(Boolean);
    for (const raw of rawSkills) {
      const skSlug = slugify(raw);
      await Skill.findOneAndUpdate(
        { slug: skSlug },
        { name: raw, slug: skSlug },
        { upsert: true, new: true }
      );
      skillList.push({ name: raw, slug: skSlug });
    }
  }

  // Xử lý upload thêm ảnh mới nếu có
  if (req.files && req.files.length > 0) {
    const newImages = [];
    for (const file of req.files) {
      try {
        const uploaded = await uploadJobImage(file);
        if (uploaded) newImages.push(uploaded);
      } catch (err) {}
    }
    if (newImages.length > 0) {
      job.images = newImages; // thay thế bộ ảnh mới
    }
  }

  job.title = title.trim();
  job.salaryMin = minVal;
  job.salaryMax = maxVal;
  job.position = position;
  job.workingForm = workingForm;
  job.skills = skillList;
  job.benefits = benefitList;
  job.description = sanitizeHtml(description);

  await job.save();

  clearStatsCache();
  clearMenuCache();
  req.flash("success", "Cập nhật công việc thành công!");
  res.redirect("/employer/jobs");
};

// 5. Xóa việc làm (Soft delete)
const postDeleteJob = async (req, res) => {
  const job = await Job.findOne({
    _id: req.params.id,
    employerId: req.user._id,
    deletedAt: null,
  });

  if (!job) {
    req.flash("error", "Không tìm thấy công việc để xóa.");
    return res.status(404).redirect("/employer/jobs");
  }

  job.deletedAt = new Date();
  await job.save();

  clearStatsCache();
  clearMenuCache();
  req.flash("success", "Đã xóa tin tuyển dụng thành công.");
  res.redirect("/employer/jobs");
};

module.exports = {
  renderCompanyProfile,
  postCompanyProfile,
  renderManageJobs,
  renderCreateJob,
  postCreateJob,
  renderEditJob,
  postEditJob,
  postDeleteJob,
};
