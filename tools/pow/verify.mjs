#!/usr/bin/env node
// Offline verifier for a MEKU proof-of-work pilot ledger (meku.pow/1).
// Input: a bundle exported from the public GitHub issue (export.mjs) plus its evidence files.
// Output: one line per check (PASS, FAIL, WARN, MANUAL, NOT_REACHED) and a verdict.
// It makes no network calls and needs no credentials. Exit codes: 0 PASS, 1 FAIL,
// 2 any other verdict (INCOMPLETE, STOPPED, REJECTED_BY_REVIEW, COMPLETED_REJECTED), 3 usage error.

import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BUNDLE_FORMAT,
  CYCLE_HOURS,
  EVIDENCE_HOURS_AFTER_REVEAL,
  OBJECTS,
  PROTOCOL,
  buildRequestArguments,
  canonicalize,
  extractAttachmentUrls,
  extractRecords,
  isLedgerUrl,
  isSyntheticPilot,
  ledgerDigest,
  recordProblems,
  requestArgumentProblems,
  sameLogin,
  scanImage,
  sha256Hex,
} from "./lib.mjs";

export const VERIFIER_VERSION = "meku.pow-verify/1";
const HOUR_MS = 3_600_000;

// Which record may follow which. A stop may follow any record from developer_ready
// onward except a decision or a close; after a stop or a rejection only a close may follow.
function allowedNext(previous) {
  if (!previous) return ["pilot_opened"];
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
    case "stop":
      return ["pilot_closed"];
    default:
      return [];
  }
}

export const CHECKS = [
  ["L01", "Bundle format and source issue are valid"],
  ["L02", "Every MEKU record from a roster account parses and matches its schema"],
  ["L03", "All records carry one pilot id; synthetic data is never accepted as a real pilot"],
  ["L04", "Records follow the protocol order with contiguous seq numbers"],
  ["L05", "Record comments were never edited"],
  ["L06", "GitHub server timestamps strictly increase with seq"],
  ["L07", "Record-like comments from accounts outside the roster are ignored"],
  ["R01", "pilot_opened is posted by the expected MEKU operator account"],
  ["R02", "Every record is posted by the account that holds its role"],
  ["R03", "Developer, operator and human are three different accounts"],
  ["R04", "The request reviewer is attested not to be the key issuer"],
  ["Q01", "The developer's key could submit requests (meku_request_human listed by meku-human-cloud)"],
  ["Q02", "The request is exactly the protocol template for this code and ledger"],
  ["Q03", "arguments_sha256 matches the submitted arguments"],
  ["Q04", "MEKU answered the submission as a new request"],
  ["Q05", "The developer's commitment and the operator's code name one request throughout"],
  ["Q06", "MEKU stored the request unaltered and approved it"],
  ["Q07", "stored_request_sha256 matches the stored request"],
  ["H01", "The offer points the human to the stored request text, which holds the code"],
  ["H02", "The human consented from their own account after the offer"],
  ["H03", "The object was named by the developer after consent, from the protocol list"],
  ["H04", "Evidence was posted by the human after the object was named and within 48 hours"],
  ["E01", "The evidence comment carries exactly one GitHub attachment"],
  ["E02", "The attachment is in the bundle and its SHA-256 matches the developer's decision"],
  ["E03", "The file is a PNG or JPEG of usable size"],
  ["E04", "The file carries no EXIF, GPS, IPTC or location metadata"],
  ["D01", "MEKU returned the result after the evidence it refers to"],
  ["D02", "The developer's decision commits to the exact ledger through seq 9"],
  ["D03", "An ACCEPTED decision has every developer check true and lands within 168 hours"],
  ["D04", "MEKU's own check agrees with the developer's checks"],
  ["C01", "The pilot was closed with the key revoked and a matching outcome"],
  ["C02", "No record involves payment"],
];

