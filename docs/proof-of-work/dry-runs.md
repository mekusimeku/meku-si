# Dry runs: assisted MEKU tests, participant dry runs and the pilot

POW-001 has three kinds of run. Keep them apart in every post, report and reply, because only one of them can ever be evidence.

| | Assisted dry run (MEKU) | Participant dry run | The pilot |
| --- | --- | --- | --- |
| Who acts | The founder or the operator, on MEKU's own phone and GitHub account, with agents running checks for them | The real human participant, on their own phone and GitHub account | Developer, operator and human, each in their own role |
| Purpose | Test MEKU's tools and the iPhone posting path before anyone is invited | Test that participant's own phone and posting path before the ledger opens | The work cycle |
| Where it is posted | [PR #43](https://github.com/mekusimeku/meku-si/pull/43) or another MEKU pull request | The dry-run issue the operator creates ([runbook, step 5](operator-runbook.md#before-opening-all-non-financial)) | The ledger issue |
| Who checks it | An agent, for the founder | The operator, or an agent working for the operator | Anyone, ending with an independent verifier |
| Help allowed | It is MEKU's own test | The operator may send links and explain steps. The operator never takes, cleans or posts the picture, and never uses the participant's phone or account | Only what the runbook describes |
| What a pass shows | MEKU's tools work on MEKU's phone | That participant's phone and posting path produce a file the check accepts | Nothing on its own; the verdict comes from the verifier and the manual checks |
| How to label it | "Assisted dry run (MEKU), not participant testing" | "Participant dry run" | "POW-001 ledger" |

**Rules**

- **An assisted dry run is never participant testing.** It is never independent testing and never evidence. It says nothing about any participant's phone. Start every post about one with the line *Assisted dry run (MEKU), not participant testing*.
- **A participant dry run is done by the participant.** If anyone else takes, cleans or posts the picture, or works on the participant's phone or account, the run becomes an assisted one and does not count for that participant.
- **Neither dry run is part of the ledger.** Neither result may be cited as a pilot result, and no record in a dry run ever counts.
- **A check that could not run is "no result", never a pass.** `record.mjs check-image` downloads the posted picture. Some agent sessions cannot download GitHub attachments. The agent session used on 28 November 2026 was refused with HTTP 403 by its own network rules. Run the check where downloads work, or check the clean file itself before posting (`node tools/pow/record.mjs check-image <file>`) and the posted copy later.

## Assisted dry runs so far

| Date | Run by | What | Result |
| --- | --- | --- | --- |
| 2026-11-28 | Founder, with this repository's agent | Phone test A: a record posted from the iPhone, `check-comment` on PR #43's comment 7235840012 | PASS: read exactly as posted |
| 2026-11-28 | Founder, with this repository's agent | Phone test B: a screenshot posted from the iPhone, `check-image` on comment 7235940325 | No result: the agent session could not download the attachment (HTTP 403, its own network rules) |
| 2026-11-28 | Founder | Cropped and uncropped iPhone screenshots | The founder found EXIF and Photoshop metadata in both, which the check refuses. This led to the [image cleaner](image-cleaner.md) |
| 2026-11-28 | Founder: physical iPhone with Safari, then his Windows laptop | Test B with the image cleaner, tools at `258cf65`. Self-test 5 of 5 passed and the cleaner said *Ready to post*. The file was posted in PR #43 with **Choose File** (comment 7237118279), then downloaded from GitHub in a browser on the laptop. Its SHA-256, `6c1dc9b369385cf70942fb09de0e4dcc998c8c10e13923db8ac8ad6ace371a7e`, equals the cleaned file's. `check-image` was run on that download | PASS: `image/png 1284x2778`. GitHub serves the cleaned file unchanged, and it passes the check |
| 2026-11-28 | Founder's Windows laptop | `check-image` with the comment link, which downloads the picture itself | It hung and was stopped with Ctrl+C. Cause found and fixed in `5a50be9` (see below) |
| 2026-11-28 | GitHub's own runner, workflow *Check a posted POW picture* ([run 46142999621](https://github.com/mekusimeku/meku-si/actions/runs/46142999621)), tools at `5a50be9` | `check-image` with the comment link of test B, downloading the picture automatically | Downloaded 1,622,592 bytes with SHA-256 `6c1dc9b369385cf70942fb09de0e4dcc998c8c10e13923db8ac8ad6ace371a7e`, the hash the founder computed: PASS, `image/png 1284x2778` |
| 2026-11-28 | The founder (👍 on the test B comment at 11:53:29 UTC), then this repository's agent, through GitHub's API as the MEKU account (👍 on the test A comment at 11:54:29 UTC) | Test C1: a reaction, then the comment's edit time and `check-comment` | Neither reaction changed its comment's edit time, and at about 11:55 UTC, seconds after the reaction, `check-comment` on test A still said PASS. A reaction by the comment's own author does not make a record look edited. A reaction by another account was not tested |
| 2026-11-28 | Founder, physical iPhone | Test C2. At about 18:58 to 19:02 WIB the founder hid the test A comment, with the reason "Resolved", then ran `check-comment`. He unhid it and ran the check again. The comment's text was never changed; GitHub's edit time for it became 12:02:08 UTC | Hidden: FAIL, L05 (edited). Unhidden again: still FAIL, L05. This is the expected, safe behaviour: L05 fails closed. Hiding changes a comment's edit time, and unhiding does not undo it, so a record that was ever hidden counts as possibly altered. A hide, edit and unhide could not slip through either |
| 2026-11-28 | Founder, physical iPhone, Private Safari, signed out of GitHub | Test C3 at 19:08 WIB: PR #43 as the public sees it | The test A record, the cleaned test B picture and its label "Assisted dry run (MEKU), not participant testing" were all visible. Reported by the founder, with screenshots kept outside this repository |

**All founder phone tests are complete:** A, B, and C1 to C3. The automatic check on GitHub's runner confirms test B. The next founder action is the second MEKU reviewer account ([founder setup, section 2](founder-setup.md#2-second-reviewer-account)). No participant dry run has taken place yet, and the pilot has not run.

## The automated download of a posted picture

`check-image` with a comment link reads the comment from api.github.com and downloads the picture itself. It hung on the founder's laptop. The most likely cause was found by running the same command on GitHub's own runner. The laptop's own output was not recorded:

- **The cause.** For a download without a session, GitHub redirects `github.com/user-attachments/...` to its asset bucket, `github-production-user-asset-6210df.s3.amazonaws.com`. The tool's list of allowed hosts did not include it, so the download was refused. The tool also left that refused answer open, which can keep the command running after it has printed its error. In one local test it ran on for 11 seconds; in the reviewer's test it did not. That would look like a hang.
- **What this also broke.** `verify.mjs --from-issue` could not have downloaded the evidence of any real ledger.
- **The fix, in `5a50be9`, tightened in `3c06ed0`:**
  - In `5a50be9`, the tool started allowing exactly that GitHub bucket, never S3 in general.
  - Since `3c06ed0`, it allows the bucket only straight after a redirect from github.com, and every hop must be plain HTTPS on the default port. GitHub's runner passed with those rules too ([run 46144879193](https://github.com/mekusimeku/meku-si/actions/runs/46144879193)).
  - It closes every answer it does not read.
  - It announces each step, refuses any other host before contacting it, and names the host and step when something fails.
- **The result.** On GitHub's runner the command then downloaded the test B picture automatically, with the same SHA-256 the founder computed, and the check passed.
- **Two other ways to check a posted picture:**
  - **The workflow.** *Check a posted POW picture* runs the command on GitHub's runners. Once it is on `main`, anyone with write access to the repository can start it from the GitHub app with a comment link. On PR #43 it checks the test B picture, so that run depends on comment 7237118279 staying in place.
  - **The manual check used in test B.** Open the comment in a browser and save the picture. Check that its SHA-256 equals the one the image cleaner showed, then run `check-image` on the saved file. The cleaner names the file after the start of its SHA-256 (`pow-clean-6c1dc9b3.png`), and GitHub keeps that name as the picture's alt text. So whoever checks can compare the first 8 characters without asking the poster. That held for test B, a web upload. If another way of uploading names the picture differently, ask the poster for the full SHA-256 the cleaner showed.
