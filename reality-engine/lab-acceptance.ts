import { LabSession, mcpRequest, readTool } from "./lab-session.ts";

export type LabCheck = { name: string; pass: boolean; detail: string };

const TASK = {
  title: "Inspect irrigation laterals",
  action: "Inspect the irrigation system and report visible faults.",
  description: "Walk the authorized Blitar laterals and record visible leaks, blockages, and valve position.",
  country: "ID",
  budgetCents: 10_000,
};

async function call(session: LabSession, token: string, id: number, name: string, args: Record<string, unknown>) {
  const response = await session.handleMcp(
    mcpRequest(token, id, "tools/call", { name, arguments: args }),
  );
  return readTool(response);
}

async function human(session: LabSession, token: string, body: Record<string, unknown>) {
  const response = await session.handleHuman(
    new Request("http://lab.local/human", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return (await response.json()) as Record<string, unknown>;
}

export async function runLabAcceptance(session = LabSession.open()): Promise<{ checks: LabCheck[]; session: LabSession }> {
  const checks: LabCheck[] = [];
  const note = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
  const operator = "meku_test_operator";
  const listed = await session.handleMcp(mcpRequest(operator, 1, "tools/list"));
  const listBody = (await listed.json()) as { result?: { tools?: { name: string; inputSchema?: { required?: string[] } }[] } };
  const names = new Set((listBody.result?.tools ?? []).map((tool) => tool.name));
  note(
    "legacy and six tools are both listed",
    ["meku_search_humans", "meku_request_human", "meku_get_request_status", "meku.inspect", "meku.report", "meku_execute"].every((name) => names.has(name)),
    [...names].filter((name) => name.startsWith("meku")).length + " tools",
  );
  const inspectTool = (listBody.result?.tools ?? []).find((tool) => tool.name === "meku.inspect");
  note("inspect publishes a required input schema", inspectTool?.inputSchema?.required?.includes("title") === true, inspectTool ? "schema" : "missing");

  const blocked = await call(session, operator, 2, "meku.inspect", TASK);
  note("unsubscribed inspect is refused", blocked.code === "ACCESS_REQUIRED", String(blocked.code));

  const quote = await call(session, operator, 3, "meku_market_quote", { plan: "OPERATOR" });
  note("operator quote is $99 and unsigned", quote.ok === true && quote.priceCents === 9900 && quote.fundsMoved === false, String(quote.priceCents));
  const invoiceId = String(quote.invoiceId ?? "");
  const stolen = await call(session, "meku_test_other", 35, "meku_market_settle", { invoiceId, mode: "simulated-finalized" });
  note("another agent cannot settle the invoice", stolen.code === "INVOICE_NOT_OWNED", String(stolen.code));
  const settled = await call(session, operator, 4, "meku_market_settle", { invoiceId, mode: "simulated-finalized" });
  note("one simulated receipt activates 30 days", settled.ok === true && settled.activated === true && settled.productionProof === false, String(settled.code));
  const duplicate = await call(session, operator, 5, "meku_market_settle", { invoiceId, mode: "replay" });
  note("duplicate receipt does not create a second subscription", duplicate.ok === false && duplicate.code === "DUPLICATE_INVOICE", String(duplicate.code));

  const requested = await call(session, operator, 6, "meku.inspect", { ...TASK, idempotencyKey: "inspect-blitar-1" });
  const missionId = String(requested.requestId ?? "");
  note("inspect submits without dispatch", requested.ok === true && requested.state === "matched", String(requested.code));
  const replayed = await call(session, operator, 7, "meku.inspect", { ...TASK, idempotencyKey: "inspect-blitar-1" });
  note("idempotent retry returns the same request", replayed.requestId === missionId, String(replayed.requestId));

  const reviewerAccept = await human(session, "human_test_reviewer", { action: "accept", missionId });
  note("reviewer cannot accept a mission", reviewerAccept.code === "ROLE_FORBIDDEN", String(reviewerAccept.code));
  const accepted = await human(session, "human_test_worker", { action: "accept", missionId });
  note("test human accepts", accepted.ok === true, String(accepted.code ?? accepted.consent));
  const keyId = session.agents.get(operator)?.keyId ?? "";
  const workerFund = await human(session, "human_test_worker", { action: "fund", missionId, keyId });
  note("worker cannot fund a mission", workerFund.code === "ROLE_FORBIDDEN", String(workerFund.code));
  const funded = await human(session, "human_test_operator", { action: "fund", missionId, keyId });
  const disclosed = funded.disclosed as { workerCents?: number; platformFeeCents?: number } | undefined;
  note(
    "mission funding discloses $95 and $5",
    funded.ok === true && disclosed?.workerCents === 9500 && disclosed.platformFeeCents === 500 && funded.productionProof === false,
    String(funded.code),
  );
  const evidence = await human(session, "human_test_worker", { action: "evidence", missionId, evidenceRef: "evidence_ref_photo_hash" });
  note("evidence is an off-chain reference", evidence.ok === true && evidence.privateEvidenceOnChain === false, String(evidence.phaId ?? evidence.code));
  const self = await human(session, "human_test_worker", { action: "review", missionId, outcome: "accepted" });
  note("worker cannot review evidence", self.ok === false && self.code === "ROLE_FORBIDDEN", String(self.code));
  const reviewed = await human(session, "human_test_reviewer", { action: "review", missionId, outcome: "accepted" });
  note("independent review accepted", reviewed.ok === true && reviewed.state === "accepted_result", String(reviewed.state ?? reviewed.code));
  const report = await call(session, operator, 8, "meku.report", { id: missionId });
  note("owner report is simulated_settled", report.ok === true && report.paymentState === "simulated_settled", String(report.paymentState));
  const leak = await call(session, "meku_test_other", 9, "meku.report", { id: missionId });
  note("other organization cannot read the mission", leak.ok === false && leak.code === "NOT_FOUND", String(leak.code));

  const open: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const extra = await call(session, operator, 20 + index, "meku.inspect", { ...TASK, title: `Inspect block ${index + 2}` });
    if (extra.requestId) open.push(String(extra.requestId));
  }
  const overflow = await call(session, operator, 30, "meku.inspect", { ...TASK, title: "Inspect beyond cap" });
  note("operator cap is 5 active missions", open.length === 5 && overflow.code === "MISSION_CAPACITY", String(overflow.code));

  const child = await call(session, operator, 31, "meku_delegate", { agentId: "agent_child", spendLimitCents: "unlimited" });
  note("child cannot inherit unlimited spend", child.ok === false && child.code === "CHILD_UNLIMITED_FORBIDDEN", String(child.code));

  const saved = session.exportState();
  const restored = LabSession.restore(saved.snapshot, saved.agents, saved.humans, saved.clock);
  const afterRestart = await call(restored, operator, 32, "meku.report", { id: missionId });
  note("restart keeps the settled mission", afterRestart.ok === true && afterRestart.state === "accepted_result", String(afterRestart.state));

  restored.advance(31 * 24 * 60 * 60 * 1000);
  const expired = await call(restored, operator, 33, "meku.test", { ...TASK, title: "Test after expiry" });
  note("expired subscription cannot create work", expired.code === "ACCESS_REQUIRED", String(expired.code));

  const unknownQuote = await call(session, "meku_test_other", 40, "meku_market_quote", { plan: "AGENT" });
  const unknown = await call(session, "meku_test_other", 41, "meku_market_settle", {
    invoiceId: String(unknownQuote.invoiceId ?? ""),
    mode: "unknown",
  });
  const retry = await call(session, "meku_test_other", 42, "meku_market_settle", {
    invoiceId: String(unknownQuote.invoiceId ?? ""),
    mode: "simulated-finalized",
  });
  note("unknown finality is not retried into a charge", unknown.code === "FINALITY_UNKNOWN" && retry.code === "UNKNOWN_OUTCOME_HELD", String(retry.code));

  const wrongQuote = await call(session, "meku_test_other", 43, "meku_market_quote", { plan: "AGENT" });
  const wrong = await call(session, "meku_test_other", 44, "meku_market_settle", {
    invoiceId: String(wrongQuote.invoiceId ?? ""),
    mode: "wrong-mint",
  });
  note("wrong mint is rejected", wrong.code === "WRONG_MINT", String(wrong.code));

  const anonymous = await session.handleMcp(mcpRequest("", 50, "tools/call", { name: "meku.inspect", arguments: TASK }));
  note("missing credentials are rejected", anonymous.status === 401, String(anonymous.status));

  const stopped = await human(session, "human_test_operator", { action: "stop", keyId });
  const afterStop = await call(session, operator, 51, "meku.inspect", TASK);
  note("STOP blocks new paid work", stopped.ok === true && afterStop.code === "STOPPED", String(afterStop.code));

  const reportNow = session.engine.founderReport();
  note(
    "production counters stay at zero",
    reportNow.production.grossPurchaseUsd === 0 && reportNow.production.burnedBaseUnits === "0" && reportNow.classification === "simulation",
    `production ${reportNow.production.grossPurchaseUsd}`,
  );

  return { checks, session };
}
