// Tests for the MEKU proof-of-work pilot tools. Offline: every MEKU answer comes from
// mock-meku-mcp.mjs and every ledger is SYNTHETIC. Run: node --test tools/pow/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
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
  isStopWord,
  readRecordComment,
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
import { SYNTHETIC, buildSyntheticPilot, makeIcc, makeJpeg, makePng, pngChunk, tiffWithGps } from "./synthetic.mjs";
import { checkConnection, importStatus, importSubmission, keyKind, makeClient, manualReadyRecord, postableComment, prepareRequest, recordComment, submitRequest } from "./request.mjs";
import { createMockMeku } from "./mock-meku-mcp.mjs";
import { commentReport, consentRecord, evidenceRecord, stopRecord, closedRecord } from "./record.mjs";
import { downloadAttachment, exportLedger, fetchComment } from "./export.mjs";

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
// Turns the synthetic ledger into a real-format one (POW-001, real-looking logins, a ledger in
// mekusimeku/meku-si), for checks that only apply to real pilots. Hashes no longer match.
function asRealPilot(bundle, { operator = "mekusimeku", developer = "example-dev", human = "example-human", issue = "https://github.com/mekusimeku/meku-si/issues/999", protocol } = {}) {
  const logins = new Map([
    [SYNTHETIC.operator, operator],
    [SYNTHETIC.developer, developer],
    [SYNTHETIC.human, human],
  ]);
  for (let seq = 0; seq < 12; seq += 1)
    rewrite(bundle, seq, (r) => {
      r.pilot_id = "POW-001";
      if (r.roster) Object.assign(r.roster, { operator, developer });
      if (r.type === "task_offered") r.human = human;
      if (r.type === "pilot_opened" && protocol) r.protocol = protocol;
    });
  for (const c of bundle.comments) if (logins.has(c.author)) c.author = logins.get(c.author);
  bundle.source.issue_url = issue;
  return bundle;
}

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
  assert.ok(scanImage(makeJpeg({ app: [[0xed, Buffer.from("Photoshop 3.0\0", "latin1")]] })).findings.some((f) => f.code === "JPEG_METADATA_SEGMENT"));

  assert.ok(scanImage(makePng(100, 100)).findings.some((f) => f.code === "TOO_SMALL"));
  assert.ok(scanImage(Buffer.from("GIF89a....")).findings.some((f) => f.code === "UNSUPPORTED_TYPE"));
  assert.ok(scanImage(makePng().subarray(0, 200)).findings.some((f) => f.code === "PNG_TRUNCATED"));
});

test("a bare pasted record (no backtick fences) is accepted; an image only beside the evidence", async () => {
  const consent = consentRecord({ pilotId: "POW-001" });
  assert.deepEqual(extractRecords(JSON.stringify(consent, null, 2)).map((f) => f.record), [consent]);
  const evidence = evidenceRecord({ pilotId: "POW-001" });
  const withImage = `${JSON.stringify(evidence, null, 2)}\n\n<img width="320" alt="x" src="${SYNTHETIC.attachmentUrl}" />`;
  assert.deepEqual(extractRecords(withImage).map((f) => [f.record, f.image]), [[evidence, SYNTHETIC.attachmentUrl]]);
  assert.match(extractRecords(`${JSON.stringify(consent)}\n![x](${SYNTHETIC.attachmentUrl})`)[0].error, /only beside|other than the evidence/);
  assert.match(extractRecords("I agree! {not json} meku.pow/1")[0].error, /text besides the record/, "prose is never parsed as a record");
  assert.ok(extractRecords("{not json} meku.pow/1")[0].error.length > 0);
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
  // Hidden attachments are found too, so that every image a participant posted is checked.
  assert.deepEqual(extractAttachmentUrls(`<!-- ${SYNTHETIC.attachmentUrl} -->`), [SYNTHETIC.attachmentUrl]);
  assert.match(extractRecords(body)[0].error, /text besides the record/, "a record with text around it is not counted");
  assert.equal(extractRecords("```json\n{\"pow\":\"meku.pow/1\",\"seq\":1}\n```")[0].record.seq, 1);
  assert.equal(extractRecords("```json\n{not json meku.pow/1\n```")[0].error.length > 0, true);
  assert.match(extractRecords("```json\n{\"pow\":\"other\"}\n```")[0].error, /without "pow"/);
});

// ---- End to end on the synthetic ledger ---------------------------------------------

