# Client integration guides

Reference setup based on each client's public configuration model and MEKU's live MCP instructions. These recipes have not been independently tested with a MEKU-issued key. Start with read-only meku_search_humans and gate the write tool behind a person.

| Client | Guidance | Status |
| --- | --- | --- |
| Cursor | Remote HTTP MCP plus environment-backed Authorization header | Reference only; not tested against MEKU |
| Claude Code | Remote HTTP MCP in project .mcp.json | Reference only; not tested against MEKU |
| OpenAI Agents SDK | Hosted MCP tool with approval required for every call | Reference TypeScript; not tested against MEKU |
| LangChain | MCP adapter supporting Streamable HTTP and per-request headers | Setup recipe only; exact API varies by version |
| n8n | MCP Client Tool with bearer header stored in credentials | UI fields vary by version; not tested |

## Cursor
Set MEKU_API_KEY in Cursor's launch environment. Add this to the supported MCP config (often .cursor/mcp.json):

~~~json
{
  "mcpServers": {
    "meku-human-cloud": {
      "url": "https://meku.farm/api/public/mcp",
      "headers": { "Authorization": "Bearer ${env:MEKU_API_KEY}" }
    }
  }
}
~~~

Keep literal keys out of config. Refresh MCP servers, inspect tool discovery, and test the read-only search first.

## Claude Code
Set MEKU_API_KEY in Claude Code's launch environment. A project .mcp.json can use:

~~~json
{
  "mcpServers": {
    "meku-human-cloud": {
      "type": "http",
      "url": "https://meku.farm/api/public/mcp",
      "headers": { "Authorization": "Bearer ${MEKU_API_KEY}" }
    }
  }
}
~~~

Do not expand a literal key into a config file you intend to commit or share. Test only search first.

## OpenAI Agents SDK (TypeScript)
Reference example using hosted MCP and approval for every call. Confirm current SDK options; this is not tested against MEKU.

~~~ts
import { Agent, hostedMcpTool, run } from "@openai/agents";
if (!process.env.MEKU_API_KEY) throw new Error("Set MEKU_API_KEY privately");
const meku = hostedMcpTool({
  serverLabel: "meku-human-cloud",
  serverUrl: "https://meku.farm/api/public/mcp",
  headers: { Authorization: "Bearer " + process.env.MEKU_API_KEY },
  requireApproval: "always",
});
const agent = new Agent({
  name: "MEKU read-only demo",
  instructions: "Use only meku_search_humans. Never submit work or claim a human accepted.",
  tools: [meku],
});
const result = await run(agent, "Search MEKU for photography skills.");
console.log(result.finalOutput);
~~~

See the [official Agents SDK MCP guide](https://openai.github.io/openai-agents-js/guides/mcp/). Hosted calls send the key through the provider service; review its key and data practices before use.

## LangChain
Choose a current LangChain MCP adapter/client that supports Streamable HTTP and lets you attach Authorization: Bearer <key> to every request. Store the key privately. Confirm headers are forwarded on initialization, discovery, and tool calls. Then list tools and invoke only search. Keep request submission disabled or behind explicit approval. Exact APIs vary by package and version; no executable authenticated snippet is published until verified.

## n8n
Configure the MCP Client Tool using the current n8n docs for your version. Set the endpoint to https://meku.farm/api/public/mcp and store the bearer header in n8n credentials or another supported secret store. Start with search. Do not put the key in exported workflows or logs. If your version cannot securely send headers on all MCP requests, stop rather than bypass authentication. See [n8n docs](https://docs.n8n.io/).

Report client version, setup, tool called, redacted response, and outcome in an [integration report](https://github.com/mekusimeku/meku-si/issues/new?template=integration_request.yml). Never include a key or personal data.
