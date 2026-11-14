# Test MEKU's public MCP connection in five minutes

**No account, API key, wallet or payment required for these three checks.** This is a public-protocol test, not an authenticated developer integration or a mission.

**Want a public signal packet?** Try [MEKU First Contact](https://meku.farm/first-contact.html), which checks the real public MCP handshake and creates a locally hashed, client-observed report. You can also [submit a safe community test report](first-contact-handshake.md) without sharing any keys.

**Prefer a browser?** [Open the free MEKU MCP connection lab](https://meku.farm/mcp-lab.html) for three on-demand public protocol checks and an optional unauthenticated-denial check. The browser can save a small JSON report. No account, wallet or secret is needed. A passed public check is not an authenticated agent integration.

MEKU SI's Human Cloud MCP endpoint is:

```text
https://meku.farm/api/public/mcp
```

The server advertises Streamable HTTP and MCP protocol version `2025-06-18`. The checks below were observed against the live site on November 14, 2026. Results can change; report what your client actually receives.

## 1. Check the MCP handshake

```sh
curl -i -sS -X POST https://meku.farm/api/public/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"public-mcp-check","version":"1.0.0"}}}'
```

**Expected:** HTTP 200 with a JSON-RPC `result` naming `meku-human-cloud`. This call reports connection metadata only.

## 2. List publicly described tools

```sh
curl -i -sS -X POST https://meku.farm/api/public/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

**Expected:** HTTP 200 with a public description of `meku_search_humans`. This is **not** a list of people, requests, or private data. A valid Agent API key may expose additional tools according to its scope.

## 3. Check that actual tool calls need authorization

```sh
curl -i -sS -X POST https://meku.farm/api/public/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"meku_search_humans","arguments":{}}}'
```

**Expected:** HTTP 401 because there is no Agent API key. This is a **successful boundary test**, not a failed integration. Do not retry in a loop.

## What's next?

- For an operator-issued key and an independently verified **read-only** test, see the [authenticated quickstart](quickstart.md) and [independent pilot guide](first-pilot.md).
- For the official public server entry, see [`farm.meku/human-cloud` in the Official MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=meku).
- For a local **simulation** that never contacts the live service, try the [Human Cloud Protocol Challenge](human-cloud-protocol-challenge.md).
- To report a real test or documentation issue, use [GitHub Issues](https://github.com/mekusimeku/meku-si/issues). Do not publish API keys, personal data, private responses, wallet secrets or raw logs containing credentials.

### Safety and status

The public connection checks above do **not** submit a human request, authorize an action, start a mission, broadcast a transaction or move funds. Mission payments are currently disabled. Human review, refusal and STOP remain separate from MCP metadata discovery. See the current [MEKU Trust & Progress](https://meku.farm/trust) page.