test("the synthetic ledger passes every automated check and has a fixed digest", async () => {
  const p = await pilot();
  const r = verify(p);
  assert.equal(r.verdict, "PASS");
  assert.equal(r.synthetic, true);
  assert.deepEqual(r.checks.filter((c) => c.status !== "PASS").map((c) => c.id), []);
  assert.equal(r.manual.length, 6);
  assert.equal(r.record_count, 12);
  // Regression anchor: any change to records, hashing or the template changes this value.
  assert.equal(r.ledger_digest, "c3f808126b352a6f10ff72193fa84e0267ee5b61ffd79a6bbd7a3b1abe4cee7a");
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

test("an independent JSON Schema validator accepts every record and rejects tampered ones", async (t) => {
  const probe = spawnSync("python3", ["-I", "-c", "import jsonschema"]);
  if (probe.status !== 0) return t.skip("python3 with jsonschema not installed");
  const p = await pilot();
  const records = verify(p).records_in_order;
  const tampered = [
    { ...records[6], adult_18_plus: false },
    { ...records[1], agent: "x‮y" },
    { ...records[2], payment: "MEKU SI 10" },
    { ...records[7], object: "KNIFE" },
    { ...records[11], extra: true },
  ];
  const script = [
    "import json, sys, jsonschema",
    "schema = json.load(open(sys.argv[1]))",
    "jsonschema.Draft202012Validator.check_schema(schema)",
    "v = jsonschema.Draft202012Validator(schema)",
    "data = json.load(sys.stdin)",
    "print(json.dumps([[v.is_valid(r) for r in data['good']], [v.is_valid(r) for r in data['bad']]]))",
  ].join("\n");
  const run = spawnSync("python3", ["-I", "-c", script, join(here, "pow-record-v1.schema.json")], { input: JSON.stringify({ good: records, bad: tampered }), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const [good, bad] = JSON.parse(run.stdout);
  assert.deepEqual(good, records.map(() => true));
  assert.deepEqual(bad, tampered.map(() => false));
});

// ---- Planted faults: each must turn the verdict into FAIL at the named check ---------

const FAULTS = [
  ["L01 unknown bundle format", "L01", (b) => (b.format = "something/2")],
  ["L03 a record names another pilot", "L03", (b) => rewrite(b, 7, (r) => (r.pilot_id = "POW-SYNTHETIC-2"))],
  ["E03 evidence image too small", "E03", (b, p) => p.files.set(b.evidence_files[0].file, makePng(200, 150))],
  ["L05 edited record comment", "L05", (b) => (b.comments[commentIndexFor(b, 6)].updated_at = "2026-01-06T00:00:00.000Z")],
  [
    "L04 a second, different record with the same seq",
    "L04",
    (b) => {
      const i = commentIndexFor(b, 7);
      const copy = { ...clone(b.comments[i]), id: 99 };
      const t = new Date(Date.parse(copy.created_at) + 30_000).toISOString();
      Object.assign(copy, { created_at: t, updated_at: t });
      copy.body = copy.body.replace(/"salt": "[0-9a-f]{32}"/, `"salt": "${"0".repeat(32)}"`);
      b.comments.splice(i + 1, 0, copy);
    },
  ],
  ["L06 reveal at the same second as consent", "L06", (b) => shiftTime(b, 7, -10)],
  ["L04 reveal posted before consent: not counted, so the ledger cannot pass", "L04", (b) => shiftTime(b, 7, -15), "WARN"],
  ["L02 a payment field that is not none: not counted, so the ledger cannot pass", "L02", (b) => rewrite(b, 2, (r) => (r.payment = "MEKU SI 10")), "WARN"],
  ["L07 consent posted by an outsider: ignored, so the ledger cannot pass", "L07", (b) => (b.comments[commentIndexFor(b, 6)].author = "someone-else"), "WARN"],
  ["R02 developer posts a human record: not counted, so the ledger cannot pass", "R02", (b) => (b.comments[commentIndexFor(b, 8)].author = SYNTHETIC.developer), "WARN"],
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
  ["L02 object not on the list: not counted, so the ledger cannot pass", "L02", (b) => rewrite(b, 7, (r) => (r.object = "KNIFE")), "WARN"],
  ["H04 evidence 49 hours after the reveal", "H04", (b) => ["8", "9", "10", "11"].forEach((s) => shiftTime(b, Number(s), 49 * 60))],
  ["L02 two attachments: the evidence comment is not counted, so the ledger cannot pass", "L02", (b) => (b.comments[commentIndexFor(b, 8)].body += `\n![b](https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000002)`), "WARN"],
  ["E02 evidence file swapped", "E02", (b, p) => p.files.set(b.evidence_files[0].file, makePng(320, 240, [pngChunk("tEXt", Buffer.from("x\0y"))]))],
  ["E04 evidence carries GPS", "E04", (b, p) => p.files.set(b.evidence_files[0].file, makePng(320, 240, [pngChunk("eXIf", tiffWithGps())]))],
  ["D02 decision digest wrong", "D02", (b) => rewrite(b, 10, (r) => (r.ledger_digest = "a".repeat(64)))],
  ["D03 ACCEPTED with a false check", "D03", (b) => rewrite(b, 10, (r) => (r.checks.object_matches = false))],
  ["D03 decision after 169 hours", "D03", (b) => ["10", "11"].forEach((s) => shiftTime(b, Number(s), 169 * 60))],
  ["C01 close outcome mismatch", "C01", (b) => rewrite(b, 11, (r) => (r.outcome = "stopped"))],
];

for (const [name, id, plant, status = "FAIL"] of FAULTS) {
  test(`planted fault is caught: ${name}`, async () => {
    const p = await pilot();
    plant(p.bundle, p);
    const r = verify(p);
    // A fault in a record fails the ledger; a record that is not counted leaves it unfinished.
    assert.equal(r.verdict, status === "FAIL" ? "FAIL" : "INCOMPLETE", `verdict for ${name}`);
    assert.equal(check(r, id).status, status, `${id} for ${name}: ${JSON.stringify(r.checks.filter((c) => c.status !== "PASS" && c.status !== "NOT_REACHED"))}`);
  });
}

test("a real-format pilot opened by an unexpected operator account fails R01", async () => {
  const p = await pilot();
  asRealPilot(p.bundle, { operator: "not-meku" });
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
      manual_checks: { code_legible_and_matching: false, object_matching: false, no_personal_data_visible: true, physical_arrangement: false, human_did_not_withdraw: true, other_comments_consistent: true },
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
  assert.equal(check(r, "L02").status, "WARN", "the record is not counted");
  assert.notEqual(r.verdict, "PASS");
  const printed = formatReport(r);
  assert.match(printed, /\| .*\\u001b/, "the uncounted comment is printed in full, escaped");
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

test("export records an attachment redirected off GitHub as failed, without saving it", async () => {
  const p = await pilot();
  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://api.github.com/"))
      return new Response(JSON.stringify(p.bundle.comments.map((c) => ({ id: c.id, user: { login: c.author }, created_at: c.created_at, updated_at: c.updated_at, body: c.body }))), { status: 200 });
    const response = new Response("x", { status: 200 });
    Object.defineProperty(response, "url", { value: "https://evil.example/x.png" });
    return response;
  };
  const out = join(mkdtempSync(join(tmpdir(), "pow-export-")), "ledger");
  const bundle = await exportLedger({ issueUrl: SYNTHETIC.issueUrl, outDir: out, fetchImpl });
  assert.equal(bundle.evidence_files.length, 1);
  assert.equal(bundle.evidence_files[0].file, null);
  assert.match(bundle.evidence_files[0].error, /unexpected host/);
  const r = verifyBundle(bundle, { loadEvidence: () => null, allowSynthetic: true });
  assert.equal(check(r, "E02").status, "FAIL");
});

test("attachment downloads follow GitHub's redirects one hop at a time, refuse other hosts unasked, and time out plainly", async () => {
  const png = makePng();
  const start = "https://github.com/user-attachments/assets/0a9e8cc1-1f5e-48a9-9c88-c9b65e3ac842";
  // Where GitHub really sends a download without a session (seen on its own runners, 2026-11-28).
  const signed = "https://github-production-user-asset-6210df.s3.amazonaws.com/1/2.png?X-Amz-Signature=x";
  const asked = [];
  const steps = [];
  const github = async (url, init) => {
    asked.push(String(url));
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers.Authorization, undefined, "never a token");
    if (String(url) === start) return new Response(null, { status: 302, headers: { location: signed } });
    return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
  };
  const got = await downloadAttachment(start, { fetchImpl: github, onStep: (s) => steps.push(s) });
  assert.deepEqual(Buffer.from(got.bytes), Buffer.from(png));
  assert.deepEqual(asked, [start, signed]);
  assert.deepEqual(steps, ["asking github.com", "redirected to github-production-user-asset-6210df.s3.amazonaws.com"]);
  // So is a signed githubusercontent.com address.
  const viaUserContent = async (url) =>
    String(url) === start ? new Response(null, { status: 302, headers: { location: "https://private-user-images.githubusercontent.com/1/2.png?jwt=x" } }) : new Response(png, { status: 200 });
  assert.deepEqual(Buffer.from((await downloadAttachment(start, { fetchImpl: viaUserContent })).bytes), Buffer.from(png));
  // Any other bucket on S3 is refused, before it is contacted.
  const otherBucket = [];
  const bucket = async (url) => {
    otherBucket.push(String(url));
    return new Response(null, { status: 302, headers: { location: "https://someone-else.s3.amazonaws.com/x.png" } });
  };
  await assert.rejects(downloadAttachment(start, { fetchImpl: bucket }), /unexpected host: someone-else\.s3\.amazonaws\.com/);
  assert.deepEqual(otherBucket, [start]);
  // A hop off GitHub is refused before anything is sent to that host.
  const offsite = [];
  const evil = async (url) => {
    offsite.push(String(url));
    return new Response(null, { status: 302, headers: { location: "https://evil.example/x.png" } });
  };
  await assert.rejects(downloadAttachment(start, { fetchImpl: evil }), /unexpected host: evil\.example/);
  assert.deepEqual(offsite, [start]);
  // Endless redirects stop.
  const loop = async () => new Response(null, { status: 302, headers: { location: start } });
  await assert.rejects(downloadAttachment(start, { fetchImpl: loop }), /redirected more than 5 times/);
  // A network that never answers ends with the host and the step named, not a bare abort.
  // (A real socket keeps Node running while it waits; this stand-in holds a timer instead.)
  const silent = (url, init) =>
    new Promise((_, reject) => {
      const alive = setInterval(() => {}, 1000);
      init.signal.addEventListener("abort", () => {
        clearInterval(alive);
        reject(init.signal.reason);
      });
    });
  await assert.rejects(downloadAttachment(start, { fetchImpl: silent, timeoutMs: 50 }), /no complete answer from github\.com within 0 s while downloading the attachment/);
  await assert.rejects(fetchComment("https://github.com/mekusimeku/meku-si/pull/43#issuecomment-1", { fetchImpl: silent, timeoutMs: 50 }), /no complete answer from api\.github\.com within 0 s while reading the comment/);
  const refused = async () => {
    throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
  };
  await assert.rejects(downloadAttachment(start, { fetchImpl: refused }), /could not reach github\.com while downloading the attachment: ECONNREFUSED/);
  await assert.rejects(downloadAttachment(start, { fetchImpl: async () => new Response("no", { status: 403 }) }), /answered HTTP 403 \(github\.com\)/);
  // An answer that is not read is cancelled, so its open connection cannot keep the command
  // running after the error (which looked like a hang on the founder's laptop).
  const cancelled = [];
  const unread = (status, url) => {
    const response = new Response("body", { status });
    const original = response.body.cancel.bind(response.body);
    response.body.cancel = (...args) => {
      cancelled.push(status);
      return original(...args);
    };
    if (url) Object.defineProperty(response, "url", { value: url });
    return response;
  };
  await assert.rejects(downloadAttachment(start, { fetchImpl: async () => unread(404) }), /HTTP 404/);
  await assert.rejects(downloadAttachment(start, { fetchImpl: async () => unread(200, "https://evil.example/x.png") }), /unexpected host/);
  await assert.rejects(fetchComment("https://github.com/mekusimeku/meku-si/pull/43#issuecomment-1", { fetchImpl: async () => unread(500) }), /HTTP 500/);
  assert.deepEqual(cancelled, [404, 200, 500]);
  // A redirect answer is closed too, before the next hop.
  const hops = [];
  const closing = async (url) => {
    if (String(url) === start) {
      const response = new Response("moved", { status: 302, headers: { location: signed } });
      const original = response.body.cancel.bind(response.body);
      response.body.cancel = (...args) => {
        hops.push("closed");
        return original(...args);
      };
      return response;
    }
    hops.push("next hop");
    return new Response(png, { status: 200 });
  };
  await downloadAttachment(start, { fetchImpl: closing });
  assert.deepEqual(hops, ["closed", "next hop"]);
  // Every hop is plain HTTPS on the default port, and GitHub's bucket only straight after github.com.
  const via = (location) => async (url) => (String(url) === start ? new Response(null, { status: 302, headers: { location } }) : new Response(png, { status: 200 }));
  await assert.rejects(downloadAttachment(start, { fetchImpl: via("http://github-production-user-asset-6210df.s3.amazonaws.com/x.png") }), /not plain HTTPS/);
  await assert.rejects(downloadAttachment(start, { fetchImpl: via("https://github-production-user-asset-6210df.s3.amazonaws.com:8443/x.png") }), /not plain HTTPS/);
  const twoHops = async (url) =>
    String(url) === start
      ? new Response(null, { status: 302, headers: { location: "https://private-user-images.githubusercontent.com/1/2.png" } })
      : new Response(null, { status: 302, headers: { location: "https://github-production-user-asset-6210df.s3.amazonaws.com/x.png" } });
  await assert.rejects(downloadAttachment(start, { fetchImpl: twoHops }), /unexpected host: github-production-user-asset-6210df/);
  // The API is never followed through a redirect, so a token cannot leave api.github.com.
  let apiRedirect;
  await fetchComment("https://github.com/mekusimeku/meku-si/pull/43#issuecomment-1", {
    fetchImpl: async (url, init) => {
      apiRedirect = init.redirect;
      return new Response(JSON.stringify({ id: 1, user: { login: "x" }, body: "" }), { status: 200 });
    },
  });
  assert.equal(apiRedirect, "error");
});

// ---- CLIs --------------------------------------------------------------------------------

test("command-line tools: synthetic example, verify exit codes, schema, human records", () => {
  const dir = mkdtempSync(join(tmpdir(), "pow-cli-"));
  execFileSync(process.execPath, [join(here, "synthetic.mjs"), dir]);
  const ok = spawnSync(process.execPath, [join(here, "verify.mjs"), join(dir, "bundle.json"), "--allow-synthetic", "--json", join(dir, "result.json")], { encoding: "utf8" });
  assert.equal(ok.status, 5, `a PASS on a supplied file is exit 5, never 0: ${ok.stderr}`);
  assert.match(ok.stdout, /VERDICT: PASS \[SYNTHETIC TEST DATA/);
  assert.equal(JSON.parse(readFileSync(join(dir, "result.json"), "utf8")).verdict, "PASS");
  const refused = spawnSync(process.execPath, [join(here, "verify.mjs"), join(dir, "bundle.json")], { encoding: "utf8" });
  assert.equal(refused.status, 1);
  const usage = spawnSync(process.execPath, [join(here, "verify.mjs")], { encoding: "utf8" });
  assert.equal(usage.status, 3);
  const flagAsValue = spawnSync(process.execPath, [join(here, "verify.mjs"), "--json", "--allow-synthetic", join(dir, "bundle.json")], { encoding: "utf8" });
  assert.equal(flagAsValue.status, 3, "a flag is never taken as the --json file name");
  const badIssue = spawnSync(process.execPath, [join(here, "verify.mjs"), "--from-issue", "https://example.com/not-a-ledger"], { encoding: "utf8" });
  assert.equal(badIssue.status, 3, "a malformed ledger URL is a usage error, not a FAIL");
  const missing = spawnSync(process.execPath, [join(here, "verify.mjs"), join(dir, "nothing-here.json")], { encoding: "utf8" });
  assert.equal(missing.status, 4, "an unreadable bundle means the verification could not complete");
  const unwritable = spawnSync(process.execPath, [join(here, "verify.mjs"), join(dir, "bundle.json"), "--allow-synthetic", "--json", join(dir, "no", "such", "dir", "r.json")], { encoding: "utf8" });
  assert.equal(unwritable.status, 4);
  assert.doesNotMatch(unwritable.stdout, /VERDICT/, "no verdict is printed when the result cannot be saved");
  const png = join(dir, "test.png");
  writeFileSync(png, makePng());
  assert.equal(spawnSync(process.execPath, [join(here, "record.mjs"), "check-image", png]).status, 0);
  writeFileSync(png, makePng(320, 240, [pngChunk("eXIf", tiffWithGps())]));
  const bad = spawnSync(process.execPath, [join(here, "record.mjs"), "check-image", png], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /GPS_PRESENT/);
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
  assert.deepEqual(extractRecords(`${evidence}\n![Image](${SYNTHETIC.attachmentUrl})`)[0].record, evidenceRecord({ pilotId: "POW-001" }));
  assert.match(extractRecords(evidence)[0].error, /without its screenshot/, "the evidence never counts without its image");
});

test("the object list holds only harmless household items", () => {
  assert.deepEqual([...OBJECTS], ["SPOON", "CUP", "PLATE", "BOWL", "SOCK", "TOWEL", "PEN", "SHOE"]);
});

void root;

// ---- Findings of the independent review (2026-11-28), one test each ---------------------

const hostile = async () => {
  const p = await pilot();
  return p;
};

test("review F1: a comment that says only STOP blocks PASS until a stop record follows", async () => {
  const p = await hostile();
  appendRecordless(p.bundle, SYNTHETIC.human, "STOP", commentIndexFor(p.bundle, 8));
  let r = verify(p);
  assert.equal(r.verdict, "FAIL");
  assert.equal(check(r, "H05").status, "FAIL");
  // Recorded properly: the operator posts a stop right after it, then closes.
  const q = await hostile();
  truncateAfter(q.bundle, 8);
  appendRecordless(q.bundle, SYNTHETIC.human, "Stop!", q.bundle.comments.length - 1);
  appendRecord(q.bundle, SYNTHETIC.operator, stopRecord({ pilotId: SYNTHETIC.pilotId, seq: 9, role: "operator", reason: "The human asked to stop" }));
  appendRecord(q.bundle, SYNTHETIC.operator, closedRecord({ pilotId: SYNTHETIC.pilotId, seq: 10, outcome: "stopped" }));
  r = verify(q);
  assert.equal(r.verdict, "STOPPED");
  assert.equal(check(r, "H05").status, "PASS");
});

test("review N1: STOP in any listed language or form is recognised; other words go to manual review", async () => {
  for (const text of ["Berhenti", "ＳＴＯＰ", "s t o p", "🛑", "⛔️", "Arrête !", "停止", "Dừng", "Stop, stop!", "STOP\nSTOP", "หยุด", "रुको", "그만", "Batal", "> STOP", "```\nSTOP\n```", ":stop_sign:"]) {
    const p = await hostile();
    appendRecordless(p.bundle, SYNTHETIC.human, text, commentIndexFor(p.bundle, 8));
    assert.equal(check(verify(p), "H05").status, "FAIL", text);
  }
  for (const text of ["Can I stop at any time if I change my mind?", "I'm stopping here. I no longer want to take part.", "✋", "please stop", "Acha", "Para", "Pare", "Alto"]) {
    const p = await hostile();
    appendRecordless(p.bundle, SYNTHETIC.human, text, commentIndexFor(p.bundle, 5));
    const r = verify(p);
    assert.equal(check(r, "H05").status, "WARN", text);
    const listed = r.uncounted_comments.filter((u) => u.role === "human");
    assert.deepEqual(listed.map((u) => u.body), [text], "the comment is listed in full");
    assert.match(formatReport(r), /not counted records, in full/);
    assert.ok(r.manual.some((m) => m.id === "M05" && /\(1,/.test(m.check)));
  }
});

test("review N1d: STOP written inside the human's own record comment also counts", async () => {
  const p = await hostile();
  p.bundle.comments[commentIndexFor(p.bundle, 8)].body += "\nSTOP";
  assert.equal(check(verify(p), "H05").status, "FAIL");
});

test("review N8: an edited comment by the human fails, because it may have said STOP before", async () => {
  const p = await hostile();
  appendRecordless(p.bundle, SYNTHETIC.human, "Thanks, all done!", commentIndexFor(p.bundle, 8));
  const c = p.bundle.comments[commentIndexFor(p.bundle, 8) + 1];
  c.updated_at = new Date(Date.parse(c.created_at) + 60_000).toISOString();
  const r = verify(p);
  assert.equal(check(r, "H05").status, "FAIL");
  assert.match(check(r, "H05").details.join(" "), /was edited/);
  // The same holds for the human's record comments, whatever L05 says about them.
  const q = await hostile();
  const consent = q.bundle.comments[commentIndexFor(q.bundle, 6)];
  consent.updated_at = new Date(Date.parse(consent.created_at) + 60_000).toISOString();
  assert.equal(check(verify(q), "H05").status, "FAIL");
});

test("review F2b/F9: malformed participant data gives a FAIL report, never a crash", async () => {
  const p = await hostile();
  rewrite(p.bundle, 0, (r) => (r.roster.operator = 7));
  let r = verify(p);
  assert.equal(r.verdict, "FAIL");
  assert.ok(formatReport(r).includes("VERDICT: FAIL"));
  const q = await hostile();
  const i = commentIndexFor(q.bundle, 2);
  q.bundle.comments[i].body = q.bundle.comments[i].body.replace('"seq": 2', '"seq": 2.0');
  r = verify(q);
  assert.notEqual(r.verdict, "PASS");
  assert.equal(check(r, "L02").status, "WARN", "the malformed record is not counted, and listed");
  const z = await hostile();
  z.bundle.comments[commentIndexFor(z.bundle, 3)].body = recordComment({ pow: "meku.pow/1", pilot_id: ["POW-SYNTHETIC-1"], seq: 3, type: ["request_reviewed"], role: "operator" });
  r = verify(z);
  assert.notEqual(r.verdict, "PASS");
  assert.ok(formatReport(r).includes("VERDICT:"));
});

test("review F3: a record hidden in an HTML comment does not count", async () => {
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 10);
  p.bundle.comments[i].body = `I REJECT this result.\n<!--\n${p.bundle.comments[i].body}\n-->`;
  const r = verify(p);
  assert.notEqual(r.verdict, "PASS");
  assert.ok(!r.records_in_order.some((x) => x.type === "requester_decision"));
});

test("review F13: an image hosted elsewhere, or a second image under an upper-case host, fails E01", async () => {
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 8);
  const record = extractRecords(p.bundle.comments[i].body)[0].record;
  p.bundle.comments[i].body = `${recordComment(record)}\n![x](https://i.imgur.com/abc.png)\n<!-- ${SYNTHETIC.attachmentUrl} -->`;
  let r = verify(p);
  assert.notEqual(r.verdict, "PASS");
  assert.equal(check(r, "E01").status, "NOT_REACHED", "the evidence comment is not counted at all");
  assert.match(check(r, "E04").details.join(" "), /outside GitHub/, "the outside image is reported for M03");
  const q = await hostile();
  q.bundle.comments[commentIndexFor(q.bundle, 8)].body += "\n![b](https://GITHUB.COM/user-attachments/assets/00000000-0000-4000-8000-000000000002)";
  r = verify(q);
  assert.notEqual(r.verdict, "PASS");
  assert.match(check(r, "L02").details.join(" "), /evidence|not counted/);
});

test("review F4-F6b: the image check is an allow-list, including data after the end", () => {
  const codes = (bytes) => scanImage(bytes).findings.filter((f) => f.level === "FAIL").map((f) => f.code);
  const rawProfile = pngChunk("zTXt", Buffer.concat([Buffer.from("Raw profile type exif\0\0", "latin1"), Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])]));
  assert.ok(codes(makePng(320, 240, [rawProfile])).includes("PNG_METADATA_CHUNK"), "F4 text chunk");
  assert.ok(codes(makePng(320, 240, [pngChunk("caBX", Buffer.from("c2pa"))])).includes("PNG_METADATA_CHUNK"), "C2PA chunk");
  assert.ok(codes(makePng(320, 240, [pngChunk("tEXt", Buffer.from("Comment\0hi", "latin1"))])).includes("PNG_METADATA_CHUNK"));
  const afterIend = Buffer.concat([makePng(), pngChunk("eXIf", tiffWithGps())]);
  assert.ok(codes(afterIend).includes("DATA_AFTER_END"), "F6 data after IEND");
  const exifApp = [0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiffWithGps()])];
  const secondJpeg = Buffer.concat([makeJpeg(), makeJpeg({ app: [exifApp] })]);
  assert.ok(codes(secondJpeg).includes("DATA_AFTER_END"), "F5 second image after EOI");
  assert.ok(codes(makeJpeg({ app: [[0xfe, Buffer.from("GPS 6.1754S 106.8272E")]] })).includes("JPEG_METADATA_SEGMENT"), "F5b comment");
  assert.ok(codes(makeJpeg({ app: [[0xeb, Buffer.from("JP\0\0jumb")]] })).includes("JPEG_METADATA_SEGMENT"), "APP11 JUMBF/C2PA");
  assert.ok(codes(makeJpeg({ app: [[0xe2, Buffer.from("MPF\0data")]] })).includes("JPEG_METADATA_SEGMENT"), "APP2 MPF");
  // F6b: an EXIF segment placed after the start-of-scan data is still found.
  const plain = makeJpeg();
  const eoi = plain.length - 2;
  const exifSeg = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 0]), exifApp[1]]);
  exifSeg.writeUInt16BE(exifApp[1].length + 2, 2);
  const late = Buffer.concat([plain.subarray(0, eoi), exifSeg, plain.subarray(eoi)]);
  assert.ok(codes(late).includes("EXIF_PRESENT"), "F6b EXIF after SOS");
  // Allowed colour data stays clean.
  assert.deepEqual(codes(makePng(320, 240, [pngChunk("sRGB", Buffer.from([0])), pngChunk("pHYs", Buffer.alloc(9))])), []);
  const icc = Buffer.concat([Buffer.from("ICC_PROFILE\0\x01\x01", "latin1"), makeIcc()]);
  assert.deepEqual(codes(makeJpeg({ app: [[0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")], [0xe2, icc]] })), []);
});

test("review 3 P3-2: E04 checks what metadata says, not only its name", () => {
  const codes = (bytes) => scanImage(bytes).findings.filter((f) => f.level === "FAIL").map((f) => f.code);
  const xmp = (text) => pngChunk("iTXt", Buffer.concat([Buffer.from("XML:com.adobe.xmp\0\0\0\0\0", "latin1"), Buffer.from(text)]));
  const ios =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 6.0.0">\n <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n  <rdf:Description rdf:about=""\n    xmlns:exif="http://ns.adobe.com/exif/1.0/">\n   <exif:PixelYDimension>2532</exif:PixelYDimension>\n   <exif:PixelXDimension>1170</exif:PixelXDimension>\n   <exif:UserComment>Screenshot</exif:UserComment>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>';
  assert.deepEqual(codes(makePng(320, 240, [xmp(ios)])), []);
  assert.deepEqual(codes(makePng(320, 240, [xmp(`<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>${ios}<?xpacket end="w"?>`)])), [], "the packet wrapper is fine");
  for (const [name, text] of [
    ["an element without a prefix", ios.replace("</rdf:Description>", "<Author>Jane Doe</Author></rdf:Description>")],
    ["an XML comment", ios.replace("</rdf:RDF>", "<!-- Jane Doe, 12 Main St --></rdf:RDF>")],
    ["text in an allowed element", ios.replace(">2532<", ">Jane Doe<")],
    ["an attribute value", ios.replace('rdf:about=""', 'rdf:about="Jane"')],
    ["a CDATA section", ios.replace("Screenshot", "<![CDATA[Jane]]>")],
  ])
    assert.ok(codes(makePng(320, 240, [xmp(text)])).includes("XMP_FIELD"), name);
  // Colour profiles: only colour tags, inside the profile, without EXIF hidden in them.
  const iccp = (profile) => pngChunk("iCCP", Buffer.concat([Buffer.from("Display P3\0\0", "latin1"), deflateSync(profile)]));
  assert.deepEqual(codes(makePng(320, 240, [iccp(makeIcc())])), []);
  assert.ok(codes(makePng(320, 240, [iccp(makeIcc([["desc", Buffer.from("desc\0\0\0\0")], ["GPS ", Buffer.from("x")]]))])).includes("ICC_PROFILE"));
  const exifInside = makeIcc([["desc", Buffer.concat([Buffer.from("desc\0\0\0\0", "latin1"), Buffer.from("Exif\0\0", "latin1"), tiffWithGps()])]]);
  assert.ok(codes(makePng(320, 240, [iccp(exifInside)])).includes("ICC_PROFILE"));
  assert.ok(codes(makeJpeg({ app: [[0xe2, Buffer.concat([Buffer.from("ICC_PROFILE\0\x01\x01", "latin1"), exifInside])]] })).includes("ICC_PROFILE"));
  assert.ok(codes(makeJpeg({ app: [[0xee, Buffer.concat([Buffer.from("Adobe\0\x64\0\0\0\0\x01", "latin1"), Buffer.from("Exif\0\0hidden", "latin1")])]] })).includes("JPEG_METADATA_SEGMENT"));
  assert.deepEqual(codes(makeJpeg({ app: [[0xee, Buffer.from("Adobe\0\x64\0\0\0\0\x01", "latin1")]] })), []);
});

test("review F7: the decision hashes the human's image, not an outsider's copy of the record", async () => {
  const p = await hostile();
  truncateAfter(p.bundle, 9);
  // An outsider posts the identical evidence record with another image before the human did.
  const evidence = extractRecords(p.bundle.comments[commentIndexFor(p.bundle, 8)].body)[0].record;
  const other = makePng(320, 240);
  other[other.length - 20] ^= 1;
  const otherUrl = "https://github.com/user-attachments/assets/00000000-0000-4000-8000-0000000000aa";
  const t = new Date(Date.parse(p.bundle.comments[commentIndexFor(p.bundle, 8)].created_at) - 60_000).toISOString();
  p.bundle.comments.splice(commentIndexFor(p.bundle, 8), 0, { id: 2000, author: "copycat-x", created_at: t, updated_at: t, html_url: "#", body: recordComment(evidence) + `\n![x](${otherUrl})` });
  p.files.set("evidence/other.png", other);
  p.bundle.evidence_files.push({ comment_id: 2000, url: otherUrl, file: "evidence/other.png" });
  const { decisionRecord } = await import("./record.mjs");
  const checks = { code_visible: true, code_matches: true, object_visible: true, object_matches: true, no_personal_data_visible: true };
  const d = decisionRecord({ bundlePath: { bundle: p.bundle, loadEvidence: p.loadEvidence }, accept: true, checks, reason: "ok" });
  assert.equal(d.evidence_sha256, sha256Hex(p.files.get(p.bundle.evidence_files[0].file)));
});

test("review F10: MEKU reporting personal data blocks an ACCEPTED pass", async () => {
  const p = await hostile();
  rewrite(p.bundle, 9, (r) => (r.meku_check.no_personal_data_visible = false));
  const r = verify(p);
  assert.equal(r.verdict, "FAIL");
  assert.equal(check(r, "D04").status, "FAIL");
});

test("review F11: an outside verification is matched against this ledger's digest", async () => {
  const p = await hostile();
  appendRecord(p.bundle, "outside-checker", {
    pow: "meku.pow/1", pilot_id: "POW-SYNTHETIC-9", type: "independent_verification", role: "verifier", verdict: "PASS", ledger_digest: "0".repeat(64), tool: "x",
    manual_checks: { code_legible_and_matching: true, object_matching: true, no_personal_data_visible: true, physical_arrangement: true, human_did_not_withdraw: true, other_comments_consistent: true },
  }, 1);
  const r = verify(p);
  assert.equal(r.independent_verifications[0].matches_this_ledger, false);
  assert.match(formatReport(r), /0 PASS with all manual checks true for this exact ledger digest/);
});

test("review F12: fractional numbers are refused identically by JavaScript and Python", async (t) => {
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 1);
  p.bundle.comments[i].body = p.bundle.comments[i].body.replace('"seq": 1', '"seq": 1.0');
  assert.equal(check(verify(p), "L02").status, "WARN", "not counted");
  assert.notEqual(verify(p).verdict, "PASS");
  assert.throws(() => JSON.parse("{}") && extractRecords("```json\n{\"pow\":\"meku.pow/1\",\"x\":1e3}\n```")[0].record.x, TypeError);
  if (spawnSync("python3", ["--version"]).status !== 0) return t.skip("python3 not installed");
  const dir = mkdtempSync(join(tmpdir(), "pow-f12-"));
  writeFileSync(join(dir, "bundle.json"), JSON.stringify(p.bundle));
  const out = spawnSync("python3", ["-I", join(here, "digest_reference.py"), join(dir, "bundle.json")], { encoding: "utf8" });
  assert.equal(out.stdout.split(" ")[0], verify(p).ledger_digest, "Python also drops the malformed record, so both count only seq 0");
  assert.match(out.stdout, /through seq 0; 1 records/);
});

test("review 4 P3: with the verifier's invalid records set aside, the Python digest agrees after a repost", async (t) => {
  if (spawnSync("python3", ["--version"]).status !== 0) return t.skip("python3 not installed");
  // The operator types the code in lower case, which the schema refuses, then posts seq 3 again.
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 3);
  const good = p.bundle.comments[i];
  const record = extractRecords(good.body)[0].record;
  const bad = { ...clone(good), id: 4242, created_at: new Date(Date.parse(good.created_at) - 60_000).toISOString() };
  bad.updated_at = bad.created_at;
  bad.body = recordComment({ ...record, code: record.code.toLowerCase() });
  p.bundle.comments.splice(i, 0, bad);
  const r = verify(p);
  assert.equal(r.verdict, "PASS");
  const dir = mkdtempSync(join(tmpdir(), "pow-skip-"));
  writeFileSync(join(dir, "bundle.json"), JSON.stringify(p.bundle));
  const skip = r.uncounted_comments.map((u) => u.comment_id).join(",");
  const py = spawnSync("python3", ["-I", join(here, "digest_reference.py"), join(dir, "bundle.json"), "--skip", skip], { encoding: "utf8" });
  assert.equal(py.stdout.split(" ")[0], r.ledger_digest);
  const unskipped = spawnSync("python3", ["-I", join(here, "digest_reference.py"), join(dir, "bundle.json")], { encoding: "utf8" });
  assert.notEqual(unskipped.stdout.split(" ")[0], r.ledger_digest, "without --skip they visibly disagree, never falsely agree");
});

test("review F17: ordinary prose and Quote replies do not break a genuine ledger", async () => {
  const p = await hostile();
  appendRecordless(p.bundle, SYNTHETIC.operator, "Reminder (meku.pow/1): post your record {as shown in the guide}.", 0);
  const consent = p.bundle.comments[commentIndexFor(p.bundle, 6)];
  appendRecordless(p.bundle, SYNTHETIC.developer, consent.body.split("\n").map((l) => `> ${l}`).join("\n") + "\nThanks!", commentIndexFor(p.bundle, 6));
  const r = verify(p);
  assert.equal(r.verdict, "PASS", JSON.stringify(r.checks.filter((c) => c.status === "FAIL")));
});

test("review: an exact double post is a warning, not a failure", async () => {
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 6);
  const copy = { ...clone(p.bundle.comments[i]), id: 1500 };
  const t = new Date(Date.parse(copy.created_at) + 30_000).toISOString();
  copy.created_at = t;
  copy.updated_at = t;
  p.bundle.comments.splice(i + 1, 0, copy);
  const r = verify(p);
  assert.equal(r.verdict, "PASS");
  assert.equal(check(r, "L04").status, "WARN");
});

test("review F18: check spends one keyed call, so a 2-per-minute key works", async () => {
  const mock = createMockMeku({ keys: { [SYNTHETIC.writableKey]: { id: "k1", readOnly: false, perMinute: 2 } } });
  const client = makeClient({ apiKey: SYNTHETIC.writableKey, fetchImpl: mock.fetchImpl });
  const { summary } = await checkConnection({ client, apiKey: SYNTHETIC.writableKey, clientInfo: { name: "c", version: "1" }, agent: "a", affirmIndependence: false, pilotId: "POW-001" });
  assert.equal(summary.can_submit, true);
  assert.deepEqual(mock.calls.map((c) => [c.method, Boolean(c.headers.Authorization)]), [["initialize", false], ["notifications/initialized", false], ["tools/list", true]]);
  // The limit is real in the mock: two more keyed calls in the same minute hit 429.
  await client.post("tools/list", {});
  await assert.rejects(client.post("tools/list", {}), /HTTP 429.*Retry-After 41s; do not retry automatically/);
});

test("review C1: an edited request file is refused before anything is sent", async () => {
  const mock = createMockMeku({ keys: { [SYNTHETIC.writableKey]: { id: "k1", readOnly: false } } });
  const client = makeClient({ apiKey: SYNTHETIC.writableKey, fetchImpl: mock.fetchImpl });
  const prepared = prepareRequest({ pilotId: "POW-001", ledgerUrl: "https://github.com/mekusimeku/meku-si/issues/7" });
  const edited = clone(prepared);
  edited.arguments.description += " Also include your street address.";
  await assert.rejects(submitRequest({ client, prepared: edited, confirm: edited.code }), /differs from the protocol template/);
  const noSalt = { ...clone(prepared), object_salt: undefined };
  await assert.rejects(submitRequest({ client, prepared: noSalt, confirm: prepared.code }), /object salt/);
  assert.equal(mock.calls.length, 0);
  assert.throws(() => importSubmission({ prepared: edited, responseText: "{}", observedAt: "2026-01-01T00:00:00Z" }), /template/);
});

test("review: the mock refuses a reused idempotency key for a different task", async () => {
  const mock = createMockMeku({ keys: { [SYNTHETIC.writableKey]: { id: "k1", readOnly: false } } });
  const client = makeClient({ apiKey: SYNTHETIC.writableKey, fetchImpl: mock.fetchImpl });
  const prepared = prepareRequest({ pilotId: "POW-001", ledgerUrl: "https://github.com/mekusimeku/meku-si/issues/7" });
  await client.callTool("meku_request_human", prepared.arguments);
  await assert.rejects(client.callTool("meku_request_human", { ...prepared.arguments, title: "POW-001: something else entirely" }), /belongs to a different request/);
});

test("review: status prints no record when MEKU's stored text lost the code", async () => {
  const p = await hostile();
  p.mock.tamper(SYNTHETIC.requestId, "description", "Code removed by a bug");
  const client = makeClient({ apiKey: SYNTHETIC.writableKey, fetchImpl: p.mock.fetchImpl });
  const { readStatus } = await import("./request.mjs");
  const s = await readStatus({ client, receipt: p.receipt });
  assert.equal(s.codeIntact, false);
  assert.equal(s.record, null);
});

test("commit-reveal: the object cannot be chosen by the developer or predicted before consent", async () => {
  const p = await hostile();
  const reveal = extractRecords(p.bundle.comments[commentIndexFor(p.bundle, 7)].body)[0].record;
  const consentId = p.bundle.comments[commentIndexFor(p.bundle, 6)].id;
  assert.equal(reveal.consent_comment_id, consentId);
  const { objectFor, objectCommitment } = await import("./lib.mjs");
  assert.equal(reveal.object, objectFor(reveal.salt, consentId));
  const seq2 = extractRecords(p.bundle.comments[commentIndexFor(p.bundle, 2)].body)[0].record;
  assert.equal(seq2.object_commitment, objectCommitment(reveal.salt));
  for (const [name, change] of [
    ["another suffix", (r) => (r.suffix = r.suffix === "00" ? "11" : "00")],
    ["another object", (r) => (r.object = OBJECTS.find((o) => o !== r.object))],
    ["another salt", (r) => (r.salt = "f".repeat(32))],
    ["another comment id", (r) => (r.consent_comment_id += 1)],
  ]) {
    const q = await hostile();
    rewrite(q.bundle, 7, change);
    const r = verify(q);
    assert.equal(check(r, "H03").status, "FAIL", name);
  }
});

test("a report says where its bundle came from", async () => {
  const p = await hostile();
  assert.match(formatReport(verify(p)), /Source: a bundle file\. This checks only that file/);
  const r = verifyBundle(p.bundle, { loadEvidence: p.loadEvidence, allowSynthetic: true, provenance: { exported_by_this_run: true, exported_at: "2026-01-06T00:00:00Z" } });
  assert.match(formatReport(r), /Source: exported from GitHub by this run at 2026-01-06T00:00:00Z/);
});

function appendRecordless(bundle, author, text, afterIndex) {
  const before = bundle.comments[afterIndex];
  const nextTime = bundle.comments[afterIndex + 1] ? Date.parse(bundle.comments[afterIndex + 1].created_at) : Date.parse(before.created_at) + 120_000;
  const t = new Date((Date.parse(before.created_at) + nextTime) / 2).toISOString();
  bundle.comments.splice(afterIndex + 1, 0, { id: 5000 + afterIndex, author, created_at: t, updated_at: t, html_url: "#", body: text });
}

test("commit-reveal: a new salt with a consistently recomputed object still fails on the commitment", async () => {
  const p = await hostile();
  const { objectFor } = await import("./lib.mjs");
  rewrite(p.bundle, 7, (r) => {
    r.salt = "a".repeat(32);
    r.object = objectFor(r.salt, r.consent_comment_id);
  });
  const r = verify(p);
  assert.equal(check(r, "H03").status, "FAIL");
  assert.match(check(r, "H03").details[0], /object_commitment/);
});

test("E01: one GitHub attachment plus any other visible image or link fails", async () => {
  const p = await hostile();
  p.bundle.comments[commentIndexFor(p.bundle, 8)].body += "\n![decoy](https://i.imgur.com/decoy.png)";
  const r = verify(p);
  assert.notEqual(r.verdict, "PASS");
  assert.equal(check(r, "E01").status, "NOT_REACHED", "a second image means the comment is not the evidence record");
  assert.ok(r.uncounted_comments.some((u) => u.role === "human" && u.body.includes("decoy")), "and it is listed in full for M05");
});

test("a hostile in-memory bundle still yields a FAIL report instead of an exception", () => {
  const evil = {
    format: "meku.pow-bundle/1",
    source: { issue_url: SYNTHETIC.issueUrl },
    comments: [
      {
        get author() {
          throw new Error("boom");
        },
      },
    ],
  };
  const r = verifyBundle(evil, { allowSynthetic: true });
  assert.equal(r.verdict, "FAIL");
  assert.match(check(r, "L01").details.join(" "), /boom/);
});

// ---- Findings of the second independent review (2026-11-28) -----------------------------

test("review N2: an extra image via HTML entities or a relative link fails E01", async () => {
  for (const extra of [
    '<img src="&#104;ttps://i.imgur.com/x.png">',
    "![x](/user-attachments/assets/00000000-0000-4000-8000-0000000000bb)",
    "see &#104;ttps://example.com/x",
    "<!-- nothing visible -->",
    "> quoted words",
  ]) {
    const p = await hostile();
    p.bundle.comments[commentIndexFor(p.bundle, 8)].body += `\n${extra}\n`;
    const r = verify(p);
    assert.notEqual(r.verdict, "PASS", extra);
    assert.equal(check(r, "E01").status, "NOT_REACHED", `${extra}: anything besides the record and one image means the comment is not counted`);
  }
  // GitHub's real attachment markup passes.
  const q = await hostile();
  const i = commentIndexFor(q.bundle, 8);
  const record = extractRecords(q.bundle.comments[i].body)[0].record;
  q.bundle.comments[i].body = `${recordComment(record)}\n![Image](${SYNTHETIC.attachmentUrl})\n`;
  assert.equal(check(verify(q), "E01").status, "PASS");
});

test("review N3: JFXX thumbnails and XMP beyond screenshot fields fail; the inflate is capped", () => {
  const codes = (bytes) => scanImage(bytes).findings.filter((f) => f.level === "FAIL").map((f) => f.code);
  const thumb = makeJpeg({ app: [[0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiffWithGps()])]] });
  assert.ok(codes(makeJpeg({ app: [[0xe0, Buffer.concat([Buffer.from("JFXX\0\x10", "latin1"), thumb])]] })).includes("JPEG_METADATA_SEGMENT"));
  const xmp = (text, flag = 0) => pngChunk("iTXt", Buffer.concat([Buffer.from(`XML:com.adobe.xmp\0${String.fromCharCode(flag)}\0\0\0`, "latin1"), flag ? deflateSync(Buffer.from(text)) : Buffer.from(text)]));
  const screenshot =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 6.0.0"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/"><exif:PixelYDimension>2532</exif:PixelYDimension><exif:PixelXDimension>1170</exif:PixelXDimension><exif:UserComment>Screenshot</exif:UserComment></rdf:Description></rdf:RDF></x:xmpmeta>';
  assert.deepEqual(codes(makePng(320, 240, [xmp(screenshot)])), [], "a real iOS-style screenshot XMP is allowed");
  assert.ok(codes(makePng(320, 240, [xmp(screenshot.replace("</rdf:Description>", "<dc:creator>Jane Doe</dc:creator></rdf:Description>"))])).includes("XMP_FIELD"));
  assert.ok(codes(makePng(320, 240, [xmp(screenshot.replace("Screenshot", "Taken by Jane at home"))])).includes("XMP_FIELD"));
  assert.ok(codes(makePng(320, 240, [xmp('<x:xmpmeta aux:SerialNumber="12345"/>')])).includes("XMP_FIELD"));
  const bomb = makePng(320, 240, [xmp(" ".repeat(8 * 1024 * 1024), 1)]);
  const started = Date.now();
  assert.ok(codes(bomb).includes("PNG_METADATA_CHUNK"), "an oversized XMP is refused, not inflated");
  assert.ok(Date.now() - started < 3000);
  assert.deepEqual(scanImage(makePng(320, 240, [pngChunk("tIME", Buffer.alloc(7))])).findings.map((f) => f.level), ["WARN"]);
});

