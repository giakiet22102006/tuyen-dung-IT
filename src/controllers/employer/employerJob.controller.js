// src/controllers/employer/employerJob.controller.js
const { Employer, Job, Skill, CompanyFollow } = require("../../models");
const { CITIES, POSITIONS, WORKING_FORMS, BENEFITS, EMPLOYER_STATUS, JOB_MODERATION } = require("../../config/constants");
const { uploadLogo, uploadJobImage, deleteFile } = require("../../services/storage.service");
const { clearStatsCache } = require("../../services/job.service");
const { clearMenuCache } = require("../../services/menu.service");
const { notifyMatchingSubscribers } = require("../../services/jobAlert.service");
const { createNotification } = require("../../services/notification.service");
const sanitizeHtml = require("../../utils/sanitizeHtml");
const slugify = require("../../utils/slugify");
const paginate = require("../../utils/pagination");
const { getCompanyMapData, sanitizeGoogleMapsInput } = require("../../utils/googleMaps");

const MAX_SALARY = 1000000000;
const FOLLOWER_NOTIFY_LIMIT = 2000;

/**
 * Chuyển HTML mô tả công ty (đã sanitize) thành văn bản thuần dễ đọc cho <textarea>
 * (<p>/<br>/<li> → xuống dòng / gạch đầu dòng, giải mã &amp; &lt; ...) — QA-m04
 */
