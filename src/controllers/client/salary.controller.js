// src/controllers/client/salary.controller.js
const salaryService = require("../../services/salary.service");
const { Skill } = require("../../models");
const { POSITIONS, CITIES } = require("../../config/constants");

/**
 * Parse mức lương người dùng nhập (VNĐ/tháng). Trả về { value, error }.
 * - Chấp nhận "25000000", "25.000.000", "25,000,000", "25 000 000"
 * - Từ chối số âm, số thập phân lẻ, chữ lẫn số (không còn replace(/\D/g,"") làm -25M thành +25M)
 */
function parseSalaryInput(raw) {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first === undefined || first === null || String(first).trim() === "") {
    return { value: null, error: null };
  }
  const str = String(first).trim();
  if (str.startsWith("-")) {
    return { value: null, error: "Mức lương không được là số âm." };
  }
  // Dấu . , khoảng trắng chỉ hợp lệ khi là dấu ngăn cách nhóm 3 chữ số
  const grouped = /^\d{1,3}([.,\s]\d{3})+$/.test(str);
  const plain = /^\d+$/.test(str);
  if (!grouped && !plain) {
    return { value: null, error: "Mức lương không hợp lệ. Vui lòng nhập số nguyên (VNĐ/tháng)." };
  }
  const value = parseInt(str.replace(/[.,\s]/g, ""), 10);
  if (!Number.isFinite(value) || value <= 0) {
    return { value: null, error: "Mức lương phải lớn hơn 0." };
  }
  if (value > 10000000000) {
    return { value: null, error: "Mức lương vượt quá giới hạn cho phép." };
  }
  return { value, error: null };
}

/**
 * Hiển thị trang Tra cứu & So sánh Lương IT
 */
async function renderSalaryBenchmark(req, res) {
  const pick = (v, def = "") => (typeof (Array.isArray(v) ? v[0] : v) === "string" ? (Array.isArray(v) ? v[0] : v) : def);
  const position = pick(req.query.position, "junior");
  const skill = pick(req.query.skill);
  const city = pick(req.query.city);
  const { value: parsedSalary, error: salaryError } = parseSalaryInput(req.query.salary);

  const stats = await salaryService.getSalaryStats({
    position,
    skill,
    city,
  });

  const evaluation = parsedSalary
    ? salaryService.evaluateSalaryRank(parsedSalary, stats)
    : null;

  // Lấy danh sách kỹ năng phổ biến để gợi ý
  const popularSkills = await Skill.find({}).limit(12).lean();

  // Bảng lộ trình lương theo cấp bậc, nhân hệ số kỹ năng/khu vực đang chọn (QA-P02)
  const roundHalfMillion = (v) => Math.round(v / 500000) * 500000;
  const levelRows = Object.entries(salaryService.SALARY_BENCHMARKS.positions).map(([key, b]) => ({
    key,
    label: b.label,
    min: roundHalfMillion(b.min * (stats.multiplier || 1)),
    median: roundHalfMillion(b.median * (stats.multiplier || 1)),
    max: roundHalfMillion(b.max * (stats.multiplier || 1)),
  }));

  res.render("pages/salary-benchmark", {
    title: "Tra Cứu & So Sánh Mức Lương IT 2026 | VN.ITJobs",
    stats,
    evaluation,
    salaryError,
    levelRows,
    query: {
      position,
      skill,
      city,
      salary: parsedSalary,
    },
    positions: POSITIONS,
    cities: CITIES,
    popularSkills,
  });
}

/**
 * API tính toán mức lương (trả về JSON)
 */
async function getSalaryApi(req, res) {
  const pick = (v, def = "") => (typeof (Array.isArray(v) ? v[0] : v) === "string" ? (Array.isArray(v) ? v[0] : v) : def);
  const position = pick(req.query.position, "junior");
  const skill = pick(req.query.skill);
  const city = pick(req.query.city);
  const { value: parsedSalary, error: salaryError } = parseSalaryInput(req.query.salary);

  if (salaryError) {
    return res.status(400).json({ success: false, message: salaryError });
  }

  const stats = await salaryService.getSalaryStats({ position, skill, city });
  const evaluation = parsedSalary
    ? salaryService.evaluateSalaryRank(parsedSalary, stats)
    : null;

  return res.json({
    success: true,
    stats,
    evaluation,
  });
}

module.exports = {
  renderSalaryBenchmark,
  getSalaryApi,
  parseSalaryInput,
};