test("review N5: comment markers inside a code block are shown by GitHub and parsed as shown", async () => {
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 10);
  const record = extractRecords(p.bundle.comments[i].body)[0].record;
  // A decision whose displayed JSON says REJECTED, with an ACCEPTED copy hidden by a marker.
  const shown = { ...record, decision: "REJECTED", reason: "<!-- x" };
  p.bundle.comments[i].body = "```json\n" + JSON.stringify(shown, null, 2) + "\n```\n-->\n```json\n" + JSON.stringify(record, null, 2) + "\n```";
  const r = verify(p);
  assert.notEqual(r.verdict, "PASS");
  assert.equal(check(r, "L02").status, "WARN", "the decision comment is not counted");
  assert.ok(r.uncounted_comments.some((u) => u.role === "developer" && u.body.includes("REJECTED")), "and is printed in full for M06");
  // No record string may hold a comment marker or a fence, so this cannot be built at all.
  for (const agent of ["Claude <!-- beta", "Claude --> beta", "Claude ``` beta", "Claude ~~~ beta"]) {
    const rec = manualReadyRecord({ pilotId: "POW-001", clientInfo: { name: "c", version: "1" }, agent, server: { version: "1", protocolVersion: "1" }, tools: ["meku_request_human"], affirmIndependence: true });
    assert.match(recordProblems(rec).join(" "), /comment marker or code fence/, agent);
  }
});