function htmlToPlainText(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<\/\s*(p|div|li|h[1-6]|ul|ol|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtmlText(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Văn bản thuần từ <textarea> → HTML an toàn (đoạn <p>, xuống dòng <br>).
 * Nếu người dùng dán HTML sẵn thì chỉ sanitize như cũ.
 */
function plainTextToHtml(text) {
  if (!text || typeof text !== "string") return "";
  const trimmed = text.trim().slice(0, 20000);
  if (!trimmed) return "";
  if (/<\/?[a-z][^>]*>/i.test(trimmed)) {
    return sanitizeHtml(trimmed);
  }
  const html = trimmed
    .split(/\r?\n\s*\r?\n/)
    .map((para) => `<p>${escapeHtmlText(para.trim()).replace(/\r?\n/g, "<br>")}</p>`)
    .join("");
  return sanitizeHtml(html);
}

/**
 * Parse mức lương: "" → null (thỏa thuận), "0" → 0, số âm / không phải số → lỗi (QA-M11)
 */
function parseSalaryInput(raw) {
  if (raw === undefined || raw === null) return { value: null };
  if (Array.isArray(raw)) raw = raw[0];
  const str = String(raw).trim();
  if (str === "") return { value: null };
  if (!/^-?\d+(\.\d+)?$/.test(str)) return { error: "Mức lương phải là số hợp lệ" };
  const num = Number(str);
  if (!Number.isFinite(num)) return { error: "Mức lương phải là số hợp lệ" };
  if (num < 0) return { error: "Mức lương không được là số âm" };
  if (num > MAX_SALARY) return { error: "Mức lương vượt quá giới hạn cho phép" };
  return { value: num };
}

function validateSalaryRange(salaryMin, salaryMax, errors) {
  const minParsed = parseSalaryInput(salaryMin);
  const maxParsed = parseSalaryInput(salaryMax);
  if (minParsed.error) errors.salaryMin = minParsed.error;
  if (maxParsed.error) errors.salaryMax = maxParsed.error;
  const minVal = minParsed.error ? null : minParsed.value;
  const maxVal = maxParsed.error ? null : maxParsed.value;
  if (!errors.salaryMin && !errors.salaryMax && minVal !== null && maxVal !== null && minVal > maxVal) {
    errors.salaryMax = "Mức lương tối đa phải lớn hơn hoặc bằng mức lương tối thiểu";
  }
  return { minVal, maxVal };
}

/**
 * Báo chuông cho các ứng viên đang theo dõi công ty khi có tin tuyển dụng mới (chạy nền)
 */
async function notifyCompanyFollowers(employer, job) {
  const follows = await CompanyFollow.find({ employerId: employer._id })
    .select("candidateId")
    .limit(FOLLOWER_NOTIFY_LIMIT)
    .lean();
  await Promise.all(
    follows.map((f) =>
      createNotification({
        recipientId: f.candidateId,
        recipientType: "candidate",
        title: `${employer.companyName} vừa đăng tin tuyển dụng mới`,
        message: `Vị trí "${job.title}" vừa được đăng bởi công ty bạn đang theo dõi. Xem ngay để ứng tuyển sớm!`,
        link: `/jobs/${job.slug}`,
        type: "system",
      })
    )
  );
  return follows.length;
}

// 1. Hồ sơ công ty
const renderCompanyProfile = async (req, res) => {
  const company = await Employer.findById(req.user._id).lean();
  const mapData = getCompanyMapData(company);
  res.render("pages/company-profile", {
    title: "Thông tin công ty",
    company,
    descriptionPlain: htmlToPlainText(company ? company.description : ""),
    cities: CITIES,
    mapData,
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
    googleMapsUrl,
    companyModel,
    companySize,
    workingTime,
    overtime,
    description,
    phone,
  } = req.body;

  if (typeof companyName !== "string" || !companyName.trim()) {
    return res.status(400).render("pages/company-profile", {
      title: "Thông tin công ty",
      company: { ...company.toObject(), ...req.body },
      descriptionPlain: typeof description === "string" ? description : "",
      mapData: getCompanyMapData(company.toObject()),
      cities: CITIES,
      errors: { companyName: "Tên công ty không được để trống" },
    });
  }

  company.companyName = companyName.trim();
  company.city = city || company.city;
  company.address = (address || "").trim();
  company.googleMapsUrl = sanitizeGoogleMapsInput(googleMapsUrl || "");
  company.companyModel = (companyModel || "").trim();
  company.companySize = (companySize || "").trim();
  company.workingTime = (workingTime || "").trim();
  company.overtime = (overtime || "").trim();
  // Textarea gửi văn bản thuần → chuyển sang HTML an toàn để trang công ty hiển thị đúng đoạn văn
  company.description = plainTextToHtml(description);
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
        descriptionPlain: typeof description === "string" ? description : "",
        mapData: getCompanyMapData(company.toObject()),
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
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
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
  if (typeof title !== "string" || !title.trim()) {
    errors.title = "Tên công việc không được để trống";
  }
  if (!position) {
    errors.position = "Vui lòng chọn cấp bậc";
  }
  if (!workingForm) {
    errors.workingForm = "Vui lòng chọn hình thức làm việc";
  }

  const { minVal, maxVal } = validateSalaryRange(salaryMin, salaryMax, errors);

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
      // Kỹ năng toàn ký tự đặc biệt cho slug rỗng → bỏ qua thay vì upsert Skill slug "" (lỗi 500 / ghi đè chéo)
      if (!skSlug) continue;
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

  const newJob = await Job.create({
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

  // Gửi thông báo Job Alert cho các ứng viên đã đăng ký tiêu chí phù hợp
  if (req.user.status === EMPLOYER_STATUS.ACTIVE) {
    notifyMatchingSubscribers(newJob, req.user).catch((err) =>
      console.error("Lỗi gửi Job Alert:", err.message)
    );
    // Báo chuông cho ứng viên đang theo dõi công ty (chạy nền, không chặn response)
    notifyCompanyFollowers(req.user, newJob).catch((err) =>
      console.error("Lỗi thông báo người theo dõi công ty:", err.message)
    );
  }

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
  if (typeof title !== "string" || !title.trim()) {
    errors.title = "Tên công việc không được để trống";
  }
  if (!position) {
    errors.position = "Vui lòng chọn cấp bậc";
  }
  if (!workingForm) {
    errors.workingForm = "Vui lòng chọn hình thức làm việc";
  }

  const { minVal, maxVal } = validateSalaryRange(salaryMin, salaryMax, errors);

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
      // Kỹ năng toàn ký tự đặc biệt cho slug rỗng → bỏ qua thay vì upsert Skill slug "" (lỗi 500 / ghi đè chéo)
      if (!skSlug) continue;
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

// 6. Tạm dừng / Mở lại tin tuyển dụng (QA-m07)
const postToggleJobActive = async (req, res) => {
  const job = await Job.findOne({
    _id: req.params.id,
    employerId: req.user._id,
    deletedAt: null,
  });

  const wantsJson = req.xhr || req.headers.accept?.includes("application/json");
  if (!job) {
    if (wantsJson) {
      return res.status(404).json({ success: false, message: "Không tìm thấy công việc yêu cầu." });
    }
    req.flash("error", "Không tìm thấy công việc yêu cầu.");
    return res.status(404).redirect("/employer/jobs");
  }

  job.employerActive = !job.employerActive;
  await job.save();

  clearStatsCache();
  clearMenuCache();

  const message = job.employerActive
    ? `Đã mở lại tin tuyển dụng "${job.title}".`
    : `Đã tạm dừng tin tuyển dụng "${job.title}". Ứng viên sẽ không còn thấy tin này.`;
  if (wantsJson) {
    return res.json({ success: true, employerActive: job.employerActive, message });
  }
  req.flash("success", message);
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
  postToggleJobActive,
  // Helpers export cho unit test
  parseSalaryInput,
  htmlToPlainText,
  plainTextToHtml,
};
