# MCP reference

MEKU's [live documentation](https://meku.farm/docs) describes a Streamable HTTP MCP endpoint at https://meku.farm/api/public/mcp, protocol version 2025-06-18, with an operator-issued bearer key. The live documentation is the source of truth. Public discovery behavior was checked against the live service on 2026-11-14; protected tool-call behavior and documented schemas still require independent authenticated testing.

## Connection
- Send one JSON-RPC request object per HTTP POST; batches and null requests are not supported.
- Public `initialize`, `notifications/initialized`, and `tools/list` requests work without a key, returning only limited connection and tool metadata. Every `tools/call` and other protected operation needs `Authorization: Bearer <MEKU Agent API key>`. An invalid supplied key is rejected.
- Use JSON request bodies and accept application/json, text/event-stream as shown by MEKU.
- GET returns static connection metadata, not tools or an SSE stream.
- Responses are JSON. The server does not negotiate the requested protocol version, track initialization sessions, provide a session ID, or implement a long-lived server event stream. Initialized notifications return HTTP 202 with no body; ping returns an empty result.
- No output schema or structuredContent is supplied. Parse the response content defensively.

## Key scopes
- **Search-only keys** (`meku_exp1_…`) list and dispatch only meku_search_humans; request submission and status return a read-only tool error, and nothing is created. They expire exactly 30 days after issuance. Developer-application approvals issue this kind of key.
- **Request-capable keys** list all three tools, can read only their own requests, and have no expiry. They are operator-issued and revocable.
- A supplied but invalid, expired or revoked key gets HTTP 401 / -32001. It is never treated as anonymous.

## Tools

### meku_search_humans
Read-only aggregate search. Optional inputs: country (string), region (string) and skills (string array); undeclared or out-of-range inputs (more than 80 characters for country or region, more than 10 skills or skills longer than 40 characters) are refused with HTTP 400 / -32602 before any data is read. Country uses a fixed alias table of canonical English names (for example USA, US and United States are one country); an unrecognised country matches nothing. Region must equal a saved profile region after trimming and case folding; profiles without a region are excluded when a region is requested. Every requested skill must match on the same human, case-insensitively; empty skills add no filter. Only public, listed humans are counted, and only the first 500 saved profiles are checked: counts_complete=false means partial counts. Results contain listed_humans, online_humans, counts_complete, scanned_profile_limit, matching_humans, matched_skills, countries and a note. Location, skills and online status are self-reported, not verified live location or promised availability. No names, profile IDs, contacts or regions are returned.

### meku_request_human
This is a real write action. It creates an execution request for operator review; it does not approve work, create a mission, contact or hire a person, verify completion, or make payment. Human consent remains necessary.

Required: title, action and description. Optional: skills, country, region, deliverable, timeframe, budget_text, travel_required, equipment_required and idempotencyKey. The advertised schema and the server agree (live documentation, checked 2026-11-28):

| Field | Limit |
| --- | --- |
| title | 4–120 characters |
| action | 4–200 characters |
| description | 20–2,000 characters |
| skills | optional; at most 10, each at most 40 characters |
| country, region | at most 80 characters each |
| deliverable / timeframe / budget_text | at most 300 / 120 / 80 characters |
| travel_required, equipment_required | JSON booleans, not strings |

Text is trimmed and then cut to these caps before the minimum checks, so text beyond a cap is silently shortened, not rejected: keep within the limits. Blank optional text becomes null. Wrong JSON types return HTTP 200 with isError: true and create nothing. budget_text, travel_required and equipment_required are passed through as sent; camelCase aliases and any other undeclared argument, including contact, are refused with HTTP 400 / -32602 and nothing is created.

An optional idempotencyKey (1–80 letters, digits, dots, underscores, colons or dashes) is scoped to the submitting key. Repeating an identical task with the same key returns the saved request with deduplicated: true; reusing the key for a different task is refused with a tool error. An explicitly blank key is rejected. This protects retries but is not an exactly-once guarantee for every network failure, so do not blindly resend after a timeout.

A new request starts with status submitted. A successful response includes id, status, created_at, note, and may include deduplicated: true. Treat it as a submission receipt only.

### meku_get_request_status
Requires the id returned by submission. Status lookup is scoped to the exact API key that created the request; another key on the same account does not grant access. The current format check accepts 36 hexadecimal/hyphen characters but does not enforce canonical UUID formatting. Results include request details such as title, action, description, location fields, skills, deliverable, timeframe, budget and flags, requester_kind, status, and created_at; they omit contact, owner/key identifiers, and operator notes. Documented states are submitted, under_review, approved, rejected, and cancelled. Approved does not mean work is complete or paid.

## Errors and limits
- Authentication failures use HTTP 401 and JSON-RPC -32001. When a key is supplied, authentication and the rate check happen before JSON parsing; without a key, a malformed body gets 400 or 413 before the 401.
- Rate limits use HTTP 429 and JSON-RPC -32001. Limits are operator-configured and shared with REST traffic. No Retry-After header is supplied.
- Invalid JSON can return HTTP 400 / -32700; invalid JSON-RPC can return HTTP 400 / -32600.
- Method and tool lookup failures may use HTTP 200 with -32601 or -32602.
- Tool-level failures can appear as isError: true inside an HTTP 200 response. Inspect the full JSON-RPC body, not only the HTTP status.
- Unexpected internal failures and null-body behavior are not reliably converted into a JSON-RPC error.

## Human consent and operations
Before any write call, show a person the exact task, scope, requirements, and proposed budget, and require explicit approval. The operator reviews the submitted request. A human may accept, reject, or stop a mission. These three tools do not fund work, verify completion, or pay a person. Any separate mission/payment flow must follow MEKU's current documented process.

## Known limitations
- On 2026-11-14, a live outside-client check confirmed public initialize and tools/list (HTTP 200) and denial of a no-key tool call (HTTP 401). Compatibility across MCP hosts, independently verified authenticated external integrations, and live paid missions are not established by this check.
- Protocol version is advertised as 2025-06-18 but is not negotiated. Clients requiring session tracking or long-lived SSE may not work.
- The status tool reports request states only. It returns no worker progress, evidence or result, so a completed task cannot be read back through MCP yet.
- There is no promised stable structured output schema. Handle absent or changed fields.
- Authenticated calls, including initialization, discovery, retries, and failures, consume the shared REST/MCP rate limit.

Check the [live documentation](https://meku.farm/docs) and [AI access page](https://meku.farm/ai-access) before deployment.
