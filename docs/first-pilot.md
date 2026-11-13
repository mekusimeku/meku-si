# Independent developer pilot

MEKU SI invites developers to test its public MCP interface and report what works, what fails, and what is unclear. This is a reproducible technical test, not a request for endorsement.

## One bounded search-only integration test

Follow the [complete verification guide](first-contact-verification.md). It covers
initialization, single-tool discovery, aggregate search, explicit direct-call and
REST denials, revocation and expiry of initially working credentials. These
negative probes contain no usable work request. Do not manually probe other
operations. The active phase uses 10 requests over about two minutes.

The operator must authorize the exact nonproduction endpoint, test window,
synthetic dataset and two restricted credentials. No live credential or contact
has been created by preparing this guide. Record client/runtime versions and
redacted evidence, then obtain the outside tester's own confirmation. An SDK
claim requires that SDK to make the actual call; the portable Node verifier alone
does not establish framework compatibility. Cursor and Claude Code configurations
are reference examples until independently exercised.

## Verification status

Track stages separately: **configured**, **attempted**, **successful**, and **independently confirmed**. A successful independent test requires confirmation from the outside developer that the named client completed the authenticated **meku_search_humans** call, with redacted evidence. Do not call MEKU's internal test independent.

## Optional later human-work pilot

Only after both sides agree, define the task, scope, requirements, deliverable, timing, and proposed budget. A human must see the details and freely accept or decline. Do not call **meku_request_human** until the operator has reviewed the proposed task and the developer has explicit approval to submit it. Submission creates a request for operator review; it does not hire a person, verify completion, or make payment. The three MCP tools do not handle mission funding, completion verification, or payment. See [security and consent](security-and-consent.md).

## Report the result

Use the [integration report form](https://github.com/mekusimeku/meku-si/issues/new?template=integration_request.yml) only after removing secrets and personal data. A report is not required to include a raw response; share only what is needed to reproduce the result.

To join, email meku_si@outlook.com with the subject “MEKU MCP independent test”. Include your preferred client/version, whether you can test one read-only call, and a public link to relevant developer work. Do not include secrets. This invitation is not a paid offer or partnership commitment.

## Current hosted gate

Source controls are implemented on the website development branch and exercised
with native PostgreSQL and local HTTP. Hosted enforcement remains unverified.
The remaining step needs an outside-reachable nonproduction endpoint running the
reviewed commit/migrations, two operator-issued search-only test credentials and
authorized outside tester participation. A client-side allowlist or a general
production credential is not a substitute. Follow the guide; stop on 401/429 or
any contract mismatch and do not automatically retry.
