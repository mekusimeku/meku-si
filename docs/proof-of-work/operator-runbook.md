# Operator runbook: MEKU pilot POW-001

For the MEKU operator account `mekusimeku`. Every step works from a phone browser, except three checks that an agent runs for you: the screenshot dry run, the check before seq 9 and the final verification. First do the [founder setup](founder-setup.md): phone test, second reviewer account, developer invitation and pilot key. Each record is a block to copy, with a few values in CAPITALS to replace, and no hashing. Post each block as a **new comment** in the ledger and **never edit it afterwards**. Read the [protocol](protocol.md) first.

## Before opening (all non-financial)

1. **Developer.** Choose an independent developer who confirms the four statements in the [developer guide](developer-guide.md#0-check-that-you-are-eligible). MEKU staff, contractors and MEKU's own AI workers cannot take this role.
2. **Second reviewer.** Pick a MEKU account other than the one that will issue the key: a SEEK reviewer or a second admin. MEKU refuses a review by the account that issued the key, because requests made with a key belong to that account. To add one, see the [founder setup](founder-setup.md#2-second-reviewer-account).
3. **Human.** Find a consenting adult who is not MEKU staff, not one of MEKU's AI workers and not the developer, and who has a GitHub account (a new pseudonymous one is fine). Send them the [human guide](human-guide.md). Never offer payment.
4. **Pilot key.** Open `meku.farm/admin/agent-keys`. Under **CREATE AGENT KEY**, enter the agent name `POW-001 DEVELOPER_LOGIN`, 5 per minute and 30 per day (the form suggests 20 per day: change it). MEKU counts every call that carries the key, and an MCP host spends 3 calls just to connect. Leave **SEARCH ONLY · EXPIRES IN 30 DAYS · NO REQUEST SUBMISSIONS** and **ENABLE CONCIERGE PROPOSALS FOR THIS KEY** unticked, then press **GENERATE KEY**. The key is shown once: send it to the developer privately, never through GitHub. Request-capable keys never expire, so set yourself a reminder to revoke it. Watching and revoking it: [founder setup](founder-setup.md#3-pilot-key-issue-limit-watch-revoke).

5. **Dry run of the human's screenshot.** Phones and apps differ in what they add to an image, so test the human's exact way of posting before the pilot. Create an issue in `mekusimeku/meku-si` titled **POW-001 dry run: test screenshot** and send the human its link. Send them the [image cleaner](image-cleaner.md) too. They clean a screenshot of a photo of a blank sheet of paper with it, then post, in one comment, the evidence block from step 4 of the [human guide](human-guide.md#before-you-start-a-dry-run-of-your-screenshot) with the clean PNG attached from Files, as they will later in the ledger. Anything posted there is public at once, which is why the human posts only a clean screenshot of a blank page. This is a participant dry run: the human does it alone. You may explain each step, but never take, clean or post the picture for them ([dry runs](dry-runs.md)). Then copy the link of their comment (press and hold its time), and ask any agent working for you whose network can download GitHub attachments to run this command, which needs no key:

   ```sh
   node tools/pow/record.mjs check-image https://github.com/mekusimeku/meku-si/issues/N#issuecomment-...
   ```

   It must end with `PASS`. A `WARN` about a screenshot note or a time chunk is fine. Run `node tools/pow/record.mjs check-comment` on the same link too: it must say `PASS`, which shows that the block and the image were posted in a form the verifier counts. A download error is no result, not a pass: the command names the host and the step that failed. Run it where downloads work, or run the workflow **Check a posted POW picture** from the GitHub app once it is on `main`. Another way: open the comment in a browser and save the picture. Check that its SHA-256 starts with the 8 characters in the picture's name, which GitHub keeps as its alt text (`pow-clean-xxxxxxxx`), then run `check-image` on the saved file. If it ends with `FAIL`, do not open the ledger. Ask the human to clean the screenshot again and attach the clean file with **Choose File**, never from Photos, then run the check again. If no way passes, post the findings in the dry-run issue and do not run the pilot with that phone. Also open the dry-run issue in a private browser tab, signed out: the human's comment must be visible there, because GitHub sometimes hides comments from brand-new accounts. Close the dry-run issue when done. It is not part of the ledger.

Nothing in this pilot creates a mission, starts a payment, uses a wallet, or touches MEKU POCKET.

## seq 0: open the ledger

Create a new issue in `mekusimeku/meku-si` titled **POW-001 ledger: independent proof-of-work pilot**. Put a short plain explanation and a link to the protocol in the issue text; the issue text is not a record. Then post this as the **first comment**, replacing `DEVELOPER_LOGIN` with the developer's GitHub login (no @) and `COMMIT` with the 40-character id of the commit you approved. PR #43's description gives the exact link to paste. The pinned link tells every verifier which version of the protocol and tools the pilot runs under; without it the verifier warns. If the first comment went out with a mistake, do not post it again, because a second, different opening fails the pilot: before anyone else posts, open a new ledger issue instead.

```json
{
  "pow": "meku.pow/1",
  "pilot_id": "POW-001",
  "seq": 0,
  "type": "pilot_opened",
  "role": "operator",
  "protocol": "https://github.com/mekusimeku/meku-si/blob/COMMIT/docs/proof-of-work/protocol.md",
  "mcp_endpoint": "https://meku.farm/api/public/mcp",
  "variant": "operator-relayed",
  "roster": {
    "operator": "mekusimeku",
    "developer": "DEVELOPER_LOGIN"
  },
  "task": {
    "kind": "fresh-code-photo",
    "code_alphabet": "0123456789ABCDEFGHJKMNPQRSTVWXYZ",
    "code_length": 8,
    "objects": ["SPOON", "CUP", "PLATE", "BOWL", "SOCK", "TOWEL", "PEN", "SHOE"],
    "evidence_hours_after_reveal": 48,
    "cycle_hours": 168
  },
  "payment": "none"
}
```

Send the developer the ledger link. The developer posts seq 1 and seq 2.

## seq 3: record the review

The **second reviewer** signs in, opens `meku.farm/seek`, and finds **POW-001: handwritten code photo (unpaid pilot)** in the **SEEK REVIEW QUEUE**. If MEKU says "You made this request; a different reviewer must review it", you are signed in as the account that issued the key: switch to the second account. Before deciding, check three things:

- the code in the request text equals `code` in the developer's seq 2 record;
- the text is exactly the protocol text, with nothing asked for beyond it;
- no other request shows the same code. If one does, reject both and post a stop.

Press **APPROVE** or **REJECT**. Then post this, replacing `CODE` with the 8-character code. Change `approved` to `rejected` if you rejected it, and `seek_reviewer` to `admin` if the reviewer is an admin. Set `reviewer_same_person_as_key_issuer` to `true` if the same person holds the reviewer's account and the account that issued the key: the review was then separate only by account, and every report says so:

```json
{
  "pow": "meku.pow/1",
  "pilot_id": "POW-001",
  "seq": 3,
  "type": "request_reviewed",
  "role": "operator",
  "code": "CODE",
  "decision": "approved",
  "reviewer_role": "seek_reviewer",
  "reviewer_is_key_issuer": false,
  "reviewer_same_person_as_key_issuer": false
}
```

After a rejection, close the pilot with seq 4 (see [Closing](#seq-11-close)).

## seq 5: offer the task to the human

Wait for the developer's seq 4, which shows MEKU's stored request as `approved`. First ask the human, privately, whether their GitHub username may be named in the ledger. Then send them the ledger link and point them to seq 4, which holds the exact stored request text. Post this, replacing `CODE` and `HUMAN_LOGIN`. Use `false` instead of `true` if the human has no MEKU human profile. `channel` is how you contacted them: `github`, `email`, `in_person`, `phone`, `message` or `other`:

```json
{
  "pow": "meku.pow/1",
  "pilot_id": "POW-001",
  "seq": 5,
  "type": "task_offered",
  "role": "operator",
  "code": "CODE",
  "human": "HUMAN_LOGIN",
  "human_is_registered_meku_human": true,
  "task_shown": "ledger-seq-4",
  "channel": "message",
  "payment": "none"
}
```

The human posts consent (seq 6). The developer then names the object (seq 7), and the human posts the screenshot (seq 8).

## seq 9: return the result

First make sure the evidence file carries no metadata. Ask the developer, or any agent working for you, to run `node tools/pow/verify.mjs --from-issue <ledger-url>` and report check **E04**, check **H05**, and every comment printed under "not counted records, in full" and `READ FIRST`. The command needs no key. If H05 failed, or anything the human wrote might mean they want to stop, treat it as a stop: post a stop and close.

Then open the screenshot whose address check **E01** prints, and look at it: that is the one the verifier counts, and the one your checks are about. `record.mjs returned` names it again. If the human posted a second, different screenshot, L04 fails and no record can be built on the ledger: post a stop instead.

- **E04 failed, or anything personal is visible** (a face, a person, a document, an address, a screen, a view out of a window): hide the comment (**···** → **Hide**) and ask GitHub Support to remove the uploaded file. Deleting the comment does not delete the file. Then post a stop. Do not continue. Hiding may change the comment's edit time, which the verifier counts as an edit (L05, see [dry runs](dry-runs.md)). Protecting the person comes first, even though the pilot then ends in FAIL rather than STOPPED. Never hide a ledger comment for any other reason.
- **Otherwise:** post this, replacing `CODE`. Set each check to `true` or `false` as you see it:

```json
{
  "pow": "meku.pow/1",
  "pilot_id": "POW-001",
  "seq": 9,
  "type": "result_returned",
  "role": "operator",
  "code": "CODE",
  "evidence": "ledger-seq-8",
  "meku_check": {
    "code_visible": true,
    "object_visible": true,
    "no_personal_data_visible": true
  }
}
```

This is MEKU returning the result to the developer. The developer checks it and posts the decision (seq 10).

## seq 11: close

**First revoke the pilot key**: on `meku.farm/admin/agent-keys`, press **REVOKE** on the POW-001 key. Then post the close. After the developer's decision it is seq 11 with outcome `completed`. After a stop at seq *n*, it is seq *n*+1 with outcome `stopped`. After a rejected review, it is seq 4 with outcome `rejected_by_review`.

```json
{
  "pow": "meku.pow/1",
  "pilot_id": "POW-001",
  "seq": 11,
  "type": "pilot_closed",
  "role": "operator",
  "key_revoked": true,
  "outcome": "completed"
}
```

## Stopping and timeouts

Anyone may stop. A stop counts whatever seq you type, but the close after it must follow it: if you are unsure of the numbers, ask an agent to print both blocks from an export, with `node tools/pow/record.mjs stop --bundle <bundle.json> --role operator --reason "..."` and later `closed --bundle <bundle.json> --outcome stopped --key-revoked`. If the human writes STOP (or 🛑, or the same word in another language), writes anything else that might mean they want to stop, or tells you so, if a participant has not acted for 48 hours at their step, or if something is wrong, post this with `NEXT` replaced by the next seq number and a short reason. Then close. A stop may also follow the developer's decision. After the close, if the human withdraws consent later, post one more stop; nothing follows it. When in doubt, stop: a stop is a valid outcome, while consent that may have been withdrawn can never be verified.

```json
{
  "pow": "meku.pow/1",
  "pilot_id": "POW-001",
  "seq": NEXT,
  "type": "stop",
  "role": "operator",
  "reason": "The human asked to stop"
}
```

## After closing

Anyone, including an agent working for you, can export and check the ledger. Never share the pilot key with them; the command needs none:

```sh
node tools/pow/verify.mjs --from-issue https://github.com/mekusimeku/meku-si/issues/N --out pow-ledger --json pow-ledger/verification.json \
  --previous pow-ledger-6/bundle.json --previous pow-ledger-8/bundle.json
```

The `--previous` exports are the developer's, made during the pilot. They show whether any participant comment disappeared or changed afterwards.

Publish the [report](report-template.md) as a pull request that adds `pilots/POW-001/` with the bundle, the evidence file, `verification.json` and the report. The committed bundle is a snapshot for convenience, not the evidence: verifiers start from the live issue. Ask someone outside MEKU, the developer and the human to verify it independently.

## Never

- Edit or delete any comment, or post a record in someone else's role. GitHub's API does not return deleted comments, so a deletion silently removes evidence.
- Post a different version of a record you already posted in its turn: that fails the pilot. If only its seq was wrong, post exactly the same text again with the right number. A record posted before its turn says nothing; post it again when its turn comes.
- Use the developer's key, or let the account that issued the key approve the request.
- Offer or imply payment, tokens or rewards, or create a mission.
- Choose a human who works for MEKU, or ask for anything beyond the protocol task.
