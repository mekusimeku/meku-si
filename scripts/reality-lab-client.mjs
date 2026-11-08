const base = process.argv[2];
const phase = process.argv[3] ?? "full";
const missionArg = process.argv[4] ?? "";
if (!base) {
  console.error("usage: reality-lab-client.mjs <baseUrl> <full|resume> [missionId]");
  process.exit(2);
}

const TASK = {
  title: "Inspect irrigation laterals",
  action: "Inspect the irrigation system and report visible faults.",
  description: "Walk the authorized Blitar laterals and record visible leaks, blockages, and valve position.",
  country: "ID",
  budgetCents: 10000,
};

const checks = [];
const note = (name, pass, detail) => checks.push({ name, pass, detail: String(detail) });

async function mcp(token, id, method, params) {
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function tool(token, id, name, args) {
  const { status, body } = await mcp(token, id, "tools/call", { name, arguments: args });
  if (body.error) return { status, ok: false, code: body.error.message };
  try {
    return { status, ...JSON.parse(body.result.content[0].text) };
  } catch {
    return { status, ok: false, code: "BAD_TOOL_BODY" };
  }
}

async function human(token, payload) {
  const response = await fetch(`${base}/human`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

if (phase === "resume") {
  const report = await tool("meku_test_operator", 1, "meku.report", { id: missionArg });
  note("restarted server still returns the owner report", report.ok === true && report.state === "accepted_result", report.state ?? report.code);
  const failed = checks.filter((check) => !check.pass);
  console.log(JSON.stringify({ ok: failed.length === 0, failed: failed.length, checks }));
  process.exit(failed.length === 0 ? 0 : 1);
}

const health = await fetch(`${base}/health`).then((response) => response.json());
note("health is the test environment", health.environment === "TEST" && health.fundsMoved === false, health.environment);

const listed = await mcp("meku_test_operator", 1, "tools/list");
const tools = listed.body.result?.tools ?? [];
const names = new Set(tools.map((item) => item.name));
note(
  "legacy and six tools are listed",
  ["meku_search_humans", "meku_request_human", "meku_get_request_status", "meku.inspect", "meku.verify", "meku.collect", "meku.test", "meku.execute", "meku.report"].every((name) => names.has(name)),
  tools.length,
);
note("inspect schema requires a title", tools.find((item) => item.name === "meku.inspect")?.inputSchema?.required?.includes("title") === true, "schema");

const bad = await tool("meku_test_operator", 2, "meku.inspect", { title: "no" });
note("invalid tool input is rejected", bad.status === 400 || String(bad.code).includes("Missing argument") || String(bad.code).includes("Invalid argument"), bad.code);

const blocked = await tool("meku_test_operator", 3, "meku.inspect", TASK);
note("unsubscribed inspect is refused", blocked.code === "ACCESS_REQUIRED", blocked.code);

const quote = await tool("meku_test_operator", 4, "meku_market_quote", { plan: "OPERATOR" });
note("quote is $99 and not a payment", quote.ok === true && quote.priceCents === 9900 && quote.fundsMoved === false, quote.priceCents);
const invoiceId = quote.invoiceId;
const stolen = await tool("meku_test_other", 5, "meku_market_settle", { invoiceId, mode: "simulated-finalized" });
note("other agent cannot settle the invoice", stolen.code === "INVOICE_NOT_OWNED", stolen.code);
const [first, second] = await Promise.all([
  tool("meku_test_operator", 6, "meku_market_settle", { invoiceId, mode: "simulated-finalized" }),
  tool("meku_test_operator", 7, "meku_market_settle", { invoiceId, mode: "simulated-finalized" }),
]);
const results = [first, second];
note(
  "one concurrent settle activates and the other does not",
  results.filter((item) => item.activated === true).length === 1 && results.some((item) => item.ok === false),
  results.map((item) => item.code).join(","),
);

const requested = await tool("meku_test_operator", 8, "meku.inspect", TASK);
const missionId = requested.requestId;
note("inspect creates a request", requested.ok === true && requested.state === "matched", requested.code);
const reviewer = await human("human_test_reviewer", { action: "accept", missionId });
note("reviewer cannot accept", reviewer.code === "ROLE_FORBIDDEN", reviewer.code);
const accepted = await human("human_test_worker", { action: "accept", missionId });
note("worker accepts", accepted.ok === true, accepted.code ?? accepted.consent);
const workerFund = await human("human_test_worker", { action: "fund", missionId, keyId: "key_wrong" });
note("worker cannot fund", workerFund.code === "ROLE_FORBIDDEN", workerFund.code);

const search = await tool("meku_test_operator", 9, "meku_search_humans", { country: "ID" });
note("legacy search still answers", search.ok === true && search.code === "AGGREGATE_ONLY", search.code);
const funded = await human("human_test_operator", { action: "fund", missionId });
const split = funded.disclosed ?? {};
note(
  "funding discloses $95 and $5",
  funded.ok === true && split.workerCents === 9500 && split.platformFeeCents === 500 && funded.productionProof === false,
  funded.code,
);
const evidence = await human("human_test_worker", { action: "evidence", missionId, evidenceRef: "evidence_ref_photo_hash" });
note("worker submits evidence", evidence.ok === true && evidence.privateEvidenceOnChain === false, evidence.code ?? evidence.phaId);
const workerReview = await human("human_test_worker", { action: "review", missionId, outcome: "accepted" });
note("worker cannot review", workerReview.code === "ROLE_FORBIDDEN", workerReview.code);
const reviewed = await human("human_test_reviewer", { action: "review", missionId, outcome: "accepted" });
note("independent reviewer accepts", reviewed.ok === true && reviewed.state === "accepted_result", reviewed.state ?? reviewed.code);
const report = await tool("meku_test_operator", 10, "meku.report", { id: missionId });
note("owner receives the report", report.ok === true && report.paymentState === "simulated_settled", report.paymentState);
const leak = await tool("meku_test_other", 11, "meku.report", { id: missionId });
note("other organization learns nothing", leak.code === "NOT_FOUND", leak.code);

const failed = checks.filter((check) => !check.pass);
console.log(JSON.stringify({ ok: failed.length === 0, failed: failed.length, missionId, checks }));
process.exit(failed.length === 0 ? 0 : 1);
