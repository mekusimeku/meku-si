#!/usr/bin/env node
// Offline verifier for a MEKU proof-of-work pilot ledger (meku.pow/1).
// Input: a bundle exported from the public GitHub issue (export.mjs) plus its evidence files,
// or --from-issue <url> to export and verify in one step. A bundle file proves nothing by
// itself: anyone can write one. A PASS means something only for a bundle you exported
// yourself from the live issue.
// Output: one line per check (PASS, FAIL, WARN, NOT_REACHED), manual checks and a verdict.
// Exit codes: 0 PASS, 1 FAIL, 2 any other verdict (INCOMPLETE, STOPPED, REJECTED_BY_REVIEW,
// COMPLETED_REJECTED), 3 usage error.

import { closeSync, mkdtempSync, openSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BUNDLE_FORMAT,
  CYCLE_HOURS,
  EVIDENCE_HOURS_AFTER_REVEAL,
  MAX_EVIDENCE_BYTES,
  OBJECTS,
  PROTOCOL,
  SHAPE_FINDINGS,
  buildRequestArguments,
  canon,
  displaySafe,
  extractAttachmentUrls,
  extractRecords,
  externalImages,
  extractAllUrls,
  isStopWord,
  wordsBesideRecord,
  isLedgerUrl,
  isObjectSalt,
  isSyntheticPilot,
  ledgerDigest,
  objectCommitment,
  objectFor,
  recordProblems,
  requestArgumentProblems,
  rosterFromComments,
  sameLogin,
  scanImage,
  sha256Hex,
  suffixFor,
} from "./lib.mjs";

export const VERIFIER_VERSION = "meku.pow-verify/3";
const PINNED_PROTOCOL = /^https:\/\/github\.com\/mekusimeku\/meku-si\/blob\/[0-9a-f]{40}\/docs\/proof-of-work\/protocol\.md$/;
const HOUR_MS = 3_600_000;

// Which record may follow which. A stop may follow any record from pilot_opened onward
// except a decision or a close; after a stop or a rejection only a close may follow.
function allowedNext(previous, { closed = false, stopped = false } = {}) {
  if (!previous) return ["pilot_opened"];
  // After the close, the human's consent can still be withdrawn: one stop may follow.
  if (closed) return previous.type === "pilot_closed" && !stopped ? ["stop"] : [];
  switch (previous.type) {
    case "pilot_opened":
      return ["developer_ready", "stop"];
    case "developer_ready":
      return ["request_submitted", "stop"];
    case "request_submitted":
      return ["request_reviewed", "stop"];
    case "request_reviewed":
      return previous.decision === "rejected" ? ["pilot_closed"] : ["request_status_observed", "stop"];
    case "request_status_observed":
      return ["task_offered", "stop"];
    case "task_offered":
      return ["human_consent", "stop"];
    case "human_consent":
      return ["object_revealed", "stop"];
    case "object_revealed":
      return ["evidence_submitted", "stop"];
    case "evidence_submitted":
      return ["result_returned", "stop"];
    case "result_returned":
      return ["requester_decision", "stop"];
    case "requester_decision":
      return ["pilot_closed", "stop"];
    case "stop":
      return ["pilot_closed"];
    default:
      return [];
  }
}

export const CHECKS = [
  ["L01", "Bundle format and source issue are valid"],
  ["L02", "Records count only when a roster comment is exactly one valid record; every other roster comment is listed"],
  ["L03", "All records carry one pilot id; synthetic data is never accepted as a real pilot"],
  ["L04", "Records follow the protocol order with contiguous seq numbers"],
  ["L05", "Record comments were never edited, and no comment seen in an earlier export has disappeared"],
  ["L06", "GitHub server timestamps strictly increase with seq"],
  ["L07", "Record-like comments from accounts outside the roster are ignored"],
  ["R01", "pilot_opened is posted by the expected MEKU operator account"],
  ["R02", "Every counted record is posted by the account that holds its role"],
  ["R03", "Developer, operator and human are three different accounts, each login used by one account"],
  ["R04", "The reviewer is attested, not proven, not to be the key issuer"],
  ["Q01", "The developer's key could submit requests (meku_request_human listed by meku-human-cloud)"],
  ["Q02", "The request is exactly the protocol template for this code and ledger"],
  ["Q03", "arguments_sha256 matches the submitted arguments"],
  ["Q04", "MEKU answered the submission as a new request"],
  ["Q05", "The developer's commitment and the operator's code name one request throughout"],
  ["Q06", "MEKU stored the request unaltered and approved it"],
  ["Q07", "stored_request_sha256 matches the stored request"],
  ["H01", "The offer points the human to the stored request text, which holds the code"],
  ["H02", "The human consented from their own account after the offer"],
  ["H03", "The object follows from the committed salt and the consent comment, named after consent"],
  ["H04", "Evidence was posted by the human after the object was named and within 48 hours"],
  ["H05", "The human's own words: a STOP is recorded, nothing was edited, other words go to manual review"],
  ["E01", "The evidence comment shows exactly one image, and it is a GitHub attachment"],
  ["E02", "The attachment is in the bundle and its SHA-256 matches the developer's decision"],
  ["E03", "The file is a PNG or JPEG of usable size"],
  ["E04", "The evidence and every other image a participant posted carry only pixel and colour data, plus at most a screenshot's size note"],
  ["D01", "MEKU returned the result after the evidence it refers to"],
  ["D02", "The developer's decision commits to the exact ledger through seq 9"],
  ["D03", "An ACCEPTED decision has every developer check true and lands within 168 hours"],
  ["D04", "MEKU's own check agrees with an ACCEPTED decision"],
  ["C01", "The pilot was closed with the key revoked and a matching outcome"],
  ["C02", "No record involves payment"],
];

