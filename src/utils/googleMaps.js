// src/utils/googleMaps.js
const { CITIES } = require("../config/constants");

const ALLOWED_GMAPS_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.com.vn",
  "www.google.com.vn",
  "maps.google.com.vn",
  "goo.gl",
  "maps.app.goo.gl",
]);

function isAllowedGoogleMapsHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (ALLOWED_GMAPS_HOSTS.has(host)) return true;
  return host.endsWith(".google.com") || host.endsWith(".google.com.vn");
}

/**
 * Validate một URL Google Maps tùy chỉnh:
 * - Bắt buộc https:
 * - Hostname nằm trong allowlist Google Maps (chặn javascript:, data:, iframe phishing)
 * - Với chế độ embed, chỉ cho phép đường dẫn /maps/embed hoặc /maps?...output=embed trên *.google.com
 */
function validateGoogleMapsUrl(rawUrl, { forEmbed = false } = {}) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return "";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return "";
    if (!isAllowedGoogleMapsHost(parsed.hostname)) return "";

    if (forEmbed) {
      const host = parsed.hostname.toLowerCase();
      const isGoogleDomain = host === "google.com" || host.endsWith(".google.com") || host === "google.com.vn" || host.endsWith(".google.com.vn");
      if (!isGoogleDomain) return "";
      const isEmbedPath =
        parsed.pathname.startsWith("/maps/embed") ||
        (parsed.pathname.startsWith("/maps") && parsed.searchParams.get("output") === "embed");
      if (!isEmbedPath) return "";
    }

    return parsed.href;
  } catch {
    return "";
  }
}

/**
 * Chuẩn hóa chuỗi googleMapsUrl trước khi lưu vào DB (trích xuất src nếu là iframe nhúng hợp lệ)
 */
function sanitizeGoogleMapsInput(rawInput) {
  if (!rawInput || typeof rawInput !== "string") return "";
  const trimmed = rawInput.trim();
  if (!trimmed) return "";

  const iframeSrcMatch = trimmed.match(/src=["']([^"']+)["']/i);
  if (iframeSrcMatch && iframeSrcMatch[1]) {
    return validateGoogleMapsUrl(iframeSrcMatch[1], { forEmbed: true });
  }

  return (
    validateGoogleMapsUrl(trimmed, { forEmbed: true }) ||
    validateGoogleMapsUrl(trimmed, { forEmbed: false })
  );
}

/**
 * Trích xuất và chuẩn hóa thông tin bản đồ Google Maps cho công ty
 * @param {Object} company - Đối tượng thông tin công ty (Employer)
 * @param {Object} [job] - Đối tượng công việc (tùy chọn)
 * @returns {Object|null} - Trả về null nếu công ty không có địa chỉ cụ thể
 */
function getCompanyMapData(company, job = null) {
  if (!company) return null;

  // Ưu tiên địa chỉ công việc nếu có, hoặc địa chỉ công ty
  const address = (job && job.address ? job.address : company.address || "").trim();
  const cityCode = (job && job.city ? job.city : company.city || "").trim();
  const customMapUrl = (company.googleMapsUrl || "").trim();

  // Tra cứu tên thành phố hiển thị tiếng Việt (Hà Nội, TP. Hồ Chí Minh, Đà Nẵng...)
  const cityObj = CITIES.find((c) => c.value === cityCode);
  const cityLabel = cityObj ? cityObj.label : cityCode;

  let embedUrl = "";
  let searchUrl = "";
  let fullAddress = address;

  if (address && cityLabel && !address.toLowerCase().includes(cityLabel.toLowerCase())) {
    fullAddress = `${address}, ${cityLabel}`;
  } else if (!address && cityLabel) {
    fullAddress = cityLabel;
  }

  // 1. Kiểm tra & validate nghiêm ngặt link nhúng Google Maps iframe hoặc URL ghim tùy chỉnh
  if (customMapUrl) {
    const iframeSrcMatch = customMapUrl.match(/src=["']([^"']+)["']/i);
    if (iframeSrcMatch && iframeSrcMatch[1]) {
      embedUrl = validateGoogleMapsUrl(iframeSrcMatch[1], { forEmbed: true });
    } else {
      const validEmbed = validateGoogleMapsUrl(customMapUrl, { forEmbed: true });
      if (validEmbed) {
        embedUrl = validEmbed;
      } else {
        searchUrl = validateGoogleMapsUrl(customMapUrl, { forEmbed: false });
      }
    }
  }

  // Nếu không có địa chỉ cụ thể và customMapUrl không hợp lệ => trả về null
  if (!address && !embedUrl && !searchUrl) {
    return null;
  }

  // 2. Tự động tạo link Embed chuẩn của Google Maps (không phụ thuộc billing key)
  if (!embedUrl) {
    const query = company.companyName && address
      ? `${company.companyName}, ${fullAddress}`
      : (fullAddress || company.companyName);

    embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
  }

  // 3. Tự động tạo URL mở ứng dụng Google Maps / Chỉ đường
  if (!searchUrl) {
    const query = company.companyName && address
      ? `${company.companyName}, ${fullAddress}`
      : (fullAddress || company.companyName);

    searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  return {
    embedUrl,
    searchUrl,
    fullAddress,
    hasAddress: Boolean(address),
    companyName: company.companyName,
  };
}

module.exports = {
  getCompanyMapData,
  validateGoogleMapsUrl,
  sanitizeGoogleMapsInput,
};
