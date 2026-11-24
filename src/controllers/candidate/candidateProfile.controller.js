// src/controllers/candidate/candidateProfile.controller.js
const { Candidate } = require("../../models");
const { uploadAvatar, deleteFile, setPdfInlineHeaders } = require("../../services/storage.service");
const { generateItProfilePdf } = require("../../services/pdfGenerator.service");
const { CITIES, POSITIONS } = require("../../config/constants");

const VALID_CITY_VALUES = new Set(CITIES.map((c) => c.value));

const renderProfile = async (req, res) => {
  const candidate = await Candidate.findById(req.user._id).lean();
  res.render("pages/candidate-profile", {
    title: "Thông tin cá nhân (Ứng viên)",
    candidate,
    errors: {},
  });
};

const postProfile = async (req, res) => {
  const candidate = await Candidate.findById(req.user._id);
  if (!candidate) {
    return res.redirect("/candidate/login");
  }

  const { fullName, phone } = req.body;
  const errors = {};

  if (!fullName || !fullName.trim()) {
    errors.fullName = "Họ tên không được để trống";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).render("pages/candidate-profile", {
      title: "Thông tin cá nhân (Ứng viên)",
      candidate: { ...candidate.toObject(), ...req.body },
      errors,
    });
  }

  candidate.fullName = fullName.trim();
  candidate.phone = (phone || "").trim();

  // Xử lý upload Avatar nếu có
  if (req.file) {
    try {
      const uploaded = await uploadAvatar(req.file);
      if (uploaded) {
        if (candidate.avatar && candidate.avatar.key) {
          deleteFile(candidate.avatar.key, "avatars");
        }
        candidate.avatar = uploaded;
      }
    } catch (uploadErr) {
      return res.status(400).render("pages/candidate-profile", {
        title: "Thông tin cá nhân (Ứng viên)",
        candidate: { ...candidate.toObject(), ...req.body },
        errors: { avatar: uploadErr.message },
      });
    }
  }

  await candidate.save();
  req.flash("success", "Cập nhật thông tin cá nhân thành công!");
  res.redirect("/candidate/profile");
};

const renderItProfile = async (req, res) => {
  const candidate = await Candidate.findById(req.user._id).lean();
  if (!candidate) {
    return res.redirect("/candidate/login");
  }

  res.render("pages/candidate-it-profile", {
    title: "Hồ sơ IT Profile Trực Tuyến - VN.ITJobs",
    candidate,
    profile: candidate.itProfile || {},
    positions: POSITIONS,
    cities: CITIES,
  });
};

const postItProfile = async (req, res) => {
  const candidate = await Candidate.findById(req.user._id);
  if (!candidate) {
    return res.redirect("/candidate/login");
  }

  const {
    title,
    level,
    yearsOfExperience,
    bio,
    githubUrl,
    linkedinUrl,
    portfolioUrl,
    skills,
    openToWork,
    expectedSalary,
    preferredCity,
    hideFromCurrentCompany,
    workExperience,
    projects,
    education,
    certificates,
  } = req.body;

  // Parse skills
  let skillList = [];
  if (typeof skills === "string") {
    skillList = skills.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (Array.isArray(skills)) {
    skillList = skills.map((s) => String(s).trim()).filter(Boolean);
  }

  function safeParseArray(data) {
    if (Array.isArray(data)) return data;
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Bỏ qua JSON không hợp lệ
      }
    }
    return [];
  }

  const workList = safeParseArray(workExperience).filter(
    (w) => w && (w.company || w.position || w.description)
  );
  const projectList = safeParseArray(projects).filter(
    (p) => p && (p.name || p.role || p.techStack || p.description)
  );
  const eduList = safeParseArray(education).filter(
    (e) => e && (e.school || e.major || e.gradYear)
  );
  const certList = safeParseArray(certificates).filter(
    (c) => c && (c.name || c.organization || c.year)
  );

  const isOpenToWork =
    openToWork === "true" ||
    openToWork === "on" ||
    openToWork === true ||
    openToWork === 1 ||
    openToWork === "1";

  // Giữ nguyên preferredCity hiện tại nếu form không gửi lên hoặc gửi rỗng
  const existingCity = candidate.itProfile?.preferredCity || "ha-noi";
  const rawCity = typeof preferredCity === "string" ? preferredCity.trim() : "";
  const resolvedCity = rawCity && VALID_CITY_VALUES.has(rawCity) ? rawCity : existingCity;

  const parsedSalary = Number(expectedSalary);
  const parsedYears = Number(yearsOfExperience);

  candidate.itProfile = {
    title: (title || "").trim(),
    level: level || "junior",
    yearsOfExperience: Number.isFinite(parsedYears) && parsedYears >= 0 ? Math.min(50, parsedYears) : 0,
    openToWork: isOpenToWork,
    expectedSalary: Number.isFinite(parsedSalary) && parsedSalary >= 0 ? parsedSalary : 0,
    preferredCity: resolvedCity,
    hideFromCurrentCompany: (hideFromCurrentCompany || "").trim(),
    bio: (bio || "").trim(),
    githubUrl: (githubUrl || "").trim(),
    linkedinUrl: (linkedinUrl || "").trim(),
    portfolioUrl: (portfolioUrl || "").trim(),
    skills: skillList,
    workExperience: workList,
    projects: projectList,
    education: eduList,
    certificates: certList,
    updatedAt: new Date(),
  };

  await candidate.save();
  req.flash("success", "Cập nhật hồ sơ IT Profile thành công!");
  res.redirect("/candidate/it-profile");
};

const streamItProfilePdf = async (req, res) => {
  const candidate = await Candidate.findById(req.user._id).lean();
  if (!candidate) {
    return res.redirect("/candidate/login");
  }

  const pdfBuffer = await generateItProfilePdf(candidate);
  const safeBase =
    (candidate.fullName || "IT_Profile")
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 80) || "IT_Profile";

  setPdfInlineHeaders(res, `CV_${safeBase}.pdf`);
  return res.send(pdfBuffer);
};

module.exports = {
  renderProfile,
  postProfile,
  renderItProfile,
  postItProfile,
  streamItProfilePdf,
};
