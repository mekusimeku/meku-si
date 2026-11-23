#!/usr/bin/env node
// Guards the public MCP authentication rule in this repository's docs:
// initialize / tools/list work without a key; every tools/call needs one.
// Fails if any Markdown file claims discovery or initialization needs a key.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2] ?? ".";
const STALE = [
  /key is required on every JSON-RPC POST/i,
  /requires the bearer key on every POST/i,
  /^Every POST requires the key/im,
  /Every JSON-RPC POST, including discovery/i,
  /requires? (a|an|the) ?(bearer|API|Agent API)? ?key on every (JSON-RPC )?POST/i,
  /key (is )?required[^.]*including initiali[sz]ation|key on every[^.]*including initiali[sz]ation/i,
];
// Dated history may quote the old rule; only that sentence is exempt, not its whole line.
const HISTORY_SENTENCE = /At that time MEKU required[^.]*\./g;

function* markdown(dir) {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* markdown(path);
    else if (name.endsWith(".md") || name === "llms.txt") yield path;
  }
}

const problems = [];
for (const file of markdown(ROOT)) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const checked = line.replace(HISTORY_SENTENCE, "");
    if (STALE.some((pattern) => pattern.test(checked)))
      problems.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
  });
}
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
if (!/`tools\/list` requests work without an API key/.test(readme))
  problems.push("README.md: missing the keyless initialize/tools/list rule");
if (!/Every `tools\/call` requires/.test(readme))
  problems.push("README.md: missing the tools/call key rule");

if (problems.length) {
  console.error("Stale MCP authentication wording:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("Public MCP authentication wording is consistent.");
