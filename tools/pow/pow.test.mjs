// Tests for the MEKU proof-of-work pilot tools. Offline: every MEKU answer comes from
// mock-meku-mcp.mjs and every ledger is SYNTHETIC. Run: node --test tools/pow/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUDGET_TEXT,
  CODE_ALPHABET,
  OBJECTS,
  buildRequestArguments,
  canonicalize,
  extractAttachmentUrls,
  extractRecords,
  generateCode,
  isValidCode,
  ledgerDigest,
  recordJsonSchema,
  recordProblems,
  requestArgumentProblems,
  requestIdCommitment,
  scanImage,
  sha256Hex,
} from "./lib.mjs";
import { verifyBundle, formatReport } from "./verify.mjs";
import { SYNTHETIC, buildSyntheticPilot, makeJpeg, makePng, pngChunk, tiffWithGps } from "./synthetic.mjs";
import { checkConnection, importStatus, importSubmission, keyKind, makeClient, manualReadyRecord, prepareRequest, recordComment, submitRequest } from "./request.mjs";
import { createMockMeku } from "./mock-meku-mcp.mjs";
import { consentRecord, evidenceRecord, stopRecord, closedRecord } from "./record.mjs";
import { exportLedger } from "./export.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

// Fail loudly if anything in the verifier tries to reach the network.
const realFetch = globalThis.fetch;
const noNetwork = async () => {
  throw new Error("network access attempted during an offline test");
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const check = (result, id) => result.checks.find((c) => c.id === id);
function verify(pilot, options = {}) {
  globalThis.fetch = noNetwork;
  try {
    return verifyBundle(pilot.bundle, { loadEvidence: pilot.loadEvidence, allowSynthetic: true, ...options });
  } finally {
    globalThis.fetch = realFetch;
  }
}
function commentIndexFor(bundle, seq) {
  return bundle.comments.findIndex((c) => extractRecords(c.body).some((f) => f.record?.seq === seq));
}
/** Replace the record with this seq, keeping the rest of the comment (e.g. the attachment). */
function rewrite(bundle, seq, change) {
  const i = commentIndexFor(bundle, seq);
  const record = extractRecords(bundle.comments[i].body)[0].record;
  change(record);
  bundle.comments[i].body = bundle.comments[i].body.replace(/```json[\s\S]*?```/, "```json\n" + JSON.stringify(record, null, 2) + "\n```");
  return record;
}
function shiftTime(bundle, seq, minutes) {
  const c = bundle.comments[commentIndexFor(bundle, seq)];
  const t = new Date(Date.parse(c.created_at) + minutes * 60_000).toISOString();
  c.created_at = t;
  c.updated_at = t;
}
const truncateAfter = (bundle, seq) => {
  bundle.comments = bundle.comments.slice(0, commentIndexFor(bundle, seq) + 1);
};
function appendRecord(bundle, author, record, minutesAfterLast = 10, extra = "") {
  const last = bundle.comments.at(-1);
  const t = new Date(Date.parse(last.created_at) + minutesAfterLast * 60_000).toISOString();
  bundle.comments.push({ id: last.id + 1, author, created_at: t, updated_at: t, html_url: `${SYNTHETIC.issueUrl}#x`, body: recordComment(record) + extra });
}
async function pilot() {
  return buildSyntheticPilot();
}

// ---- Canonical form, hashing, codes ----------------------------------------------

test("canonical JSON follows RFC 8785 for the allowed subset", () => {
  assert.equal(canonicalize({ b: 1, a: [true, null, "x"], c: { z: "é", y: -3 } }), '{"a":[true,null,"x"],"b":1,"c":{"y":-3,"z":"é"}}');
  assert.equal(canonicalize("line\nbreak\u0007"), '"line\\nbreak\\u0007"');
  assert.throws(() => canonicalize({ x: 1.5 }), /safe integers/);
  assert.throws(() => canonicalize("\ud800"), /well-formed/);
  assert.throws(() => canonicalize(new Date(0)), /plain objects/);
  // Fixed vector: a change here changes every published digest.
  assert.equal(sha256Hex(canonicalize({ pow: "meku.pow/1", seq: 0 })), sha256Hex('{"pow":"meku.pow/1","seq":0}'));
});

test("the request id commitment is lower-case insensitive and hides the id", () => {
  const id = "0A1B2C3D-0000-4000-8000-000000000000";
  assert.equal(requestIdCommitment(id), requestIdCommitment(id.toLowerCase()));
  assert.match(requestIdCommitment(id), /^[0-9a-f]{64}$/);
  assert.ok(!requestIdCommitment(id).includes("0a1b2c3d"));
  assert.throws(() => requestIdCommitment("not-an-id"));
});

test("codes use 40 random bits and the unambiguous Crockford alphabet", () => {
  assert.equal(generateCode(() => Buffer.from([0, 0, 0, 0, 0])), "00000000");
  assert.equal(generateCode(() => Buffer.from([255, 255, 255, 255, 255])), "ZZZZZZZZ");
  for (let i = 0; i < 200; i += 1) assert.ok(isValidCode(generateCode()));
  for (const bad of ["I", "L", "O", "U"]) assert.ok(!CODE_ALPHABET.includes(bad));
  assert.ok(!isValidCode("ABCDEFGI") && !isValidCode("ABC") && !isValidCode(12345678));
});

test("the request template fits MEKU's limits, so no text is silently cut", () => {
  const args = buildRequestArguments({ pilotId: "POW-001", code: "K7QX29MD", ledgerUrl: "https://github.com/mekusimeku/meku-si/issues/123" });
  assert.deepEqual(requestArgumentProblems(args), []);
  assert.equal(args.budget_text, BUDGET_TEXT);
  assert.equal(args.description.split("K7QX29MD").length - 1, 2);
  assert.ok(args.description.endsWith("https://github.com/mekusimeku/meku-si/issues/123"));
  assert.ok(args.description.length <= 2000 && args.title.length <= 120 && args.action.length <= 200);
  assert.equal(args.idempotencyKey, "POW-001.K7QX29MD");
  assert.ok(requestArgumentProblems({ ...args, title: " padded " }).some((p) => /whitespace/.test(p)));
  assert.ok(requestArgumentProblems({ ...args, description: "x".repeat(2001) }).some((p) => /20-2000/.test(p)));
  assert.ok(requestArgumentProblems({ ...args, travel_required: true }).length);
  assert.throws(() => buildRequestArguments({ pilotId: "POW-001", code: "K7QX29MD", ledgerUrl: "https://example.com/1" }), /GitHub issue/);
});

// ---- Schema ----------------------------------------------------------------------

test("records are strictly validated", () => {
  const consent = consentRecord({ pilotId: "POW-001" });
  assert.deepEqual(recordProblems(consent), []);
  assert.ok(recordProblems({ ...consent, extra: 1 }).some((p) => /not allowed/.test(p)));
  assert.ok(recordProblems({ ...consent, role: "operator" }).some((p) => /role/.test(p)));
  assert.ok(recordProblems({ ...consent, adult_18_plus: false }).some((p) => /adult_18_plus/.test(p)));
  assert.ok(recordProblems({ ...consent, consents: { ...consent.consents, may_reject_or_stop: false } }).length);
  assert.ok(recordProblems({ ...consent, seq: 1.5 }).length);
  assert.ok(recordProblems({ ...consent, pilot_id: "POW-1" }).length);
  assert.ok(recordProblems({ ...consent, type: "payment_sent" }).some((p) => /type must be/.test(p)));
  assert.ok(recordProblems(stopRecord({ pilotId: "POW-001", seq: 3, role: "human", reason: "Changed my mind" })).length === 0);
});

test("the published JSON Schema equals the schema generated from the code", () => {
  const committed = JSON.parse(readFileSync(join(here, "pow-record-v1.schema.json"), "utf8"));
  assert.deepEqual(committed, recordJsonSchema());
});

// ---- Image metadata ----------------------------------------------------------------

test("a clean PNG or JPEG passes; metadata, location and bad files fail", () => {
  assert.deepEqual(scanImage(makePng()).findings, []);
  assert.deepEqual(scanImage(makeJpeg()).findings, []);
  assert.equal(scanImage(makeJpeg({ width: 640, height: 480 })).width, 640);

  const gpsPng = scanImage(makePng(320, 240, [pngChunk("eXIf", tiffWithGps())]));
  assert.ok(gpsPng.findings.some((f) => f.code === "GPS_PRESENT" && f.level === "FAIL"));
  const gpsJpeg = scanImage(makeJpeg({ app: [[0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiffWithGps()])]] }));
  assert.ok(gpsJpeg.findings.some((f) => f.code === "GPS_PRESENT"));
  assert.ok(gpsJpeg.findings.some((f) => f.code === "EXIF_PRESENT"));

  const xmp = (text) => pngChunk("iTXt", Buffer.concat([Buffer.from("XML:com.adobe.xmp\0\0\0\0\0", "latin1"), Buffer.from(text)]));
  const screenshotXmp = scanImage(makePng(320, 240, [xmp('<x:xmpmeta><exif:UserComment>Screenshot</exif:UserComment></x:xmpmeta>')]));
  assert.deepEqual(screenshotXmp.findings.map((f) => [f.level, f.code]), [["WARN", "XMP_PRESENT"]]);
  const locatedXmp = scanImage(makePng(320, 240, [xmp("<exif:GPSLatitude>6,10.2S</exif:GPSLatitude>")]));
  assert.ok(locatedXmp.findings.some((f) => f.code === "XMP_LOCATION" && f.level === "FAIL"));
  const jpegXmp = scanImage(makeJpeg({ app: [[0xe1, Buffer.from("http://ns.adobe.com/xap/1.0/\0<photoshop:City>X</photoshop:City>", "latin1")]] }));
  assert.ok(jpegXmp.findings.some((f) => f.code === "XMP_LOCATION"));
  assert.ok(scanImage(makeJpeg({ app: [[0xed, Buffer.from("Photoshop 3.0\0", "latin1")]] })).findings.some((f) => f.code === "IPTC_PRESENT"));

  assert.ok(scanImage(makePng(100, 100)).findings.some((f) => f.code === "TOO_SMALL"));
  assert.ok(scanImage(Buffer.from("GIF89a....")).findings.some((f) => f.code === "UNSUPPORTED_TYPE"));
  assert.ok(scanImage(makePng().subarray(0, 200)).findings.some((f) => f.code === "PNG_TRUNCATED"));
});

