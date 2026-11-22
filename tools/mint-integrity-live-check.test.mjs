// Offline tests for tools/mint-integrity-live-check.mjs. No network: evaluate() is pure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { APPROVED_SHA256, ENDPOINTS, MINT, evaluate } from "./mint-integrity-live-check.mjs";

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

test("Moltbook full post body with the official mint is UNKNOWN until its text is pinned", () => {
  const body = JSON.stringify({ success: true, post: { title: "Challenge the payment model", content: `Token-2022 mint ${MINT}` } });
  assert.equal(evaluate(ep(12), ok(body, "application/json")).result, "UNKNOWN"); // mint fine, but no reviewed snapshot pin yet
});

test("review fixes: off-host redirect, injected CF script, 'are live', zero buyers, missing type", () => {
  assert.equal(evaluate(ep(10), { ...ok(guide), finalUrl: "https://evil.example/x" }).result, "UNKNOWN");
  assert.equal(evaluate(ep(10), { ...ok(guide), finalUrl: "https://raw.githubusercontent.com/mekusimeku/meku-si/main/docs/mekusi-agent-token.md" }).result, "PASS");
  const wrong = guide.replaceAll(MINT, MINT.slice(0, -1) + "P") + '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>';
  assert.equal(evaluate(ep(10), ok(wrong)).result, "FAIL");
  assert.equal(evaluate(ep(10), ok(guide + "\nAgent subscriptions are live.")).result, "FAIL");
  // Not a false claim (no FAIL); changed content is UNKNOWN until its snapshot pin is reviewed.
  assert.equal(evaluate(ep(10), ok(guide + "\nThere are 0 verified buyers so far.")).result, "UNKNOWN");
  assert.equal(evaluate(ep(10), { status: 200, contentType: null, body: guide }).result, "FAIL");
});

test("final review: wrong mint hidden in an href or after a stray '<' fails", () => {
  const page = `<html>Token-2022 Solana ${MINT} Token ownership does not grant agent access. Paid agent access is not live. Wallet-owner approval required. A signature alone is not proof.`;
  const evil = "9xh8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump";
  assert.equal(evaluate(ep(1), ok(page + `<a href="https://jup.ag/swap/SOL-${evil}">Buy</a></html>`, "text/html")).result, "FAIL");
  assert.equal(evaluate(ep(1), ok(page + `< ${evil} ></html>`, "text/html")).result, "FAIL");
  // A planted challenge marker cannot hide a wrong mint.
  assert.equal(evaluate(ep(1), ok(page + ` ${evil} cf-chl-widget</html>`, "text/html")).result, "FAIL");
});

test("final review: hostile bodies are bounded in time and size", () => {
  const t0 = Date.now();
  evaluate(ep(1), ok("<a".repeat(1 << 19), "text/html"));
  evaluate(ep(1), ok("<".repeat(1 << 20), "text/html"));
  assert.ok(Date.now() - t0 < 5000, `evaluation took ${Date.now() - t0} ms`);
  assert.equal(evaluate(ep(1), ok("x".repeat(3 * 1024 * 1024), "text/html")).result, "UNKNOWN");
  assert.equal(evaluate(ep(1), { status: 200, contentType: "text/html", body: null }).result, "UNKNOWN");
});

test("final review: wider false buyer/subscription/access claims fail; the guide's own rule sentence passes", () => {
  for (const c of [
    "Our first verified buyer has arrived.", "First verified buyer confirmed!", "We've got our first verified buyer",
    "Paid agent access has launched.", "Agent subscriptions went live today.", "subscriptions are active",
    "Token holders get paid agent access.", "Owning the token unlocks agent access.",
  ]) assert.equal(evaluate(ep(10), ok(guide + "\n" + c)).result, "FAIL", c);
  assert.equal(evaluate(ep(10), ok(guide)).result, "PASS");
});

test("final review: negated required statements do not count", () => {
  const neg = guide
    .replace(/requires owner consent and wallet approval/g, "Wallet owner approval is not required")
    .replace(/wallet owner controls signing/g, "");
  assert.equal(evaluate(ep(10), ok(neg)).result, "FAIL");
});

test("final review: tampered JSON (extra enabling flag, duplicate key, extra field) fails", async () => {
  const tj = await w("/token.json");
  const extra = tj.body.replace('"agentSubscriptionsLive": false', '"agentSubscriptionsLive": false,\n  "tokenOwnershipGrantsAgentAccess": true');
  assert.equal(evaluate(ep(8), { ...tj, body: extra }).result, "FAIL");
  const dup = tj.body.replace('"agentSubscriptionsLive": false', '"agentSubscriptionsLive": true,\n  "agentSubscriptionsLive": false');
  assert.equal(evaluate(ep(8), { ...tj, body: dup }).result, "FAIL");
  // Endpoint 2: same shape as the published record; one extra enabling flag must fail.
  const record = {
    asset: { blockchain: "Solana", network: "mainnet-beta", mint: MINT, tokenProgram: "Token-2022" },
    market: { walletOwnerApprovalRequired: true },
    purchaseEvidence: { signatureAloneIsNotProof: true },
    access: { buyingTokenAloneGrantsAgentSubscription: false, agentSubscriptionsLive: false, autonomousAgentPurchasesAllowed: false },
  };
  const good = JSON.stringify(record, null, 2);
  assert.equal(evaluate(ep(2), ok(good, "application/json")).result, "UNKNOWN"); // passes every check, but is not the approved bytes
  const bad = JSON.stringify({ ...record, access: { ...record.access, paidAgentAccessLive: true } }, null, 2);
  assert.equal(evaluate(ep(2), ok(bad, "application/json")).result, "FAIL");
});