test("review 3 P1-1: a record GitHub would not display as written is never counted", async () => {
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 10);
  const block = "```json\n" + JSON.stringify(extractRecords(p.bundle.comments[i].body)[0].record, null, 2) + "\n```";
  for (const body of [
    "I REJECT this result: wrong code.\n\n```x`\n<!--\n```\n" + block + "\n-->",
    `<div title="x">\n\n${block}\n\n</div>`,
    `<script>\n${block}\n</script>`,
    `<details><summary>ok</summary>\n\n${block}\n\n</details>`,
    `> ${block.split("\n").join("\n> ")}`,
    `MEKU proof-of-work record: seq 10 requester_decision (${SYNTHETIC.pilotId}) - x<script>\n${JSON.stringify(extractRecords(p.bundle.comments[i].body)[0].record)}`,
  ]) {
    const q = clone(p);
    q.bundle.comments[i].body = body;
    const r = verify(q);
    assert.notEqual(r.verdict, "PASS", body.slice(0, 40));
    assert.equal(readRecordComment(body).problem !== undefined, true, body.slice(0, 40));
    assert.ok(r.uncounted_comments.some((u) => u.body === body), "printed in full for a person");
  }
});

test("review R1/R2: an image before a bare record is fine; prose before it gets a hint", async () => {
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 8);
  const record = extractRecords(p.bundle.comments[i].body)[0].record;
  p.bundle.comments[i].body = `<img width="320" alt="Image" src="${SYNTHETIC.attachmentUrl}" />\n\n${JSON.stringify(record, null, 2)}`;
  assert.equal(verify(p).verdict, "PASS");
  p.bundle.comments[i].body = `MEKU proof-of-work record: seq 8 evidence_submitted (${SYNTHETIC.pilotId})\n\n${JSON.stringify(record, null, 2)}\n![Image](${SYNTHETIC.attachmentUrl})`;
  assert.equal(verify(p).verdict, "PASS", "under the header line the tools print");
  const q = await hostile();
  const j = commentIndexFor(q.bundle, 6);
  q.bundle.comments[j].body = `I agree!\n${JSON.stringify(extractRecords(q.bundle.comments[j].body)[0].record, null, 2)}`;
  const r = verify(q);
  assert.notEqual(r.verdict, "PASS");
  assert.match(check(r, "L02").details.join(" "), /not counted: text besides the record/);
  // The human can recover by posting the block alone in a new comment.
  truncateAfter(q.bundle, 5);
  q.bundle.comments.push({ ...q.bundle.comments.at(-1), id: 777, created_at: "2026-01-05T10:59:00.000Z", updated_at: "2026-01-05T10:59:00.000Z", author: SYNTHETIC.human, body: `I agree!\n${JSON.stringify(consentRecord({ pilotId: SYNTHETIC.pilotId }), null, 2)}` });
  appendRecord(q.bundle, SYNTHETIC.human, consentRecord({ pilotId: SYNTHETIC.pilotId }), 1);
  assert.equal(verify(q).record_count, 7, "the consent posted alone counts");
});