test("a bare pasted record (no backtick fences) is accepted, with an image after it", async () => {
  const consent = consentRecord({ pilotId: "POW-001" });
  const bare = `${JSON.stringify(consent, null, 2)}\n\n<img width="320" alt="x" src="${SYNTHETIC.attachmentUrl}" />`;
  assert.deepEqual(extractRecords(bare).map((f) => f.record), [consent]);
  assert.deepEqual(extractRecords("I agree! {not json} meku.pow/1")[0].error.length > 0, true);
  assert.deepEqual(extractRecords("just chatting {x: 1}"), []);
  // The human pastes bare JSON in the synthetic ledger: same verdict, same digest.
  const p = await pilot();
  const before = verify(p).ledger_digest;
  for (const seq of [6, 8]) {
    const c = p.bundle.comments[commentIndexFor(p.bundle, seq)];
    const record = extractRecords(c.body)[0].record;
    const attachment = seq === 8 ? `\n<img width="320" alt="screenshot" src="${SYNTHETIC.attachmentUrl}" />\n` : "";
    c.body = JSON.stringify(record, null, 2) + attachment;
  }
  const r = verify(p);
  assert.equal(r.verdict, "PASS");
  assert.equal(r.ledger_digest, before);
  const python = spawnSync("python3", ["--version"]);
  if (python.status === 0) {
    const dir = mkdtempSync(join(tmpdir(), "pow-bare-"));
    writeFileSync(join(dir, "bundle.json"), JSON.stringify(p.bundle));
    const out = execFileSync("python3", ["-I", join(here, "digest_reference.py"), join(dir, "bundle.json")], { encoding: "utf8" });
    assert.equal(out.split(" ")[0], before);
  }
});

