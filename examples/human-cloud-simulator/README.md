# Human Cloud workflow simulator

This small Node.js example shows an agent preparing a human task, a requester and operator reviewing it, a synthetic human choosing whether to accept, proof review, and a simulated payment result.

**Simulation only:** it uses fixed mock values, makes no network requests, does not connect to MEKU, does not contact a person, and does not create a mission or payment. The final `SIMULATED_SUCCESS_NOT_PAID` label is not money, a transaction, or proof of MEKU payment. Status names are local demo labels, not MEKU API statuses.

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
5. The operator approves or rejects; a synthetic human is selected and accepts or declines.
6. A mock `meku_get_request_status` step represents checking the submitted request.
7. On completion, mock proof is submitted and accepted or rejected.
8. Only accepted mock proof produces the `SIMULATED_SUCCESS_NOT_PAID` result; no transfer occurs.

The trace lists the three MEKU tool names for teaching, but marks every entry `called: false`. The code has no HTTP client. Human IDs and proof are invented; the live search returns aggregate counts, not worker identities. For MEKU's real tool behavior and statuses, see the [MCP reference](../../docs/mcp-reference.md). For the independent read-only test, see the [pilot guide](../../docs/first-pilot.md).

## Adapt it safely

Use the output to teach client-side control flow, then replace each mock step only with a documented capability. Keep requester approval before any real write call. Keep operator review, a worker's choice, task completion, proof review, and payment as separate events. The three documented MCP tools do not create missions or payments. Do not use this simulator as a dry run against production.
