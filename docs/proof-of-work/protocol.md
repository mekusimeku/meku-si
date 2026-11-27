# MEKU proof-of-work pilot POW-001 (protocol `meku.pow/1`)

**Status, 2026-11-28: ready for review. No pilot has run.** Nothing in this folder is evidence that a work cycle happened. "Proof of work" here means evidence that a person did the work an AI agent asked for. It has nothing to do with cryptocurrency mining, tokens or rewards.

## Goal

Run one complete work cycle that anyone can check afterwards from public data alone:

1. An independent developer's AI agent asks MEKU for a small physical task through MEKU's public MCP server.
2. MEKU reviews the request.
3. A consenting adult does the task.
4. The evidence and the result go back to the developer.
5. Anyone can re-check every step offline with the tools in [`tools/pow/`](../../tools/pow/README.md).

The pilot is unpaid. No token, wallet or payment is involved at any point, and none is promised.

## What runs where (honest status)

| Step | Where it happens | Status on 2026-11-28 |
| --- | --- | --- |
| Discovery (`initialize`, `tools/list`) | MEKU's live MCP server, `https://meku.farm/api/public/mcp` | Live. Outside clients observed it on 2026-11-14 and 2026-11-21 ([issue #31](https://github.com/mekusimeku/meku-si/issues/31)). |
| Pilot key | Issued by a MEKU operator | Live feature. Request-capable keys have no expiry, so the operator revokes the key when the pilot closes. |
| Request (`meku_request_human`) | MEKU's live MCP server | Live in the deployed site (build of 2026-11-27 09:30 UTC). No independent authenticated use has been published yet; this pilot would be the first. |
| Review | MEKU's request review screen | Live. MEKU does not let the account that issued a key approve that key's requests, so a **second MEKU reviewer** is required. |
| Status (`meku_get_request_status`) | MEKU's live MCP server | Live. It reports request states only: `submitted`, `under_review`, `approved`, `rejected`, `cancelled`. |
| Offer, consent, evidence, result | A public GitHub issue (the **ledger**), relayed by the MEKU operator | **Manual relay.** MEKU cannot deliver an unpaid task to a person inside its product today: a mission reaches a person only after a confirmed payment, and live payments are off. The status tool returns no results. Every report must therefore say **operator-relayed**. |
| Verification | Anyone, offline | Tools ready and tested offline on synthetic data, including planted faults that the verifier must catch. A second, independent Python implementation reproduces the ledger digest. |

## Roles

| Role | Who | Rules |
| --- | --- | --- |
| Developer (D) | An outside developer and their own AI agent or MCP client | Not MEKU staff, contractor or AI worker; not paid by MEKU; no financial interest in MEKU; generates the code; a person approves the exact request before it is sent. |
| Operator (O) | MEKU's official GitHub account `mekusimeku` | Opens and closes the ledger, records the review, relays the task and returns the result. Issues and later revokes the pilot key. |
| Reviewer | A second MEKU account (SEEK reviewer or second admin) | Approves or rejects the request in MEKU. Never the account that issued the key. |
| Human (H) | A consenting adult, 18 or older | Not MEKU staff or a MEKU AI worker, not the developer. Posts consent and evidence from their own GitHub account (a pseudonymous account is fine). Not paid. May stop at any time. |
| Verifier (V) | Anyone else | Re-runs the tools, looks at the photo and may post an `independent_verification` comment. |

The developer, operator and human must be three different GitHub accounts. The verifier checks this.

## The task: fresh-code photo

- **Code.** The developer's client generates an 8-character code at request time: 40 random bits from the alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, which has no I, L, O or U, so handwriting is hard to misread. Nobody can know the code before the request exists.
- **Object.** After the human's consent is in the ledger, the developer names one object chosen at random from: spoon, cup, plate, bowl, sock, towel, pen, shoe. Nobody can know it before consent.
- **What the human does.** Writes the code by hand on paper, places the named object beside the paper, takes one photo showing only the paper and the object on a plain surface, and posts a screenshot of that photo in the ledger. A screenshot normally carries no location data; the verifier checks the file anyway.
- **Why this task.** It takes under five minutes where the person already is. Nothing needs to be bought or carried, and nobody travels. It reveals no personal data. It cannot be prepared in advance, and anyone can check the result by looking.
- **Never asked.** No people, faces, hands with identifying marks, screens, documents, addresses, licence plates or views out of a window. No travel, purchase, private property, money, accounts, or anything unsafe or illegal. The request text is fixed by the protocol; any change makes the verifier fail.

If handwriting is hard for the person, they may form the code from physical items such as cut paper. It must be physical, not shown on a screen.

## The cycle

Each step is one GitHub comment in the ledger holding one JSON record. The full formats are in [records.md](records.md).

