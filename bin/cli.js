#!/usr/bin/env node
/**
 * VN.ITJobs Official CLI Tool
 * Command-line interface for developers and AI agents to query IT jobs,
 * salary benchmarks, companies, and Model Context Protocol (MCP) status.
 */

const BASE_URL = process.env.VN_ITJOBS_API_URL || "https://tuyen-dung-it.vercel.app";
const VERSION = "1.0.0";

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
VN.ITJobs CLI v${VERSION}
Official Command-Line Interface for Vietnam's Premier IT Job Board & Career Platform.

USAGE:
  vn-itjobs <command> [options]

COMMANDS:
  search <keyword>       Search IT jobs by keyword, skill, position, or city
  salary <position>      Get salary benchmark report for an IT position
  companies              List top hiring tech companies
  info                   Get platform overview & stats
  mcp                    Inspect Model Context Protocol (MCP) server manifest
  version, -v, --version Print CLI version
  help, -h, --help       Print this help message

OPTIONS:
  --city <city>          City: ha-noi, ho-chi-minh, da-nang, khac
  --skill <skill>        Tech skill: reactjs, nodejs, golang, python, devops, etc.
  --position <pos>       Position: intern, fresher, junior, middle, senior, manager
  --limit <number>       Max results to return (default: 10)
  --json                 Output result as raw JSON (useful for agents & scripts)

EXAMPLES:
  vn-itjobs search "ReactJS" --city ha-noi
  vn-itjobs salary senior --skill golang --city ho-chi-minh
  vn-itjobs companies --limit 5 --json
  vn-itjobs mcp
`);
}

function getFlag(name) {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return null;
}

const isJson = args.includes("--json");

async function handleSearch() {
  const keyword = args[1] && !args[1].startsWith("--") ? args[1] : "";
  const city = getFlag("--city") || "";
  const skill = getFlag("--skill") || "";
  const position = getFlag("--position") || "";
  const limit = getFlag("--limit") || "10";

  const params = new URLSearchParams({ keyword, city, skill, position, limit });

  try {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "search_jobs",
          arguments: { keyword, city, skill, position, limit: Number(limit) },
        },
      }),
    });

    const data = await res.json();
    const content = data?.result?.content?.[0]?.text;
    const resultObj = content ? JSON.parse(content) : null;

    if (isJson) {
      console.log(JSON.stringify(resultObj || data, null, 2));
      return;
    }

    console.log(`\n🔍 Kết quả tìm kiếm việc làm IT cho "${keyword || "Tất cả"}" (${resultObj?.jobs?.length || 0} việc làm):\n`);
    (resultObj?.jobs || []).forEach((j, i) => {
      console.log(`${i + 1}. ${j.title}`);
      console.log(`   Công ty: ${j.companyName} | Địa điểm: ${j.city}`);
      console.log(`   Mức lương: ${j.salaryFormatted} | Kỹ năng: ${(j.skills || []).join(", ")}`);
      console.log(`   Chi tiết: ${j.url}\n`);
    });
  } catch (err) {
    console.error("Lỗi khi tìm kiếm:", err.message);
    process.exit(1);
  }
}

async function handleSalary() {
  const position = args[1] && !args[1].startsWith("--") ? args[1] : "junior";
  const skill = getFlag("--skill") || "";
  const city = getFlag("--city") || "";

  try {
    const res = await fetch(
      `${BASE_URL}/api/v1/salary/calculate?position=${encodeURIComponent(position)}&skill=${encodeURIComponent(skill)}&city=${encodeURIComponent(city)}`
    );
    const data = await res.json();

    if (isJson) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    console.log(`\n📊 VN.ITJobs Salary Benchmarking [${position.toUpperCase()}] ${skill ? `(${skill})` : ""}:`);
    if (data.data) {
      const d = data.data;
      console.log(`- Mức thấp nhất: ${d.minFormatted || d.min}`);
      console.log(`- Mức trung vị thị trường: ${d.medianFormatted || d.median}`);
      console.log(`- Mức cao nhất: ${d.maxFormatted || d.max}`);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error("Lỗi khi tra cứu lương:", err.message);
    process.exit(1);
  }
}

async function handleCompanies() {
  const limit = getFlag("--limit") || "9";

  try {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "list_companies",
          arguments: { limit: Number(limit) },
        },
      }),
    });

    const data = await res.json();
    const content = data?.result?.content?.[0]?.text;
    const resultObj = content ? JSON.parse(content) : null;

    if (isJson) {
      console.log(JSON.stringify(resultObj || data, null, 2));
      return;
    }

    console.log(`\n🏢 Top nhà tuyển dụng công nghệ hàng đầu:\n`);
    (resultObj?.companies || []).forEach((c, i) => {
      console.log(`${i + 1}. ${c.name} (${c.openJobsCount} việc làm mở)`);
      console.log(`   Địa chỉ: ${c.address || c.city}`);
      console.log(`   Trang công ty: ${c.url}\n`);
    });
  } catch (err) {
    console.error("Lỗi khi lấy danh sách công ty:", err.message);
    process.exit(1);
  }
}

async function handleMcp() {
  try {
    const res = await fetch(`${BASE_URL}/.well-known/mcp`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Lỗi khi kiểm tra MCP server:", err.message);
    process.exit(1);
  }
}

async function handleInfo() {
  try {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "get_platform_info",
          arguments: {},
        },
      }),
    });
    const data = await res.json();
    const content = data?.result?.content?.[0]?.text;
    console.log(content ? JSON.stringify(JSON.parse(content), null, 2) : JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Lỗi khi lấy thông tin nền tảng:", err.message);
    process.exit(1);
  }
}

async function main() {
  switch (command) {
    case "search":
      return await handleSearch();
    case "salary":
      return await handleSalary();
    case "companies":
      return await handleCompanies();
    case "mcp":
      return await handleMcp();
    case "info":
      return await handleInfo();
    case "version":
    case "-v":
    case "--version":
      console.log(`vn-itjobs v${VERSION}`);
      return;
    case "help":
    case "-h":
    case "--help":
    default:
      printHelp();
      return;
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