test("review N4/N7: JavaScript and Python agree on whitespace, seq types and bad text", async (t) => {
  if (spawnSync("python3", ["--version"]).status !== 0) return t.skip("python3 not installed");
  const outcome = (bundle) => {
    const dir = mkdtempSync(join(tmpdir(), "pow-parity-"));
    writeFileSync(join(dir, "bundle.json"), JSON.stringify(bundle));
    const py = spawnSync("python3", ["-I", join(here, "digest_reference.py"), join(dir, "bundle.json")], { encoding: "utf8" });
    const js = verifyBundle(bundle, { allowSynthetic: true, loadEvidence: () => null });
    // Both print the digest of whatever chain they count; a dropped record shortens both alike.
    return { py: py.status === 0 ? py.stdout.split(" ")[0] : null, js: js.ledger_digest ?? null };
  };
  for (const lead of ["﻿", "\u001C", "\u0085"]) {
    const p = await hostile();
    const i = commentIndexFor(p.bundle, 6);
    p.bundle.comments[i].body = lead + JSON.stringify(extractRecords(p.bundle.comments[i].body)[0].record);
    const o = outcome(p.bundle);
    assert.equal(o.js, o.py, `leading U+${lead.codePointAt(0).toString(16)}`);
  }
  const q = await hostile();
  q.bundle.comments[0].body = q.bundle.comments[0].body.replace('"seq": 0', '"seq": false');
  const o = outcome(q.bundle);
  assert.equal(o.js, o.py, "seq false");
  // A comment marker shown inside a plain code block hides nothing; a bare record with HTML is not read.
  for (const [name, body] of [
    ["marker in a code block", (r) => "```\n<!--\n```\n" + recordComment(r) + "\n-->"],
    ["bare record with HTML", (r) => JSON.stringify({ ...r, agent: `${r.agent}<b>x</b>` }, null, 2)],
    ["prose before the record", (r) => `I am ready\n${JSON.stringify(r, null, 2)}`],
    ["a quoted record", (r) => `> ${JSON.stringify(r)}`],
    ["a code block that is not json", (r) => "```js\n" + JSON.stringify(r, null, 2) + "\n```"],
    ["an image beside a record other than the evidence", (r) => `${JSON.stringify(r)}\n![x](${SYNTHETIC.attachmentUrl})`],
    ["a header with a digit from another script", (r) => `MEKU proof-of-work record: seq \u0661 developer_ready (${SYNTHETIC.pilotId})\n\n${JSON.stringify(r, null, 2)}`],
    ["a header label with HTML", (r) => `MEKU proof-of-work record: seq 1 developer_ready (${SYNTHETIC.pilotId}) - <b>x</b>\n\n${JSON.stringify(r, null, 2)}`],
    ["the record in another participant's role", (r) => recordComment({ ...r, role: "human" })],
  ]) {
    const b = await hostile();
    const j = commentIndexFor(b.bundle, 1);
    b.bundle.comments[j].body = body(extractRecords(b.bundle.comments[j].body)[0].record);
    const both = outcome(b.bundle);
    assert.equal(both.js, both.py, name);
  }
  const z = await hostile();
  const k = commentIndexFor(z.bundle, 1);
  z.bundle.comments[k].body = z.bundle.comments[k].body.replace('"agent": "', '"agent": "\\ud800');
  const dir = mkdtempSync(join(tmpdir(), "pow-sur-"));
  writeFileSync(join(dir, "bundle.json"), JSON.stringify(z.bundle));
  const py = spawnSync("python3", ["-I", join(here, "digest_reference.py"), join(dir, "bundle.json")], { encoding: "utf8" });
  assert.ok(!/Traceback/.test(py.stderr), "Python reports malformed text instead of crashing");
  assert.notEqual(verifyBundle(z.bundle, { allowSynthetic: true }).verdict, "PASS");
});

test("review: a real pilot's ledger must live in mekusimeku/meku-si", async () => {
  const p = await hostile();
  asRealPilot(p.bundle, { issue: "https://github.com/someone/elsewhere/issues/1" });
  const r = verify(p, { allowSynthetic: false });
  assert.equal(check(r, "L01").status, "FAIL");
  assert.match(check(r, "L01").details.join(" "), /must be an issue in mekusimeku\/meku-si/);
});

test("review: a bare record with HTML in it is not read, because GitHub would render the HTML", async () => {
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 1);
  const record = extractRecords(p.bundle.comments[i].body)[0].record;
  const bare = JSON.stringify({ ...record, agent: `${record.agent}<script>hidden on GitHub</script>` }, null, 2);
  assert.equal(recordProblems(JSON.parse(bare)).length, 0, "the record itself is valid");
  assert.equal(extractRecords("```json\n" + bare + "\n```").length, 1, "in a code block it is shown as written, so it is read");
  p.bundle.comments[i].body = bare;
  assert.match(extractRecords(p.bundle.comments[i].body)[0].error, /bare record containing "<"/);
  const r = verify(p);
  assert.notEqual(r.verdict, "PASS");
  assert.match(check(r, "L02").details.join(" "), /bare record containing "<"/);
});

test("review: a roster comment that hides text in an HTML comment is not counted, and is printed in full", async () => {
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 4);
  p.bundle.comments[i].body += "\n<!-- not shown on GitHub -->\n";
  const r = verify(p);
  assert.equal(check(r, "L02").status, "WARN");
  assert.ok(r.uncounted_comments.some((u) => u.body.includes("not shown on GitHub")));
  assert.match(formatReport(r), /\| <!-- not shown on GitHub -->/);
});

test("reveal only works from an exported ledger", () => {
  const out = spawnSync(process.execPath, [join(here, "request.mjs"), "reveal", "--request", join(here, "missing.json")], { encoding: "utf8" });
  assert.notEqual(out.status, 0);
  const dir = mkdtempSync(join(tmpdir(), "pow-reveal-"));
  writeFileSync(join(dir, "pow-request.json"), "{}");
  const noBundle = spawnSync(process.execPath, [join(here, "request.mjs"), "reveal", "--request", join(dir, "pow-request.json"), "--consent-comment-id", "5"], { encoding: "utf8" });
  assert.notEqual(noBundle.status, 0);
  assert.match(noBundle.stderr + noBundle.stdout, /reveal needs --bundle/);
});

test("check-image refuses a URL that is not a GitHub attachment, before any download", () => {
  const out = spawnSync(process.execPath, [join(here, "record.mjs"), "check-image", "https://example.com/a.png"], { encoding: "utf8" });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /not a GitHub attachment URL/);
});

// ---- Founder phone test support (2026-11-28) ----------------------------------------------

test("check-comment reports how the verifier reads one posted record", async () => {
  const t = "2026-11-28T00:00:00Z";
  const comment = (body, updated = t) => ({ id: 1, author: "mekusimeku", created_at: t, updated_at: updated, html_url: "#", body });
  const record = { pow: "meku.pow/1", pilot_id: "POW-001", seq: 3, type: "request_reviewed", role: "operator", code: "K7QX29MD", decision: "approved", reviewer_role: "seek_reviewer", reviewer_is_key_issuer: false, reviewer_same_person_as_key_issuer: false };
  const block = JSON.stringify(record, null, 2);
  assert.equal(commentReport(comment(block)).ok, true, "a bare block, as the copy button pastes it");
  assert.equal(commentReport(comment("```json\n" + block + "\n```")).ok, true);
  const curly = commentReport(comment(block.replace('"approved"', "“approved”")));
  assert.equal(curly.ok, false);
  assert.match(curly.problems.join(" "), /Smart Punctuation/);
  assert.match(commentReport(comment(block, "2026-11-28T00:05:00Z")).problems.join(" "), /edited/);
  assert.match(commentReport(comment(block + "\n<!-- x -->")).problems.join(" "), /would not count it/);
  assert.match(commentReport(comment("I approved it")).problems.join(" "), /finds no meku\.pow\/1 record/);
  assert.match(commentReport(comment("```json\n" + block + "\n```\n```json\n" + block + "\n```")).problems.join(" "), /would not count it/);
  assert.match(commentReport(comment(block.replace('"K7QX29MD"', '"K7QX29M"'))).problems.join(" "), /code/);
});

test("fetchComment reads one public comment and refuses anything but a comment link", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: 7, user: { login: "mekusimeku" }, created_at: "a", updated_at: "a", html_url: "h", body: "b" }), { status: 200 });
  };
  const c = await fetchComment("https://github.com/mekusimeku/meku-si/pull/43#issuecomment-7226380940", { fetchImpl });
  assert.equal(calls[0].url, "https://api.github.com/repos/mekusimeku/meku-si/issues/comments/7226380940");
  assert.equal(calls[0].init.headers.Authorization, undefined, "no token unless one is given");
  assert.deepEqual([c.author, c.body], ["mekusimeku", "b"]);
  await fetchComment("https://github.com/mekusimeku/meku-si/issues/1#issuecomment-2", { fetchImpl, token: "t" });
  assert.equal(calls[1].init.headers.Authorization, "Bearer t");
  for (const bad of ["https://evil.example/x#issuecomment-1", "https://github.com/a/b/issues/1", "https://github.com/a/b/issues/1#issuecomment-1x"])
    await assert.rejects(fetchComment(bad, { fetchImpl }), /Give a comment link/);
  assert.equal(calls.length, 2, "nothing is fetched for a bad link");
  const out = spawnSync(process.execPath, [join(here, "record.mjs"), "check-comment", "not-a-link"], { encoding: "utf8" });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /Give a comment link/);
});

test("a real pilot whose opening does not pin the protocol to a commit gets a warning", async () => {
  const warned = async (protocol) => {
    const p = await pilot();
    asRealPilot(p.bundle, { protocol });
    const r = verify(p, { allowSynthetic: false });
    return check(r, "L02").details.some((d) => /not pinned to a commit/.test(d));
  };
  assert.equal(await warned("https://github.com/mekusimeku/meku-si/blob/main/docs/proof-of-work/protocol.md"), true);
  assert.equal(await warned(`https://github.com/mekusimeku/meku-si/blob/${"a1".repeat(20)}/docs/proof-of-work/protocol.md`), false);
});

// ---- Findings of the third independent review (2026-11-28) -------------------------------

const humanListed = (r) => r.uncounted_comments.filter((u) => u.role === "human").map((u) => u.body);

