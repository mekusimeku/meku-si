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

Next comes the assisted dry run of the cleaner itself, [founder setup, test B](founder-setup.md#1-phone-test-about-15-minutes). No participant dry run has taken place yet.
