// Keeps docs/proof-of-work in step with the tools: every copy-paste record in the docs must be
// valid, the check table must match the verifier, and every relative link must resolve.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { recordProblems } from "./lib.mjs";
import { CHECKS } from "./verify.mjs";
import { consentRecord, evidenceRecord, openedRecord } from "./record.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, "..", "..", "docs", "proof-of-work");
const read = (name) => readFileSync(join(docs, name), "utf8");
const jsonBlocks = (text) => [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);

test("the human guide's two blocks are exactly the human records", () => {
  const blocks = jsonBlocks(read("human-guide.md")).map((b) => JSON.parse(b));
  assert.deepEqual(blocks, [consentRecord({ pilotId: "POW-001" }), evidenceRecord({ pilotId: "POW-001" })]);
});

test("every operator template becomes a valid record once its CAPITAL placeholders are filled", () => {
  const fill = (b) =>
    b
      .replaceAll("DEVELOPER_LOGIN", "example-dev")
      .replaceAll("HUMAN_LOGIN", "example-human")
      .replaceAll('"CODE"', '"K7QX29MD"')
      .replaceAll("NEXT", "7");
  const blocks = jsonBlocks(read("operator-runbook.md")).map((b) => JSON.parse(fill(b)));
  assert.deepEqual(
    blocks.map((r) => r.type),
    ["pilot_opened", "request_reviewed", "task_offered", "result_returned", "pilot_closed", "stop"],
  );
  for (const record of blocks) assert.deepEqual(recordProblems(record), [], record.type);
  assert.deepEqual(
    blocks[0],
    openedRecord({ pilotId: "POW-001", operator: "mekusimeku", developer: "example-dev", protocolUrl: "https://github.com/mekusimeku/meku-si/blob/main/docs/proof-of-work/protocol.md" }),
  );
});

test("the check table in records.md matches the verifier exactly", () => {
  const rows = [...read("records.md").matchAll(/^\| ([LRQHEDC]\d\d) \| ([^|]+) \|/gm)].map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(rows, CHECKS);
  assert.match(read("records.md"), new RegExp(`runs these ${CHECKS.length} checks`));
  assert.match(read("protocol.md"), new RegExp(`${CHECKS.length} automated checks`));
});

test("every relative link in the pilot docs points at a file that exists", () => {
  const files = ["protocol.md", "developer-guide.md", "human-guide.md", "operator-runbook.md", "records.md", "report-template.md"].map((f) => join(docs, f));
  files.push(join(here, "README.md"));
  for (const file of files) {
    for (const [, target] of readFileSync(file, "utf8").matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target) || target.startsWith("[")) continue;
      const path = resolve(dirname(file), target.split("#")[0]);
      assert.ok(existsSync(path), `${file}: broken link ${target}`);
    }
  }
});

test("commands quoted in the guides exist in the tools", () => {
  const usage = {
    "request.mjs": ["prepare", "check", "submit", "status", "reveal", "ready-manual", "import-submit", "import-status"],
    "record.mjs": ["opened", "reviewed", "offered", "consent", "evidence", "returned", "decision", "closed", "stop", "verification", "digest", "schema", "request-id-sha256", "hash-file", "check-image"],
  };
  for (const name of ["developer-guide.md", "operator-runbook.md", "protocol.md"]) {
    for (const [, tool, command] of read(name).matchAll(/tools\/pow\/(request\.mjs|record\.mjs) ([a-z-]+)/g))
      assert.ok(usage[tool].includes(command), `${name}: ${tool} ${command}`);
  }
  const requestSource = readFileSync(join(here, "request.mjs"), "utf8");
  for (const command of usage["request.mjs"]) assert.ok(requestSource.includes(`"${command}"`), command);
});