test("attachment URLs and record blocks are extracted exactly", () => {
  const body = `x\n\`\`\`json\n{"pow":"meku.pow/1","seq":1}\n\`\`\`\n<img src="${SYNTHETIC.attachmentUrl}" />\n![a](${SYNTHETIC.attachmentUrl})\nhttps://evil.example/user-attachments/assets/00000000-0000-4000-8000-000000000001`;
  assert.deepEqual(extractAttachmentUrls(body), [SYNTHETIC.attachmentUrl]);
  assert.equal(extractRecords(body).length, 1);
  assert.equal(extractRecords("```json\n{not json meku.pow/1\n```")[0].error.length > 0, true);
  assert.equal(extractRecords("```json\n{\"pow\":\"other\"}\n```").length, 0);
});

// ---- End to end on the synthetic ledger ---------------------------------------------

test("the synthetic ledger passes every automated check and has a fixed digest", async () => {
  const p = await pilot();
  const r = verify(p);
  assert.equal(r.verdict, "PASS");
  assert.equal(r.synthetic, true);
  assert.deepEqual(r.checks.filter((c) => c.status !== "PASS").map((c) => c.id), []);
  assert.equal(r.manual.length, 4);
  assert.equal(r.record_count, 12);
  // Regression anchor: any change to records, hashing or the template changes this value.
  assert.equal(r.ledger_digest, "064e24e4ffe5171bfbba4239e2ab420e33492c33dc7e6ebfb6378de8e2a7d21c");
  assert.equal(r.ledger_digest, ledgerDigest(SYNTHETIC.pilotId, r.records_in_order));
  assert.match(formatReport(r), /SYNTHETIC TEST DATA - NOT EVIDENCE/);
});

test("synthetic data is refused as a real pilot", async () => {
  const p = await pilot();
  const r = verify(p, { allowSynthetic: false });
  assert.equal(r.verdict, "FAIL");
  assert.equal(check(r, "L03").status, "FAIL");
});

