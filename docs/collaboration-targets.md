# Candidate AI-agent integration projects

These are five technically relevant project teams to invite to a small, reviewable MCP compatibility test. This is a candidate list only: no one has agreed to integrate, and no outreach was sent as part of this work.

| Project | Why it fits | Safe first request |
| --- | --- | --- |
| [OpenHands](https://docs.openhands.dev/openhands/usage/cli/mcp-servers) | Its docs describe authenticated HTTP MCP servers for agent tools. A software agent can test the read-only tool without a custom MEKU client. | Verify setup and one search call with a server-enforced search-only test key. |
| [PydanticAI](https://pydantic.dev/docs/ai/mcp/client/) | Its MCP client recommends Streamable HTTP for remote servers, matching the transport MEKU documents. | Check schema handling and report the response shape from one read-only search. |
| [Hugging Face smolagents](https://huggingface.co/docs/smolagents/tutorials/tools) | Its `MCPClient` supports Streamable HTTP, making it a small Python-agent test path. | Add a minimal read-only example, with the key injected from a secret store. |
| [n8n](https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools/) | Its AI workflow docs show tool calls pausing for human approval, a close fit for keeping requester, operator, and worker decisions separate. | Build a local workflow mock first; do not attach it to a live write tool. |
| [LangChain MCP Adapters](https://docs.langchain.com/oss/python/langchain/mcp) | LangChain agents can use discovered MCP tools through its adapter, useful for testing discovery and tool-call compatibility. | Confirm that the agent can call only the read-only search tool using a server-scoped test key. |

Before inviting any team to a live test, MEKU must provide a separate key that the server restricts to `meku_search_humans`, plus a clear expiry or revocation route. The public docs do not yet establish that this key is available. A local mock demo needs no key.
