// src/utils/slugify.js
const crypto = require("crypto");
const normalizeVi = require("./normalizeVi");

/**
 * Chuyển đổi chuỗi thành slug thân thiện với URL
 * @param {string} text - Chuỗi đầu vào
 * @param {boolean} withSuffix - Có kèm theo hậu tố ngẫu nhiên để tránh trùng hay không
 */
function slugify(text, withSuffix = false) {
  if (!text) return "";
  const normalized = normalizeVi(text)
    .replace(/[^a-z0-9\s-]/g, "") // Bỏ ký tự đặc biệt
    .replace(/\s+/g, "-")          // Thay khoảng trắng bằng gạch nối
    .replace(/-+/g, "-")          // Gộp nhiều gạch nối liên tiếp
    .replace(/^-+|-+$/g, "");     // Cắt gạch nối ở đầu và cuối

  if (withSuffix) {
    const suffix = crypto.randomBytes(3).toString("hex"); // 6 ký tự hex
    return `${normalized}-${suffix}`;
  }
  return normalized;
}

module.exports = slugify;
