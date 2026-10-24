# OpenAI Agents SDK: read-only MEKU MCP example

**Status: reference example only. It has not been typechecked or tested with a MEKU-issued key.**

This TypeScript example connects the local Agents SDK runtime to MEKU's remote Streamable HTTP endpoint. A static client-side tool allowlist exposes only **meku_search_humans**, so the example can check broad skill availability without submitting a work request.

## Setup

1. Request an Agent API key from a MEKU operator through [AI access](https://meku.farm/ai-access).
2. Create an OpenAI API key for your own model calls. The MEKU key and OpenAI key are separate credentials.
3. In a private local runtime or secret manager, set **MEKU_API_KEY** and **OPENAI_API_KEY**. Never add either value to this repository, a screenshot, or a public log.
4. Install **@openai/agents** in your Node project. Run [read-only.ts](./read-only.ts) with the TypeScript runner configured for that project.
5. Confirm the local client initializes, discovers the MEKU tools, and invokes only **meku_search_humans**. Report an integration only after the call returns successfully.

## What the example does

- Opens a local Streamable HTTP client to **https://meku.farm/api/public/mcp**.
- Sends the MEKU bearer header from the local runtime through the SDK's **requestInit** option.
- Applies a static tool filter that allows only **meku_search_humans**.
- Prompts for a summary without names, IDs, contact details, or raw profiles.
- Closes the MCP connection and emits a generic error message if setup or the call fails.

## Data and consent

The MEKU key is sent from your local runtime to MEKU. Your OpenAI key and the prompt/tool result are sent to the OpenAI model provider as part of the agent run. Review the data returned by MEKU before sharing it. The reviewed contract returns aggregates only; stop if unexpected private fields appear and retain no raw output.

The sample does not expose the MEKU request tool, ask a human to perform work, or make a payment. A future request flow must add explicit agent-side human approval and still pass MEKU operator review. Human acceptance and any payment must be verified separately.

## Troubleshooting

- Confirm both credentials exist in the runtime environment and are kept private.
- Check that the local client uses the exact endpoint and sends the bearer header on every MCP request.
- The example intentionally avoids logging raw error details, headers, or tool results. Inspect them locally only as needed and redact credentials and personal data before reporting a problem.
- Record the Agents SDK version, Node version, failure stage, and a redacted message. Do not label the example tested until another developer verifies it against an operator-issued MEKU key.

See the [shared client guide](../../docs/integrations.md) and [official Agents SDK MCP guide](https://openai.github.io/openai-agents-js/guides/mcp/).

## Search-only preparation

Use the [verification guide](../../docs/first-contact-verification.md) first. Set
**MEKU_MCP_URL** to the approved nonproduction endpoint and request a server-enforced
search-only credential. A client tool filter is not server authorization. Hosted
enforcement and this client integration remain unverified.

The model-driven SDK example can incur provider charges. It is outside the zero-dollar
verification path; the dependency-free verifier requires no model call. No provider
requests were made during this work.
