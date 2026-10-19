# Independent developer pilot

MEKU SI invites developers to test its public MCP interface and report what works, what fails, and what is unclear. This is a reproducible technical test, not a request for endorsement.

## One read-only MCP client test

This first test does not submit work, connect a wallet, or move funds.

1. Review the current [AI access instructions](https://meku.farm/ai-access) and [MCP reference](mcp-reference.md).
2. Ask the MEKU operator for a separate test key. Before use, ask whether it can be limited to the read-only **meku_search_humans** tool and how it can be revoked. Do not use an operator's production key. Keep the test key in a local secret manager or private environment variable. Never put it in a repository, issue, screenshot, prompt, or report.
3. Connect an independent MCP client that supports remote HTTP and bearer headers. Start with the [Cursor guide](../examples/cursor/README.md) or [Claude Code guide](../examples/claude-code/README.md). Both are reference examples and have not been independently verified. Do not treat a config-only setup as a successful integration.
4. In the client, make exactly one call to **meku_search_humans** with a harmless skill query such as **photography**. Do not call **meku_request_human** or **meku_get_request_status**. Search results are aggregate availability information; counts can change and do not identify people. The call uses the key's shared rate limit.
5. Check the client result, not only its connection indicator. A successful call returns a valid MCP/JSON-RPC result with no tool error. Do not repeat calls in a loop.
6. Ask the operator to revoke the test key when it is no longer needed.

### Success checklist

- [ ] Client and version recorded
- [ ] Separate test key issued by the operator and stored privately
- [ ] Remote HTTP MCP connection attempted
- [ ] **meku_search_humans** called once and valid result observed
- [ ] Redacted evidence reviewed by the tester and MEKU
- [ ] Test key revoked or marked for revocation

Record the client name and version, operating system, timestamp with time zone, connection stage, and redacted result or error. If it fails, include HTTP status and JSON-RPC error code/message when available. Do not share credentials, personal details, or private mission data. Raw HTTP diagnostics are in the [quickstart](quickstart.md), but a curl call alone does not count as an independent client integration.

## Verification status

Track stages separately: **configured**, **attempted**, **successful**, and **independently confirmed**. A successful independent test requires confirmation from the outside developer that the named client completed the authenticated **meku_search_humans** call, with redacted evidence. Do not call MEKU's internal test independent.

## Optional later human-work pilot

Only after both sides agree, define the task, scope, requirements, deliverable, timing, and proposed budget. A human must see the details and freely accept or decline. Do not call **meku_request_human** until the operator has reviewed the proposed task and the developer has explicit approval to submit it. Submission creates a request for operator review; it does not hire a person, verify completion, or make payment. The three MCP tools do not handle mission funding, completion verification, or payment. See [security and consent](security-and-consent.md).

## Report the result

Use the [integration report form](https://github.com/mekusimeku/meku-si/issues/new?template=integration_request.yml) only after removing secrets and personal data. A report is not required to include a raw response; share only what is needed to reproduce the result.

To join, email meku_si@outlook.com with the subject “MEKU MCP independent test”. Include your preferred client/version, whether you can test one read-only call, and a public link to relevant developer work. Do not include secrets. This invitation is not a paid offer or partnership commitment.
