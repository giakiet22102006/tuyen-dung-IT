// src/services/job.service.js
const NodeCache = require("node-cache");
const { Job, Employer, Skill } = require("../models");
const { EMPLOYER_STATUS, JOB_MODERATION, CITIES, POSITIONS, WORKING_FORMS } = require("../config/constants");
const normalizeVi = require("../utils/normalizeVi");
const paginate = require("../utils/pagination");

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
 * Tìm kiếm việc làm công khai với bộ lọc và phân trang
 */
async function searchJobs(query = {}) {
  const { city, keyword, skill, position, workingForm, company, page } = query;

  const filter = {
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  };

  if (city && city.trim()) {
    filter.city = city.trim();
  }

  if (position && position.trim()) {
    filter.position = position.trim();
  }

  if (workingForm && workingForm.trim()) {
    filter.workingForm = workingForm.trim();
  }

  if (skill && skill.trim()) {
    filter["skills.slug"] = skill.toLowerCase().trim();
  }

  if (company && company.trim()) {
    const emp = await Employer.findOne({ slug: company.trim(), status: EMPLOYER_STATUS.ACTIVE });
    if (emp) {
      filter.employerId = emp._id;
    } else {
      // Công ty không tồn tại thì không ra kết quả
      return {
        jobs: [],
        pagination: paginate(0, 1, 9),
      };
    }
  }

  if (keyword && keyword.trim()) {
    const normalized = normalizeVi(keyword.trim());
    filter.searchText = { $regex: normalized, $options: "i" };
  }

  const total = await Job.countDocuments(filter);
  const pagination = paginate(total, page || 1, 9);

  const jobs = await Job.find(filter)
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .populate("employerId", "companyName slug logo")
    .select("title slug salaryMin salaryMax position workingForm skills city createdAt employerId")
    .lean();

  return { jobs, pagination };
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
