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
  // Bảo toàn ngữ nghĩa ngôn ngữ lập trình phổ biến trước khi lọc ký tự đặc biệt (C vs C++ vs C# vs .NET)
  const preNormalized = normalizeVi(text)
    .replace(/\+\+/g, "-plus-plus")
    .replace(/\+/g, "-plus")
    .replace(/#/g, "-sharp")
    .replace(/([a-z0-9])\.net\b/g, "$1-dotnet")
    .replace(/(^|\s)\.net\b/g, "$1dotnet");

  const normalized = preNormalized
    .replace(/[^a-z0-9\s-]/g, "") // Bỏ ký tự đặc biệt
    .replace(/\s+/g, "-")          // Thay khoảng trắng bằng gạch nối
    .replace(/-+/g, "-")          // Gộp nhiều gạch nối liên tiếp
    .replace(/^-+|-+$/g, "");     // Cắt gạch nối ở đầu và cuối

  if (!normalized) return "";

  if (withSuffix) {
    const suffix = crypto.randomBytes(3).toString("hex"); // 6 ký tự hex
    return `${normalized}-${suffix}`;
  }
  return normalized;
}

module.exports = slugify;
