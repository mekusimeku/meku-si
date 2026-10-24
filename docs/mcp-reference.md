# MCP reference

Source-reviewed contract for website [draft PR #1](https://github.com/mekusimeku/screenshot-magic-5054/pull/1), continuing from `dbfea73c809bb42f036c3136161263f059bb6dbb`, reviewed 2026-10-24. This is not proof of deployment. The public endpoint is catalog information; use only an explicitly approved nonproduction endpoint for the [verification procedure](first-contact-verification.md).

## Connection

- Send one JSON-RPC request object per HTTP POST; batches and null requests are not supported.
- Include Authorization: Bearer <MEKU Agent API key> on every POST, including initialization, discovery, and tool calls.
- Use JSON request bodies and accept application/json, text/event-stream as shown by MEKU.
- GET returns static connection metadata, not tools or an SSE stream.
- Responses are JSON. The server does not negotiate the requested protocol version, track initialization sessions, provide a session ID, or implement a long-lived server event stream. Initialized notifications return HTTP 202 with no body; ping returns an empty result.
- No output schema or structuredContent is supplied. Parse the response content defensively.

## Key permissions

| Key              | Discovery and direct tool access                                  | REST request access                                      | Expiry                                                                           |
| ---------------- | ----------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Search-only      | Only `meku_search_humans`; every other direct tool call is denied | Submission, list and status all denied with explicit 403 | Finite expiry required; 30-day default, operator may choose 5 minutes to 30 days |
| Legacy read-only | Search and own-key request status                                 | Own-key reads only                                       | Optional; revocation enforced                                                    |
| Legacy writable  | Search, submission and own-key status                             | Own-key submission/read                                  | Optional; revocation enforced                                                    |

Every new request reloads scope, expiry and revocation from the database. Missing or malformed scope/expiry fails closed. Developer approvals atomically issue 30-day search-only/read-only keys. Only an authenticated admin can issue, list or revoke credentials. Service-only SQL checks the reviewer role and serializes approval/rejection. No key grants mission, payment or operator authority.

## Tools

### meku_search_humans

Read-only aggregate search. Optional inputs are country (string) and skills (string array). Country is trimmed and capped at 80 characters; matching uses case-insensitive country equality. Skills are trimmed, non-string or empty entries are dropped, and at most 10 are retained; matching is case-insensitive and any-of. Results contain listed_humans, online_humans, matching_humans, matched_skills, countries, and a consent/privacy note. Counts cover at most 500 listed records. Online includes any status except offline, including busy. Filtered skill echo does not prove a matching skill was found. No names, profile IDs, contacts, or regions are returned. Availability can change; do not assume search results guarantee a person or a completed task.

### meku_request_human

This is a real write action. It creates an execution request for operator review; it does not approve work, create a mission, contact or hire a person, verify completion, or make payment. Human consent remains necessary.

The public tool schema advertises title, action, description, and skills as required. The live documentation reports these implementation limits:

| Field       | Advertised limits and runtime guidance                                            |
| ----------- | --------------------------------------------------------------------------------- |
| title       | 4–120 characters                                                                  |
| action      | 4–200 characters                                                                  |
| description | 20–2,000 characters                                                               |
| skills      | Required by discovery; runtime retains at most 10 entries capped at 40 characters |

Optional strings country, region, deliverable, timeframe have caps of 80, 80, 300, and 120 characters respectively. Blank optional text becomes null. MCP honors the advertised `budget_text`, `travel_required` and `equipment_required` fields by normalizing them to the existing internal names. Legacy camelCase callers remain accepted; if both are sent the advertised snake_case value wins. REST retains its existing camelCase input contract. The runtime also accepts an unadvertised contact field; clients should not rely on it.

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
- Null, arrays and primitive JSON-RPC bodies return 400 / -32600; non-object params return -32602.
- Authenticated JSON responses use Cache-Control: no-store. Untrusted browser Origin headers receive 403; native clients without Origin remain supported. See the [MCP transport requirement](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).

## Human consent and operations

Before any write call, show a person the exact task, scope, requirements, and proposed budget, and require explicit approval. The operator reviews the submitted request. A human may accept, reject, or stop a mission. These three tools do not fund work, verify completion, or pay a person. Any separate mission/payment flow must follow MEKU's current documented process.

## Known limitations

- Client compatibility has not been independently verified across MCP hosts. MEKU reports an internal authenticated test; an independent external integration and paid mission are not verified as of 2026-10-24.
- Protocol version is advertised as 2025-06-18 but is not negotiated. Clients requiring session tracking or long-lived SSE may not work.
- Discovery supplies input schemas, but runtime retains existing trimming, coercion, truncation and unknown-property tolerance for compatibility. Do not interpret that tolerance as authorization.
- There is no promised stable structured output schema. Handle absent or changed fields.
- Authenticated calls, including initialization, discovery, retries, and failures, consume the shared REST/MCP rate limit.

Check the [live documentation](https://meku.farm/docs) and [AI access page](https://meku.farm/ai-access) before deployment.
