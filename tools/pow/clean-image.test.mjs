// Tests for the on-device image cleaner (clean-image.html). Run with:
//   node --test tools/pow/clean-image.test.mjs
// They prove three things offline: the page's check is lib.mjs's evidence image check, copied
// verbatim and never weaker; the cleaning code leaves only pixel data that passes that check;
// and the page holds no code that could reach the network. The browser run is in
// clean-image.e2e.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import { PAGE_PATH, buildPage, coreSource, scannerId, scannerSource } from "./build-clean-image.mjs";
import {
  ByteBuffer,
  crc32,
  describeHiddenData,
  makePngChunk,
  pngChunkTypes,
  pngEssentialChunks,
  readPngChunks,
  testExifTiff,
  testJpegMetadata,
  testPngMetadata,
  withJpegSegments,
  withPngChunks,
} from "./clean-image-core.mjs";
import { scanImage } from "./lib.mjs";
import { makeIcc, makeJpeg, makePng, pngChunk, tiffWithGps } from "./synthetic.mjs";

// The page's check exactly as the committed page runs it: its own copy of the cleaning code and
// its own block that wraps lib.mjs's scanner (the Buffer stand-in, no inflating), cut out of
// clean-image.html itself, so that a weakened page cannot pass these tests.
function pageScanner() {
  const page = readFileSync(PAGE_PATH, "utf8");
  const start = page.indexOf("const POW = (() => {");
  const end = page.indexOf("})();", page.indexOf("return { scanImage, MAX_EVIDENCE_BYTES, MIN_EVIDENCE_SHORT_SIDE };", start));
  assert.ok(start > 0 && end > start, "the page holds its scanner block");
  const coreStart = page.indexOf("// MEKU proof-of-work image cleaner: the part shared");
  return new Function(`"use strict";\n${page.slice(coreStart, start)}\n${page.slice(start, end + 5)}\nreturn POW.scanImage;`)();
}
const browserScan = pageScanner();

const fails = (result) => result.findings.filter((f) => f.level === "FAIL").map((f) => f.code);
const xmpChunk = (text, compressed = false) =>
  pngChunk("iTXt", Buffer.concat([Buffer.from(`XML:com.adobe.xmp\0${compressed ? "\x01" : "\0"}\0\0\0`, "latin1"), compressed ? zlib.deflateSync(Buffer.from(text)) : Buffer.from(text)]));
const SCREENSHOT_XMP =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 6.0.0"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/"><exif:PixelYDimension>2556</exif:PixelYDimension><exif:PixelXDimension>1179</exif:PixelXDimension><exif:UserComment>Screenshot</exif:UserComment></rdf:Description></rdf:RDF></x:xmpmeta>';
const iccpChunk = (profile, name = "ICC Profile") => pngChunk("iCCP", Buffer.concat([Buffer.from(`${name}\0\0`, "latin1"), zlib.deflateSync(profile)]));
const tiffWithoutGps = () => {
  const t = Buffer.from(tiffWithGps());
  t.writeUInt16LE(0x0112, 10); // Orientation instead of the GPS pointer
  return t;
};
const bigEndianGps = () => {
  const t = Buffer.alloc(32);
  t.write("MM\0*", 0, "latin1");
  t.writeUInt32BE(8, 4);
  t.writeUInt16BE(1, 8);
  t.writeUInt16BE(0x8825, 10);
  t.writeUInt16BE(4, 12);
  t.writeUInt32BE(1, 14);
  t.writeUInt32BE(26, 18);
  return t;
};

