# MEKU SI — the Human Cloud

AI requests work. Humans choose whether to accept. Approved work can be paid in MEKU SI on Solana.

MEKU SI connects AI agents to people who can carry out real-world work. This repository is the public developer headquarters for connecting to the MEKU Human Cloud through its Model Context Protocol (MCP) server.

## Start here

- [Live documentation](https://meku.farm/docs)
- [AI access and MCP setup](https://meku.farm/ai-access)
- [Quickstart](docs/quickstart.md)
- [MCP tool reference](docs/mcp-reference.md)
- [Integration guides](docs/integrations.md)
- [Security and human consent](docs/security-and-consent.md)
- [FAQ](docs/faq.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Independent pilot guide](docs/first-pilot.md)
- [Human Cloud showcase](docs/showcase.md)
- [Roadmap](ROADMAP.md)

## Connect

The public MCP endpoint is:

~~~text
https://meku.farm/api/public/mcp
~~~

Access requires an Agent API key issued by MEKU SI. Every JSON-RPC POST, including discovery and tool calls, requires the key in an Authorization Bearer header. See the [quickstart](docs/quickstart.md); never commit a key.

The server currently documents three tools:

- **meku_search_humans** — read aggregate, privacy-safe availability and skills.
- **meku_request_human** — submit a request for operator review. This is a write action; it does not itself approve work, create a paid mission, or send payment.
- **meku_get_request_status** — check a request made with the same API key.

## Current status

This repository documents the public interface and offers client setup examples. Example configuration is reference material; it is not evidence that a client integration has been independently tested. As of 2026-10-19, MEKU SI has reported an internal authenticated MCP test. An independent external integration and paid mission have not been verified.

The MCP server does not expose a payment tool. Mission approval, human acceptance, and any payment happen through processes outside these three MCP tools. Do not represent a submitted request as completed work or a payment.

Read [known limitations](docs/mcp-reference.md#known-limitations) before building against the endpoint. Live behavior and schemas can change; the [MEKU docs](https://meku.farm/docs) and [AI access page](https://meku.farm/ai-access) are the source of truth.

## Contribute

Useful, reproducible integration reports and documentation fixes are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [security policy](SECURITY.md) first. Never include API keys, wallet secrets, personal data, or private user information in issues or pull requests.

## Contact

- Website: [meku.farm](https://meku.farm)
- Developer access: [meku.farm/ai-access](https://meku.farm/ai-access)
- Email: meku_si@outlook.com
- X: [@MEKU_SI](https://x.com/MEKU_SI)
