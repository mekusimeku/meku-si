#!/usr/bin/env node
// Builds tools/pow/clean-image.html, the on-device image cleaner, from three sources:
//   clean-image.template.html  the page;
//   clean-image-core.mjs       the cleaning code, shared with the Node tests;
//   lib.mjs                    the evidence image scanner, copied verbatim, so that the page
//                              checks a cleaned file with the very code record.mjs check-image
//                              and verify.mjs use.
// The page needs no build tools and no network: it is one file.
//
//   node tools/pow/build-clean-image.mjs          write the page
//   node tools/pow/build-clean-image.mjs --check  exit 1 if the committed page is out of date

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const PAGE_PATH = join(here, "clean-image.html");
const TEMPLATE_PATH = join(here, "clean-image.template.html");
const CORE_PATH = join(here, "clean-image-core.mjs");
const LIB_PATH = join(here, "lib.mjs");

const SCANNER_START = "// ---------------------------------------------------------------------------\n// Evidence image checks (PNG and JPEG only).";
const SCANNER_LAST = "export const SHAPE_FINDINGS = ";
const SCANNER_CONSTANTS = ["MAX_EVIDENCE_BYTES", "MIN_EVIDENCE_SHORT_SIDE"];

/** The evidence image scanner of lib.mjs, as code the page can run: verbatim, minus "export". */
export function scannerSource(lib = readFileSync(LIB_PATH, "utf8")) {
  const constants = SCANNER_CONSTANTS.map((name) => {
    const found = lib.match(new RegExp(`^export const ${name} = [^\\n]+;$`, "m"));
    if (!found) throw new Error(`lib.mjs no longer defines ${name} on one line`);
    return found[0];
  });
  const start = lib.indexOf(SCANNER_START);
  const last = start < 0 ? -1 : lib.indexOf(SCANNER_LAST, start);
  if (start < 0 || last < 0) throw new Error("the evidence image scanner was not found in lib.mjs");
  const end = lib.indexOf(";\n", last) + 2;
  return [...constants, "", lib.slice(start, end)].join("\n").replace(/^export /gm, "");
}

/** The shared cleaning code, as code the page can run: verbatim, minus "export". */
export function coreSource(core = readFileSync(CORE_PATH, "utf8")) {
  if (/^\s*import\b/m.test(core)) throw new Error("clean-image-core.mjs must not import anything");
  return core.replace(/^export /gm, "");
}

export const scannerId = (source = scannerSource()) => createHash("sha256").update(source).digest("hex").slice(0, 12);

function fill(template, placeholder, value) {
  const parts = template.split(placeholder);
  if (parts.length !== 2) throw new Error(`the template must hold ${placeholder} exactly once`);
  return parts.join(value);
}

export function buildPage() {
  const scanner = scannerSource();
  const core = coreSource();
  for (const [name, code] of [["scanner", scanner], ["core", core]])
    if (/<\/script|<!--/i.test(code)) throw new Error(`the ${name} code holds text that would end the page's script`);
  let page = readFileSync(TEMPLATE_PATH, "utf8");
  page = fill(page, "/*@@CORE@@*/", core);
  page = fill(page, "/*@@SCANNER@@*/", scanner);
  page = fill(page, "@@SCANNER_ID@@", scannerId(scanner));
  return page;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const page = buildPage();
  if (process.argv.includes("--check")) {
    let committed = "";
    try {
      committed = readFileSync(PAGE_PATH, "utf8");
    } catch {}
    if (committed !== page) {
      console.error("tools/pow/clean-image.html is out of date: run node tools/pow/build-clean-image.mjs and commit the result.");
      process.exit(1);
    }
    console.log(`clean-image.html is up to date (scanner ${scannerId()}).`);
  } else {
    writeFileSync(PAGE_PATH, page);
    console.log(`Wrote ${PAGE_PATH} (scanner ${scannerId()}).`);
  }
}
