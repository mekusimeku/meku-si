#!/usr/bin/env node
// Builds MEKU proof-of-work ledger records (meku.pow/1) as ready-to-post GitHub comments.
// Records that depend on earlier ones are computed from an exported bundle, so nobody
// retypes hashes by hand. Prints to stdout only; posts nothing; needs no credentials.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  CYCLE_HOURS,
  EVIDENCE_HOURS_AFTER_REVEAL,
  MCP_ENDPOINT,
  OBJECTS,
  PROTOCOL,
  TASK_KIND,
  VARIANT,
  canonicalize,
  extractAttachmentUrls,
  extractRecords,
  isGithubLogin,
  isSyntheticPilot,
  ledgerDigest,
  recordJsonSchema,
  recordProblems,
  requestIdCommitment,
  scanImage,
  sha256Hex,
} from "./lib.mjs";
import { recordComment } from "./request.mjs";
import { loadBundleFile, verifyBundle } from "./verify.mjs";

const envelope = (pilotId, seq, type, role) => ({ pow: PROTOCOL, pilot_id: pilotId, ...(seq === null ? {} : { seq }), type, role });

function ensureValid(record) {
  const problems = recordProblems(record);
  if (problems.length) throw new Error(`record would be invalid: ${problems.join("; ")}`);
  return record;
}

export function openedRecord({ pilotId, operator, developer, protocolUrl }) {
  return ensureValid({
    ...envelope(pilotId, 0, "pilot_opened", "operator"),
    protocol: protocolUrl,
    mcp_endpoint: MCP_ENDPOINT,
    variant: VARIANT,
    roster: { operator, developer },
    task: {
      kind: TASK_KIND,
      code_alphabet: CODE_ALPHABET,
      code_length: CODE_LENGTH,
      objects: [...OBJECTS],
      evidence_hours_after_reveal: EVIDENCE_HOURS_AFTER_REVEAL,
      cycle_hours: CYCLE_HOURS,
    },
    payment: "none",
  });
}

export function reviewedRecord({ pilotId, code, decision, reviewerRole, note }) {
  return ensureValid({
    ...envelope(pilotId, 3, "request_reviewed", "operator"),
    code,
    decision,
    reviewer_role: reviewerRole,
    reviewer_is_key_issuer: false,
    ...(note ? { note } : {}),
  });
}

/** Ledger state from a bundle (a file path, or { bundle, loadEvidence } in memory),
 *  refusing to build on a ledger that already fails verification. */
function ledgerState(source) {
  const { bundle, loadEvidence } = typeof source === "string" ? loadBundleFile(source) : source;
  const result = verifyBundle(bundle, { loadEvidence, allowSynthetic: true, expectOperator: source?.expectOperator });
  if (result.verdict === "FAIL") {
    const failing = result.checks.filter((c) => c.status === "FAIL").map((c) => `${c.id}: ${c.details[0]}`);
    throw new Error(`the ledger already fails verification, so no record is built on it:\n  ${failing.join("\n  ")}`);
  }
  return { bundle, loadEvidence, result, records: result.records_in_order };
}

function requireLast(records, type) {
  const last = records.at(-1);
  if (last?.type !== type) throw new Error(`the ledger must end with ${type}; it ends with ${last?.type ?? "nothing"}`);
  return last;
}

const ledgerCode = (records) => records.find((r) => r.type === "request_submitted")?.code;

export function offeredRecord({ bundlePath, human, registered, channel }) {
  const { records } = ledgerState(bundlePath);
  const observed = requireLast(records, "request_status_observed");
  return ensureValid({
    ...envelope(observed.pilot_id, observed.seq + 1, "task_offered", "operator"),
    code: ledgerCode(records),
    human,
    human_is_registered_meku_human: registered,
    task_shown: "ledger-seq-4",
    channel,
    payment: "none",
  });
}

export function consentRecord({ pilotId }) {
  return ensureValid({
    ...envelope(pilotId, 6, "human_consent", "human"),
    consents: { voluntary_participation: true, may_reject_or_stop: true, responsible_for_safety: true, safety_checklist: true },
    adult_18_plus: true,
    unpaid_understood: true,
    publication: { photo_public: true, github_login_public: true },
    independence: { not_meku_staff_or_contractor: true, not_the_developer: true },
  });
}