test("the independent Python digest matches the JavaScript verifier", async (t) => {
  const python = spawnSync("python3", ["--version"]);
  if (python.status !== 0) return t.skip("python3 not installed");
  const p = await pilot();
  const dir = mkdtempSync(join(tmpdir(), "pow-py-"));
  writeFileSync(join(dir, "bundle.json"), JSON.stringify(p.bundle));
  const out = execFileSync("python3", ["-I", join(here, "digest_reference.py"), join(dir, "bundle.json")], { encoding: "utf8" });
  assert.equal(out.split(" ")[0], verify(p).ledger_digest);
});

// ---- Planted faults: each must turn the verdict into FAIL at the named check ---------

const FAULTS = [
  ["L01 unknown bundle format", "L01", (b) => (b.format = "something/2")],
  ["L03 a record names another pilot", "L03", (b) => rewrite(b, 7, (r) => (r.pilot_id = "POW-SYNTHETIC-2"))],
  ["E03 evidence image too small", "E03", (b, p) => p.files.set(b.evidence_files[0].file, makePng(200, 150))],
  ["L05 edited record comment", "L05", (b) => (b.comments[commentIndexFor(b, 6)].updated_at = "2026-01-06T00:00:00.000Z")],
  ["L04 duplicate seq", "L04", (b) => b.comments.splice(commentIndexFor(b, 7), 0, { ...clone(b.comments[commentIndexFor(b, 6)]), id: 99 })],
  ["L06 reveal at the same second as consent", "L06", (b) => shiftTime(b, 7, -10)],
  ["L04 reveal posted before consent", "L04", (b) => shiftTime(b, 7, -15)],
  ["L02 payment field not none", "L02", (b) => rewrite(b, 2, (r) => (r.payment = "MEKU SI 10"))],
  ["L04 consent posted by an outsider", "L04", (b) => (b.comments[commentIndexFor(b, 6)].author = "someone-else")],
  ["R02 developer posts a human record", "R02", (b) => (b.comments[commentIndexFor(b, 8)].author = SYNTHETIC.developer)],
  ["R03 human is the developer", "R03", (b) => rewrite(b, 5, (r) => (r.human = SYNTHETIC.developer))],
  ["Q01 key cannot submit", "Q01", (b) => rewrite(b, 1, (r) => (r.tools_listed = ["meku_search_humans"]))],
  ["Q02 request asks for something extra", "Q02", (b) => rewrite(b, 2, (r) => (r.arguments.description += " Also send your home address."))],
  ["Q03 arguments hash mismatch", "Q03", (b) => rewrite(b, 2, (r) => (r.arguments_sha256 = "0".repeat(64)))],
  [
    "Q04 request created before the ledger opened (replayed)",
    "Q04",
    (b) => {
      const old = "2025-12-01T00:00:00.000Z";
      rewrite(b, 2, (r) => (r.response.created_at = old));
      rewrite(b, 4, (r) => {
        r.stored_request.created_at = old;
        r.stored_request_sha256 = sha256Hex(canonicalize(r.stored_request));
      });
    },
  ],
  ["Q05 operator reviews a different request", "Q05", (b) => rewrite(b, 3, (r) => (r.code = "11111111"))],
  ["Q05 operator returns a result for a different request", "Q05", (b) => rewrite(b, 9, (r) => (r.code = "22222222"))],
  ["Q05 developer's commitments disagree", "Q05", (b) => rewrite(b, 4, (r) => (r.request_id_sha256 = requestIdCommitment("11111111-1111-4111-8111-111111111111")))],
  [
    "Q06 MEKU stored a truncated description",
    "Q06",
    (b) =>
      rewrite(b, 4, (r) => {
        r.stored_request.description = r.stored_request.description.slice(0, 40);
        r.stored_request_sha256 = sha256Hex(canonicalize(r.stored_request));
      }),
  ],
  ["Q07 stored request hash mismatch", "Q07", (b) => rewrite(b, 4, (r) => (r.stored_request_sha256 = "f".repeat(64)))],
  [
    "H01 stored text shown to the human lacks the code",
    "H01",
    (b) =>
      rewrite(b, 4, (r) => {
        r.stored_request.description = r.stored_request.description.replaceAll(/Code: \w{8}|code \w{8}/g, "code removed");
        r.stored_request_sha256 = sha256Hex(canonicalize(r.stored_request));
      }),
  ],
  ["H03 object not on the list", "L02", (b) => rewrite(b, 7, (r) => (r.object = "KNIFE"))],
  ["H04 evidence 49 hours after the reveal", "H04", (b) => ["8", "9", "10", "11"].forEach((s) => shiftTime(b, Number(s), 49 * 60))],
  ["E01 two attachments", "E01", (b) => (b.comments[commentIndexFor(b, 8)].body += `\n![b](https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000002)`)],
  ["E02 evidence file swapped", "E02", (b, p) => p.files.set(b.evidence_files[0].file, makePng(320, 240, [pngChunk("tEXt", Buffer.from("x\0y"))]))],
  ["E04 evidence carries GPS", "E04", (b, p) => p.files.set(b.evidence_files[0].file, makePng(320, 240, [pngChunk("eXIf", tiffWithGps())]))],
  ["D02 decision digest wrong", "D02", (b) => rewrite(b, 10, (r) => (r.ledger_digest = "a".repeat(64)))],
  ["D03 ACCEPTED with a false check", "D03", (b) => rewrite(b, 10, (r) => (r.checks.object_matches = false))],
  ["D03 decision after 169 hours", "D03", (b) => ["10", "11"].forEach((s) => shiftTime(b, Number(s), 169 * 60))],
  ["C01 close outcome mismatch", "C01", (b) => rewrite(b, 11, (r) => (r.outcome = "stopped"))],
];

