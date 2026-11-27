# Founder setup for pilot POW-001 (iPhone only)

This page covers what only the MEKU founder can do before the pilot opens: a phone test, a second reviewer account, the developer invitation and the pilot key. Nothing here moves money, creates a mission or touches MEKU POCKET, and nothing here posts in a ledger. The operator steps after that are in the [operator runbook](operator-runbook.md).

Do it in this order:

1. [Phone test](#1-phone-test-about-15-minutes): about 15 minutes, no key and no pilot.
2. [Second reviewer account](#2-second-reviewer-account): one new account and one database row.
3. Send the [developer invitation](developer-invitation.md) and wait for a yes that confirms the four statements.
4. [Pilot key](#3-pilot-key-issue-limit-watch-revoke), only after that yes.
5. Find the human and run their screenshot dry run ([runbook](operator-runbook.md#before-opening-all-non-financial), step 5).
6. Open the ledger ([runbook, seq 0](operator-runbook.md#seq-0-open-the-ledger)), with the protocol link pinned to the version you approved.

Wherever a step says "ask an agent", any agent working for you can run the command, for example a Claude session. These commands need no key and change nothing; they only read public GitHub data.

Screen labels below are copied from the MEKU web app's code (`main` at commit `f36d318`, 2026-11-28). If the site shows a different label, it was deployed from an older or newer version: stop and check before going on.

## 1. Phone test (about 15 minutes)

This checks, before anyone else is involved, that records and screenshots posted from your iPhone are read exactly as posted.

**Before you start:** open **Settings → General → Keyboard** and turn **Smart Punctuation** off. Leave it off until the pilot closes. With it on, the keyboard types curly quotes, which make a record unreadable. If you change any text inside a block, change only the words in CAPITALS and never retype a quote mark.

**Test A: post a record.**

1. In Safari, open the [operator runbook](operator-runbook.md) on GitHub and find the **seq 3** block (`request_reviewed`).
2. Tap the copy button at the top right of the block.
3. Open [PR #43](https://github.com/mekusimeku/meku-si/pull/43), tap the comment box at the bottom, and paste.
4. Replace `CODE` with `TEST2345`. Leave everything else as it is, then tap **Comment**.
5. Press and hold the time shown on your new comment and copy the link. In the GitHub app, use **···** and **Copy link** instead.
6. Ask an agent to run:

   ```sh
   node tools/pow/record.mjs check-comment <your comment link>
   ```

   It must end with `PASS`. If it says `FAIL`, it names the problem, for example curly quotes. Fix that and repeat with a new comment. Never edit a comment.

**Test B: post a screenshot.**

1. Take a photo of a blank sheet of paper, with nothing else in the picture.
2. Open the photo in Photos and tap it once, so the buttons and the bar with the time disappear. Press the side button and volume up together.
3. In PR #43, start a new comment, tap the paperclip ("Paste, drop, or click to add files"), choose the screenshot and tap **Comment**. Write nothing else in that comment.
4. Copy the link of that comment, as in test A, and ask an agent to run:

   ```sh
   node tools/pow/record.mjs check-image <your comment link>
   ```

   It must end with `PASS`. A `WARN` about a screenshot note or a time chunk is fine. If it says `FAIL`, try the other ways the [human guide](human-guide.md#step-3-do-the-task) mentions: crop the screenshot, then post from the GitHub app instead of Safari. Check each new comment the same way. Post the results in PR #43 either way. They show which way of posting works on an iPhone, and the human's phone is tested the same way later.

**Test C: three things nobody has checked yet (5 minutes).** Each answer decides whether a rule of the pilot works in practice, so post what you see in PR #43:

1. Add a reaction (for example 👍) to your test A comment, then ask an agent to run `check-comment` on it again. It must still say `PASS`. If it now says "edited", reactions change GitHub's edit time, and any outsider could make a record look edited.
2. On the same test A comment, tap **···**, then **Hide**, and choose a reason. Ask an agent to run `check-comment` on it once more. If it now says "edited", hiding a comment for privacy also counts as an edit. Then unhide it.
3. Open PR #43 in a private Safari tab, signed out. Both test comments must be visible there. GitHub sometimes hides comments from new accounts; the human's account is tested the same way in their dry run.

Both test comments stay in PR #43. They are not in any ledger, so they never count as pilot records.

## 2. Second reviewer account

MEKU gives a request made with an agent key to the account that created the key. The review screen refuses a review by that account: "You made this request; a different reviewer must review it." So a second account must approve the pilot request. These steps add one without weakening that rule.

**Choose who holds it.** Ideally a person you trust who is not you, not the developer and not the human. If you hold both accounts yourself, the review is separate only by account, not by person. Then say so in the seq 3 record's `note`, for example "second account held by the same person as the key issuer".

**Create the account (about 5 minutes).**

1. In a private Safari tab, open `meku.farm/auth` and tap **NEW HERE? CREATE ACCOUNT**.
2. Under **I AM JOINING AS** choose **CLIENT**. Enter an email address that no other MEKU account uses and a password of at least 8 characters, then tap **CREATE ACCOUNT**.
3. Open the confirmation link in that email, then sign in once at `meku.farm/auth`. The first sign-in creates the account's profile, which the next step needs.

**Make it a SEEK reviewer (founder only, about 5 minutes).** A SEEK reviewer can read and review SEEK requests and nothing else: no admin rights and no financial rights. MEKU has no screen for this. It is one row in the `seek_reviewers` table of MEKU's production database (Lovable project `16389f52-e7e4-4855-ba26-9ae9b3c4253b`), added with the SQL tool you already use for that database. This is a production database write, so no agent makes it.

Replace `REVIEWER_EMAIL` in all three statements. Run them one at a time:

```sql
-- 1. Read only. Expect one row with email_confirmed_at filled in and has_profile = true.
select u.id, u.email, u.email_confirmed_at, (p.id is not null) as has_profile
  from auth.users u left join public.profiles p on p.id = u.id
 where lower(u.email) = lower('REVIEWER_EMAIL');

-- 2. The only write: adds this one account as a SEEK reviewer. Expect exactly 1 row inserted.
insert into public.seek_reviewers (user_id)
select u.id from auth.users u join public.profiles p on p.id = u.id
 where lower(u.email) = lower('REVIEWER_EMAIL') and u.email_confirmed_at is not null;

-- 3. Read only. Expect one row with is_admin = false.
select r.user_id, r.created_at, public.has_role(r.user_id, 'admin') as is_admin
  from public.seek_reviewers r join auth.users u on u.id = r.user_id
 where lower(u.email) = lower('REVIEWER_EMAIL');
```

**Check it on the site.** Sign in as the reviewer at `meku.farm/seek`. The page must show **SEEK REVIEW QUEUE**, probably with "No requests to review."

**Rules that keep the review honest:**

- The admin account that creates the pilot key (section 3) never reviews the pilot request, and the reviewer account never creates the key.
- The reviewer approves only on `meku.farm/seek`, with **APPROVE** or **REJECT** on the request card. Nobody calls `review_seek_request` directly or changes a request's status in the database. Never ask an agent to do either.
- The database guard that would also refuse self-review at the database level is staged but not applied ([B7](coordination.md#b7-database-guard-for-independent-review)). The pilot does not need it, because the separation above is followed and recorded as attested (check R04). Applying it is a separate decision for you.

**After the pilot**, if the account was only for the pilot, remove its reviewer membership with this statement. It takes effect at once:

```sql
delete from public.seek_reviewers r using auth.users u
 where u.id = r.user_id and lower(u.email) = lower('REVIEWER_EMAIL');
```

## 3. Pilot key: issue, limit, watch, revoke

Issue the key only after the developer has said yes and confirmed the four statements in the [developer guide](developer-guide.md#0-check-that-you-are-eligible).

**Issue it (signed in as your admin account, not the reviewer):**

1. Open `meku.farm/admin/agent-keys`.
2. Under **CREATE AGENT KEY**, enter the agent name `POW-001` followed by the developer's GitHub login.
3. Leave the first number at **5** (per minute). Change the second number from 20 to **30** (per day). MEKU counts every call that carries the key, and an MCP host spends 3 calls just to connect.
4. Leave **SEARCH ONLY · EXPIRES IN 30 DAYS · NO REQUEST SUBMISSIONS** unticked. A search-only key cannot submit the request.
5. Leave **ENABLE CONCIERGE PROPOSALS FOR THIS KEY** unticked.
6. Tap **GENERATE KEY**. Under **NEW KEY — COPY NOW, SHOWN ONCE**, tap **COPY KEY**.
7. Paste it straight into a private message to the developer, in a channel only they can read. Never put it in GitHub, an email subject line, a screenshot or a shared note. Then tap **I SAVED IT — HIDE**. MEKU never stores the key itself, so if it is lost, revoke it and issue a new one.

**Check the key's card** under **EXISTING KEYS**: **ACTIVE**, `ACCESS: SEARCH + OWN REQUESTS + SUBMIT`, `NO EXPIRY — VALID UNTIL REVOKED`, `CONCIERGE: DISABLED`, and `LAST USED NEVER · LIMITS 5/MIN · 30/DAY`.

**Watch it during the pilot:**

- After each developer step, open `meku.farm/admin/agent-keys`. **LAST USED** should change only when the developer says they made calls.
- On `meku.farm/seek`, signed in as your admin account, **YOUR REQUESTS** should show exactly one request titled **POW-001: handwritten code photo (unpaid pilot)**, whose text holds the code from the developer's seq 2 record. Requests made with the key belong to this account.
- Do not change the limits during the pilot. If the developer hits the limit, they wait.
- If anything is unexpected, such as a second request, a **LAST USED** time nobody can explain, or the key appearing anywhere public, tap **REVOKE** first, then post a stop.

**Revoke it:** at the close, before posting `pilot_closed`. Also revoke at once if the key leaks, the developer asks, or the pilot stops. Whatever happens, revoke within 7 days of the request record. Tap **REVOKE** on the POW-001 card. It acts at once, without asking again, so tap carefully. The card then shows **REVOKED**. From the next call, MEKU answers HTTP 401 with JSON-RPC error `-32001` and "API key has been revoked." If you want proof, ask the developer to run `node tools/pow/request.mjs check` once: it must fail with that message. The request the key made stays in MEKU's records, which is expected.

## 4. What stays manual

This pilot is coordinated by hand, and every report must say so. The [protocol](protocol.md#manual-pilot-not-automated-network-operation) lists which steps are manual and what a fully automated network would need instead.