export function evidenceRecord({ pilotId }) {
  return ensureValid({
    ...envelope(pilotId, 8, "evidence_submitted", "human"),
    statements: { code_physically_written: true, object_placed_after_reveal: true, no_people_or_personal_data: true, metadata_removed: true },
    evidence: "attached-in-this-comment",
  });
}

function evidenceFromLedger(bundle, loadEvidence, url) {
  const entry = (bundle.evidence_files ?? []).find((e) => e?.url === url);
  const bytes = entry ? loadEvidence(entry.file) : null;
  if (!bytes) throw new Error("the evidence file is not in the bundle; export it first with export.mjs");
  return { bytes, sha256: sha256Hex(bytes), scan: scanImage(bytes) };
}

export function returnedRecord({ bundlePath, codeVisible, objectVisible, noPersonalData, note }) {
  const { records } = ledgerState(bundlePath);
  const evidence = requireLast(records, "evidence_submitted");
  return ensureValid({
    ...envelope(evidence.pilot_id, evidence.seq + 1, "result_returned", "operator"),
    code: ledgerCode(records),
    evidence: "ledger-seq-8",
    meku_check: { code_visible: codeVisible, object_visible: objectVisible, no_personal_data_visible: noPersonalData },
    ...(note ? { note } : {}),
  });
}

export function decisionRecord({ bundlePath, accept, checks, reason }) {
  const { bundle, loadEvidence, records } = ledgerState(bundlePath);
  const returned = requireLast(records, "result_returned");
  const evidenceRecordIn = records.find((r) => r.type === "evidence_submitted");
  const wanted = canonicalize(evidenceRecordIn);
  const comment = bundle.comments.find((c) => extractRecords(c.body).some((f) => f.record && canonicalize(f.record) === wanted));
  const urls = extractAttachmentUrls(comment?.body);
  if (urls.length !== 1) throw new Error(`the evidence comment has ${urls.length} attachments; exactly one is required`);
  const file = evidenceFromLedger(bundle, loadEvidence, urls[0]);
  if (accept && Object.values(checks).some((v) => v !== true)) throw new Error("ACCEPTED requires every check to be true; otherwise use --reject");
  return ensureValid({
    ...envelope(returned.pilot_id, returned.seq + 1, "requester_decision", "developer"),
    decision: accept ? "ACCEPTED" : "REJECTED",
    checks,
    evidence_sha256: file.sha256,
    ledger_digest: ledgerDigest(returned.pilot_id, records),
    reason,
  });
}

export function closedRecord({ pilotId, seq, outcome, note }) {
  return ensureValid({ ...envelope(pilotId, seq, "pilot_closed", "operator"), key_revoked: true, outcome, ...(note ? { note } : {}) });
}

export function stopRecord({ pilotId, seq, role, reason }) {
  return ensureValid({ ...envelope(pilotId, seq, "stop", role), reason });
}

export function verificationRecord({ bundlePath, tool, manualChecks, notes, allowSynthetic = false }) {
  const { bundle, loadEvidence } = loadBundleFile(bundlePath);
  const result = verifyBundle(bundle, { loadEvidence, allowSynthetic });
  return ensureValid({
    ...envelope(result.pilot_id, null, "independent_verification", "verifier"),
    verdict: result.verdict,
    ledger_digest: result.ledger_digest,
    tool,
    manual_checks: manualChecks,
    ...(notes ? { notes } : {}),
  });
}

// ---- CLI ---------------------------------------------------------------------

const USAGE = `Usage: node tools/pow/record.mjs <command> [options]
  opened     --pilot POW-001 --operator <login> --developer <login> --protocol-url <url>
  reviewed   --pilot POW-001 --code <CODE> --decision approved|rejected --reviewer-role seek_reviewer|admin [--note "..."]
  offered    --bundle <bundle.json> --human <login> --registered yes|no --channel github|email|in_person|phone|message|other
  consent    --pilot POW-001                       (the human's record; identical for every pilot)
  evidence   --pilot POW-001                       (the human's record; attach the screenshot in the same comment)
  returned   --bundle <bundle.json> [--code-visible] [--object-visible] [--no-personal-data] [--note "..."]
  decision   --bundle <bundle.json> --accept|--reject --reason "..." [--code-visible] [--code-matches] [--object-visible] [--object-matches] [--no-personal-data]
  closed     --pilot POW-001 --seq <n> --outcome completed|stopped|rejected_by_review --key-revoked [--note "..."]
  stop       --pilot POW-001 --seq <n> --role developer|operator|human --reason "..."
  verification --bundle <bundle.json> --tool "<tool and version>" [--code-legible] [--object-matching] [--no-personal-data] [--physical] [--notes "..."]
  digest     --bundle <bundle.json>                (ledger digest over every record in the bundle)
  request-id-sha256 <uuid>
  hash-file  <path>
  schema                                           (JSON Schema for every record type)`;

