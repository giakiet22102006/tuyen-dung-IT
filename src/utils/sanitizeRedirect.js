// src/utils/sanitizeRedirect.js

const MAX_REDIRECT_LENGTH = 2048;
// Chặn toàn bộ ASCII C0 control chars (\u0000-\u001F), DEL (\u007F) và backslash (\)
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS_REGEX = /[\u0000-\u001F\u007F\\]/;
// Chặn bypass URL-encoded double-slash, backslash hoặc control chars ở đầu đường dẫn
const ENCODED_PREFIX_BYPASS_REGEX = /^\/(?:%2f|%5c|%09|%0a|%0d|%00|%0b|%0c)/i;

/**
 * Kiểm tra xem URL đích có phải là đường dẫn nội bộ an toàn hay không.
 * Chặn các trường hợp Open Redirect & CRLF Injection:
 * - Chuỗi có khoảng trắng / CRLF ở đầu hoặc cuối (tránh caller redirect chuỗi gốc chưa trim)
 * - Protocol-relative URL: //evil.com hoặc /%2fevil.com
 * - Backslash / Control-char bypass: /\evil.com, /\x0b/evil.com, /%5cevil.com
 * - URL tuyệt đối có schema hoặc thông tin xác thực host: http://, https://, javascript:, data:, /@evil.com
 */
function isSafeRedirect(url) {
  if (!url || typeof url !== "string") return false;
  if (url.length > MAX_REDIRECT_LENGTH) return false;

  // Kiểm tra trực tiếp trên chuỗi gốc (không dựa vào bản đã trim để tránh lệch dữ liệu khi redirect)
  if (url !== url.trim()) return false;
  if (UNSAFE_CHARS_REGEX.test(url)) return false;

  // Bắt buộc bắt đầu bằng đúng 1 dấu '/' và không theo sau bởi '/'
  if (!url.startsWith("/") || url.startsWith("//")) return false;
  if (ENCODED_PREFIX_BYPASS_REGEX.test(url)) return false;

  // Kiểm chứng qua WHATWG URL parser: đảm bảo giữ nguyên cùng origin nội bộ và không mang credentials
  try {
    const parsed = new URL(url, "http://localhost");
    if (
      parsed.origin !== "http://localhost" ||
      parsed.host !== "localhost" ||
      parsed.username !== "" ||
      parsed.password !== ""
    ) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Trả về đường dẫn nội bộ hợp lệ hoặc fallback mặc định
 */
function resolveSafeRedirect(url, fallback = "/") {
  return isSafeRedirect(url) ? url : fallback;
}

isSafeRedirect.resolveSafeRedirect = resolveSafeRedirect;
module.exports = isSafeRedirect;
