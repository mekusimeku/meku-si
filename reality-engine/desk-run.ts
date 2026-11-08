import { PLANS } from "./constants.ts";
import { usd } from "./format.ts";
import { quoteForCents, RealityEngine, type Quote, type Receipt } from "./engine.ts";

export type ChapterKind = "recorded" | "held" | "open";

export type Chapter = {
  id: string;
  title: string;
  result: string;
  code: string;
  kind: ChapterKind;
};

export type DeskSnapshot = {
  chapters: Chapter[];
  keyLabel: string;
  plan: string;
  slots: string;
  spent: string;
  missionTitle: string;
  missionState: string;
  place: string;
  human: string;
  reviewer: string;
  split: string;
  pha: string;
  productionRevenue: string;
  burned: string;
  simulatedSubscription: string;
  simulatedWork: string;
  simulatedFee: string;
  audit: { event: string; detail: string }[];
};

export const DRILLS = [
  { id: "wrong-mint", label: "Wrong mint" },
  { id: "unknown-finality", label: "Unknown finality" },
  { id: "duplicate", label: "Duplicate receipt" },
  { id: "price-impact", label: "Price impact" },
  { id: "stop", label: "Operator STOP" },
  { id: "unsafe", label: "Unsafe request" },
] as const;

export type DrillId = (typeof DRILLS)[number]["id"];

const FIELD = {
  title: "Inspect irrigation laterals",
  action: "Inspect the irrigation system and report visible faults.",
  description: "Walk the authorized Blitar laterals and record visible leaks, blockages, and valve position.",
  country: "ID",
  budgetCents: 10_000,
};

const LAB_CLOCK = 1_762_560_000_000;

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

function chapter(id: string, title: string, kind: ChapterKind, code: string, result: string): Chapter {
  return { id, title, kind, code, result };
}