function main(argv) {
  const [command, ...rest] = argv;
  const opt = (name) => {
    const i = rest.indexOf(`--${name}`);
    return i === -1 ? undefined : rest[i + 1];
  };
  const flag = (name) => rest.includes(`--${name}`);
  const pilotId = opt("pilot") ?? "POW-001";
  const need = (name) => {
    const value = opt(name);
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} is required`);
    return value;
  };
  const login = (name) => {
    const value = need(name);
    if (!isGithubLogin(value, { synthetic: isSyntheticPilot(pilotId) })) throw new Error(`--${name} must be a GitHub login without @`);
    return value;
  };
  const yesNo = (name) => {
    const value = need(name);
    if (value !== "yes" && value !== "no") throw new Error(`--${name} must be yes or no`);
    return value === "yes";
  };
  const print = (record) => console.log(recordComment(record));
  try {
    switch (command) {
      case "opened":
        print(openedRecord({ pilotId, operator: login("operator"), developer: login("developer"), protocolUrl: need("protocol-url") }));
        return 0;
      case "reviewed":
        print(reviewedRecord({ pilotId, code: need("code"), decision: need("decision"), reviewerRole: need("reviewer-role"), note: opt("note") }));
        return 0;
      case "offered":
        print(offeredRecord({ bundlePath: need("bundle"), human: login("human"), registered: yesNo("registered"), channel: need("channel") }));
        return 0;
      case "consent":
        print(consentRecord({ pilotId }));
        return 0;
      case "evidence":
        print(evidenceRecord({ pilotId }));
        return 0;
      case "returned":
        print(
          returnedRecord({
            bundlePath: need("bundle"),
            codeVisible: flag("code-visible"),
            objectVisible: flag("object-visible"),
            noPersonalData: flag("no-personal-data"),
            note: opt("note"),
          }),
        );
        return 0;
      case "decision": {
        if (flag("accept") === flag("reject")) throw new Error("choose exactly one of --accept or --reject");
        const checks = {
          code_visible: flag("code-visible"),
          code_matches: flag("code-matches"),
          object_visible: flag("object-visible"),
          object_matches: flag("object-matches"),
          no_personal_data_visible: flag("no-personal-data"),
        };
        print(decisionRecord({ bundlePath: need("bundle"), accept: flag("accept"), checks, reason: need("reason") }));
        return 0;
      }
      case "closed":
        if (!flag("key-revoked")) throw new Error("revoke the pilot key first, then pass --key-revoked");
        print(closedRecord({ pilotId, seq: Number(need("seq")), outcome: need("outcome"), note: opt("note") }));
        return 0;
      case "stop":
        print(stopRecord({ pilotId, seq: Number(need("seq")), role: need("role"), reason: need("reason") }));
        return 0;
      case "verification": {
        const manualChecks = {
          code_legible_and_matching: flag("code-legible"),
          object_matching: flag("object-matching"),
          no_personal_data_visible: flag("no-personal-data"),
          physical_arrangement: flag("physical"),
        };
        print(verificationRecord({ bundlePath: need("bundle"), tool: need("tool"), manualChecks, notes: opt("notes"), allowSynthetic: flag("allow-synthetic") }));
        return 0;
      }
      case "digest": {
        const { bundle, loadEvidence } = loadBundleFile(need("bundle"));
        const result = verifyBundle(bundle, { loadEvidence, allowSynthetic: true });
        console.log(`${result.ledger_digest} (through seq ${result.record_count - 1}; verifier verdict ${result.verdict})`);
        return 0;
      }
      case "request-id-sha256":
        console.log(requestIdCommitment(rest[0]));
        return 0;
      case "hash-file":
        console.log(sha256Hex(readFileSync(rest[0])));
        return 0;
      case "schema":
        console.log(JSON.stringify(recordJsonSchema(), null, 2));
        return 0;
      default:
        console.error(USAGE);
        return 3;
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
