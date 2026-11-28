# Report template: MEKU proof-of-work pilot

Copy this file to `pilots/POW-001/README.md` and replace every `[bracketed]` part. Put the exported `bundle.json`, the `evidence/` folder and `verification.json` next to it. Publish only after the checklist at the end is complete. This template is not evidence that a pilot happened. If a step did not happen, write **not performed**; never infer it.

---

# MEKU POW-001: independent proof-of-work pilot, technical report

| | |
| --- | --- |
| **Verdict** | `[PASS / FAIL / STOPPED / REJECTED_BY_REVIEW / COMPLETED_REJECTED / INCOMPLETE]` |
| **Variant** | manually coordinated (operator-relayed): offer, consent, evidence and result travelled through the public ledger by hand, not inside MEKU's product. Not an automated network operation |
| **Payment** | none, in any form |
| **Ledger** | [https://github.com/mekusimeku/meku-si/issues/N] |
| **Ledger digest, all records** | `[sha256 printed by verify.mjs]` |
| **Python reference digest** | `[sha256 printed by digest_reference.py; must be identical. If the verifier listed records it did not count as invalid, run it with --skip and those comment ids, and say so]` |
| **Exported from the live issue by** | [who ran `verify.mjs --from-issue`, and when; a supplied bundle file does not count] |
| **Protocol and tools** | `meku.pow/1`, `tools/pow/` at commit `[commit id named in the pilot_opened protocol link]` |
| **Independent verification** | [links to `independent_verification` comments by accounts outside the roster, or **none yet**] |

## 1. What was tested

An independent developer's AI agent requested one small physical task through MEKU's public MCP server, `https://meku.farm/api/public/mcp`. A second MEKU account reviewed the request. A consenting adult wrote a fresh code and 2 characters by hand, placed an object beside it, and posted a screenshot of the photo. The characters and the object were named only after their consent. MEKU returned the result through the ledger, and the developer accepted or rejected it. Every step is a public GitHub comment, ordered by GitHub's server clock.

## 2. Participants

| Role | GitHub account | Notes |
| --- | --- | --- |
| Developer | [login] | Client: [name version]. Agent: [as recorded in seq 1]. Path: [built-in client / own MCP host] |
| Operator | mekusimeku | MEKU's official account |
| Reviewer | [not public] | Role: [seek_reviewer / admin]; attested not to be the key issuer's account; held by the same person as the key issuer: [yes/no, from `reviewer_same_person_as_key_issuer`] |
| Human | [login] | Registered MEKU human: [yes / no]. Contacted by: [channel] |
| Outside verifier(s) | [login(s)] | Not on the roster |

## 3. Timeline (GitHub server time, UTC)

| seq | Record | Account | Time | Link |
| --- | --- | --- | --- | --- |
| 0 | pilot_opened | mekusimeku | [time] | [comment link] |
| 1 | developer_ready | [login] | [time] | [link] |
| 2 | request_submitted | [login] | [time] | [link] |
| 3 | request_reviewed | mekusimeku | [time] | [link] |
| 4 | request_status_observed | [login] | [time] | [link] |
| 5 | task_offered | mekusimeku | [time] | [link] |
| 6 | human_consent | [login] | [time] | [link] |
| 7 | object_revealed | [login] | [time] | [link] |
| 8 | evidence_submitted | [login] | [time] | [link] |
| 9 | result_returned | mekusimeku | [time] | [link] |
| 10 | requester_decision | [login] | [time] | [link] |
| 11 | pilot_closed | mekusimeku | [time] | [link] |

Elapsed: request to decision [h]; object named to evidence [h].

## 4. The request

- Code: `[CODE]`. Idempotency key: `POW-001.[CODE]`.
- MEKU `created_at`: [time]. Status answered on submission: `submitted`. Deduplicated: [yes / no].
- Stored text identical to the submitted text: [yes / no] (check Q06).
- Request id: published only as commitment `[request_id_sha256]`.

## 5. Consent, task and evidence

- The human consented at [time], after the offer at [time]. The object `[OBJECT]` and the suffix `[SUFFIX]` were named at [time]. Evidence arrived at [time], [h] after the reveal.
- Evidence file: `[evidence/<sha256>.png]`, SHA-256 `[sha256]`, [media type], [width × height], [bytes]. Metadata findings: [none / list].
- Cleaned with the [image cleaner](../../docs/proof-of-work/image-cleaner.md) on the human's phone: [yes, scanner id shown on the page / no]. Participant dry run: [link to the dry-run comment, and its check-image result].

## 6. Result and decision

- MEKU's check (seq 9): code visible [true/false], object visible [true/false], no personal data visible [true/false].
- Developer decision (seq 10): `[ACCEPTED / REJECTED]`, reason "[reason]". Ledger digest through seq 9: `[sha256]`.
- Pilot key revoked: [yes, at time].

## 7. Automated verification

```text
$ node tools/pow/verify.mjs --from-issue [ledger URL] --out pilots/POW-001 --json pilots/POW-001/verification.json
[paste the complete output, unedited]
$ python3 -I tools/pow/digest_reference.py pilots/POW-001/bundle.json
[paste the output]
```

Exit code: [0 / 1 / 2]. Checks: [n] PASS, [n] WARN, [n] FAIL, [n] NOT_REACHED. Explain every WARN here: [ ].

## 8. Manual checks

| Check | [verifier 1] | [verifier 2] |
| --- | --- | --- |
| M01 The code is written by hand and legible, and equals `[CODE][SUFFIX]` | [yes/no] | [yes/no] |
| M02 A `[object]` is next to the paper | [yes/no] | [yes/no] |
| M03 No person, face, screen, document, address, window view or other personal data, in the photo or any other participant image | [yes/no] | [yes/no] |
| M04 A real paper-and-object arrangement, not a screen photo or composite | [yes/no] | [yes/no] |
| M05 Nothing the human wrote asks to stop or withdraws consent, in any language | [yes/no] | [yes/no] |
| M06 No other participant comment that was not counted contradicts the counted records | [yes/no] | [yes/no] |

## 9. Reproduce it yourself

```sh
git clone https://github.com/mekusimeku/meku-si && cd meku-si && git checkout [commit id]
node --test tools/pow/pow.test.mjs tools/pow/pow-docs.test.mjs
node tools/pow/verify.mjs --from-issue [ledger URL] --out /tmp/pow-check
python3 -I tools/pow/digest_reference.py /tmp/pow-check/bundle.json
```

Compare the digest with the one at the top of this report and look at the image yourself. If your result differs, open an issue. Do not rely on the copy of `bundle.json` in this folder: it is a snapshot, and only an export you make yourself from the live issue counts.

## 10. What this shows, and what it does not

It shows that the developer's own records report this exact request, sent with a request-capable MEKU key, stored by MEKU unaltered and approved. An account different from the developer's and MEKU's then consented, and posted a photo showing the request's code with 2 characters and an object that neither the developer nor the human, acting alone, could know before that consent comment existed. MEKU returned that evidence for the same code and its own check agreed, and the developer decided on it. No record comment was edited, a person read everything else the human wrote and found no withdrawal of consent, and GitHub's server clocks fix the order.

It does not show that MEKU's unsigned answers were as reported, or that the calls used MCP rather than MEKU's REST agent API. It does not show who the human is, or that the participants are independent beyond separate accounts and signed statements, or that the developer and the human did not coordinate (together, they could delete and repost consent comments until one gives a combination photographed earlier, at 1 chance in 8,192 per attempt). It does not show that the photo was not edited, or anything about comments that were deleted: MEKU, as the owner of the repository, could delete one, and only exports or notification emails kept during the pilot would show it ([were earlier exports compared? yes/no]). It does not show that MEKU can deliver work inside its own product (this pilot used a manual relay), or anything about payments, tokens, scale, or an AI acting on its own (the tools require a person to type the code back before sending, but cannot prove a person approved).

## 11. Problems found

| Problem | Where | What was done | Still open? |
| --- | --- | --- | --- |
| [observed problem] | [seq / check / tool] | [action or none] | [yes/no] |

## 12. Files

- `bundle.json`: the ledger exactly as GitHub served it on [export time].
- `evidence/[sha256].[ext]`: the evidence file.
- `verification.json`: the verifier result, including every record in order.

---

## Publication checklist

- [ ] The developer and the human have read this report and agree to its publication, including their GitHub logins and the photo.
- [ ] The image shows nothing personal, and the verifier's E04 check passed.
- [ ] No key, request id, email, name, address or private message appears anywhere.
- [ ] Every claim matches the ledger and the verifier output; anything not performed says so.
- [ ] The report says **operator-relayed** and **unpaid**.
- [ ] At least one person outside the roster has verified it independently, or the report says **independent verification: none yet**.
