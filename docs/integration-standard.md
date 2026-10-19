# MEKU integration standard

Use this checklist when adding or reviewing a client, framework, workflow, or MCP-host integration. The [live MEKU documentation](https://meku.farm/docs) and [AI access page](https://meku.farm/ai-access) are authoritative; schemas and behavior can change.

## Start from the shared contract

- MCP endpoint: `https://meku.farm/api/public/mcp`.
- MEKU documents Streamable HTTP and protocol version `2025-06-18`.
- An operator-issued Agent API key is required on every JSON-RPC POST, including initialization, discovery, and tool calls.
- Start with the read-only `meku_search_humans` tool.
- The documented tools are `meku_search_humans`, `meku_request_human`, and `meku_get_request_status`. See the [full tool reference](mcp-reference.md).
- Current client support examples are reference material unless a test record names the client/version and evidence. A local mock test is not a live MEKU integration test.

## Integration record

Every integration example should state:

1. Client, framework, and version tested (or say “not tested”).
2. Language/runtime and dependency versions.
3. Where the key is stored and how it reaches the MCP client.
4. Exact setup steps and the smallest read-only call.
5. Whether initialization, tool discovery, and `meku_search_humans` were each observed to succeed.
6. Expected limitations and errors, including any server/client incompatibility.
7. Test date and evidence type: static review, local mock, operator-assisted live test, or independent developer-confirmed test.

Do not publish a success badge or claim compatibility based on a config snippet, HTTP 200 alone, a local mock, or an internal test. Record only the verified stage. Never include the key, raw private profile data, or a full unredacted trace.

## Test checklist

### Before connecting

- [ ] Read the current [MEKU docs](https://meku.farm/docs), [AI access](https://meku.farm/ai-access), and [MCP reference](mcp-reference.md).
- [ ] Confirm the client supports HTTP MCP and can attach an Authorization bearer header to every POST.
- [ ] Keep `MEKU_API_KEY` in the client’s secret store or private launch environment. Use a custom variable name if the host filters provider credentials.
- [ ] Pin or record client and package versions. Use a throwaway project if client configuration is project-scoped.

### Read-only test

- [ ] Connect and complete `initialize`.
- [ ] Discover the server tools.
- [ ] Call only `meku_search_humans` with empty or non-sensitive filters.
- [ ] Confirm the complete JSON-RPC envelope and inspect `isError`; do not treat HTTP 200 as sufficient.
- [ ] Record a redacted outcome and stop if authentication, discovery, or schema behavior differs from the docs.
- [ ] Do not automatically retry 429s or ambiguous writes. MEKU documents no `Retry-After` header.

### Write flow (separate, opt-in test)

`meku_request_human` submits a real request for operator review. It is not a dry run. Keep it disabled by default until a person has reviewed and explicitly approved the exact task description, scope, location, deliverable, and proposed budget through the applicable MEKU process. Do not submit a live request merely to test connectivity.

If an authorized write test is later run:

- [ ] Record who approved the exact submission and when, without publishing personal information.
- [ ] Use only fields supported by the current schema and docs; see [known field mismatches](mcp-reference.md#meku_request_human).
- [ ] Save the returned request ID securely and use the same API key for status lookup.
- [ ] Treat `submitted`, `under_review`, or `approved` as workflow states only. Approval is not human acceptance, completion, or payment.
- [ ] Verify human consent and completion separately through the documented operator process.
- [ ] Verify any payment independently; these three MCP tools do not make or prove a payment.

## Security and privacy requirements

- Never hard-code, commit, print, screenshot, or paste API keys, wallet credentials, or private user data.
- Send credentials only to the configured MEKU MCP endpoint. Do not forward keys to a model provider or third-party logging service.
- Do not assume tool results are schema-stable or that aggregate availability guarantees a person will accept a task.
- Give the model only the information needed to decide whether to ask a human. Preserve human choice and stop if the task scope changes.
- Do not send an MCP write call without explicit human approval. Operator review and worker consent are separate gates.
- Do not ask people to enter private property, handle money, access accounts, or perform risky or regulated work through an example.
- Follow the repository [security policy](../SECURITY.md) for vulnerability reporting.

## Error handling

- HTTP 401 and 429 use JSON-RPC error code `-32001`; a 429 has no documented `Retry-After`.
- Invalid JSON and JSON-RPC may return 400 / `-32700` or `-32600`.
- Method and tool lookup errors may be returned in HTTP 200 with `-32601` or `-32602`.
- Tool failures can return HTTP 200 with `isError: true`; inspect the JSON-RPC body.
- No promised `structuredContent` or stable output schema is documented. Parse defensively and tolerate missing fields.
- Do not automatically retry a timed-out write. The optional idempotency key has limitations; see the MCP reference.

## Contributing an integration

1. Open a draft PR with the client/version, setup guide, and a minimal example that keeps secrets out of files.
2. Include the test checklist above and label every step as tested or untested.
3. Use local mock tests where useful, but distinguish them from a live call.
4. Request an operator-issued key through [AI access](https://meku.farm/ai-access) if you want to run an authenticated test; do not request or post a production secret in GitHub.
5. Submit a redacted result with the [integration request template](https://github.com/mekusimeku/meku-si/issues/new?template=integration_request.yml).

See [CONTRIBUTING.md](../CONTRIBUTING.md) and the existing [integration guides](integrations.md) for repository conventions.