export function verifyBundle(bundle, { loadEvidence = () => null, expectOperator = "mekusimeku", allowSynthetic = false } = {}) {
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
  const manual = [];
  const verifications = [];
  // Declared before any early return, because finish() reports on them.
  const chain = []; // accepted records in seq order
  let pilotId = null;
  let evidenceUrl = null;
  let evidenceSha = null;
  let scan = null;

  // ---- L01: bundle shape
  const comments = Array.isArray(bundle?.comments) ? bundle.comments : null;
  const issueUrl = bundle?.source?.issue_url;
  if (bundle?.format !== BUNDLE_FORMAT) fail("L01", `format must be ${BUNDLE_FORMAT}`);
  if (!isLedgerUrl(issueUrl)) fail("L01", "source.issue_url must be a GitHub issue URL");
  if (!comments) fail("L01", "comments must be an array");
  if (results.get("L01").status === "FAIL") return finish();
  pass("L01", issueUrl);

  const commentOk = (c) =>
    c && typeof c.author === "string" && typeof c.body === "string" && !Number.isNaN(Date.parse(c.created_at)) && !Number.isNaN(Date.parse(c.updated_at));
  const ordered = comments
    .filter((c, i) => commentOk(c) || (fail("L01", `comment #${i} lacks author, body or timestamps`), false))
    .slice()
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || String(a.id).localeCompare(String(b.id)));

  // ---- Find pilot_opened to learn the roster.
  const found = [];
  for (const comment of ordered) for (const item of extractRecords(comment.body)) found.push({ comment, ...item });
  const opening = found.find((f) => f.record?.type === "pilot_opened" && f.record?.seq === 0);
  if (!opening) {
    fail("L04", "the ledger has no pilot_opened record with seq 0");
    return finish();
  }
  const roster = opening.record.roster ?? {};
  pilotId = opening.record.pilot_id;
  const synthetic = isSyntheticPilot(pilotId);
  if (synthetic && !allowSynthetic) fail("L03", `${pilotId} is synthetic test data, not a real pilot (use --allow-synthetic only for tests)`);
  if (!sameLogin(opening.comment.author, roster.operator)) fail("R01", `pilot_opened was posted by ${opening.comment.author}, not roster.operator ${roster.operator}`);
  else if (!synthetic && !sameLogin(roster.operator, expectOperator)) fail("R01", `roster.operator is ${roster.operator}, expected ${expectOperator}`);
  else pass("R01", `operator ${roster.operator}`);

  // Human login is learned from task_offered (posted by the operator).
  const offered = found.find((f) => f.record?.type === "task_offered" && sameLogin(f.comment.author, roster.operator));
  const humanLogin = offered?.record?.human;
  const roleOf = (author) => {
    if (sameLogin(author, roster.operator)) return "operator";
    if (sameLogin(author, roster.developer)) return "developer";
    if (humanLogin && sameLogin(author, humanLogin)) return "human";
    return null;
  };

  // ---- Classify every record-bearing comment.
  const sequenced = [];
  const perComment = new Map();
  for (const f of found) perComment.set(f.comment, (perComment.get(f.comment) ?? 0) + 1);
  for (const f of found) {
    const role = roleOf(f.comment.author);
    if (f.error || perComment.get(f.comment) > 1) {
      if (role) fail("L02", `${f.comment.html_url ?? f.comment.id}: ${f.error ?? "more than one record in one comment"}`);
      else warn("L07", `ignored malformed record-like comment by ${f.comment.author}`);
      continue;
    }
    const record = f.record;
    if (record.type === "independent_verification") {
      const problems = recordProblems(record);
      if (role) warn("L07", `independent_verification by roster account ${f.comment.author} ignored (not independent)`);
      else if (problems.length) warn("L07", `independent_verification by ${f.comment.author} ignored: ${problems[0]}`);
      else verifications.push({ author: f.comment.author, created_at: f.comment.created_at, verdict: record.verdict, ledger_digest: record.ledger_digest, tool: record.tool, manual_checks: record.manual_checks });
      continue;
    }
    if (!role) {
      warn("L07", `ignored ${record.type ?? "record"} posted by non-roster account ${f.comment.author}`);
      continue;
    }
    const problems = recordProblems(record);
    if (problems.length) fail("L02", `seq ${record.seq} ${record.type}: ${problems.join("; ")}`);
    if (record.role !== role) fail("R02", `seq ${record.seq} ${record.type} claims role ${record.role} but ${f.comment.author} is the ${role}`);
    sequenced.push({ record, comment: f.comment });
  }
  if (results.get("L02").status !== "FAIL") pass("L02", `${sequenced.length} records`);
  if (results.get("R02").status !== "FAIL") pass("R02");
  if (results.get("L07").status === "NOT_REACHED") pass("L07", "none found");

  // ---- L03 / L04 / L05 / L06: identity, order, edits, timestamps.
  for (const { record } of sequenced) if (record.pilot_id !== pilotId) fail("L03", `seq ${record.seq} has pilot_id ${record.pilot_id}`);
  if (results.get("L03").status !== "FAIL") pass("L03", pilotId);

  let previous = null;
  for (const entry of sequenced) {
    const { record } = entry;
    if (previous?.type === "pilot_closed") {
      fail("L04", `seq ${record.seq} ${record.type} appears after pilot_closed`);
      break;
    }
    const allowed = allowedNext(previous);
    if (record.seq !== chain.length) {
      fail("L04", `expected seq ${chain.length}, found seq ${record.seq} (${record.type})`);
      break;
    }
    if (!allowed.includes(record.type)) {
      fail("L04", `seq ${record.seq}: ${record.type} cannot follow ${previous?.type ?? "the start"} (allowed: ${allowed.join(", ")})`);
      break;
    }
    chain.push(entry);
    previous = record;
  }
  if (results.get("L04").status !== "FAIL") pass("L04", `${chain.length} records in order`);

  for (const { record, comment } of chain)
    if (comment.updated_at !== comment.created_at) fail("L05", `seq ${record.seq} comment was edited (${comment.created_at} -> ${comment.updated_at}); post a stop or correction instead`);
  if (results.get("L05").status !== "FAIL" && chain.length) pass("L05");

  for (let i = 1; i < chain.length; i += 1)
    if (Date.parse(chain[i].comment.created_at) <= Date.parse(chain[i - 1].comment.created_at))
      fail("L06", `seq ${i} is not later than seq ${i - 1}`);
  if (results.get("L06").status !== "FAIL" && chain.length) pass("L06");

  const at = (type) => chain.find((e) => e.record.type === type);
  const time = (entry) => Date.parse(entry.comment.created_at);
  const R = Object.fromEntries(
    ["developer_ready", "request_submitted", "request_reviewed", "request_status_observed", "task_offered", "human_consent", "object_revealed", "evidence_submitted", "result_returned", "requester_decision", "pilot_closed", "stop"].map((t) => [t, at(t)]),
  );

  // ---- R03 / R04
  const logins = [roster.operator, roster.developer, humanLogin].filter(Boolean).map((l) => l.toLowerCase());
  if (new Set(logins).size !== logins.length) fail("R03", `accounts are not distinct: ${logins.join(", ")}`);
  else if (logins.length === 3) pass("R03", logins.join(", "));
  if (R.request_reviewed) pass("R04", `reviewer role ${R.request_reviewed.record.reviewer_role}`);

  // ---- Request checks
  const code = R.request_submitted?.record.code;
  if (R.developer_ready) {
    const d = R.developer_ready.record;
    if (!Array.isArray(d.tools_listed) || !d.tools_listed.includes("meku_request_human")) fail("Q01", "tools_listed lacks meku_request_human: the key is search-only");
    else pass("Q01", `${d.client?.name} ${d.client?.version}; server ${d.server?.name} ${d.server?.version}, protocol ${d.server?.protocol_version}`);
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
      if (canonicalize(s.arguments ?? null) !== canonicalize(expected)) fail("Q02", "arguments differ from the protocol template (any extra request, field or wording is refused)");
      else {
        const problems = requestArgumentProblems(s.arguments);
        if (problems.length) fail("Q02", problems.join("; "));
        else pass("Q02", `code ${s.code}`);
      }
    }
    if (sha256Hex(canonicalize(s.arguments ?? null)) !== s.arguments_sha256) fail("Q03", "arguments_sha256 does not match");
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
    else pass("Q04", `created_at ${s.response.created_at}`);
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
    const stored = o.stored_request ?? {};
    const sent = s.arguments ?? {};
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
    const diffs = Object.keys(expectStored).filter((k) => canonicalize(stored[k] ?? null) !== canonicalize(expectStored[k] ?? null));
    if (diffs.length) fail("Q06", `stored request differs in: ${diffs.join(", ")}`);
    else pass("Q06", "stored text equals the submitted text; status approved");
    if (sha256Hex(canonicalize(stored)) !== o.stored_request_sha256) fail("Q07", "stored_request_sha256 does not match");
    else pass("Q07");
  }
  // ---- Human and consent
  if (R.task_offered && R.request_status_observed) {
    const description = R.request_status_observed.record.stored_request?.description ?? "";
    if (!code || !description.includes(code)) fail("H01", "the stored request text the human is pointed to does not contain the code");
    else pass("H01", `human ${humanLogin} pointed to the stored text in seq ${R.request_status_observed.record.seq}`);
  }
  if (R.human_consent && R.task_offered) {
    if (!sameLogin(R.human_consent.comment.author, humanLogin)) fail("H02", "consent was not posted by the offered human");
    else pass("H02", `consented at ${R.human_consent.comment.created_at}`);
  }
  if (R.object_revealed) {
    const object = R.object_revealed.record.object;
    if (!OBJECTS.includes(object)) fail("H03", `${object} is not on the protocol list`);
    else if (!R.human_consent || time(R.object_revealed) <= time(R.human_consent)) fail("H03", "the object was named before consent");
    else pass("H03", `object ${object}`);
  }
  if (R.evidence_submitted && R.object_revealed) {
    const hours = (time(R.evidence_submitted) - time(R.object_revealed)) / HOUR_MS;
    if (hours <= 0) fail("H04", "evidence predates the object reveal");
    else if (hours > EVIDENCE_HOURS_AFTER_REVEAL) fail("H04", `evidence came ${hours.toFixed(1)} h after the reveal (limit ${EVIDENCE_HOURS_AFTER_REVEAL} h)`);
    else pass("H04", `${hours.toFixed(2)} h after the reveal`);
  }

  // ---- Evidence
  if (R.evidence_submitted) {
    const urls = extractAttachmentUrls(R.evidence_submitted.comment.body);
    if (urls.length !== 1) fail("E01", `found ${urls.length} GitHub attachments; exactly one is required`);
    else {
      evidenceUrl = urls[0];
      pass("E01", evidenceUrl);
    }
  }
  if (evidenceUrl) {
    const entry = (bundle.evidence_files ?? []).find((e) => e?.url === evidenceUrl);
    const bytes = entry ? loadEvidence(entry.file) : null;
    if (!bytes) fail("E02", "the attachment is not in the bundle (run export.mjs to download it)");
    else {
      evidenceSha = sha256Hex(bytes);
      if (entry.sha256 && entry.sha256 !== evidenceSha) warn("E02", "bundle's recorded sha256 differs from the file; the file's own hash is used");
      const claimed = R.requester_decision?.record.evidence_sha256;
      if (claimed !== undefined && claimed !== evidenceSha) fail("E02", `file sha256 ${evidenceSha} differs from the developer's evidence_sha256`);
      else if (claimed !== undefined) pass("E02", `sha256 ${evidenceSha}`);
      scan = scanImage(bytes);
      const shapeFindings = scan.findings.filter((f) => ["UNSUPPORTED_TYPE", "TOO_LARGE", "NO_DIMENSIONS", "TOO_SMALL", "PNG_TRUNCATED", "JPEG_MALFORMED", "JPEG_TRUNCATED"].includes(f.code));
      for (const f of shapeFindings) fail("E03", f.detail);
      if (results.get("E03").status !== "FAIL") pass("E03", `${scan.mediaType} ${scan.width}x${scan.height}, ${bytes.length} bytes`);
      const metaFindings = scan.findings.filter((f) => !shapeFindings.includes(f));
      for (const f of metaFindings) (f.level === "FAIL" ? fail : warn)("E04", f.detail);
      if (results.get("E04").status === "NOT_REACHED") pass("E04", "no metadata found");
    }
  }

  // ---- Result, decision, closure
  if (R.result_returned) {
    if (!R.evidence_submitted || time(R.result_returned) <= time(R.evidence_submitted)) fail("D01", "result_returned does not follow the evidence");
    else if (R.evidence_submitted.record.seq !== 8) fail("D01", "the returned result must refer to the evidence in seq 8");
    else pass("D01", `returned at ${R.result_returned.comment.created_at}`);
  }
  if (R.requester_decision) {
    const d = R.requester_decision.record;
    const through = chain.slice(0, d.seq).map((e) => e.record);
    const digest = ledgerDigest(pilotId, through);
    if (digest !== d.ledger_digest) fail("D02", `ledger_digest should be ${digest}`);
    else pass("D02", digest);
    const hours = R.request_submitted ? (time(R.requester_decision) - time(R.request_submitted)) / HOUR_MS : Infinity;
    if (hours > CYCLE_HOURS) fail("D03", `decision came ${hours.toFixed(1)} h after the request (limit ${CYCLE_HOURS} h)`);
    if (d.decision === "ACCEPTED") {
      const falseChecks = Object.entries(d.checks ?? {}).filter(([, v]) => v !== true).map(([k]) => k);
      if (falseChecks.length) fail("D03", `ACCEPTED with false checks: ${falseChecks.join(", ")}`);
    }
    if (results.get("D03").status !== "FAIL") pass("D03", `${d.decision} after ${hours.toFixed(2)} h`);
    const m = R.result_returned?.record.meku_check;
    if (m) {
      const pairs = [
        ["code_visible", m.code_visible, d.checks?.code_visible],
        ["object_visible", m.object_visible, d.checks?.object_visible],
        ["no_personal_data_visible", m.no_personal_data_visible, d.checks?.no_personal_data_visible],
      ];
      const differ = pairs.filter(([, a, b]) => a !== b).map(([k]) => k);
      if (differ.length) warn("D04", `MEKU and the developer disagree on ${differ.join(", ")}`);
      else pass("D04");
    }
  }
  const outcomeWanted = R.requester_decision ? "completed" : R.stop ? "stopped" : R.request_reviewed?.record.decision === "rejected" ? "rejected_by_review" : null;
  if (R.pilot_closed) {
    if (R.pilot_closed.record.outcome !== outcomeWanted) fail("C01", `outcome ${R.pilot_closed.record.outcome} should be ${outcomeWanted}`);
    else pass("C01", `outcome ${outcomeWanted}; key revoked`);
  }
  const paymentProblems = chain.filter(({ record }) => Object.hasOwn(record, "payment") && record.payment !== "none");
  if (paymentProblems.length) fail("C02", `payment is not "none" in seq ${paymentProblems.map((e) => e.record.seq).join(", ")}`);
  else if (chain.length) pass("C02", 'every payment field is "none"; budget_text states no payment');

  // ---- Manual checks for a person looking at the photo.
  const object = R.object_revealed?.record.object;
  if (evidenceUrl) {
    manual.push(
      { id: "M01", check: `The photo shows the code ${code} written by hand (or physically formed), and it is legible` },
      { id: "M02", check: `The photo shows a ${object?.toLowerCase()} next to the paper` },
      { id: "M03", check: "No person, face, screen, document, address, window view or other personal data is visible" },
      { id: "M04", check: "It looks like a real paper-and-object arrangement, not a picture of a screen or a composite" },
    );
  }

  return finish();

  function finish() {
    const checks = [...results.values()];
    const failed = checks.some((c) => c.status === "FAIL");
    const has = (t) => chainHas(t);
    let verdict;
    if (failed) verdict = "FAIL";
    else if (has("request_reviewed") && rejected()) verdict = has("pilot_closed") ? "REJECTED_BY_REVIEW" : "INCOMPLETE";
    else if (has("stop")) verdict = has("pilot_closed") ? "STOPPED" : "INCOMPLETE";
    else if (!has("requester_decision")) verdict = "INCOMPLETE";
    else if (decision() === "REJECTED") verdict = has("pilot_closed") ? "COMPLETED_REJECTED" : "INCOMPLETE";
    else verdict = has("pilot_closed") ? "PASS" : "INCOMPLETE";
    const records = chainRecords();
    return {
      format: "meku.pow-verification/1",
      verifier: VERIFIER_VERSION,
      protocol: PROTOCOL,
      pilot_id: pilotId,
      synthetic: isSyntheticPilot(pilotId),
      issue_url: issueUrl ?? null,
      verdict,
      record_count: records.length,
      next_expected: verdict === "INCOMPLETE" ? allowedNext(records.at(-1) ?? null) : [],
      ledger_digest: pilotId && records.length ? ledgerDigest(pilotId, records) : null,
      checks: checks.map(({ id, title, status, details }) => ({ id, title, status, details })),
      manual,
      independent_verifications: verifications,
      evidence: evidenceSummary(),
      records_in_order: records,
    };
  }
  function chainRecords() {
    return chain.map((e) => e.record);
  }
  function evidenceSummary() {
    return evidenceUrl
      ? { url: evidenceUrl, sha256: evidenceSha, media_type: scan?.mediaType ?? null, width: scan?.width ?? null, height: scan?.height ?? null, findings: scan?.findings ?? [] }
      : null;
  }
  function chainHas(type) {
    return chainRecords().some((r) => r.type === type);
  }
  function rejected() {
    return chainRecords().find((r) => r.type === "request_reviewed")?.decision === "rejected";
  }
  function decision() {
    return chainRecords().find((r) => r.type === "requester_decision")?.decision;
  }
}

