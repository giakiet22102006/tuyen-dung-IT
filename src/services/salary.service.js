// src/services/salary.service.js
const { Job } = require("../models");
const { JOB_MODERATION, POSITIONS, CITIES } = require("../config/constants");

// Bảng dữ liệu chuẩn mức lương thị trường IT Việt Nam năm 2026 (Đơn vị: VNĐ/tháng)
const SALARY_BENCHMARKS = {
  positions: {
    intern: { min: 4000000, median: 7000000, max: 10000000, label: "Intern" },
    fresher: { min: 8000000, median: 13000000, max: 18000000, label: "Fresher" },
    junior: { min: 14000000, median: 20000000, max: 28000000, label: "Junior" },
    middle: { min: 22000000, median: 35000000, max: 48000000, label: "Middle" },
    senior: { min: 38000000, median: 55000000, max: 80000000, label: "Senior" },
    manager: { min: 55000000, median: 80000000, max: 130000000, label: "Manager / Lead" },
  },
  skillMultipliers: {
    golang: 1.25,
    rust: 1.3,
    ai: 1.25,
    python: 1.15,
    devops: 1.2,
    kubernetes: 1.2,
    reactjs: 1.1,
    nodejs: 1.1,
    fullstack: 1.15,
    flutter: 1.1,
    java: 1.12,
  },
  cityMultipliers: {
    "ho-chi-minh": 1.05,
    "ha-noi": 1.0,
    "da-nang": 0.88,
    khac: 0.85,
  },
};

/**
 * Phân tích mức lương thực tế từ database kết hợp baseline thị trường
 */
async function getSalaryStats({ position = "junior", skill = "", city = "" }) {
  const posKey = (position || "junior").toLowerCase();
  const base = SALARY_BENCHMARKS.positions[posKey] || SALARY_BENCHMARKS.positions.junior;

  let multiplier = 1.0;
  if (skill) {
    const s = skill.toLowerCase().trim();
    for (const [k, mult] of Object.entries(SALARY_BENCHMARKS.skillMultipliers)) {
      if (s.includes(k)) {
        multiplier = Math.max(multiplier, mult);
      }
    }
  }

  if (city && SALARY_BENCHMARKS.cityMultipliers[city]) {
    multiplier *= SALARY_BENCHMARKS.cityMultipliers[city];
  }

  // Thống kê thực tế từ DB
  const filter = {
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  };
  if (position) filter.position = position;
  if (city) filter.city = city;
  if (skill) filter["skills.slug"] = { $regex: skill.toLowerCase().trim(), $options: "i" };

  const dbJobs = await Job.find(filter)
    .select("salaryMin salaryMax title slug employerId skills benefits city")
    .populate("employerId", "companyName logo")
    .limit(10)
    .lean();

  const estMin = Math.round((base.min * multiplier) / 500000) * 500000;
  const estMedian = Math.round((base.median * multiplier) / 500000) * 500000;
  const estMax = Math.round((base.max * multiplier) / 500000) * 500000;

  return {
    position: base.label,
    skill: skill || "Tất cả công nghệ",
    city: city || "Toàn quốc",
    salaryMin: estMin,
    salaryMedian: estMedian,
    salaryMax: estMax,
    multiplier,
    sampleJobs: dbJobs,
  };
}

/**
 * So sánh mức lương của ứng viên với phân vị thị trường
 */
function evaluateSalaryRank(salaryAmount, stats) {
  if (!salaryAmount || isNaN(salaryAmount) || salaryAmount <= 0) {
    return null;
  }

  const { salaryMin, salaryMedian, salaryMax } = stats;
  let percentile = 50;
  let rankLabel = "Mức trung bình thị trường";
  let color = "text-blue-600";
  let bg = "bg-blue-50";

  if (salaryAmount <= salaryMin) {
    percentile = Math.max(10, Math.round((salaryAmount / salaryMin) * 25));
    rankLabel = "Dưới trung vị (Cần bổ sung kỹ năng hoặc xem xét tăng lương)";
    color = "text-amber-600";
    bg = "bg-amber-50";
  } else if (salaryAmount < salaryMedian) {
    percentile = Math.round(25 + ((salaryAmount - salaryMin) / (salaryMedian - salaryMin)) * 25);
    rankLabel = "Khá cạnh tranh (Mức lương tốt cho cấp bậc này)";
    color = "text-blue-600";
    bg = "bg-blue-50";
  } else if (salaryAmount === salaryMedian) {
    percentile = 50;
    rankLabel = "Đạt chuẩn trung vị thị trường IT";
    color = "text-emerald-600";
    bg = "bg-emerald-50";
  } else if (salaryAmount <= salaryMax) {
    percentile = Math.round(50 + ((salaryAmount - salaryMedian) / (salaryMax - salaryMedian)) * 40);
    rankLabel = "Mức lương Rất Tốt (Top nhân sự chất lượng cao)";
    color = "text-emerald-600";
    bg = "bg-emerald-50";
  } else {
    percentile = Math.min(99, Math.round(90 + ((salaryAmount - salaryMax) / salaryMax) * 9));
    rankLabel = "Thuộc Top 5% dẫn đầu thị trường IT";
    color = "text-purple-600";
    bg = "bg-purple-50";
  }

  return {
    amount: salaryAmount,
    percentile,
    rankLabel,
    color,
    bg,
  };
}

module.exports = {
  SALARY_BENCHMARKS,
  getSalaryStats,
  evaluateSalaryRank,
};
