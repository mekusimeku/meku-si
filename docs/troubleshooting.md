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

**Observed 2026-10-19:** Glama's public listing reports that its last two health checks failed (last tested 07:54 UTC). In one direct read-only probe, an unauthenticated `initialize` POST to MEKU's live MCP endpoint returned HTTP 401, `Missing API key`. MEKU requires a bearer key on every JSON-RPC POST, including initialization and discovery. This reproduces the likely authentication failure mode, but Glama does not publish the raw responses from its stored checks, so it does not prove the exact response Glama received.

Glama's [hosted connector methodology](https://glama.ai/mcp/methodology) says its scheduled introspection uses `tools/list`, `resources/list`, and `prompts/list` against a Streamable HTTP endpoint. Glama expects a sandbox credential for a non-production environment; its [FAQ](https://glama.ai/mcp/faq#how-do-i-submit-an-mcp-connector) says to use an API Key test profile for authenticated checks. Public MEKU documentation does not describe a staging endpoint or a read-only test credential. The `meku_request_human` tool can submit work for operator review, so do not give Glama a general production key for health checking.

**Safe fix:** use a separate HTTPS Streamable HTTP staging endpoint backed only by test data and incapable of submitting real missions. Configure Glama's Admin → Test Profile to use API Key authentication and a staging-only credential. This does not require changing the production endpoint or sharing a production credential, but the staging credential itself must be provided to Glama. If no isolated staging endpoint and test credential exist, the check remains blocked. Do not set the production listing to No Auth: the endpoint rejects anonymous initialization, and Glama warns that this would misstate the server's authentication requirements.

## Still blocked?
Open a [bug report](https://github.com/mekusimeku/meku-si/issues/new?template=bug_report.yml) with the client/version, transport, redacted request/response, and timestamp. Never include an API key, wallet credential, or private personal data.
