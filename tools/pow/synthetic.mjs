#!/usr/bin/env node
// Builds a SYNTHETIC proof-of-work ledger (pilot POW-SYNTHETIC-1) by running the real
// pilot tools against the in-memory mock of MEKU's MCP contract. Every account name
// contains an underscore, which GitHub forbids, so no real account is named. The image
// is a generated grey pattern with no code or object in it. This is test data only and
// is never evidence that any real work cycle happened; verify.mjs refuses it unless
// --allow-synthetic is given.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createMockMeku } from "./mock-meku-mcp.mjs";
import { checkConnection, makeClient, prepareRequest, readStatus, recordComment, revealObject, submitRequest } from "./request.mjs";
import { closedRecord, consentRecord, decisionRecord, evidenceRecord, offeredRecord, openedRecord, returnedRecord, reviewedRecord } from "./record.mjs";
import { BUNDLE_FORMAT, sha256Hex } from "./lib.mjs";

export const SYNTHETIC = Object.freeze({
  pilotId: "POW-SYNTHETIC-1",
  issueUrl: "https://github.com/synthetic-example/synthetic-ledger/issues/1",
  operator: "synthetic_operator",
  developer: "synthetic_developer",
  human: "synthetic_human",
  requestId: "00000000-0000-4000-8000-00000000c0de",
  attachmentUrl: "https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000001",
  writableKey: `meku_${"ab".repeat(24)}`,
  searchOnlyKey: `meku_exp1_1767225600000_${"cd".repeat(24)}`,
  start: Date.parse("2026-01-05T09:00:00Z"),
});

// ---- Deterministic image helpers (also used by the tests) ----------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** zlib stream made of stored (uncompressed) deflate blocks: byte-identical on every platform. */
function zlibStored(data) {
  const parts = [Buffer.from([0x78, 0x01])];
  for (let i = 0; i < data.length || i === 0; i += 65535) {
    const block = data.subarray(i, Math.min(i + 65535, data.length));
    const last = i + 65535 >= data.length ? 1 : 0;
    const head = Buffer.alloc(5);
    head[0] = last;
    head.writeUInt16LE(block.length, 1);
    head.writeUInt16LE(~block.length & 0xffff, 3);
    parts.push(head, block);
  }
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(((b << 16) | a) >>> 0);
  parts.push(adler);
  return Buffer.concat(parts);
}
export function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
}
/** Greyscale PNG with a diagonal stripe pattern; extraChunks go before IDAT. */
export function makePng(width = 320, height = 240, extraChunks = []) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) raw[y * (width + 1) + 1 + x] = (x + y) % 32 < 16 ? 0x90 : 0xb0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    ...extraChunks,
    pngChunk("IDAT", zlibStored(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
/** Minimal TIFF block whose IFD0 points at a GPS IFD (tag 0x8825). */
export function tiffWithGps() {
  const t = Buffer.alloc(32);
  t.write("II*\0", 0, "latin1");
  t.writeUInt32LE(8, 4);
  t.writeUInt16LE(1, 8);
  t.writeUInt16LE(0x8825, 10);
  t.writeUInt16LE(4, 12);
  t.writeUInt32LE(1, 14);
  t.writeUInt32LE(26, 18);
  t.writeUInt32LE(0, 22);
  t.writeUInt16LE(0, 26);
  return t;
}
/** Parseable JPEG skeleton: SOI, optional APP segments, SOF0 with the size, SOS, EOI. */
export function makeJpeg({ width = 320, height = 240, app = [] } = {}) {
  const segment = (marker, payload) => {
    const head = Buffer.from([0xff, marker, 0, 0]);
    head.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([head, payload]);
  };
  const sof = Buffer.from([8, 0, 0, 0, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    ...app.map(([marker, payload]) => segment(marker, payload)),
    segment(0xc0, sof),
    segment(0xda, Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0])),
    Buffer.from([0x12, 0x34, 0xff, 0xd9]),
  ]);
}

// ---- The synthetic pilot --------------------------------------------------------

