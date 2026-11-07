import { PLANS } from "./constants.ts";
import { quoteForCents, RealityEngine, type Quote, type Receipt } from "./engine.ts";

export type Check = { name: string; pass: boolean; detail: string };

const TASK = {
  title: "Inspect irrigation laterals",
  action: "Inspect the irrigation system and report visible faults.",
  description: "Walk the authorized Blitar laterals and record visible leaks, blockages, and valve position.",
  country: "ID",
  budgetCents: 10_000,
};

function receipt(invoiceId: string, quote: Quote, finality: Receipt["finality"] = "finalized"): Receipt {
  return {
    signature: `sim_${invoiceId}_${quote.requestId}`.slice(0, 80),
    invoiceId,
    mint: quote.outputMint,
    cluster: quote.cluster,
    amountBaseUnits: quote.outAmount,
    destination: `settle_${invoiceId}`,
    finality,
    slot: finality === "finalized" ? 100 : null,
  };
}

export async function runAcceptance(now = 1_700_000_000_000) {
  let clock = now;
  const engine = new RealityEngine(() => clock);
  const checks: Check[] = [];
  const note = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  const parent = engine.issueKey({
    agentId: "agent_operator",
    orgId: "org_lab",
    spendLimitCents: 50_000,
    allowanceApproved: true,
  });
  let childThrew = false;
  try {
    engine.issueKey({
      agentId: "agent_child",
      orgId: "org_lab",
      parentKeyId: parent.id,
      spendLimitCents: Number.POSITIVE_INFINITY,
      allowanceApproved: true,
    });
  } catch {
    childThrew = true;
  }
  note("child cannot inherit unlimited spend", childThrew, "Infinity delegation rejected");
  const child = engine.issueKey({
    agentId: "agent_child",
    orgId: "org_lab",
    parentKeyId: parent.id,
    spendLimitCents: 1_000,
    allowanceApproved: false,
  });

  const opened = engine.createSubscriptionInvoice(parent.id, "OPERATOR");
  note("operator price is $99", opened.ok && opened.invoice.priceCents === PLANS.OPERATOR.priceCents, "$99.00");
  if (!opened.ok) return { checks, engine };
  const quote = quoteForCents(opened.invoice.priceCents, clock, "quote_operator");
  const attached = engine.attachQuote(opened.invoice.id, quote);
  note("simulated quote attached", attached.ok, attached.ok ? quote.outAmount : attached.code);
  const settled = engine.submitReceipt(opened.invoice.id, receipt(opened.invoice.id, quote));
  note("unique receipt activates 30 days", settled.ok && settled.activated, settled.code);

  const early = await engine.call(parent.id, "meku.inspect", TASK);
  note("inspect submits without dispatch", early.ok && early.state === "matched" && early.humanApproval === "pending_human", early.code);
  const missionId = early.requestId ?? "";
  const accepted = engine.acceptMission(missionId, "human_7f3a");
  note("simulated human accepts", accepted.ok, accepted.ok ? "human_7f3a" : accepted.code);
  const funded = engine.fundMission(parent.id, missionId);
  note(
    "mission funding is separate and discloses 5%",
    funded.ok && funded.disclosed.platformFeeCents === 500 && funded.disclosed.workerCents === 9500,
    funded.ok ? `fee ${funded.disclosed.platformFeeCents}` : funded.code,
  );
  if (funded.ok) {
    const missionQuote = quoteForCents(funded.invoice.priceCents, clock, "quote_mission");
    engine.attachQuote(funded.invoice.id, missionQuote);
    const paid = engine.submitReceipt(funded.invoice.id, receipt(funded.invoice.id, missionQuote));
    note("mission receipt settles once", paid.ok, paid.code);
    const evidence = await engine.submitEvidence(missionId, "human_7f3a", "evidence_ref_photo_hash");
    note("evidence stored off chain", evidence.ok, evidence.ok ? evidence.phaId ?? "" : evidence.code);
    const self = await engine.reviewMission(missionId, "agent_operator", "accepted");
    note("requesting agent cannot self-verify", !self.ok && self.code === "SELF_REVIEW_FORBIDDEN", self.ok ? "reviewed" : self.code);
    const reviewed = await engine.reviewMission(missionId, "reviewer_independent", "accepted");
    note("independent review accepted with limitations", reviewed.ok, reviewed.ok ? reviewed.mission.review?.limitations ?? "" : reviewed.code);
    const report = await engine.call(parent.id, "meku.report", { id: missionId });
    note("owner receives structured report", report.ok && report.paymentState === "simulated_settled", report.code);
    const pha = evidence.ok && evidence.phaId ? await engine.readPha(evidence.phaId, "agent_operator") : null;
    note("PHA intact for owner", Boolean(pha?.intact && pha.body.review), pha?.signatureMode ?? "missing");
    const leak = await engine.call(child.id, "meku.report", { id: missionId });
    note("other agent cannot read the mission", !leak.ok && leak.code === "NOT_FOUND", leak.code);
  }

  const filler: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const extra = await engine.call(parent.id, "meku.inspect", {
      ...TASK,
      title: `Inspect block ${index + 2}`,
    });
    if (extra.requestId) filler.push(extra.requestId);
  }
  const overflow = await engine.call(parent.id, "meku.inspect", { ...TASK, title: "Inspect beyond cap" });
  note("operator cap is 5 active missions", filler.length === 5 && !overflow.ok && overflow.code === "MISSION_CAPACITY", overflow.code);
  engine.stop(parent.id, "operator");
  note("parent STOP cascades to the child key", child.stopped && parent.stopped, child.id);

  return { checks, engine, parent, child, missionId, filler };
}