export function verifyBundle(
  bundle,
  { loadEvidence = () => null, expectOperator = "mekusimeku", expectRepo = "mekusimeku/meku-si", allowSynthetic = false, provenance = null, earlierExports = [] } = {},
) {
  const results = new Map(CHECKS.map(([id, title]) => [id, { id, title, status: "NOT_REACHED", details: [] }]));
  const fail = (id, detail) => {
    const r = results.get(id);
    r.status = "FAIL";
    r.details.push(detail);
  };
  const warn = (id, detail) => {
    const r = results.get(id);
    if (r.status !== "FAIL") r.status = "WARN";
    r.details.push(detail);
  };
  const pass = (id, detail) => {
    const r = results.get(id);
    if (r.status === "NOT_REACHED") r.status = "PASS";
    if (detail) r.details.push(detail);
  };
  // Declared before any early return, because finish() reports on them.
  const manual = [];
  const verifications = [];
  const chain = []; // accepted records in seq order: { record, comment }
  const uncounted = []; // every roster comment that is not a counted record, in full (M05, M06)
  const images = []; // every image a participant posted besides the evidence (E04, M03)
  let pilotId = null;
  let protocolUrl = null;
  let issueUrl = null;
  let evidenceUrl = null;
  let evidenceSha = null;
  let scan = null;

  try {
    run();
  } catch (error) {
    // Hostile or malformed input must still produce a report, never a crash.
    fail("L01", `verification stopped on malformed input: ${error?.message ?? error}`);
  }
  return finish();

  function run() {
    // ---- L01: bundle shape
    const comments = Array.isArray(bundle?.comments) ? bundle.comments : null;
    issueUrl = typeof bundle?.source?.issue_url === "string" ? bundle.source.issue_url : null;
    if (bundle?.format !== BUNDLE_FORMAT) fail("L01", `format must be ${BUNDLE_FORMAT}`);
    if (!isLedgerUrl(issueUrl)) fail("L01", "source.issue_url must be a GitHub issue URL");
    if (!comments) fail("L01", "comments must be an array");
    if (results.get("L01").status === "FAIL") return;
    pass("L01", issueUrl);

    const commentOk = (c) =>
      c && typeof c.author === "string" && typeof c.body === "string" && !Number.isNaN(Date.parse(c.created_at)) && !Number.isNaN(Date.parse(c.updated_at));
    const ordered = comments
      .filter((c, i) => {
        if (commentOk(c)) return true;
        fail("L01", `comment #${i} lacks author, body or timestamps`);
        return false;
      })
      .slice()
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || String(a.id).localeCompare(String(b.id)));

    // ---- Roster. A seq 0 from anyone but the expected operator account is ignored, so a
    // stranger cannot hijack the ledger by commenting first.
    const found = [];
    for (const comment of ordered) for (const item of extractRecords(comment.body)) found.push({ comment, ...item });
    const roster = rosterFromComments(ordered, { expectOperator });
    const opening = roster.opening ? found.find((f) => f.comment === roster.opening.comment && f.record?.type === "pilot_opened" && f.record?.seq === 0) : null;
    if (!opening) {
      fail("L04", "the ledger has no pilot_opened record with seq 0");
      return;
    }
    pilotId = typeof opening.record.pilot_id === "string" ? opening.record.pilot_id : null;
    protocolUrl = typeof opening.record.protocol === "string" ? opening.record.protocol : null;
    const synthetic = isSyntheticPilot(pilotId);
    if (synthetic && !allowSynthetic) fail("L03", `${pilotId} is synthetic test data, not a real pilot (use --allow-synthetic only for tests)`);
    if (!synthetic && !issueUrl.toLowerCase().startsWith(`https://github.com/${expectRepo.toLowerCase()}/issues/`))
      fail("L01", `a real pilot ledger must be an issue in ${expectRepo}`);
    // The opening names the exact version of the protocol and tools the pilot runs under.
    if (!synthetic && !PINNED_PROTOCOL.test(String(opening.record.protocol)))
      warn("L02", "pilot_opened.protocol is not pinned to a commit, so a verifier cannot tell which version of the protocol and tools applies");
    if (!sameLogin(opening.comment.author, roster.operator)) fail("R01", `pilot_opened was posted by ${opening.comment.author}, not roster.operator`);
    else if (!synthetic && !sameLogin(roster.operator, expectOperator)) fail("R01", `roster.operator is ${roster.operator}, expected ${expectOperator}`);
    else pass("R01", `operator ${roster.operator}`);
    const humanLogin = roster.human;
    if ((roster.humansNamed ?? []).length > 1)
      fail("H02", `the operator's offers name more than one human (${roster.humansNamed.join(", ")}); a pilot has one human, so this ledger cannot pass`);
    const roleOf = (author) => {
      if (sameLogin(author, roster.operator)) return "operator";
      if (sameLogin(author, roster.developer)) return "developer";
      if (sameLogin(author, humanLogin)) return "human";
      return null;
    };

    // ---- Classify every record-bearing comment. Only a comment that is exactly one valid record,
    // by the account that holds its role, can count. Every other comment by a roster account is
    // listed in full afterwards, for a person to read (M05 for the human, M06 for the others).
    const sequenced = [];
    const invalidRecords = []; // records by a participant in their role that failed the schema
    const reasons = new Map(); // comment -> why its record was not counted
    for (const f of found) {
      const role = roleOf(f.comment.author);
      if (f.error) {
        if (role) reasons.set(f.comment, f.error);
        else warn("L07", `ignored a record-like comment by ${f.comment.author}: ${f.error}`);
        continue;
      }
      if (f !== opening && f.record?.type === "pilot_opened") {
        if (role) reasons.set(f.comment, "a second pilot_opened");
        else warn("L07", `ignored another pilot_opened posted by ${f.comment.author}`);
        continue;
      }
      const record = f.record;
      if (record.type === "independent_verification") {
        const problems = recordProblems(record);
        if (role) reasons.set(f.comment, "an independent_verification by a participant, which is not independent");
        else if (problems.length) warn("L07", `independent_verification by ${f.comment.author} ignored: ${problems[0]}`);
        else verifications.push({ author: f.comment.author, created_at: f.comment.created_at, pilot_id: record.pilot_id, verdict: record.verdict, ledger_digest: record.ledger_digest, tool: record.tool, manual_checks: record.manual_checks });
        continue;
      }
      if (!role) {
        warn("L07", `ignored ${typeof record.type === "string" ? record.type : "record"} posted by non-roster account ${f.comment.author}`);
        continue;
      }
      if (record.role !== role) {
        reasons.set(f.comment, `claims role ${record.role}, but ${f.comment.author} is the ${role}`);
        warn("R02", `${f.comment.html_url ?? f.comment.id}: a ${record.type} record claiming role ${record.role} posted by the ${role} is not counted`);
        continue;
      }
      const problems = recordProblems(record);
      if (problems.length) {
        reasons.set(f.comment, problems.join("; "));
        if (typeof record.type === "string") invalidRecords.push({ record, comment: f.comment, image: f.image ?? null });
        continue;
      }
      sequenced.push({ record, comment: f.comment, image: f.image ?? null, label: f.label ?? null });
    }
    for (const [comment, reason] of reasons)
      warn("L02", `a record by the ${roleOf(comment.author)} at ${comment.created_at} is not counted: ${reason}`);
    if (results.get("L02").status === "NOT_REACHED") pass("L02", `${sequenced.length} records`);
    if (results.get("R02").status === "NOT_REACHED") pass("R02");
    if (results.get("L07").status === "NOT_REACHED") pass("L07", "none found");

    // ---- L03 / L04 / L05 / L06: identity, order, edits, timestamps.
    for (const { record } of sequenced) if (record.pilot_id !== pilotId) fail("L03", `seq ${record.seq} has pilot_id ${record.pilot_id}`);
    if (results.get("L03").status !== "FAIL") pass("L03", pilotId);

    // Each kind of record is posted once. A record posted in its turn states what that kind
    // says, even if its seq is wrong: a later record of the same kind by the same role that says
    // anything else (apart from its seq) fails, so a negative record posted in its turn can never
    // be outvoted by a later positive one, and the evidence the operator checked can never be
    // swapped. The same
    // record with its seq corrected is a repeat. Stops are exempt: any stop is a stop.
    // A record posted before its turn is not counted and states nothing, so it may be posted
    // again, even with new content (a status read again, a new photo), when its turn comes.
    // A stop or a close counts whatever seq was typed, because a typo must never keep a stop
    // from counting.
    // Two images are the same when their addresses are, or when the bundle holds both files and
    // their bytes are identical (the same screenshot uploaded again gets a new address). When a
    // file is missing they cannot be compared; that is reported, and the counted one stands.
    const files = Array.isArray(bundle.evidence_files) ? bundle.evidence_files : [];
    const imageHash = (e) => {
      const file = files.find((f) => String(f?.comment_id) === String(e.comment.id) && typeof f?.url === "string" && f.url.toLowerCase() === String(e.image).toLowerCase())?.file;
      const bytes = file ? loadEvidence(file) : null;
      return bytes ? sha256Hex(bytes) : null;
    };
    const imageMatch = (a, b) => {
      if ((a.image ?? null) === (b.image ?? null)) return true;
      if (!a.image || !b.image) return false;
      const [ha, hb] = [imageHash(a), imageHash(b)];
      return ha === null || hb === null ? null : ha === hb;
    };
    const content = (e) => canon({ ...e.record, seq: null });
    // true: says the same; false: says something else; null: the same record, beside a
    // screenshot that could not be compared.
    const compare = (a, b) => (content(a) === null || content(a) !== content(b) ? false : imageMatch(a, b));
    const statements = new Map(); // type + role -> the record that states what this kind says
    const outOfTurn = []; // posted before their turn: not counted, stating nothing
    for (const entry of sequenced) {
      const { record, comment } = entry;
      const kind = `${record.type}|${record.role}`;
      const statement = statements.get(kind);
      if (record.type !== "stop" && statement) {
        const same = compare(statement, entry);
        if (same === false) {
          fail("L04", `a second ${record.type} posted at ${comment.created_at} says something different from the one posted at ${statement.comment.created_at}`);
          reasons.set(comment, `contradicts the ${record.type} posted at ${statement.comment.created_at}`);
          continue;
        }
        if (same === null) warn("L04", `the screenshot posted at ${comment.created_at} could not be compared with the one posted at ${statement.comment.created_at}, because the bundle lacks a file; the first one stands. Export again with its attachments`);
      }
      if (chain.some((e) => e.record.type === record.type && sameLogin(e.comment.author, comment.author) && (record.type !== "stop" || compare(e, entry) === true))) {
        warn("L04", `${record.type} was posted again at ${comment.created_at}; the repeat is ignored`);
        reasons.set(comment, `a repeat of the counted ${record.type}`);
        continue;
      }
      const last = chain.at(-1);
      const closed = chain.some((e) => e.record.type === "pilot_closed");
      const stopped = chain.some((e) => e.record.type === "stop");
      const allowed = allowedNext(last?.record ?? null, { closed, stopped });
      const lenient = record.type === "stop" || record.type === "pilot_closed";
      const expected = allowed.length ? `seq ${chain.length}: ${allowed.join(" or ")}` : "nothing more";
      if (!allowed.includes(record.type)) {
        warn("L04", `seq ${record.seq} ${record.type} posted at ${comment.created_at} is out of place (expected ${expected}); it is not counted and states nothing, so post it again when its turn comes`);
        reasons.set(comment, `out of place: expected ${expected}`);
        outOfTurn.push(entry);
        continue;
      }
      if (!statement && record.type !== "stop") statements.set(kind, entry);
      if (record.seq !== chain.length && !lenient) {
        warn("L04", `seq ${record.seq} ${record.type} posted at ${comment.created_at} is out of place (expected ${expected}); it is not counted: post exactly the same record again with seq ${chain.length}, since any other change fails`);
        reasons.set(comment, `out of place: expected ${expected}`);
        continue;
      }
      if (record.seq !== chain.length) warn("L04", `the ${record.type} posted at ${comment.created_at} says seq ${record.seq}; it is counted as seq ${chain.length}`);
      chain.push(entry);
    }
    // A record that does not count states nothing, but when it says something other than the
    // record of its kind that counts, both must be read (M05, M06): it may be a negative check or
    // a rejection that was posted badly.
    for (const other of [...outOfTurn, ...invalidRecords]) {
      if (other.record.type === "stop") continue;
      const counted = chain.find((e) => e.record.type === other.record.type && e.record.role === other.record.role);
      if (counted && compare(counted, other) !== true)
        warn("L04", `the ${other.record.type} posted at ${other.comment.created_at}, which does not count, says something other than the one that counts (posted at ${counted.comment.created_at}): read both`);
    }
    if (results.get("L04").status !== "FAIL") pass("L04", `${chain.length} records in order`);

    for (const { record, comment } of chain)
      if (comment.updated_at !== comment.created_at) fail("L05", `seq ${record.seq} comment was edited (${comment.created_at} -> ${comment.updated_at}); post a stop or correction instead`);
    // GitHub's API does not return deleted comments. An earlier export, made by anyone during
    // the pilot, shows whether a participant's comment has since disappeared or changed.
    const now = new Map(ordered.map((c) => [String(c.id), c]));
    for (const earlier of earlierExports) {
      for (const old of Array.isArray(earlier?.comments) ? earlier.comments : []) {
        if (!roleOf(old?.author)) continue;
        const current = now.get(String(old.id));
        if (!current) fail("L05", `a comment by the ${roleOf(old.author)} from ${old.created_at}, present in an export of ${earlier.source?.exported_at ?? "unknown time"}, is gone now`);
        else if (current.body !== old.body || current.updated_at !== old.updated_at)
          fail("L05", `a comment by the ${roleOf(old.author)} from ${old.created_at} changed after an export of ${earlier.source?.exported_at ?? "unknown time"}`);
      }
    }
    if (results.get("L05").status !== "FAIL" && chain.length) pass("L05", earlierExports.length ? `compared with ${earlierExports.length} earlier export(s)` : undefined);

    for (let i = 1; i < chain.length; i += 1)
      if (Date.parse(chain[i].comment.created_at) <= Date.parse(chain[i - 1].comment.created_at)) fail("L06", `seq ${i} is not later than seq ${i - 1}`);
    if (results.get("L06").status !== "FAIL" && chain.length) pass("L06");

    const at = (type) => chain.find((e) => e.record.type === type);
    const time = (entry) => Date.parse(entry.comment.created_at);
    const R = Object.fromEntries(
      ["developer_ready", "request_submitted", "request_reviewed", "request_status_observed", "task_offered", "human_consent", "object_revealed", "evidence_submitted", "result_returned", "requester_decision", "pilot_closed", "stop"].map((t) => [t, at(t)]),
    );
    const str = (v) => (typeof v === "string" ? v : "");

    // ---- R03 / R04
    const logins = [roster.operator, roster.developer, humanLogin].filter((l) => typeof l === "string").map((l) => l.toLowerCase());
    if (new Set(logins).size !== logins.length) fail("R03", `accounts are not distinct: ${logins.join(", ")}`);
    // Roles are matched by login. A login that belongs to two numeric accounts was given up and
    // taken by someone else; an account that changed login was renamed.
    for (const login of logins) {
      const ids = new Set(ordered.filter((c) => sameLogin(c.author, login) && c.user_id != null).map((c) => String(c.user_id)));
      if (ids.size > 1) fail("R03", `the login ${login} was used by ${ids.size} different GitHub accounts in this ledger`);
      for (const id of ids) {
        const other = ordered.find((c) => String(c.user_id) === id && c.author && !sameLogin(c.author, login));
        if (other) warn("R03", `the account behind ${login} also posted as ${other.author}: it was renamed during the pilot`);
      }
    }
    if (results.get("R03").status === "NOT_REACHED" && logins.length === 3) pass("R03", logins.join(", "));
    if (R.request_reviewed?.record.reviewer_same_person_as_key_issuer === true)
      warn("R04", "the operator states that one person holds both the key issuer's and the reviewer's accounts: the review was separate only by account");
    else if (R.request_reviewed)
      pass("R04", `attested by the operator: another account, held by another person; reviewer role ${str(R.request_reviewed.record.reviewer_role)}; MEKU's database does not enforce it yet`);

    // ---- Request checks
    const code = str(R.request_submitted?.record.code);
    if (R.developer_ready) {
      const d = R.developer_ready.record;
      if (!Array.isArray(d.tools_listed) || !d.tools_listed.includes("meku_request_human")) fail("Q01", "tools_listed lacks meku_request_human: the key is search-only");
      else pass("Q01", `self-reported: ${str(d.client?.name)} ${str(d.client?.version)}; server ${str(d.server?.name)} ${str(d.server?.version)}, protocol ${str(d.server?.protocol_version)}`);
    }
    if (R.request_submitted) {
      const s = R.request_submitted.record;
      let expected = null;
      try {
        expected = buildRequestArguments({ pilotId, code: s.code, ledgerUrl: issueUrl });
      } catch (error) {
        fail("Q02", error.message);
      }
      if (expected) {
        if (canon(s.arguments) === null || canon(s.arguments) !== canon(expected)) fail("Q02", "arguments differ from the protocol template (any extra request, field or wording is refused)");
        else {
          const problems = requestArgumentProblems(s.arguments);
          if (problems.length) fail("Q02", problems.join("; "));
          else pass("Q02", `code ${s.code}`);
        }
      }
      const argsCanon = canon(s.arguments);
      if (argsCanon === null || sha256Hex(argsCanon) !== s.arguments_sha256) fail("Q03", "arguments_sha256 does not match");
      else pass("Q03");
      // MEKU's own clock must place the request inside the ledger's lifetime: after the ledger
      // opened and before the developer reported it (5 minutes of clock tolerance either way).
      const created = Date.parse(s.response?.created_at);
      const opened = Date.parse(opening.comment.created_at);
      const reported = time(R.request_submitted);
      if (s.response?.status !== "submitted") fail("Q04", `MEKU answered status ${s.response?.status}`);
      else if (!(created > opened - 5 * 60_000 && created < reported + 5 * 60_000))
        fail("Q04", `MEKU created_at ${s.response.created_at} is outside the ledger window (${opening.comment.created_at} to ${R.request_submitted.comment.created_at})`);
      else if (s.response.deduplicated) warn("Q04", "MEKU returned an earlier identical submission (deduplicated: true)");
      else pass("Q04", `created_at ${s.response.created_at} (developer-reported; MEKU's answers are not signed)`);
    }
    // The developer links seq 2 and 4 by the request id commitment; the operator names the
    // same request by its fresh code in seq 3, 5 and 9.
    if (R.request_submitted && R.request_status_observed && R.request_status_observed.record.request_id_sha256 !== R.request_submitted.record.request_id_sha256)
      fail("Q05", "request_id_sha256 differs between request_submitted and request_status_observed");
    const operatorCodes = ["request_reviewed", "task_offered", "result_returned"].filter((t) => R[t]).map((t) => [t, R[t].record.code]);
    const wrongCodes = operatorCodes.filter(([, c]) => c !== code);
    if (wrongCodes.length) fail("Q05", `the operator names another request (code differs) in ${wrongCodes.map(([t]) => t).join(", ")}`);
    if (R.request_reviewed && results.get("Q05").status !== "FAIL") pass("Q05", `code ${code} in ${operatorCodes.length} operator records`);
    if (R.request_status_observed && R.request_submitted) {
      const o = R.request_status_observed.record;
      const s = R.request_submitted.record;
      const stored = o.stored_request && typeof o.stored_request === "object" ? o.stored_request : {};
      const sent = s.arguments && typeof s.arguments === "object" ? s.arguments : {};
      const expectStored = {
        title: sent.title,
        action: sent.action,
        description: sent.description,
        country: null,
        region: null,
        skills: [],
        deliverable: sent.deliverable,
        timeframe: sent.timeframe,
        budget_text: sent.budget_text,
        travel_required: false,
        equipment_required: false,
        requester_kind: "agent",
        status: "approved",
        created_at: s.response?.created_at,
      };
      const diffs = Object.keys(expectStored).filter((k) => canon(stored[k] ?? null) === null || canon(stored[k] ?? null) !== canon(expectStored[k] ?? null));
      if (diffs.length) fail("Q06", `stored request differs in: ${diffs.join(", ")}`);
      else pass("Q06", "stored text equals the submitted text; status approved (developer-reported)");
      const storedCanon = canon(stored);
      if (storedCanon === null || sha256Hex(storedCanon) !== o.stored_request_sha256) fail("Q07", "stored_request_sha256 does not match");
      else pass("Q07");
    }

    // ---- Human and consent
    if (R.task_offered && R.request_status_observed) {
      const description = str(R.request_status_observed.record.stored_request?.description);
      if (!code || !description.includes(code)) fail("H01", "the stored request text the human is pointed to does not contain the code");
      else pass("H01", `human ${humanLogin} pointed to the stored text in seq ${R.request_status_observed.record.seq}`);
    }
    if (R.human_consent && R.task_offered) {
      if (!sameLogin(R.human_consent.comment.author, R.task_offered.record.human)) fail("H02", "consent was not posted by the human named in the counted offer");
      else pass("H02", `consented at ${R.human_consent.comment.created_at}`);
    }
    if (R.object_revealed) {
      const rv = R.object_revealed.record;
      const consentId = R.human_consent ? Number(R.human_consent.comment.id) : NaN;
      if (!OBJECTS.includes(rv.object)) fail("H03", `${rv.object} is not on the protocol list`);
      else if (!R.human_consent || time(R.object_revealed) <= time(R.human_consent)) fail("H03", "the object was named before consent");
      else if (objectCommitment(rv.salt) !== R.request_submitted?.record.object_commitment) fail("H03", "the revealed salt does not match the object_commitment made in seq 2");
      else if (rv.consent_comment_id !== consentId) fail("H03", `consent_comment_id ${rv.consent_comment_id} is not the id of the consent comment (${R.human_consent.comment.id})`);
      else if (!isObjectSalt(rv.salt) || !Number.isSafeInteger(consentId) || consentId < 1) fail("H03", "the salt or the consent comment id is malformed");
      else if (objectFor(rv.salt, rv.consent_comment_id) !== rv.object) fail("H03", `the salt and consent comment give ${objectFor(rv.salt, rv.consent_comment_id)}, not ${rv.object}`);
      else if (suffixFor(rv.salt, rv.consent_comment_id) !== rv.suffix) fail("H03", `the salt and consent comment give the suffix ${suffixFor(rv.salt, rv.consent_comment_id)}, not ${rv.suffix}`);
      else if (R.object_revealed.label && R.object_revealed.label.code !== code)
        fail("H03", `the reveal's first line tells the human to write ${R.object_revealed.label.code}, not the request's code ${code}`);
      else pass("H03", `object ${rv.object} and suffix ${rv.suffix}, derived from the committed salt and consent comment ${rv.consent_comment_id}`);
    }
    if (R.evidence_submitted && R.object_revealed) {
      const hours = (time(R.evidence_submitted) - time(R.object_revealed)) / HOUR_MS;
      if (hours <= 0) fail("H04", "evidence predates the object reveal");
      else if (hours > EVIDENCE_HOURS_AFTER_REVEAL) fail("H04", `evidence came ${hours.toFixed(1)} h after the reveal (limit ${EVIDENCE_HOURS_AFTER_REVEAL} h)`);
      else pass("H04", `${hours.toFixed(2)} h after the reveal`);
    }
    // ---- Everything a participant wrote that is not a counted record is listed in full. The
    // human's words decide over everything else: a STOP needs a stop record, and an edited
    // comment by the human might have said STOP, so it needs one too. Anything else they wrote
    // goes to a person (M05), as do the other participants' extra comments (M06).
    const counted = new Set(chain.map((e) => e.comment));
    for (const comment of ordered) {
      const role = roleOf(comment.author);
      if (!role || counted.has(comment)) continue;
      uncounted.push({
        role,
        comment_id: comment.id ?? null,
        html_url: comment.html_url ?? null,
        created_at: comment.created_at,
        edited: comment.updated_at !== comment.created_at,
        reason: reasons.get(comment) ?? "not a record",
        body: String(comment.body ?? ""),
      });
    }
    const stopCovers = R.stop ? ` is covered by the stop record at seq ${R.stop.record.seq}` : null;
    if (humanLogin) {
      for (const comment of ordered) {
        if (!sameLogin(comment.author, humanLogin)) continue;
        if (comment.updated_at !== comment.created_at) {
          if (stopCovers) pass("H05", `an edited comment by the human at ${comment.created_at}${stopCovers}`);
          else fail("H05", `a comment by the human at ${comment.created_at} was edited; its first version may have withdrawn consent, so the cycle cannot pass unless a stop is recorded`);
        }
        if (counted.has(comment)) continue;
        if (isStopWord(comment.body) || isStopWord(wordsBesideRecord(comment.body))) {
          if (stopCovers) pass("H05", `the human's STOP at ${comment.created_at}${stopCovers}`);
          else fail("H05", `the human wrote STOP at ${comment.created_at}, but the ledger has no stop record`);
        } else warn("H05", `the human posted a comment at ${comment.created_at} that is not a counted record; read all of it (manual check M05)`);
      }
      if (results.get("H05").status === "NOT_REACHED" && R.task_offered) pass("H05", "the human posted only counted records");
    }

    // ---- Evidence
    if (R.evidence_submitted) {
      // The grammar already allows only the record and one image in GitHub's own markup.
      const urls = extractAllUrls(R.evidence_submitted.comment.body);
      if (!R.evidence_submitted.image) fail("E01", "the evidence comment holds no GitHub image attachment");
      else if (urls.length !== 1) fail("E01", `the evidence comment holds ${urls.length} links; only the one image is allowed`);
      else {
        evidenceUrl = R.evidence_submitted.image;
        pass("E01", evidenceUrl);
      }
    }
    if (evidenceUrl) {
      const entry = (Array.isArray(bundle.evidence_files) ? bundle.evidence_files : []).find((e) => typeof e?.url === "string" && e.url.toLowerCase() === evidenceUrl.toLowerCase());
      const bytes = entry ? loadEvidence(entry.file) : null;
      if (!bytes) fail("E02", "the attachment is not in the bundle (export it with export.mjs or verify --from-issue)");
      else {
        evidenceSha = sha256Hex(bytes);
        if (entry.sha256 && entry.sha256 !== evidenceSha) warn("E02", "bundle's recorded sha256 differs from the file; the file's own hash is used");
        const claimed = R.requester_decision?.record.evidence_sha256;
        if (claimed !== undefined && claimed !== evidenceSha) fail("E02", `file sha256 ${evidenceSha} differs from the developer's evidence_sha256`);
        else if (claimed !== undefined) pass("E02", `sha256 ${evidenceSha}`);
        scan = scanImage(bytes);
        for (const f of scan.findings) {
          if (SHAPE_FINDINGS.has(f.code)) fail("E03", f.detail);
          else (f.level === "FAIL" ? fail : warn)("E04", f.detail);
        }
        if (results.get("E03").status !== "FAIL") pass("E03", `${scan.mediaType} ${scan.width}x${scan.height}, ${bytes.length} bytes`);
      }
    }
    // Every other image a participant posted is checked the same way, and listed for M03: a
    // photo with a location in a side comment would leak as surely as one in the evidence.
    for (const comment of ordered) {
      const role = roleOf(comment.author);
      if (!role) continue;
      for (const url of extractAttachmentUrls(comment.body)) {
        if (comment === R.evidence_submitted?.comment && url === evidenceUrl) continue;
        const entry = files.find((e) => String(e?.comment_id) === String(comment.id) && typeof e?.url === "string" && e.url.toLowerCase() === url.toLowerCase());
        const bytes = entry?.file ? loadEvidence(entry.file) : null;
        const where = `an image posted by the ${role} at ${comment.created_at}`;
        if (!bytes) {
          warn("E04", `${where} is not in the bundle, so it was not checked; look at it yourself (M03)`);
          images.push({ role, url, created_at: comment.created_at, checked: false });
          continue;
        }
        const found = scanImage(bytes).findings.filter((f) => f.level !== "PASS");
        // Beside the evidence only a location fails the pilot; other metadata goes to M03.
        for (const f of found) (["GPS_PRESENT", "XMP_LOCATION"].includes(f.code) ? fail : warn)("E04", `${where}: ${f.detail}`);
        images.push({ role, url, created_at: comment.created_at, checked: true, sha256: sha256Hex(bytes), findings: found.map((f) => `${f.level} ${f.code}`) });
      }
      for (const ref of externalImages(comment.body)) {
        warn("E04", `an image from outside GitHub posted by the ${role} at ${comment.created_at} cannot be checked; look at it yourself (M03)`);
        images.push({ role, url: ref, created_at: comment.created_at, checked: false });
      }
    }
    if (evidenceUrl && results.get("E04").status === "NOT_REACHED" && results.get("E02").status !== "FAIL" && scan)
      pass("E04", images.length ? `evidence and ${images.length} other image(s): pixel and colour data only` : "pixel and colour data only");

    // ---- Result, decision, closure
    if (R.result_returned) {
      if (!R.evidence_submitted || time(R.result_returned) <= time(R.evidence_submitted)) fail("D01", "result_returned does not follow the evidence");
      else if (R.evidence_submitted.record.seq !== 8) fail("D01", "the returned result must refer to the evidence in seq 8");
      else pass("D01", `returned at ${R.result_returned.comment.created_at}`);
    }
    if (R.requester_decision) {
      const d = R.requester_decision.record;
      let digest = null;
      try {
        digest = ledgerDigest(pilotId, chain.slice(0, d.seq).map((e) => e.record));
      } catch {
        fail("D02", "a record before the decision cannot be hashed");
      }
      if (digest && digest !== d.ledger_digest) fail("D02", `ledger_digest should be ${digest}`);
      else if (digest) pass("D02", digest);
      const hours = R.request_submitted ? (time(R.requester_decision) - time(R.request_submitted)) / HOUR_MS : Infinity;
      if (hours > CYCLE_HOURS) fail("D03", `decision came ${hours.toFixed(1)} h after the request (limit ${CYCLE_HOURS} h)`);
      if (d.decision === "ACCEPTED") {
        const falseChecks = Object.entries(d.checks ?? {}).filter(([, v]) => v !== true).map(([k]) => k);
        if (falseChecks.length) fail("D03", `ACCEPTED with false checks: ${falseChecks.join(", ")}`);
      }
      if (results.get("D03").status !== "FAIL") pass("D03", `${d.decision} after ${hours.toFixed(2)} h`);
      const m = R.result_returned?.record.meku_check;
      if (m) {
        const negatives = ["code_visible", "object_visible", "no_personal_data_visible"].filter((k) => m[k] !== true);
        // A cycle cannot pass while MEKU itself reports a problem with the evidence.
        if (negatives.length && d.decision === "ACCEPTED") fail("D04", `MEKU reported false for ${negatives.join(", ")}, but the developer accepted`);
        else if (negatives.length) warn("D04", `MEKU reported false for ${negatives.join(", ")}`);
        else pass("D04");
      }
    }
    const stopBeforeClose = R.stop && (!R.pilot_closed || R.stop.record.seq < R.pilot_closed.record.seq);
    const outcomeWanted = stopBeforeClose ? "stopped" : R.requester_decision ? "completed" : R.request_reviewed?.record.decision === "rejected" ? "rejected_by_review" : null;
    if (R.pilot_closed) {
      if (R.pilot_closed.record.outcome !== outcomeWanted) fail("C01", `outcome ${R.pilot_closed.record.outcome} should be ${outcomeWanted}`);
      else pass("C01", `outcome ${outcomeWanted}; key revoked (attested)`);
    }
    const paymentProblems = chain.filter(({ record }) => Object.hasOwn(record, "payment") && record.payment !== "none");
    if (paymentProblems.length) fail("C02", `payment is not "none" in seq ${paymentProblems.map((e) => e.record.seq).join(", ")}`);
    else if (chain.length) pass("C02", 'every payment field is "none"; budget_text states no payment');

    // ---- Manual checks for a person looking at the photo.
    const object = R.object_revealed?.record.object;
    const suffix = str(R.object_revealed?.record.suffix);
    if (evidenceUrl) {
      manual.push(
        { id: "M01", check: `The photo shows the code ${code} followed by ${suffix}, written by hand (or physically formed), and it is legible` },
        { id: "M02", check: `The photo shows a ${str(object).toLowerCase()} next to the paper` },
        { id: "M03", check: `No person, face, screen, document, address, window view or other personal data is visible in the evidence${images.length ? ` or in the ${images.length} other image(s) listed above` : ""}` },
        { id: "M04", check: "It looks like a real paper-and-object arrangement, not a picture of a screen or a composite" },
      );
    }
    const humanExtra = uncounted.filter((u) => u.role === "human").length;
    const otherExtra = uncounted.length - humanExtra;
    if (humanLogin)
      manual.push({
        id: "M05",
        check: `Read every comment by the human that is not a counted record (${humanExtra}, printed in full above): none asks to stop or withdraws consent, in any language`,
      });
    manual.push({
      id: "M06",
      check: `Read every other participant comment that is not a counted record (${otherExtra}, printed in full above): none contradicts the counted records`,
    });
  }

  function finish() {
    const checks = [...results.values()];
    const records = chain.map((e) => e.record);
    const has = (t) => records.some((r) => r.type === t);
    const rejected = records.find((r) => r.type === "request_reviewed")?.decision === "rejected";
    const decision = records.find((r) => r.type === "requester_decision")?.decision;
    let verdict;
    if (checks.some((c) => c.status === "FAIL")) verdict = "FAIL";
    else if (rejected) verdict = has("pilot_closed") ? "REJECTED_BY_REVIEW" : "INCOMPLETE";
    else if (has("stop")) verdict = has("pilot_closed") ? "STOPPED" : "INCOMPLETE";
    else if (!decision) verdict = "INCOMPLETE";
    else if (decision === "REJECTED") verdict = has("pilot_closed") ? "COMPLETED_REJECTED" : "INCOMPLETE";
    else verdict = has("pilot_closed") ? "PASS" : "INCOMPLETE";
    let digest = null;
    try {
      digest = pilotId && records.length ? ledgerDigest(pilotId, records) : null;
    } catch {
      digest = null;
    }
    const allManual = (v) => v.manual_checks && Object.values(v.manual_checks).every((x) => x === true);
    return {
      format: "meku.pow-verification/2",
      verifier: VERIFIER_VERSION,
      protocol: PROTOCOL,
      pilot_id: pilotId,
      synthetic: isSyntheticPilot(pilotId),
      issue_url: issueUrl,
      protocol_url: protocolUrl,
      provenance: provenance ?? { exported_by_this_run: false, note: "This checks only the bundle file given. Export it yourself from the live issue (or use --from-issue) before relying on a PASS." },
      verdict,
      record_count: records.length,
      next_expected: verdict === "INCOMPLETE" ? allowedNext(records.at(-1) ?? null) : [],
      ledger_digest: digest,
      checks: checks.map(({ id, title, status, details }) => ({ id, title, status, details })),
      manual,
      independent_verifications: verifications.map((v) => ({ ...v, matches_this_ledger: v.pilot_id === pilotId && v.ledger_digest === digest, all_manual_checks_true: allManual(v) })),
      evidence: evidenceUrl
        ? { url: evidenceUrl, sha256: evidenceSha, media_type: scan?.mediaType ?? null, width: scan?.width ?? null, height: scan?.height ?? null, findings: scan?.findings ?? [] }
        : null,
      uncounted_comments: uncounted,
      other_images: images,
      comments_in_order: chain.map(({ record, comment }) => ({ seq: record.seq, type: record.type, comment_id: comment.id, author: comment.author, created_at: comment.created_at, html_url: comment.html_url ?? null })),
      records_in_order: records,
    };
  }
}

