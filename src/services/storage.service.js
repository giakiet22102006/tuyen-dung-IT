// src/services/storage.service.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const isVercel = Boolean(process.env.VERCEL);
const BASE_UPLOAD_DIR = isVercel ? "/tmp/uploads" : path.join(__dirname, "../../public/uploads");
const BASE_STORAGE_DIR = isVercel ? "/tmp/storage" : path.join(__dirname, "../../storage");

const AVATARS_DIR = path.join(BASE_UPLOAD_DIR, "avatars");
const LOGOS_DIR = path.join(BASE_UPLOAD_DIR, "logos");
const JOBS_DIR = path.join(BASE_UPLOAD_DIR, "jobs");
const ARTICLES_DIR = path.join(BASE_UPLOAD_DIR, "articles");
const CV_STORAGE_DIR = path.join(BASE_STORAGE_DIR, "private/cv");

// Đảm bảo các thư mục upload và storage tồn tại (bọc try-catch an toàn cho môi trường Serverless)
[AVATARS_DIR, LOGOS_DIR, JOBS_DIR, ARTICLES_DIR, CV_STORAGE_DIR].forEach((dir) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    // Trên môi trường Serverless (Vercel) filesystem gốc là read-only, không làm sập ứng dụng
    console.warn(`[Storage] Lưu ý tạo thư mục ${dir}:`, err.message);
  }
});

/**
 * Kiểm tra magic bytes thực tế của buffer để xác thực định dạng file
 */
async function checkFileType(buffer, allowedMimes = ["image/jpeg", "image/png", "image/webp"]) {
  try {
    const { fileTypeFromBuffer } = await import("file-type");
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !allowedMimes.includes(detected.mime)) {
      return null;
    }
    return detected;
  } catch (err) {
    console.error("Lỗi kiểm tra magic bytes:", err);
    return null;
  }
}

/**
 * Kiểm tra magic bytes file PDF (%PDF)
 */
async function checkPdf(buffer) {
  if (!buffer || buffer.length < 4) return false;
  // Header kiểm tra %PDF (0x25 0x50 0x44 0x46)
  const isPdfHeader =
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46;

  if (!isPdfHeader) return false;

  try {
    const { fileTypeFromBuffer } = await import("file-type");
    const detected = await fileTypeFromBuffer(buffer);
    if (detected && detected.mime !== "application/pdf") {
      return false;
    }
  } catch (err) {
    // Nếu file-type gặp lỗi thì vẫn kiểm tra header %PDF
  }
  return true;
}

/**
 * Xử lý và lưu trữ ảnh Logo (resize tối đa 400x400, format WebP)
 */
