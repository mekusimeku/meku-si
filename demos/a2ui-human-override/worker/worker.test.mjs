// Offline regression test for the deployed Human Override A2UI Worker source of record.
// No network, no secrets, no wallet: the Worker module is imported and called with synthetic Requests.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const MINT = "J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump";
const ORIGIN = "https://meku-human-override-a2ui.mekusi-team.workers.dev";
// SHA-256 of the worker.js module deployed on Cloudflare (deployment 5c69ed4a, 2026-11-15T13:12:35Z),
// read back through the Cloudflare API on 2026-11-22. Changing worker.js must update this pin
// in the same reviewed PR, so source and deployment cannot drift silently.
const DEPLOYED_SHA256 = "cf41f5b8b42f3392b1a57dac85b00c32b8196ed557cb9e3851ad6468900a339a";

const source = readFileSync(new URL("./worker.js", import.meta.url));
const worker = (await import(new URL("./worker.js", import.meta.url))).default;
const get = (path, method = "GET") => worker.fetch(new Request(ORIGIN + path, { method }));

test("source of record matches the pinned deployed module", () => {
  assert.equal(createHash("sha256").update(source).digest("hex"), DEPLOYED_SHA256);
});

test("only the official mint appears, with exact case", () => {
  const text = source.toString("utf8");
  const pumpLike = new Set(text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}pump/g) ?? []);
  assert.deepEqual([...pumpLike], [MINT]);
  // Look-alikes that keep the official prefix but change any later character.
  const lookalikes = new Set(text.match(/J5h8[1-9A-HJ-NP-Za-km-z]{36,44}/g) ?? []);
  assert.deepEqual([...lookalikes], [MINT]);
  assert.equal((text.match(new RegExp(MINT.toLowerCase(), "g")) ?? []).length, 0);
});

test("/token.json: 200 JSON, Solana Mainnet Token-2022, subscriptions not live", async () => {
  const r = await get("/token.json");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /^application\/json/);
  const t = await r.json();
  assert.equal(t.mint, MINT);
  assert.equal(t.network, "Solana Mainnet");
  assert.equal(t.program, "Token-2022");
  assert.equal(t.agentSubscriptionsLive, false);
  assert.equal(t.safetyLabReadOnly, true);
  assert.equal(t.canonical, "https://meku.farm/.well-known/meku-si-token.json");
});

test("/llms.txt: 200 text/plain with mint, approval, verification and no-access rules", async () => {
  const r = await get("/llms.txt");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /^text\/plain/);
  const t = await r.text();
  assert.ok(t.includes(`Solana Mainnet Token-2022 mint: ${MINT}`));
  assert.match(t, /owner wallet approval/);
  assert.match(t, /independent verification/);
  assert.match(t, /Holding a token does not activate agent access/);
  assert.match(t, /cannot trade or sign/);
});

test("discovery manifest: token ownership grants no access, no trading in the lab", async () => {
  const m = await (await get("/.well-known/meku-discovery.json")).json();
  assert.equal(m.token_identity.mint, MINT);
  assert.equal(m.token_identity.token_program, "Token-2022");
  assert.equal(m.token_identity.token_ownership_grants_agent_access, false);
  assert.equal(m.token_identity.lab_trade_capability, false);
  assert.equal(m.status.mission_payments_enabled, false);
  assert.equal(m.policies.no_automatic_transactions, true);
});

test("page shows the mint, unknown paths 404, writes are refused", async () => {
  const page = await (await get("/")).text();
  assert.ok(page.includes(MINT) && page.includes("TOKEN-2022"));
  assert.equal((await get("/does-not-exist")).status, 404);
  assert.equal((await get("/token.json", "POST")).status, 405);
});

test("no claim of verified buyers or live subscriptions anywhere in the Worker", () => {
  const text = source.toString("utf8");
  assert.doesNotMatch(text, /verified (independent )?buyer|subscriptions? (are|is) (now )?live/i);
});
