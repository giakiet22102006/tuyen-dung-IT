// src/middlewares/upload.middleware.js
const multer = require("multer");

const storage = multer.memoryStorage();

// Upload Logo: tối đa 2MB
const uploadLogoMulter = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

// Upload Avatar: tối đa 2MB
const uploadAvatarMulter = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

// Upload Job Images: tối đa 5 ảnh, mỗi ảnh tối đa 3MB
const uploadJobImagesMulter = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB/file
});

// Upload CV PDF: tối đa 5MB
const uploadCvMulter = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = {
  uploadLogoMiddleware: uploadLogoMulter.single("logo"),
  uploadAvatarMiddleware: uploadAvatarMulter.single("avatar"),
  uploadJobImagesMiddleware: uploadJobImagesMulter.array("images", 5),
  uploadCvMiddleware: uploadCvMulter.single("cv"),
};
