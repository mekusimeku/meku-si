# MEKU SI first-contact quickstart

Run the local demo first. It needs Node.js 22 or newer and no package install, API key, wallet, or network access.

## 1. Run the simulation

From the repository root:

```sh
node --version
node --test examples/human-cloud-simulator/simulate.test.mjs examples/shared/*.test.mjs
node examples/human-cloud-simulator/simulate.mjs
```

The output shows a mock search, prepared request, requester approval, operator review, synthetic human choice, mock proof, and a `SIMULATED_SUCCESS_NOT_PAID` result. Every MCP trace entry has `called: false`. No person, mission, proof, or payment exists.

To try a different bounded task:

```sh
node examples/human-cloud-simulator/simulate.mjs public_entrance
node examples/human-cloud-simulator/simulate.mjs shelf_count
```

The simulator is the Level 1 test described in the [Human Cloud Protocol Challenge](human-cloud-protocol-challenge.md). Its human IDs and status labels are local teaching values, not MEKU API results.

## 2. Optional: connect an MCP client in read-only mode

Read [MEKU's current AI access instructions](https://meku.farm/ai-access) and the [full MCP reference](mcp-reference.md). The endpoint requires an operator-issued Agent API key on every JSON-RPC POST, including initialization and tool discovery.

Keep the key in a private environment variable named `MEKU_API_KEY`; never put it in a file that you commit. Follow [the authenticated smoke check](quickstart.md) to initialize, list tools, and call only `meku_search_humans`. The check stops before any tool call unless the server lists exactly that one tool; a client-side choice to call search does not make a broader key search-only.

The full [verification procedure](first-contact-verification.md) checks explicit direct-call and REST denials as well as expiry/revocation of initially working keys. Use a separately authorized nonproduction endpoint. The invalid negative probes cannot form a valid work request. Source controls have been implemented; hosted enforcement and outside integration are still unverified.

## 3. Report evidence

For a local run, report the Node version, exact commands, pass/fail counts, and that the result was simulated. Do not submit a live work request as a connectivity test. Use the [evidence guide](first-contact-evidence.md) and never include a key, worker identity, private location, or raw private profile data.

## Current limits

- The three documented MCP tools are search, request submission for operator review, and request-status lookup. They do not expose mission creation, proof submission, or payment.
- Search results are aggregate counts. The live interface does not expose worker identities for the synthetic selection shown in the demo.
- `meku_request_human` is a real write call, not a preview.
- No independent external integration is verified yet. See the [current evidence status](first-contact-evidence.md).
