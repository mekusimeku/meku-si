#!/usr/bin/env node
// MEKU SI Official Mint Integrity — read-only live check of the twelve public endpoints.
// Intended to be called by the existing daily "MEKU SI Official Mint Integrity Watch";
// it does not schedule itself. GET requests only: no keys, no wallet, no writes, no paid APIs.
//
// Each endpoint is reported as:
//   PASS    verified correct from the live response body
//   FAIL    confirmed incorrect (wrong/look-alike mint, 404, missing rule, false claim)
//   UNKNOWN could not verify (network error, rate limit, bot challenge, client-rendered shell)
// UNKNOWN is never turned into PASS or FAIL. Exit code: 1 if any FAIL, else 2 if any UNKNOWN, else 0.
// Limits: look-alike detection covers the official prefix and pump-suffixed addresses only (other base58
// addresses in buy links are not flagged); a mint split by inline HTML tags reads as missing (a false FAIL,
// never a false PASS). Endpoints 8 and 9 (the A2UI Worker) are checked against the rules that Worker states
// today, a subset of the full public rules A–E; widening them needs a reviewed Worker update and approved redeploy.
const MAX_BODY = 2 * 1024 * 1024;

// Approved snapshots: SHA-256 of each endpoint's reviewed body. PASS requires the live bytes to equal the
// approved bytes AND every check below to pass, so wording the heuristics miss can never PASS — any change
// is UNKNOWN until a human reviews it and updates the pin here in a reviewed PR. Endpoints 1–7 are
// screenshot-magic-5054 main 4bf4758 public/ files (equal to live per Cloudflare URL Scanner, 2026-11-22);
// 8–9 are the deployed Worker's output; 10–11 are this repo's files (CI checks they match). Endpoint 12
// (Moltbook API JSON includes changing counters) has no pin: its PASS rests on the mint and claim checks only.
export const APPROVED_SHA256 = {
  1: "b691dfb042635dcd2c255a3fdb1cf04ee381592dbafe71b9869dfae8da77ad35",
  2: "c7ae1551ab614abc9cbbb0762ceefb4a4c7b0fb3631e9174ac371a5e95847b16",
  3: "90070de6c2e162a8f13a6314c2b3a55f8ad081def076eda1c1a027f0879149be",
  4: "ee361bd08528dfd11d7521c768632128ea1170600c6f0b8006e524f26594ebd6",
  5: "7e284fc95b96189a1bc6b13ba46468530a5354931e7fdc1b38ed45044ac7e1e5",
  6: "5d3873310d6d0374b2cba7450e64f4db40d378691ea97aaa5cea023e61e9aca8",
  7: "24bc9fced00006df6c80397bfa7aad0236928e7397d147996ae8be21f74b0402",
  8: "2383ebe01b96ad78845f0f59c2de15a5af54e850a0e0300fc53bd83440d4033f",
  9: "a26f305aa84f35818597e2c2427aaaf3aa32e139a43eca8986f671973f88a1d8",
  10: "a5328633eaab423d72934664c61ceece46a4d37580bb931335d41e7f5deab1ab",
  11: "c806d13073d51512800ea24c35d25fbaf191bab4a6aa4177825210524baba26e",
};
// Usage: node tools/mint-integrity-live-check.mjs [--json]

import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

export const MINT = "J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump";
const W = "https://meku-human-override-a2ui.mekusi-team.workers.dev";
const GH = "https://raw.githubusercontent.com/mekusimeku/meku-si/main";
const MOLT_ID = "38a643a5-011b-447b-9756-8f25cb376fee";

