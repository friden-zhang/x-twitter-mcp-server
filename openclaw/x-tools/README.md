# x-tools (OpenClaw plugin)

Bridge plugin to call `x-twitter-mcp-server` from OpenClaw.

## Tools

- `x_get_tweet`:
  - Input: `tweet_id` or `url`
  - Calls MCP tool: `get_tweet_details`
- `x_mcp_tool`:
  - Input: raw `{ name, arguments }`
  - Calls any MCP tool by name

## Environment variables

- `X_MCP_BASE_URL` (default: `http://127.0.0.1:8081/mcp`)
- `X_MCP_CONFIG_B64` (optional): base64-encoded MCP config passed as `?config=`

## One-click setup

From repo root:

```bash
bash openclaw/x-tools/setup.sh
```

## Manual install into OpenClaw

```bash
mkdir -p ~/.openclaw/extensions/x-tools
cp -r openclaw/x-tools/* ~/.openclaw/extensions/x-tools/
openclaw plugins enable x-tools
openclaw gateway restart
```

## Quick test

Ask your agent:

- `Read this link: https://x.com/xingpt/status/2025219080421277813`

It should call `x_get_tweet` and return `get_tweet_details` output from MCP.