export async function buildSyntheticPilot() {
  const S = SYNTHETIC;
  const minute = (m) => new Date(S.start + m * 60_000);
  const files = new Map();
  const bundle = {
    format: BUNDLE_FORMAT,
    source: { repo: "synthetic-example/synthetic-ledger", issue_number: 1, issue_url: S.issueUrl, exported_at: minute(300).toISOString(), exporter: "meku.pow-synthetic/1" },
    comments: [],
    evidence_files: [],
  };
  const source = { bundle, loadEvidence: (file) => files.get(file) ?? null };
  const post = (author, at, record, extra = "") => {
    const id = 1000 + bundle.comments.length;
    const iso = minute(at).toISOString();
    bundle.comments.push({ id, author, created_at: iso, updated_at: iso, html_url: `${S.issueUrl}#issuecomment-${id}`, body: recordComment(record) + extra });
  };

  let clockMinute = 19;
  const mock = createMockMeku({
    keys: { [S.writableKey]: { id: "key-1", readOnly: false }, [S.searchOnlyKey]: { id: "key-2", readOnly: true } },
    ids: [S.requestId],
    clock: () => minute(clockMinute),
  });
  const client = makeClient({ apiKey: S.writableKey, fetchImpl: mock.fetchImpl, now: () => new Date(minute(clockMinute).getTime() + 30_000) });

  post(S.operator, 0, openedRecord({ pilotId: S.pilotId, operator: S.operator, developer: S.developer, protocolUrl: "https://github.com/mekusimeku/meku-si/blob/main/docs/proof-of-work/protocol.md" }));
  const ready = await checkConnection({ client, apiKey: S.writableKey, clientInfo: { name: "meku-pow-request", version: "1.0.0" }, agent: "Synthetic test agent (no real model)", affirmIndependence: true, pilotId: S.pilotId });
  post(S.developer, 10, ready.record);
  const prepared = prepareRequest({
    pilotId: S.pilotId,
    ledgerUrl: S.issueUrl,
    randomSource: () => Buffer.from([0x5a, 0x3c, 0x96, 0xe1, 0x07]),
    saltSource: () => Buffer.from("synthetic-salt!!", "latin1"),
  });
  const submitted = await submitRequest({ client, prepared, confirm: prepared.code });
  post(S.developer, 20, submitted.record);
  post(S.operator, 60, reviewedRecord({ pilotId: S.pilotId, code: prepared.code, decision: "approved", reviewerRole: "seek_reviewer", note: "Synthetic review" }));
  mock.setStatus(S.requestId, "approved");
  clockMinute = 69;
  const status = await readStatus({ client, receipt: submitted.receipt });
  post(S.developer, 70, status.record);
  post(S.operator, 80, offeredRecord({ bundlePath: source, human: S.human, registered: true, channel: "github" }));
  post(S.human, 120, consentRecord({ pilotId: S.pilotId }));
  post(S.developer, 130, revealObject({ prepared, consentCommentId: bundle.comments.at(-1).id }));
  const png = makePng();
  const file = `evidence/${sha256Hex(png)}.png`;
  files.set(file, png);
  bundle.evidence_files.push({ comment_id: 1000 + bundle.comments.length, url: S.attachmentUrl, file, sha256: sha256Hex(png), bytes: png.length, content_type: "image/png" });
  post(S.human, 170, evidenceRecord({ pilotId: S.pilotId }), `\n<img width="320" alt="screenshot" src="${S.attachmentUrl}" />\n`);
  post(S.operator, 200, returnedRecord({ bundlePath: source, codeVisible: true, objectVisible: true, noPersonalData: true, note: "Synthetic check" }));
  const allChecks = { code_visible: true, code_matches: true, object_visible: true, object_matches: true, no_personal_data_visible: true };
  post(S.developer, 230, decisionRecord({ bundlePath: source, accept: true, checks: allChecks, reason: "Synthetic acceptance for tests" }));
  post(S.operator, 240, closedRecord({ pilotId: S.pilotId, seq: 11, outcome: "completed", note: "Synthetic pilot key revoked" }));
  return { bundle, files, loadEvidence: source.loadEvidence, mock, prepared, receipt: submitted.receipt };
}

async function main(argv) {
  const [outDir] = argv;
  if (!outDir) {
    console.error("Usage: node tools/pow/synthetic.mjs <out-dir>   (writes a SYNTHETIC ledger bundle for trying verify.mjs)");
    return 3;
  }
  const { bundle, files } = await buildSyntheticPilot();
  mkdirSync(join(outDir, "evidence"), { recursive: true });
  for (const [file, bytes] of files) writeFileSync(join(outDir, file), bytes);
  writeFileSync(join(outDir, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);
  console.log(`Wrote a SYNTHETIC ledger (not evidence of anything) to ${outDir}/`);
  console.log(`Try: node tools/pow/verify.mjs ${outDir}/bundle.json --allow-synthetic`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await main(process.argv.slice(2));