| seq | Record | Posted by | What happens |
| --- | --- | --- | --- |
| 0 | `pilot_opened` | Operator | Opens the ledger and names the developer's and operator's GitHub accounts. |
| 1 | `developer_ready` | Developer | Connects with the pilot key and shows that `meku_request_human` is listed. Affirms independence. |
| 2 | `request_submitted` | Developer | The agent calls `meku_request_human` with the exact protocol request that contains the fresh code. The record holds the arguments, MEKU's answer and a hash commitment to the request id, never the id itself. |
| 3 | `request_reviewed` | Operator | The second reviewer approves or rejects the request in MEKU. The record names the request by its code. |
| 4 | `request_status_observed` | Developer | The agent reads `approved` through `meku_get_request_status` and records exactly what MEKU stored. |
| 5 | `task_offered` | Operator | Names the human's GitHub account. The human reads the exact stored request text in seq 4. |
| 6 | `human_consent` | Human | The four MEKU mission consents (voluntary participation, may reject or stop, responsible for own safety, safety checklist), plus adult, unpaid, publication and independence statements. |
| 7 | `object_revealed` | Developer | Names the object, only after seq 6 exists. |
| 8 | `evidence_submitted` | Human | The screenshot is attached to this comment. |
| 9 | `result_returned` | Operator | Returns the result to the developer: the attachment link and MEKU's own visual check, for the same code. |
| 10 | `requester_decision` | Developer | ACCEPTED or REJECTED, with the evidence file's SHA-256 and a digest that commits to records 0 to 9 exactly as they were. |
| 11 | `pilot_closed` | Operator | Pilot key revoked; outcome recorded. |

**Stopping.** The human, the developer or the operator may post a `stop` record at any time; after a stop only `pilot_closed` may follow. A stop is a legitimate outcome, never a penalty. If a participant stays silent for 48 hours at their step, the operator posts a stop with the reason "timeout".

**Time limits.** The evidence must arrive within 48 hours of the object being named, and the developer's decision within 168 hours (7 days) of the request record.

**No edits.** Record comments are never edited. A mistake is handled with a stop record and, if wanted, a new pilot with a new code.

## Pass and fail

The cycle is **verified** only when both are true:

1. `node tools/pow/verify.mjs <bundle.json>` prints `VERDICT: PASS`. That requires every one of its 32 automated checks to pass. A `WARN` is reported for review but does not fail the cycle.
2. At least one verifier who is not the developer, the operator or the human has looked at the photo, confirmed the four manual checks below, and posted an `independent_verification` comment with the same ledger digest.

Manual checks: **M01** the code is written by hand and legible; **M02** the named object is next to the paper; **M03** no person, face, screen, document, address, window view or other personal data is visible; **M04** it is a real paper-and-object arrangement, not a photo of a screen or a composite.

Any automated `FAIL` means the cycle failed. The other verdicts are `STOPPED`, `REJECTED_BY_REVIEW`, `COMPLETED_REJECTED` (the developer rejected the work) and `INCOMPLETE`. None of them is a failure of safety, and none is a verified cycle. The complete check list, with what each check compares, is in [records.md](records.md#automated-checks).

## What a verified cycle shows, and what it does not

It shows that:

- the developer's agent submitted that exact request to MEKU's live MCP server, and MEKU stored it unaltered (from the developer's own receipts and MEKU's answers);
- MEKU's review approved it, as the developer observed through MCP;
- an account different from the developer's and MEKU's consented after the offer, then posted a photo with a code that did not exist before the request and an object that was named only after the consent;
- MEKU returned that exact file, linked to that request, and the developer accepted it;
- no record was edited, and GitHub's server clocks fix the order of the steps.

It does not show:

- who the human is, or that the human is independent of MEKU, beyond separate accounts and signed statements;
- that the photo was not edited;
- that MEKU can deliver work to people inside its product (this pilot uses a manual relay);
- anything about payments, tokens, safety at scale, or an AI acting on its own (a person approves every write).

## Privacy and safety

- Public data is limited to GitHub logins (pseudonyms are fine), the request text and the photo. No names, emails, phone numbers or locations.
- The MEKU request id is published only as a SHA-256 commitment.
- If the verifier finds GPS or other location data in the evidence, the human deletes the comment, the operator hides it, and the operator posts a stop. The verifier's E04 check exists for this.
- Participants must be 18 or older. The human may refuse or stop at any time without giving a reason.
- The pilot key can only submit and read requests made with it. MEKU's MCP server has no payment tool.

## Readiness: what blocks the first run

Resolved in this change: the public developer docs said request-capable and search-only keys were not server-enforced, and that some request fields were not passed through. Both are now corrected against the live documentation.

| # | Blocker | Owner | Safe now? |
| --- | --- | --- | --- |
| B1 | A second MEKU reviewer account, because the key issuer cannot approve the key's own request | MEKU founder | Yes. It is a non-financial role. |
| B2 | Issue the pilot key (search-only off, Concierge off, 2 per minute, 20 per day) and revoke it at close | MEKU founder | Yes |
| B3 | Recruit an independent developer and a consenting adult human | MEKU founder | Yes |
| B4 | `meku_get_request_status` cannot return results, so the result goes through the ledger | MEKU engineering | Not needed for this pilot |
| B5 | An unpaid task cannot reach a person inside MEKU because missions require a confirmed payment, so the task is relayed | MEKU founder decision | Not needed for this pilot; any change touches the payment gate |
| B6 | The AI access page says "checked results return to the AI", which the MCP tools do not do yet | MEKU website | A wording change |

Operator steps: [operator-runbook.md](operator-runbook.md). Developer steps: [developer-guide.md](developer-guide.md). Human steps: [human-guide.md](human-guide.md). Report: [report-template.md](report-template.md).