/** Every kind of file the scanner tells apart. inflate: the case needs compressed data read. */
function corpus() {
  const png = makePng();
  const cases = [
    ["plain PNG", png],
    ["PNG with EXIF and GPS", makePng(320, 240, [pngChunk("eXIf", tiffWithGps())])],
    ["PNG with EXIF, big-endian GPS", makePng(320, 240, [pngChunk("eXIf", bigEndianGps())])],
    ["PNG with EXIF, no GPS", makePng(320, 240, [pngChunk("eXIf", tiffWithoutGps())])],
    ["PNG with a short EXIF", makePng(320, 240, [pngChunk("eXIf", Buffer.from("II*\0", "latin1"))])],
    ["PNG with screenshot XMP", makePng(320, 240, [xmpChunk(SCREENSHOT_XMP)])],
    ["PNG with XMP naming a place", makePng(320, 240, [xmpChunk(SCREENSHOT_XMP.replace("Screenshot", "Screenshot</exif:UserComment><photoshop:City>Rome</photoshop:City><exif:UserComment>x"))])],
    ["PNG with XMP naming an editor", makePng(320, 240, [xmpChunk(SCREENSHOT_XMP.replace("<exif:UserComment>Screenshot</exif:UserComment>", "<xmp:CreatorTool>Editor</xmp:CreatorTool>"))])],
    ["PNG with XMP holding a comment", makePng(320, 240, [xmpChunk(`<!-- hi -->${SCREENSHOT_XMP}`)])],
    ["PNG with XMP that is not UTF-8", makePng(320, 240, [pngChunk("iTXt", Buffer.concat([Buffer.from("XML:com.adobe.xmp\0\0\0\0\0", "latin1"), Buffer.from([0x3c, 0x78, 0xff, 0xfe, 0xc3, 0x28, 0x3e])]))])],
    ["PNG with a malformed XMP chunk", makePng(320, 240, [pngChunk("iTXt", Buffer.from("XML:com.adobe.xmp\0\0\0", "latin1"))])],
    ["PNG with compressed screenshot XMP", makePng(320, 240, [xmpChunk(SCREENSHOT_XMP, true)]), true],
    ["PNG with a colour profile", makePng(320, 240, [iccpChunk(makeIcc())]), true],
    ["PNG with a colour profile holding EXIF", makePng(320, 240, [iccpChunk(Buffer.concat([makeIcc(), Buffer.from("Exif\0\0", "latin1")]))]), true],
    ["PNG with a malformed colour profile chunk", makePng(320, 240, [pngChunk("iCCP", Buffer.from("\0\0xyz", "latin1"))])],
    ["PNG with colour, density and Apple chunks", makePng(320, 240, [pngChunk("sRGB", Buffer.from([0])), pngChunk("gAMA", Buffer.alloc(4)), pngChunk("pHYs", Buffer.alloc(9)), pngChunk("iDOT", Buffer.alloc(28))])],
    ["PNG with a time stamp", makePng(320, 240, [pngChunk("tIME", Buffer.alloc(7))])],
    ["PNG with a text note", makePng(320, 240, [pngChunk("tEXt", Buffer.from("Software\0Editor", "latin1"))])],
    ["PNG with an unknown chunk", makePng(320, 240, [pngChunk("abCd", Buffer.from("x"))])],
    ["PNG cut short", png.subarray(0, png.length - 20)],
    ["PNG without IEND", png.subarray(0, png.length - 12)],
    ["PNG with data after IEND", Buffer.concat([png, Buffer.from("trailing")])],
    ["PNG too small", makePng(200, 150)],
    ["PNG too large", Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024)])],
    ["not an image", Buffer.from("GIF89a, or anything else")],
    ["the self-test PNG", withPngChunks(new Uint8Array(png), testPngMetadata())],
  ];
  const jpeg = makeJpeg();
  const icc = makeIcc();
  const half = Math.floor(icc.length / 2);
  const iccSeg = (seq, total, data) => Buffer.concat([Buffer.from("ICC_PROFILE\0", "latin1"), Buffer.from([seq, total]), data]);
  cases.push(
    ["plain JPEG", jpeg],
    ["JPEG with JFIF", makeJpeg({ app: [[0xe0, Buffer.from("JFIF\0\x01\x02\0\0\x01\0\x01\0\0", "latin1")]] })],
    ["JPEG with a JFXX thumbnail", makeJpeg({ app: [[0xe0, Buffer.from("JFXX\0\x10", "latin1")]] })],
    ["JPEG with EXIF and GPS", makeJpeg({ app: [[0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiffWithGps()])]] })],
    ["JPEG with screenshot XMP", makeJpeg({ app: [[0xe1, Buffer.concat([Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1"), Buffer.from(SCREENSHOT_XMP)])]] })],
    ["JPEG with a colour profile", makeJpeg({ app: [[0xe2, iccSeg(1, 1, icc)]] })],
    ["JPEG with a split colour profile", makeJpeg({ app: [[0xe2, iccSeg(2, 2, icc.subarray(half))], [0xe2, iccSeg(1, 2, icc.subarray(0, half))]] })],
    ["JPEG with a colour profile holding another tag", makeJpeg({ app: [[0xe2, iccSeg(1, 1, makeIcc([["GPS ", Buffer.alloc(8)]]))]] })],
    ["JPEG with an Adobe flag", makeJpeg({ app: [[0xee, Buffer.from("Adobe\0\x64\0\0\0\0\x01", "latin1")]] })],
    ["JPEG with a long Adobe segment", makeJpeg({ app: [[0xee, Buffer.from("Adobe\0\x64\0\0\0\0\x01\x02", "latin1")]] })],
    ["JPEG with Photoshop data", makeJpeg({ app: [[0xed, Buffer.from("Photoshop 3.0\x008BIM", "latin1")]] })],
    ["JPEG with a comment", makeJpeg({ app: [[0xfe, Buffer.from("hello")]] })],
    ["JPEG with MPF", makeJpeg({ app: [[0xe2, Buffer.from("MPF\0MM\0*", "latin1")]] })],
    ["JPEG cut inside a segment", jpeg.subarray(0, 12)],
    ["JPEG without its end", jpeg.subarray(0, jpeg.length - 2)],
    ["JPEG with data after its end", Buffer.concat([jpeg, Buffer.from([0xff, 0xd8, 0xff, 0xe1])])],
    ["JPEG with a broken marker", Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0x00, 0x11]), jpeg.subarray(2)])],
    ["the self-test JPEG", withJpegSegments(new Uint8Array(jpeg), testJpegMetadata())],
  );
  return cases.map(([name, bytes, inflate]) => ({ name, bytes: Buffer.from(bytes), inflate: !!inflate }));
}

test("the page's check gives exactly lib.mjs's findings, and is stricter only where it cannot read compressed data", () => {
  const cases = corpus();
  assert.ok(cases.length >= 40);
  for (const { name, bytes, inflate } of cases) {
    const node = scanImage(bytes);
    const browser = browserScan(new Uint8Array(bytes));
    if (!inflate) assert.deepEqual(browser, node, name);
    else {
      assert.ok(fails(browser).length > 0, `${name}: the page refuses what it cannot read`);
      for (const code of fails(node)) assert.ok(fails(browser).length > 0, `${name}: never weaker than lib.mjs (${code})`);
    }
  }
  // The corpus reaches every finding the scanner can give, so no path of the copy goes untried.
  const seen = new Set(cases.flatMap(({ bytes }) => scanImage(bytes).findings.map((f) => f.code)));
  for (const code of ["EXIF_PRESENT", "GPS_PRESENT", "XMP_LOCATION", "XMP_FIELD", "XMP_PRESENT", "ICC_PROFILE", "PNG_TIME", "PNG_METADATA_CHUNK", "PNG_TRUNCATED", "DATA_AFTER_END", "JPEG_METADATA_SEGMENT", "JPEG_TRUNCATED", "JPEG_MALFORMED", "UNSUPPORTED_TYPE", "TOO_LARGE", "TOO_SMALL"])
    assert.ok(seen.has(code), `the corpus produces ${code}`);
});

test("cleaning keeps only the pixel chunks, unchanged, and the result passes lib.mjs's check with no finding", () => {
  const dirty = Buffer.concat([
    makePng(320, 240, [iccpChunk(makeIcc()), pngChunk("sRGB", Buffer.from([0])), pngChunk("pHYs", Buffer.alloc(9)), pngChunk("eXIf", tiffWithGps()), xmpChunk(SCREENSHOT_XMP), pngChunk("tEXt", Buffer.from("a\0b", "latin1")), pngChunk("tIME", Buffer.alloc(7)), pngChunk("iDOT", Buffer.alloc(28)), pngChunk("caBX", Buffer.from("c2pa"))]),
    Buffer.from("data after the end"),
  ]);
  assert.ok(fails(scanImage(dirty)).length > 0);
  const clean = pngEssentialChunks(new Uint8Array(dirty));
  assert.deepEqual(pngChunkTypes(clean), ["IHDR", "IDAT", "IEND"]);
  assert.deepEqual(scanImage(Buffer.from(clean)).findings, []);
  const idat = (bytes) => readPngChunks(bytes).chunks.find((c) => c.type === "IDAT").data;
  assert.deepEqual(Buffer.from(idat(clean)), Buffer.from(idat(new Uint8Array(dirty))), "the pixel data is copied unchanged");
  // A palette picture keeps its palette and transparency.
  const base = makePng();
  const ihdr = readPngChunks(new Uint8Array(base)).chunks[0];
  const paletted = Buffer.concat([base.subarray(0, ihdr.end), pngChunk("PLTE", Buffer.alloc(6)), pngChunk("tRNS", Buffer.from([0])), pngChunk("tEXt", Buffer.from("a\0b", "latin1")), base.subarray(ihdr.end)]);
  assert.deepEqual(pngChunkTypes(pngEssentialChunks(new Uint8Array(paletted))), ["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
  // Damaged input is refused rather than half-cleaned.
  const broken = Buffer.from(makePng());
  broken[broken.length - 20] ^= 0xff; // inside the IDAT data: its CRC no longer matches
  assert.throws(() => pngEssentialChunks(new Uint8Array(broken)), /damaged/);
  assert.throws(() => pngEssentialChunks(new Uint8Array(makeJpeg())), /not a PNG/);
  assert.throws(() => pngEssentialChunks(new Uint8Array(makePng().subarray(0, 40))), /past the end|no IEND/);
  const noPixels = Buffer.concat([makePng().subarray(0, 33), pngChunk("IEND", Buffer.alloc(0))]);
  assert.throws(() => pngEssentialChunks(new Uint8Array(noPixels)), /no pixel data/);
  // The self-test's picture is refused before cleaning and passes after.
  const selfTest = withPngChunks(new Uint8Array(makePng()), testPngMetadata());
  for (const code of ["EXIF_PRESENT", "GPS_PRESENT", "XMP_LOCATION", "PNG_METADATA_CHUNK"]) assert.ok(fails(scanImage(Buffer.from(selfTest))).includes(code), code);
  assert.deepEqual(scanImage(Buffer.from(pngEssentialChunks(selfTest))).findings, []);
  const selfTestJpeg = withJpegSegments(new Uint8Array(makeJpeg()), testJpegMetadata());
  for (const code of ["EXIF_PRESENT", "GPS_PRESENT", "JPEG_METADATA_SEGMENT", "XMP_LOCATION"]) assert.ok(fails(scanImage(Buffer.from(selfTestJpeg))).includes(code), code);
});

test("the page names what it removes", () => {
  const png = Buffer.concat([makePng(320, 240, [iccpChunk(makeIcc()), pngChunk("eXIf", tiffWithGps()), xmpChunk(SCREENSHOT_XMP), pngChunk("tIME", Buffer.alloc(7)), pngChunk("pHYs", Buffer.alloc(9)), pngChunk("abCd", Buffer.alloc(1))]), Buffer.from("x")]);
  assert.deepEqual(describeHiddenData(new Uint8Array(png)), ["colour profile", "EXIF data", "XMP data", "time stamp", "pixel density", "chunk abCd", "data after the end of the image"]);
  assert.deepEqual(describeHiddenData(new Uint8Array(makePng())), []);
  const jpeg = withJpegSegments(new Uint8Array(makeJpeg({ app: [[0xe2, Buffer.from("MPF\0", "latin1")]] })), testJpegMetadata());
  assert.deepEqual(describeHiddenData(Buffer.concat([jpeg, Buffer.from([0xff, 0xd8])])), ["EXIF data", "Photoshop data", "XMP data", "comment", "extra images (MPF)", "data after the end of the image"]);
  assert.deepEqual(describeHiddenData(new Uint8Array(makeJpeg())), []);
  assert.deepEqual(describeHiddenData(new Uint8Array(makeJpeg().subarray(0, 12))), ["a damaged or unusual file structure"]);
  assert.deepEqual(describeHiddenData(Buffer.from("\0\0\0\x18ftypheic")), ["a HEIC or HEIF file, with its EXIF data"]);
});

test("ByteBuffer behaves like Buffer wherever the scanner uses it", () => {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let n = 0; n < 300; n += 1) {
    const bytes = Buffer.from(Array.from({ length: Math.floor(rand() * 40) }, () => Math.floor(rand() * 256)));
    const ours = ByteBuffer.from(bytes);
    const a = Math.floor(rand() * 50) - 5;
    const b = Math.floor(rand() * 50) - 5;
    assert.equal(ours.toString("latin1", a, b), bytes.toString("latin1", a, b));
    assert.equal(ours.toString("utf8", a, b), bytes.toString("utf8", a, b), "utf8, replacement characters included");
    assert.equal(ours.toString("utf8"), bytes.toString("utf8"));
    if (bytes.length >= 4) {
      const o = Math.floor(rand() * (bytes.length - 3));
      assert.equal(ours.readUInt32BE(o), bytes.readUInt32BE(o));
      assert.equal(ours.readUInt32LE(o), bytes.readUInt32LE(o));
      assert.equal(ours.readUInt16BE(o), bytes.readUInt16BE(o));
      assert.equal(ours.readUInt16LE(o), bytes.readUInt16LE(o));
      const needle = bytes.subarray(o, o + 1 + Math.floor(rand() * 3));
      assert.equal(ours.includes(ByteBuffer.from(needle)), bytes.includes(needle));
      assert.equal(ours.indexOf(needle[0], o), bytes.indexOf(needle[0], o));
    }
    assert.equal(ours.subarray(1, 3) instanceof ByteBuffer, true);
    assert.equal(ours.equals(ByteBuffer.from(bytes)), true);
  }
  assert.equal(ByteBuffer.from("Exif\0\0", "latin1").equals(Buffer.from("Exif\0\0", "latin1")), true);
  assert.equal(ByteBuffer.from("é", "utf8").length, 2);
  assert.deepEqual([...ByteBuffer.concat([ByteBuffer.from([1, 2]), new Uint8Array([3])])], [1, 2, 3]);
  assert.equal(ByteBuffer.isBuffer(ByteBuffer.from([1])), true);
  assert.equal(ByteBuffer.isBuffer(new Uint8Array(1)), false);
  if (typeof zlib.crc32 === "function") for (const data of [Buffer.alloc(0), Buffer.from("IHDR"), Buffer.alloc(1000, 7)]) assert.equal(crc32(data), zlib.crc32(data));
  assert.equal(makePngChunk("tEXt", new Uint8Array([1])).length, 13);
  assert.equal(testExifTiff().length, 32);
});

test("the committed page is built from lib.mjs's current scanner, and can reach nothing outside", () => {
  const page = readFileSync(PAGE_PATH, "utf8");
  assert.equal(page, buildPage(), "run node tools/pow/build-clean-image.mjs and commit the result");
  assert.ok(page.includes(scannerSource()), "the scanner is copied verbatim");
  assert.ok(page.includes(coreSource()), "the cleaning code is copied verbatim");
  assert.ok(page.includes(`scanner ${scannerId()}`));
  const script = page.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script), "the page's script parses");
  // Nothing that loads or sends anything: no request APIs, no external files, frames or fonts.
  for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bimport\s*\(/, /<link\b/i, /<iframe\b/i, /<form\b/i, /\bsrc\s*=\s*["']?https?:/i, /\bhref\s*=\s*["']?https?:/i, /@import/i, /url\(\s*["']?https?:/i, /\.open\s*\(/, /navigator\.share/, /localStorage|sessionStorage|indexedDB|document\.cookie/])
    assert.doesNotMatch(page, pattern, String(pattern));
  // The only addresses in the page are XMP and RDF namespace names inside the scanner and the
  // self-test's sample text: strings it compares, never requests.
  const urls = [...page.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0]);
  for (const url of urls) assert.match(url, /^http:\/\/(?:ns\.adobe\.com\/|www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#)/, url);
  // The generator refuses a lib.mjs whose scanner it cannot find.
  assert.throws(() => scannerSource("export const MAX_EVIDENCE_BYTES = 1;\n"), /no longer defines|not found/);
});