test("review 3 P0-1: every human comment that is not a counted record is listed in full", async () => {
  const long = `${"I have been thinking about this all evening and I want to be careful. ".repeat(7)}I withdraw my consent: please do not publish my photo.`;
  assert.ok(long.length > 500);
  for (const [text, expected] of [
    ["> STOP", "FAIL"],
    ["```json\nSTOP\n```", "FAIL"],
    ["> I withdraw my consent. Please delete my photo.", "WARN"],
    [`MEKU proof-of-work record: seq 9 stop (${SYNTHETIC.pilotId}) - I want to stop, please remove my photo`, "WARN"],
    [`![IMG_0042](${SYNTHETIC.attachmentUrl.replace("0001", "0042")})`, "WARN"],
    [long, "WARN"],
  ]) {
    const p = await hostile();
    appendRecordless(p.bundle, SYNTHETIC.human, text, commentIndexFor(p.bundle, 8));
    const r = verify(p);
    assert.equal(check(r, "H05").status, expected, text.slice(0, 40));
    if (expected === "FAIL") assert.notEqual(r.verdict, "PASS", text.slice(0, 40));
    else assert.match(formatReport(r), /READ FIRST: 1 participant comment\(s\) printed above must be read/, "a PASS says what must be read first");
    assert.deepEqual(humanListed(r), [text], "listed whole, never cut");
    assert.ok(formatReport(r).includes("please do not publish my photo") || text !== long, "the end of a long message is printed");
    assert.ok(r.manual.some((m) => m.id === "M05" && /\(1,/.test(m.check)));
  }
});

test("review 3 P1-2: every image a participant posts is checked, not only the evidence", async () => {
  const p = await hostile();
  const url = "https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000042";
  appendRecordless(p.bundle, SYNTHETIC.human, `![IMG_0042](${url})`, commentIndexFor(p.bundle, 8));
  const added = p.bundle.comments[commentIndexFor(p.bundle, 8) + 1];
  p.bundle.evidence_files.push({ comment_id: added.id, url, file: "evidence/photo.png", sha256: "x" });
  p.files.set("evidence/photo.png", makePng(320, 240, [pngChunk("eXIf", tiffWithGps())]));
  let r = verify(p);
  assert.equal(check(r, "E04").status, "FAIL");
  assert.match(check(r, "E04").details.join(" "), /an image posted by the human .*GPS/);
  assert.equal(r.other_images.length, 1);
  // Not in the bundle at all: reported, never silently skipped.
  p.bundle.evidence_files.pop();
  r = verify(p);
  assert.match(check(r, "E04").details.join(" "), /not in the bundle, so it was not checked/);
  // The exporter fetches every participant's attachments, and never a stranger's.
  const q = await pilot();
  appendRecordless(q.bundle, SYNTHETIC.human, `![IMG_0042](${url})`, commentIndexFor(q.bundle, 8));
  appendRecordless(q.bundle, "a-stranger", `![x](https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000099)`, commentIndexFor(q.bundle, 9));
  const png = q.files.get(q.bundle.evidence_files[0].file);
  const fetched = [];
  const fetchImpl = async (u) => {
    const s = String(u);
    if (s.startsWith("https://api.github.com/")) {
      if (!s.includes("/comments")) return new Response(JSON.stringify({ html_url: SYNTHETIC.issueUrl }), { status: 200 });
      const page = Number(new URL(s).searchParams.get("page"));
      const all = q.bundle.comments.map((c) => ({ id: c.id, user: { login: c.author }, created_at: c.created_at, updated_at: c.updated_at, html_url: c.html_url, body: c.body }));
      return new Response(JSON.stringify(page === 1 ? all : []), { status: 200 });
    }
    fetched.push(s);
    return new Response(png, { status: 200 });
  };
  const out = join(mkdtempSync(join(tmpdir(), "pow-export-")), "ledger");
  const bundle = await exportLedger({ issueUrl: SYNTHETIC.issueUrl, outDir: out, fetchImpl });
  assert.equal(bundle.evidence_files.length, 2);
  assert.ok(fetched.includes(url) && !fetched.some((s) => s.endsWith("0099")));
});

test("review 3 P2-1: a stop can follow the decision or the close, and an edit plus a stop is STOPPED", async () => {
  // STOP after the developer's decision, then the operator's stop record and close.
  const p = await hostile();
  truncateAfter(p.bundle, 10);
  appendRecordless(p.bundle, SYNTHETIC.human, "STOP", p.bundle.comments.length - 1);
  appendRecord(p.bundle, SYNTHETIC.operator, stopRecord({ pilotId: SYNTHETIC.pilotId, seq: 11, role: "operator", reason: "The human asked to stop" }));
  appendRecord(p.bundle, SYNTHETIC.operator, closedRecord({ pilotId: SYNTHETIC.pilotId, seq: 12, outcome: "stopped" }));
  let r = verify(p);
  assert.equal(r.verdict, "STOPPED", JSON.stringify(r.checks.filter((c) => c.status === "FAIL")));
  // STOP after the close: one stop may still follow, and the cycle is no longer a PASS.
  const q = await hostile();
  appendRecordless(q.bundle, SYNTHETIC.human, "STOP", q.bundle.comments.length - 1);
  appendRecord(q.bundle, SYNTHETIC.operator, stopRecord({ pilotId: SYNTHETIC.pilotId, seq: 12, role: "operator", reason: "Consent withdrawn after the close" }));
  r = verify(q);
  assert.equal(r.verdict, "STOPPED", JSON.stringify(r.checks.filter((c) => c.status === "FAIL")));
  appendRecord(q.bundle, SYNTHETIC.operator, stopRecord({ pilotId: SYNTHETIC.pilotId, seq: 13, role: "operator", reason: "again" }));
  r = verify(q);
  assert.equal(r.verdict, "STOPPED");
  assert.match(check(r, "L04").details.join(" "), /out of place/, "only one stop after the close is counted");
  // An edited comment by the human, covered by a stop, ends as STOPPED rather than FAIL.
  const z = await hostile();
  truncateAfter(z.bundle, 8);
  appendRecordless(z.bundle, SYNTHETIC.human, "thanks", z.bundle.comments.length - 1);
  const c = z.bundle.comments.at(-1);
  c.updated_at = new Date(Date.parse(c.created_at) + 60_000).toISOString();
  appendRecord(z.bundle, SYNTHETIC.operator, stopRecord({ pilotId: SYNTHETIC.pilotId, seq: 9, role: "operator", reason: "An edited comment by the human" }));
  appendRecord(z.bundle, SYNTHETIC.operator, closedRecord({ pilotId: SYNTHETIC.pilotId, seq: 10, outcome: "stopped" }));
  assert.equal(verify(z).verdict, "STOPPED");
});

test("review 3 P2-5: benign posting mistakes can be recovered from", async () => {
  // The human posts their consent again after the reveal: a warning, not a failure.
  const p = await hostile();
  const consent = p.bundle.comments[commentIndexFor(p.bundle, 6)];
  appendRecordless(p.bundle, SYNTHETIC.human, consent.body, commentIndexFor(p.bundle, 7));
  let r = verify(p);
  assert.notEqual(check(r, "L04").status, "FAIL");
  assert.match(check(r, "L04").details.join(" "), /posted again/);
  // A consent with extra words, or pasted twice, is not counted; the same block alone then is.
  for (const bad of [`${JSON.stringify(consentRecord({ pilotId: SYNTHETIC.pilotId }), null, 2)}\nHappy to help :}`, `${consent.body}\n${consent.body}`]) {
    const q = await hostile();
    truncateAfter(q.bundle, 5);
    appendRecordless(q.bundle, SYNTHETIC.human, bad, q.bundle.comments.length - 1);
    appendRecord(q.bundle, SYNTHETIC.human, consentRecord({ pilotId: SYNTHETIC.pilotId }));
    r = verify(q);
    assert.equal(r.record_count, 7, "seq 0-6 are counted");
    assert.equal(r.verdict, "INCOMPLETE");
    assert.equal(check(r, "L02").status, "WARN");
  }
  // The operator posting the human's template as a helper is not counted, and harms nothing.
  const z = await hostile();
  appendRecordless(z.bundle, SYNTHETIC.operator, recordComment(consentRecord({ pilotId: SYNTHETIC.pilotId })), commentIndexFor(z.bundle, 5));
  r = verify(z);
  assert.equal(check(r, "R02").status, "WARN");
  assert.notEqual(r.verdict, "FAIL");
});

test("review 3 P2-7: a participant comment deleted or changed after an earlier export is caught", async () => {
  const p = await hostile();
  appendRecordless(p.bundle, SYNTHETIC.human, "STOP", commentIndexFor(p.bundle, 9));
  const earlier = clone(p.bundle);
  earlier.source.exported_at = "2026-01-05T12:30:00.000Z";
  // Later, the STOP comment is gone from the live issue.
  p.bundle.comments.splice(commentIndexFor(p.bundle, 9) + 1, 1);
  let r = verify(p, { earlierExports: [earlier] });
  assert.equal(check(r, "L05").status, "FAIL");
  assert.match(check(r, "L05").details.join(" "), /present in an export of 2026-01-05T12:30:00.000Z, is gone now/);
  const q = await hostile();
  const before = clone(q.bundle);
  q.bundle.comments[commentIndexFor(q.bundle, 6)].body += " ";
  assert.match(check(verify(q, { earlierExports: [before] }), "L05").details.join(" "), /changed after an export/);
  assert.equal(check(verify(await hostile(), { earlierExports: [before] }), "L05").status, "PASS");
});

test("review 3 P3-7: a login used by two GitHub accounts fails, a rename warns", async () => {
  const p = await hostile();
  for (const c of p.bundle.comments) c.user_id = { [SYNTHETIC.operator]: 1, [SYNTHETIC.developer]: 2, [SYNTHETIC.human]: 3 }[c.author] ?? 9;
  assert.equal(check(verify(p), "R03").status, "PASS");
  p.bundle.comments[commentIndexFor(p.bundle, 8)].user_id = 77;
  assert.match(check(verify(p), "R03").details.join(" "), /used by 2 different GitHub accounts/);
  const q = await hostile();
  for (const c of q.bundle.comments) c.user_id = { [SYNTHETIC.operator]: 1, [SYNTHETIC.developer]: 2, [SYNTHETIC.human]: 3 }[c.author] ?? 9;
  appendRecordless(q.bundle, "renamed-human", "hello", commentIndexFor(q.bundle, 9));
  q.bundle.comments[commentIndexFor(q.bundle, 9) + 1].user_id = 3;
  assert.match(check(verify(q), "R03").details.join(" "), /renamed during the pilot/);
});

test("review 3 P2-3, P3-5: the exporter reads many pages, uses GitHub's own URL, and refuses a pull request", async () => {
  const p = await pilot();
  const filler = Array.from({ length: 1500 }, (_, i) => ({ id: 100000 + i, user: { login: `visitor${i}` }, created_at: "2026-01-06T00:00:00Z", updated_at: "2026-01-06T00:00:00Z", html_url: "#", body: "+1" }));
  const all = [...p.bundle.comments.map((c) => ({ id: c.id, user: { login: c.author }, created_at: c.created_at, updated_at: c.updated_at, html_url: c.html_url, body: c.body })), ...filler];
  const fetchImpl = (pr) => async (u) => {
    const s = String(u);
    if (s.startsWith("https://api.github.com/") && !s.includes("/comments"))
      return new Response(JSON.stringify({ html_url: SYNTHETIC.issueUrl, ...(pr ? { pull_request: {} } : {}) }), { status: 200 });
    if (s.startsWith("https://api.github.com/")) {
      const page = Number(new URL(s).searchParams.get("page"));
      return new Response(JSON.stringify(all.slice((page - 1) * 100, page * 100)), { status: 200 });
    }
    return new Response(p.files.get(p.bundle.evidence_files[0].file), { status: 200 });
  };
  const out = join(mkdtempSync(join(tmpdir(), "pow-export-")), "ledger");
  const bundle = await exportLedger({ issueUrl: SYNTHETIC.issueUrl.replace("synthetic-example/synthetic-ledger", "Synthetic-Example/Synthetic-Ledger"), outDir: out, fetchImpl: fetchImpl(false) });
  assert.equal(bundle.comments.length, all.length);
  assert.equal(bundle.source.issue_url, SYNTHETIC.issueUrl, "GitHub's own spelling of the URL");
  await assert.rejects(exportLedger({ issueUrl: SYNTHETIC.issueUrl, outDir: join(out, "..", "pr"), fetchImpl: fetchImpl(true) }), /pull request/);
});

test("review 3 P2-4: the developer tools never print a record the verifier would refuse", () => {
  const dir = mkdtempSync(join(tmpdir(), "pow-p24-"));
  assert.throws(() => postableComment(manualReadyRecord({ pilotId: "POW-001", clientInfo: { name: "c", version: "1" }, agent: "x".repeat(177), server: { version: "1", protocolVersion: "1" }, tools: ["meku_request_human"], affirmIndependence: true })), /would not count: .*agent/);
  const out = spawnSync(process.execPath, [join(here, "request.mjs"), "ready-manual", "--pilot", "POW-001", "--client-name", "c", "--client-version", "1", "--agent", "<!-- x", "--server-version", "1", "--protocol-version", "1", "--tools", "meku_request_human", "--affirm-independence"], { encoding: "utf8", cwd: dir });
  assert.notEqual(out.status, 0);
  assert.doesNotMatch(out.stdout, /```json/, "nothing to post is printed");
});

test("review 3 P3-1: the Python reference reports a hostile bundle instead of crashing", async (t) => {
  if (spawnSync("python3", ["--version"]).status !== 0) return t.skip("python3 not installed");
  const dir = mkdtempSync(join(tmpdir(), "pow-pyhostile-"));
  for (const [name, bundle] of [
    ["not a list", { comments: { a: 1 } }],
    ["deep nesting", { comments: [{ id: 1, author: "x", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", body: `{"pow":"meku.pow/1","x":${"[".repeat(5000)}${"]".repeat(5000)}}` }] }],
    ["a digit from another script", { comments: [{ id: 1, author: "x", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", body: "MEKU proof-of-work record: seq ١ pilot_opened (POW-001)\n{}" }] }],
  ]) {
    writeFileSync(join(dir, "b.json"), JSON.stringify(bundle));
    const out = spawnSync("python3", ["-I", join(here, "digest_reference.py"), join(dir, "b.json")], { encoding: "utf8" });
    assert.notEqual(out.status, 0, name);
    assert.doesNotMatch(out.stderr, /Traceback/, name);
  }
});

// ---- Findings of the fourth independent review (2026-11-28) ------------------------------

test("review 4 P1 and review 5: the evidence counts only with its screenshot, and can never be swapped", async () => {
  const evidenceBlock = (p) => {
    const i = commentIndexFor(p.bundle, 8);
    return { i, record: extractRecords(p.bundle.comments[i].body)[0].record };
  };
  // Forgot the screenshot, then posted again with it: the second one counts.
  const p = await hostile();
  const { i, record } = evidenceBlock(p);
  const withImage = p.bundle.comments[i];
  const without = { ...clone(withImage), id: 4343, created_at: new Date(Date.parse(withImage.created_at) - 60_000).toISOString() };
  without.updated_at = without.created_at;
  without.body = recordComment(record);
  p.bundle.comments.splice(i, 0, without);
  let r = verify(p);
  assert.equal(r.verdict, "PASS", JSON.stringify(r.checks.filter((c) => c.status === "FAIL")));
  assert.match(check(r, "L02").details.join(" "), /without its screenshot/);
  // A different screenshot, before or after MEKU's result, contradicts the first and fails:
  // the operator may already have checked the first one.
  const otherUrl = "https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000044";
  for (const after of [8, 9]) {
    const q = await hostile();
    appendRecordless(q.bundle, SYNTHETIC.human, `${recordComment(record)}\n![Image](${otherUrl})`, commentIndexFor(q.bundle, after));
    q.bundle.evidence_files.push({ comment_id: q.bundle.comments[commentIndexFor(q.bundle, after) + 1].id, url: otherUrl, file: "evidence/second.png", sha256: "x" });
    q.files.set("evidence/second.png", makePng(330, 250));
    r = verify(q);
    assert.equal(r.verdict, "FAIL", `a second screenshot after seq ${after}`);
    assert.match(check(r, "L04").details.join(" "), /a second evidence_submitted .* says something different/);
    assert.equal(r.evidence.url, SYNTHETIC.attachmentUrl, "the first screenshot stays the evidence");
    // The same screenshot uploaded again is only a repeat.
    q.files.set("evidence/second.png", q.files.get(q.bundle.evidence_files[0].file));
    r = verify(q);
    assert.equal(r.verdict, "PASS");
    assert.match(check(r, "L04").details.join(" "), /posted again/);
  }
});

test("review 5: a negative record can never be outvoted, and a corrected seq is only a repeat", async () => {
  // MEKU's negative check typed with a wrong seq, then a positive one: a contradiction.
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 9);
  const positive = extractRecords(p.bundle.comments[i].body)[0].record;
  const negative = { ...clone(p.bundle.comments[i]), id: 4545, created_at: new Date(Date.parse(p.bundle.comments[i].created_at) - 60_000).toISOString() };
  negative.updated_at = negative.created_at;
  negative.body = recordComment({ ...positive, seq: 10, meku_check: { ...positive.meku_check, no_personal_data_visible: false } });
  p.bundle.comments.splice(i, 0, negative);
  let r = verify(p);
  assert.equal(r.verdict, "FAIL");
  assert.match(check(r, "L04").details.join(" "), /a second result_returned .* says something different/);
  // The developer's REJECTED with a wrong seq, then ACCEPTED: also a contradiction.
  const q = await hostile();
  const j = commentIndexFor(q.bundle, 10);
  const accepted = extractRecords(q.bundle.comments[j].body)[0].record;
  const rejected = { ...clone(q.bundle.comments[j]), id: 4646, created_at: new Date(Date.parse(q.bundle.comments[j].created_at) - 60_000).toISOString() };
  rejected.updated_at = rejected.created_at;
  rejected.body = recordComment({ ...accepted, seq: 11, decision: "REJECTED", reason: "The code is not visible" });
  q.bundle.comments.splice(j, 0, rejected);
  assert.equal(verify(q).verdict, "FAIL");
  // The same record with only its seq corrected is a repeat: the right one counts.
  const z = await hostile();
  const k = commentIndexFor(z.bundle, 9);
  const misnumbered = { ...clone(z.bundle.comments[k]), id: 4747, created_at: new Date(Date.parse(z.bundle.comments[k].created_at) - 60_000).toISOString() };
  misnumbered.updated_at = misnumbered.created_at;
  misnumbered.body = recordComment({ ...positive, seq: 10 });
  z.bundle.comments.splice(k, 0, misnumbered);
  r = verify(z);
  assert.equal(r.verdict, "PASS", JSON.stringify(r.checks.filter((c) => c.status === "FAIL")));
  // A stop posted again to correct its seq is ignored; the first one already counts.
  const y = await hostile();
  truncateAfter(y.bundle, 9);
  appendRecord(y.bundle, SYNTHETIC.operator, stopRecord({ pilotId: SYNTHETIC.pilotId, seq: 9, role: "operator", reason: "The human asked to stop" }));
  appendRecord(y.bundle, SYNTHETIC.operator, stopRecord({ pilotId: SYNTHETIC.pilotId, seq: 10, role: "operator", reason: "The human asked to stop" }));
  appendRecord(y.bundle, SYNTHETIC.operator, closedRecord({ pilotId: SYNTHETIC.pilotId, seq: 11, outcome: "stopped" }));
  r = verify(y);
  assert.equal(r.verdict, "STOPPED", JSON.stringify(r.checks.filter((c) => c.status === "FAIL")));
  // Any stop is a stop: a second one with another reason is not a contradiction.
  const x = await hostile();
  truncateAfter(x.bundle, 9);
  appendRecord(x.bundle, SYNTHETIC.operator, stopRecord({ pilotId: SYNTHETIC.pilotId, seq: 10, role: "operator", reason: "The human asked to stop" }));
  appendRecord(x.bundle, SYNTHETIC.operator, stopRecord({ pilotId: SYNTHETIC.pilotId, seq: 11, role: "operator", reason: "No answer for 48 hours" }));
  appendRecord(x.bundle, SYNTHETIC.operator, closedRecord({ pilotId: SYNTHETIC.pilotId, seq: 11, outcome: "stopped" }));
  r = verify(x);
  assert.equal(r.verdict, "STOPPED", JSON.stringify(r.checks.filter((c) => c.status === "FAIL")));
});

test("review 5: record.mjs returned names the screenshot its checks are about", async () => {
  const p = await hostile();
  const dir = mkdtempSync(join(tmpdir(), "pow-returned-"));
  truncateAfter(p.bundle, 8);
  writeFileSync(join(dir, "bundle.json"), JSON.stringify(p.bundle));
  for (const [name, bytes] of p.files) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), bytes);
  }
  const out = spawnSync(process.execPath, [join(here, "record.mjs"), "returned", "--bundle", join(dir, "bundle.json"), "--code-visible", "--object-visible", "--no-personal-data"], { encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(readRecordComment(out.stdout).record?.type, "result_returned", "standard output is exactly one countable comment");
  assert.ok(out.stderr.includes(SYNTHETIC.attachmentUrl), out.stderr);
});

test("review 5: JavaScript and Python count the same records when a kind is posted twice", async (t) => {
  if (spawnSync("python3", ["--version"]).status !== 0) return t.skip("python3 not installed");
  const both = (p) => {
    const dir = mkdtempSync(join(tmpdir(), "pow-p5-"));
    writeFileSync(join(dir, "bundle.json"), JSON.stringify(p.bundle));
    const py = spawnSync("python3", ["-I", join(here, "digest_reference.py"), join(dir, "bundle.json")], { encoding: "utf8" });
    const js = verify(p);
    return { js, py: py.status === 0 ? py.stdout.split(" ")[0] : null, pyErr: py.stderr };
  };
  const twice = async (seq, change, typed) => {
    const p = await hostile();
    const i = commentIndexFor(p.bundle, seq);
    const record = extractRecords(p.bundle.comments[i].body)[0].record;
    const early = { ...clone(p.bundle.comments[i]), id: 5000 + seq, created_at: new Date(Date.parse(p.bundle.comments[i].created_at) - 60_000).toISOString() };
    early.updated_at = early.created_at;
    early.body = recordComment({ ...record, ...change, seq: typed });
    p.bundle.comments.splice(i, 0, early);
    return p;
  };
  const cases = [
    ["a misnumbered result, then the right one", await twice(9, {}, 10), "PASS"],
    ["a negative result, misnumbered, then a positive one", await twice(9, { meku_check: { code_visible: true, object_visible: true, no_personal_data_visible: false } }, 10), "FAIL"],
    ["a rejection, misnumbered, then an acceptance", await twice(10, { decision: "REJECTED", reason: "The code is not visible" }, 11), "FAIL"],
    ["a misnumbered consent, then the right one", await twice(6, {}, 5), "PASS"],
  ];
  for (const [name, p, verdict] of cases) {
    const o = both(p);
    assert.equal(o.js.verdict, verdict, name);
    assert.equal(o.py, o.js.ledger_digest, name);
    if (verdict === "FAIL") assert.match(o.pyErr, /contradict an earlier record of the same kind/, name);
  }
  // A second screenshot: the same bytes are a repeat, other bytes fail; neither changes the digest.
  const otherUrl = "https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000055";
  for (const same of [true, false]) {
    const q = await hostile();
    const i = commentIndexFor(q.bundle, 8);
    const record = extractRecords(q.bundle.comments[i].body)[0].record;
    appendRecordless(q.bundle, SYNTHETIC.human, `${recordComment(record)}\n![Image](${otherUrl})`, i);
    q.bundle.evidence_files.push({ comment_id: q.bundle.comments[i + 1].id, url: otherUrl, file: "evidence/again.png", sha256: "x" });
    q.files.set("evidence/again.png", same ? q.files.get(q.bundle.evidence_files[0].file) : makePng(330, 250));
    const o = both(q);
    assert.equal(o.js.verdict, same ? "PASS" : "FAIL");
    assert.equal(o.py, o.js.ledger_digest, same ? "the same screenshot again" : "another screenshot");
  }
});

// ---- Findings of the sixth independent review (2026-11-28) -------------------------------

const postEarly = (p, seq, before, change) => {
  const i = commentIndexFor(p.bundle, seq);
  const j = commentIndexFor(p.bundle, before);
  const record = extractRecords(p.bundle.comments[i].body)[0].record;
  const c = { ...clone(p.bundle.comments[i]), id: 6000 + seq, created_at: new Date(Date.parse(p.bundle.comments[j].created_at) - 60_000).toISOString() };
  c.updated_at = c.created_at;
  c.body = recordComment(change(clone(record)));
  p.bundle.comments.splice(j, 0, c);
  return c;
};

test("review 6: a record posted before its turn states nothing, so it may be posted again with new content", async () => {
  // MEKU shows "approved" before the operator posts seq 3: the developer posts seq 4 early,
  // then reads the status again after seq 3. The two reads differ; only the second counts.
  const p = await hostile();
  postEarly(p, 4, 3, (r) => ({ ...r, observed_at: "2026-01-01T00:00:00.000Z", response_text_sha256: "0".repeat(64) }));
  let r = verify(p);
  assert.equal(r.verdict, "PASS", JSON.stringify(r.checks.filter((c) => c.status === "FAIL")));
  const l04 = check(r, "L04").details.join(" ");
  assert.match(l04, /states nothing, so post it again when its turn comes/);
  assert.match(l04, /which does not count, says something other than the one that counts .*: read both/);
  // A close posted before its turn does not fix the outcome.
  const q = await hostile();
  truncateAfter(q.bundle, 9);
  appendRecord(q.bundle, SYNTHETIC.operator, closedRecord({ pilotId: SYNTHETIC.pilotId, seq: 10, outcome: "completed" }));
  appendRecord(q.bundle, SYNTHETIC.operator, stopRecord({ pilotId: SYNTHETIC.pilotId, seq: 10, role: "operator", reason: "The human asked to stop" }));
  appendRecord(q.bundle, SYNTHETIC.operator, closedRecord({ pilotId: SYNTHETIC.pilotId, seq: 11, outcome: "stopped" }));
  r = verify(q);
  assert.equal(r.verdict, "STOPPED", JSON.stringify(r.checks.filter((c) => c.status === "FAIL")));
  // An evidence comment posted before the object was named does not lock its photo.
  const z = await hostile();
  const otherUrl = "https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000066";
  const pre = postEarly(z, 8, 7, (rec) => rec);
  pre.body = `${pre.body}\n![Image](${otherUrl})`;
  z.bundle.evidence_files.push({ comment_id: pre.id, url: otherUrl, file: "evidence/early.png", sha256: "x" });
  z.files.set("evidence/early.png", makePng(330, 250));
  r = verify(z);
  assert.equal(r.verdict, "PASS", JSON.stringify(r.checks.filter((c) => c.status === "FAIL")));
  assert.equal(r.evidence.url, SYNTHETIC.attachmentUrl);
  assert.match(check(r, "L04").details.join(" "), /read both/);
});

test("review 6: a record posted in its turn with the wrong seq states what its kind says", async () => {
  // The evidence typed with seq 9, then posted again with seq 8: the same screenshot passes,
  // a new photo fails.
  for (const sameBytes of [true, false]) {
    const p = await hostile();
    const i = commentIndexFor(p.bundle, 8);
    const original = p.bundle.comments[i];
    const record = extractRecords(original.body)[0].record;
    const misnumbered = { ...clone(original), id: 6608, created_at: new Date(Date.parse(original.created_at) - 60_000).toISOString() };
    misnumbered.updated_at = misnumbered.created_at;
    const firstUrl = "https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000068";
    misnumbered.body = `${recordComment({ ...record, seq: 9 })}\n![Image](${firstUrl})`;
    p.bundle.comments.splice(i, 0, misnumbered);
    p.bundle.evidence_files.push({ comment_id: misnumbered.id, url: firstUrl, file: "evidence/first.png", sha256: "x" });
    p.files.set("evidence/first.png", sameBytes ? p.files.get(p.bundle.evidence_files[0].file) : makePng(330, 250));
    const r = verify(p);
    assert.equal(r.verdict, sameBytes ? "PASS" : "FAIL", JSON.stringify(r.checks.filter((c) => c.status === "FAIL")));
    assert.match(check(r, "L04").details.join(" "), sameBytes ? /post exactly the same record again with seq 8/ : /a second evidence_submitted .* says something different/);
  }
});

test("review 6: a screenshot that cannot be compared warns, and the first one stands", async () => {
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 8);
  const record = extractRecords(p.bundle.comments[i].body)[0].record;
  const otherUrl = "https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000077";
  // Posted again under a new address, and its file is missing, as when a download failed.
  appendRecordless(p.bundle, SYNTHETIC.human, `${recordComment(record)}\n![Image](${otherUrl})`, i);
  const r = verify(p);
  assert.equal(check(r, "L04").status, "WARN");
  assert.match(check(r, "L04").details.join(" "), /could not be compared .* the first one stands/);
  assert.equal(r.evidence.url, SYNTHETIC.attachmentUrl);
});

test("review 6: an invalid record that says something else than the counted one is named", async () => {
  // A negative MEKU check with a malformed code, then a valid positive one.
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 9);
  const positive = extractRecords(p.bundle.comments[i].body)[0].record;
  const bad = { ...clone(p.bundle.comments[i]), id: 6699, created_at: new Date(Date.parse(p.bundle.comments[i].created_at) - 60_000).toISOString() };
  bad.updated_at = bad.created_at;
  bad.body = recordComment({ ...positive, code: positive.code.toLowerCase(), meku_check: { ...positive.meku_check, no_personal_data_visible: false } });
  p.bundle.comments.splice(i, 0, bad);
  const r = verify(p);
  assert.match(check(r, "L04").details.join(" "), /result_returned posted at .*, which does not count, says something other than the one that counts/);
  assert.ok(JSON.stringify(r.uncounted_comments).includes("6699"), "it is printed in full for M06");
});

test("review 6: JavaScript and Python agree on records posted before their turn", async (t) => {
  if (spawnSync("python3", ["--version"]).status !== 0) return t.skip("python3 not installed");
  const both = (p, skip) => {
    const dir = mkdtempSync(join(tmpdir(), "pow-p6-"));
    writeFileSync(join(dir, "bundle.json"), JSON.stringify(p.bundle));
    const py = spawnSync("python3", ["-I", join(here, "digest_reference.py"), join(dir, "bundle.json"), ...(skip ? ["--skip", skip] : [])], { encoding: "utf8" });
    return { js: verify(p).ledger_digest, py: py.status === 0 ? py.stdout.split(" ")[0] : null };
  };
  const p = await hostile();
  postEarly(p, 4, 3, (r) => ({ ...r, observed_at: "2026-01-01T00:00:00.000Z" }));
  let o = both(p);
  assert.equal(o.py, o.js, "seq 4 posted before seq 3, then read again");
  const q = await hostile();
  truncateAfter(q.bundle, 9);
  appendRecord(q.bundle, SYNTHETIC.operator, closedRecord({ pilotId: SYNTHETIC.pilotId, seq: 10, outcome: "completed" }));
  appendRecord(q.bundle, SYNTHETIC.operator, stopRecord({ pilotId: SYNTHETIC.pilotId, seq: 10, role: "operator", reason: "The human asked to stop" }));
  appendRecord(q.bundle, SYNTHETIC.operator, closedRecord({ pilotId: SYNTHETIC.pilotId, seq: 11, outcome: "stopped" }));
  o = both(q);
  assert.equal(o.py, o.js, "a close before its turn, then a stop and a close");
  // A record that fails the schema is not counted by verify.mjs; Python is told with --skip.
  const z = await hostile();
  const i9 = commentIndexFor(z.bundle, 9);
  const positive = extractRecords(z.bundle.comments[i9].body)[0].record;
  const bad = { ...clone(z.bundle.comments[i9]), id: 6609, created_at: new Date(Date.parse(z.bundle.comments[i9].created_at) - 60_000).toISOString() };
  bad.updated_at = bad.created_at;
  bad.body = recordComment({ ...positive, code: positive.code.toLowerCase() });
  z.bundle.comments.splice(i9, 0, bad);
  o = both(z, "6609");
  assert.equal(o.py, o.js, "an invalid record skipped as the verifier lists it");
});

// ---- Findings of the seventh independent review (2026-11-28) -----------------------------

test("review 7: a pilot has one human, so offers naming two humans fail, even one posted before its turn", async () => {
  // A: an early offer names the human who then consents; the counted offer names someone else.
  const a = await hostile();
  rewrite(a.bundle, 5, (r) => (r.human = "synthetic_other"));
  postEarly(a, 5, 4, (rec) => ({ ...rec, human: SYNTHETIC.human }));
  let r = verify(a);
  assert.equal(r.verdict, "FAIL");
  assert.match(check(r, "H02").details.join(" "), /offers name more than one human \(synthetic_human, synthetic_other\)/);
  // B: an early offer names someone else; the counted offer names the real human.
  const b = await hostile();
  postEarly(b, 5, 4, (rec) => ({ ...rec, human: "synthetic_other" }));
  r = verify(b);
  assert.equal(r.verdict, "FAIL", "never INCOMPLETE for ever");
  assert.equal(check(r, "H02").status, "FAIL");
  // The same offer posted early and again in its turn is fine, and logins ignore case.
  for (const human of [SYNTHETIC.human, SYNTHETIC.human.toUpperCase()]) {
    const c = await hostile();
    postEarly(c, 5, 4, (rec) => ({ ...rec, human }));
    r = verify(c);
    assert.equal(r.verdict, "PASS", JSON.stringify(r.checks.filter((x) => x.status === "FAIL")));
  }
});

test("review 8 P3: a second pilot_opened that says something else fails; the same one is ignored", async () => {
  for (const [change, verdict] of [[(r) => ({ ...r, roster: { ...r.roster, developer: "synthetic_other" } }), "FAIL"], [(r) => r, "PASS"]]) {
    const p = await hostile();
    const opening = extractRecords(p.bundle.comments[0].body)[0].record;
    appendRecord(p.bundle, SYNTHETIC.operator, change(clone(opening)), 3);
    const r = verify(p);
    assert.equal(r.verdict, verdict, JSON.stringify(r.checks.filter((x) => x.status === "FAIL")));
    if (verdict === "FAIL") assert.match(check(r, "L04").details.join(" "), /a second pilot_opened .* says something different/);
  }
  // The warning about an unpinned link says not to post the opening again.
  const q = await hostile();
  asRealPilot(q.bundle);
  rewrite(q.bundle, 0, (r) => (r.protocol = "https://github.com/mekusimeku/meku-si/blob/main/docs/proof-of-work/protocol.md"));
  assert.match(check(verify(q, { allowSynthetic: false }), "L02").details.join(" "), /not pinned to a commit.*Do not post the opening again.*open a new ledger issue/);
});

test("review 4 N1: a header line can carry only the reveal's instruction, and it must match", async () => {
  const p = await hostile();
  const i = commentIndexFor(p.bundle, 7);
  const reveal = extractRecords(p.bundle.comments[i].body)[0].record;
  const code = extractRecords(p.bundle.comments[commentIndexFor(p.bundle, 2)].body)[0].record.code;
  const header = (label) => `MEKU proof-of-work record: seq 7 object_revealed (${SYNTHETIC.pilotId}) - ${label}\n\n\`\`\`json\n${JSON.stringify(reveal, null, 2)}\n\`\`\``;
  assert.ok(readRecordComment(header(`write ${code}${reveal.suffix} and put a ${reveal.object} next to it`)).record, "the tool's own line");
  for (const label of ["I changed my mind, please do not use or publish this photo", `write ${code}${reveal.suffix} and put a SHOE next to it`, `write ${code}ZZ and put a ${reveal.object} next to it`])
    assert.ok(readRecordComment(header(label)).problem, label);
  const evidence = extractRecords(p.bundle.comments[commentIndexFor(p.bundle, 8)].body)[0].record;
  assert.ok(readRecordComment(`MEKU proof-of-work record: seq 8 evidence_submitted (${SYNTHETIC.pilotId}) - REJECTED\n\n${JSON.stringify(evidence)}\n![Image](${SYNTHETIC.attachmentUrl})`).problem);
  // A matching instruction naming another code fails H03.
  p.bundle.comments[i].body = header(`write K7QX29MD${reveal.suffix} and put a ${reveal.object} next to it`);
  assert.match(check(verify(p), "H03").details.join(" "), /tells the human to write K7QX29MD/);
});

test("review 4 N2, N3: the evidence is always exported first; beside it only a location fails", async () => {
  const p = await pilot();
  const extra = Array.from({ length: 25 }, (_, k) => `https://github.com/user-attachments/assets/00000000-0000-4000-8000-0000000001${String(k).padStart(2, "0")}`);
  appendRecordless(p.bundle, SYNTHETIC.operator, extra.map((u) => `![x](${u})`).join("\n"), commentIndexFor(p.bundle, 5));
  const png = p.files.get(p.bundle.evidence_files[0].file);
  const fetchImpl = async (u) => {
    const s = String(u);
    if (s.startsWith("https://api.github.com/")) {
      if (!s.includes("/comments")) return new Response(JSON.stringify({ html_url: SYNTHETIC.issueUrl }), { status: 200 });
      const page = Number(new URL(s).searchParams.get("page"));
      const all = p.bundle.comments.map((c) => ({ id: c.id, user: { login: c.author }, created_at: c.created_at, updated_at: c.updated_at, html_url: c.html_url, body: c.body }));
      return new Response(JSON.stringify(page === 1 ? all : []), { status: 200 });
    }
    return new Response(png, { status: 200 });
  };
  const out = join(mkdtempSync(join(tmpdir(), "pow-export-")), "ledger");
  const bundle = await exportLedger({ issueUrl: SYNTHETIC.issueUrl, outDir: out, fetchImpl });
  const evidenceEntry = bundle.evidence_files.find((e) => e.url === SYNTHETIC.attachmentUrl);
  assert.ok(evidenceEntry?.file, "the evidence is downloaded even after many other images");
  assert.ok(bundle.evidence_files.some((e) => !e.file && /not downloaded/.test(e.error)), "the cap applies to the other images");
  // Ordinary metadata in a side image is a warning; a location fails.
  const q = await hostile();
  const url = "https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000042";
  appendRecordless(q.bundle, SYNTHETIC.operator, `![x](${url})`, commentIndexFor(q.bundle, 5));
  const added = q.bundle.comments[commentIndexFor(q.bundle, 5) + 1];
  q.bundle.evidence_files.push({ comment_id: added.id, url, file: "evidence/side.jpg", sha256: "x" });
  q.files.set("evidence/side.jpg", makeJpeg({ app: [[0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), Buffer.from("II*\0\x08\0\0\0\0\0", "latin1")])]] }));
  let r = verify(q);
  assert.equal(check(r, "E04").status, "WARN");
  assert.equal(r.verdict, "PASS");
  q.files.set("evidence/side.jpg", makeJpeg({ app: [[0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiffWithGps()])]] }));
  r = verify(q);
  assert.equal(check(r, "E04").status, "FAIL");
});