export async function playOperator(now = LAB_CLOCK): Promise<DeskSnapshot> {
  const engine = new RealityEngine(() => now);
  const chapters: Chapter[] = [];

  const parent = engine.issueKey({
    agentId: "agent_operator",
    orgId: "org_lab",
    spendLimitCents: 50_000,
    allowanceApproved: true,
  });
  let unlimitedBlocked = false;
  try {
    engine.issueKey({
      agentId: "agent_child",
      orgId: "org_lab",
      parentKeyId: parent.id,
      spendLimitCents: Number.POSITIVE_INFINITY,
      allowanceApproved: true,
    });
  } catch {
    unlimitedBlocked = true;
  }
  const child = engine.issueKey({
    agentId: "agent_child",
    orgId: "org_lab",
    parentKeyId: parent.id,
    spendLimitCents: 1_000,
    allowanceApproved: false,
  });
  chapters.push(
    chapter(
      "keys",
      "Keys",
      unlimitedBlocked ? "held" : "open",
      unlimitedBlocked ? "CHILD_UNLIMITED_FORBIDDEN" : "CHILD_ISSUED",
      unlimitedBlocked
        ? `${parent.id} can spend ${usd(50_000)}. A child asking for unlimited spend was refused. ${child.id} is capped at ${usd(1_000)} and cannot approve its own allowance.`
        : "A child key received unlimited spend. That must not happen.",
    ),
  );

  const opened = engine.createSubscriptionInvoice(parent.id, "OPERATOR");
  if (!opened.ok) {
    chapters.push(chapter("subscribe", "Subscription", "open", opened.code, opened.nextAction));
    return finish(engine, chapters, parent.id, null, 0, false);
  }
  const quote = quoteForCents(opened.invoice.priceCents, now, "quote_operator_lab");
  const attached = engine.attachQuote(opened.invoice.id, quote);
  const settled = attached.ok
    ? engine.submitReceipt(opened.invoice.id, receipt(opened.invoice.id, quote))
    : { ok: false as const, code: attached.code, activated: false };
  chapters.push(
    chapter(
      "subscribe",
      "Subscription",
      settled.ok && settled.activated ? "recorded" : "open",
      settled.ok ? "SETTLED" : settled.code,
      settled.ok
        ? `OPERATOR is ${usd(PLANS.OPERATOR.priceCents)} for 30 days and 5 mission slots. The lab attached a simulated quote, then a finalized simulated receipt. No wallet signed.`
        : "The subscription did not activate.",
    ),
  );

  const requested = await engine.call(parent.id, "meku.inspect", FIELD);
  chapters.push(
    chapter(
      "request",
      "Field request",
      requested.ok && requested.state === "matched" ? "recorded" : "open",
      requested.code,
      requested.ok
        ? `${requested.requestId} is matched in Blitar, not dispatched. A simulated human still has to accept. Identities stay withheld.`
        : requested.nextAction,
    ),
  );

  const missionId = requested.requestId;
  if (!missionId) return finish(engine, chapters, parent.id, null, 0, settled.ok);
  const accepted = engine.acceptMission(missionId, "human_7f3a");
  const funded = accepted.ok ? engine.fundMission(parent.id, missionId) : null;
  let missionSettled = false;
  if (funded?.ok) {
    const missionQuote = quoteForCents(funded.invoice.priceCents, now, "quote_mission_lab");
    const missionAttached = engine.attachQuote(funded.invoice.id, missionQuote);
    if (missionAttached.ok) {
      const paid = engine.submitReceipt(funded.invoice.id, receipt(funded.invoice.id, missionQuote));
      missionSettled = paid.ok;
    }
  }
  const feeOk = Boolean(funded?.ok && funded.disclosed.platformFeeCents === 500 && funded.disclosed.workerCents === 9500);
  chapters.push(
    chapter(
      "fund",
      "Human acceptance and funding",
      accepted.ok && feeOk && missionSettled ? "recorded" : "open",
      missionSettled ? "MISSION_FUNDED" : (funded && !funded.ok ? funded.code : "FUNDING_INCOMPLETE"),
      feeOk
        ? `human_7f3a accepted the written scope. The ${usd(FIELD.budgetCents)} budget splits into ${usd(9500)} for the worker and ${usd(500)} platform fee before the simulated receipt settles. The subscription did not pay the worker.`
        : "Funding did not disclose the 5% fee, or the human did not accept.",
    ),
  );

  const evidence = await engine.submitEvidence(missionId, "human_7f3a", "evidence_ref_photo_hash");
  const self = await engine.reviewMission(missionId, "agent_operator", "accepted");
  const reviewed = await engine.reviewMission(missionId, "reviewer_independent", "accepted");
  const selfCode = self.ok ? "REVIEWED" : self.code;
  const reviewedCode = reviewed.ok ? "ACCEPTED" : reviewed.code;
  chapters.push(
    chapter(
      "review",
      "Evidence and review",
      evidence.ok && selfCode === "SELF_REVIEW_FORBIDDEN" && reviewed.ok ? "held" : "open",
      selfCode === "SELF_REVIEW_FORBIDDEN" ? selfCode : reviewedCode,
      reviewed.ok
        ? `Evidence is an off-chain reference, ${evidence.ok ? evidence.phaId : "missing"}. The requesting agent cannot verify its own job. reviewer_independent accepted with a limit: a hash is not the observation.`
        : "Independent review did not complete, or self-review was allowed.",
    ),
  );

  const report = await engine.call(parent.id, "meku.report", { id: missionId });
  const pha = evidence.ok && evidence.phaId ? await engine.readPha(evidence.phaId, "agent_operator") : null;
  const leak = await engine.call(child.id, "meku.report", { id: missionId });
  const isolated = !leak.ok && leak.code === "NOT_FOUND";
  chapters.push(
    chapter(
      "report",
      "Report and isolation",
      report.ok && pha?.intact === true && pha.productionSignature === false && isolated ? "recorded" : "open",
      isolated ? "NOT_FOUND" : leak.code,
      pha?.intact
        ? `The owner report is ${report.paymentState}. PHA integrity held under a lab HMAC, not a production signature. ${child.id} cannot read the mission.`
        : "The report or the PHA integrity check did not hold.",
    ),
  );

  return finish(engine, chapters, parent.id, missionId, missionSettled ? FIELD.budgetCents : 0, settled.ok);
}

