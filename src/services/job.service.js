// src/services/job.service.js
const NodeCache = require("node-cache");
const { Job, Employer } = require("../models");
const { EMPLOYER_STATUS, JOB_MODERATION } = require("../config/constants");
const normalizeVi = require("../utils/normalizeVi");
const paginate = require("../utils/pagination");
const slugify = require("../utils/slugify");
const { findDidYouMean, clearVocabCache } = require("./fuzzySearch.service");

const statsCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
const TOTAL_JOBS_KEY = "total_public_jobs";
const TOP_EMPLOYERS_KEY = "top_employers_list";

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
  statsCache.flushAll(); // Xóa sạch cache thống kê, top employers để đồng bộ tức thì
  clearVocabCache();
}

/**
 * Lấy danh sách 9 nhà tuyển dụng hàng đầu có nhiều việc làm nhất
 * Tối ưu hóa bằng In-Memory Caching và Aggregate (Khử triệt để N+1)
 */
async function getTopEmployers(limit = 9) {
  const cacheKey = `${TOP_EMPLOYERS_KEY}_${limit}`;
  const cached = statsCache.get(cacheKey);
  if (cached !== undefined) return cached;
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
    .select("companyName slug logo city companyModel companySize")
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
      .select("companyName slug logo city companyModel companySize")
      .lean();

    fillerEmployers.forEach((emp) => {
      result.push({
        ...emp,
        jobCount: 0,
      });
    });
  }

  statsCache.set(cacheKey, result);
  return result;
}

/**
 * Tìm kiếm việc làm công khai với bộ lọc, phân trang, Fuzzy Search và Typo Tolerance
 */
/**
 * Lấy chuỗi đầu tiên không rỗng từ query param (Express parse ?a=1&a=2 thành mảng).
 * Chống lỗi "x.trim is not a function" khi tham số bị lặp / dạng object (?a[b]=1).
 */
function pickFirstString(value) {
  const list = Array.isArray(value) ? value : [value];
  for (const item of list) {
    if (typeof item === "string" && item.trim()) return item.trim();
  }
  return "";
}

/**
 * Chuẩn hóa query param (string | string[]) thành mảng chuỗi sạch, không trùng lặp.
 */
