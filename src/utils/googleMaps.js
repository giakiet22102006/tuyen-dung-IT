// src/utils/googleMaps.js
const { CITIES } = require("../config/constants");

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

  // Nếu công ty hoàn toàn không có địa chỉ cụ thể và không có link ghim Google Maps
  // => Trả về null để không hiển thị bản đồ rỗng
  if (!address && !customMapUrl) {
    return null;
  }

  let embedUrl = "";
  let searchUrl = "";
  let fullAddress = address;

  if (address && cityLabel && !address.toLowerCase().includes(cityLabel.toLowerCase())) {
    fullAddress = `${address}, ${cityLabel}`;
  } else if (!address && cityLabel) {
    fullAddress = cityLabel;
  }

  // 1. Kiểm tra nếu có link nhúng Google Maps iframe hoặc URL ghim tùy chỉnh
  if (customMapUrl) {
    const iframeSrcMatch = customMapUrl.match(/src=["'](.*?)["']/i);
    if (iframeSrcMatch && iframeSrcMatch[1]) {
      embedUrl = iframeSrcMatch[1];
    } else if (customMapUrl.includes("google.com/maps/embed")) {
      embedUrl = customMapUrl;
    } else {
      searchUrl = customMapUrl;
    }
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
};