function finish(
  engine: RealityEngine,
  chapters: Chapter[],
  keyId: string,
  missionId: string | null,
  spentCents: number,
  planLive: boolean,
): DeskSnapshot {
  const report = engine.founderReport();
  const mission = missionId ? engine.getMission(missionId, "agent_operator") : null;
  const audit = engine.auditLog().slice(-6).reverse();
  return {
    chapters,
    keyLabel: keyId,
    plan: planLive ? "OPERATOR · 30 days" : "Not active",
    slots: planLive ? "5" : "0",
    spent: `${usd(spentCents)} of ${usd(50_000)}`,
    missionTitle: mission?.title ?? "No mission",
    missionState: mission?.state ?? "none",
    place: "Blitar, East Java",
    human: mission?.humanRef ?? "pending",
    reviewer: mission?.review?.reviewerRef ?? "none",
    split: mission?.payment
      ? `${usd(mission.payment.workerCents)} worker · ${usd(mission.payment.platformFeeCents)} fee`
      : "Not funded",
    pha: mission?.phaId ? `${mission.phaId} · lab HMAC, not the photograph` : "none",
    productionRevenue: usd(Math.round(report.production.grossPurchaseUsd * 100)),
    burned: report.production.burnedBaseUnits,
    simulatedSubscription: usd(report.simulation.subscriptionRevenueCents),
    simulatedWork: usd(report.simulation.completedHumanWorkCents),
    simulatedFee: usd(report.simulation.platformFeeCents),
    audit: audit.map((entry) => ({ event: entry.event, detail: entry.detail })),
  };
}

