# Coordination of blockers B4 to B7 with MEKU engineering

The pilot does not need B4, B5, B6 or B7 to be resolved: it relays the task by hand, and every report says so. This page records who owns each item, what is open in the MEKU web app repository `mekusimeku/screenshot-magic-5054`, and the change MEKU would need later, so that nobody duplicates or collides with work already under way.

This work made **no change** in `screenshot-magic-5054`. Its `main` (commit `f36d318`, and again at `28134eb`, which changes only the homepage) and its open pull requests were read on 2026-11-28. The work stayed away from anything about MEKU POCKET and from payment code.

| # | What is missing | Who decides or owns it | Open work on the same files | Needed for POW-001? |
| --- | --- | --- | --- | --- |
| B4 | `meku_get_request_status` returns request states only, never results | MEKU engineering, owner of `src/lib/mcp-server.ts` | Draft PR #320 (`codex/one-network-held-proof-20261122`) changes `src/lib/mcp-server.ts` | No |
| B5 | An unpaid task cannot reach a person inside MEKU, because a mission reaches a person only after a confirmed payment | Founder decision on the payment gate | Payment-adjacent drafts #350 and #351 (settlement and revocation) | No |
| B6 | The AI access page says that "checked results return to the AI", which the MCP tools do not do yet | Owner of the site text and its translations | Drafts #186 (16 languages), #319 and #334 change `src/lib/i18n/messages/en.ts` | No |
| B7 | The database does not yet refuse a SEEK reviewer approving their own request; only the app does | Founder decision on staged SQL | None. The guard and its approval page are already on `main` | No. With it, R04 would be enforced instead of attested |

## B4: results through MCP

Today an agent learns that its request was `approved`, never what the person did. The schema already has a `seek_results` table, but no MCP tool reads it. A later change would let a key read checked results for its own requests only, after the independent review, and with the person's consent to share them. It belongs to whoever lands draft PR #320, either inside that PR or stacked on it after it merges, because #320 already changes `src/lib/mcp-server.ts`. Until then the ledger carries the result, as `result_returned` (seq 9).

## B5: unpaid tasks inside MEKU

Not proposed here. Any change touches the payment gate, which the founder has said stays closed until security checks pass and the founder authorizes activation. The pilot works around it by hand and every report says so. It needs no payment, no token and no wallet.

## B6: one sentence on the AI access page

The sentence is the translation key `rs.heroBody`, shown by `src/components/meku/RealityShowcase.tsx` on `meku.farm/ai-access` and by `src/routes/app-reality.tsx`. Each of the 16 locale files has its own copy. The English text today is:

> A network where AI agents request real-world work, people choose whether to help, and checked results return to the AI.

A proposed replacement, for the owner to check against what the product does when the change is made:

> A network where AI agents request real-world work, people choose whether to help, and a person checks every result.

Three open drafts already change `en.ts`, so the owner of the 16-language draft #186 should fold the new text and its translations into that work, after the founder approves the wording. Changing it from here would collide with them.

## B7: database guard for independent review

The guard is staged as `staged-sql/seek-review/0001_independent_review_guard.proposed.sql`, with a rollback file and an approval page, `docs/seek-review-guard-owner-approval.md`. All three are on `main` of `screenshot-magic-5054`, and no agent applies it. That page covers staging first, then production after a separate go-ahead, with checks before and after. Applying it to MEKU STAGING 2 is founder hold D. For POW-001, the [founder setup](founder-setup.md#2-second-reviewer-account) keeps the separation through the app alone, and the verifier reports it as attested (check R04).

## Checkpoint note for issue #288

This session could not comment in `screenshot-magic-5054`. The founder can paste this into issue #288, or allow an agent to post it there:

```text
POW-001 (first independent proof-of-work pilot): ready for review in mekusimeku/meku-si PR #43 (draft). Unpaid and operator-relayed. No change in this repository. The pilot needs none of the following; they are recorded so that nobody duplicates or collides with open work:
- B4 results through MCP: belongs with the owner of src/lib/mcp-server.ts (draft #320 changes it). Not started.
- B5 unpaid in-product delivery: founder decision on the payment gate. Not proposed.
- B6 rs.heroBody wording on /ai-access ("checked results return to the AI"): proposed text in meku-si docs/proof-of-work/coordination.md, to fold into the 16-language work in draft #186 after founder approval.
- B7 SEEK self-review database guard: staged on main, awaiting founder decision (hold D for staging). The pilot keeps the separation through the app and reports it as attested.
```
