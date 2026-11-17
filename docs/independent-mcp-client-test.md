# Independent MCP client test: MEKU Human Cloud

**Project-issued invitation — 2026-11-17.** MEKU SI is looking for independent MCP developers and agent operators willing to test its **public metadata connection**. A useful negative result is as welcome as a passing one. No endorsement, reward, token purchase, account creation or wallet is requested.

## Agent-readable invitation (MEKU-specific JSON, not an MCP standard)

```json
{
  "type": "meku.public-mcp-test-invitation.v1",
  "issuer": "MEKU SI project",
  "issued_on": "2026-11-17",
  "endpoint": "https://meku.farm/api/public/mcp",
  "transport": "streamable-http",
  "protocol_requested": "2025-06-18",
  "scope": "anonymous public metadata only",
  "permitted_checks": [
    "initialize",
    "tools/list",
    "one unauthenticated tools/call denial check"
  ],
  "observed_example_http": {
    "initialize": 200,
    "tools/list": 200,
    "unauthenticated_tools/call": 401
  },
  "browser_test": "https://meku.farm/mcp-lab.html",
  "repro_steps": "https://github.com/mekusimeku/meku-si/blob/main/docs/public-mcp-five-minute-test.md",
  "feedback_thread": "https://github.com/mekusimeku/meku-si/issues/31",
  "owner_approval_required_before_public_post": true,
  "no_secrets": true,
  "no_wallet_or_payment": true,
  "no_real_human_requests": true,
  "paid_agent_subscriptions_live": false,
  "mission_payments_live": false
}
```

*The HTTP values above describe prior observations, not guaranteed current results. Record your own responses and the time of the test.*

## Five-minute independent test

1. **Browser option:** open [MEKU MCP Lab](https://meku.farm/mcp-lab.html), trigger its public tests, and save a local report only if you want to. Do not type or upload a private token.
2. **Client option:** use MCP Inspector, a TypeScript/Python MCP SDK, or another actual MCP client. Send `initialize` and `tools/list` to `https://meku.farm/api/public/mcp`. See the [exact request examples](public-mcp-five-minute-test.md).
3. **Boundary option:** one `tools/call` with *no* API key should be denied. Stop after one test; do not brute-force keys, perform load testing, or attempt a private action.
4. **Inspect the result:** record client name/version, date/time, request method, HTTP status, returned public tool names, and any transport/CORS/schema issues. If only the browser demo was used, label it **browser test**, not independent host integration.
5. **Share one redacted report:** with the human operator's approval, comment on [the existing open test invitation, Issue #31](https://github.com/mekusimeku/meku-si/issues/31). A failed test with repeatable steps is valuable.

### Copyable report shape

```text
Client and version:
Date/time (UTC):
Environment (browser / MCP client / curl):
Check: initialize | tools/list | denied tools/call
Expected status:
Observed status:
Actual public tool names (if any):
Any schema, CORS or transport issue:
Reproduction steps (no secrets):
Evidence type: LIVE PUBLIC READ | LOCAL SIMULATION
```

## Strict boundaries

- **No authentication material** in a public report: no API keys, Authorization headers, cookies, session IDs, private URLs, wallet seeds, signed transactions, user IDs, private request IDs or personal data.
- **No live human task requests, payments, subscriptions, or autonomous execution.** Public discovery does not grant access to protected tools.
- MEKU human requests, when separately authorized, require operator review and human choice, including the right to refuse and STOP.
- The [official MCP Registry entry](https://registry.modelcontextprotocol.io/v0/servers?search=meku) is `farm.meku/human-cloud`. This project-issued invitation is not a new protocol, an official MCP certification, or a security audit.
- Do not assume that a successful `initialize` proves a full agent integration. No unaffiliated developer is claimed to have completed this test unless they actually submit verified evidence.

**More:** [MCP reference](mcp-reference.md) · [security and human consent](security-and-consent.md) · [public README](../README.md) · [MEKU Trust & Progress](https://meku.farm/trust).
