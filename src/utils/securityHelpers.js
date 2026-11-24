// src/utils/securityHelpers.js
const isSafeRedirect = require("./sanitizeRedirect");

const MAX_REGEX_INPUT_LENGTH = 100;

/**
 * Escape ký tự đặc biệt của Regular Expression để chống ReDoS khi dùng với new RegExp / $regex.
 * Đồng thời giới hạn độ dài đầu vào để ngăn chuỗi cực lớn tiêu tốn CPU.
 */
function escapeRegex(input, maxLen = MAX_REGEX_INPUT_LENGTH) {
  if (typeof input !== "string") return "";
  const trimmed = input.trim().slice(0, maxLen);
  return trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Kiểm tra ObjectId 24-hex hợp lệ (nghiêm ngặt hơn mongoose.Types.ObjectId.isValid
 * vốn chấp nhận cả chuỗi 12 ký tự bất kỳ hoặc object).
 */
function isValidObjectId(id) {
  return typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
}

/**
 * Loại bỏ đệ quy các key nguy hiểm ($ operator, dấu chấm path traversal MongoDB,
 * và prototype pollution keys) khỏi object đầu vào.
 */
function stripMongoOperators(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = stripMongoOperators(value[i], depth + 1);
    }
    return value;
  }

  for (const key of Object.keys(value)) {
    if (
      key.startsWith("$") ||
      key.includes(".") ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype"
    ) {
      delete value[key];
      continue;
    }
    value[key] = stripMongoOperators(value[key], depth + 1);
  }
  return value;
}

/**
 * Express middleware lọc NoSQL operator injection ($gt, $ne, $where, ...) trong body/query/params.
 */
function noSqlSanitizeMiddleware(req, _res, next) {
  if (req.body && typeof req.body === "object") {
    stripMongoOperators(req.body);
  }
  if (req.query && typeof req.query === "object") {
    stripMongoOperators(req.query);
  }
  if (req.params && typeof req.params === "object") {
    stripMongoOperators(req.params);
  }
  next();
}

/**
 * Kiểm tra và chuẩn hóa URL an toàn cho thuộc tính href/src.
 * Chặn javascript:, data:, vbscript:, protocol-relative // và control chars.
 */
function safeUrl(rawUrl, options = {}) {
  const { allowRelative = false } = options;
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return "";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return "";

  if (allowRelative && trimmed.startsWith("/")) {
    return isSafeRedirect(trimmed) ? trimmed : "";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Rút trích đường dẫn quay lại an toàn từ req.headers.referer (chống Open Redirect).
 * Chỉ chấp nhận referer cùng host với request hiện tại và vượt qua isSafeRedirect().
 */
function getSafeBackRedirect(req, fallback = "/") {
  const safeFallback = isSafeRedirect(fallback) ? fallback : "/";
  const rawReferer = req && req.headers ? req.headers.referer : null;
  if (!rawReferer || typeof rawReferer !== "string") {
    return safeFallback;
  }

  try {
    const parsedRef = new URL(rawReferer);
    const currentHost = typeof req.get === "function" ? req.get("host") : req.headers.host;
    if (!currentHost || parsedRef.host !== currentHost) {
      return safeFallback;
    }
    const candidatePath = `${parsedRef.pathname}${parsedRef.search}`;
    return isSafeRedirect(candidatePath) ? candidatePath : safeFallback;
  } catch {
    return safeFallback;
  }
}

/**
 * Loại bỏ CR/LF/NUL cho các trường header đơn dòng (Email Subject/To/Reply-To, ICS, v.v.).
 */
function sanitizeSingleLine(str, maxLen = 500) {
  if (str === null || str === undefined) return "";
  return String(str)
    // eslint-disable-next-line no-control-regex
    .replace(/[\r\n\u0000-\u001F\u007F]+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * Escape các ký tự đặc biệt HTML để chống HTML/XSS Injection.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tuần tự hóa JSON an toàn khi nhúng trực tiếp vào thẻ <script> (chặn </script> breakout).
 */
function safeJsonForScript(data) {
  const json = JSON.stringify(data === undefined ? null : data);
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

module.exports = {
  escapeRegex,
  isValidObjectId,
  stripMongoOperators,
  noSqlSanitizeMiddleware,
  safeUrl,
  getSafeBackRedirect,
  sanitizeSingleLine,
  escapeHtml,
  safeJsonForScript,
};
