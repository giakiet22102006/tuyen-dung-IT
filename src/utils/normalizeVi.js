// src/utils/normalizeVi.js
/**
 * Chuyển đổi văn bản tiếng Việt có dấu thành không dấu và chữ thường
 * Xử lý chính xác chữ 'đ', 'Đ' và các dấu tổ hợp
 */
function normalizeVi(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Bỏ dấu thanh
    .replace(/[đĐ]/g, "d")           // Thay thế đ, Đ bằng d
    .toLowerCase()
    .trim();
}

module.exports = normalizeVi;
