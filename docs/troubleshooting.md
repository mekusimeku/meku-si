# Troubleshooting MEKU MCP connections

Use the [quickstart](quickstart.md) and confirm the current [AI access instructions](https://meku.farm/ai-access) first. Remove credentials and personal data before sharing logs.

## The server says unauthorized
- Confirm the Agent API key is active and correctly copied.
- Send Authorization: Bearer <key> on every JSON-RPC POST, not just the first request.
- Do not expect GET to expose tools; it returns static connection metadata.
- Never paste a key into a public issue, screenshot, or shared client config.

## Tools do not appear
- Check the MCP URL is exactly https://meku.farm/api/public/mcp.
- Confirm the client is using Streamable HTTP and supports a bearer header on discovery and tool calls.
- Refresh the client's MCP connection after changing the configuration.
- Check the client version's official documentation; client setup examples here are reference material unless explicitly marked verified.

## HTTP 200 but the tool call failed
Read the JSON-RPC response body and check MCP tool error fields, including isError: true. HTTP success alone does not confirm a successful tool call.

## HTTP 429
MEKU documents shared rate limiting across REST and MCP traffic. Reduce call frequency. Retry carefully; Retry-After is not documented. Avoid concurrent retries.

## Request status is missing
Status lookup is scoped to the exact key that created the request. Confirm you are using the same active key and the exact request id. If the original call timed out, do not immediately submit again; first check status or contact MEKU support.

## Client requires session or streaming behavior
MEKU currently documents JSON responses and does not provide long-lived SSE streaming or session tracking. A client that requires those behaviors may not work with this endpoint. Report the client and version with a redacted trace.

## Environment variable is not found
Cursor and Claude Code inherit environment from their launch process. Restart them from an environment where MEKU_API_KEY is set. Do not write a literal key into a config file you will commit or share.

## Glama connector shows Unhealthy

On 2026-10-19, a single unauthenticated initialize POST to the live endpoint returned HTTP 401 with “Missing API key.” MEKU requires a bearer key on every JSON-RPC POST, including initialization and discovery. Glama's public connector page reports failed health checks but does not publish their raw responses, so this reproduces the likely failure condition; it does not prove the exact response from Glama's stored checks.

Glama supports an API Key test profile for authenticated health checks ([Glama FAQ](https://glama.ai/mcp/faq#how-do-i-submit-an-mcp-connector)). Before adding a MEKU credential there, confirm its scope and handling. MEKU's public docs do not document read-only or tool-scoped keys, and meku_request_human is a write action that submits work for operator review. Do not use a general key for a directory health check unless its scope and handling are acceptable. A safe resolution is a limited test credential that cannot call the write tool, then configure Glama's API Key test profile. Keep authentication intact while that safe credential or test path is unavailable.

## Still blocked?
Open a [bug report](https://github.com/mekusimeku/meku-si/issues/new?template=bug_report.yml) with the client/version, transport, redacted request/response, and timestamp. Never include an API key, wallet credential, or private personal data.
