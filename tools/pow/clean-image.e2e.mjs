#!/usr/bin/env node
// Browser run of the image cleaner page, for a machine with Playwright, its Chromium and sharp
// (not needed by CI or by anyone using the page). It serves clean-image.html under a content
// security policy that allows no network access at all, opens it as an iPhone would (viewport,
// touch, user agent), cleans realistic phone pictures, saves each result through the page's own
// button, and checks every saved file with lib.mjs's scanImage and against the original's pixels.
// Chromium is not Safari: the founder's iPhone test in docs/proof-of-work/image-cleaner.md is.
//
//   node tools/pow/clean-image.e2e.mjs [output-folder]

import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { testExifTiff, testJpegMetadata, withJpegSegments, withPngChunks, makePngChunk, joinBytes, asciiBytes } from "./clean-image-core.mjs";
import { scanImage } from "./lib.mjs";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const sharp = require("sharp");

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(tmpdir(), `pow-clean-e2e-${Date.now()}`);
mkdirSync(out, { recursive: true });
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; base-uri 'none'; form-action 'none'";

// ---- Realistic inputs ------------------------------------------------------------------------

async function photoLike(width, height, { alpha = false } = {}) {
  // Smooth light with grain, like a photo of paper on a table, plus handwriting-sized text.
  const noise = await sharp({ create: { width, height, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 40 } } }).blur(1.2).png().toBuffer();
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c7a27a"/><stop offset="1" stop-color="#6b4a2f"/></linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#g)" opacity="0.82"/>` +
      `<rect x="${width * 0.12}" y="${height * 0.28}" width="${width * 0.62}" height="${height * 0.3}" fill="#f4f1ea"/>` +
      `<text x="${width * 0.16}" y="${height * 0.45}" font-size="${Math.round(height / 14)}" font-family="sans-serif" fill="#1d2a6b">K7QX29MD 4F</text>` +
      `<circle cx="${width * 0.82}" cy="${height * 0.62}" r="${Math.min(width, height) * 0.1}" fill="#d23b2a"/></svg>`,
  );
  let img = sharp(noise).composite([{ input: svg, blend: "over" }]);
  if (alpha) img = img.ensureAlpha().composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width / 2}" height="${height}" fill="#000" fill-opacity="0.6"/></svg>`), blend: "dest-out" }]);
  return img;
}

const xmp = (extra) =>
  `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"><exif:UserComment>Screenshot</exif:UserComment>${extra}</rdf:Description></rdf:RDF></x:xmpmeta>`;

async function inputs() {
  const list = [];
  // 1. An iPhone screenshot as Photos keeps it: Display P3 profile, EXIF, XMP, density, time.
  const shot = await (await photoLike(1179, 2556)).withIccProfile("p3").png({ compressionLevel: 6 }).toBuffer();
  list.push({
    name: "iphone-screenshot.png",
    bytes: withPngChunks(new Uint8Array(shot), [
      makePngChunk("eXIf", testExifTiff()),
      makePngChunk("iTXt", joinBytes([asciiBytes("XML:com.adobe.xmp\0\0\0\0\0"), new TextEncoder().encode(xmp("<photoshop:DateCreated>2026-11-28T14:20:00</photoshop:DateCreated>"))])),
      makePngChunk("pHYs", new Uint8Array([0, 0, 0x16, 0x25, 0, 0, 0x16, 0x25, 1])),
      makePngChunk("tIME", new Uint8Array([0x07, 0xea, 11, 28, 7, 20, 0])),
    ]),
    expect: { width: 1179, height: 2556 },
  });
  // 2. A cropped, edited screenshot as an upload turns it into: JPEG with EXIF and GPS, Photoshop
  //    data, XMP, a Display P3 profile and a comment.
  const crop = await (await photoLike(1284, 944)).withIccProfile("p3").jpeg({ quality: 90 }).toBuffer();
  list.push({ name: "cropped-edit.jpg", bytes: withJpegSegments(new Uint8Array(crop), testJpegMetadata()), expect: { width: 1284, height: 944 } });
  // 3. A photo stored sideways with an orientation tag: the clean copy must stand upright.
  const sideways = await (await photoLike(640, 480)).jpeg({ quality: 92 }).withMetadata({ orientation: 6 }).toBuffer();
  list.push({ name: "sideways-photo.jpg", bytes: new Uint8Array(sideways), expect: { width: 480, height: 640 } });
  // 4. A picture with transparency and a text note: the transparency is kept.
  const clear = await (await photoLike(600, 400, { alpha: true })).png().toBuffer();
  list.push({ name: "transparent.png", bytes: withPngChunks(new Uint8Array(clear), [makePngChunk("tEXt", asciiBytes("Comment\0made by an editor"))]), expect: { width: 600, height: 400 } });
  // 5. The largest iPhone screenshot (iPhone 16 Pro Max), of a photo.
  const largest = await (await photoLike(1320, 2868)).withIccProfile("p3").png({ compressionLevel: 6 }).toBuffer();
  list.push({ name: "largest-screenshot.png", bytes: new Uint8Array(largest), expect: { width: 1320, height: 2868 } });
  // 6. A picture too small for evidence: the page must refuse it and offer no file.
  const tiny = await (await photoLike(200, 150)).png().toBuffer();
  list.push({ name: "too-small.png", bytes: new Uint8Array(tiny), expect: { width: 200, height: 150 }, refuse: true });
  // 7. A blank picture of one flat colour: refused, nothing to save.
  const flat = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#ffffff" } }).png().toBuffer();
  list.push({ name: "blank.png", bytes: new Uint8Array(flat), expect: { width: 800, height: 600 }, refuse: true });
  for (const item of list) writeFileSync(join(out, item.name), item.bytes);
  return list;
}