async function uploadLogo(file) {
  if (!file || !file.buffer) return null;

  const valid = await checkFileType(file.buffer, ["image/jpeg", "image/png", "image/webp"]);
  if (!valid) {
    throw new Error("Định dạng file không hợp lệ. Chỉ chấp nhận JPG, PNG hoặc WebP.");
  }

  const filename = `logo-${crypto.randomBytes(12).toString("hex")}.webp`;
  const absolutePath = path.join(LOGOS_DIR, filename);

  await sharp(file.buffer)
    .resize(400, 400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(absolutePath);

  return {
    url: `/uploads/logos/${filename}`,
    key: filename,
  };
}

/**
 * Xử lý và lưu trữ ảnh Avatar Ứng viên (resize tối đa 400x400, format WebP)
 */
async function uploadAvatar(file) {
  if (!file || !file.buffer) return null;

  const valid = await checkFileType(file.buffer, ["image/jpeg", "image/png", "image/webp"]);
  if (!valid) {
    throw new Error("Định dạng file không hợp lệ. Chỉ chấp nhận JPG, PNG hoặc WebP.");
  }

  const filename = `avatar-${crypto.randomBytes(12).toString("hex")}.webp`;
  const absolutePath = path.join(AVATARS_DIR, filename);

  await sharp(file.buffer)
    .resize(400, 400, { fit: "cover" })
    .webp({ quality: 85 })
    .toFile(absolutePath);

  return {
    url: `/uploads/avatars/${filename}`,
    key: filename,
  };
}

/**
 * Xử lý và lưu trữ ảnh Thumbnail bài viết Cẩm Nang IT (resize 1200x675 tỉ lệ 16:9, format WebP)
 */
async function uploadArticleThumbnail(file) {
  if (!file || !file.buffer) return null;

  const valid = await checkFileType(file.buffer, ["image/jpeg", "image/png", "image/webp"]);
  if (!valid) {
    throw new Error("Định dạng file không hợp lệ. Chỉ chấp nhận JPG, PNG hoặc WebP.");
  }

  const filename = `article-thumb-${crypto.randomBytes(12).toString("hex")}.webp`;
  const absolutePath = path.join(ARTICLES_DIR, filename);

  await sharp(file.buffer)
    .resize(1200, 675, { fit: "cover" })
    .webp({ quality: 85 })
    .toFile(absolutePath);

  return {
    url: `/uploads/articles/${filename}`,
    key: filename,
  };
}

/**
 * Xử lý và lưu trữ ảnh Job (chiều rộng tối đa 1280px, format WebP)
 */
async function uploadJobImage(file) {
  if (!file || !file.buffer) return null;

  const valid = await checkFileType(file.buffer, ["image/jpeg", "image/png", "image/webp"]);
  if (!valid) {
    throw new Error("Định dạng file không hợp lệ. Chỉ chấp nhận JPG, PNG hoặc WebP.");
  }

  const filename = `job-${crypto.randomBytes(12).toString("hex")}.webp`;
  const absolutePath = path.join(JOBS_DIR, filename);

  await sharp(file.buffer)
    .resize(1280, null, { withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(absolutePath);

  return {
    url: `/uploads/jobs/${filename}`,
    key: filename,
  };
}

/**
 * Lưu trữ file PDF CV vào thư mục riêng biệt bảo mật (storage/private/cv/)
 */
async function uploadCV(file) {
  if (!file || !file.buffer) return null;

  const isValidPdf = await checkPdf(file.buffer);
  if (!isValidPdf) {
    throw new Error("File CV không đúng định dạng PDF hợp lệ.");
  }

  const filename = `cv-${crypto.randomBytes(16).toString("hex")}.pdf`;
  const absolutePath = path.join(CV_STORAGE_DIR, filename);

  await fs.promises.writeFile(absolutePath, file.buffer);

  return {
    key: filename,
    originalName: file.originalname || "CV.pdf",
    size: file.size,
  };
}

/**
 * Lưu trực tiếp buffer PDF (sinh từ IT Profile trực tuyến)
 */
async function saveCvBuffer(buffer, originalName = "IT_Profile_CV.pdf") {
  if (!buffer) return null;

  const filename = `cv-${crypto.randomBytes(16).toString("hex")}.pdf`;
  const absolutePath = path.join(CV_STORAGE_DIR, filename);

  await fs.promises.writeFile(absolutePath, buffer);

  return {
    key: filename,
    originalName,
    size: buffer.length,
  };
}

/**
 * Lấy đường dẫn tuyệt đối an toàn của file CV
 */
function getCVPath(key) {
  if (!key) return null;
  // Chống path traversal
  const safeKey = path.basename(key);
  const targetPath = path.join(CV_STORAGE_DIR, safeKey);
  if (fs.existsSync(targetPath)) {
    return targetPath;
  }
  return null;
}

/**
 * Xóa file CV trong storage riêng
 */
function deleteCV(key) {
  if (!key) return;
  try {
    const targetPath = getCVPath(key);
    if (targetPath && fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  } catch (err) {
    console.error(`Không thể xóa CV ${key}:`, err.message);
  }
}

/**
 * Xóa file ảnh public cũ khi thay ảnh mới
 */
function deleteFile(key, subfolder = "logos") {
  if (!key) return;
  try {
    const filePath = path.join(BASE_UPLOAD_DIR, subfolder, path.basename(key));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Không thể xóa file ${key}:`, err.message);
  }
}

module.exports = {
  checkFileType,
  checkPdf,
  uploadLogo,
  uploadAvatar,
  uploadArticleThumbnail,
  uploadJobImage,
  uploadCV,
  saveCvBuffer,
  getCVPath,
  deleteCV,
  deleteFile,
};
