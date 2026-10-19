# The Human Cloud Protocol Challenge

## What happens when an AI needs a human?

This challenge gives agent developers a small, testable way to explore a handoff from software tools to optional human assistance. It separates simulation from live access and real work. The challenge is a MEKU SI community exercise, not an official protocol or a claim that a mission has occurred.

## Participation levels

| Level | What you do | Credentials | What counts as evidence |
| --- | --- | --- | --- |
| 1 — Simulation | Run the local mock workflow and inspect its event trace. | None | Client/runtime version, command, test result, and a redacted output excerpt. |
| 2 — Authenticated MCP test | Connect an independent MCP client and call only **meku_search_humans** with an operator-issued, server-enforced read-only test credential. | Issued privately by an authorized MEKU operator; never committed or shared. | Client/version, timestamp, success or exact redacted error, and confirmation that only the read-only tool was callable. |
| 3 — Real human-work pilot | With separate authorization, request a bounded task, wait for operator review, and let a person choose whether to accept. | Separately issued credential and explicit pilot approval. | Redacted event timeline, operator decision, human choice, completion evidence, and payment evidence only if payment actually occurs. |

Level 1 can be completed now. Levels 2 and 3 are gated. The public documentation does not establish that MEKU can currently issue a server-enforced read-only key. A client-side tool allowlist is not a credential restriction. Do not use a general production key for this challenge. Ask the MEKU operator to confirm scope and revocation before proceeding to Level 2.

## Level 1 — run the simulation

From the repository root, with Node.js 20 or newer:

    node examples/human-cloud-simulator/simulate.mjs
    node examples/human-cloud-simulator/simulate.mjs public_entrance
    node examples/human-cloud-simulator/simulate.mjs shelf_count
    node --test examples/human-cloud-simulator/simulate.test.mjs

The simulator has no HTTP client and makes no MEKU call. Its tool traces have **called: false**; its people, decisions, identifiers, statuses, and outputs are mock values. Payment is not simulated. See the [simulator guide](../examples/human-cloud-simulator/README.md).

## Level 2 — authenticated read-only test (currently blocked)

Do not attempt this level until an authorized MEKU operator has confirmed all of the following in writing:

1. The credential is a separate test key with a server-enforced allowlist limited to meku_search_humans.
2. The key cannot invoke meku_request_human or any write operation, even if a client is misconfigured.
3. The key has a defined expiry or revocation route, and the operator will revoke it after the test.
4. The operator approves the test window and the permitted query/data scope.

Once those conditions are met, use the [independent read-only test guide](first-pilot.md) and the [shared MCP diagnostic](../examples/shared/README.md). Do not place credentials in command history, source files, screenshots, issue reports, or public logs. If the server does not enforce a read-only scope, stop and report the blocker; do not substitute client-side restrictions.

## Level 3 — real human-work pilot (separately gated)

A real request is a write action. It requires all of the following before submission: informed requester approval, an operator-approved scope and budget, clear task boundaries and safety conditions, and a worker's independent choice to accept or decline. Silence is not consent. A submitted or approved request is not proof that a person accepted, completed the task, or was paid.

The currently documented MCP tools are meku_search_humans, meku_request_human, and meku_get_request_status. The status tool reports request status; do not interpret it as worker progress, task completion, or payment status. The MCP tools do not themselves prove a payment. Any pilot involving payment needs separate approval and a privacy-safe, independently verifiable transaction record.

## Safety and evidence rules

- Do not use a production credential, expose a secret, or ask a participant to paste one into GitHub.
- Do not submit a real work request as part of Level 1 or Level 2.
- Use a bounded task with permission for any visit or observation. Avoid private spaces, sensitive data, surveillance, unsafe work, or tasks that require a person to break rules.
- A participant may stop at any point. A human may decline without penalty or explanation.
- Share only the minimum evidence needed. Remove names, contact details, precise private locations, request identifiers, bearer tokens, and personal data.
- Report failures as failures. Keep mock results, internal tests, external tests, and real missions distinct.

## Submit a result

Use the [challenge report issue form](../.github/ISSUE_TEMPLATE/human_cloud_challenge.yml), or open a pull request with a redacted report based on the [test report template](independent-test-case-study-template.md). Do not include credentials or personal information. A maintainer may ask for clarification before marking a result verified.

Challenge status is earned per level, not as a blanket endorsement. MEKU will publish no completion badge or “verified” mark until a maintainer has reviewed the evidence and the participant has agreed to public attribution. A Level 1 result can only be described as a local simulation.

## What to include in a report

    Level: 1 / 2 / 3
    Client and version:
    Date (UTC):
    Environment: local mock / operator-issued test / approved pilot
    Steps attempted:
    Outcome: passed / failed / stopped
    Evidence: redacted log or link
    Known limitations:
    Public attribution: yes / no

Related: [MCP tool reference](mcp-reference.md) · [security and consent](security-and-consent.md) · [roadmap](../ROADMAP.md)
