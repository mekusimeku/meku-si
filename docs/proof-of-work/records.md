# Ledger records, hashes and checks (`meku.pow/1`)

The ledger is one public GitHub issue in `mekusimeku/meku-si`. Each step of the [protocol](protocol.md) is one comment holding exactly one record: a JSON object with `"pow": "meku.pow/1"`. The generated JSON Schema [`tools/pow/pow-record-v1.schema.json`](../../tools/pow/pow-record-v1.schema.json) describes the fields, and this page explains them. The verifier is the authority, and it is stricter than the schema: for example, it refuses `1.0` and `1e3`, which JSON Schema counts as whole numbers.

**When a record counts.** A comment counts as a record only when it is exactly one record and nothing else, in one of these forms:

- the block the tools print: an optional header line `MEKU proof-of-work record: …`, then a `json` code block, alone. The header may carry no words of its own, except the reveal's instruction to the human (`- write <code and 2 characters> and put a <OBJECT> next to it`), which must match the record;
- or one bare JSON record, as a phone's copy button pastes it, alone. A bare record must not contain `<`, because GitHub shows a bare record as Markdown, where HTML could hide text. Inside a code block, `<` is fine.

The evidence comment (seq 8) must hold exactly one image, in GitHub's own upload markup, before or after the record; without it the evidence does not count. No other comment may hold an image. Until the operator returns the result (seq 9), the human may post the evidence again with another screenshot, and the latest counts; afterwards, a different screenshot contradicts the one that was checked, and fails (L04). The same screenshot uploaded again is only a repeat.

Anything else is **not counted**: text before or after the record, two records, a quote, an HTML comment, HTML around the record, a code block other than `json`, or an image elsewhere. GitHub could show such a comment differently from how it is read, so the verifier does not guess. It reports each one (L02) and prints it in full for a person to read. The participant then posts the record again, alone, in a new comment.

Other rules:

- Only accounts on the roster count. `pilot_opened` names the operator and the developer, and `task_offered` names the human. A record in another participant's role is not counted (R02). Record-shaped comments from anyone else are ignored and reported (L07).
- Every comment by a participant that is not a counted record is printed in full, with its link: the human's for manual check M05, the others' for M06. A STOP among the human's comments needs a stop record (H05).
- Numbers must be whole numbers: `1.0` or `1e3` makes the record invalid. JavaScript and Python would otherwise hash them differently.
- No string may contain control characters, text-direction overrides, `<!--`, `-->`, three backticks or three tildes. Such a record is not counted. The verifier also escapes everything it prints.
- A record joins the chain when its type may come next and its seq is the next one. A record out of place is not counted (L04 WARN), and the participant posts it again at the right time. A `stop` or `pilot_closed` counts whatever seq was typed (L04 WARN), because a typo must never keep a stop from counting; `record.mjs stop --bundle` and `closed --bundle` compute the right number from an export.
- An exact repeat of an earlier record by the same account is ignored with a warning (L04). A different record of the same type under a seq already counted is a contradiction, and fails (L04).
- Never edit a comment. GitHub records edits. An edited record fails L05. An edited comment by the human might have said STOP before, so it needs a stop record (H05).
- No timestamps are typed by hand. GitHub's server time on each comment is the clock (L06).
- Never delete a comment, and do not rename your GitHub account until the report is published. GitHub's API does not return deleted comments; compare exports made during the pilot to catch them (L05, `--previous`). Roles are matched by login. The verifier also checks that each login belongs to one numeric account, and warns when an account was renamed (R03).

## Envelope

Every record starts with:

| Field | Value |
| --- | --- |
| `pow` | `"meku.pow/1"` |
| `pilot_id` | `"POW-001"` (real pilots: `POW-` and three digits; `POW-SYNTHETIC-…` is test data and never counts) |
| `seq` | 0, 1, 2 … with no gaps (absent on `independent_verification`) |
| `type` | the record type below |
| `role` | `operator`, `developer`, `human` or `verifier`; must match the account that posts it |

## Record types

