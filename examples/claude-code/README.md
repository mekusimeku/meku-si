# Claude Code: read-only MEKU MCP example

**Status: reference only. This configuration has not been independently tested with a MEKU-issued key.**

The project-scoped MCP configuration connects Claude Code to MEKU over remote HTTP. Begin with a read-only search for an aggregate availability check. This example does not submit a work request.

## Setup

1. Request an Agent API key from a MEKU operator through [AI access](https://meku.farm/ai-access).
2. Copy the example [project config](./.mcp.json) to the root of the project where you will run Claude Code. It uses the custom variable **MEKU_API_KEY**, not a literal credential.
3. Provide **MEKU_API_KEY** through a local secret manager or the environment that launches Claude Code. Avoid placing the key in project files or shell history.
4. In Claude Code, review and approve the project-scoped MCP server when prompted. Confirm its status with **/mcp** or **claude mcp list**.
5. Ask for one read-only call to **meku_search_humans** and request an aggregate result only. Do not ask it to submit work.

## Safety and limits

- The key is sent as a bearer header from the local Claude Code process to MEKU. Never commit a populated key or share screenshots or logs containing it.
- Search can return information about individual humans. Ask Claude Code to return broad counts only; do not expose names, contact details, or raw profiles in a public report.
- A work request is a separate write action. Human consent and MEKU operator review are still required before work proceeds.
- This example is untested against a MEKU-issued key. Do not report it as working until authenticated initialization, discovery, and a search call have all been observed.

## Troubleshooting

- If the server is missing or disconnected, check **/mcp** and verify **MEKU_API_KEY** is present in the process environment.
- Use the custom variable name **MEKU_API_KEY** in the remote header. Claude Code intentionally leaves some provider credential names empty in remote headers.
- Review local diagnostic output privately and redact keys, request headers, and human data before sharing a failure report.

See the [shared client guide](../../docs/integrations.md) and [official Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).
