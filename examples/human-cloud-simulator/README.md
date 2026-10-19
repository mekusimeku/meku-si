# Human Cloud workflow simulator

This small Node.js example shows how an agent could hand off a real-world task to a human while keeping approval and consent as separate steps.

**Simulation only:** it uses fixed mock values, makes no network requests, does not connect to MEKU, does not contact a person, and does not create a mission or payment. Its status names are local demo labels, not MEKU API statuses.

## Run it

Requires Node.js 20 or newer. From the repository root:

```sh
node examples/human-cloud-simulator/simulate.mjs
node examples/human-cloud-simulator/simulate.mjs public_entrance
node examples/human-cloud-simulator/simulate.mjs shelf_count
node --test examples/human-cloud-simulator/simulate.test.mjs
```

The output is JSON for one of three bounded task ideas: transcribing a public-facing storefront sign, describing visible entrance features from a public area, or counting a shelf item only with store permission.

## Handoff shown in the example

1. The agent notices it cannot make the local observation itself.
2. A mock `meku_search_humans` step returns invented aggregate counts.
3. The requester may approve or stop before submission.
4. A mock `meku_request_human` step represents submission for operator review.
5. The operator approves or rejects; a human then accepts or declines.
6. A mock `meku_get_request_status` step represents checking the submitted request.
7. The simulator labels a result as simulated completion. Payment is never simulated.

The trace lists the three MEKU tool names for teaching, but marks every entry `called: false`. The code has no HTTP client. For MEKU's real tool behavior and statuses, see the [MCP reference](../../docs/mcp-reference.md). For the independent read-only test, see the [pilot guide](../../docs/first-pilot.md).

## Adapt it safely

Use the output to teach client-side control flow, then replace each mock step only with a documented capability. Keep requester approval before any real write call. Keep operator review, a worker's choice, task completion, and payment as separate events. Do not use this simulator as a dry run against production.
