import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const GetTweetParamsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    tweet_id: { type: "string" },
    url: { type: "string" },
  },
};

const RawToolParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: { type: "string" },
    arguments: { type: "object", additionalProperties: true },
  },
};

let sessionId: string | null = null;

function extractTweetId(input?: string): string | undefined {
  if (!input) return undefined;
  const m = input.match(/status\/(\d+)/i);
  return m?.[1];
}

function parseGetTweetParams(params: unknown): { tweet_id?: string; url?: string } {
  const p = (params || {}) as Record<string, unknown>;
  const tweet_id = typeof p.tweet_id === "string" ? p.tweet_id : undefined;
  const url = typeof p.url === "string" ? p.url : undefined;
  return { tweet_id, url };
}

function parseRawToolParams(params: unknown): { name: string; arguments?: Record<string, unknown> } {
  const p = (params || {}) as Record<string, unknown>;
  const name = typeof p.name === "string" ? p.name : "";
  if (!name) throw new Error("'name' is required and must be a string");
  const args = p.arguments;
  const argumentsObj = args && typeof args === "object" ? (args as Record<string, unknown>) : undefined;
  return { name, arguments: argumentsObj };
}

function buildMcpUrl(): string {
  const base = process.env.X_MCP_BASE_URL || "http://127.0.0.1:8081/mcp";
  const cfg = process.env.X_MCP_CONFIG_B64;
  if (!cfg) return base;
  const u = new URL(base);
  u.searchParams.set("config", cfg);
  return u.toString();
}

function parseSseData(raw: string): any {
  const lines = raw.split(/\r?\n/);
  const dataLines = lines.filter((l) => l.startsWith("data:"));
  if (!dataLines.length) throw new Error(`Empty SSE response: ${raw.slice(0, 300)}`);
  const payload = dataLines.map((l) => l.slice(5).trim()).join("\n");
  return JSON.parse(payload);
}

async function mcpPost(body: unknown, extraHeaders?: Record<string, string>) {
  const res = await fetch(buildMcpUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  let data: any;
  try {
    data = ct.includes("text/event-stream") ? parseSseData(text) : JSON.parse(text);
  } catch {
    throw new Error(`MCP non-JSON response (HTTP ${res.status}): ${text.slice(0, 400)}`);
  }

  if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${JSON.stringify(data)}`);
  if (data?.error) throw new Error(`MCP error: ${JSON.stringify(data.error)}`);

  return { data, res };
}

async function ensureSession() {
  if (sessionId) return sessionId;

  const initBody = {
    jsonrpc: "2.0",
    id: String(Date.now()),
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "openclaw-x-tools", version: "0.1.0" },
    },
  };

  const { res } = await mcpPost(initBody);
  const sid = res.headers.get("mcp-session-id");
  if (!sid) throw new Error("MCP initialize succeeded but no mcp-session-id header returned");
  sessionId = sid;

  // Best-effort initialized notification
  try {
    await mcpPost(
      { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
      { "mcp-session-id": sessionId },
    );
  } catch {
    // ignore; many servers don't require this
  }

  return sessionId;
}

async function callMcpTool(name: string, args: Record<string, unknown>) {
  const sid = await ensureSession();
  const body = {
    jsonrpc: "2.0",
    id: String(Date.now()),
    method: "tools/call",
    params: { name, arguments: args },
  };

  try {
    const { data } = await mcpPost(body, { "mcp-session-id": sid });
    return data?.result;
  } catch (err) {
    // retry once with fresh session (session expired/reset)
    sessionId = null;
    const sid2 = await ensureSession();
    const { data } = await mcpPost(body, { "mcp-session-id": sid2 });
    return data?.result;
  }
}

function toolText(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

const plugin = {
  id: "x-tools",
  name: "X Tools Bridge",
  description: "Bridge OpenClaw tools to x-twitter-mcp-server over MCP HTTP",
  register(api: OpenClawPluginApi) {
    api.registerTool(
      {
        name: "x_get_tweet",
        label: "X Get Tweet",
        description: "Get tweet details from x-twitter-mcp-server by tweet_id or X URL",
        parameters: GetTweetParamsSchema,
        async execute(_toolCallId, params) {
          try {
            const p = parseGetTweetParams(params);
            const tweetId = p.tweet_id || extractTweetId(p.url);
            if (!tweetId) return toolText({ error: "Provide tweet_id or url containing /status/<id>." });

            const result = await callMcpTool("get_tweet_details", { tweet_id: tweetId });
            return toolText({ tweet_id: tweetId, mcp_result: result });
          } catch (err) {
            return toolText({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { name: "x_get_tweet" },
    );

    api.registerTool(
      {
        name: "x_mcp_tool",
        label: "X MCP Raw Tool Call",
        description: "Call any x-twitter-mcp-server tool by name with raw arguments",
        parameters: RawToolParamsSchema,
        async execute(_toolCallId, params) {
          try {
            const p = parseRawToolParams(params);
            const result = await callMcpTool(p.name, p.arguments || {});
            return toolText({ tool: p.name, mcp_result: result });
          } catch (err) {
            return toolText({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { name: "x_mcp_tool" },
    );

    api.logger.info?.("x-tools: Registered x_get_tweet, x_mcp_tool");
  },
};

export default plugin;
