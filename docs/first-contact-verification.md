# Independent search-only integration test

This is the procedure for a future authorized outside developer. No outside
integration is verified by the local tests. Production enforcement is unverified.
Use an operator-approved **nonproduction** endpoint with synthetic listed humans.
Never use a general key or submit a usable work request as a connectivity test.

## What must be ready

The operator records the exact website commit, deployed build identity and
nonproduction migration log. Migrations 0056 and 0057 and their prerequisites must
be applied before running the code. The application must have its normal private
server/database configuration; the tester receives only a search-only key.

Key A is for active access and revocation. Key B is for active access and expiry.
Both must be separate search-only/read-only credentials. New developer approvals
default to 30 days. The admin issuance screen can choose **5 minutes**, 1 hour or
30 days; the server accepts only whole minutes from 5 through 43,200. Use a
5-minute Key B and an agreed bounded lifetime for Key A. The operator alone
issues/revokes them after the test session is authorized. Do not include their
values or hashes in evidence. No production key or database modification is
needed for this procedure.

## Prepare the client

The public preparation remains on an isolated review branch. Obtain that exact
client version and record its SHA:

```sh
git clone --branch codex/first-contact-search-only-phase3-20261023 https://github.com/mekusimeku/meku-si.git
cd meku-si
git rev-parse HEAD
```

Node.js 22 or newer is sufficient; no package install, model API, wallet or fee is
required. In the public `meku-si` repository use:

```sh
VERIFY_SCRIPT=examples/shared/mcp-search-only-verify.mjs
```

In the website source repository the identical script is at:

```sh
VERIFY_SCRIPT=tools/mcp-search-only-verify.mjs
```

Set `MEKU_MCP_URL` to the exact approved nonproduction URL ending in
`/api/public/mcp`. The script has **no default endpoint**. URL credentials, query
parameters, fragments and other paths are rejected. Remote URLs require HTTPS
and the explicit `--allow-remote` flag. HTTP is permitted only on loopback.
The known production hosts `meku.farm` and `www.meku.farm` are always rejected,
including normalized/encoded forms, even with `--allow-remote`. A different
hostname still needs the operator's explicit nonproduction approval; a hostname
alone cannot prove its database or deployed code is safe.

In Bash, enter Key A without echo or command-history capture:

```sh
read -r -s -p 'Private test key: ' MEKU_API_KEY
export MEKU_API_KEY
```

Use a private terminal or secret manager. Disable shell tracing and HTTP debug
logging. Never pass the value as a command-line argument, paste it into a prompt,
commit it, record it in screenshots or include it in a report. The verifier does
not print or write keys, headers, raw responses, countries, skills or profile
data. It prints a report containing only fixed check labels and aggregate counts.

## 1. Active access and authorization

For the approved remote endpoint:

```sh
node "$VERIFY_SCRIPT" --phase=active --allow-remote
```

The active phase makes **10 requests**, paced 13 seconds apart, in about two
minutes. Default key limits are 5/minute and 20/day, shared across REST and MCP.
Do not run other clients with the same key at the same time. The script stops on
429 and never retries automatically. Save only its safe report after reviewing
it. It checks:

1. Authenticated initialization with protocol `2025-06-18` and the expected server.
2. The initialized notification returns 202 with no body.
3. Discovery contains exactly `meku_search_humans`. A broader inventory stops the
   run **before any tool call**.
4. An empty-argument search succeeds. Its JSON text must contain exactly the
   documented aggregate fields, consistent integer counts, an empty skill echo,
   country strings and the fixed privacy note. Extra fields/content blocks fail.
5. Direct request, status and unknown operator-tool calls receive the explicit
   scope denial. The request payload is intentionally invalid; even a broken
   permission gate cannot turn it into a valid request. A validation error is
   **not** accepted as authorization evidence.
6. REST list, status and invalid submission receive the explicit scope 403.
7. Authenticated responses prohibit caching. Redirects, excessive response bodies
   and raw network exceptions cannot disclose credentials in output.

The checker verifies the observed response contract and known privacy hazards.
It cannot prove that arbitrary text in a permitted country field is truthful, or
that a hidden production table has no personal data. Synthetic fixture sentinels
and source review provide separate checks of the server's column projection.
No minimum cohort size or anonymity guarantee is claimed.

## 2. Revocation of the same initially working key

The operator revokes Key A through the normal authorized key controls. Keep the
same private value in the tester's process and run:

```sh
node "$VERIFY_SCRIPT" --phase=revoked --allow-remote
unset MEKU_API_KEY
```

All three authenticated MCP methods (initialize, discovery and search) and all
three REST request routes (list, status and invalid submission) must return 401
with the explicit revoked-key reason. A random invalid key or a scope-only 403
does not pass. This phase makes six requests, paced 13 seconds apart.
The operator records the nonsecret label "A" and revocation time; the tester
links this result to A's active report without publishing a key or its hash.
Revocation affects new requests; it does not cancel a request already executing.

## 3. Expiry of another initially working key

Load the freshly issued 5-minute Key B privately. Run the active phase once.
Wait until the operator-provided server expiry time has passed, then run:

```sh
node "$VERIFY_SCRIPT" --phase=expired --allow-remote
unset MEKU_API_KEY
```

The same six MCP/REST checks must return 401 with the explicit expired-key reason.
Do not repeatedly probe before expiry. If clocks or the expiry time are unclear,
stop and ask the operator to resolve them. Revoke B at the end as cleanup. Each
key's successful active test uses 10 rate-limit hits; failed expired/revoked
authentication is checked before rate limiting. Nothing refreshes a credential.

For local HTTP fixtures omit `--allow-remote`. Automated native tests set the
library's interval to zero on loopback only; remote runs cannot disable pacing.

## Evidence needed to count an independent integration

Record tester/project identity with consent, runtime/client versions, UTC times,
the exact public client commit and server commit/build evidence. Include the
active A/B and revoked/expired safe reports, the operator's nonsecret lifecycle
witness, any failures, and the tester's own confirmation that their independent
client completed authenticated discovery and search. A framework integration
claim also needs that named framework's actual call; this Node tool does not
prove Cursor, Claude Code or an Agents SDK works.

Reports deliberately say `independent_adoption_verified: false`. A maintainer
must review outside evidence and the tester's attestation before making that
claim. Internal runs, simulations, configuration files and HTTP 200 alone do not
count. No mission, proof submission, payment or paid model call is part of this
test. Publish no raw response if a privacy check fails; record the fixed failure
code privately and send only a redacted description after review.

## The remaining access gate

Authorize one bounded external test session on an operator-controlled,
outside-reachable **nonproduction** endpoint running the reviewed code and
migrations, with the two restricted credentials above and an outside tester's
agreement. Hosted setup, credential issuance, developer contact and the test
itself require that separate authorization. None was performed to prepare this
guide.
