import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const start = html.indexOf("function machine()");
const end = html.indexOf("function a2uiFor(");
assert.ok(start >= 0 && end > start, "Must test the actual browser simulation code");
// Only the four small, repository-owned pure fixture functions are evaluated.
// No browser globals, network calls, wallet or production permissions exist here.
const source = html.slice(start, end);
const { machine, permit, gate, simulate } = vm.runInNewContext(
  `${source}\n({machine, permit, gate, simulate})`,
  {},
  { timeout: 1000 },
);

test("lilt case: revoke -> retry -> offline -> reconnect old permit -> DENY", () => {
  const state = machine();
  const token = permit("permit-20261115-stale", state);
  state.revoked.add(token.id);
  assert.equal(gate(state, token), "ABORT", "STOP must win before execution");

  state.online = false;
  state.epoch += 1;
  assert.equal(gate(state, token), "DENY", "offline must fail closed");

  state.online = true;
  assert.equal(gate(state, token), "DENY", "recovered stale permit must not execute");
  assert.equal(state.actionCount, 0, "no fake side effects, even after reconnect");
});

test("relabeling a revoked permit is not a fresh authorization", () => {
  const state = machine();
  const token = permit("revoked-id", state);
  state.revoked.add(token.id);
  // Attack 1: rename id while keeping the original epoch.
  assert.equal(gate(state, { ...token, id: "new-label" }), "DENY");
  // Attack 2: reconnection bumps epoch; attacker also copies that new value.
  state.epoch += 1;
  assert.equal(gate(state, { ...token, id: "new-label", epoch: state.epoch }), "DENY");
  assert.equal(state.actionCount, 0);
});

test("valid fresh issuance is separate from the revoked permit", () => {
  const state = machine();
  const old = permit("old-grant", state);
  state.revoked.add(old.id);
  state.epoch += 1;
  assert.equal(gate(state, old), "DENY");
  const fresh = permit("fresh-grant", state);
  assert.equal(gate(state, fresh), "EXECUTE");
  assert.equal(gate(state, fresh), "DENY");
  assert.equal(state.actionCount, 1);
  assert.throws(() => permit("fresh-grant", state), /duplicate test permit id/);
});

test("four browser demonstration results have exact scopes", () => {
  for (const scenario of ["revoke", "replay", "partition", "stale_retry"]) {
    const result = simulate(scenario);
    assert.equal(result.pass, true, `${scenario} should pass the local fixture`);
    assert.equal(result.mode, "LOCAL_SYNTHETIC");
    assert.equal(result.productionProof, false);
  }
  const result = simulate("stale_retry");
  assert.equal(result.observed, "ABORT → DENY → DENY → DENY");
  assert.equal(result.actionCount, 0);
  assert.match(result.detail, /Requires fresh authority/);
});

test("published demo exposes the fourth button and correct report count", () => {
  assert.match(html, /data-case="stale_retry"/);
  assert.match(html, /id="flag-stale_retry"/);
  assert.match(html, /const cases=\["revoke","replay","partition","stale_retry"\]/);
  assert.match(html, /0 OF 4 TESTED/);
  assert.match(html, /4-items.length/);
  assert.match(html, /productionProof:false/);
});
