// src/controllers/mcp.controller.js
const {
  getTotalPublicJobsCount,
  getTopEmployers,
  searchJobs,
  getJobDetails,
} = require("../services/job.service");
const { getSalaryStats } = require("../services/salary.service");

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = {
  name: "vn-itjobs-mcp",
  version: "1.0.0",
  description: "Model Context Protocol (MCP) Server for VN.ITJobs - Vietnam's Leading IT Job Board & Developer Career Platform",
};

const TOOLS_MANIFEST = [
  {
    name: "search_jobs",
    description: "Tìm kiếm việc làm IT trên VN.ITJobs theo từ khóa công nghệ, kỹ năng, thành phố, vị trí (Junior, Senior, Lead...).",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Từ khóa tìm kiếm (ví dụ: ReactJS, Python, Fullstack, AI Engineer)" },
        city: { type: "string", enum: ["ha-noi", "ho-chi-minh", "da-nang", "khac"], description: "Thành phố hoặc địa điểm làm việc" },
        skill: { type: "string", description: "Slug kỹ năng công nghệ (ví dụ: reactjs, nodejs, python, docker, golang)" },
        position: { type: "string", enum: ["intern", "fresher", "junior", "middle", "senior", "manager"], description: "Cấp bậc vị trí" },
        limit: { type: "number", description: "Số lượng công việc trả về (mặc định: 10, tối đa: 20)" },
      },
    },
  },
  {
    name: "get_job_details",
    description: "Lấy thông tin chi tiết đầy đủ của một công việc IT theo slug định danh (mô tả, yêu cầu kỹ năng, quyền lợi, mức lương, thông tin nhà tuyển dụng).",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Slug định danh việc làm (ví dụ: senior-reactjs-developer-123456)" },
      },
      required: ["slug"],
    },
  },
  {
    name: "calculate_salary",
    description: "Tra cứu báo cáo và ước lượng mức lương IT chuẩn thị trường Việt Nam dựa trên vị trí, kỹ năng công nghệ và khu vực.",
    inputSchema: {
      type: "object",
      properties: {
        position: { type: "string", enum: ["intern", "fresher", "junior", "middle", "senior", "manager"], description: "Cấp bậc làm việc" },
        skill: { type: "string", description: "Kỹ năng chính (ví dụ: golang, rust, python, ai, reactjs, devops, flutter)" },
        city: { type: "string", enum: ["ha-noi", "ho-chi-minh", "da-nang", "khac"], description: "Thành phố (ha-noi, ho-chi-minh, da-nang)" },
      },
    },
  },
  {
    name: "list_companies",
    description: "Lấy danh sách các nhà tuyển dụng công nghệ hàng đầu có nhiều cơ hội việc làm nhất trên VN.ITJobs.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Số lượng công ty (mặc định: 9, tối đa: 20)" },
      },
    },
  },
  {
    name: "get_platform_info",
    description: "Lấy thông tin tổng quan về nền tảng VN.ITJobs, số lượng việc làm mở, và các liên kết tài nguyên cho AI agents.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

async function executeTool(name, args = {}) {
  switch (name) {
    case "search_jobs": {
      const searchResult = await searchJobs({
        keyword: args.keyword || "",
        city: args.city || "",
        skill: args.skill || "",
        position: args.position || "",
        limit: Math.min(Math.max(Number(args.limit) || 10, 1), 20),
      });

      const formattedJobs = (searchResult.jobs || []).map((j) => ({
        id: j._id,
        title: j.title,
        slug: j.slug,
        companyName: j.employerId?.companyName || "Ẩn danh",
        city: j.city,
        position: j.position,
        salaryMin: j.salaryMin,
        salaryMax: j.salaryMax,
        salaryFormatted: `${j.salaryMin}$ - ${j.salaryMax}$`,
        skills: (j.skills || []).map((s) => s.name),
        url: `https://tuyen-dung-it.vercel.app/jobs/${j.slug}`,
      }));

      return {
        totalItems: searchResult.pagination?.totalItems || formattedJobs.length,
        jobs: formattedJobs,
      };
    }

    case "get_job_details": {
      if (!args.slug) {
        throw new Error("Tham số 'slug' là bắt buộc.");
      }
      const job = await getJobDetails(args.slug);
      if (!job) {
        throw new Error(`Không tìm thấy công việc với slug: ${args.slug}`);
      }

      return {
        id: job._id,
        title: job.title,
        slug: job.slug,
        company: {
          id: job.employerId?._id,
          name: job.employerId?.companyName,
          slug: job.employerId?.slug,
          address: job.employerId?.address,
          city: job.employerId?.city,
          companyUrl: `https://tuyen-dung-it.vercel.app/companies/${job.employerId?.slug}`,
        },
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryFormatted: `${job.salaryMin}$ - ${job.salaryMax}$`,
        position: job.position,
        workingForm: job.workingForm,
        city: job.city,
        skills: (job.skills || []).map((s) => s.name),
        description: job.description,
        requirements: job.requirements,
        benefits: job.benefits,
        url: `https://tuyen-dung-it.vercel.app/jobs/${job.slug}`,
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
          id: emp._id,
          name: emp.companyName,
          slug: emp.slug,
          city: emp.city,
          address: emp.address,
          openJobsCount: emp.jobCount || 0,
          url: `https://tuyen-dung-it.vercel.app/companies/${emp.slug}`,
        })),
      };
    }

    case "get_platform_info": {
      const totalJobs = await getTotalPublicJobsCount();
      return {
        platform: "VN.ITJobs",
        tagline: "Nền tảng tuyển dụng IT và Việc làm Developer hàng đầu Việt Nam",
        totalActiveJobs: totalJobs,
        links: {
          website: "https://tuyen-dung-it.vercel.app",
          docs: "https://tuyen-dung-it.vercel.app/docs",
          llms: "https://tuyen-dung-it.vercel.app/llms.txt",
          agentInstructions: "https://tuyen-dung-it.vercel.app/.well-known/agent-instructions.md",
          mcpManifest: "https://tuyen-dung-it.vercel.app/.well-known/mcp",
          openapi: "https://tuyen-dung-it.vercel.app/openapi.json",
          sitemap: "https://tuyen-dung-it.vercel.app/sitemap.xml",
        },
      };
    }

    default:
      throw new Error(`Tool không tồn tại: ${name}`);
  }
}

