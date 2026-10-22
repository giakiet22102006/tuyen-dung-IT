// src/utils/pagination.js
/**
 * Tiện ích hỗ trợ phân trang
 * @param {number} totalItems - Tổng số mục
 * @param {number|string} page - Trang hiện tại
 * @param {number} limit - Số mục mỗi trang (mặc định 9 hoặc 10)
 */
function paginate(totalItems, page = 1, limit = 9) {
  const current = Math.max(1, parseInt(page, 10) || 1);
  const itemsPerPage = Math.max(1, parseInt(limit, 10) || 9);
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const validPage = Math.min(current, totalPages);
  const skip = (validPage - 1) * itemsPerPage;

  return {
    totalItems,
    totalPages,
    currentPage: validPage,
    limit: itemsPerPage,
    skip,
    hasNext: validPage < totalPages,
    hasPrev: validPage > 1,
  };
}

module.exports = paginate;