export async function runNegative(now = 1_700_000_000_000) {
  let clock = now;
  const engine = new RealityEngine(() => clock);
  const checks: Check[] = [];
  const note = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
  const key = engine.issueKey({
    agentId: "agent_neg",
    orgId: "org_lab",
    spendLimitCents: 20_000,
    allowanceApproved: true,
  });
  const opened = engine.createSubscriptionInvoice(key.id, "AGENT");
  if (!opened.ok) return { checks, engine };
  note("agent price is $29", opened.invoice.priceCents === 2900, String(opened.invoice.priceCents));
  const quote = quoteForCents(2900, clock, "quote_agent");
  engine.attachQuote(opened.invoice.id, quote);

  const forged = engine.submitReceipt(opened.invoice.id, {
    ...receipt(opened.invoice.id, quote),
    mint: "So11111111111111111111111111111111111111112",
  });
  note("wrong mint rejected", !forged.ok && forged.code === "WRONG_MINT", forged.code);

  const reopened = engine.createSubscriptionInvoice(key.id, "AGENT");
  if (!reopened.ok) return { checks, engine };
  engine.attachQuote(reopened.invoice.id, { ...quote, requestId: "quote_agent_2", quotedAt: clock });
  const unknown = engine.submitReceipt(reopened.invoice.id, {
    ...receipt(reopened.invoice.id, quote),
    signature: "sim_unknown_outcome",
    finality: "unknown",
    slot: null,
  });
  note("unknown finality does not activate", !unknown.ok && unknown.activated === false, unknown.code);
  const replayUnknown = engine.submitReceipt(reopened.invoice.id, {
    ...receipt(reopened.invoice.id, quote),
    signature: "sim_unknown_outcome_2",
  });
  note("unknown invoice is not charged again", !replayUnknown.ok && replayUnknown.code === "UNKNOWN_OUTCOME_HELD", replayUnknown.code);

  const third = engine.createSubscriptionInvoice(key.id, "AGENT");
  if (!third.ok) return { checks, engine };
  const quote3 = { ...quote, requestId: "quote_agent_3", quotedAt: clock };
  engine.attachQuote(third.invoice.id, quote3);
  const good = engine.submitReceipt(third.invoice.id, receipt(third.invoice.id, quote3));
  const duplicate = engine.submitReceipt(third.invoice.id, receipt(third.invoice.id, quote3));
  note("duplicate invoice rejected", good.ok && !duplicate.ok && duplicate.code === "DUPLICATE_INVOICE", duplicate.code);
  const intel = engine.createSubscriptionInvoice(key.id, "INTELLIGENCE");
  note(
    "intelligence stays custom, not unlimited",
    !intel.ok && intel.code === "ENTERPRISE_CAP_REQUIRED",
    intel.ok ? "opened" : intel.code,
  );
  note("intelligence price remains $999.99", PLANS.INTELLIGENCE.priceCents === 99999, "$999.99");

  clock += 31 * 24 * 60 * 60 * 1000;
  const expired = await engine.call(key.id, "meku.test", { ...TASK, title: "Test after expiry" });
  note("expired access cannot create work", !expired.ok && expired.code === "ACCESS_REQUIRED", expired.code);

  clock = now;
  const fresh = engine.issueKey({
    agentId: "agent_fresh",
    orgId: "org_lab",
    spendLimitCents: 100,
    allowanceApproved: false,
  });
  const sub = engine.createSubscriptionInvoice(fresh.id, "NETWORK");
  note("network price is $299", sub.ok && sub.invoice.priceCents === 29900, sub.ok ? String(sub.invoice.priceCents) : sub.code);
  if (sub.ok) {
    const networkQuote = quoteForCents(29900, clock, "quote_network");
    engine.attachQuote(sub.invoice.id, networkQuote);
    engine.submitReceipt(sub.invoice.id, receipt(sub.invoice.id, networkQuote));
  }
  const unsafe = await engine.call(fresh.id, "meku.test", { ...TASK, unsafe: true });
  note("unsafe test is not dispatched", !unsafe.ok && unsafe.code === "UNSAFE_OR_ILLEGAL", unsafe.code);
  const job = await engine.call(fresh.id, "meku.execute", { ...TASK, budgetCents: 5_000 });
  note("execute does not start work", job.ok && job.state === "matched", job.state);
  if (job.requestId) {
    engine.rejectMission(job.requestId, "human_9b");
    const after = await engine.call(fresh.id, "meku.report", { id: job.requestId });
    note("rejected mission stays rejected", after.ok && after.state === "rejected", after.state);
  }
  const pricey = await engine.call(fresh.id, "meku.collect", { ...TASK, title: "Collect soil moisture", budgetCents: 5_000 });
  if (pricey.requestId) {
    engine.acceptMission(pricey.requestId, "human_2c");
    const denied = engine.fundMission(fresh.id, pricey.requestId);
    note("allowance and spend limit block funding", !denied.ok, denied.ok ? "funded" : denied.code);
  }

  const disputeKey = engine.issueKey({
    agentId: "agent_dispute",
    orgId: "org_lab",
    spendLimitCents: 5_000,
    allowanceApproved: true,
  });
  const disputeSub = engine.createSubscriptionInvoice(disputeKey.id, "AGENT");
  if (disputeSub.ok) {
    const disputeQuote = quoteForCents(2900, clock, "quote_dispute_sub");
    engine.attachQuote(disputeSub.invoice.id, disputeQuote);
    engine.submitReceipt(disputeSub.invoice.id, receipt(disputeSub.invoice.id, disputeQuote));
    const disputeJob = await engine.call(disputeKey.id, "meku.verify", {
      ...TASK,
      title: "Verify a prior repair",
      budgetCents: 2_000,
    });
    if (disputeJob.requestId) {
      engine.acceptMission(disputeJob.requestId, "human_2c");
      const disputeFund = engine.fundMission(disputeKey.id, disputeJob.requestId);
      if (disputeFund.ok) {
        const workQuote = quoteForCents(2_000, clock, "quote_dispute_work");
        engine.attachQuote(disputeFund.invoice.id, workQuote);
        engine.submitReceipt(disputeFund.invoice.id, receipt(disputeFund.invoice.id, workQuote));
        await engine.submitEvidence(disputeJob.requestId, "human_2c", "evidence_ref_disputed");
        const disputed = await engine.reviewMission(disputeJob.requestId, "reviewer_independent", "disputed");
        note("disputed result is not verified", disputed.ok && disputed.mission.state === "disputed", disputed.ok ? disputed.mission.state : disputed.code);
      }
    }
  }

  engine.stop(fresh.id, "operator");
  const stopped = await engine.call(fresh.id, "meku.inspect", TASK);
  note("STOP blocks new requests", !stopped.ok && stopped.code === "STOPPED", stopped.code);
  engine.revoke(key.id, "operator");
  const revoked = await engine.call(key.id, "meku_search_humans", {});
  note("revocation blocks the key", !revoked.ok && revoked.code === "REVOKED", revoked.code);

  const plain = engine.issueKey({
    agentId: "agent_plain",
    orgId: "org_lab",
    spendLimitCents: 1_000,
    allowanceApproved: true,
  });
  const stale = engine.createSubscriptionInvoice(plain.id, "AGENT");
  const impact = stale.ok
    ? engine.attachQuote(stale.invoice.id, { ...quote, priceImpactPct: "0.2", requestId: "impact", quotedAt: clock })
    : { ok: false as const, code: "NO_INVOICE" };
  note("excessive price impact fails closed", !impact.ok, impact.ok ? "attached" : impact.code);

  return { checks, engine };
}
