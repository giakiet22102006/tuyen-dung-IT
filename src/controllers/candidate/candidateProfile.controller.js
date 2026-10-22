// src/controllers/candidate/candidateProfile.controller.js
const { Candidate } = require("../../models");
const { uploadAvatar, deleteFile } = require("../../services/storage.service");

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

module.exports = {
  renderProfile,
  postProfile,
};