for (const [name, id, plant] of FAULTS) {
  test(`planted fault is caught: ${name}`, async () => {
    const p = await pilot();
    plant(p.bundle, p);
    const r = verify(p);
    assert.equal(r.verdict, "FAIL", `verdict for ${name}`);
    assert.equal(check(r, id).status, "FAIL", `${id} for ${name}: ${JSON.stringify(r.checks.filter((c) => c.status === "FAIL"))}`);
  });
}

test("a real-format pilot opened by an unexpected operator account fails R01", async () => {
  const p = await pilot();
  rewrite(p.bundle, 0, (r) => (r.pilot_id = "POW-001"));
  const r = verify(p, { allowSynthetic: false });
  assert.equal(check(r, "R01").status, "FAIL");
});

// ---- Legitimate non-pass outcomes ------------------------------------------------------

test("a human STOP after consent ends the cycle as STOPPED, not FAIL", async () => {
  const p = await pilot();
  truncateAfter(p.bundle, 6);
  appendRecord(p.bundle, SYNTHETIC.human, stopRecord({ pilotId: SYNTHETIC.pilotId, seq: 7, role: "human", reason: "I no longer want to take part" }));
  let r = verify(p);
  assert.equal(r.verdict, "INCOMPLETE");
  assert.deepEqual(r.next_expected, ["pilot_closed"]);
  appendRecord(p.bundle, SYNTHETIC.operator, closedRecord({ pilotId: SYNTHETIC.pilotId, seq: 8, outcome: "stopped", note: "Stopped by the human" }));
  r = verify(p);
  assert.equal(r.verdict, "STOPPED");
});

test("a rejected review ends as REJECTED_BY_REVIEW", async () => {
  const p = await pilot();
  truncateAfter(p.bundle, 3);
  rewrite(p.bundle, 3, (r) => (r.decision = "rejected"));
  appendRecord(p.bundle, SYNTHETIC.operator, closedRecord({ pilotId: SYNTHETIC.pilotId, seq: 4, outcome: "rejected_by_review" }));
  assert.equal(verify(p).verdict, "REJECTED_BY_REVIEW");
});

test("a developer REJECTED decision is a completed but rejected cycle", async () => {
  const p = await pilot();
  rewrite(p.bundle, 10, (r) => {
    r.decision = "REJECTED";
    r.checks.object_matches = false;
  });
  assert.equal(verify(p).verdict, "COMPLETED_REJECTED");
});

test("an unfinished ledger is INCOMPLETE and names the next record", async () => {
  const p = await pilot();
  truncateAfter(p.bundle, 5);
  const r = verify(p);
  assert.equal(r.verdict, "INCOMPLETE");
  assert.deepEqual(r.next_expected, ["human_consent", "stop"]);
});

test("outsider comments are ignored, and outside verifications are listed", async () => {
  const p = await pilot();
  appendRecord(p.bundle, "random-visitor", consentRecord({ pilotId: SYNTHETIC.pilotId }), 1);
  appendRecord(
    p.bundle,
    "outside-checker",
    {
      pow: "meku.pow/1",
      pilot_id: SYNTHETIC.pilotId,
      type: "independent_verification",
      role: "verifier",
      verdict: "PASS",
      ledger_digest: verify(p).ledger_digest,
      tool: "own reimplementation",
      manual_checks: { code_legible_and_matching: false, object_matching: false, no_personal_data_visible: true, physical_arrangement: false },
    },
    1,
  );
  const r = verify(p);
  assert.equal(r.verdict, "PASS");
  assert.equal(check(r, "L07").status, "WARN");
  assert.equal(r.independent_verifications.length, 1);
  assert.equal(r.independent_verifications[0].author, "outside-checker");
});

// ---- Hardening ----------------------------------------------------------------------------

