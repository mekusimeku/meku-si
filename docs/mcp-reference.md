# MCP reference

MEKU's [live documentation](https://meku.farm/docs) describes a Streamable HTTP MCP endpoint at https://meku.farm/api/public/mcp, protocol version 2025-06-18, with an operator-issued bearer key. The live documentation is the source of truth. Details below reflect it as checked on 2026-10-19.

## Connection
- Send one JSON-RPC request object per HTTP POST; batches and null requests are not supported.
- Include Authorization: Bearer <MEKU Agent API key> on every POST, including initialization, discovery, and tool calls.
- Use JSON request bodies and accept application/json, text/event-stream as shown by MEKU.
- GET returns static connection metadata, not tools or an SSE stream.
- Responses are JSON. The server does not negotiate the requested protocol version, track initialization sessions, provide a session ID, or implement a long-lived server event stream. Initialized notifications return HTTP 202 with no body; ping returns an empty result.
- No output schema or structuredContent is supplied. Parse the response content defensively.

## Tools

### meku_search_humans
Read-only aggregate search. Optional inputs are country (string) and skills (string array). Country is trimmed and capped at 80 characters; matching uses exact equality. Skills are trimmed, non-string or empty entries are dropped, and at most 10 are retained; matching is case-insensitive and any-of. Results contain listed_humans, online_humans, matching_humans, matched_skills, countries, and a consent/privacy note. Counts cover at most 500 listed records. Online includes any status except offline, including busy. Filtered skill echo does not prove a matching skill was found. No names, profile IDs, contacts, or regions are returned. Availability can change; do not assume search results guarantee a person or a completed task.

### meku_request_human
This is a real write action. It creates an execution request for operator review; it does not approve work, create a mission, contact or hire a person, verify completion, or make payment. Human consent remains necessary.

The public tool schema advertises title, action, description, and skills as required. The live documentation reports these implementation limits:

| Field | Runtime guidance | Public schema mismatch |
| --- | --- | --- |
| title | 4–120 characters after trimming/coercion | Schema describes 3–120 |
| action | 4–200 characters after trimming/coercion | Schema describes 2–80; keep within 4–80 for the documented intersection |
| description | 20–2,000 characters after trimming/coercion | Schema describes 20–4,000; keep within 20–2,000 |
| skills | Supply an array; at most 10 retained, each capped at 40 characters | Advertised as required; runtime defaults to an empty array, so always provide relevant skills |

Optional strings country, region, deliverable, timeframe have caps of 80, 80, 300, and 120 characters respectively. Blank optional text becomes null. The advertised optional fields budget_text, travel_required, and equipment_required use snake_case, but the implementation reads budgetText, travelRequired, and equipmentRequired. Those camelCase fields may be rejected by schema-enforcing clients, so omit budget and flag options for interoperability until MEKU resolves the contract mismatch. The live docs mention an accepted contact field that is absent from the advertised schema; do not rely on it.

An optional string idempotencyKey is trimmed, capped at 80 characters, and scoped to the submitting key. A recognized retry returns the original request without comparing a changed payload. It is not a full exactly-once guarantee; concurrent retries may return a generic submission error. Validation happens before deduplication. Do not reuse a key for a different request or blindly retry after a timeout.

A new request starts with status submitted. A successful response includes id, status, created_at, note, and may include deduplicated: true. Treat it as a submission receipt only.

### meku_get_request_status
Requires the id returned by submission. Status lookup is scoped to the exact API key that created the request; another key on the same account does not grant access. The current format check accepts 36 hexadecimal/hyphen characters but does not enforce canonical UUID formatting. Results include request details such as title, action, description, location fields, skills, deliverable, timeframe, budget and flags, requester_kind, status, and created_at; they omit contact, owner/key identifiers, and operator notes. Documented states are submitted, under_review, approved, rejected, and cancelled. Approved does not mean work is complete or paid.

## Errors and limits
- Authentication failures use HTTP 401 and JSON-RPC -32001. Authentication happens before JSON parsing.
- Rate limits use HTTP 429 and JSON-RPC -32001. Limits are operator-configured and shared with REST traffic. No Retry-After header is supplied.
- Invalid JSON can return HTTP 400 / -32700; invalid JSON-RPC can return HTTP 400 / -32600.
- Method and tool lookup failures may use HTTP 200 with -32601 or -32602.
- Tool-level failures can appear as isError: true inside an HTTP 200 response. Inspect the full JSON-RPC body, not only the HTTP status.
- Unexpected internal failures and null-body behavior are not reliably converted into a JSON-RPC error.

## Human consent and operations
Before any write call, show a person the exact task, scope, requirements, and proposed budget, and require explicit approval. The operator reviews the submitted request. A human may accept, reject, or stop a mission. These three tools do not fund work, verify completion, or pay a person. Any separate mission/payment flow must follow MEKU's current documented process.

## Known limitations
- Client compatibility has not been independently verified across MCP hosts. MEKU reports an internal authenticated test; an independent external integration and paid mission are not verified as of 2026-10-19.
- Protocol version is advertised as 2025-06-18 but is not negotiated. Clients requiring session tracking or long-lived SSE may not work.
- The request input schema and runtime disagree on some field limits and optional field casing, as described above.
- There is no promised stable structured output schema. Handle absent or changed fields.
- Authenticated calls, including initialization, discovery, retries, and failures, consume the shared REST/MCP rate limit.

Check the [live documentation](https://meku.farm/docs) and [AI access page](https://meku.farm/ai-access) before deployment.