test("review 4 N4: a record out of place is not counted, a stop counts whatever its seq, a contradiction fails", async () => {
  // The human pastes the evidence block instead of the consent: not counted, then the consent counts.
  const p = await hostile();
  truncateAfter(p.bundle, 5);
  appendRecordless(p.bundle, SYNTHETIC.human, `${recordComment(evidenceRecord({ pilotId: SYNTHETIC.pilotId }))}\n![Image](${SYNTHETIC.attachmentUrl})`, p.bundle.comments.length - 1);
  appendRecord(p.bundle, SYNTHETIC.human, consentRecord({ pilotId: SYNTHETIC.pilotId }));
  let r = verify(p);
  assert.equal(r.record_count, 7);
  assert.match(check(r, "L04").details.join(" "), /out of place \(expected seq 6: human_consent or stop\)/);
  // A stop typed with the wrong seq still counts, and so does the close after it.
  const q = await hostile();
  truncateAfter(q.bundle, 9);
  appendRecordless(q.bundle, SYNTHETIC.human, "STOP", q.bundle.comments.length - 1);
  appendRecord(q.bundle, SYNTHETIC.operator, stopRecord({ pilotId: SYNTHETIC.pilotId, seq: 9, role: "operator", reason: "The human asked to stop" }));
  appendRecord(q.bundle, SYNTHETIC.operator, closedRecord({ pilotId: SYNTHETIC.pilotId, seq: 10, outcome: "stopped" }));
  r = verify(q);
  assert.equal(r.verdict, "STOPPED", JSON.stringify(r.checks.filter((c) => c.status === "FAIL")));
  assert.match(check(r, "L04").details.join(" "), /says seq 9; it is counted as seq 10/);
  // record.mjs computes the next seq from an exported bundle.
  const dir = mkdtempSync(join(tmpdir(), "pow-next-"));
  writeFileSync(join(dir, "bundle.json"), JSON.stringify((await hostile()).bundle));
  const stop = spawnSync(process.execPath, [join(here, "record.mjs"), "stop", "--pilot", SYNTHETIC.pilotId, "--bundle", join(dir, "bundle.json"), "--role", "operator", "--reason", "x"], { encoding: "utf8" });
  assert.equal(extractRecords(stop.stdout)[0].record.seq, 12);
});

