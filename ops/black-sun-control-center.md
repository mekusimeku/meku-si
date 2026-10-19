# MEKU SI — Black Sun control center

Public status board, updated 2026-10-19. It records only information suitable for public release; private contact details, email content, keys, and personal data belong in the private operations record. Missing analytics are not zero-valued metrics.

Status vocabulary: **PLANNED** · **IN PROGRESS** · **COMPLETED** · **VERIFIED** · **BLOCKED**. Every completed or verified item names evidence. Every blocker has a next step.

## Current evidence register

| Work item | Status | Evidence / limitation |
| --- | --- | --- |
| Public developer repository and core MCP docs | VERIFIED | [Repository](https://github.com/mekusimeku/meku-si); `OPERATIONS.md` and linked references. |
| Internal authenticated MCP test | COMPLETED | MEKU-reported test on 2026-10-18; internal only, not independent proof. |
| Independent authenticated external test | BLOCKED | Count: 0 confirmed. Next: operator must confirm a server-enforced, read-only test credential, scope and revocation before a tester connects. |
| Independent paid human-work missions | VERIFIED | Count: 0 verified. Next: separately approved pilot, explicit worker consent, completion evidence, and payment evidence if payment occurs. |
| Local Human Cloud simulation | VERIFIED | [`examples/human-cloud-simulator`](../examples/human-cloud-simulator/README.md); deterministic mock behavior only, no network or real person. |
| Local read-only MCP diagnostic | VERIFIED | [`examples/shared`](../examples/shared/README.md); four mock-fetch tests were reported passing in the existing operations log; no live MEKU call. |

## Ranked execution backlog

| Rank | Action | Status | Next step / evidence |
| --- | --- | --- | --- |
| 1 | Make the external MCP test safe | BLOCKED | Operator confirms server-side `meku_search_humans`-only scope, expiry, and revocation. Client allowlisting alone is insufficient. |
| 2 | Run the Human Cloud Protocol Challenge Level 1 | COMPLETED | Local simulator tests; participant report through the challenge issue form. |
| 3 | Validate core integration recipes against current tools/auth | IN PROGRESS | Prefer a test credential and deterministic mock fixtures; mark each framework tested only after reproducible evidence. |
| 4 | Add a compact MCP contract/compatibility fixture | PLANNED | Define expected tool names, schemas, auth errors and request-status semantics from public docs; no production call. |
| 5 | Find one independent tester | IN PROGRESS | Warm tester lead remains active from the founder's prior conversation; no further contact sent by this operation. Offer the kit only when a safe credential is available. |
| 6 | Submit useful upstream contributions | PLANNED | Select a specific issue/doc gap where a small contribution benefits the host project; no promotional submissions. |

## Developer integration tracker

| Integration | Status | Evidence / next step |
| --- | --- | --- |
| Shared MCP diagnostic (Node.js) | VERIFIED | Local syntax and mock tests reported passing; no live server credential. |
| Cursor guide | COMPLETED | Published as reference guide; not verified against MEKU-issued key. |
| Claude Code guide | COMPLETED | Published as reference guide; not verified against MEKU-issued key. |
| OpenAI Agents SDK guide | COMPLETED | Published as reference guide; not verified against MEKU-issued key. |
| Other frameworks | PLANNED | Reuse shared tool/auth reference; add examples only when they can be tested or clearly labeled. |

## Partnership and outreach (public-safe aggregate)

| Activity | Status | Evidence / next step |
| --- | --- | --- |
| Five one-to-one developer test emails | VERIFIED | Connected Gmail Sent confirmation recorded in the private tracker; no reply was present at the last recorded inbox check. No recipient addresses or message bodies are published here. |
| Additional qualified prospects | COMPLETED | 25 prospects were researched and prepared but not sent; private tracker retains identity, relevance, and deduplication. Seek approval before further sends. |
| Warm tester lead | IN PROGRESS | Active from the founder's prior conversation. No follow-up sent by this operation; no X login required. |
| Partnership conversations / external integration | BLOCKED | No independent integration or partnership is confirmed. Next: safe test credential, then invite a qualified developer to run one read-only call. |

## Technical blockers

| Blocker | Status | Next step |
| --- | --- | --- |
| No public evidence of server-enforced read-only API-key scope | BLOCKED | Ask the authorized operator to confirm or provide a separate least-privilege test credential; do not test with production credentials. |
| Tool schema/runtime differences noted in prior operations | IN PROGRESS | Compare public schemas and redacted error responses using safe fixtures; report exact mismatches before proposing changes. |
| Glama listing unhealthy | BLOCKED | Keep staging on hold; check its credential/profile requirements and revisit only when a restricted test credential is available. Do not change production to satisfy a health check. |

## Directory and distribution tracker

| Route | Status | Evidence / next step |
| --- | --- | --- |
| Official MCP Registry | VERIFIED | Listing identifier recorded in prior research: `farm.meku/human-cloud`, version `1.0.0`; verify current metadata before any update. |
| Glama | BLOCKED | Last reported unhealthy; not rechecked in this cycle. No safe credential currently confirmed. No remediation or production change attempted. |
| Smithery, Cursor, Anthropic connector directory | PLANNED | Recheck current eligibility and submission route before preparing a submission; do not imply acceptance. |
| External GitHub contributions | COMPLETED | 30 relevant repositories reviewed; no issue or PR submitted. Next: queue only specific, in-scope fixes. |

## Search visibility and measurements

| Measure | Status | Evidence / limitation |
| --- | --- | --- |
| Repository description/topics | VERIFIED | Existing description/topics already mention MCP, agents, human-in-the-loop work, and real-world tasks. |
| Search impressions / clicks | BLOCKED | No authorized analytics evidence recorded. Next: use official Search Console or site analytics only if access is configured. |
| GitHub stars / forks / open issues | VERIFIED | Prior read-only snapshot on 2026-10-19: 0 / 0 / 0 at that time. This is not a visit or clone count. |
| External tests / paid missions | VERIFIED | 0 independently confirmed external MCP tests; 0 independently verified paid missions as of this update. |

## Reusable distribution ideas

Scores are qualitative planning judgments, not demand data. Effort and maintenance use Low/Medium/High.

| Idea | Usefulness | Effort | Distribution | Risk | Maintenance | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Human Cloud workflow simulator | High | Low | High | Low | Low | VERIFIED — local mock tests; no live claims. |
| Read-only MCP smoke diagnostic | High | Medium | High | Medium | Medium | VERIFIED — mock-fetch tests; not a server-enforced key restriction. |
| Public MCP contract test fixtures | High | Medium | High | Low | Low | PLANNED — selected next; derive fixtures from published schemas and keep them offline. |
| Human approval event vocabulary | High | Medium | High | Medium | Medium | COMPLETED — exploratory proposal, not a standard. |
| Agent evaluation tasks for physical-world limits | High | Medium | Medium | Medium | Medium | PLANNED — use simulation and explicit safety boundaries. |
| Framework-neutral MCP setup checklist | Medium | Low | Medium | Low | Low | COMPLETED — shared guide and verification standard. |
| Redaction helper for MCP debug output | Medium | Medium | Medium | Medium | Medium | PLANNED — needs threat-model and tests before distribution. |
| Local mock MCP server for human-work workflows | High | Medium | High | Low | Medium | PLANNED — useful follow-on if it stays strictly offline. |
| Machine-readable compatibility matrix | High | Medium | High | Low | Medium | PLANNED — publish only results tied to reproducible versions/tests. |
| Directory metadata linter | Medium | Low | Medium | Low | Low | PLANNED — validate metadata locally; no auto-submission. |

Selected top three: simulator, read-only diagnostic, and offline contract-test fixtures. The first two exist; fixtures are the next prototype. None by itself proves live interoperability.

## Weekly metrics snapshot

This is an event/evidence tracker, not an activity vanity dashboard. Update only when evidence changes.

| Outcome | Current verified count/status |
| --- | --- |
| Independent developer integrations | 0 |
| Independent authenticated read-only MCP calls | 0 |
| Challenge submissions | 0 recorded |
| Useful outside contributions merged | 0 recorded |
| Confirmed partnerships | 0 recorded |
| Independently verified human-work missions | 0 |
| Independently verifiable payments for MEKU missions | 0 |

Related: [challenge](../docs/human-cloud-protocol-challenge.md) · [handoff proposal](../docs/human-work-handoff-proposal.md) · [operations log](../OPERATIONS.md) · [roadmap](../ROADMAP.md)
