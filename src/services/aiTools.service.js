// src/services/aiTools.service.js
// Bộ công cụ truy vấn dữ liệu thực tế dùng chung cho MCP Server (/mcp) và Trợ lý AI (/api/chat-assistant)
const { Type } = require("@google/genai");
const {
  getTotalPublicJobsCount,
  getTopEmployers,
  searchJobs,
  getCompanyDetails,
  getJobDetails,
} = require("./job.service");
const { getSalaryStats } = require("./salary.service");
const { Employer, Job } = require("../models");
const { EMPLOYER_STATUS, JOB_MODERATION } = require("../config/constants");

const SITE_BASE_URL = "https://tuyen-dung-it.vercel.app";

const TOOLS_MANIFEST = [
  {
    name: "search_jobs",
    description:
      "Tìm kiếm việc làm IT thật đang mở trên VN.ITJobs theo từ khóa, công ty, kỹ năng, thành phố, cấp bậc, hình thức làm việc hoặc đãi ngộ.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "Từ khóa tìm kiếm (ví dụ: ReactJS, Python, Golang, AI Engineer, CGV)",
        },
        company: {
          type: "string",
          description: "Tên công ty hoặc slug công ty (ví dụ: CGV, Techcombank, fpt-software-a8d281)",
        },
        city: {
          type: "string",
          enum: ["ha-noi", "ho-chi-minh", "da-nang", "khac"],
          description: "Thành phố hoặc địa điểm làm việc",
        },
        skill: {
          type: "string",
          description: "Slug kỹ năng công nghệ (ví dụ: reactjs, nodejs, python, docker, golang, machine-learning)",
        },
        position: {
          type: "string",
          enum: ["intern", "fresher", "junior", "middle", "senior", "manager"],
          description: "Cấp bậc vị trí",
        },
        workingForm: {
          type: "string",
          enum: ["office", "remote", "flexible"],
          description: "Hình thức làm việc",
        },
        benefit: {
          type: "string",
          enum: ["macbook", "salary13", "hybrid", "insurance", "paid_ot", "training", "annual_leave"],
          description: "Đãi ngộ IT",
        },
        limit: {
          type: "number",
          description: "Số lượng công việc trả về (mặc định: 9, tối đa: 20)",
        },
      },
    },
  },
  {
    name: "get_job_details",
    description:
      "Lấy thông tin chi tiết đầy đủ của một công việc IT thật theo slug định danh (mô tả, yêu cầu kỹ năng, quyền lợi, mức lương, thông tin nhà tuyển dụng).",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Slug định danh việc làm (ví dụ: data-scientist-ai-engineer-6a88b1)",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "get_company_details",
    description:
      "Lấy thông tin chi tiết một công ty IT và toàn bộ danh sách việc làm đang mở của công ty đó theo slug hoặc tên công ty (ví dụ: CGV, Techcombank, FPT Software).",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Slug của công ty (nếu có)" },
        companyName: { type: "string", description: "Tên công ty cần tra cứu (ví dụ: CGV, VNG, MoMo)" },
      },
    },
  },
  {
    name: "calculate_salary",
    description:
      "Tra cứu báo cáo và ước lượng mức lương IT chuẩn thị trường Việt Nam dựa trên vị trí, kỹ năng công nghệ và khu vực.",
    inputSchema: {
      type: "object",
      properties: {
        position: {
          type: "string",
          enum: ["intern", "fresher", "junior", "middle", "senior", "manager"],
          description: "Cấp bậc làm việc",
        },
        skill: {
          type: "string",
          description: "Kỹ năng chính (ví dụ: golang, rust, python, ai, reactjs, devops, flutter)",
        },
        city: {
          type: "string",
          enum: ["ha-noi", "ho-chi-minh", "da-nang", "khac"],
          description: "Thành phố (ha-noi, ho-chi-minh, da-nang)",
        },
      },
    },
  },
  {
    name: "list_companies",
    description:
      "Lấy danh sách các nhà tuyển dụng công nghệ đang hoạt động có nhiều cơ hội việc làm nhất trên VN.ITJobs.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Số lượng công ty (mặc định: 9, tối đa: 20)" },
      },
    },
  },
  {
    name: "get_platform_info",
    description:
      "Lấy thông tin tổng quan về nền tảng VN.ITJobs, số lượng việc làm mở, các bộ lọc thực tế của trang /search và tài nguyên công khai.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

function escapeRegex(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatJobSummary(j) {
  return {
    id: j._id ? String(j._id) : undefined,
    title: j.title,
    slug: j.slug,
    companyName: j.employerId?.companyName || "Ẩn danh",
    companySlug: j.employerId?.slug || "",
    city: j.city,
    position: j.position,
    workingForm: j.workingForm,
    salaryMin: j.salaryMin,
    salaryMax: j.salaryMax,
    salaryFormatted: `${j.salaryMin}$ - ${j.salaryMax}$`,
    skills: (j.skills || []).map((s) => s.name),
    benefits: j.benefits || [],
    url: `${SITE_BASE_URL}/jobs/${j.slug}`,
  };
}

/**
 * Chuyển JSON Schema sang định dạng Gemini FunctionDeclaration (@google/genai)
 */
function mapSchemaToGemini(schema) {
  if (!schema || typeof schema !== "object") return { type: Type.STRING };
  if (schema.type === "number" || schema.type === "integer") {
    return { type: Type.NUMBER, description: schema.description };
  }
  if (schema.type === "boolean") {
    return { type: Type.BOOLEAN, description: schema.description };
  }
  if (schema.type === "object") {
    const props = {};
    for (const [k, v] of Object.entries(schema.properties || {})) {
      props[k] = mapSchemaToGemini(v);
    }
    const out = { type: Type.OBJECT, properties: props };
    if (Array.isArray(schema.required) && schema.required.length > 0) {
      out.required = schema.required;
    }
    return out;
  }
  const out = { type: Type.STRING, description: schema.description };
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    out.enum = schema.enum;
  }
  return out;
}

function getGeminiFunctionDeclarations() {
  return TOOLS_MANIFEST.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: mapSchemaToGemini(tool.inputSchema),
  }));
}

