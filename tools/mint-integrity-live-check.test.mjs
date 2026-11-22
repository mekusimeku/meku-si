// Offline tests for tools/mint-integrity-live-check.mjs. No network: evaluate() is pure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ENDPOINTS, MINT, evaluate } from "./mint-integrity-live-check.mjs";

const ep = (n) => ENDPOINTS.find((e) => e.n === n);
const ok = (body, contentType = "text/plain") => ({ status: 200, contentType, body });
const guide = readFileSync(new URL("../docs/mekusi-agent-token.md", import.meta.url), "utf8");
const index = readFileSync(new URL("../agent-index.json", import.meta.url), "utf8");
const worker = (await import("../demos/a2ui-human-override/worker/worker.js")).default;
const w = async (p) => {
  const r = await worker.fetch(new Request("https://meku-human-override-a2ui.mekusi-team.workers.dev" + p));
  return { status: r.status, contentType: r.headers.get("content-type"), body: await r.text() };
};

test("twelve endpoints, numbered 1..12, exactly once", () => {
  assert.deepEqual(ENDPOINTS.map((e) => e.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test("PASS: approved guide, agent index and Worker responses", async () => {
  assert.equal(evaluate(ep(10), ok(guide)).result, "PASS");
  assert.equal(evaluate(ep(11), ok(index)).result, "PASS");
  assert.equal(evaluate(ep(8), await w("/token.json")).result, "PASS");
  assert.equal(evaluate(ep(9), await w("/llms.txt")).result, "PASS");
});

test("FAIL: one-character look-alike mint", () => {
  const bad = guide.replaceAll(MINT, MINT.slice(0, -1) + "P");
  const r = evaluate(ep(10), ok(bad));
  assert.equal(r.result, "FAIL");
});

test("FAIL: extra non-official pump address next to the real one", () => {
  const r = evaluate(ep(10), ok(guide + "\nAlso: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgpump"));
  assert.equal(r.result, "FAIL");
});

test("FAIL: 404, wrong token standard, wrong content type, broken JSON identity", async () => {
  assert.equal(evaluate(ep(1), { status: 404, contentType: "text/html", body: "" }).result, "FAIL");
  assert.equal(evaluate(ep(10), ok(guide.replaceAll("Token-2022", "SPL Token"))).result, "FAIL");
  const tj = await w("/token.json");
  assert.equal(evaluate(ep(8), { ...tj, contentType: "text/html" }).result, "FAIL");
  assert.equal(evaluate(ep(8), { ...tj, body: tj.body.replace('"agentSubscriptionsLive": false', '"agentSubscriptionsLive": true') }).result, "FAIL");
});

test("FAIL: removed wallet-approval rule or false buyer/subscription claim", () => {
  const noApproval = guide.replace(/requires owner consent and wallet approval/g, "is available").replace(/wallet owner controls signing/g, "");
  assert.equal(evaluate(ep(10), ok(noApproval)).result, "FAIL");
  assert.equal(evaluate(ep(10), ok(guide + "\nWe have our first verified buyer.")).result, "FAIL");
  assert.equal(evaluate(ep(10), ok(guide + "\nPaid agent subscriptions are now live.")).result, "FAIL");
});

test("UNKNOWN is never converted: network error, rate limit, challenge, metadata-only Moltbook", () => {
  assert.equal(evaluate(ep(1), { error: "ECONNRESET" }).result, "UNKNOWN");
  assert.equal(evaluate(ep(1), { status: 429, contentType: "text/html", body: "" }).result, "UNKNOWN");
  assert.equal(evaluate(ep(1), ok("<title>Just a moment...</title>", "text/html")).result, "UNKNOWN");
  assert.equal(evaluate(ep(12), ok("<html>Loading...</html>", "text/html")).result, "UNKNOWN");
  assert.equal(evaluate(ep(12), ok(JSON.stringify({ success: false }), "application/json")).result, "UNKNOWN");
});

test("PASS: Moltbook full post body via public API with the official mint", () => {
  const body = JSON.stringify({ success: true, post: { title: "Challenge the payment model", content: `Token-2022 mint ${MINT}` } });
  assert.equal(evaluate(ep(12), ok(body, "application/json")).result, "PASS");
});
