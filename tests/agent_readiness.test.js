const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../src/app");
const { Employer, Job, Skill } = require("../src/models");
const { EMPLOYER_STATUS, JOB_MODERATION } = require("../src/config/constants");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const emp = await Employer.create({
    companyName: "Công ty Test AI Ready",
    slug: "cong-ty-test-ai-ready",
    email: "test.ai@vn-itjobs.com",
    password: "Password123",
    city: "ha-noi",
    address: "Keangnam Landmark 72, Hà Nội",
    status: EMPLOYER_STATUS.ACTIVE,
  });

  await Skill.create({ name: "Golang", slug: "golang" });

  await Job.create({
    employerId: emp._id,
    title: "Senior Golang Cloud Engineer",
    slug: "senior-golang-cloud-engineer-999999",
    salaryMin: 2000,
    salaryMax: 3500,
    position: "senior",
    workingForm: "office",
    skills: [{ name: "Golang", slug: "golang" }],
    city: "ha-noi",
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
  });
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});

describe("Agent Readiness & Ora Audit Compliance Tests", () => {
  describe("1. Agent-friendly 404s", () => {
    test("GET nonexistent path with Accept: text/markdown returns HTTP 404 and Markdown error body", async () => {
      const res = await request(app)
        .get("/__ora-404-probe-joc3jqhq")
        .set("Accept", "text/markdown");

      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toContain("text/markdown");
      expect(res.headers["vary"]).toContain("Accept");
      expect(res.text.length).toBeGreaterThan(20);
      expect(res.text).toContain("404 - Not Found");
      expect(res.text).toContain("/llms.txt");
      expect(res.text).toContain("/sitemap.xml");
      expect(res.text).toContain("/docs");
    });

    test("GET nonexistent path with Accept: text/html returns HTTP 404 and HTML page", async () => {
      const res = await request(app)
        .get("/__ora-404-probe-joc3jqhq")
        .set("Accept", "text/html");

      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.headers["vary"]).toContain("Accept");
      expect(res.text).toContain("404");
    });
  });

  describe("2. Content is available without JavaScript", () => {
    test("Homepage serves substantial meaningful text in raw HTML with sequential headings", async () => {
      const res = await request(app)
        .get("/")
        .set("Accept", "text/html");

      expect(res.status).toBe(200);
      expect(res.text).toContain("<h1");
      expect(res.text).toContain("VN.ITJobs - Nền tảng tuyển dụng IT &amp; Việc làm IT cho Developer hàng đầu Việt Nam");
      expect(res.text).toContain("<h2");
      expect(res.text).toContain("<h3");

      // Extract raw text content without HTML tags
      const textOnly = res.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      expect(textOnly.length).toBeGreaterThan(2000);

      // Verify content ratio (text length / HTML size)
      const contentRatio = (textOnly.length / res.text.length) * 100;
      expect(contentRatio).toBeGreaterThan(5.0);
    });
  });

  describe("3. Markdown content negotiation (acceptmarkdown.com)", () => {
    test("GET / with Accept: text/markdown returns Markdown with Content-Type: text/markdown and Vary: Accept", async () => {
      const res = await request(app)
        .get("/")
        .set("Accept", "text/markdown");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/markdown");
      expect(res.headers["vary"]).toContain("Accept");
      expect(res.text).toContain("# VN.ITJobs");
      expect(res.text).toContain("/mcp");
      expect(res.text).toContain("/llms.txt");
    });

    test("GET / with Accept: text/html returns HTML with Content-Type: text/html and Vary: Accept", async () => {
      const res = await request(app)
        .get("/")
        .set("Accept", "text/html");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.headers["vary"]).toContain("Accept");
      expect(res.text).toContain("<!DOCTYPE html>");
    });
  });

  describe("4. Developer resource discoverability", () => {
    test("GET /docs returns 200 with Developer Portal & API documentation", async () => {
      const res = await request(app).get("/docs");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Developer Portal");
      expect(res.text).toContain("Model Context Protocol (MCP) Server");
      expect(res.text).toContain("/openapi.json");
    });

    test("GET /openapi.json returns 200 with valid OpenAPI 3.1 specification", async () => {
      const res = await request(app).get("/openapi.json");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body.openapi).toBe("3.1.0");
      expect(res.body.info.title).toContain("VN.ITJobs");
      expect(res.body.paths["/mcp"]).toBeDefined();
    });
  });

  describe("5. Brand name discoverability", () => {
    test("Homepage contains brand name and main product terms in title and H1", async () => {
      const res = await request(app).get("/");
      expect(res.text).toContain("<title>VN.ITJobs - Nền tảng tuyển dụng IT &amp; Việc làm Developer hàng đầu Việt Nam</title>");
      expect(res.text).toContain("VN.ITJobs - Nền tảng tuyển dụng IT &amp; Việc làm IT cho Developer hàng đầu Việt Nam");
    });

    test("Salary benchmark page contains 'VN.ITJobs Salary Benchmarking' in title and H1", async () => {
      const res = await request(app).get("/salary");
      expect(res.text).toContain("VN.ITJobs Salary Benchmarking");
    });
  });

  describe("6. JSON-LD structured data & 9. Organization schema completeness", () => {
    test("Homepage contains valid JSON-LD graph with WebSite, Organization, and SoftwareApplication", async () => {
      const res = await request(app).get("/");
      const jsonLdMatch = res.text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      expect(jsonLdMatch).toBeTruthy();

      const jsonLd = JSON.parse(jsonLdMatch[1]);
      expect(jsonLd["@context"]).toBe("https://schema.org");
      expect(jsonLd["@graph"]).toBeDefined();

      const website = jsonLd["@graph"].find((item) => item["@type"] === "WebSite");
      expect(website).toBeDefined();
      expect(website.name).toBe("VN.ITJobs");

      const org = jsonLd["@graph"].find((item) => {
        const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
        return types.includes("Organization");
      });
      expect(org).toBeDefined();
      expect(org.name).toBe("VN.ITJobs");
      expect(org.address).toBeDefined();
      expect(org.address["@type"]).toBe("PostalAddress");
      expect(org.address.streetAddress).toBeDefined();
      expect(org.address.addressLocality).toBe("Nam Từ Liêm");
      expect(org.address.addressRegion).toBe("Hà Nội");

      expect(org.contactPoint).toBeDefined();
      expect(Array.isArray(org.contactPoint)).toBe(true);
      expect(org.contactPoint[0]["@type"]).toBe("ContactPoint");
      expect(org.contactPoint[0].telephone).toBeDefined();
      expect(org.contactPoint[0].email).toBeDefined();
      expect(org.contactPoint[0].contactType).toBe("customer service");

      const appSchema = jsonLd["@graph"].find((item) => item["@type"] === "SoftwareApplication");
      expect(appSchema).toBeDefined();
      expect(appSchema.name).toBe("VN.ITJobs");
      expect(appSchema.offers).toBeDefined();
    });
  });

  describe("7. Agent instruction / when-to-use", () => {
    test("GET /llms.txt returns 200 with clear 'When to Use This Platform' section", async () => {
      const res = await request(app).get("/llms.txt");
      expect(res.status).toBe(200);
      expect(res.text).toContain("## When to Use This Platform (Agent Guide)");
      expect(res.text).toContain("IT Job Search in Vietnam");
      expect(res.text).toContain("How an Agent Should Call Us");
      expect(res.text).toContain("/mcp");
    });

    test("GET /.well-known/agent-instructions.md returns 200 with agent instructions", async () => {
      const res = await request(app).get("/.well-known/agent-instructions.md");
      expect(res.status).toBe(200);
      expect(res.text).toContain("VN.ITJobs Agent Instructions");
      expect(res.text).toContain("When to Use VN.ITJobs");
    });
  });

  describe("8. Sitemap exists & robots.txt", () => {
    test("GET /sitemap.xml returns valid XML sitemap with lastmod, changefreq, and priority", async () => {
      const res = await request(app).get("/sitemap.xml");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/xml");
      expect(res.text).toContain("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
      expect(res.text).toContain("<loc>https://tuyen-dung-it.vercel.app/</loc>");
      expect(res.text).toContain("<lastmod>");
      expect(res.text).toContain("<priority>1.0</priority>");
    });

    test("GET /robots.txt points to sitemap.xml", async () => {
      const res = await request(app).get("/robots.txt");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Sitemap: https://tuyen-dung-it.vercel.app/sitemap.xml");
    });
  });

  describe("10. Trust anchor pages", () => {
    test("GET /about returns 200 with at least 500 characters of meaningful content", async () => {
      const res = await request(app).get("/about");
      expect(res.status).toBe(200);
      const textOnly = res.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      expect(textOnly.length).toBeGreaterThan(500);
      expect(res.text).toContain("Về chúng tôi");
      expect(res.text).toContain("VN.ITJobs Technology JSC");
    });

    test("GET /contact returns 200 with at least 500 characters of meaningful content", async () => {
      const res = await request(app).get("/contact");
      expect(res.status).toBe(200);
      const textOnly = res.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      expect(textOnly.length).toBeGreaterThan(500);
      expect(res.text).toContain("Liên hệ");
      expect(res.text).toContain("+84-24-3768-9999");
    });

    test("GET /privacy returns 200 with at least 500 characters of meaningful content", async () => {
      const res = await request(app).get("/privacy");
      expect(res.status).toBe(200);
      const textOnly = res.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      expect(textOnly.length).toBeGreaterThan(500);
      expect(res.text).toContain("Chính Sách Bảo Mật Thông Tin");
      expect(res.text).toContain("Nghị định 13/2023/NĐ-CP");
    });

    test("Trust pages support Markdown content negotiation", async () => {
      const resAbout = await request(app).get("/about").set("Accept", "text/markdown");
      expect(resAbout.status).toBe(200);
      expect(resAbout.headers["content-type"]).toContain("text/markdown");
      expect(resAbout.headers["vary"]).toContain("Accept");

      const resContact = await request(app).get("/contact").set("Accept", "text/markdown");
      expect(resContact.status).toBe(200);
      expect(resContact.headers["content-type"]).toContain("text/markdown");

      const resPrivacy = await request(app).get("/privacy").set("Accept", "text/markdown");
      expect(resPrivacy.status).toBe(200);
      expect(resPrivacy.headers["content-type"]).toContain("text/markdown");
    });
  });

  describe("11. Metadata completeness", () => {
    test("Homepage contains all four critical metadata signals: canonical, html lang, og:image, og:type", async () => {
      const res = await request(app).get("/");
      expect(res.status).toBe(200);

      // 1. <html lang="vi">
      expect(res.text).toMatch(/<html[^>]*lang=["']vi["']/);

      // 2. <link rel="canonical">
      expect(res.text).toMatch(/<link[^>]*rel=["']canonical["'][^>]*href=["']https:\/\/tuyen-dung-it\.vercel\.app["']/);

      // 3. <meta property="og:image">
      expect(res.text).toMatch(/<meta[^>]*property=["']og:image["'][^>]*content=["']https:\/\/tuyen-dung-it\.vercel\.app\/assets\/images\/og-image\.png["']/);

      // 4. <meta property="og:type">
      expect(res.text).toMatch(/<meta[^>]*property=["']og:type["'][^>]*content=["']website["']/);
    });
  });

  describe("12. MCP server / manifest", () => {
    test("GET /.well-known/mcp returns MCP discovery manifest", async () => {
      const res = await request(app).get("/.well-known/mcp");
      expect(res.status).toBe(200);
      expect(res.body.mcpVersion).toBe("2024-11-05");
      expect(res.body.name).toBe("vn-itjobs-mcp");
      expect(res.body.transport.endpoint).toBe("/mcp");
    });

    test("GET /mcp returns MCP handshake status", async () => {
      const res = await request(app).get("/mcp");
      expect(res.status).toBe(200);
      expect(res.body.protocolVersion).toBe("2024-11-05");
      expect(res.body.toolsAvailable).toContain("search_jobs");
    });

    test("POST /mcp handles JSON-RPC initialize handshake", async () => {
      const res = await request(app)
        .post("/mcp")
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-agent", version: "1.0.0" },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.jsonrpc).toBe("2.0");
      expect(res.body.id).toBe(1);
      expect(res.body.result.protocolVersion).toBe("2024-11-05");
      expect(res.body.result.serverInfo.name).toBe("vn-itjobs-mcp");
    });

    test("POST /mcp handles tools/list", async () => {
      const res = await request(app)
        .post("/mcp")
        .send({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        });

      expect(res.status).toBe(200);
      expect(res.body.result.tools).toBeDefined();
      const toolNames = res.body.result.tools.map((t) => t.name);
      expect(toolNames).toContain("search_jobs");
      expect(toolNames).toContain("get_job_details");
      expect(toolNames).toContain("calculate_salary");
      expect(toolNames).toContain("list_companies");
      expect(toolNames).toContain("get_platform_info");
    });

    test("POST /mcp handles tools/call for search_jobs and get_platform_info", async () => {
      const resStats = await request(app)
        .post("/mcp")
        .send({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "get_platform_info",
            arguments: {},
          },
        });

      expect(resStats.status).toBe(200);
      expect(resStats.body.result.content[0].text).toContain("VN.ITJobs");

      const resSearch = await request(app)
        .post("/mcp")
        .send({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "search_jobs",
            arguments: { keyword: "Golang" },
          },
        });

      expect(resSearch.status).toBe(200);
      expect(resSearch.body.result.content[0].text).toContain("Senior Golang Cloud Engineer");
    });
  });

  describe("13. Rate limit response headers & REST versioning", () => {
    test("API endpoints return standard RateLimit headers and API-Version", async () => {
      const res = await request(app).get("/api/search/suggestions?q=react");
      expect(res.status).toBe(200);
      expect(res.headers["api-version"]).toBe("1.0.0");
      // express-rate-limit draft-7 or legacy headers
      expect(res.headers["ratelimit-limit"] || res.headers["x-ratelimit-limit"]).toBeDefined();
      expect(res.headers["ratelimit-remaining"] || res.headers["x-ratelimit-remaining"]).toBeDefined();
    });

    test("Versioned /api/v1 endpoints return 200", async () => {
      const resSuggestions = await request(app).get("/api/v1/search/suggestions?q=react");
      expect(resSuggestions.status).toBe(200);
      expect(resSuggestions.body.suggestions).toBeDefined();

      const resSalary = await request(app).get("/api/v1/salary/calculate?position=junior&skill=reactjs");
      expect(resSalary.status).toBe(200);
      expect(resSalary.body.success).toBe(true);
    });

    test("OpenAPI spec contains RFC 9457 ProblemDetails schema and typed error responses", async () => {
      const res = await request(app).get("/openapi.json");
      expect(res.status).toBe(200);
      expect(res.body.components.schemas.ProblemDetails).toBeDefined();
      expect(res.body.components.responses.RateLimitError).toBeDefined();
      expect(res.body.components.responses.BadRequestError).toBeDefined();
      expect(res.body.info.description).toContain("API Versioning Strategy");
      expect(res.body.info.description).toContain("Deprecation Policy");
    });

    test("Official CLI binary executes and prints help/version", () => {
      const { execSync } = require("child_process");
      const outputVer = execSync("node bin/cli.js --version").toString();
      expect(outputVer).toContain("vn-itjobs v1.0.0");

      const outputHelp = execSync("node bin/cli.js --help").toString();
      expect(outputHelp).toContain("VN.ITJobs CLI");
      expect(outputHelp).toContain("search <keyword>");
      expect(outputHelp).toContain("salary <position>");
      expect(outputHelp).toContain("mcp");
    });
  });
});