export function formatReport(result) {
  const lines = [];
  lines.push(`MEKU proof-of-work verification (${result.verifier}, protocol ${result.protocol})`);
  lines.push(`Ledger: ${result.issue_url ?? "unknown"}   Pilot: ${result.pilot_id ?? "unknown"}   Records: ${result.record_count}`);
  if (result.synthetic) lines.push("SYNTHETIC TEST DATA - NOT EVIDENCE OF ANY REAL WORK CYCLE");
  lines.push("");
  for (const c of result.checks) {
    lines.push(`${c.status.padEnd(11)} ${c.id}  ${c.title}`);
    for (const d of c.details) lines.push(`             - ${d}`);
  }
  if (result.manual.length) {
    lines.push("");
    lines.push("Manual checks (look at the photo yourself; the tool cannot judge these):");
    for (const m of result.manual) lines.push(`MANUAL      ${m.id}  ${m.check}`);
  }
  if (result.independent_verifications.length) {
    lines.push("");
    lines.push("Independent verification comments found (informational):");
    for (const v of result.independent_verifications) lines.push(`  ${v.author} at ${v.created_at}: ${v.verdict}, digest ${v.ledger_digest}`);
  }
  lines.push("");
  if (result.ledger_digest) lines.push(`Ledger digest through seq ${result.record_count - 1}: ${result.ledger_digest}`);
  if (result.next_expected.length) lines.push(`Next expected record: ${result.next_expected.join(" or ")}`);
  const note = result.synthetic
    ? " [SYNTHETIC TEST DATA - NOT EVIDENCE OF ANY REAL WORK CYCLE]"
    : result.verdict === "PASS"
      ? " (automated checks; confirm M01-M04 by eye before calling the cycle verified)"
      : "";
  lines.push(`VERDICT: ${result.verdict}${note}`);
  return lines.join("\n");
}