/**
 * Xử lý yêu cầu JSON-RPC 2.0 cho MCP Protocol
 */
async function handleJsonRpc(reqBody) {
  const { jsonrpc, id, method, params } = reqBody;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: id !== undefined ? id : null,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: SERVER_INFO,
      },
    };
  }

  if (method === "notifications/initialized") {
    return {
      jsonrpc: "2.0",
      result: {},
    };
  }

  if (method === "ping") {
    return {
      jsonrpc: "2.0",
      id: id !== undefined ? id : null,
      result: {},
    };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: id !== undefined ? id : null,
      result: {
        tools: TOOLS_MANIFEST,
      },
    };
  }

  if (method === "tools/call") {
    if (!params || !params.name) {
      return {
        jsonrpc: "2.0",
        id: id !== undefined ? id : null,
        error: {
          code: -32602,
          message: "Invalid params: 'name' is required for tools/call",
        },
      };
    }

    try {
      const data = await executeTool(params.name, params.arguments || {});
      return {
        jsonrpc: "2.0",
        id: id !== undefined ? id : null,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        },
      };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id: id !== undefined ? id : null,
        result: {
          isError: true,
          content: [
            {
              type: "text",
              text: `Lỗi thực thi công cụ (${params.name}): ${err.message}`,
            },
          ],
        },
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id: id !== undefined ? id : null,
    error: {
      code: -32601,
      message: `Method not found: ${method}`,
    },
  };
}

/**
 * Controller cho /mcp (Streamable HTTP / JSON-RPC 2.0)
 */
const postMcp = async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32700, message: "Parse error: Request body must be a JSON object" },
      id: null,
    });
  }

  // Handle single request or batch array
  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map((item) => handleJsonRpc(item)));
    return res.json(responses);
  }

  const response = await handleJsonRpc(body);
  return res.json(response);
};

const getMcp = (req, res) => {
  const accept = req.get("accept") || "";

  // Support Streamable HTTP / Server-Sent Events (SSE) handshake
  if (accept.includes("text/event-stream")) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("event: endpoint\ndata: /mcp\n\n");
    return;
  }

  return res.json({
    status: "ok",
    server: SERVER_INFO,
    protocolVersion: PROTOCOL_VERSION,
    transport: "Streamable HTTP (POST /mcp or GET /mcp with Accept: text/event-stream)",
    manifest: "/.well-known/mcp",
    toolsAvailable: TOOLS_MANIFEST.map((t) => t.name),
  });
};

/**
 * Controller cho /.well-known/mcp và /.well-known/mcp.json
 */
const getMcpManifest = (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.json({
    mcpVersion: PROTOCOL_VERSION,
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    description: SERVER_INFO.description,
    transport: {
      type: "http",
      url: "https://tuyen-dung-it.vercel.app/mcp",
      endpoint: "/mcp",
    },
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
  });
};

module.exports = {
  postMcp,
  getMcp,
  getMcpManifest,
  TOOLS_MANIFEST,
  executeTool,
};
