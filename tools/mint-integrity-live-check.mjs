#!/usr/bin/env node
// MEKU SI Official Mint Integrity — read-only live check of the twelve public endpoints.
// Intended to be called by the existing daily "MEKU SI Official Mint Integrity Watch";
// it does not schedule itself. GET requests only: no keys, no wallet, no writes, no paid APIs.
//
// Each endpoint is reported as:
//   PASS    verified correct from the live response body
//   FAIL    confirmed incorrect (wrong/look-alike mint, 404, missing rule, false claim)
//   UNKNOWN could not verify (network error, rate limit, bot challenge, client-rendered shell)
// UNKNOWN is never turned into PASS or FAIL. Exit code: 1 if any FAIL, 0 otherwise.
// Usage: node tools/mint-integrity-live-check.mjs [--json]

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
const FALSE_CLAIM = /\b(we (have|now have|welcomed|confirmed|onboarded)|has (its|our) first|\d+) (our |an? |its )?(first )?(verified |independent )+(ai[- ]agent )?buyers?\b|\bverified buyers?\s*:\s*[1-9]|subscriptions? (are|is) now live|paid agent (access|subscriptions?) (is|are) (now )?live/i;

// kind: identity = full token identity record; reference = shows mint only (no rule repetition required)
export const ENDPOINTS = [
  { n: 1, url: "https://meku.farm/token.html", type: /text\/html/, kind: "identity", rules: ["noAccess", "notLive", "approval", "evidence"] },
  { n: 2, url: "https://meku.farm/.well-known/meku-si-token.json", type: /application\/json/, kind: "identity", rules: ["noAccess", "notLive", "approval", "evidence"],
    json: (j) => j.asset?.mint === MINT && j.asset?.tokenProgram === "Token-2022" && j.asset?.network === "mainnet-beta" && j.access?.agentSubscriptionsLive === false },
  { n: 3, url: "https://meku.farm/llms.txt", type: /text\/plain/, kind: "identity", rules: ["noAccess", "notLive"] },
  { n: 4, url: "https://meku.farm/agent-quickstart.html", type: /text\/html/, kind: "identity", rules: ["noAccess", "notLive", "evidence"] },
  { n: 5, url: "https://meku.farm/mcp-lab.html", type: /text\/html/, kind: "reference", rules: [] },
  { n: 6, url: "https://meku.farm/first-contact.html", type: /text\/html/, kind: "reference", rules: [] },
  { n: 7, url: "https://meku.farm/.well-known/meku-first-contact.json", type: /application\/json/, kind: "reference", rules: ["noAccess"],
    json: (j) => j.networkReference?.listedSiteAddress === MINT && j.networkReference?.tokenProgram === "Token-2022" && j.safety?.realMissionPaymentsEnabled === false },
  { n: 8, url: `${W}/token.json`, type: /application\/json/, kind: "identity", rules: ["notLive"],
    json: (j) => j.mint === MINT && j.program === "Token-2022" && j.network === "Solana Mainnet" && j.agentSubscriptionsLive === false },
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
export function evaluate(ep, { status, contentType, body, error }) {
  const r = (result, reason) => ({ n: ep.n, url: ep.url, result, reason, status: status ?? null });
  if (error) return r("UNKNOWN", `request failed: ${error}`);
  if (status === 404 || status === 410) return r("FAIL", `HTTP ${status}`);
  if (status === 429 || status === 403 || status === 503 || status >= 500) return r("UNKNOWN", `HTTP ${status} (rate limit, challenge or outage)`);
  if (status !== 200) return r("UNKNOWN", `HTTP ${status}`);
  if (/cf-challenge|challenge-platform|Just a moment\.\.\./i.test(body)) return r("UNKNOWN", "bot challenge page");
  let text = body;
  if (ep.moltbook) {
    let j; try { j = JSON.parse(body); } catch { return r("UNKNOWN", "Moltbook API did not return JSON"); }
    if (!j?.success || !j.post) return r("UNKNOWN", "Moltbook post body not available (metadata only)");
    text = `${j.post.title ?? ""}\n${j.post.content ?? ""}`;
  }
  // Rules are read from visible wording: drop HTML tags and markdown emphasis, collapse whitespace.
  text = text.replace(/<[^>]+>/g, " ").replace(/\*\*|__/g, "").replace(/\s+/g, " ");
  const found = addresses(text);
  const wrong = found.filter((a) => a !== MINT);
  if (wrong.length) return r("FAIL", `non-official mint-like address: ${wrong.join(", ")}`);
  if (!text.includes(MINT)) return r("FAIL", "official mint missing");
  if (ep.kind === "identity" && !/Token-2022/.test(text)) return r("FAIL", "Token-2022 designation missing");
  if (ep.kind === "identity" && !/Solana/i.test(text)) return r("FAIL", "Solana network missing");
  if (ep.type && contentType && !ep.type.test(contentType)) return r("FAIL", `unexpected content-type ${contentType}`);
  if (ep.json) {
    let j; try { j = JSON.parse(body); } catch { return r("FAIL", "body is not valid JSON"); }
    if (!ep.json(j)) return r("FAIL", "JSON identity fields differ from the approved record");
  }
  for (const k of ep.rules) if (!RULE[k].test(text)) return r("FAIL", `required statement missing: ${k}`);
  const claim = text.match(FALSE_CLAIM);
  if (claim) return r("FAIL", `possible false buyer/subscription claim: "${claim[0]}"`);
  return r("PASS", "live body verified");
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = await run();
  if (process.argv.includes("--json")) console.log(JSON.stringify({ checkedAt: new Date().toISOString(), mint: MINT, results }, null, 2));
  else for (const x of results) console.log(`${String(x.n).padStart(2)} ${x.result.padEnd(7)} ${x.status ?? "-"} ${x.url} — ${x.reason}`);
  process.exitCode = results.some((x) => x.result === "FAIL") ? 1 : 0;
}
