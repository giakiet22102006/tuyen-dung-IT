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

const ALLOWED_UPLOAD_SUBFOLDERS = new Set(["logos", "avatars", "jobs", "articles"]);
const SAFE_CV_KEY_REGEX = /^[a-zA-Z0-9._-]+\.pdf$/i;
const SAFE_PUBLIC_KEY_REGEX = /^[a-zA-Z0-9._-]+\.(?:webp|png|jpg|jpeg)$/i;

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
 * Làm sạch tên file gốc từ client để chống Path Traversal, Null-byte, CRLF Header Injection & XSS
 */
function sanitizeOriginalFilename(rawName, fallback = "CV.pdf") {
  if (!rawName || typeof rawName !== "string") return fallback;
  // Chuẩn hóa dấu phân cách thư mục Windows/POSIX và chỉ lấy phần tên file cuối
  const base = rawName.replace(/\\/g, "/").split("/").pop() || "";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>"'`;]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 150);

  return cleaned || fallback;
}

/**
 * Kiểm tra trực tiếp chữ ký nhị phân (magic bytes) ở đầu Buffer cho ảnh JPG, PNG, WebP.
 * Hoạt động tức thì trên RAM (L1 cache friendly) và không phụ thuộc ESM dynamic import trong Jest VM.
 */
function detectImageMimeFromMagicBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: "RIFF" (0..3) + "WEBP" (8..11)
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Kiểm tra magic bytes thực tế của buffer để xác thực định dạng file ảnh (chặn SVG, HTML, EXE giả mạo)
 */
async function checkFileType(buffer, allowedMimes = ["image/jpeg", "image/png", "image/webp"]) {
  const magicMime = detectImageMimeFromMagicBytes(buffer);
  if (!magicMime || !allowedMimes.includes(magicMime)) {
    return null;
  }

  try {
    const { fileTypeFromBuffer } = await import("file-type");
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !allowedMimes.includes(detected.mime)) {
      return null;
    }
    return detected;
  } catch {
    // Trong Jest CJS VM khi dynamic import("file-type") không khả dụng, dựa vào magic bytes nhị phân đã xác thực ở trên
    return { mime: magicMime };
  }
}

/**
 * Kiểm tra nghiêm ngặt file PDF:
 * 1. Header chuẩn `%PDF-` (chặn polyglot chỉ gắn 4 byte `%PDF<html>`)
 * 2. Chứa dấu kết thúc `%%EOF`
 * 3. Không chứa thẻ HTML/SVG polyglot ở phần đầu hoặc mã thực thi nguy hiểm trong PDF (`/JavaScript`, `/JS`, `/Launch`, `/RichMedia`, `/XFA`)
 */
async function checkPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return false;

  // Bắt buộc bắt đầu bằng "%PDF-" (0x25 0x50 0x44 0x46 0x2D)
  const isPdfHeader =
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d;

  if (!isPdfHeader) return false;

  // Kiểm tra marker %%EOF ở phần cuối tài liệu (quét 2KB cuối để tránh đọc thừa file 5MB)
  const tailOffset = Math.max(0, buffer.length - 2048);
  const tailText = buffer.toString("latin1", tailOffset);
  if (!tailText.includes("%%EOF")) {
    return false;
  }

  // Chặn HTML/SVG/Script polyglot ở phần đầu file
  const headText = buffer.toString("latin1", 0, Math.min(buffer.length, 1024));
  if (/<(?:script|html|svg|iframe|object|embed)\b/i.test(headText)) {
    return false;
  }

  // Chặn Active PDF Actions có thể thực thi JS khi trình duyệt mở PDF inline
  const rawLatin1 = buffer.toString("latin1");
  if (/\/(?:JavaScript|JS|Launch|RichMedia|XFA)\b/.test(rawLatin1)) {
    return false;
  }

  try {
    const { fileTypeFromBuffer } = await import("file-type");
    const detected = await fileTypeFromBuffer(buffer);
    if (detected && detected.mime !== "application/pdf") {
      return false;
    }
  } catch {
    // Bỏ qua lỗi nạp ESM trong Jest VM vì đã xác thực cấu trúc nhị phân PDF ở trên
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
    originalName: sanitizeOriginalFilename(file.originalname, "CV.pdf"),
    size: file.size || file.buffer.length,
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
    originalName: sanitizeOriginalFilename(originalName, "IT_Profile_CV.pdf"),
    size: buffer.length,
  };
}

/**
 * Lấy đường dẫn tuyệt đối an toàn của file CV (chống Path Traversal, Null-byte & EISDIR)
 */
function getCVPath(key) {
  if (!key || typeof key !== "string" || key.length > 255) return null;
  if (/[\0/\\]/.test(key) || key.includes("..")) return null;
  if (!SAFE_CV_KEY_REGEX.test(key)) return null;

  const baseDir = path.resolve(CV_STORAGE_DIR);
  const targetPath = path.resolve(baseDir, key);
  if (!targetPath.startsWith(baseDir + path.sep)) {
    return null;
  }

  try {
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
      return targetPath;
    }
  } catch {
    return null;
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
 * Xóa file ảnh public cũ khi thay ảnh mới (kiểm soát chặt subfolder & key)
 */
function deleteFile(key, subfolder = "logos") {
  if (!key || typeof key !== "string" || key.length > 255) return;
  if (!ALLOWED_UPLOAD_SUBFOLDERS.has(subfolder)) return;
  if (/[\0/\\]/.test(key) || key.includes("..") || !SAFE_PUBLIC_KEY_REGEX.test(key)) return;

  try {
    const allowedDir = path.resolve(BASE_UPLOAD_DIR, subfolder);
    const filePath = path.resolve(allowedDir, key);
    if (!filePath.startsWith(allowedDir + path.sep)) return;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Không thể xóa file ${key}:`, err.message);
  }
}

module.exports = {
  sanitizeOriginalFilename,
  detectImageMimeFromMagicBytes,
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