/** Read a bundle file and a loader that only opens evidence files inside the bundle's folder. */
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
      return readFileSync(full);
    } catch {
      return null;
    }
  };
}

function main(argv) {
  const args = [...argv];
  const take = (flag) => {
    const i = args.indexOf(flag);
    if (i === -1) return undefined;
    const value = args[i + 1];
    args.splice(i, 2);
    return value;
  };
  const jsonOut = take("--json");
  const expectOperator = take("--expect-operator") ?? "mekusimeku";
  const allowSynthetic = args.includes("--allow-synthetic");
  const positional = args.filter((a) => a !== "--allow-synthetic");
  if (positional.length !== 1 || positional[0].startsWith("--")) {
    console.error("Usage: node tools/pow/verify.mjs <bundle.json> [--json result.json] [--expect-operator login] [--allow-synthetic]");
    return 3;
  }
  let bundle;
  try {
    bundle = JSON.parse(readFileSync(positional[0], "utf8"));
  } catch (error) {
    console.error(`Cannot read bundle: ${error.message}`);
    return 3;
  }
  const result = verifyBundle(bundle, { loadEvidence: loaderFor(positional[0]), expectOperator, allowSynthetic });
  console.log(formatReport(result));
  if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(result, null, 2)}\n`);
  return result.verdict === "PASS" ? 0 : result.verdict === "FAIL" ? 1 : 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
