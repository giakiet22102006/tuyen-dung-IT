// src/controllers/mcp.controller.js
const { TOOLS_MANIFEST, executeTool } = require("../services/aiTools.service");

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = {
  name: "vn-itjobs-mcp",
  version: "1.0.0",
  description: "Model Context Protocol (MCP) Server for VN.ITJobs - Vietnam's Leading IT Job Board & Developer Career Platform",
};

/**
 * Xử lý yêu cầu JSON-RPC 2.0 cho MCP Protocol
 */
async function handleJsonRpc(reqBody) {
  const { id, method, params } = reqBody;

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