async function resolveEmployerByNameOrSlug(queryStr) {
  const q = String(queryStr || "").trim();
  if (!q) return null;

  let emp = await Employer.findOne({
    slug: q,
    status: EMPLOYER_STATUS.ACTIVE,
    deletedAt: null,
  })
    .select("companyName slug city address companyModel companySize workingTime overtime")
    .lean();

  if (!emp) {
    emp = await Employer.findOne({
      companyName: { $regex: escapeRegex(q), $options: "i" },
      status: EMPLOYER_STATUS.ACTIVE,
      deletedAt: null,
    })
      .select("companyName slug city address companyModel companySize workingTime overtime")
      .lean();
  }
  return emp;
}

async function executeTool(name, args = {}) {
  switch (name) {
    case "search_jobs": {
      const limit = Math.min(Math.max(Number(args.limit) || 9, 1), 20);
      let resolvedCompanySlug = "";

      if (args.company && String(args.company).trim()) {
        const emp = await resolveEmployerByNameOrSlug(args.company);
        if (!emp) {
          return { totalItems: 0, jobs: [] };
        }
        resolvedCompanySlug = emp.slug;
      }

      const searchResult = await searchJobs({
        keyword: args.keyword || "",
        city: args.city || "",
        skill: args.skill || "",
        position: args.position || "",
        workingForm: args.workingForm || "",
        benefit: args.benefit || "",
        company: resolvedCompanySlug,
      });

      let jobsList = (searchResult.jobs || []).slice(0, limit).map(formatJobSummary);
      let totalItems = searchResult.pagination?.totalItems || jobsList.length;

      // Nếu keyword là tên công ty (vd "CGV") mà searchText của Job không chứa companyName
      if (jobsList.length === 0 && args.keyword && !resolvedCompanySlug) {
        const matchedEmp = await resolveEmployerByNameOrSlug(args.keyword);
        if (matchedEmp) {
          const empSearch = await searchJobs({
            city: args.city || "",
            skill: args.skill || "",
            position: args.position || "",
            workingForm: args.workingForm || "",
            benefit: args.benefit || "",
            company: matchedEmp.slug,
          });
          jobsList = (empSearch.jobs || []).slice(0, limit).map(formatJobSummary);
          totalItems = empSearch.pagination?.totalItems || jobsList.length;
        }
      }

      return {
        totalItems,
        jobs: jobsList,
      };
    }

    case "get_job_details": {
      if (!args.slug) {
        throw new Error("Tham số 'slug' là bắt buộc.");
      }
      const result = await getJobDetails(args.slug);
      const job = result && result.job ? result.job : null;
      if (!job) {
        throw new Error(`Không tìm thấy công việc với slug: ${args.slug}`);
      }

      return {
        id: String(job._id),
        title: job.title,
        slug: job.slug,
        company: {
          id: job.employerId?._id ? String(job.employerId._id) : undefined,
          name: job.employerId?.companyName || "Ẩn danh",
          slug: job.employerId?.slug || "",
          address: job.employerId?.address || "",
          city: job.employerId?.city || "",
          companyUrl: job.employerId?.slug ? `${SITE_BASE_URL}/companies/${job.employerId.slug}` : "",
        },
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryFormatted: `${job.salaryMin}$ - ${job.salaryMax}$`,
        position: job.position,
        workingForm: job.workingForm,
        city: job.city,
        address: job.address || job.employerId?.address || "",
        skills: (job.skills || []).map((s) => s.name),
        benefits: job.benefits || [],
        description: stripHtml(job.description).slice(0, 1500),
        url: `${SITE_BASE_URL}/jobs/${job.slug}`,
      };
    }

    case "get_company_details": {
      let companySlug = args.slug ? String(args.slug).trim() : "";
      if (!companySlug && args.companyName) {
        const emp = await resolveEmployerByNameOrSlug(args.companyName);
        if (emp) companySlug = emp.slug;
      }
      if (!companySlug) {
        return { found: false, message: "Không tìm thấy công ty phù hợp trong hệ thống." };
      }
      const data = await getCompanyDetails(companySlug);
      if (!data || !data.company) {
        return { found: false, message: "Không tìm thấy công ty phù hợp trong hệ thống." };
      }
      const c = data.company;
      return {
        found: true,
        company: {
          name: c.companyName,
          slug: c.slug,
          city: c.city,
          address: c.address,
          companyModel: c.companyModel,
          companySize: c.companySize,
          workingTime: c.workingTime,
          overtime: c.overtime,
          url: `${SITE_BASE_URL}/companies/${c.slug}`,
        },
        openJobsCount: (data.jobs || []).length,
        jobs: (data.jobs || []).map(formatJobSummary),
      };
    }

    case "calculate_salary": {
      const stats = await getSalaryStats({
        position: args.position || "junior",
        skill: args.skill || "",
        city: args.city || "",
      });
      return {
        query: { position: args.position || "junior", skill: args.skill || "", city: args.city || "" },
        salaryBenchmark: stats,
      };
    }

    case "list_companies": {
      const limit = Math.min(Math.max(Number(args.limit) || 9, 1), 20);
      const employers = await getTopEmployers(limit);
      return {
        total: employers.length,
        companies: employers.map((emp) => ({
          id: String(emp._id),
          name: emp.companyName,
          slug: emp.slug,
          city: emp.city,
          openJobsCount: emp.jobCount || 0,
          url: `${SITE_BASE_URL}/companies/${emp.slug}`,
        })),
      };
    }

    case "get_platform_info": {
      const totalJobs = await getTotalPublicJobsCount();
      return {
        platform: "VN.ITJobs",
        tagline: "Nền tảng tuyển dụng IT và Việc làm Developer hàng đầu Việt Nam",
        totalActiveJobs: totalJobs,
        supportedSearchFilters: [
          "keyword (từ khóa)",
          "city (ha-noi, ho-chi-minh, da-nang, khac)",
          "position (intern, fresher, junior, middle, senior, manager)",
          "workingForm (office, remote, flexible)",
          "benefit (macbook, salary13, hybrid, insurance, paid_ot, training, annual_leave)",
          "skill (slug kỹ năng)",
        ],
        unsupportedFilters: ["Không có bộ lọc theo khoảng lương (salaryMin/salaryMax) trên trang /search; tra cứu lương ở /salary."],
        links: {
          website: SITE_BASE_URL,
          search: `${SITE_BASE_URL}/search`,
          salary: `${SITE_BASE_URL}/salary`,
          companies: `${SITE_BASE_URL}/companies`,
          docs: `${SITE_BASE_URL}/docs`,
          llms: `${SITE_BASE_URL}/llms.txt`,
          mcpManifest: `${SITE_BASE_URL}/.well-known/mcp`,
          openapi: `${SITE_BASE_URL}/openapi.json`,
        },
      };
    }

    default:
      throw new Error(`Tool không tồn tại: ${name}`);
  }
}

module.exports = {
  TOOLS_MANIFEST,
  getGeminiFunctionDeclarations,
  executeTool,
  stripHtml,
};
