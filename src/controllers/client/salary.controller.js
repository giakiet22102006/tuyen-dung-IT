// src/controllers/client/salary.controller.js
const salaryService = require("../../services/salary.service");
const { Skill } = require("../../models");
const { POSITIONS, CITIES } = require("../../config/constants");

/**
 * Hiển thị trang Tra cứu & So sánh Lương IT
 */
async function renderSalaryBenchmark(req, res) {
  const {
    position = "junior",
    skill = "",
    city = "",
    salary = "",
  } = req.query;

  const parsedSalary = salary ? parseInt(String(salary).replace(/\D/g, ""), 10) : null;

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

  res.render("pages/salary-benchmark", {
    title: "Tra Cứu & So Sánh Mức Lương IT 2026 | VN.ITJobs",
    stats,
    evaluation,
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
  const { position = "junior", skill = "", city = "", salary = "" } = req.query;
  const parsedSalary = salary ? parseInt(String(salary).replace(/\D/g, ""), 10) : null;

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
};
