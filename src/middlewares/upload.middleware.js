// src/middlewares/upload.middleware.js
const path = require("path");
const multer = require("multer");
const {
  sanitizeOriginalFilename,
  checkFileType,
  checkPdf,
} = require("../services/storage.service");
const isSafeRedirect = require("../utils/sanitizeRedirect");

const storage = multer.memoryStorage();

const IMAGE_ALLOWED_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const IMAGE_ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const CV_ALLOWED_MIMES = new Set(["application/pdf"]);
const CV_ALLOWED_EXTS = new Set([".pdf"]);

function createUploadError(message, code = "INVALID_UPLOAD") {
  const err = new Error(message);
  err.code = code;
  return err;
}

function buildFileFilter({ allowedMimes, allowedExts, defaultFallbackName, invalidMessage }) {
  return (_req, file, cb) => {
    const rawName = typeof file.originalname === "string" ? file.originalname : "";
    if (!rawName || rawName.includes("\0")) {
      return cb(createUploadError(invalidMessage, "INVALID_FILE_NAME"));
    }

    const safeName = sanitizeOriginalFilename(rawName, defaultFallbackName);
    const ext = path.extname(safeName).toLowerCase();
    const mime = typeof file.mimetype === "string" ? file.mimetype.toLowerCase().trim() : "";

    if (!allowedExts.has(ext) || !allowedMimes.has(mime)) {
      return cb(createUploadError(invalidMessage, "INVALID_FILE_TYPE"));
    }

    // Ghi đè tên file đã làm sạch để controller phía sau không bao giờ nhận chuỗi traversal/control chars
    file.originalname = safeName;
    return cb(null, true);
  };
}

function isApiUploadRequest(req) {
  return Boolean(
    req.originalUrl?.startsWith("/api") ||
      req.baseUrl?.startsWith("/api") ||
      req.path?.startsWith("/api") ||
      req.xhr ||
      req.headers?.accept?.includes("json")
  );
}

function formatUploadErrorMessage(err, maxMb) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return `Kích thước file tải lên vượt quá giới hạn tối đa (${maxMb}MB).`;
    }
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      return "Số lượng hoặc trường file tải lên không hợp lệ.";
    }
    return "Dữ liệu biểu mẫu tải lên vượt quá giới hạn cho phép.";
  }
  return err.message || "File tải lên không hợp lệ.";
}

function resolveFormFallbackUrl(req) {
  const rawUrl = (req.originalUrl || "/").replace(/\/apply(?:\?.*)?$/, "");
  return isSafeRedirect(rawUrl) ? rawUrl : "/";
}

/**
 * Bọc Multer middleware bằng 2 lớp kiểm soát:
 * 1. Pre-buffer stream filter (extension + MIME + giới hạn kích thước/số file/số field)
 * 2. Post-buffer magic-byte verification (đối chiếu chữ ký nhị phân thực tế trong RAM trước khi vào controller)
 */
function wrapSafeUpload(multerInstance, { kind, maxMb, invalidMagicMessage }) {
  return (req, res, next) => {
    multerInstance(req, res, async (err) => {
      if (err) {
        req.file = undefined;
        req.files = undefined;
        const statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        const message = formatUploadErrorMessage(err, maxMb);
        if (isApiUploadRequest(req)) {
          return res.status(statusCode).json({
            success: false,
            code: err.code || "INVALID_UPLOAD",
            message,
          });
        }
        if (req.flash) {
          req.flash("error", message);
        }
        return res.redirect(resolveFormFallbackUrl(req));
      }

      try {
        const uploadedFiles = [];
        if (req.file) uploadedFiles.push(req.file);
        if (Array.isArray(req.files)) uploadedFiles.push(...req.files);

        for (const f of uploadedFiles) {
          if (!f || !Buffer.isBuffer(f.buffer)) continue;
          const ok =
            kind === "pdf"
              ? await checkPdf(f.buffer)
              : Boolean(await checkFileType(f.buffer, ["image/jpeg", "image/png", "image/webp"]));

          if (!ok) {
            req.file = undefined;
            req.files = undefined;
            if (isApiUploadRequest(req)) {
              return res.status(400).json({
                success: false,
                code: "INVALID_MAGIC_BYTES",
                message: invalidMagicMessage,
              });
            }
            if (req.flash) {
              req.flash("error", invalidMagicMessage);
            }
            return res.redirect(resolveFormFallbackUrl(req));
          }
        }

        return next();
      } catch (verifyErr) {
        req.file = undefined;
        req.files = undefined;
        return next(verifyErr);
      }
    });
  };
}

