// src/services/storage.service.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const mongoose = require("mongoose");
const env = require("../config/env");
const StoredFile = require("../models/storedFile.model");

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

  // Chặn Active PDF Actions trong dictionary/object PDF (bỏ qua URI https://.../JavaScript trong CV dev)
  const rawLatin1 = buffer.toString("latin1").replace(/https?:\/\/[^\s()<>"]+/gi, " ");
  if (/<<[\s\S]{0,2048}?\/(?:JavaScript|JS|Launch|RichMedia|XFA)\b/.test(rawLatin1)) {
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

function isCloudinaryReady() {
  return Boolean(
    env.STORAGE_DRIVER === "cloudinary" &&
      env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET
  );
}

async function persistStoredFile(key, folder, contentType, buffer) {
  if (mongoose.connection.readyState !== 1 || !Buffer.isBuffer(buffer)) return;
  try {
    await StoredFile.findOneAndUpdate(
      { key },
      {
        $set: {
          folder,
          contentType,
          size: buffer.length,
          data: buffer,
        },
      },
      { upsert: true, new: false }
    );
  } catch (err) {
    console.warn(`[Storage] Không thể lưu bản sao DB cho ${key}:`, err.message);
  }
}

async function uploadToCloudinary(buffer, folder, filename, resourceType = "image") {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${folder}/${filename.replace(/\.[^.]+$/, "")}`;
  const signaturePayload = `public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash("sha1").update(signaturePayload).digest("hex");

  const form = new FormData();
  const mime = resourceType === "raw" ? "application/pdf" : "image/webp";
  form.append("file", new Blob([buffer], { type: mime }), filename);
  form.append("api_key", env.CLOUDINARY_API_KEY);
  form.append("timestamp", String(timestamp));
  form.append("public_id", publicId);
  form.append("signature", signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/${resourceType}/upload`;
  const resp = await fetch(endpoint, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Cloudinary upload failed (${resp.status}): ${errText.slice(0, 120)}`);
  }
  return resp.json();
}

async function savePublicWebpAsset(file, { subfolder, prefix, width, height = null, fit = "inside" }) {
  if (!file || !file.buffer) return null;

  const valid = await checkFileType(file.buffer, ["image/jpeg", "image/png", "image/webp"]);
  if (!valid) {
    throw new Error("Định dạng file không hợp lệ. Chỉ chấp nhận JPG, PNG hoặc WebP.");
  }

  const filename = `${prefix}-${crypto.randomBytes(12).toString("hex")}.webp`;
  const targetDir = path.join(BASE_UPLOAD_DIR, subfolder);
  const absolutePath = path.join(targetDir, filename);

  const sharpOptions = height
    ? { fit, ...(fit === "inside" ? { withoutEnlargement: true } : {}) }
    : { withoutEnlargement: true };

  const webpBuffer = await sharp(file.buffer)
    .resize(width, height, sharpOptions)
    .webp({ quality: 85 })
    .toBuffer();

  if (isCloudinaryReady()) {
    try {
      const cloudRes = await uploadToCloudinary(webpBuffer, `vnitjobs/${subfolder}`, filename, "image");
      return {
        url: cloudRes.secure_url || `/uploads/${subfolder}/${filename}`,
        key: filename,
      };
    } catch (err) {
      console.warn(`[Storage] Fallback local/DB cho ${subfolder}:`, err.message);
    }
  }

  try {
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    await fs.promises.writeFile(absolutePath, webpBuffer);
  } catch (err) {
    console.warn(`[Storage] Ghi file ${absolutePath}:`, err.message);
  }

  // Lưu kèm vào MongoDB để không bị mất sau cold-start Vercel /tmp
  await persistStoredFile(filename, subfolder, "image/webp", webpBuffer);

  return {
    url: `/uploads/${subfolder}/${filename}`,
    key: filename,
  };
}

/**
 * Xử lý và lưu trữ ảnh Logo (resize tối đa 400x400, format WebP)
 */
async function uploadLogo(file) {
  return savePublicWebpAsset(file, {
    subfolder: "logos",
    prefix: "logo",
    width: 400,
    height: 400,
    fit: "inside",
  });
}

/**
 * Xử lý và lưu trữ ảnh Avatar Ứng viên (resize tối đa 400x400, format WebP)
 */
async function uploadAvatar(file) {
  return savePublicWebpAsset(file, {
    subfolder: "avatars",
    prefix: "avatar",
    width: 400,
    height: 400,
    fit: "cover",
  });
}

/**
 * Xử lý và lưu trữ ảnh Thumbnail bài viết Cẩm Nang IT (resize 1200x675 tỉ lệ 16:9, format WebP)
 */
async function uploadArticleThumbnail(file) {
  return savePublicWebpAsset(file, {
    subfolder: "articles",
    prefix: "article-thumb",
    width: 1200,
    height: 675,
    fit: "cover",
  });
}

/**
 * Xử lý và lưu trữ ảnh Job (chiều rộng tối đa 1280px, format WebP)
 */
async function uploadJobImage(file) {
  return savePublicWebpAsset(file, {
    subfolder: "jobs",
    prefix: "job",
    width: 1280,
    height: null,
  });
}

/**
 * Lưu trữ file PDF CV vào thư mục riêng biệt bảo mật (storage/private/cv/) + bản sao DB bền vững
 */
async function uploadCV(file) {
  if (!file || !file.buffer) return null;

  const isValidPdf = await checkPdf(file.buffer);
  if (!isValidPdf) {
    throw new Error("File CV không đúng định dạng PDF hợp lệ.");
  }

  const filename = `cv-${crypto.randomBytes(16).toString("hex")}.pdf`;
  const absolutePath = path.join(CV_STORAGE_DIR, filename);

  try {
    if (!fs.existsSync(CV_STORAGE_DIR)) fs.mkdirSync(CV_STORAGE_DIR, { recursive: true });
    await fs.promises.writeFile(absolutePath, file.buffer);
  } catch (err) {
    console.warn(`[Storage] Ghi CV ${absolutePath}:`, err.message);
  }

  await persistStoredFile(filename, "cv", "application/pdf", file.buffer);

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

  try {
    if (!fs.existsSync(CV_STORAGE_DIR)) fs.mkdirSync(CV_STORAGE_DIR, { recursive: true });
    await fs.promises.writeFile(absolutePath, buffer);
  } catch (err) {
    console.warn(`[Storage] Ghi buffer CV ${absolutePath}:`, err.message);
  }

  await persistStoredFile(filename, "cv", "application/pdf", Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));

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
 * Đọc Buffer PDF an toàn: ưu tiên ổ đĩa/tmp cache, fallback khôi phục từ MongoDB StoredFile sau cold start
 */
async function ensureCVBuffer(key) {
  if (!key || typeof key !== "string" || key.length > 255) return null;
  if (/[\0/\\]/.test(key) || key.includes("..") || !SAFE_CV_KEY_REGEX.test(key)) return null;

  const diskPath = getCVPath(key);
  if (diskPath) {
    try {
      return await fs.promises.readFile(diskPath);
    } catch {
      // Fallback sang MongoDB bên dưới
    }
  }

  if (mongoose.connection.readyState === 1) {
    try {
      const stored = await StoredFile.findOne({ key, folder: "cv" }).lean();
      if (stored && stored.data) {
        const buf = Buffer.isBuffer(stored.data) ? stored.data : Buffer.from(stored.data.buffer || stored.data);
        try {
          if (!fs.existsSync(CV_STORAGE_DIR)) fs.mkdirSync(CV_STORAGE_DIR, { recursive: true });
          await fs.promises.writeFile(path.join(CV_STORAGE_DIR, key), buf);
        } catch {
          // Bỏ qua nếu hệ thống file read-only
        }
        return buf;
      }
    } catch (err) {
      console.warn(`[Storage] Lỗi khôi phục CV ${key} từ DB:`, err.message);
    }
  }
  return null;
}

/**
 * Phục hồi file ảnh public từ StoredFile khi Vercel /tmp bị xóa sau cold start
 */
async function getStoredPublicFile(subfolder, key) {
  if (!ALLOWED_UPLOAD_SUBFOLDERS.has(subfolder)) return null;
  if (!key || typeof key !== "string" || key.length > 255) return null;
  if (/[\0/\\]/.test(key) || key.includes("..") || !SAFE_PUBLIC_KEY_REGEX.test(key)) return null;
  if (mongoose.connection.readyState !== 1) return null;

  try {
    const stored = await StoredFile.findOne({ key, folder: subfolder }).lean();
    if (!stored || !stored.data) return null;
    const buf = Buffer.isBuffer(stored.data) ? stored.data : Buffer.from(stored.data.buffer || stored.data);
    try {
      const targetDir = path.join(BASE_UPLOAD_DIR, subfolder);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      await fs.promises.writeFile(path.join(targetDir, key), buf);
    } catch {
      // Bỏ qua lỗi cache disk
    }
    return {
      buffer: buf,
      contentType: stored.contentType || "image/webp",
    };
  } catch {
    return null;
  }
}

/**
 * Thiết lập HTTP response headers an toàn cho phép nhúng <iframe> cùng origin khi xem PDF CV
 */
function setPdfInlineHeaders(res, filename = "CV.pdf") {
  const safeName = sanitizeOriginalFilename(filename, "CV.pdf");
  const asciiName = safeName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
  );
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; frame-ancestors 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'self' blob:"
  );
  res.setHeader("Cache-Control", "private, max-age=300");
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
  if (mongoose.connection.readyState === 1 && typeof key === "string") {
    StoredFile.deleteOne({ key, folder: "cv" }).catch(() => {});
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
  if (mongoose.connection.readyState === 1) {
    StoredFile.deleteOne({ key, folder: subfolder }).catch(() => {});
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
  ensureCVBuffer,
  getStoredPublicFile,
  setPdfInlineHeaders,
  deleteCV,
  deleteFile,
};