test("final review: same-host redirect to another path is UNKNOWN", () => {
  const r = evaluate(ep(10), { ...ok(guide), finalUrl: "https://raw.githubusercontent.com/attacker/fork/main/x.md" });
  assert.equal(r.result, "UNKNOWN");
});

const sha = (b) => createHash("sha256").update(b).digest("hex");

test("snapshot pins for endpoints 8–11 equal this repo's approved sources (update pins in the same PR)", async () => {
  assert.equal(APPROVED_SHA256[10], sha(readFileSync(new URL("../docs/mekusi-agent-token.md", import.meta.url))));
  assert.equal(APPROVED_SHA256[11], sha(readFileSync(new URL("../agent-index.json", import.meta.url))));
  assert.equal(APPROVED_SHA256[8], sha((await w("/token.json")).body));
  assert.equal(APPROVED_SHA256[9], sha((await w("/llms.txt")).body));
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) assert.match(APPROVED_SHA256[n], /^[0-9a-f]{64}$/);
  assert.equal(APPROVED_SHA256[12], null);
});

test("any change to approved content can never PASS: one appended space is UNKNOWN", async () => {
  assert.equal(evaluate(ep(10), ok(guide + " ")).result, "UNKNOWN");
  const tj = await w("/token.json");
  assert.equal(evaluate(ep(8), tj).result, "PASS");
  assert.equal(evaluate(ep(9), { ...(await w("/llms.txt")), body: (await w("/llms.txt")).body + "\nNew line." }).result, "UNKNOWN");
});

test("repeat review B1/B2: negations and wider false claims never PASS; known ones FAIL", () => {
  const base = guide.replace(/requires owner consent and wallet approval/g, "is available").replace(/wallet owner controls signing/g, "");
  for (const n of ["Wallet owner approval isn't required.", "Wallet owner approval is not needed.", "No wallet owner approval needed.", "Wallet-owner approval is unnecessary.", "You can skip wallet owner approval."])
    assert.equal(evaluate(ep(10), ok(base + "\n" + n)).result, "FAIL", n);
  const ref = `<html>Solana ${MINT}</html>`;
  for (const c of ["Paid agent subscriptions are now available.", "Subscriptions have launched.", "Token holders receive agent access.", "Our first AI agent buyer purchased MEKU.",
    "Subscriptions are now open.", "Agent access is now live.", "First buyer verified on-chain.", "Subscriptions: LIVE", "subscriptions&nbsp;are live"])
    assert.equal(evaluate(ep(5), ok(ref.replace("</html>", c + "</html>"), "text/html")).result, "FAIL", c);
  // A phrasing no pattern knows still cannot PASS on a pinned endpoint.
  assert.notEqual(evaluate(ep(10), ok(guide + "\nAgents can now subscribe with MEKUSI.")).result, "PASS");
});

test("repeat review N1/N3: claims in attributes and enabling string/flag names fail", () => {
  const page = `<html><meta name="description" content="Paid agent subscriptions are now live"> Solana ${MINT}</html>`;
  assert.equal(evaluate(ep(5), ok(page, "text/html")).result, "FAIL");
  const rec = { asset: { network: "mainnet-beta", mint: MINT, tokenProgram: "Token-2022" }, access: { agentSubscriptionsLive: false, buyingTokenAloneGrantsAgentSubscription: false },
    market: { walletOwnerApprovalRequired: true }, purchaseEvidence: { signatureAloneIsNotProof: true } };
  for (const extra of [{ subscriptionsActive: true }, { tokenUnlocksAgentAccess: true }, { paidAgentAccess: "live" }])
    assert.equal(evaluate(ep(2), ok(JSON.stringify({ ...rec, access: { ...rec.access, ...extra } }), "application/json")).result, "FAIL", JSON.stringify(extra));
});

test("third review N1/N2: Moltbook false claim never PASSes; challenge marker can't hide a missing rule", () => {
  const post = (content) => ok(JSON.stringify({ success: true, post: { title: "x", content } }), "application/json");
  const r = evaluate(ep(12), post(`${MINT} We just got our first independent AI agent buyer!`));
  assert.notEqual(r.result, "PASS");
  assert.equal(evaluate(ep(12), post(`${MINT} Holders get agent access.`)).result === "PASS", false);
  assert.equal(evaluate(ep(12), post("Old mint 9xh8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump")).result, "FAIL");
  assert.match(evaluate(ep(12), post(`Token-2022 ${MINT}`)).observedSha256, /^[0-9a-f]{64}$/);
  const noRules = `<html>Solana Token-2022 ${MINT} <div class="cf-chl-widget"></div></html>`;
  assert.equal(evaluate(ep(1), ok(noRules, "text/html")).result, "FAIL");
  assert.equal(evaluate(ep(1), ok("<title>Just a moment...</title>", "text/html")).result, "UNKNOWN");
});
