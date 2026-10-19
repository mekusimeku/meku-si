# MCP reference

MEKU's [AI access page](https://meku.farm/ai-access) documents a Streamable HTTP MCP server at https://meku.farm/api/public/mcp, protocol version 2025-06-18, with bearer-key authentication.

## Connection
- Send one JSON-RPC request object per HTTP POST; do not send batches.
- Include Authorization: Bearer <MEKU Agent API key> on every POST, including initialization, discovery, and tool calls.
- Use JSON request bodies and accept application/json, text/event-stream as shown by MEKU.
- A GET returns static connection metadata; it does not expose tools.

## Tools

### meku_search_humans
Read-only aggregate search. Optional skills (string array) uses any-of matching; optional country is an exact match. Results include aggregate listed/online/matching counts, skills, and countries, not names or individual profiles. Counts cover at most 500 listed records. “Online” includes any status other than offline, including busy.

### meku_request_human
Write action that creates an execution request for operator review. It does not approve a mission, contact or hire a human, or make payment.

| Input | Guidance |
| --- | --- |
| title (required string) | 4–120 characters. |
| action (required string) | Keep under 80 characters; public docs and implementation differ on the maximum. |
| description (required string) | Use 20–2,000 characters, the stricter implementation limit. |
| skills (required string array) | Supply relevant skill tags. |
| budgetText, travelRequired, equipmentRequired (optional) | Public schema and implementation disagree on casing. Omit these until clarified. |
| idempotencyKey (optional string) | Key-scoped retry hint, trimmed and capped at 80 characters. Reuse returns the original request without comparing changed payload; not a full exactly-once guarantee. |

A successful response includes request information and an identifier for status lookup. Treat it as a submission receipt only.

### meku_get_request_status
Read-only lookup using required string id. Visibility is scoped to the exact API key that submitted the request. Documented states: submitted, under_review, approved, rejected, cancelled. Approved does not mean completed or paid.

## Errors and limits
- Unauthorized: HTTP 401 / JSON-RPC -32001.
- Rate limited: HTTP 429 / JSON-RPC -32001. Limit is shared with MEKU REST traffic; Retry-After is not documented.
- Invalid JSON or JSON-RPC can return HTTP 400 with standard parse/request errors.
- Tool errors can appear as isError: true even with HTTP 200; inspect the MCP body as well as HTTP status.

## Known limitations
- These three tools do not fund, approve, complete, or pay for a mission.
- Client compatibility has not been independently verified across all MCP hosts. MEKU reports an internal authenticated test; an independent external integration and paid mission are not verified as of 2026-10-19.
- The current endpoint returns JSON and does not provide long-lived SSE streaming or session tracking; clients requiring those behaviors may not work.
- Optional request field casing and some string limits differ between public schema and implementation. Omit affected optional fields and use stricter limits.
- Tool output does not promise a stable structured-content schema; handle missing or changed fields.

Check the [live AI access docs](https://meku.farm/ai-access) before deployment.