const imageFilter = buildFileFilter({
  allowedMimes: IMAGE_ALLOWED_MIMES,
  allowedExts: IMAGE_ALLOWED_EXTS,
  defaultFallbackName: "image.webp",
  invalidMessage: "Định dạng ảnh không hợp lệ. Chỉ chấp nhận JPG, PNG hoặc WebP.",
});

const cvPdfFilter = buildFileFilter({
  allowedMimes: CV_ALLOWED_MIMES,
  allowedExts: CV_ALLOWED_EXTS,
  defaultFallbackName: "CV.pdf",
  invalidMessage: "File CV không đúng định dạng PDF hợp lệ.",
});

// Upload Logo: tối đa 1 ảnh, 2MB
const uploadLogoMulter = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 50, fieldSize: 512 * 1024 },
});

// Upload Avatar: tối đa 1 ảnh, 2MB
const uploadAvatarMulter = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 50, fieldSize: 512 * 1024 },
});

// Upload Job Images: tối đa 5 ảnh, mỗi ảnh tối đa 3MB
const uploadJobImagesMulter = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 3 * 1024 * 1024, files: 5, fields: 50, fieldSize: 512 * 1024 },
});

// Upload CV PDF: tối đa 1 file PDF, 5MB
const uploadCvMulter = multer({
  storage,
  fileFilter: cvPdfFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 30, fieldSize: 256 * 1024 },
});

// Upload Article Thumbnail: tối đa 1 ảnh, 5MB
const uploadArticleThumbnailMulter = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 50, fieldSize: 512 * 1024 },
});

const INVALID_IMAGE_MAGIC_MSG = "Nội dung file ảnh không khớp định dạng thực tế (chỉ chấp nhận JPG, PNG hoặc WebP).";
const INVALID_PDF_MAGIC_MSG = "File CV không đúng định dạng PDF hợp lệ hoặc chứa nội dung không an toàn.";

module.exports = {
  uploadLogoMiddleware: wrapSafeUpload(uploadLogoMulter.single("logo"), {
    kind: "image",
    maxMb: 2,
    invalidMagicMessage: INVALID_IMAGE_MAGIC_MSG,
  }),
  uploadAvatarMiddleware: wrapSafeUpload(uploadAvatarMulter.single("avatar"), {
    kind: "image",
    maxMb: 2,
    invalidMagicMessage: INVALID_IMAGE_MAGIC_MSG,
  }),
  uploadArticleThumbnailMiddleware: wrapSafeUpload(uploadArticleThumbnailMulter.single("thumbnailFile"), {
    kind: "image",
    maxMb: 5,
    invalidMagicMessage: INVALID_IMAGE_MAGIC_MSG,
  }),
  uploadJobImagesMiddleware: wrapSafeUpload(uploadJobImagesMulter.array("images", 5), {
    kind: "image",
    maxMb: 3,
    invalidMagicMessage: INVALID_IMAGE_MAGIC_MSG,
  }),
  uploadCvMiddleware: wrapSafeUpload(uploadCvMulter.single("cv"), {
    kind: "pdf",
    maxMb: 5,
    invalidMagicMessage: INVALID_PDF_MAGIC_MSG,
  }),
};