// What the picture looks like, as sRGB pixels after orientation: the reference for the clean copy.
async function referencePixels(bytes) {
  const { data, info } = await sharp(Buffer.from(bytes)).rotate().toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function compare(a, b) {
  if (a.width !== b.width || a.height !== b.height) return { sameSize: false };
  let max = 0;
  let sum = 0;
  let over8 = 0;
  const pixels = a.width * a.height;
  for (let i = 0; i < a.data.length; i += 4) {
    let d = Math.abs(a.data[i + 3] - b.data[i + 3]);
    if (a.data[i + 3] >= 32) d = Math.max(d, Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    max = Math.max(max, d);
    sum += d;
    if (d > 8) over8 += 1;
  }
  return { sameSize: true, max, mean: +(sum / pixels).toFixed(3), shareOver8: +(over8 / pixels).toFixed(5) };
}

// ---- Run ---------------------------------------------------------------------------------------

const page = readFileSync(join(here, "clean-image.html"));
const server = createServer((req, res) => {
  if (req.url === "/" || req.url === "/clean-image.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP });
    res.end(page);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const device = devices["iPhone 15 Pro"] ?? devices["iPhone 13"];
const context = await browser.newContext({ ...device, acceptDownloads: true });
const tab = await context.newPage();
const requests = [];
const problems = [];
tab.on("request", (r) => requests.push(r.url()));
tab.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
tab.on("console", (m) => {
  if (m.type() === "error" || /Content Security Policy/i.test(m.text())) problems.push(`console: ${m.text()}`);
});
await tab.goto(base);
await tab.screenshot({ path: join(out, "page-empty.png"), fullPage: true });

const results = [];
for (const item of await inputs()) {
  await tab.setInputFiles("#file", join(out, item.name));
  await tab.waitForSelector("#status.ok, #status.bad", { timeout: 120000 });
  const status = (await tab.textContent("#status")).trim();
  const ok = await tab.$eval("#status", (el) => el.classList.contains("ok"));
  const facts = await tab.$$eval("#facts dt", (dts) => Object.fromEntries(dts.map((dt) => [dt.textContent, dt.nextElementSibling.textContent])));
  const removed = await tab.$$eval("#removed li", (lis) => lis.map((li) => li.textContent));
  const saveDisabled = (await tab.isHidden("#report")) ? "hidden" : await tab.getAttribute("#save", "aria-disabled");
  const previewHidden = await tab.isHidden("#preview");
  const row = { input: item.name, inputBytes: item.bytes.length, inputFindings: scanImage(Buffer.from(item.bytes)).findings.map((f) => f.code), pageVerdict: ok ? "ready" : "not ready", saveDisabled, previewHidden, status, facts, removed, refuse: !!item.refuse };
  if (ok) {
    if (item.name === "iphone-screenshot.png") await tab.screenshot({ path: join(out, "page-cleaned.png"), fullPage: true });
    const [download] = await Promise.all([tab.waitForEvent("download"), tab.click("#save")]);
    const saved = join(out, `clean-${item.name.replace(/\.\w+$/, "")}.png`);
    await download.saveAs(saved);
    const bytes = readFileSync(saved);
    const scan = scanImage(bytes);
    const meta = await sharp(bytes).metadata();
    const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const reference = await referencePixels(item.bytes);
    Object.assign(row, {
      savedAs: download.suggestedFilename(),
      savedBytes: bytes.length,
      scannerFindings: scan.findings.map((f) => `${f.level} ${f.code}`),
      size: `${meta.width}x${meta.height}`,
      expectedSize: `${item.expect.width}x${item.expect.height}`,
      channels: meta.channels,
      hasProfile: !!meta.icc,
      exif: !!meta.exif,
      xmp: !!meta.xmp,
      pixelsVsOriginal: compare({ data: decoded.data, width: decoded.info.width, height: decoded.info.height }, reference),
    });
  }
  results.push(row);
}

await tab.click("#selftest summary");
await tab.click("#run-test");
await tab.waitForFunction(() => document.querySelectorAll("#test-results li").length >= 5, null, { timeout: 120000 });
const selfTest = await tab.$$eval("#test-results li", (lis) => lis.map((li) => li.textContent));
await tab.screenshot({ path: join(out, "page-selftest.png"), fullPage: true });

await browser.close();
server.close();

const outside = requests.filter((url) => !url.startsWith(base) && !url.startsWith("blob:") && !url.startsWith("data:"));
const report = { browser: `${device?.userAgent ?? "Chromium"} (Chromium engine)`, csp: CSP, requests, outside, problems, results, selfTest };
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
const failed =
  outside.length > 0 ||
  problems.length > 0 ||
  !selfTest.some((t) => t.includes("This browser cleans pictures correctly")) ||
  results.some((r) =>
    r.refuse
      ? r.pageVerdict !== "not ready" || !["true", "hidden"].includes(r.saveDisabled) || (r.saveDisabled === "hidden" && !r.previewHidden)
      : r.pageVerdict !== "ready" || r.saveDisabled !== "false" || r.scannerFindings.length || r.size !== r.expectedSize || r.pixelsVsOriginal.shareOver8 > 0.001,
  );
console.log(failed ? "\nE2E: FAIL" : `\nE2E: PASS (files in ${out})`);
process.exit(failed ? 1 : 0);