export function formatReport(result) {
  const lines = [];
  lines.push(`MEKU proof-of-work verification (${result.verifier}, protocol ${result.protocol})`);
  lines.push(`Ledger: ${result.issue_url ?? "unknown"}   Pilot: ${result.pilot_id ?? "unknown"}   Records: ${result.record_count}`);
  if (result.protocol_url) lines.push(`Protocol named by the ledger: ${result.protocol_url}`);
  lines.push(
    result.provenance?.exported_by_this_run
      ? `Source: exported from GitHub by this run at ${result.provenance.exported_at}`
      : "Source: a bundle file. This checks only that file; export it yourself from the live issue, or use --from-issue, before relying on a PASS.",
  );
  if (result.synthetic) lines.push("SYNTHETIC TEST DATA - NOT EVIDENCE OF ANY REAL WORK CYCLE");
  lines.push("");
  for (const c of result.checks) {
    lines.push(`${c.status.padEnd(11)} ${c.id}  ${c.title}`);
    for (const d of c.details) lines.push(`             - ${d}`);
  }
  if (result.uncounted_comments?.length) {
    lines.push("");
    lines.push("Participant comments that are not counted records, in full (read every one for M05 and M06):");
    for (const u of result.uncounted_comments) {
      lines.push(`  --- the ${u.role} at ${u.created_at}${u.edited ? " (EDITED)" : ""}: ${u.html_url ?? `comment ${u.comment_id}`} (${u.reason})`);
      for (const line of u.body.replace(/\r\n?/g, "\n").split("\n")) lines.push(`  | ${line}`);
    }
  }
  if (result.other_images?.length) {
    lines.push("");
    lines.push("Other images participants posted (look at every one for M03):");
    for (const i of result.other_images)
      lines.push(`  the ${i.role} at ${i.created_at}: ${i.url} ${i.checked ? `(checked: ${i.findings.length ? i.findings.join(", ") : "no metadata"})` : "(NOT CHECKED)"}`);
  }
  if (result.manual.length) {
    lines.push("");
    lines.push("Manual checks (look at the photo yourself; the tool cannot judge these):");
    for (const m of result.manual) lines.push(`MANUAL      ${m.id}  ${m.check}`);
  }
  if (result.independent_verifications.length) {
    const matching = result.independent_verifications.filter((v) => v.matches_this_ledger && v.all_manual_checks_true && v.verdict === "PASS");
    lines.push("");
    lines.push(`Independent verification comments: ${result.independent_verifications.length} found, ${matching.length} PASS with all manual checks true for this exact ledger digest`);
    for (const v of result.independent_verifications)
      lines.push(`  ${v.author} at ${v.created_at}: ${v.verdict}; digest ${v.matches_this_ledger ? "matches" : "DOES NOT MATCH"}; manual checks ${v.all_manual_checks_true ? "all true" : "not all true"}`);
  }
  lines.push("");
  if (result.ledger_digest) lines.push(`Ledger digest through seq ${result.record_count - 1}: ${result.ledger_digest}`);
  if (result.next_expected.length) lines.push(`Next expected record: ${result.next_expected.join(" or ")}`);
  const note = result.synthetic
    ? " [SYNTHETIC TEST DATA - NOT EVIDENCE OF ANY REAL WORK CYCLE]"
    : result.verdict === "PASS"
      ? " (automated checks; confirm M01-M06 yourself before calling the cycle verified)"
      : "";
  if (result.uncounted_comments?.length)
    lines.push(`READ FIRST: ${result.uncounted_comments.length} participant comment(s) printed above must be read (M05, M06) before anyone relies on this verdict.`);
  lines.push(`VERDICT: ${result.verdict}${note}`);
  // Everything printed passes through displaySafe, so record text cannot rewrite the terminal.
  return lines.map((line) => displaySafe(line)).join("\n");
}