export async function playDrill(id: DrillId, now = LAB_CLOCK): Promise<Chapter> {
  const engine = new RealityEngine(() => now);
  const key = engine.issueKey({
    agentId: "agent_drill",
    orgId: "org_lab",
    spendLimitCents: 20_000,
    allowanceApproved: true,
  });

  if (id === "wrong-mint") {
    const opened = engine.createSubscriptionInvoice(key.id, "AGENT");
    if (!opened.ok) return chapter(id, "Wrong mint", "open", opened.code, opened.nextAction);
    const quote = quoteForCents(2900, now, "drill_wrong_mint");
    engine.attachQuote(opened.invoice.id, quote);
    const forged = engine.submitReceipt(opened.invoice.id, {
      ...receipt(opened.invoice.id, quote),
      mint: "So11111111111111111111111111111111111111112",
    });
    const held = !forged.ok && forged.code === "WRONG_MINT" && forged.activated === false;
    return chapter(
      id,
      "Wrong mint",
      held ? "held" : "open",
      forged.code,
      held
        ? "A receipt for a different mint was rejected. The AGENT plan did not activate."
        : "The wrong mint was accepted.",
    );
  }

  if (id === "unknown-finality") {
    const opened = engine.createSubscriptionInvoice(key.id, "AGENT");
    if (!opened.ok) return chapter(id, "Unknown finality", "open", opened.code, opened.nextAction);
    const quote = quoteForCents(2900, now, "drill_unknown");
    engine.attachQuote(opened.invoice.id, quote);
    const unknown = engine.submitReceipt(opened.invoice.id, {
      ...receipt(opened.invoice.id, quote),
      signature: "sim_unknown_finality_drill",
      finality: "unknown",
      slot: null,
    });
    const replay = engine.submitReceipt(opened.invoice.id, {
      ...receipt(opened.invoice.id, quote),
      signature: "sim_unknown_finality_retry",
    });
    const held = !unknown.ok && unknown.code === "FINALITY_UNKNOWN" && !replay.ok && replay.code === "UNKNOWN_OUTCOME_HELD";
    return chapter(
      id,
      "Unknown finality",
      held ? "held" : "open",
      held ? "UNKNOWN_OUTCOME_HELD" : unknown.code,
      held
        ? "Unknown finality did not activate access, and the invoice was not charged again."
        : "An unknown outcome was retried or treated as settled.",
    );
  }

  if (id === "duplicate") {
    const opened = engine.createSubscriptionInvoice(key.id, "AGENT");
    if (!opened.ok) return chapter(id, "Duplicate receipt", "open", opened.code, opened.nextAction);
    const quote = quoteForCents(2900, now, "drill_duplicate");
    engine.attachQuote(opened.invoice.id, quote);
    const good = engine.submitReceipt(opened.invoice.id, receipt(opened.invoice.id, quote));
    const duplicate = engine.submitReceipt(opened.invoice.id, {
      ...receipt(opened.invoice.id, quote),
      signature: "sim_duplicate_second_try",
    });
    const held = good.ok && !duplicate.ok && duplicate.code === "DUPLICATE_INVOICE";
    return chapter(
      id,
      "Duplicate receipt",
      held ? "held" : "open",
      duplicate.code,
      held ? "One receipt activated the invoice. A second receipt on the same invoice was refused." : "A duplicate receipt was accepted.",
    );
  }

  if (id === "price-impact") {
    const opened = engine.createSubscriptionInvoice(key.id, "AGENT");
    if (!opened.ok) return chapter(id, "Price impact", "open", opened.code, opened.nextAction);
    const quote = quoteForCents(2900, now, "drill_impact");
    const impact = engine.attachQuote(opened.invoice.id, { ...quote, priceImpactPct: "0.2" });
    const code = impact.ok ? "QUOTE_OK" : impact.code;
    const held = code === "PRICE_IMPACT";
    return chapter(
      id,
      "Price impact",
      held ? "held" : "open",
      code,
      held ? "Impact above 3% failed closed. The invoice was rejected instead of waiting on a wallet." : "Excessive impact was attached.",
    );
  }

  if (id === "stop") {
    const opened = engine.createSubscriptionInvoice(key.id, "AGENT");
    if (!opened.ok) return chapter(id, "Operator STOP", "open", opened.code, opened.nextAction);
    const quote = quoteForCents(2900, now, "drill_stop");
    engine.attachQuote(opened.invoice.id, quote);
    engine.submitReceipt(opened.invoice.id, receipt(opened.invoice.id, quote));
    engine.stop(key.id, "operator");
    const stopped = await engine.call(key.id, "meku.inspect", FIELD);
    const held = !stopped.ok && stopped.code === "STOPPED";
    return chapter(
      id,
      "Operator STOP",
      held ? "held" : "open",
      stopped.code,
      held ? "STOP blocked a new field request. The subscription did not keep the key alive." : "A stopped key still opened work.",
    );
  }

  const opened = engine.createSubscriptionInvoice(key.id, "NETWORK");
  if (!opened.ok) return chapter(id, "Unsafe request", "open", opened.code, opened.nextAction);
  const quote = quoteForCents(29900, now, "drill_unsafe");
  engine.attachQuote(opened.invoice.id, quote);
  engine.submitReceipt(opened.invoice.id, receipt(opened.invoice.id, quote));
  const unsafe = await engine.call(key.id, "meku.test", { ...FIELD, unsafe: true });
  const held = !unsafe.ok && unsafe.code === "UNSAFE_OR_ILLEGAL";
  return chapter(
    id,
    "Unsafe request",
    held ? "held" : "open",
    unsafe.code,
    held ? "An unsafe test was refused. Nothing was matched or dispatched." : "An unsafe request entered the queue.",
  );
}
