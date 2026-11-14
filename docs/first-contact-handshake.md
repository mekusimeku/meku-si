# MEKU First Contact — a reproducible public MCP signal

**First Contact:** https://meku.farm/first-contact.html

This is a practical public Model Context Protocol (MCP) connection exercise, not an authenticated integration or a paid mission. It takes **two read-only public requests** to the real [MEKU Human Cloud MCP server](https://meku.farm/api/public/mcp) after the visitor clicks **Send signal**.

## What the page checks

1. **`initialize`** — request protocol `2025-06-18` and check that the response identifies `meku-human-cloud`.
2. **`tools/list`** — read the publicly described tool names. No human names, profiles or private requests are exposed.
3. **Local snapshot** — build a sorted canonical structure of server name, version, protocol and public tool names, then compute **SHA-256** in the visitor's browser.

The resulting *signal packet* includes the UTC date, server name, protocol, public tool names, request HTTP codes and local hash. The hash helps compare public snapshots, but is **not a signature or attestation**. No backend stores this packet.

### Independently reproduce the public check

```sh
curl -sS 'https://meku.farm/api/public/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"public-first-contact-check","version":"1.0"}}}'
```

For the second request, use the same endpoint and headers, with:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

The two live responses must be checked separately. An HTTP 200 from one check does not prove the other.

## Join the public First Contact test

Run it from your own device, then, if you choose, share an **edited** report using the [First Contact report issue form](../.github/ISSUE_TEMPLATE/first_contact_signal.yml). You may also cite the [public lab](https://meku.farm/mcp-lab.html) or link to your own reproducible demonstration.

Only share public, non-sensitive information: the server name, protocol, public tool names, client-observed UTC time, public HTTP status codes and locally computed snapshot hash.

**Do not share:** API keys, browser cookies, private URLs, live payment records, wallet secrets, names of individual workers, location coordinates, sensitive account details, or logs containing those fields.

No prizes, rewards, endorsements or payments are promised for a submission.

## Safety and scope

- Public metadata checks need **no account, human age confirmation, wallet or API key**.
- Actual `tools/call` requests require a separately issued Agent API key. The public handshake does not grant tool access.
- A submitted human-work request, if later authorized through a different route, is still subject to operator review and human choice.
- Live mission payments and autonomous execution remain disabled.
- The image used on First Contact is MEKU's existing orange galactic artwork. It is a public brand visual, not evidence of worldwide usage or a technical security claim.
- This exercise is not an official MCP standard, a penetration test, a financial test, or a proof that an independent agent integration exists.

For further details: [MEKU developer docs](https://meku.farm/docs), [public no-key test](public-mcp-five-minute-test.md), [security and human consent](security-and-consent.md), [current trust status](https://meku.farm/trust).

## Machine-readable project summary

MEKU publishes [a custom First Contact interface summary](https://meku.farm/.well-known/meku-first-contact.json). It is **MEKU-specific metadata**, not an official MCP Registry format. The official server registration remains `farm.meku/human-cloud`.
