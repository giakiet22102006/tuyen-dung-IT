// src/utils/formatSalary.js
/**
 * Định dạng mức lương hiển thị theo yêu cầu
 * @param {number|null} min - Mức lương tối thiểu (USD)
 * @param {number|null} max - Mức lương tối đa (USD)
 * @returns {string} Chuỗi hiển thị (ví dụ: "1.000$ - 1.500$", "Từ 1.000$", "Tới 1.500$", "Thương lượng")
 */
function formatSalary(min, max) {
  const hasMin = min !== undefined && min !== null && min !== "" && !isNaN(Number(min)) && Number(min) > 0;
  const hasMax = max !== undefined && max !== null && max !== "" && !isNaN(Number(max)) && Number(max) > 0;

  if (hasMin && hasMax) {
    return `${Number(min).toLocaleString("vi-VN")}$ - ${Number(max).toLocaleString("vi-VN")}$`;
  }
  if (hasMin && !hasMax) {
    return `Từ ${Number(min).toLocaleString("vi-VN")}$`;
  }
  if (!hasMin && hasMax) {
    return `Tới ${Number(max).toLocaleString("vi-VN")}$`;
  }
  return "Thương lượng";
}

module.exports = formatSalary;