/** Read a bundle file and a loader that only opens regular evidence files inside its folder. */
export function loadBundleFile(bundlePath) {
  return { bundle: JSON.parse(readFileSync(bundlePath, "utf8")), loadEvidence: loaderFor(bundlePath) };
}

function loaderFor(bundlePath) {
  const base = realpathSync(dirname(resolve(bundlePath)));
  return (file) => {
    if (typeof file !== "string" || !file || isAbsolute(file) || file.split(/[\\/]/).includes("..")) return null;
    const full = resolve(base, file);
    if (!full.startsWith(base + sep)) return null;
    try {
      // Resolve symlinks too, and read only regular files, at most one byte past the size cap.
      const real = realpathSync(full);
      if (!real.startsWith(base + sep) || !statSync(real).isFile()) return null;
      const fd = openSync(real, "r");
      try {
        const buffer = Buffer.alloc(Math.min(statSync(real).size, MAX_EVIDENCE_BYTES + 1));
        const length = readSync(fd, buffer, 0, buffer.length, 0);
        return buffer.subarray(0, length);
      } finally {
        closeSync(fd);
      }
    } catch {
      return null;
    }
  };
}

async function main(argv) {
  const args = [...argv];
  let usageError = false;
  const take = (flag) => {
    const i = args.indexOf(flag);
    if (i === -1) return undefined;
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) usageError = true;
    args.splice(i, 2);
    return value;
  };
  const jsonOut = take("--json");
  // Earlier exports (for example the developer's, made after each step) show deletions.
  const previousPaths = [];
  while (args.includes("--previous")) previousPaths.push(take("--previous"));
  const expectOperator = take("--expect-operator") ?? "mekusimeku";
  const fromIssue = take("--from-issue");
  const outDir = take("--out");
  const expectRepo = take("--expect-repo") ?? "mekusimeku/meku-si";
  if (fromIssue !== undefined && !isLedgerUrl(fromIssue)) usageError = true;
  const allowSynthetic = args.includes("--allow-synthetic");
  const positional = args.filter((a) => a !== "--allow-synthetic");
  if (usageError || (fromIssue ? positional.length !== 0 : positional.length !== 1) || positional.some((a) => a.startsWith("--"))) {
    console.error(
      "Usage: node tools/pow/verify.mjs --from-issue <ledger-issue-url> [--out dir] [--json result.json] [--previous earlier/bundle.json ...]\n" +
        "   or: node tools/pow/verify.mjs <bundle.json> [--json result.json] [--previous earlier/bundle.json ...] [--expect-operator login] [--expect-repo owner/repo] [--allow-synthetic]\n" +
        "Exit codes: 0 PASS from a live export, 5 PASS on a supplied file only, 1 FAIL, 2 other verdicts, 3 usage error, 4 could not complete",
    );
    return 3;
  }
  let bundlePath = positional[0];
  let provenance = null;
  if (fromIssue) {
    const { exportLedger } = await import("./export.mjs");
    const dir = outDir ?? join(mkdtempSync(join(tmpdir(), "pow-verify-")), "ledger");
    try {
      const exported = await exportLedger({ issueUrl: fromIssue, outDir: dir, token: process.env.GITHUB_TOKEN || undefined, expectOperator });
      provenance = { exported_by_this_run: true, exported_at: exported.source.exported_at, exporter: exported.source.exporter, folder: dir };
    } catch (error) {
      console.error(`Cannot export the ledger: ${error.message}`);
      return 4;
    }
    bundlePath = join(dir, "bundle.json");
  }
  let loaded;
  const earlierExports = [];
  try {
    loaded = loadBundleFile(bundlePath);
    for (const path of previousPaths) earlierExports.push(loadBundleFile(path).bundle);
  } catch (error) {
    console.error(`Cannot read bundle: ${error.message}`);
    return 4;
  }
  const result = verifyBundle(loaded.bundle, { loadEvidence: loaded.loadEvidence, expectOperator, expectRepo, allowSynthetic, provenance, earlierExports });
  if (jsonOut) {
    try {
      writeFileSync(jsonOut, `${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
      console.error(`Cannot write ${jsonOut}: ${error.message}. No verdict is given.`);
      return 4;
    }
  }
  console.log(formatReport(result));
  // A PASS counts only from a live export; on a supplied file it says only that the file passes.
  if (result.verdict === "PASS") return provenance?.exported_by_this_run ? 0 : 5;
  return result.verdict === "FAIL" ? 1 : 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await main(process.argv.slice(2));