test("review 4 N4: the developer tools print only the comment to post on standard output", async () => {
  const p = await hostile();
  const dir = mkdtempSync(join(tmpdir(), "pow-stdout-"));
  writeFileSync(join(dir, "pow-request.json"), JSON.stringify(p.prepared));
  truncateAfter(p.bundle, 6);
  writeFileSync(join(dir, "bundle.json"), JSON.stringify(p.bundle));
  const out = spawnSync(process.execPath, [join(here, "request.mjs"), "reveal", "--request", join(dir, "pow-request.json"), "--bundle", join(dir, "bundle.json")], { encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(readRecordComment(out.stdout).record, "standard output is exactly one countable comment");
  assert.match(out.stderr, /Copy only what follows/);
});

test("review 4 N5: a review by the same person as the key issuer must be disclosed, and is surfaced", async () => {
  const p = await hostile();
  rewrite(p.bundle, 3, (r) => (r.reviewer_same_person_as_key_issuer = true));
  const r = verify(p);
  assert.equal(check(r, "R04").status, "WARN");
  assert.match(check(r, "R04").details.join(" "), /separate only by account/);
  const q = await hostile();
  rewrite(q.bundle, 3, (r2) => delete r2.reviewer_same_person_as_key_issuer);
  assert.notEqual(verify(q).verdict, "PASS", "the disclosure is required");
});
