# MEKU SI Official Mint Integrity Watch — run instructions

This is the instruction text for the **existing** daily "MEKU SI Official Mint Integrity Watch".
Replace the watch's current check steps with the block below. **Do not create a new watch and do not
change its schedule.** Apply it only after the PR that adds this file is merged: earlier versions of the
checker misread the Moltbook post (a JSON `\n` before the mint) and would report a false FAIL.

## Instruction text (paste into the existing watch)

```text
MEKU SI Official Mint Integrity Watch — read-only.

Official mint (exact, case-sensitive): J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump
Network: Solana Mainnet. Standard: Token-2022.

Absolute limits: read-only HTTP GETs only. No wallet activity, signing, swaps, purchases, payments or
Mainnet transactions. No posts, comments or edits anywhere (including Moltbook and GitHub issues), no
deployments, no Cloudflare or DNS changes, no paid tools or credits. Do not touch MEKU POCKET.
Never edit APPROVED_SHA256 or any repository file.

1. In a fresh, empty directory with internet access and Node.js 22 or newer:
     git clone --depth 1 https://github.com/mekusimeku/meku-si
     cd meku-si
     git rev-parse HEAD
     node tools/mint-integrity-live-check.mjs --json > mint-report.json; echo "exit=$?"
   Record the commit SHA and the exit code.

2. Report all 12 rows from mint-report.json in a table: n, result, HTTP status, final URL,
   content type, reason (and observedSha256 when present). Copy results exactly.
   Also copy the SUMMARY line printed on stderr.

3. Interpret the exit code exactly:
     exit 0 = all 12 PASS (each live body equals its approved snapshot and every check passed).
     exit 1 = at least one FAIL = confirmed problem (wrong or look-alike mint, 404, wrong content type,
              tampered JSON identity, missing or negated required statement, false buyer/subscription
              claim). Alert the founder immediately with the endpoint, reason and evidence.
     exit 2 = no FAIL, but at least one UNKNOWN. UNKNOWN is NOT a pass. Report each reason.

4. For each UNKNOWN, you may try ONE independent read-only method (for example a free Cloudflare URL
   Scanner scan, comparing the live body SHA-256 with APPROVED_SHA256 in tools/mint-integrity-live-check.mjs).
   Report what it showed, but never change UNKNOWN to PASS or FAIL yourself.
   Typical UNKNOWN reasons and what they mean:
     - "content differs from approved snapshot": the page changed. A human must review the new content;
       if it is correct, the pin is updated in a reviewed PR. Until then it stays UNKNOWN.
     - "redirected away from the requested URL", "HTTP 403/429/5xx", "request failed", "bot challenge page":
       could not verify this run; retry next run.

5. Never claim the audit is complete when any row is UNKNOWN. Never describe a verified buyer, live
   subscriptions or paid agent access. End the report with: commit SHA, exit code, PASS/FAIL/UNKNOWN counts.
```

## Notes for maintainers

- PASS requires the live bytes to equal `APPROVED_SHA256[n]` (endpoint 12: `sha256(post.title + "\n" + post.content)`),
  so a change in any wording becomes UNKNOWN until reviewed. Confirmed problems are FAIL before the pin is checked.
- Pins for endpoints 8–11 are enforced against this repository by CI. Pins 1–7 follow
  `mekusimeku/screenshot-magic-5054` `public/`; when those files change, update the pins in a reviewed PR
  after confirming the new live bytes.
- Moltbook (endpoint 12) is read only through its public post API. Editing the post changes its pin.
