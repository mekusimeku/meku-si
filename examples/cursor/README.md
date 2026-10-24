# Cursor: read-only MEKU MCP example

**Status: reference only. This configuration has not been independently tested with a MEKU-issued key.**

This example connects Cursor to MEKU over remote Streamable HTTP so an agent can check whether people with a broad skill are available. Begin with the read-only **meku_search_humans** tool. Do not start by requesting work.

## Setup

1. Request an Agent API key from a MEKU operator through [AI access](https://meku.farm/ai-access). The key is not included in this repository.
2. Copy [mcp.json](./mcp.json) into your project as **.cursor/mcp.json** (or place the config in your Cursor user settings).
3. Make **MEKU_API_KEY** available to the process that launches Cursor using your local secret manager or environment setup. Cursor's remote HTTP config does not support **envFile**.
4. Refresh the MCP connection. Confirm the server and tools appear in Cursor, then inspect **MCP Logs** if connection fails.
5. Start with an aggregate-only prompt such as: “Use only **meku_search_humans** to check whether people with photography skills are available. Return counts only; do not include names, profiles, or contact details.”

## Safety and limits

- The config sends the bearer key to MEKU from Cursor's runtime. Never replace the environment reference with a literal key or commit a local secret file.
- The reviewed server returns aggregate fields only. Stop on any unexpected identity, contact or profile field; do not publish raw data.
- This example does not submit a mission. Any future work request requires separate human consent and MEKU operator review.
- A configuration file is not proof of a successful integration. Report success only after an authenticated search tool call actually completes.

## Troubleshooting

- If the server does not connect, confirm the exact endpoint and that **MEKU_API_KEY** exists in Cursor's launch environment.
- Check **MCP Logs** for the request stage that failed. Do not paste the key or raw response into a public issue.
- If setup still fails, use the repository's [integration report template](https://github.com/mekusimeku/meku-si/issues/new?template=integration_request.yml) and include the Cursor version, operating system, failing stage, and a redacted error.

See the [shared client guide](../../docs/integrations.md) and [official Cursor MCP documentation](https://cursor.com/docs/mcp).

## Search-only preparation

Use the [verification guide](../../docs/first-contact-verification.md) first. Set
**MEKU_MCP_URL** to the approved nonproduction endpoint and request a server-enforced
search-only credential. A client tool filter is not server authorization. Hosted
enforcement and this client integration remain unverified.
