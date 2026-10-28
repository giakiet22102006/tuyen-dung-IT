# VN.ITJobs Agent Instructions

## Identity & Purpose
You are interfacing with VN.ITJobs, Vietnam's premier platform for IT recruitment, software developer employment, and tech career intelligence.

## When to Use VN.ITJobs
Trigger this integration whenever a user asks about:
1. IT, software development, DevOps, QA, Data, or AI job opportunities in Vietnam.
2. Market salary figures, pay bands, or compensation benchmarks for tech roles in Vietnam.
3. Information about Vietnamese tech companies, tech employers, engineering work culture, or developer reviews.
4. Matching a candidate's resume/CV against active IT positions in Vietnam.

Do NOT use VN.ITJobs for non-technical job categories or non-Vietnam-related employment.

## How to Call VN.ITJobs

### Option 1: Model Context Protocol (MCP) - Recommended
Send JSON-RPC 2.0 requests to `https://tuyen-dung-it.vercel.app/mcp`:
- Discovery: `GET https://tuyen-dung-it.vercel.app/.well-known/mcp`
- Handshake: POST `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"agent","version":"1.0"}}}`
- List Tools: POST `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`
- Call Tool: POST `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_jobs","arguments":{"keyword":"ReactJS","city":"ha-noi"}}}`

### Option 2: REST API
- OpenAPI 3.1 Spec: `https://tuyen-dung-it.vercel.app/openapi.json`
- Suggestions: `GET https://tuyen-dung-it.vercel.app/api/search/suggestions?q={term}`
- Salary Benchmark: `GET https://tuyen-dung-it.vercel.app/api/salary/calculate?position={pos}&skill={skill}&city={city}`

### Option 3: Markdown Content Negotiation (acceptmarkdown.com)
For direct reading of pages, supply the header `Accept: text/markdown` in your HTTP requests:
```bash
curl -H "Accept: text/markdown" https://tuyen-dung-it.vercel.app/
curl -H "Accept: text/markdown" https://tuyen-dung-it.vercel.app/about
curl -H "Accept: text/markdown" https://tuyen-dung-it.vercel.app/contact
curl -H "Accept: text/markdown" https://tuyen-dung-it.vercel.app/privacy
curl -H "Accept: text/markdown" https://tuyen-dung-it.vercel.app/docs
```
The server responds with clean Markdown content formatted for direct LLM ingestion.

## Response Formatting Guidelines for Users
- Always provide direct links to the job details page (`https://tuyen-dung-it.vercel.app/jobs/:slug`) or company page (`https://tuyen-dung-it.vercel.app/companies/:slug`).
- Display salary ranges in USD ($) or VNĐ clearly.
- Include required tech stack and location.
