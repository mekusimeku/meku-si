# MEKU SI — the Human Cloud

AI requests work. Humans choose whether to accept. Approved work can be paid in MEKU SI on Solana.

MEKU SI connects AI agents to people who can carry out real-world work. This repository is the public developer headquarters for connecting to the MEKU Human Cloud through its Model Context Protocol (MCP) server.

## Start here

- [Live documentation](https://meku.farm/docs)
- [AI access and MCP setup](https://meku.farm/ai-access)
- [First-contact quickstart](docs/first-contact-quickstart.md) — run the local simulation first, then make an optional read-only MCP test.
- [Quickstart](docs/quickstart.md)
- [MCP tool reference](docs/mcp-reference.md)
- [Integration guides](docs/integrations.md)
- [Security and human consent](docs/security-and-consent.md)
- [FAQ](docs/faq.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Independent pilot guide](docs/first-pilot.md)
- [Human Cloud showcase](docs/showcase.md)
- [Roadmap](ROADMAP.md)
- [Operations log](OPERATIONS.md)

## Connect

The public MCP endpoint is:

```text
https://meku.farm/api/public/mcp
```

Access requires an Agent API key issued by MEKU SI. Every JSON-RPC POST, including discovery and tool calls, requires the key in an Authorization Bearer header. See the [quickstart](docs/quickstart.md); never commit a key.

The source-reviewed catalog has three tools, with access enforced per key:

- **meku_search_humans** — aggregate availability. This is the only tool available to search-only credentials.
- **meku_request_human** — available only to separately authorized writable keys; submit a request for operator review. This is a write action; it does not itself approve work, create a paid mission, or send payment.
- **meku_get_request_status** — available to legacy keys with request-read access; denied to search-only credentials.

## Current status

This repository documents the public interface and offers client setup examples. Example configuration is reference material; it is not evidence that a client integration has been independently tested. As of 2026-10-24, source changes and a credential-safe verifier are prepared for review. Native PostgreSQL and local HTTP tests are internal evidence. Hosted enforcement, independent external integration and a paid mission remain unverified.

The MCP server does not expose a payment tool. Mission approval, human acceptance, and any payment happen through processes outside these three MCP tools. Do not represent a submitted request as completed work or a payment.

Read [known limitations](docs/mcp-reference.md#known-limitations) before building against the endpoint. The reviewed implementation is not deployment evidence. Use the [independent verification procedure](docs/first-contact-verification.md), confirm the exact authorized nonproduction version, and stop if observed behavior differs.

## Contribute

Useful, reproducible integration reports and documentation fixes are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [security policy](SECURITY.md) first. Never include API keys, wallet secrets, personal data, or private user information in issues or pull requests.

## Contact

- Website: [meku.farm](https://meku.farm)
- Developer access: [meku.farm/ai-access](https://meku.farm/ai-access)
- Email: meku_si@outlook.com
- X: [@MEKU_SI](https://x.com/MEKU_SI)

## Reusable developer tools

- [Search-only MCP verifier](examples/shared/README.md): initialization, search, direct-call/REST denial, expiry and revocation; no credentials or raw responses in reports.
- [Independent test procedure](docs/first-contact-verification.md): exact lifecycle steps and evidence needed; Node.js 22+, no model or package install.
- [Integration verification standard](docs/integration-standard.md)
- [20 candidate Human Cloud use cases and mock task briefs](docs/use-cases.md)
- [Independent test report template](docs/independent-test-case-study-template.md)

## Human Cloud Protocol Challenge

Try a clearly labeled local simulation before using any live credential. The challenge separates three levels: Level 1 simulation (no credential), Level 2 independent authenticated search-only MCP test (pending an authorized nonproduction endpoint, restricted credentials and an outside tester), and Level 3 separately approved real human-work pilot.

- [Challenge specification and evidence rules](docs/human-cloud-protocol-challenge.md)
- [Run the local simulator](examples/human-cloud-simulator/README.md) — mock request, human choice, proof, and payment result; no network calls or real mission
- [Demo evidence and verification limits](docs/first-contact-evidence.md)
- [Candidate AI-agent integration projects](docs/collaboration-targets.md)
- [Challenge report issue form](.github/ISSUE_TEMPLATE/human_cloud_challenge.yml)
- [Exploratory MEKU human-work handoff proposal](docs/human-work-handoff-proposal.md)
- [Public growth control center and evidence register](ops/black-sun-control-center.md)