| seq | `type` | `role` | Fields after the envelope |
| --- | --- | --- | --- |
| 0 | `pilot_opened` | operator | `protocol` (URL of this protocol, pinned to a commit: `https://github.com/mekusimeku/meku-si/blob/<40-character commit id>/docs/proof-of-work/protocol.md`), `mcp_endpoint` = `https://meku.farm/api/public/mcp`, `variant` = `operator-relayed`, `roster` {`operator`, `developer`}, `task` (fixed protocol constants), `payment` = `none` |
| 1 | `developer_ready` | developer | `client` {`name`, `version`}, `agent` (what made the calls), `server` {`name` = `meku-human-cloud`, `version`, `protocol_version`}, `tools_listed`, `independence` (four statements, all `true`), `payment` = `none` |
| 2 | `request_submitted` | developer | `code`, `object_commitment` (see below), `arguments` (exactly what was sent to `meku_request_human`), `arguments_sha256`, `request_id_sha256`, `response` {`status`, `created_at`, `deduplicated`}, `response_text_sha256`, `observed_at`, `payment` = `none` |
| 3 | `request_reviewed` | operator | `code` (as shown in the request the reviewer saw), `decision` (`approved` or `rejected`), `reviewer_role` (`seek_reviewer` or `admin`), `reviewer_is_key_issuer` = `false`, `reviewer_same_person_as_key_issuer` (`true` or `false`, required), optional `note` |
| 4 | `request_status_observed` | developer | `request_id_sha256`, `stored_request` (the request exactly as `meku_get_request_status` returned it, without its id), `stored_request_sha256`, `response_text_sha256`, `observed_at` |
| 5 | `task_offered` | operator | `code`, `human` (GitHub login), `human_is_registered_meku_human`, `task_shown` = `ledger-seq-4` (the human reads the exact stored text in seq 4), `channel`, `payment` = `none` |
| 6 | `human_consent` | human | `consents` {`voluntary_participation`, `may_reject_or_stop`, `responsible_for_safety`, `safety_checklist`}, `adult_18_plus`, `unpaid_understood`, `publication` {`photo_public`, `github_login_public`}, `independence` {`not_meku_staff_or_contractor`, `not_the_developer`}; every value `true` |
| 7 | `object_revealed` | developer | `object` (one of SPOON, CUP, PLATE, BOWL, SOCK, TOWEL, PEN, SHOE), `suffix` (2 characters from the code alphabet, written right after the code), `salt` (the secret committed in seq 2), `consent_comment_id` (GitHub's numeric id of the seq 6 comment) |
| 8 | `evidence_submitted` | human | `statements` {`code_physically_written`, `object_placed_after_reveal`, `no_people_or_personal_data`, `metadata_removed`}, all `true`; `evidence` = `attached-in-this-comment`. The screenshot is attached to the same comment. |
| 9 | `result_returned` | operator | `code`, `evidence` = `ledger-seq-8` (the one attachment in seq 8), `meku_check` {`code_visible`, `object_visible`, `no_personal_data_visible`}, optional `note` |
| 10 | `requester_decision` | developer | `decision` (`ACCEPTED` or `REJECTED`), `checks` {`code_visible`, `code_matches`, `object_visible`, `object_matches`, `no_personal_data_visible`}, `evidence_sha256`, `ledger_digest` (records 0–9), `reason` |
| 11 | `pilot_closed` | operator | `key_revoked` = `true`, `outcome` (`completed`, `stopped` or `rejected_by_review`), optional `note` |
| any | `stop` | developer, operator or human | `reason`. Allowed at any step, also after the decision. Only `pilot_closed` may follow. After `pilot_closed`, one stop may still follow, when the human withdraws consent; nothing follows it. |
| none | `independent_verification` | verifier | `verdict`, `ledger_digest`, `tool`, `manual_checks` {`code_legible_and_matching`, `object_matching`, `no_personal_data_visible`, `physical_arrangement`, `human_did_not_withdraw`, `other_comments_consistent`}, optional `notes`. Posted by an account outside the roster; outside the seq chain. |

After a rejected review, `pilot_closed` follows directly as seq 4. After a stop at seq *n*, `pilot_closed` is seq *n*+1.

`tools/pow/record.mjs` and `tools/pow/request.mjs` print every record ready to paste. The operator's records need no hashing, so they can also be written on a phone from the templates in the [operator runbook](operator-runbook.md): they name the request by its fresh code. The developer's records carry the hashes, computed by the tools.

## Hashes and commitments

All hashes are lowercase hex SHA-256 over UTF-8 bytes.

- **Canonical JSON (JCS).** [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) restricted to null, booleans, integers, strings, arrays and objects. Records contain no fractional numbers. In Python: `json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`.
- **Record hash:** `sha256(JCS(record))`.
- **Request id commitment:** `sha256("meku.pow/1|request-id|" + lowercase(request_id))`. It links the developer's records (seq 2 and 4) to one MEKU request without publishing the id. The operator's records name the same request by its fresh code, which appears in the stored request text.
- **`arguments_sha256`** and **`stored_request_sha256`:** `sha256(JCS(value))`.
- **`response_text_sha256`:** `sha256` of the exact tool-result text MEKU returned. The developer keeps that text in a private receipt. MEKU's answers are not signed, so these records report what the developer received.
- **Object and suffix commit-reveal.** At `prepare`, the developer's client draws a secret `salt` (32 lowercase hex characters) and seq 2 publishes `object_commitment = sha256("meku.pow/1|object-salt|" + salt)`. Seq 7 reveals the salt, and the object and the 2-character suffix are fixed by:

  ```text
  n = first 8 hex characters of sha256("meku.pow/1|object|" + salt + "|" + consent_comment_id), read as a number
  object = ["SPOON","CUP","PLATE","BOWL","SOCK","TOWEL","PEN","SHOE"][n mod 8]
  h = sha256("meku.pow/1|suffix|" + salt + "|" + consent_comment_id)
  suffix = ALPHABET[first byte of h mod 32] + ALPHABET[second byte of h mod 32]   (ALPHABET = the code alphabet)
  ```

  Neither the developer nor the human, acting alone, can know the object or the suffix before the consent comment exists. The developer fixed the salt before that comment existed and cannot predict its id. The human cannot compute them before seq 7 reveals the salt. Acting together, they could post and delete consent comments until one gives a combination they photographed earlier. Each attempt has 1 chance in 8,192 (8 objects times 1,024 suffixes), and the verifier cannot see deleted comments.
- **Ledger digest** over records in seq order:

  ```text
  d = sha256("meku.pow/1|" + pilot_id)
  for each record r in seq order: d = sha256(d + "|" + sha256(JCS(r)))
  ```

  `requester_decision.ledger_digest` is the digest over records 0–9. The verifier prints the digest over all records. [`tools/pow/digest_reference.py`](../../tools/pow/digest_reference.py) recomputes it with the Python standard library alone and shares no code with the JavaScript verifier. It applies the same reading rules, so its agreement shows that the digest is computed consistently, not that the rules match how GitHub displays a comment. It does not check records against the schema, so a ledger with an invalid record makes the two disagree; they never agree falsely.

## Bundle

`tools/pow/export.mjs <ledger-url> <dir>` reads the issue through GitHub's public API, refuses a pull request and records the issue's address as GitHub spells it. It writes `<dir>/bundle.json` with the comment fields the verifier needs, as GitHub serves them, including the numeric `user_id` of each author. It also writes `<dir>/evidence/<sha256>.<ext>` for every attachment in a participant's comments (at most 20), never a stranger's, so that every image a participant posted is checked. A failed download is recorded, not fatal. It reads up to 10,000 comments; beyond 60 pages, GitHub's anonymous rate limit needs a `GITHUB_TOKEN`. Format:

```json
{
  "format": "meku.pow-bundle/1",
  "source": { "repo": "mekusimeku/meku-si", "issue_number": 0, "issue_url": "https://github.com/mekusimeku/meku-si/issues/0", "exported_at": "…", "exporter": "meku.pow-export/2" },
  "comments": [{ "id": 0, "author": "login", "user_id": 0, "author_association": "NONE", "created_at": "…", "updated_at": "…", "html_url": "…", "body": "…" }],
  "evidence_files": [{ "comment_id": 0, "url": "https://github.com/user-attachments/assets/…", "file": "evidence/<sha256>.png", "sha256": "…", "bytes": 0, "content_type": "image/png" }]
}
```

The verifier recomputes every file hash itself. It opens only regular files inside the bundle's folder, and it resolves symlinks before deciding that.

**A bundle file proves nothing by itself.** Anyone can write one, including a complete fake ledger. A verification counts only when the verifier exported the bundle from the live issue themselves. `node tools/pow/verify.mjs --from-issue <ledger-url>` does both steps and says so in its report; a report made from a supplied file says that it checked only that file.

**Earlier exports.** GitHub's API does not return deleted comments, and MEKU, as the owner of the repository, could delete one. `--previous <earlier bundle.json>` (repeatable) compares a participant's comments in an earlier export with the current one, and L05 fails if one has gone or changed. The developer keeps the exports of each step for this.

## Automated checks

`tools/pow/verify.mjs` runs these 33 checks. A check is `NOT_REACHED` until the ledger gets that far. A few checks only confirm what a participant attests: R04 (reviewer separation), Q01 (the tool list the developer saw) and C01's "key revoked". They are labelled as attested in the output.

| ID | Check | What it compares |
| --- | --- | --- |
| L01 | Bundle format and source issue are valid | `format` and the issue URL; a real pilot's ledger must be an issue in `mekusimeku/meku-si` |
| L02 | Records count only when a roster comment is exactly one valid record; every other roster comment is listed | the comment against the accepted forms, and the record against the schema, including the constant `true` statements and `payment` = `none`. A record that fails is not counted (WARN) and printed in full. WARN also when a real pilot's `protocol` link is not pinned to a commit |
| L03 | All records carry one pilot id; synthetic data is never accepted as a real pilot | `pilot_id` across records; `POW-SYNTHETIC-…` fails without `--allow-synthetic` |
| L04 | Records follow the protocol order with contiguous seq numbers | seq 0, 1, 2 … and the allowed next type at each step. A record out of place is not counted (WARN); a stop or close counts whatever seq was typed (WARN); an exact repeat is ignored (WARN); a different record of the same type under a counted seq fails |
| L05 | Record comments were never edited, and no comment seen in an earlier export has disappeared | GitHub `updated_at` equals `created_at`; with `--previous`, every participant comment in an earlier export is still there, unchanged |
| L06 | GitHub server timestamps strictly increase with seq | comment times |
| L07 | Record-like comments from accounts outside the roster are ignored | non-roster record comments (WARN when present) |
| R01 | pilot_opened is posted by the expected MEKU operator account | author of seq 0, `roster.operator` and `mekusimeku` |
| R02 | Every counted record is posted by the account that holds its role | comment author against the record's `role`; a record in another participant's role is not counted (WARN) |
| R03 | Developer, operator and human are three different accounts, each login used by one account | the three logins, case-insensitive; each login has one numeric `user_id` in the ledger (FAIL otherwise); an account seen under two logins was renamed (WARN) |
| R04 | The reviewer is attested, not proven, not to be the key issuer | `reviewer_is_key_issuer` = `false`; MEKU's review screen refuses the key issuer, but its database does not enforce it yet. WARN when `reviewer_same_person_as_key_issuer` is `true`: the review was then separate only by account |
| Q01 | The developer's key could submit requests (meku_request_human listed by meku-human-cloud) | `tools_listed` |
| Q02 | The request is exactly the protocol template for this code and ledger | `arguments` against the template built from `code` and the ledger URL; MEKU's length limits |
| Q03 | arguments_sha256 matches the submitted arguments | recomputed hash |
| Q04 | MEKU answered the submission as a new request | `status` = `submitted`; MEKU's `created_at` lies between the ledger opening and the developer's report (5 minutes of clock tolerance); `deduplicated` gives a WARN |
| Q05 | The developer's commitment and the operator's code name one request throughout | `request_id_sha256` in seq 2 and 4; `code` in seq 3, 5 and 9 against seq 2 |
| Q06 | MEKU stored the request unaltered and approved it | every stored field against the sent arguments; `requester_kind` = `agent`; `status` = `approved`; `created_at` |
| Q07 | stored_request_sha256 matches the stored request | recomputed hash |
| H01 | The offer points the human to the stored request text, which holds the code | the code in the stored description of seq 4 |
| H02 | The human consented from their own account after the offer | consent author is the offered human |
| H03 | The object follows from the committed salt and the consent comment, named after consent | salt against `object_commitment`; `consent_comment_id` against the seq 6 comment; the derived object and suffix; comment times |
| H04 | Evidence was posted by the human after the object was named and within 48 hours | comment times |
| H05 | The human's own words: a STOP is recorded, nothing was edited, other words go to manual review | every comment by the human. A comment whose words, quoted or not, inside a code block or beside a record, are only STOP, or only 🛑 or ⛔ (also as `:stop_sign:` or `:no_entry:`), needs a stop record. The words that count are listed in `STOP_WORDS` in `tools/pow/lib.mjs`: stop, halt, stopp, stoppen, aufhören, arrête, arrêtez, arrêter, arrêt, fermati, fermatevi, parar, detener, basta, berhenti, batal, dur, durdur, tigil, dừng, стоп, хватит, 停止, 停, やめて, 止めて, やめる, ストップ, 중지, 멈춰, 그만, توقف, रुको, หยุด. An edited comment by the human needs a stop record too. Every other comment by the human that is not a counted record gives a WARN and is printed in full for M05 |
| E01 | The evidence comment shows exactly one image, and it is a GitHub attachment | the counted evidence comment holds one image in GitHub's upload markup, a GitHub attachment (host case-insensitive), and no other link; any other layout means the comment is not counted at all |
| E02 | The attachment is in the bundle and its SHA-256 matches the developer's decision | file hash against `evidence_sha256` in seq 10 |
| E03 | The file is a PNG or JPEG of usable size | file signature, dimensions (shorter side at least 240 px), size (at most 10 MiB) |
| E04 | The evidence and every other image a participant posted carry only pixel and colour data, plus at most a screenshot's size note | allow-list, for the evidence and every attachment in a participant's comments. PNG: only pixel, palette, transparency and colour chunks. A colour profile may hold only colour tags, inside the profile, with short texts and no EXIF. A phone screenshot's XMP note is a WARN if every element, attribute and text in it is the pixel size, orientation, resolution or the comment `Screenshot`; anything else in it fails. A last-modified time chunk is a WARN. JPEG: only JFIF (no JFXX thumbnail), a colour profile checked the same way, a 12-byte Adobe segment, tables, frame and scan segments. Anything else fails, including bytes after the end of the image and XMP that expands past 1 MiB. Beside the evidence, only location data fails; other metadata, an image from outside GitHub, or one not in the bundle is a WARN for M03 |
| D01 | MEKU returned the result after the evidence it refers to | seq 9 follows seq 8 |
| D02 | The developer's decision commits to the exact ledger through seq 9 | recomputed ledger digest |
| D03 | An ACCEPTED decision has every developer check true and lands within 168 hours | `checks` and comment times |
| D04 | MEKU's own check agrees with an ACCEPTED decision | any `false` in `meku_check` fails an ACCEPTED decision; with REJECTED it is a WARN |
| C01 | The pilot was closed with the key revoked and a matching outcome | `outcome` against the path taken: `stopped` after a stop before the close, else `completed` after a decision, else `rejected_by_review` |
| C02 | No record involves payment | every `payment` field (also enforced by the schema) |

**Verdicts and exit codes.** `PASS` needs every check to pass, a developer `ACCEPTED` decision and a closed pilot without a stop. It exits with 0 only when this run exported the ledger itself; on a supplied file it exits with 5. Any `FAIL` gives verdict `FAIL` (exit 1). `STOPPED`, `REJECTED_BY_REVIEW`, `COMPLETED_REJECTED` and `INCOMPLETE` exit with 2. With `INCOMPLETE`, the verifier names the next expected record. Usage errors exit with 3. When the run cannot complete (the export fails, a file cannot be read, or the `--json` file cannot be written), it gives no verdict and exits with 4. `--json result.json` writes the full result, including every record in order, for the [report](report-template.md).

The verifier cannot judge a picture or read intent. It prints manual checks M01–M06 for a person, as described in the [protocol](protocol.md#pass-and-fail), and above them every participant comment that is not a counted record, in full, with a `READ FIRST` line before the verdict. To check any image the same way before posting it, run `node tools/pow/record.mjs check-image <file, attachment link or comment link>`. To see how one posted comment is read, run `node tools/pow/record.mjs check-comment <comment link>`.