test("a stranger's earlier fake pilot_opened cannot take over the ledger", async () => {
  const p = await pilot();
  const fake = clone(extractRecords(p.bundle.comments[0].body)[0].record);
  fake.roster = { operator: "attacker-x", developer: "attacker-y" };
  const t = new Date(Date.parse(p.bundle.comments[0].created_at) - 60_000).toISOString();
  p.bundle.comments.unshift({ id: 1, author: "attacker-x", created_at: t, updated_at: t, html_url: "#", body: recordComment(fake) });
  const r = verify(p, { expectOperator: SYNTHETIC.operator });
  assert.equal(r.verdict, "PASS");
  assert.equal(check(r, "L07").status, "WARN");
  assert.equal(check(r, "R01").details[0], `operator ${SYNTHETIC.operator}`);
});

test("terminal control or text-direction characters cannot spoof the printed report", async () => {
  const p = await pilot();
  rewrite(p.bundle, 1, (r) => (r.agent = "x\u001b[2J\u001b[1;1HVERDICT: PASS‮"));
  const r = verify(p);
  assert.equal(check(r, "L02").status, "FAIL");
  const printed = formatReport(r);
  assert.ok(!/[\u001b‮]/.test(printed), "no raw escape or override character reaches the terminal");
  // The bundle itself can also be hostile (author names, timestamps): those are escaped too.
  p.bundle.comments[1].author = "evil\u001b[31m";
  assert.ok(!/\u001b/.test(formatReport(verify(p))));
});

test("an evidence symlink pointing outside the bundle folder is never read", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pow-link-"));
  execFileSync(process.execPath, [join(here, "synthetic.mjs"), dir]);
  const bundle = JSON.parse(readFileSync(join(dir, "bundle.json"), "utf8"));
  const file = join(dir, bundle.evidence_files[0].file);
  const outside = join(mkdtempSync(join(tmpdir(), "pow-outside-")), "secret.png");
  writeFileSync(outside, readFileSync(file));
  const { rmSync, symlinkSync } = await import("node:fs");
  rmSync(file);
  try {
    symlinkSync(outside, file);
  } catch {
    return t.skip("symlinks not available");
  }
  const run = spawnSync(process.execPath, [join(here, "verify.mjs"), join(dir, "bundle.json"), "--allow-synthetic"], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /FAIL\s+E02/);
});

test("the MCP client refuses to follow redirects with the key", async () => {
  let seen;
  const client = makeClient({
    apiKey: SYNTHETIC.writableKey,
    fetchImpl: async (url, init) => {
      seen = init.redirect;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }), { status: 200 });
    },
  });
  await client.post("tools/list", {});
  assert.equal(seen, "error");
});

test("the exporter downloads only the roster human's evidence, never a stranger's", async () => {
  const p = await pilot();
  const strangerUrl = "https://github.com/user-attachments/assets/00000000-0000-4000-8000-0000000000ff";
  appendRecord(p.bundle, "stranger-z", evidenceRecord({ pilotId: SYNTHETIC.pilotId }), 1, `\n![x](${strangerUrl})\n`);
  const png = p.files.get(p.bundle.evidence_files[0].file);
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(String(url));
    if (String(url).startsWith("https://api.github.com/")) {
      const page = Number(new URL(url).searchParams.get("page"));
      const all = p.bundle.comments.map((c) => ({ id: c.id, user: { login: c.author }, created_at: c.created_at, updated_at: c.updated_at, html_url: c.html_url, body: c.body }));
      return new Response(JSON.stringify(page === 1 ? all : []), { status: 200 });
    }
    const response = new Response(png, { status: 200 });
    Object.defineProperty(response, "url", { value: "https://private-user-images.githubusercontent.com/1/x.png" });
    return response;
  };
  const out = join(mkdtempSync(join(tmpdir(), "pow-export-")), "ledger");
  const bundle = await exportLedger({ issueUrl: SYNTHETIC.issueUrl, outDir: out, fetchImpl });
  assert.deepEqual(bundle.evidence_files.map((e) => e.url), [SYNTHETIC.attachmentUrl]);
  assert.ok(!fetched.includes(strangerUrl));
});

// ---- Developer client against the mock ---------------------------------------------------

test("key shapes are classified without revealing the key", () => {
  assert.equal(keyKind(SYNTHETIC.writableKey), "writable");
  assert.equal(keyKind(SYNTHETIC.searchOnlyKey), "search-only");
  assert.equal(keyKind("meku_short"), "unrecognized");
  assert.equal(keyKind(""), "missing");
});

