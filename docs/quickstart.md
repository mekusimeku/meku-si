# Search-only MCP quickstart

Use Node.js 22+ and the [independent verification guide](first-contact-verification.md).
No model API, wallet, dependency install or payment is required.

1. Agree on one bounded test on an operator-controlled nonproduction endpoint.
   Confirm the exact deployed code/migrations. Hosted enforcement is unverified
   until observed; a repository branch does not prove deployment.
2. Obtain a separate operator-issued search-only credential. Set `MEKU_MCP_URL`
   to that approved endpoint and load `MEKU_API_KEY` privately, without echo or
   command-history capture. Never pass the value in a command-line argument.
3. Run the verifier. Its active phase takes about two minutes, checks 10 requests
   and stops if discovery shows anything beyond `meku_search_humans`:

```sh
node examples/shared/mcp-search-only-verify.mjs --phase=active --allow-remote
```

Follow the full guide to verify revocation of the same key and expiry of a
second initially working key. Both lifecycle phases also check all three REST request routes. The operator can issue the expiry-test key with a
5-minute lifetime; developer approvals still default to 30 days. No automatic
retry, live work, mission, payment or operator function is allowed in this test.

The output contains only fixed check names, counts and nonsecret run metadata.
It rejects unexpected search fields/content instead of silently stripping them.
A validation error is not accepted as a permission denial. Do not post raw
server responses if a check fails.

The public catalog URL is `https://meku.farm/api/public/mcp`; this script has no
default URL and always rejects the known production hosts, even with `--allow-remote`. Other remote URLs still require explicit nonproduction approval. Protocol is `2025-06-18`,
opaque bearer authentication on every JSON-RPC POST, JSON responses and no
long-lived SSE/session tracking. A GET returns static metadata only.

See the [MCP reference](mcp-reference.md). Search-only keys cannot submit, list or
read requests, even by direct tool call or REST. Legacy access is documented
separately. External developer confirmation is still required to claim an
independent integration; a local mock or simulator run does not count.
