# Shared MEKU MCP diagnostic

`mcp-readonly-smoke.mjs` is a small, dependency-free diagnostic for developers who want to check the public MEKU MCP connection before wiring in a framework SDK. It performs MCP initialization, lists tools, then calls only `meku_search_humans` with empty arguments.

It is a protocol diagnostic, not an OpenAI, Anthropic, LangChain, or other framework adapter. It has **not** been tested against MEKU with an operator-issued key. Tests inject mock HTTP responses to validate the request sequence and redacted output; they do not verify MEKU production behavior.

## Requirements

- Node.js 20 or newer (uses built-in `fetch` and `AbortSignal.timeout`).
- An Agent API key issued by a MEKU operator for a real endpoint check.
- Keep the key in a local secret manager or process environment. Never commit it, place it in a command transcript, or paste it into an issue.

## Run a read-only check

Set `MEKU_API_KEY` in the private environment used to run Node, then run:

```sh
node examples/shared/mcp-readonly-smoke.mjs
```

The default endpoint is `https://meku.farm/api/public/mcp`. An optional `MEKU_MCP_URL` can point to a test endpoint; remote endpoints must use HTTPS. HTTP is accepted only for loopback mock tests. URL credentials, query parameters, and fragments are rejected so they cannot be printed in the report.

The script sends the bearer header on every POST. It makes one request each for `initialize`, `notifications/initialized`, `tools/list`, and `tools/call` for `meku_search_humans`. It never calls `meku_request_human` or `meku_get_request_status`, never retries automatically, and summarizes only documented aggregate count fields from a JSON text block. Other result text is not printed.

Expected success output says initialization returned, lists the server-advertised tool names, and reports that the read-only search call returned. A successful local mock run does not prove an authenticated connection to MEKU. Do not share raw key material or unredacted server output.

## Run local tests

The tests use Node's built-in test runner and an injected mock `fetch`. They do not open a network connection, access MEKU, or require a real key:

```sh
node --test examples/shared/mcp-readonly-smoke.test.mjs
```

## If it fails

- **Missing key:** Ask MEKU for an operator-issued Agent API key through [AI access](https://meku.farm/ai-access).
- **401:** Check the key is present in the process environment and has not been revoked. Never include it in a bug report.
- **429:** Stop. The server documents no `Retry-After`; this script does not retry. Contact the operator if needed.
- **JSON-RPC error or missing tool:** Capture the HTTP status, JSON-RPC code, client/Node version, and time of attempt, with credentials and personal data removed.
- **Timeout or connection failure:** Check network/TLS access and the current [MEKU docs](https://meku.farm/docs). Do not keep retrying against production.

Use the [integration report template](../../.github/ISSUE_TEMPLATE/integration_request.yml) if you want to share a reproducible result.