test("a search-only key sees no request tool, and submit needs the reviewed code typed back", async () => {
  const mock = createMockMeku({ keys: { [SYNTHETIC.searchOnlyKey]: { id: "k2", readOnly: true }, [SYNTHETIC.writableKey]: { id: "k1", readOnly: false } } });
  const readOnly = makeClient({ apiKey: SYNTHETIC.searchOnlyKey, fetchImpl: mock.fetchImpl });
  const { summary, record } = await checkConnection({ client: readOnly, apiKey: SYNTHETIC.searchOnlyKey, clientInfo: { name: "c", version: "1" }, agent: "a", affirmIndependence: false, pilotId: "POW-001" });
  assert.equal(summary.can_submit, false);
  assert.equal(summary.key_kind_by_shape, "search-only");
  assert.equal(record, null);
  const prepared = prepareRequest({ pilotId: "POW-001", ledgerUrl: "https://github.com/mekusimeku/meku-si/issues/7" });
  const writable = makeClient({ apiKey: SYNTHETIC.writableKey, fetchImpl: mock.fetchImpl });
  const before = mock.calls.length;
  await assert.rejects(submitRequest({ client: writable, prepared, confirm: "WRONGCOD" }), /--confirm/);
  assert.equal(mock.calls.length, before, "nothing is sent without the typed-back code");
  const { record: submitted } = await submitRequest({ client: writable, prepared, confirm: prepared.code });
  assert.equal(submitted.response.deduplicated, false);
  const again = await submitRequest({ client: writable, prepared, confirm: prepared.code });
  assert.equal(again.record.response.deduplicated, true, "same idempotency key returns the saved request");
  assert.equal(again.record.request_id_sha256, submitted.request_id_sha256);
});

test("the client sends the key only in the Authorization header and never retries", async () => {
  const mock = createMockMeku({ keys: {} });
  const client = makeClient({ apiKey: SYNTHETIC.writableKey, fetchImpl: mock.fetchImpl });
  await assert.rejects(client.post("tools/list", {}), /HTTP 401, JSON-RPC -32001 Invalid API key/);
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].headers.Authorization, `Bearer ${SYNTHETIC.writableKey}`);
  assert.ok(!JSON.stringify(mock.calls[0].body).includes(SYNTHETIC.writableKey));
  assert.throws(() => makeClient({ apiKey: SYNTHETIC.writableKey, endpoint: "http://meku.farm/api/public/mcp" }), /HTTPS/);
  assert.throws(() => makeClient({ apiKey: SYNTHETIC.writableKey, endpoint: "https://meku.farm/api/public/mcp?key=x" }), /query/);
});

test("records imported from another MCP host equal the records of the built-in client", async () => {
  const p = await pilot();
  const direct = extractRecords(p.bundle.comments[commentIndexFor(p.bundle, 2)].body)[0].record;
  const imported = importSubmission({ prepared: p.prepared, responseText: p.receipt.response_text, observedAt: direct.observed_at });
  assert.deepEqual(imported.record, direct);
  const statusDirect = extractRecords(p.bundle.comments[commentIndexFor(p.bundle, 4)].body)[0].record;
  const statusText = JSON.stringify({ request: { id: SYNTHETIC.requestId, ...statusDirect.stored_request } }, null, 2);
  const statusImported = importStatus({ receipt: p.receipt, responseText: statusText, observedAt: statusDirect.observed_at });
  assert.deepEqual(statusImported.record.stored_request, statusDirect.stored_request);
  assert.equal(statusImported.codeIntact, true);
  assert.throws(() => importSubmission({ prepared: p.prepared, responseText: "Request submitted!", observedAt: direct.observed_at }), /exactly/);
  const ready = manualReadyRecord({
    pilotId: "POW-001",
    clientInfo: { name: "Claude Code", version: "2.1.0" },
    agent: "Claude Opus in Claude Code, MCP server configured with a bearer header",
    server: { version: "1.0.0", protocolVersion: "2025-06-18" },
    tools: ["meku_search_humans", "meku_request_human", "meku_get_request_status"],
    affirmIndependence: true,
  });
  assert.deepEqual(recordProblems(ready), []);
  assert.throws(() => manualReadyRecord({ pilotId: "POW-001", clientInfo: {}, agent: "x", server: {}, tools: [], affirmIndependence: false }), /affirm/);
});

test("the protocol version header is sent after initialize", async () => {
  const p = await pilot();
  const listCall = p.mock.calls.find((c) => c.method === "tools/list");
  const initCall = p.mock.calls.find((c) => c.method === "initialize");
  assert.equal(initCall.headers["MCP-Protocol-Version"], undefined);
  assert.equal(listCall.headers["MCP-Protocol-Version"], "2025-06-18");
});

// ---- Exporter ---------------------------------------------------------------------------

