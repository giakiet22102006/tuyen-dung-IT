// src/services/job.service.js
const NodeCache = require("node-cache");
const { Job, Employer, Skill } = require("../models");
const { EMPLOYER_STATUS, JOB_MODERATION, CITIES, POSITIONS, WORKING_FORMS } = require("../config/constants");
const normalizeVi = require("../utils/normalizeVi");
const paginate = require("../utils/pagination");
const { findDidYouMean, clearVocabCache } = require("./fuzzySearch.service");

const statsCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const TOTAL_JOBS_KEY = "total_public_jobs";

async function getTotalPublicJobsCount() {
  const cached = statsCache.get(TOTAL_JOBS_KEY);
  if (cached !== undefined) return cached;

  const count = await Job.countDocuments({
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  });
  statsCache.set(TOTAL_JOBS_KEY, count);
  return count;
}

function clearStatsCache() {
  statsCache.del(TOTAL_JOBS_KEY);
  clearVocabCache();
}

/**
 * Lấy danh sách 9 nhà tuyển dụng hàng đầu có nhiều việc làm nhất
 * Khử hoàn toàn N+1 bằng aggregate
 */
async function getTopEmployers(limit = 9) {
  // Aggregate nhóm theo employerId và đếm số việc làm mở
  const topJobCounts = await Job.aggregate([
    {
      $match: {
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: "$employerId",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  const topIds = topJobCounts.map((item) => item._id);
  const countMap = new Map();
  topJobCounts.forEach((item) => countMap.set(item._id.toString(), item.count));

  // Lấy thông tin công ty active
  const employers = await Employer.find({
    _id: { $in: topIds },
    status: EMPLOYER_STATUS.ACTIVE,
    deletedAt: null,
  })
    .select("companyName slug logo city")
    .lean();

  // Sắp xếp lại theo thứ tự số lượng job giảm dần
  const result = employers.map((emp) => ({
    ...emp,
    jobCount: countMap.get(emp._id.toString()) || 0,
  }));

  result.sort((a, b) => b.jobCount - a.jobCount);

  // Nếu chưa đủ limit, bù thêm các employer active khác
  if (result.length < limit) {
    const existingIds = result.map((r) => r._id);
    const fillerEmployers = await Employer.find({
      _id: { $nin: existingIds },
      status: EMPLOYER_STATUS.ACTIVE,
      deletedAt: null,
    })
      .limit(limit - result.length)
      .select("companyName slug logo city")
      .lean();

    fillerEmployers.forEach((emp) => {
      result.push({
        ...emp,
        jobCount: 0,
      });
    });
  }

  return result;
}

/**
 * Tìm kiếm việc làm công khai với bộ lọc, phân trang, Fuzzy Search và Typo Tolerance
 */
async function searchJobs(query = {}) {
  const { city, keyword, skill, position, workingForm, company, page, exact } = query;

  const baseFilter = {
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  };

  if (city && city.trim()) {
    baseFilter.city = city.trim();
  }

  if (position && position.trim()) {
    baseFilter.position = position.trim();
  }

  if (workingForm && workingForm.trim()) {
    baseFilter.workingForm = workingForm.trim();
  }

  if (skill && skill.trim()) {
    baseFilter["skills.slug"] = skill.toLowerCase().trim();
  }

  if (company && company.trim()) {
    const emp = await Employer.findOne({ slug: company.trim(), status: EMPLOYER_STATUS.ACTIVE });
    if (emp) {
      baseFilter.employerId = emp._id;
    } else {
      // Công ty không tồn tại thì không ra kết quả
      return {
        jobs: [],
        pagination: paginate(0, 1, 9),
        isFuzzyApplied: false,
        didYouMean: null,
      };
    }
  }

  const filter = { ...baseFilter };
  let originalKeyword = "";
  let isFuzzyApplied = false;
  let suggestedKeyword = "";
  let didYouMean = null;

  if (keyword && keyword.trim()) {
    originalKeyword = keyword.trim();
    const normalized = normalizeVi(originalKeyword);
    filter.searchText = { $regex: normalized, $options: "i" };
  }

  let total = await Job.countDocuments(filter);

  // LOGIC FUZZY SEARCH (TÌM KIẾM MỜ) & TYPO TOLERANCE (BỎ QUA LỖI CHÍNH TẢ)
  if (originalKeyword) {
    const suggestionInfo = await findDidYouMean(originalKeyword);

    if (total > 0) {
      // Đã có kết quả chính xác. Nếu có gợi ý chính tả khác với từ khóa nhập, hiển thị Did You Mean
      if (suggestionInfo && normalizeVi(suggestionInfo.suggestion) !== normalizeVi(originalKeyword)) {
        didYouMean = suggestionInfo.displayText || suggestionInfo.suggestion;
      }
    } else if (exact !== "true" && exact !== true) {
      // 0 kết quả chính xác và người dùng không chọn chế độ bắt buộc tìm chính xác (&exact=true)
      // Tự động kích hoạt Fuzzy Typo Tolerance:
      if (suggestionInfo && suggestionInfo.suggestion) {
        const fuzzyNormalized = normalizeVi(suggestionInfo.suggestion);
        const fuzzyFilter = {
          ...baseFilter,
          searchText: { $regex: fuzzyNormalized, $options: "i" },
        };

        const fuzzyTotal = await Job.countDocuments(fuzzyFilter);
        if (fuzzyTotal > 0) {
          // Tìm thấy kết quả từ khóa gợi ý!
          total = fuzzyTotal;
          filter.searchText = fuzzyFilter.searchText;
          isFuzzyApplied = true;
          suggestedKeyword = suggestionInfo.displayText || suggestionInfo.suggestion;
          didYouMean = suggestedKeyword;
        } else {
          // Dù chưa có job cho từ gợi ý, vẫn lưu để hiển thị "Có phải bạn muốn tìm..."
          didYouMean = suggestionInfo.displayText || suggestionInfo.suggestion;
        }
      }
    }
  }

  const pagination = paginate(total, page || 1, 9);

  const jobs = await Job.find(filter)
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .populate("employerId", "companyName slug logo")
    .select("title slug salaryMin salaryMax position workingForm skills city createdAt employerId")
    .lean();

  return {
    jobs,
    pagination,
    isFuzzyApplied,
    originalKeyword,
    suggestedKeyword,
    didYouMean,
  };
}

/**
 * Danh sách công ty có phân trang và đếm job bằng batch aggregate
 */
async function getCompanyList(page = 1, limit = 9) {
  const filter = {
    status: EMPLOYER_STATUS.ACTIVE,
    deletedAt: null,
  };

  const total = await Employer.countDocuments(filter);
  const pagination = paginate(total, page, limit);

  const employers = await Employer.find(filter)
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .select("companyName slug logo city")
    .lean();

  if (employers.length === 0) {
    return { employers: [], pagination };
  }

  // Đếm số job bằng 1 lệnh aggregate cho 9 công ty này (Không N+1)
  const empIds = employers.map((e) => e._id);
  const jobCounts = await Job.aggregate([
    {
      $match: {
        employerId: { $in: empIds },
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: "$employerId",
        count: { $sum: 1 },
      },
    },
  ]);

  const countMap = new Map();
  jobCounts.forEach((item) => countMap.set(item._id.toString(), item.count));

  const result = employers.map((emp) => ({
    ...emp,
    jobCount: countMap.get(emp._id.toString()) || 0,
  }));

  return { employers: result, pagination };
}

/**
 * Chi tiết công ty và danh sách việc làm
 */
async function getCompanyDetails(slug) {
  const company = await Employer.findOne({
    slug,
    status: EMPLOYER_STATUS.ACTIVE,
    deletedAt: null,
  }).lean();

  if (!company) return null;

  const jobs = await Job.find({
    employerId: company._id,
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .populate("employerId", "companyName slug logo")
    .select("title slug salaryMin salaryMax position workingForm skills city createdAt employerId")
    .lean();

  return { company, jobs };
}

/**
 * Chi tiết công việc
 */
async function getJobDetails(slug) {
  const job = await Job.findOne({
    slug,
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  })
    .populate("employerId")
    .lean();

  if (!job) return null;

  // Đếm tổng số việc làm của công ty đó
  const companyJobCount = await Job.countDocuments({
    employerId: job.employerId._id,
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  });

  return { job, companyJobCount };
}

module.exports = {
  getTotalPublicJobsCount,
  clearStatsCache,
  getTopEmployers,
  searchJobs,
  getCompanyList,
  getCompanyDetails,
  getJobDetails,
};
