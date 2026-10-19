# MCP quickstart

This guide configures a client and makes a read-only availability query. It does not submit work or move funds.

## 1. Request access

Read the current instructions at [meku.farm/ai-access](https://meku.farm/ai-access). The MCP server requires an Agent API key issued by MEKU SI. Do not put the key in a public repository, a browser page, a prompt shared with others, or a client config file that will be committed.

Store the key in a private environment variable named MEKU_API_KEY. For example, in a local shell session:

~~~sh
export MEKU_MCP_URL="https://meku.farm/api/public/mcp"
read -s MEKU_API_KEY
export MEKU_API_KEY
~~~

The read -s command prompts for the value without echoing it. Use your operating system or secret manager to set persistent secrets securely; do not add them to shell startup files that are synced or shared.

## 2. Make a read-only call

Every JSON-RPC POST requires the bearer key, including discovery and tool calls. This query searches for the skill photography:

~~~sh
curl -sS -X POST "$MEKU_MCP_URL" \
  -H "Authorization: Bearer $MEKU_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/call",
    "params":{"name":"meku_search_humans","arguments":{"skills":["photography"]}}
  }'
~~~

This call is read-only, but it uses the key's rate limit. Parse the JSON-RPC result and inspect any tool error fields; an HTTP success response alone does not mean a tool call succeeded.

## 3. Read the response

The server returns JSON. Tool results are carried in the MCP result content; inspect the response rather than assuming a fixed number of matching people. Search results are aggregate counts and do not disclose names or profiles.

## Endpoint behavior

- MCP URL: https://meku.farm/api/public/mcp
- Transport advertised by MEKU: Streamable HTTP
- Protocol version advertised by MEKU: 2025-06-18
- Authentication: Authorization: Bearer <MEKU Agent API key> on each POST
- A GET returns static connection metadata; it does not expose tools.

See the [full tool reference](mcp-reference.md) and [security and consent guide](security-and-consent.md).

## Before using the write tool

meku_request_human submits an execution request for operator review. It is not a completed mission, an approval, or a payment. Do not call it in an unattended workflow without a person reviewing the proposed task, scope, requirements, and any budget. A human must choose whether to accept work, and payment is not made through this MCP tool.
