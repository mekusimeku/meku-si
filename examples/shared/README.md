# Search-only MCP verifier

Start with the [independent verification guide](../../docs/first-contact-verification.md).
Node.js 22+ is sufficient; there is no install, model API, wallet or payment.

`mcp-search-only-verify.mjs` checks initialization, one-tool discovery, aggregate
search, direct-tool and REST denials, expiry and revocation. Use only a separately
approved nonproduction endpoint and operator-issued search-only test credentials.
`MEKU_MCP_URL` is required; there is no default production request. Credentials
come from the private `MEKU_API_KEY` environment variable and are never logged or
saved. Remote HTTPS requires the explicit `--allow-remote` flag.

```sh
node examples/shared/mcp-search-only-verify.mjs --phase=active --allow-remote
# Later, with the same initially working credential and the operator's witness:
node examples/shared/mcp-search-only-verify.mjs --phase=revoked --allow-remote
# A different initially working credential, after its finite expiry:
node examples/shared/mcp-search-only-verify.mjs --phase=expired --allow-remote
```

The active phase takes about two minutes and makes 10 requests, 13 seconds apart.
Stop on failure; no automatic retries. Default limits are 5/minute and 20/day,
shared with other clients. The intentionally invalid denied-submission probe
cannot create a valid work request. Scope denial must be explicit; a validation
error or generic 403 does not pass.

The report retains only fixed check names, counts, timestamps and endpoint. Raw
responses, keys, headers, countries, skills and private data are omitted. A report
is not independent adoption proof without an outside tester's attestation and
reviewed server/lifecycle evidence. No hosted or external test was performed to
prepare this utility. The same verifier is exercised over local HTTP against the
website handlers and native PostgreSQL using synthetic data.

The old `mcp-readonly-smoke.mjs` entry point now delegates to the full active
verifier, requires an explicit endpoint, and has the same safety restrictions.

Run the offline unit tests:

```sh
node --test examples/shared/*.test.mjs
```

These unit tests inject responses and use no live credentials. They are separate
from the website's native PostgreSQL/HTTP tests. Neither is outside integration.
