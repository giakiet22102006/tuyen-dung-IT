// src/utils/sanitizeRedirect.js

/**
 * Kiểm tra xem URL đích có phải là đường dẫn nội bộ an toàn hay không.
 * Chặn các trường hợp Open Redirect:
 * - Protocol-relative URL: //evil.com
 * - Backslash bypass: /\evil.com hoặc \evil.com
 * - URL tuyệt đối có schema: http://, https://, javascript:, data:
 */
function isSafeRedirect(url) {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  // Bắt buộc bắt đầu bằng đúng 1 dấu gạch chéo '/' và không theo sau bởi '/' hoặc '\'
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return false;
  }
  // Đảm bảo không chứa ký tự điều khiển hay backslash
  if (/[\r\n\t\\]/.test(trimmed)) {
    return false;
  }
  return true;
}

module.exports = isSafeRedirect;
