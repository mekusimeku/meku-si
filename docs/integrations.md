# Client integration guides

These are reference recipes based on each client's public MCP configuration and MEKU's published interface. None has been independently tested with a MEKU-issued key. The [live MEKU docs](https://meku.farm/docs) and [AI access page](https://meku.farm/ai-access) remain the source of truth.

The endpoint is **https://meku.farm/api/public/mcp**. An operator-issued Agent API key is required on every JSON-RPC POST, including initialization, discovery, and tool calls. Start with read-only **meku_search_humans**. The request tool is a write action and does not itself approve work or create payment.

| Client | Setup | Status |
| --- | --- | --- |
| Cursor | Remote HTTP MCP with environment-backed bearer header | Reference only; not tested against MEKU |
| Claude Code | Remote HTTP MCP in project **.mcp.json** | Reference only; not tested against MEKU |
| OpenAI Agents SDK (TypeScript) | Local Streamable HTTP client; static allowlist exposes search only | Reference example; not tested against MEKU |
| LangChain | Use the current MCP adapter and configure Authorization on every request | Guidance only; APIs vary by release |
| n8n | MCP Client Tool with bearer header stored in credentials | UI fields vary by release; not tested |

## Obtain and protect a key

Request access through [MEKU AI access](https://meku.farm/ai-access). Use only a key issued by a MEKU operator. Keep it in your local secret store or process environment; never put a literal key in a committed config, exported workflow, issue, screenshot, or log.

## Cursor

Create project config at **.cursor/mcp.json** or user config at **~/.cursor/mcp.json**. Set **MEKU_API_KEY** in the environment that launches Cursor, then refresh the MCP connection. Cursor's remote HTTP config supports environment interpolation in headers; remote servers do not support **envFile**.

The existing [Cursor config example](../examples/cursor/mcp.json) is safe to commit because it contains an environment reference, not a key.

    {
      "mcpServers": {
        "meku-human-cloud": {
          "url": "https://meku.farm/api/public/mcp",
          "headers": {
            "Authorization": "Bearer ${env:MEKU_API_KEY}"
          }
        }
      }
    }

If connection fails, inspect Cursor's MCP Logs and confirm the key is present in Cursor's launch environment. See [Cursor MCP docs](https://cursor.com/docs/mcp).

For detailed setup and safety notes, see the [Cursor example guide](../examples/cursor/README.md).

## Claude Code

Set **MEKU_API_KEY** in the environment that launches Claude Code. Put the following in the project-root **.mcp.json**:

    {
      "mcpServers": {
        "meku-human-cloud": {
          "type": "http",
          "url": "https://meku.farm/api/public/mcp",
          "headers": {
            "Authorization": "Bearer ${MEKU_API_KEY}"
          }
        }
      }
    }

The committed config contains only a variable reference. Claude Code's interactive session asks you to approve a project-scoped server before using it. Use the custom variable name **MEKU_API_KEY**; Claude Code intentionally treats some provider credentials, such as **ANTHROPIC_API_KEY**, as empty in remote headers. Check connection status with **claude mcp list** or **/mcp**. See [Claude Code MCP docs](https://code.claude.com/docs/en/mcp).

The existing [Claude Code config example](../examples/claude-code/.mcp.json) is reference material and has not been tested against MEKU.

For setup and safety notes, see the [Claude Code example guide](../examples/claude-code/README.md).

## OpenAI Agents SDK (TypeScript)

The [example](../examples/openai-agents-sdk/read-only.ts) uses **MCPServerStreamableHttp** from the local Agents SDK runtime. It puts the MEKU bearer header in **requestInit** and applies a static allowlist containing only **meku_search_humans**. The MEKU key goes from the local runtime to MEKU; it is not configured as an OpenAI-hosted MCP credential. The prompt and tool result can still be sent to the model provider, so review returned data before sharing.

Install **@openai/agents**, set **OPENAI_API_KEY** and **MEKU_API_KEY** in a private runtime environment, then run the file with your project's TypeScript runner. This read-only example does not expose the MEKU request tool. It has not been typechecked or tested against a MEKU-issued key. See the [official Agents SDK MCP guide](https://openai.github.io/openai-agents-js/guides/mcp/).

For setup, data flow, and consent details, see the [OpenAI Agents SDK example guide](../examples/openai-agents-sdk/README.md).

A future mission-request flow needs a separate explicit agent-side human approval step and MEKU operator review. A submitted request is not evidence of a human accepting work or a payment.

## LangChain

Use the current LangChain MCP adapter for your release and configure **Authorization: Bearer <key>** for initialization, discovery, and tool calls. Keep the key in a private secret store. Verify the client sends the header on every request before invoking a tool. Start with search; keep request submission disabled or behind explicit human approval. The API has changed across releases, so no executable LangChain example is labeled tested.

## n8n

Configure the MCP Client Tool using the docs for your installed n8n version. Set the endpoint to **https://meku.farm/api/public/mcp** and store the bearer header in n8n credentials or another supported secret store. Start with search. Do not put a key in exported workflows or logs. Stop if your version cannot securely send headers on every MCP request. See [n8n docs](https://docs.n8n.io/).

## Report an integration result

Use the [integration report template](https://github.com/mekusimeku/meku-si/issues/new?template=integration_request.yml). Include the client and version, whether authenticated initialization and discovery completed, the tool called, and a redacted outcome. Never include API keys, raw personal profiles, or private contact details. A config example or HTTP 200 response alone does not prove a tool call succeeded; report actual independently observed results only.


## Shared diagnostic and repeatable verification

Use the [shared read-only MCP diagnostic](../examples/shared/README.md) to inspect initialization, tool discovery, and `meku_search_humans` before wiring a framework SDK. Its local tests use injected mock responses; they do not connect to MEKU. It has not been run against MEKU using an operator-issued key.

Follow the [integration verification standard](integration-standard.md) when adding an adapter or recording results. Use the [candidate use-case library](use-cases.md) for clearly bounded mock task briefs, and the [independent test report template](independent-test-case-study-template.md) only after a tester completes a test and consents to share it.
