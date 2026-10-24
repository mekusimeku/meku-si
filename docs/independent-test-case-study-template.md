# Independent MCP test report — template

Use this page to record an external developer's test only after they have completed it and agreed to share the details. This is a blank template, not evidence that a test or mission has occurred. Follow the repository [security policy](../SECURITY.md); never publish keys, private profiles, personal contact details, or wallet secrets.

## Test summary

- **Developer/project:** [Name or consented public handle]
- **Client/framework and version:** [Exact name and version]
- **Runtime and version:** [Language/runtime]
- **Test date (UTC):** [Date and time]
- **Environment:** [Approved nonproduction site; this procedure never uses production]
- **MEKU credential:** [Separate operator-issued test key; do not record its value]
- **Evidence permission:** [What the tester agreed may be published]

## Source and lifecycle evidence

- **Exact public client/verifier commit:** [SHA]
- **Exact server commit and build evidence:** [operator witness; do not infer from a URL]
- **Migration prerequisites:** [0056/0057 verified by authorized environment owner]
- **Key A:** [nonsecret label; active report then revoked report and operator witness time]
- **Key B:** [nonsecret label; active report then expired report and operator witness time]
- **Revoked/expired REST list, status and submission:** [all six lifecycle checks per key passed; link safe reports]
- **Direct tool and REST denials:** [fixed safe check labels; no usable requests]
- **Aggregate privacy check:** [passed / failed; do not attach raw private data]
- **Outside tester confirmation:** [consented attestation and evidence link]

## Connection result

- `initialize`: [Observed result / not attempted]
- `notifications/initialized`: [Observed result / not attempted]
- `tools/list`: [Observed result / not attempted]
- `meku_search_humans`: [Observed result / not attempted]
- **HTTP status and JSON-RPC outcome:** [Redacted details]
- **Result summary:** [Use aggregate values only if safe and authorized]
- **Evidence link or attachment:** [Public, redacted evidence]

## Reproduction

1. [Client setup steps with key replaced by `<redacted>`]
2. [Exact tool and non-sensitive arguments]
3. [Observed response shape, with personal data removed]

## Problems and fixes

| Problem          | Evidence               | Resolution or workaround | Still open? |
| ---------------- | ---------------------- | ------------------------ | ----------- |
| [Observed issue] | [Redacted log excerpt] | [Change or none]         | [Yes/No]    |

Do not describe a proposed fix as completed until the tester verifies it. Do not call a client “supported” based on setup instructions alone.

## Optional human-work pilot

Record this section only if the developer separately agreed to a real pilot and all normal approval and consent gates were followed.

- **Task scope approved by requester:** [Redacted, specific summary]
- **Operator review:** [Outcome and date]
- **Worker consent:** [Confirmed through MEKU process; do not publish identity without consent]
- **Completion evidence:** [What was checked and by whom]
- **Payment:** [Only report if independently verifiable and the worker consented to public reporting]
- **Transaction evidence:** [Public transaction identifier only if safe, verified, and authorized]

An approved request is not a completed mission. A completed task is not proof of payment. If any stage did not happen, state **not performed** rather than inferring success.

## Publication review

- [ ] Tester reviewed this write-up and approved publication.
- [ ] Credentials, personal information, and private data are removed.
- [ ] All claims match the available evidence.
- [ ] Internal tests, independent client tests, approved work, completed work, and payment are described as separate milestones.