// Rules a page must state where token identity/purchase is presented (see founder rules A–E).
const RULE = {
  noAccess: /(does not|do not|doesn['’]t)( currently)? (activate|grant)[^.]{0,60}(subscription|access)|token_ownership_does_not_activate_agent_subscription"\s*:\s*true|buyingTokenAloneGrantsAgentSubscription"\s*:\s*false|grants_agent_access"\s*:\s*false|does not grant agent access|separate from paid MEKU agent access|purchase is not payment for (MEKU )?agent access/i,
  notLive: /(subscriptions?|paid agent access)[^.]{0,80}(not live|disabled|unavailable|not evidenced as live)|agentSubscriptionsLive"\s*:\s*false|paid_agent_subscription_enabled"\s*:\s*false|does not currently activate/i,
  approval: /(wallet[- ]owner|owner wallet|person controlling the wallet)[^.]{0,40}(approv|consent)|walletOwnerApprovalRequired"\s*:\s*true|wallet_owner_approval_required"\s*:\s*true|owner consent and wallet approval/i,
  evidence: /signature (alone|by itself)[^.]{0,40}(not|insufficient)|signatureAloneIsNotProof"\s*:\s*true|independently_verified_purchase_required_for_claims"\s*:\s*true|signatures?[^.]{0,60}(alone )?(are|is) not proof/i,
};
// Assertive claims only; headings and rules such as "we will not call this a first independent buyer unless…" are allowed.
const FALSE_CLAIM = /\b(we (have|now have|welcomed|confirmed|onboarded)|has (its|our) first|[1-9]\d*) (our |an? |its )?(first )?(verified |independent )+(ai[- ]agent )?buyers?\b|\bverified buyers?\s*:\s*[1-9]|subscriptions? (are|is) (now )?live|paid agent (access|subscriptions?) (is|are) (now )?live/i;

const FALSE_CLAIM_2 = /\bfirst (verified |independent )+(ai[- ]agent )?buyers? (has|have|is|was|arrived|confirmed|purchased|bought)\b|\b(we['’]ve|we have) (got|gotten|had) (our |an? )?(first )?(verified |independent )+buyers?\b|\b(subscriptions?|paid agent access) (went|has gone|is going|have gone) live\b|\b(paid |agent )*subscriptions? (are|is|have|has) (now )?(active|available|open|launched|enabled|live)\b|\bsubscriptions?\s*:\s*(live|active|on)\b|\bagent access (is|has) (now )?(live|launched|active|open)\b|\bfirst (ai[- ]agent |verified |independent )*buyers? (has|have|is|was|arrived|confirmed|purchased|bought|verified)\b|\bpaid agent access (has )?(launched|is active|is available)\b|\b(token|holding|owning)(?:(?!\bnot\b|n['’]t\b|\bnever\b|\bno\b|\bwithout\b)[^.]){0,30}\b(unlocks?|grants?|gives?|gets?|receives?|provides?|includes?) (you )?(paid )?agent access\b/i;
// A required statement does not count when its own wording negates it.
const NEGATED = /\b((is|are)?n['’]?o?t (required|needed|necessary)|unnecessary|optional|no longer|is proof|is sufficient|is enough|not insufficient)\b/i;
const NEGATED_BEFORE = /\b(no|without|skip|never)\s+$/i;
function stated(rule, text) {
  const g = new RegExp(rule.source, "gi");
  for (const m of text.matchAll(g)) if (!NEGATED.test(text.slice(m.index, m.index + m[0].length + 40)) && !NEGATED_BEFORE.test(text.slice(Math.max(0, m.index - 12), m.index))) return true;
  return false;
}
// Any boolean that would turn on access, payments or purchases fails a JSON identity record.
function enablingFlags(v, path = "") {
  if (!v || typeof v !== "object") return [];
  return Object.entries(v).flatMap(([k, x]) =>
    (x === true || /^(live|active|enabled|on)$/i.test(String(x))) && /(live|enabled|allowed|grants|active|unlock|access)/i.test(k) && !/not|never|required|readonly/i.test(k) ? [path + k] : enablingFlags(x, path + k + "."));
}
const duplicateKey = (body, keys) => keys.find((k) => (body.match(new RegExp(`"${k}"\\s*:`, "g")) ?? []).length > 1);

// kind: identity = full token identity record; reference = shows mint only (no rule repetition required)
export const ENDPOINTS = [
  { n: 1, url: "https://meku.farm/token.html", type: /text\/html/, kind: "identity", rules: ["noAccess", "notLive", "approval", "evidence"] },
  { n: 2, url: "https://meku.farm/.well-known/meku-si-token.json", type: /application\/json/, kind: "identity", rules: ["noAccess", "notLive", "approval", "evidence"],
    json: (j) => j.asset?.mint === MINT && j.asset?.tokenProgram === "Token-2022" && j.asset?.network === "mainnet-beta" && j.access?.agentSubscriptionsLive === false,
    keys: ["mint", "tokenProgram", "network", "agentSubscriptionsLive", "buyingTokenAloneGrantsAgentSubscription", "walletOwnerApprovalRequired", "signatureAloneIsNotProof"] },
  { n: 3, url: "https://meku.farm/llms.txt", type: /text\/plain/, kind: "identity", rules: ["noAccess", "notLive"] },
  { n: 4, url: "https://meku.farm/agent-quickstart.html", type: /text\/html/, kind: "identity", rules: ["noAccess", "notLive", "evidence"] },
  { n: 5, url: "https://meku.farm/mcp-lab.html", type: /text\/html/, kind: "reference", rules: [] },
  { n: 6, url: "https://meku.farm/first-contact.html", type: /text\/html/, kind: "reference", rules: [] },
  { n: 7, url: "https://meku.farm/.well-known/meku-first-contact.json", type: /application\/json/, kind: "reference", rules: ["noAccess"],
    json: (j) => j.networkReference?.listedSiteAddress === MINT && j.networkReference?.tokenProgram === "Token-2022" && j.safety?.realMissionPaymentsEnabled === false,
    keys: ["listedSiteAddress", "tokenProgram", "realMissionPaymentsEnabled"] },
  { n: 8, url: `${W}/token.json`, type: /application\/json/, kind: "identity", rules: ["notLive"],
    // Fixed record: must equal the approved Worker object exactly (no extra, missing or changed fields).
    json: (j) => JSON.stringify(j) === JSON.stringify({ schemaVersion: "meku-a2ui-token-reference-v1", label: "MEKU SI", network: "Solana Mainnet", program: "Token-2022", mint: MINT, canonical: "https://meku.farm/.well-known/meku-si-token.json", human: "https://meku.farm/token.html", safetyLabReadOnly: true, agentSubscriptionsLive: false }),
    keys: ["mint", "program", "network", "agentSubscriptionsLive"] },
  { n: 9, url: `${W}/llms.txt`, type: /text\/plain/, kind: "identity", rules: ["noAccess", "approval"] },
  { n: 10, url: "https://github.com/mekusimeku/meku-si/blob/main/docs/mekusi-agent-token.md", fetch: `${GH}/docs/mekusi-agent-token.md`, type: /text\/plain/, kind: "identity", rules: ["noAccess", "notLive", "approval", "evidence"] },
  { n: 11, url: "https://github.com/mekusimeku/meku-si/blob/main/agent-index.json", fetch: `${GH}/agent-index.json`, type: /text\/plain|application\/json/, kind: "identity", rules: ["noAccess", "notLive", "approval", "evidence"] },
  // Moltbook pages are client-rendered shells; the public post API is the only full-body source. Never written to.
  { n: 12, url: `https://www.moltbook.com/post/${MOLT_ID}`, fetch: `https://www.moltbook.com/api/v1/posts/${MOLT_ID}`, type: /application\/json/, kind: "reference", rules: [], moltbook: true },
];

function addresses(text) {
  const near = new Set(text.match(/J5h8[1-9A-HJ-NP-Za-km-z]{36,44}/g) ?? []);
  for (const a of text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}pump\b/g) ?? []) near.add(a);
  return [...near];
}

/** Pure evaluation of one fetched response; exported for offline tests. */
export function evaluate(ep, { status, contentType, body, error, finalUrl }) {
  const r = (result, reason) => ({ n: ep.n, url: ep.url, result, reason, status: status ?? null });
  if (error) return r("UNKNOWN", `request failed: ${error}`);
  if (status === 404 || status === 410) return r("FAIL", `HTTP ${status}`);
  if (status === 429 || status === 403 || status === 503 || status >= 500) return r("UNKNOWN", `HTTP ${status} (rate limit, challenge or outage)`);
  if (status !== 200) return r("UNKNOWN", `HTTP ${status}`);
  if (typeof body !== "string") return r("UNKNOWN", "no response body");
  if (body.length > MAX_BODY) return r("UNKNOWN", `body larger than ${MAX_BODY} bytes, not evaluated`);
  if (finalUrl) {
    const want = new URL(ep.fetch ?? ep.url);
    let got; try { got = new URL(finalUrl); } catch { got = null; }
    if (!got || got.origin !== want.origin || got.pathname !== want.pathname) return r("UNKNOWN", `redirected away from the requested URL: ${finalUrl}`);
  }
  // Wrong mints are searched in the raw body first, so attributes (href, data-*) and planted markers can't hide them.
  const rawWrong = addresses(body).filter((a) => a !== MINT);
  if (rawWrong.length) return r("FAIL", `non-official mint-like address: ${rawWrong.join(", ")}`);
  // Only a real interstitial counts; Cloudflare's injected /cdn-cgi/challenge-platform/ script on normal pages does not.
  if (/<title>\s*Just a moment\.\.\.|id="challenge-form"|cf-chl-widget/i.test(body)) return r("UNKNOWN", "bot challenge page");
  let text = body;
  if (ep.moltbook) {
    let j; try { j = JSON.parse(body); } catch { return r("UNKNOWN", "Moltbook API did not return JSON"); }
    if (!j?.success || !j.post) return r("UNKNOWN", "Moltbook post body not available (metadata only)");
    text = `${j.post.title ?? ""}\n${j.post.content ?? ""}`;
  }
  // Rules are read from visible wording: drop HTML tags and markdown emphasis, collapse whitespace.
  // Claim-bearing attributes (meta content, alt, title) are kept as text so claims there are checked too.
  const attrs = (body.match(/\b(?:content|alt|title)\s*=\s*"[^"]{0,500}"/gi) ?? []).map((a) => a.slice(a.indexOf('"') + 1, -1)).join(" . ");
  text = (text + " . " + attrs).replace(/&nbsp;|&#160;/gi, " ").replace(/<[^<>]*>/g, " ").replace(/\*\*|__/g, "").replace(/\s+/g, " ");
  const found = addresses(text);
  const wrong = found.filter((a) => a !== MINT);
  if (wrong.length) return r("FAIL", `non-official mint-like address: ${wrong.join(", ")}`);
  if (!text.includes(MINT)) return r("FAIL", "official mint missing");
  if (ep.kind === "identity" && !/Token-2022/.test(text)) return r("FAIL", "Token-2022 designation missing");
  if (ep.kind === "identity" && !/Solana/i.test(text)) return r("FAIL", "Solana network missing");
  if (ep.type && !ep.type.test(contentType ?? "")) return r("FAIL", `unexpected content-type ${contentType ?? "(none)"}`);
  if (ep.json) {
    let j; try { j = JSON.parse(body); } catch { return r("FAIL", "body is not valid JSON"); }
    if (!ep.json(j)) return r("FAIL", "JSON identity fields differ from the approved record");
    const dup = duplicateKey(body, ep.keys ?? []);
    if (dup) return r("FAIL", `duplicate JSON key: ${dup}`);
    const on = enablingFlags(j);
    if (on.length) return r("FAIL", `enabling flag set to true: ${on.join(", ")}`);
  }
  for (const k of ep.rules) if (!stated(RULE[k], text)) return r("FAIL", `required statement missing: ${k}`);
  const claim = text.match(FALSE_CLAIM) ?? text.match(FALSE_CLAIM_2);
  if (claim) return r("FAIL", `possible false buyer/subscription claim: "${claim[0]}"`);
  const pin = APPROVED_SHA256[ep.n];
  if (pin) {
    const got = createHash("sha256").update(body).digest("hex");
    if (got !== pin) return r("UNKNOWN", `content differs from approved snapshot (sha256 ${got.slice(0, 12)}…); review it, then update APPROVED_SHA256`);
    return r("PASS", "live body equals approved snapshot and all checks pass");
  }
  return r("PASS", "live body verified (no snapshot pin; mint and claim checks only)");
}

async function fetchOne(ep) {
  try {
    const res = await fetch(ep.fetch ?? ep.url, {
      redirect: "follow",
      headers: { "user-agent": "MEKU-SI-mint-integrity-check/1 (+https://meku.farm; read-only)", accept: "*/*" },
      signal: AbortSignal.timeout(20000),
    });
    return { status: res.status, contentType: res.headers.get("content-type"), finalUrl: res.url, body: await res.text() };
  } catch (e) {
    return { error: String(e?.message ?? e) };
  }
}

export async function run() {
  const out = [];
  for (const ep of ENDPOINTS) {
    const resp = await fetchOne(ep);
    out.push({ ...evaluate(ep, resp), finalUrl: resp.finalUrl ?? null, contentType: resp.contentType ?? null });
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = await run();
  if (process.argv.includes("--json")) console.log(JSON.stringify({ checkedAt: new Date().toISOString(), mint: MINT, results }, null, 2));
  else for (const x of results) console.log(`${String(x.n).padStart(2)} ${x.result.padEnd(7)} ${x.status ?? "-"} ${x.url} — ${x.reason}`);
  const count = (k) => results.filter((x) => x.result === k).length;
  console.error(`SUMMARY PASS=${count("PASS")} FAIL=${count("FAIL")} UNKNOWN=${count("UNKNOWN")} (UNKNOWN is not a pass)`);
  process.exitCode = count("FAIL") ? 1 : count("UNKNOWN") ? 2 : 0;
}
