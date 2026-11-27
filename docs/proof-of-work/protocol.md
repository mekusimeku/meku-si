# MEKU proof-of-work pilot POW-001 (protocol `meku.pow/1`)

**Status, 2026-11-28: ready for review. No pilot has run.** Nothing in this folder is evidence that a work cycle happened. "Proof of work" here means evidence that a person did the work an AI agent asked for. It has nothing to do with cryptocurrency mining, tokens or rewards.

## Goal

Run one complete work cycle that anyone can check afterwards from public data alone:

1. An independent developer's AI agent asks MEKU for a small physical task through MEKU's public MCP server.
2. MEKU reviews the request.
3. A consenting adult does the task.
4. The evidence and the result go back to the developer.
5. Anyone can re-check every step with the tools in [`tools/pow/`](../../tools/pow/README.md), starting from the live GitHub issue.

The pilot is unpaid. No token, wallet or payment is involved at any point, and none is promised.

## What runs where (honest status)

| Step | Where it happens | Status on 2026-11-28 |
| --- | --- | --- |
| Discovery (`initialize`, `tools/list`) | MEKU's live MCP server, `https://meku.farm/api/public/mcp` | Live. Confirmed by a live outside-client check on 2026-11-14 and by an independent tester's MCP Inspector run on 2026-11-21 ([issue #31](https://github.com/mekusimeku/meku-si/issues/31)). |
| Pilot key | Issued by a MEKU operator | Live feature. Request-capable keys have no expiry, so the operator revokes the key when the pilot closes. MEKU counts every call that carries the key, initialization included. |
| Request (`meku_request_human`) | MEKU's live MCP server | Live in the deployed site (build of 2026-11-27 09:30 UTC). No independent authenticated use has been published yet; this pilot would be the first. |
| Review | MEKU's SEEK review queue (`meku.farm/seek`) | Live. Requests made with an agent key belong to the account that issued the key, and the review screen refuses a review by that account ("a different reviewer must review it"). MEKU's database does not enforce this yet, so a **second MEKU reviewer** is required and the separation is attested, not proven. |
| Status (`meku_get_request_status`) | MEKU's live MCP server | Live. It reports request states only: `submitted`, `under_review`, `approved`, `rejected`, `cancelled`. |
| Offer, consent, evidence, result | A public GitHub issue (the **ledger**), relayed by the MEKU operator | **Manual relay.** MEKU cannot deliver an unpaid task to a person inside its product today: a mission reaches a person only after a confirmed payment, and live payments are off. The status tool returns no results. Every report must therefore say **operator-relayed**. |
| Verification | Anyone | Tools ready and tested offline on synthetic data, including planted faults the verifier must catch. A second, independent Python implementation reproduces the ledger digest, and an independent JSON Schema validator accepts the records. |

## Manual pilot, not automated network operation

POW-001 is a **manually coordinated pilot**. People do by hand, in a public GitHub issue, several steps that an automated MEKU network would do inside its product. A verified POW-001 shows that one request from an independent agent was fulfilled by a consenting person, with every step public and checkable. It does not show that MEKU's network delivers, checks or returns work automatically.

| Step | In POW-001 | In a fully automated network operation | In MEKU today |
| --- | --- | --- | --- |
| Agent connects | The developer's agent, over MCP, with a key a MEKU admin issued by hand | The same, with keys issued through an access plan | MCP live; request-capable keys are issued by an admin |
| Agent submits the request | Over MCP, after a person types the request's code back | Over MCP, within the key's limits | Live |
| Request is reviewed | A second MEKU account taps **APPROVE** | The same: review stays human by design | Live; self-review refused by the app, not yet by the database (B7) |
| A person is found and offered the task | The operator recruits a volunteer and names them in the ledger | MEKU offers the task to people in its product | Only after a confirmed payment, and payments are off (B5) |
| Consent, instructions, evidence | GitHub comments in the ledger | Inside the mission in MEKU | Part of MEKU's paid-mission flow, behind the same payment gate |
| Result returns to the agent | The operator posts `result_returned` in the ledger | The agent reads the checked result over MCP | Not built: the status tool returns request states only (B4) |
| Agent decides | The developer runs the tools and posts the decision | The agent accepts or rejects over MCP | Not built |
| Verification | Anyone, offline, from the public ledger | The same, plus records MEKU signs | Tools ready; MEKU's answers are not signed |
| Payment | None | Paid missions | Off until the founder authorizes it |

Reports, posts and replies about POW-001 must call it a manually coordinated (operator-relayed) pilot, never an automated or autonomous network operation.

## Roles

| Role | Who | Rules |
| --- | --- | --- |
| Developer (D) | An outside developer and their own AI agent or MCP client | Not MEKU staff, contractor or AI worker; not paid by MEKU; no financial interest in MEKU. This is self-declared, and others can check it against the developer's public history. A person approves the exact request before it is sent. |
| Operator (O) | MEKU's official GitHub account `mekusimeku` | Opens and closes the ledger, records the review, relays the task and returns the result. Issues and later revokes the pilot key. |
| Reviewer | A second MEKU account (SEEK reviewer or second admin) | Approves or rejects the request in MEKU. Never the account that issued the key. Ideally held by another person; the operator's record states whether it is (`reviewer_same_person_as_key_issuer`), and the verifier warns when it is not. |
| Human (H) | A consenting adult, 18 or older | Not MEKU staff or a MEKU AI worker, not the developer. Posts consent and evidence from their own GitHub account (a pseudonymous account is fine). Not paid. May stop at any time. |
| Verifier (V) | Anyone else | Exports the ledger themselves, re-runs the tools, looks at the photo and may post an `independent_verification` comment. |

The developer, operator and human must be three different GitHub accounts. The verifier checks this.

## The task: fresh-code photo

- **Code.** When the developer prepares the request, their client generates an 8-character code: 40 random bits from the alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`. The alphabet has no I, L, O or U, so handwriting is hard to misread. The code is in the request MEKU stores, so the photo cannot be older than the code.
- **Object and suffix.** After the human's consent is in the ledger, the developer reveals one object from: spoon, cup, plate, bowl, sock, towel, pen, shoe, and 2 more characters from the same alphabet, to write right after the code. Nobody chooses them. They follow from a secret the developer committed to in the request record and from GitHub's id for the consent comment ([details](records.md#hashes-and-commitments)), and anyone can recompute them. Neither the developer nor the human, acting alone, can know them before the consent comment exists.
- **What the human does.** Writes the code and the 2 characters by hand on paper, places the named object beside it, and takes one photo showing only the paper and the object on a plain surface. Then they take a screenshot of that photo and post it in the ledger. A screenshot normally carries no location data; the verifier checks the file anyway, and a dry run checks the human's phone first.
- **Why this task.** It takes under five minutes where the person already is. Nothing needs to be bought or carried, and nobody travels. It is designed to reveal no personal data. Neither the developer nor the human can prepare it alone before consent, and anyone can check the result by looking.
- **Never asked.** No people, faces, hands with identifying marks, screens, documents, addresses, licence plates or views out of a window. No travel, purchase, private property, money, accounts, or anything unsafe or illegal. The request text is fixed by the protocol; any change makes the verifier fail.

If handwriting is hard for the person, they may form the code from physical items such as cut paper. It must be physical, not shown on a screen.

## The cycle

Each step is one GitHub comment in the ledger holding one JSON record. The full formats are in [records.md](records.md).

| seq | Record | Posted by | What happens |
| --- | --- | --- | --- |
| 0 | `pilot_opened` | Operator | Opens the ledger and names the developer's and operator's GitHub accounts. |
| 1 | `developer_ready` | Developer | Connects with the pilot key and shows that `meku_request_human` is listed. Affirms independence. |
| 2 | `request_submitted` | Developer | The agent calls `meku_request_human` with the exact protocol request that contains the code. The record holds the arguments, MEKU's answer, a hash commitment to the request id (never the id itself) and the commitment to the object secret. |
| 3 | `request_reviewed` | Operator | The second reviewer approves or rejects the request in MEKU. The record names the request by its code. |
| 4 | `request_status_observed` | Developer | The agent reads `approved` through `meku_get_request_status` and records exactly what MEKU stored. |
| 5 | `task_offered` | Operator | Names the human's GitHub account, with their agreement. The human reads the exact stored request text in seq 4. |
| 6 | `human_consent` | Human | The four MEKU mission consents (voluntary participation, may reject or stop, responsible for own safety, safety checklist), plus adult, unpaid, publication and independence statements. |
| 7 | `object_revealed` | Developer | Reveals the secret, the consent comment id and the object that follows from them. |
| 8 | `evidence_submitted` | Human | The screenshot is attached to this comment. |
| 9 | `result_returned` | Operator | Returns the result to the developer: MEKU's own visual check of the evidence for the same code, after the metadata check has passed. |
| 10 | `requester_decision` | Developer | ACCEPTED or REJECTED, with the evidence file's SHA-256 and a digest that commits to records 0 to 9 exactly as they were. |
| 11 | `pilot_closed` | Operator | Pilot key revoked; outcome recorded. |

**Stopping.** The human may stop at any time with a comment that says only `STOP`, or only 🛑. So do 33 other words, in about 16 languages ([the list](records.md#automated-checks), check H05). That alone blocks a PASS until a `stop` record is posted. The verifier also prints every other comment the human writes, in full, and a person must read it (M05): words that withdraw consent in any other way, in any language, also mean the cycle is not verified. The developer, the operator or the human posts the `stop` record, at any step, also after the developer's decision. Then only `pilot_closed` may follow. After the close, one more `stop` may follow when the human withdraws consent later, and the cycle then ends as `STOPPED`, never `PASS`. A stop is a legitimate outcome, never a penalty. If a participant stays silent for 48 hours at their step, the operator posts a stop with the reason "timeout".

**Time limits.** The evidence must arrive within 48 hours of the object being revealed, and the developer's decision within 168 hours (7 days) of the request record.

**No edits, no deletions, no renames.** No comment is ever edited or deleted. An edited record fails L05. An edited comment by the human might have said STOP first, so it needs a stop record (H05). Participants do not rename their GitHub accounts until the report is published. A posting mistake, such as text around a record, is not counted: post the record again, alone. Each record is posted once: a second record of the same kind that says anything else, apart from its seq, fails the pilot (L04), so a negative check, a rejection or a checked screenshot can never be replaced. Stops are the exception. Anything else is handled with a stop record and, if wanted, a new pilot with a new code.

## Pass and fail

The cycle is **verified** only when all three are true:

1. The verifier exported the ledger from the live issue themselves: `node tools/pow/verify.mjs --from-issue <ledger-url>`. A bundle file from someone else proves nothing; anyone can write one.
2. That run prints `VERDICT: PASS`, which requires every one of its 33 automated checks to pass. A `WARN` is reported for review but does not fail the cycle.
3. At least one verifier who is not the developer, the operator or the human has looked at the photo, read every participant comment the verifier did not count, and confirmed the six manual checks below. They post an `independent_verification` comment with the same ledger digest.

The manual checks:

- **M01** The code, followed by the 2 revealed characters, is written by hand and legible.
- **M02** The named object is next to the paper.
- **M03** No person, face, screen, document, address, window view or other personal data is visible, in the photo or in any other image a participant posted.
- **M04** It is a real paper-and-object arrangement, not a photo of a screen or a composite.
- **M05** Nothing the human wrote in the ledger asks to stop or withdraws consent, in any language. The verifier prints every comment of theirs that is not a counted record, in full.
- **M06** No other participant comment that the verifier did not count contradicts the counted records. The verifier prints those in full too.

Any automated `FAIL` means the cycle failed. The other verdicts are `STOPPED`, `REJECTED_BY_REVIEW`, `COMPLETED_REJECTED` (the developer rejected the work) and `INCOMPLETE`. None of them is a failure of safety, and none is a verified cycle. The complete check list is in [records.md](records.md#automated-checks).

## What a verified cycle shows, and what it does not

It shows that:

- the developer's records, made with their own tools, show a request in exactly the protocol text submitted with a request-capable MEKU key, stored by MEKU unaltered and later reported as `approved`;
- an account different from the developer's and MEKU's consented after it was offered the task, and only then posted a photo. The photo shows the request's code with 2 characters and an object that neither the developer nor the human, acting alone, could know before that consent comment existed;
- MEKU's operator returned that evidence for the same code, the developer accepted it, and MEKU's own check agreed;
- GitHub's server clocks fix the order of the steps, no record comment was edited, and a person read everything else the human wrote and found no withdrawal of consent.

It does not show:

- that MEKU's answers were as the developer reports them. They are not signed; they rest on the developer's records and private receipts;
- that the calls went through MCP rather than MEKU's REST agent API, which accepts the same key;
- who the human is, or that the human, the developer and the reviewer are independent of MEKU and of each other, beyond separate accounts and signed statements;
- that the developer and the human did not coordinate. Acting together, they could delete and repost consent comments until one gives a combination photographed earlier, at 1 chance in 8,192 per attempt;
- that the photo was not edited;
- that nothing happened in comments that were deleted. GitHub's API does not return them, and MEKU, as the owner of the repository, could delete a comment, lock the issue or block an account. Exports made during the pilot by others (`--previous`) and GitHub's notification emails to subscribers show such a deletion, but only if someone kept them;
- that MEKU can deliver work to people inside its product (this pilot uses a manual relay);
- anything about payments, tokens, safety at scale, or an AI acting on its own. The developer's tools require a person to type the code back before sending, but cannot prove that a person approved.

## Privacy and safety

- Public data is limited to GitHub logins (pseudonyms are fine), the request text, the photo, and the facts the records state: for the human, that they are an adult, whether they have a MEKU human profile and how the operator contacted them. No names, emails, phone numbers or locations. The operator names the human's login in seq 5 only after the human agrees to that.
- The MEKU request id is published only as a SHA-256 commitment.
- The evidence must contain only pixel and colour data, plus at most a phone screenshot's note of its own size (check E04, an allow-list). Before the pilot, a dry run checks a test screenshot of a blank page, taken and posted the same way on the human's phone. The operator posts the returned result (seq 9) only after someone has run the verifier on the evidence and E04 has passed.
- **If an image reveals something personal:** deleting the comment does not delete the uploaded file, which stays reachable at its URL. The human or the operator asks GitHub Support to remove it, the operator hides the comment, and the operator posts a stop. Treat the image as already public.
- Participants must be 18 or older. The human may refuse or stop at any time without giving a reason.
- The pilot key can only submit and read requests made with it. MEKU's MCP server has no payment tool.

## Readiness: what blocks the first run

Resolved in this change: the public developer docs said request-capable and search-only keys were not server-enforced, and that some request fields were not passed through. Both are now corrected against the live documentation.

| # | Blocker | Owner | Safe now? |
| --- | --- | --- | --- |
| B1 | A second MEKU reviewer account, because the key issuer cannot approve the key's own request | MEKU founder | Yes. It is a non-financial role. |
| B2 | Issue the pilot key (search-only off, Concierge off, 5 per minute, 30 per day: MCP hosts spend 3 calls just to connect) and revoke it at close | MEKU founder | Yes |
| B3 | Recruit an independent developer and a consenting adult human | MEKU founder | Yes |
| B4 | `meku_get_request_status` cannot return results, so the result goes through the ledger | MEKU engineering | Not needed for this pilot |
| B5 | An unpaid task cannot reach a person inside MEKU because missions require a confirmed payment, so the task is relayed | MEKU founder decision | Not needed for this pilot; any change touches the payment gate |
| B6 | The AI access page says "checked results return to the AI", which the MCP tools do not do yet | MEKU website | A wording change |
| B7 | The review screen refuses the key issuer, but MEKU's database does not enforce it yet | MEKU engineering (staged guard awaiting founder approval) | Not needed for this pilot; the separation is attested |

Operator steps: [operator-runbook.md](operator-runbook.md). Developer steps: [developer-guide.md](developer-guide.md). Human steps: [human-guide.md](human-guide.md). Report: [report-template.md](report-template.md).
