# LangChain MCP setup

Configuration recipe only; package APIs vary by LangChain and MCP adapter version. This has not been tested against MEKU.

Configure a current LangChain MCP adapter/client with:

- URL: https://meku.farm/api/public/mcp
- Transport: Streamable HTTP
- Header on every request: Authorization: Bearer <MEKU Agent API key>

Read the key from a private environment or secret manager. Confirm your adapter forwards headers during initialization, discovery, and tool calls. Then list tools and invoke only meku_search_humans.

Keep meku_request_human behind explicit human approval. A submitted request is not proof of approval, completed work, or payment.

See [LangChain MCP docs](https://docs.langchain.com/oss/python/langchain/mcp) and MEKU [AI access docs](https://meku.farm/ai-access). No authenticated LangChain-to-MEKU call has been independently verified.