function normalizeFilterArray(value, { max = 10, maxLen = 100 } = {}) {
  const list = Array.isArray(value) ? value : [value];
  const out = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const t = item.trim().slice(0, maxLen);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

// 1 giá trị => so khớp trực tiếp (tận dụng index), nhiều giá trị => $in
const toMatch = (values) => (values.length === 1 ? values[0] : { $in: values });

const PUBLIC_JOB_CARD_FIELDS =
  "title slug salaryMin salaryMax position workingForm skills benefits city createdAt employerId";
const JOBS_PER_PAGE = 9;

async function searchJobs(query = {}) {
  const { page, exact } = query;
  const cities = normalizeFilterArray(query.city);
  const positions = normalizeFilterArray(query.position);
  const workingForms = normalizeFilterArray(query.workingForm);
  const benefits = normalizeFilterArray(query.benefit);
  const skillSlugs = normalizeFilterArray(query.skill)
    .map((s) => slugify(s))
    .filter(Boolean);
  const keyword = pickFirstString(query.keyword);
  const company = pickFirstString(query.company);

  const baseFilter = {
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  };

  if (cities.length) baseFilter.city = toMatch(cities);
  if (positions.length) baseFilter.position = toMatch(positions);
  if (workingForms.length) baseFilter.workingForm = toMatch(workingForms);
  if (benefits.length) baseFilter.benefits = toMatch(benefits);
  if (skillSlugs.length) baseFilter["skills.slug"] = toMatch([...new Set(skillSlugs)]);

  if (company) {
    const emp = await Employer.findOne({ slug: company, status: EMPLOYER_STATUS.ACTIVE, deletedAt: null });
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

  if (keyword) {
    const { escapeRegex } = require("../utils/securityHelpers");
    originalKeyword = keyword.slice(0, 100);
    const normalized = escapeRegex(normalizeVi(originalKeyword));
    if (normalized) {
      const keywordOr = [{ searchText: { $regex: normalized, $options: "i" } }];
      // Job.searchText chỉ gồm title + skills => bổ sung tìm theo tên công ty (QA-M01)
      const matchedEmployerIds = await findEmployerIdsByKeyword(originalKeyword, normalized);
      if (matchedEmployerIds.length) {
        keywordOr.push({ employerId: { $in: matchedEmployerIds } });
      }
      filter.$or = keywordOr;
    }
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  let effectivePage = pageNum;

  const runQuery = (queryFilter, pageToLoad) =>
    Promise.all([
      Job.countDocuments(queryFilter),
      Job.find(queryFilter)
        .sort({ createdAt: -1 })
        .skip((pageToLoad - 1) * JOBS_PER_PAGE)
        .limit(JOBS_PER_PAGE)
        .populate("employerId", "companyName slug logo")
        .select(PUBLIC_JOB_CARD_FIELDS)
        .lean(),
    ]);

  // Thực thi song song truy vấn đếm và lấy dữ liệu trang (giảm 50% độ trễ network)
  let [total, jobs] = await runQuery(filter, effectivePage);

  // Trang vượt ngưỡng: kéo về trang cuối hợp lệ thay vì hiện danh sách rỗng (QA-M05)
  const clampPage = async (queryFilter, count, currentJobs) => {
    const lastPage = Math.max(1, Math.ceil(count / JOBS_PER_PAGE));
    if (count > 0 && effectivePage > lastPage) {
      effectivePage = lastPage;
      const [, lastJobs] = await runQuery(queryFilter, lastPage);
      return lastJobs;
    }
    return currentJobs;
  };
  jobs = await clampPage(filter, total, jobs);

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
        const { escapeRegex } = require("../utils/securityHelpers");
        const fuzzyNormalized = escapeRegex(normalizeVi(suggestionInfo.suggestion));
        const fuzzyFilter = {
          ...baseFilter,
          searchText: { $regex: fuzzyNormalized, $options: "i" },
        };

        const [fuzzyTotal, fuzzyJobs] = await runQuery(fuzzyFilter, effectivePage);

        if (fuzzyTotal > 0) {
          // Tìm thấy kết quả từ khóa gợi ý!
          total = fuzzyTotal;
          jobs = await clampPage(fuzzyFilter, fuzzyTotal, fuzzyJobs);
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

  const pagination = paginate(total, effectivePage, JOBS_PER_PAGE);

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
 * Tìm các nhà tuyển dụng active khớp từ khóa (theo tên công ty, có/không dấu)
 */
async function findEmployerIdsByKeyword(rawKeyword, normalizedEscaped) {
  const { escapeRegex } = require("../utils/securityHelpers");
  const rawEscaped = escapeRegex(rawKeyword);
  const or = [];
  if (rawEscaped) or.push({ companyName: { $regex: rawEscaped, $options: "i" } });
  if (normalizedEscaped) or.push({ searchText: { $regex: `^${normalizedEscaped}`, $options: "i" } });
  if (!or.length) return [];
  const employers = await Employer.find({
    status: EMPLOYER_STATUS.ACTIVE,
    deletedAt: null,
    $or: or,
  })
    .select("_id")
    .limit(50)
    .lean();
  return employers.map((e) => e._id);
}

/**
 * Danh sách công ty có phân trang và đếm job bằng batch aggregate song song
 */
async function getCompanyList(page = 1, limit = 9) {
  const filter = {
    status: EMPLOYER_STATUS.ACTIVE,
    deletedAt: null,
  };

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 9, 1), 50);
  let pageNum = Math.max(parseInt(page, 10) || 1, 1);

  // Truy vấn song song đếm tổng số công ty và dữ liệu phân trang
  const loadPage = (p) =>
    Promise.all([
      Employer.countDocuments(filter),
      Employer.find(filter)
        .sort({ createdAt: -1 })
        .skip((p - 1) * safeLimit)
        .limit(safeLimit)
        .select("companyName slug logo city")
        .lean(),
    ]);
  let [total, employers] = await loadPage(pageNum);

  // Trang vượt ngưỡng: kéo về trang cuối hợp lệ (QA-M05)
  const lastPage = Math.max(1, Math.ceil(total / safeLimit));
  if (total > 0 && pageNum > lastPage) {
    pageNum = lastPage;
    [total, employers] = await loadPage(pageNum);
  }

  const pagination = paginate(total, pageNum, safeLimit);

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

const PUBLIC_EMPLOYER_FIELDS =
  "companyName slug email phone logo city address googleMapsUrl companyModel companySize workingTime overtime description website createdAt";

/**
 * Chi tiết công ty và danh sách việc làm
 */
async function getCompanyDetails(slug) {
  if (typeof slug !== "string" || !slug.trim()) return null;
  const company = await Employer.findOne({
    slug: slug.trim(),
    status: EMPLOYER_STATUS.ACTIVE,
    deletedAt: null,
  })
    .select(PUBLIC_EMPLOYER_FIELDS)
    .lean();

  if (!company) return null;

  const jobs = await Job.find({
    employerId: company._id,
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .populate("employerId", "companyName slug logo")
    .select(PUBLIC_JOB_CARD_FIELDS)
    .lean();

  return { company, jobs };
}

/**
 * Chi tiết công việc
 */
async function getJobDetails(slug) {
  if (typeof slug !== "string" || !slug.trim()) return null;
  const job = await Job.findOne({
    slug: slug.trim(),
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  })
    .populate("employerId", PUBLIC_EMPLOYER_FIELDS)
    .lean();

  if (!job || !job.employerId) return null;

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
  pickFirstString,
  normalizeFilterArray,
  PUBLIC_JOB_CARD_FIELDS,
  getCompanyList,
  getCompanyDetails,
  getJobDetails,
};