test("export pages comments, downloads only evidence attachments, and never sends the token to them", async () => {
  const p = await pilot();
  const png = p.files.get(p.bundle.evidence_files[0].file);
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url: String(url), auth: init.headers?.Authorization });
    if (String(url).startsWith("https://api.github.com/")) {
      const page = Number(new URL(url).searchParams.get("page"));
      const all = p.bundle.comments.map((c) => ({ id: c.id, user: { login: c.author }, created_at: c.created_at, updated_at: c.updated_at, html_url: c.html_url, body: c.body }));
      return new Response(JSON.stringify(page === 1 ? all : []), { status: 200 });
    }
    const response = new Response(png, { status: 200, headers: { "content-type": "image/png" } });
    Object.defineProperty(response, "url", { value: "https://private-user-images.githubusercontent.com/1/x.png" });
    return response;
  };
  const out = join(mkdtempSync(join(tmpdir(), "pow-export-")), "ledger");
  const bundle = await exportLedger({ issueUrl: SYNTHETIC.issueUrl, outDir: out, fetchImpl, token: "ghp_test_token" });
  assert.equal(bundle.comments.length, 12);
  assert.equal(bundle.evidence_files.length, 1);
  assert.equal(bundle.evidence_files[0].sha256, sha256Hex(png));
  const attachmentCalls = seen.filter((s) => !s.url.startsWith("https://api.github.com/"));
  assert.equal(attachmentCalls.length, 1);
  assert.equal(attachmentCalls[0].auth, undefined);
  assert.ok(seen.filter((s) => s.url.startsWith("https://api.github.com/")).every((s) => s.auth === "Bearer ghp_test_token"));
  const r = verifyBundle(JSON.parse(readFileSync(join(out, "bundle.json"), "utf8")), { loadEvidence: (f) => readFileSync(join(out, f)), allowSynthetic: true });
  assert.equal(r.verdict, "PASS");
});

test("export refuses attachments redirected off GitHub", async () => {
  const p = await pilot();
  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://api.github.com/"))
      return new Response(JSON.stringify(p.bundle.comments.map((c) => ({ id: c.id, user: { login: c.author }, created_at: c.created_at, updated_at: c.updated_at, body: c.body }))), { status: 200 });
    const response = new Response("x", { status: 200 });
    Object.defineProperty(response, "url", { value: "https://evil.example/x.png" });
    return response;
  };
  const out = join(mkdtempSync(join(tmpdir(), "pow-export-")), "ledger");
  await assert.rejects(exportLedger({ issueUrl: SYNTHETIC.issueUrl, outDir: out, fetchImpl }), /unexpected host/);
});

// ---- CLIs --------------------------------------------------------------------------------

test("command-line tools: synthetic example, verify exit codes, schema, human records", () => {
  const dir = mkdtempSync(join(tmpdir(), "pow-cli-"));
  execFileSync(process.execPath, [join(here, "synthetic.mjs"), dir]);
  const ok = spawnSync(process.execPath, [join(here, "verify.mjs"), join(dir, "bundle.json"), "--allow-synthetic", "--json", join(dir, "result.json")], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /VERDICT: PASS \[SYNTHETIC TEST DATA/);
  assert.equal(JSON.parse(readFileSync(join(dir, "result.json"), "utf8")).verdict, "PASS");
  const refused = spawnSync(process.execPath, [join(here, "verify.mjs"), join(dir, "bundle.json")], { encoding: "utf8" });
  assert.equal(refused.status, 1);
  const usage = spawnSync(process.execPath, [join(here, "verify.mjs")], { encoding: "utf8" });
  assert.equal(usage.status, 3);
  // Path traversal in the bundle cannot read files outside its folder.
  const evil = JSON.parse(readFileSync(join(dir, "bundle.json"), "utf8"));
  evil.evidence_files[0].file = "../../../../etc/passwd";
  mkdirSync(join(dir, "evil"));
  writeFileSync(join(dir, "evil", "bundle.json"), JSON.stringify(evil));
  const traversal = spawnSync(process.execPath, [join(here, "verify.mjs"), join(dir, "evil", "bundle.json"), "--allow-synthetic"], { encoding: "utf8" });
  assert.equal(traversal.status, 1);
  assert.match(traversal.stdout, /FAIL\s+E02/);
  const schema = execFileSync(process.execPath, [join(here, "record.mjs"), "schema"], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(schema), recordJsonSchema());
  const consent = execFileSync(process.execPath, [join(here, "record.mjs"), "consent", "--pilot", "POW-001"], { encoding: "utf8" });
  assert.deepEqual(extractRecords(consent)[0].record, consentRecord({ pilotId: "POW-001" }));
  const evidence = execFileSync(process.execPath, [join(here, "record.mjs"), "evidence", "--pilot", "POW-001"], { encoding: "utf8" });
  assert.deepEqual(extractRecords(evidence)[0].record, evidenceRecord({ pilotId: "POW-001" }));
});

test("the object list holds only harmless household items", () => {
  assert.deepEqual([...OBJECTS], ["SPOON", "CUP", "PLATE", "BOWL", "SOCK", "TOWEL", "PEN", "SHOE"]);
});

void root;
