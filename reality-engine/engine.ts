import {
  CAPABILITIES,
  CAPABILITY_ALIASES,
  LAB_INTEGRITY_KEY,
  MAX_PRICE_IMPACT,
  MAX_SLIPPAGE_BPS,
  MINT_DECIMALS,
  OFFICIAL_MINT,
  PLANS,
  PLATFORM_FEE_BPS,
  QUOTE_TTL_MS,
  SOLANA_CLUSTER,
  SUBSCRIPTION_MS,
  type CapabilityName,
  type PlanId,
} from "./constants.ts";
import { canonicalJson, hmacSha256Hex, sha256Hex } from "./integrity.ts";

export type Quote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  slippageBps: number;
  decimals: number;
  cluster: string;
  router: string;
  requestId: string;
  quotedAt: number;
  hops: string[];
};

export type Receipt = {
  signature: string;
  invoiceId: string;
  mint: string;
  cluster: string;
  amountBaseUnits: string;
  destination: string;
  finality: "processed" | "confirmed" | "finalized" | "unknown";
  slot: number | null;
};

type InvoiceState =
  | "quoted"
  | "awaiting_wallet"
  | "acquired"
  | "settlement_unknown"
  | "settled"
  | "expired"
  | "rejected";

type MissionState =
  | "submitted"
  | "matched"
  | "accepted"
  | "funded"
  | "evidence_submitted"
  | "accepted_result"
  | "rejected"
  | "disputed"
  | "stopped"
  | "cancelled";

export type ExecutionKey = {
  id: string;
  agentId: string;
  orgId: string;
  parentKeyId: string | null;
  planId: PlanId | null;
  expiresAt: number | null;
  capabilities: CapabilityName[];
  spendLimitCents: number;
  spentCents: number;
  missionCapacity: number;
  revoked: boolean;
  stopped: boolean;
  allowanceApproved: boolean;
};

type Invoice = {
  id: string;
  agentId: string;
  keyId: string;
  purpose: "subscription" | "mission";
  planId: PlanId | null;
  missionId: string | null;
  priceCents: number;
  state: InvoiceState;
  quote: Quote | null;
  receiptSignature: string | null;
  createdAt: number;
};

type Mission = {
  id: string;
  ownerAgentId: string;
  keyId: string;
  capability: CapabilityName | "meku_request_human";
  title: string;
  action: string;
  description: string;
  country: string | null;
  budgetCents: number | null;
  state: MissionState;
  humanRef: string | null;
  agreedScope: string | null;
  evidenceRefs: string[];
  review: { method: string; outcome: string; limitations: string; reviewerRef: string } | null;
  payment: { state: string; workerCents: number; platformFeeCents: number; budgetCents: number } | null;
  createdAt: number;
  completedAt: number | null;
  phaId: string | null;
};

export type ToolResult = {
  ok: boolean;
  code: string;
  requestId: string | null;
  callingAgentId: string;
  capability: string;
  state: string;
  acceptedParameters: Record<string, unknown>;
  budget: { authorized: boolean; limitCents: number; spentCents: number; requestedCents: number | null };
  humanApproval: string;
  evidence: string;
  proofOfHumanAction: string | null;
  paymentState: string;
  nextAction: string;
  detail?: string;
};

type StoredReceipt = Receipt & { invoiceIdBound: string };

function feeSplit(budgetCents: number) {
  const platformFeeCents = Math.round((budgetCents * PLATFORM_FEE_BPS) / 10_000);
  return { platformFeeCents, workerCents: budgetCents - platformFeeCents, budgetCents };
}

export class RealityEngine {
  private seq = 1;
  private keys = new Map<string, ExecutionKey>();
  private invoices = new Map<string, Invoice>();
  private receipts = new Map<string, StoredReceipt>();
  private missions = new Map<string, Mission>();
  private pha = new Map<string, { id: string; body: Record<string, unknown>; bodyHash: string; integrity: string }>();
  private audits: { at: number; event: string; actor: string; detail: string }[] = [];
  private calls: { keyId: string; at: number }[] = [];
  private production = {
    subscribedAccounts: 0,
    grossPurchaseUsd: 0,
    missionFundingUsd: 0,
    platformFeeUsd: 0,
    burnedBaseUnits: "0",
  };
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  private id(prefix: string) {
    const value = `${prefix}_${String(this.seq).padStart(4, "0")}`;
    this.seq += 1;
    return value;
  }

  private audit(event: string, actor: string, detail: string) {
    this.audits.push({ at: this.now(), event, actor, detail });
  }

  issueKey(input: {
    agentId: string;
    orgId: string;
    parentKeyId?: string | null;
    capabilities?: CapabilityName[];
    spendLimitCents: number;
    allowanceApproved: boolean;
    missionCapacity?: number;
  }): ExecutionKey {
    const parent = input.parentKeyId ? this.keys.get(input.parentKeyId) : undefined;
    if (input.parentKeyId && !parent) throw new Error("PARENT_MISSING");
    if (parent?.revoked || parent?.stopped) throw new Error("PARENT_NOT_ACTIVE");
    let spendLimitCents = input.spendLimitCents;
    if (parent) {
      if (spendLimitCents < 0) throw new Error("CHILD_SPEND_INVALID");
      const parentRemaining = parent.spendLimitCents - parent.spentCents;
      if (spendLimitCents > parentRemaining) throw new Error("CHILD_EXCEEDS_PARENT");
      if (!Number.isFinite(spendLimitCents)) throw new Error("CHILD_UNLIMITED_FORBIDDEN");
    }
    if (spendLimitCents < 0 || !Number.isFinite(spendLimitCents)) throw new Error("SPEND_INVALID");
    const key: ExecutionKey = {
      id: this.id("key"),
      agentId: input.agentId,
      orgId: input.orgId,
      parentKeyId: input.parentKeyId ?? null,
      planId: null,
      expiresAt: null,
      capabilities: input.capabilities ?? [...CAPABILITIES],
      spendLimitCents,
      spentCents: 0,
      missionCapacity: input.missionCapacity ?? 0,
      revoked: false,
      stopped: false,
      allowanceApproved: input.allowanceApproved,
    };
    this.keys.set(key.id, key);
    this.audit("key.issued", key.agentId, key.id);
    return key;
  }

  stop(keyId: string, actor: string) {
    const root = this.requireKey(keyId);
    const stack = [root];
    while (stack.length) {
      const current = stack.pop()!;
      current.stopped = true;
      for (const mission of this.missions.values()) {
        if (mission.keyId === current.id && !this.terminal(mission.state)) {
          mission.state = "stopped";
        }
      }
      for (const child of this.keys.values()) {
        if (child.parentKeyId === current.id && !child.stopped) stack.push(child);
      }
    }
    this.audit("stop", actor, keyId);
  }

  revoke(keyId: string, actor: string) {
    const key = this.requireKey(keyId);
    key.revoked = true;
    this.audit("revoke", actor, keyId);
  }

  plans() {
    return PLANS;
  }

  createSubscriptionInvoice(keyId: string, planId: PlanId, enterpriseMissionCap?: number) {
    const key = this.requireWritableKey(keyId);
    const plan = PLANS[planId];
    if (!plan) return this.fail(key, "PLAN_UNKNOWN", "plan.discover", "Choose a locked plan.");
    if (planId === "INTELLIGENCE") {
      if (!enterpriseMissionCap || enterpriseMissionCap < 1 || enterpriseMissionCap > 500) {
        return this.fail(key, "ENTERPRISE_CAP_REQUIRED", "plan.discover", "Intelligence needs an explicit mission cap.");
      }
    }
    const invoice: Invoice = {
      id: this.id("inv"),
      agentId: key.agentId,
      keyId: key.id,
      purpose: "subscription",
      planId,
      missionId: null,
      priceCents: plan.priceCents,
      state: "quoted",
      quote: null,
      receiptSignature: null,
      createdAt: this.now(),
    };
    this.invoices.set(invoice.id, invoice);
    this.audit("invoice.created", key.agentId, `${invoice.id} ${planId} ${plan.priceCents}`);
    return { ok: true as const, invoice, enterpriseMissionCap: enterpriseMissionCap ?? null };
  }

  attachQuote(invoiceId: string, quote: Quote) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return { ok: false as const, code: "INVOICE_MISSING" };
    const verdict = validateQuote(quote, this.now());
    if (!verdict.ok) {
      invoice.state = "rejected";
      this.audit("quote.rejected", invoice.agentId, `${invoiceId} ${verdict.code}`);
      return verdict;
    }
    invoice.quote = quote;
    invoice.state = "awaiting_wallet";
    this.audit("quote.attached", invoice.agentId, `${invoiceId} ${quote.requestId}`);
    return { ok: true as const, invoice };
  }

  /**
   * Two-step checkout. A client signature is evidence to check, not proof.
   * Unknown finality never activates access and is never auto-retried.
   */
  submitReceipt(invoiceId: string, receipt: Receipt, enterpriseMissionCap?: number) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return { ok: false as const, code: "INVOICE_MISSING", activated: false };
    const key = this.requireKey(invoice.keyId);
    if (invoice.state === "settled") {
      return { ok: false as const, code: "DUPLICATE_INVOICE", activated: false };
    }
    if (invoice.state === "settlement_unknown") {
      return { ok: false as const, code: "UNKNOWN_OUTCOME_HELD", activated: false };
    }
    if (!invoice.quote || this.now() > invoice.quote.quotedAt + QUOTE_TTL_MS) {
      invoice.state = "expired";
      return { ok: false as const, code: "QUOTE_EXPIRED", activated: false };
    }
    if (this.receipts.has(receipt.signature)) {
      return { ok: false as const, code: "REPLAYED_SIGNATURE", activated: false };
    }
    const checks = verifyReceipt(invoice, receipt);
    if (!checks.ok) {
      if (checks.code === "FINALITY_UNKNOWN") {
        invoice.state = "settlement_unknown";
        this.audit("payment.unknown", key.agentId, invoice.id);
      } else {
        invoice.state = "rejected";
        this.audit("payment.rejected", key.agentId, `${invoice.id} ${checks.code}`);
      }
      return { ok: false as const, code: checks.code, activated: false };
    }
    if (invoice.purpose === "subscription" && invoice.planId === "INTELLIGENCE") {
      if (!enterpriseMissionCap || enterpriseMissionCap < 1) {
        return { ok: false as const, code: "ENTERPRISE_CAP_REQUIRED", activated: false };
      }
    }
    invoice.state = "acquired";
    this.receipts.set(receipt.signature, { ...receipt, invoiceIdBound: invoice.id });
    invoice.receiptSignature = receipt.signature;
    invoice.state = "settled";
    if (invoice.purpose === "subscription" && invoice.planId) {
      const plan = PLANS[invoice.planId];
      key.planId = invoice.planId;
      key.expiresAt = this.now() + SUBSCRIPTION_MS;
      key.missionCapacity =
        invoice.planId === "INTELLIGENCE" ? enterpriseMissionCap! : (plan.activeMissions as number);
      this.audit("subscription.activated", key.agentId, `${key.id} ${invoice.planId}`);
    }
    if (invoice.purpose === "mission" && invoice.missionId) {
      const mission = this.missions.get(invoice.missionId);
      if (mission && mission.state === "accepted") {
        const split = feeSplit(invoice.priceCents);
        mission.state = "funded";
        mission.payment = { state: "simulated_settled", ...split };
        key.spentCents += invoice.priceCents;
        this.audit("mission.funded", key.agentId, mission.id);
      }
    }
    return { ok: true as const, code: "SETTLED", activated: invoice.purpose === "subscription", invoice };
  }

  async call(keyId: string, tool: string, args: Record<string, unknown>): Promise<ToolResult> {
    const key = this.keys.get(keyId);
    if (!key) {
      return this.shaped(null, tool, false, "KEY_UNKNOWN", "missing", "Issue an execution key.", {});
    }
    if (!this.allowCall(key)) {
      return this.shaped(key, tool, false, "RATE_LIMITED", "held", "Wait and retry a nonfinancial read only.", args);
    }
    if (tool === "meku_search_humans") return this.search(key, args);
    if (tool === "meku_get_request_status" || tool === "meku.report" || tool === "meku_report") {
      return this.report(key, args);
    }
    if (tool === "meku_request_human") return this.openMission(key, "meku_request_human", args);
    const mapped = CAPABILITY_ALIASES[tool];
    if (!mapped || mapped === "legacy") {
      return this.shaped(key, tool, false, "UNKNOWN_TOOL", "rejected", "Use a documented capability.", args);
    }
    if (mapped === "meku.report") return this.report(key, args);
    return this.openMission(key, mapped, args);
  }

  acceptMission(missionId: string, humanRef: string) {
    const mission = this.missions.get(missionId);
    if (!mission || mission.state !== "matched") return { ok: false as const, code: "NOT_ACCEPTABLE" };
    mission.state = "accepted";
    mission.humanRef = humanRef;
    mission.agreedScope = mission.action;
    this.audit("human.accepted", humanRef, missionId);
    return { ok: true as const, mission };
  }

  async submitEvidence(missionId: string, humanRef: string, evidenceRef: string) {
    const mission = this.missions.get(missionId);
    if (!mission || mission.humanRef !== humanRef || mission.state !== "funded") {
      return { ok: false as const, code: "EVIDENCE_NOT_ALLOWED" };
    }
    mission.evidenceRefs.push(evidenceRef);
    mission.state = "evidence_submitted";
    await this.writePha(mission, "evidence_submitted");
    return { ok: true as const, phaId: mission.phaId };
  }

  async reviewMission(
    missionId: string,
    reviewerRef: string,
    outcome: "accepted" | "rejected" | "disputed" | "insufficient",
  ) {
    const mission = this.missions.get(missionId);
    if (!mission || mission.state !== "evidence_submitted") return { ok: false as const, code: "NOT_REVIEWABLE" };
    if (reviewerRef === mission.ownerAgentId || reviewerRef === mission.humanRef) {
      return { ok: false as const, code: "SELF_REVIEW_FORBIDDEN" };
    }
    const limitations =
      outcome === "accepted"
        ? "Independent reviewer saw the submitted evidence reference only. A hash is not the observation."
        : "Result is not independently verified.";
    mission.review = {
      method: "independent_human_review",
      outcome,
      limitations,
      reviewerRef,
    };
    mission.state =
      outcome === "accepted" ? "accepted_result" : outcome === "rejected" ? "rejected" : "disputed";
    if (outcome === "insufficient") mission.state = "disputed";
    mission.completedAt = this.now();
    await this.writePha(mission, mission.state);
    this.audit("review." + outcome, reviewerRef, missionId);
    return { ok: true as const, mission };
  }

  rejectMission(missionId: string, humanRef: string) {
    const mission = this.missions.get(missionId);
    if (!mission || (mission.state !== "matched" && mission.state !== "submitted")) {
      return { ok: false as const, code: "NOT_REJECTABLE" };
    }
    mission.state = "rejected";
    mission.humanRef = humanRef;
    this.audit("human.rejected", humanRef, missionId);
    return { ok: true as const, mission };
  }

  fundMission(keyId: string, missionId: string) {
    const key = this.requireWritableKey(keyId);
    const mission = this.missions.get(missionId);
    if (!mission || mission.ownerAgentId !== key.agentId) return { ok: false as const, code: "NOT_FOUND" };
    if (mission.state !== "accepted" || mission.budgetCents == null) {
      return { ok: false as const, code: "FUNDING_NOT_READY" };
    }
    if (!key.allowanceApproved) return { ok: false as const, code: "ALLOWANCE_REQUIRED" };
    if (key.spentCents + mission.budgetCents > key.spendLimitCents) {
      return { ok: false as const, code: "SPEND_LIMIT" };
    }
    const invoice: Invoice = {
      id: this.id("inv"),
      agentId: key.agentId,
      keyId: key.id,
      purpose: "mission",
      planId: null,
      missionId: mission.id,
      priceCents: mission.budgetCents,
      state: "quoted",
      quote: null,
      receiptSignature: null,
      createdAt: this.now(),
    };
    this.invoices.set(invoice.id, invoice);
    return { ok: true as const, invoice, disclosed: feeSplit(mission.budgetCents) };
  }

  founderReport() {
    const active = [...this.keys.values()].filter((key) => this.subscriptionLive(key));
    const byPlan: Record<string, number> = { AGENT: 0, OPERATOR: 0, NETWORK: 0, INTELLIGENCE: 0 };
    for (const key of active) if (key.planId) byPlan[key.planId] += 1;
    const completed = [...this.missions.values()].filter((mission) => mission.state === "accepted_result");
    const simFee = completed.reduce((sum, mission) => sum + (mission.payment?.platformFeeCents ?? 0), 0);
    const simWork = completed.reduce((sum, mission) => sum + (mission.payment?.budgetCents ?? 0), 0);
    const simSubs = [...this.invoices.values()]
      .filter((invoice) => invoice.purpose === "subscription" && invoice.state === "settled")
      .reduce((sum, invoice) => sum + invoice.priceCents, 0);
    return {
      classification: "simulation",
      production: this.production,
      simulation: {
        subscribedKeys: active.length,
        activeByPlan: byPlan,
        subscriptionRevenueCents: simSubs,
        completedHumanWorkCents: simWork,
        platformFeeCents: simFee,
        disputed: [...this.missions.values()].filter((mission) => mission.state === "disputed").length,
        burnedBaseUnits: "0",
        note: "Simulation counters are not customers, volume, or revenue.",
      },
    };
  }

  auditLog() {
    return this.audits.map((entry) => ({ ...entry }));
  }

  getMission(id: string, agentId: string) {
    const mission = this.missions.get(id);
    if (!mission || mission.ownerAgentId !== agentId) return null;
    return mission;
  }

  private async search(key: ExecutionKey, args: Record<string, unknown>): Promise<ToolResult> {
    if (key.revoked) return this.shaped(key, "meku_search_humans", false, "REVOKED", "revoked", "Key is revoked.", args);
    const country = typeof args.country === "string" ? args.country : null;
    const eligible = country === "ID" || country === null ? 1 : 0;
    return this.shaped(
      key,
      "meku_search_humans",
      true,
      "AGGREGATE_ONLY",
      "discovered",
      "Counts are not acceptance. No person was contacted.",
      { country },
      {
        requestId: null,
        humanApproval: "not_requested",
        evidence: "none",
        paymentState: "none",
        detail: `matching_humans=${eligible}; identities withheld`,
      },
    );
  }

  private async openMission(
    key: ExecutionKey,
    capability: CapabilityName | "meku_request_human",
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    if (key.stopped) return this.shaped(key, capability, false, "STOPPED", "stopped", "Operator STOP is in effect.", args);
    if (key.revoked) return this.shaped(key, capability, false, "REVOKED", "revoked", "Key is revoked.", args);
    if (!this.subscriptionLive(key)) {
      return this.shaped(key, capability, false, "ACCESS_REQUIRED", "inactive", "Settle a MEKU SI subscription first.", args);
    }
    if (capability !== "meku_request_human" && !key.capabilities.includes(capability)) {
      return this.shaped(key, capability, false, "CAPABILITY_DENIED", "denied", "This key cannot call that capability.", args);
    }
    const title = typeof args.title === "string" ? args.title.trim() : "";
    const action = typeof args.action === "string" ? args.action.trim() : "";
    const description = typeof args.description === "string" ? args.description.trim() : "";
    if (title.length < 4 || action.length < 4 || description.length < 20) {
      return this.shaped(key, capability, false, "INVALID_INPUT", "rejected", "Title, action, and description are required.", args);
    }
    if (args.unsafe === true || args.illegal === true) {
      return this.shaped(key, capability, false, "UNSAFE_OR_ILLEGAL", "rejected", "This request will not be dispatched.", args);
    }
    const budgetCents = typeof args.budgetCents === "number" ? args.budgetCents : null;
    if (budgetCents != null && (!Number.isInteger(budgetCents) || budgetCents < 0)) {
      return this.shaped(key, capability, false, "BUDGET_INVALID", "rejected", "Budget must be a positive integer cent amount or omitted.", args);
    }
    const active = [...this.missions.values()].filter(
      (mission) => mission.keyId === key.id && !this.terminal(mission.state),
    ).length;
    if (active >= key.missionCapacity) {
      return this.shaped(key, capability, false, "MISSION_CAPACITY", "held", "Active mission slots are full.", args);
    }
    const country = typeof args.country === "string" ? args.country : null;
    const mission: Mission = {
      id: this.id("req"),
      ownerAgentId: key.agentId,
      keyId: key.id,
      capability,
      title,
      action,
      description,
      country,
      budgetCents,
      state: country === "ID" || country === null ? "matched" : "submitted",
      humanRef: null,
      agreedScope: null,
      evidenceRefs: [],
      review: null,
      payment: budgetCents == null ? { state: "unfunded", workerCents: 0, platformFeeCents: 0, budgetCents: 0 } : null,
      createdAt: this.now(),
      completedAt: null,
      phaId: null,
    };
    this.missions.set(mission.id, mission);
    await this.writePha(mission, "requested");
    this.audit("request.created", key.agentId, `${mission.id} ${capability}`);
    return this.shaped(
      key,
      capability,
      true,
      "REQUEST_SUBMITTED",
      mission.state,
      mission.state === "matched"
        ? "A simulated human can accept. Work has not started."
        : "No eligible simulated human. Nothing was dispatched.",
      { title, action, country, budgetCents },
      {
        requestId: mission.id,
        humanApproval: mission.state === "matched" ? "pending_human" : "unmatched",
        evidence: "none",
        paymentState: mission.payment?.state ?? "funding_required",
        proofOfHumanAction: mission.phaId,
      },
    );
  }

  private async report(key: ExecutionKey, args: Record<string, unknown>): Promise<ToolResult> {
    const id = typeof args.id === "string" ? args.id : typeof args.requestId === "string" ? args.requestId : "";
    const mission = this.missions.get(id);
    if (!mission || mission.ownerAgentId !== key.agentId) {
      return this.shaped(key, "meku.report", false, "NOT_FOUND", "hidden", "No visible request for this agent.", args);
    }
    return this.shaped(
      key,
      mission.capability,
      true,
      "REPORT",
      mission.state,
      "A report is not itself proof that the physical work happened.",
      { id: mission.id },
      {
        requestId: mission.id,
        humanApproval: mission.humanRef ? "accepted_by_human" : "pending_human",
        evidence: mission.evidenceRefs.length ? "reference_available" : "none",
        paymentState: mission.payment?.state ?? "unfunded",
        proofOfHumanAction: mission.phaId,
        detail: mission.review ? `${mission.review.outcome}: ${mission.review.limitations}` : "No independent review yet.",
      },
    );
  }

  private async writePha(mission: Mission, phase: string) {
    const body = {
      version: "pha-1",
      phase,
      requestId: mission.id,
      capability: mission.capability,
      requestedByAgent: mission.ownerAgentId,
      humanRef: mission.humanRef,
      agreedScope: mission.agreedScope,
      requestedAction: mission.action,
      evidenceRefs: mission.evidenceRefs,
      review: mission.review,
      payment: mission.payment,
      claimsIndependentlyVerified: mission.review?.outcome === "accepted" ? ["review_outcome"] : [],
      unavailable: mission.review ? [] : ["independent_verification"],
      privateEvidenceOnChain: false,
    };
    const bodyHash = await sha256Hex(canonicalJson(body));
    const integrity = await hmacSha256Hex(LAB_INTEGRITY_KEY, `${mission.id}.${bodyHash}`);
    const id = mission.phaId ?? this.id("pha");
    mission.phaId = id;
    this.pha.set(id, { id, body, bodyHash, integrity });
  }

  async readPha(phaId: string, agentId: string) {
    const record = this.pha.get(phaId);
    if (!record) return null;
    const requestId = String(record.body.requestId ?? "");
    const mission = this.missions.get(requestId);
    if (!mission || mission.ownerAgentId !== agentId) return null;
    const expected = await hmacSha256Hex(LAB_INTEGRITY_KEY, `${requestId}.${record.bodyHash}`);
    return {
      ...record,
      intact: expected === record.integrity,
      signatureMode: "simulated-hmac-sha256",
      productionSignature: false,
    };
  }

  private subscriptionLive(key: ExecutionKey) {
    return Boolean(key.planId && key.expiresAt && key.expiresAt > this.now() && !key.revoked && !key.stopped);
  }

  private requireKey(keyId: string) {
    const key = this.keys.get(keyId);
    if (!key) throw new Error("KEY_MISSING");
    return key;
  }

  private requireWritableKey(keyId: string) {
    const key = this.requireKey(keyId);
    if (key.revoked) throw new Error("REVOKED");
    if (key.stopped) throw new Error("STOPPED");
    return key;
  }

  private allowCall(key: ExecutionKey) {
    const windowStart = this.now() - 60_000;
    this.calls = this.calls.filter((call) => call.at >= windowStart);
    const count = this.calls.filter((call) => call.keyId === key.id).length;
    if (count >= 30) return false;
    this.calls.push({ keyId: key.id, at: this.now() });
    return true;
  }

  private terminal(state: MissionState) {
    return ["accepted_result", "rejected", "disputed", "stopped", "cancelled"].includes(state);
  }

  private fail(key: ExecutionKey, code: string, capability: string, nextAction: string) {
    return { ok: false as const, code, capability, agentId: key.agentId, nextAction };
  }

  private shaped(
    key: ExecutionKey | null,
    capability: string,
    ok: boolean,
    code: string,
    state: string,
    nextAction: string,
    acceptedParameters: Record<string, unknown>,
    extra?: Partial<ToolResult>,
  ): ToolResult {
    return {
      ok,
      code,
      requestId: extra?.requestId ?? null,
      callingAgentId: key?.agentId ?? "none",
      capability,
      state,
      acceptedParameters,
      budget: {
        authorized: Boolean(key?.allowanceApproved),
        limitCents: key?.spendLimitCents ?? 0,
        spentCents: key?.spentCents ?? 0,
        requestedCents: null,
      },
      humanApproval: extra?.humanApproval ?? "not_requested",
      evidence: extra?.evidence ?? "none",
      proofOfHumanAction: extra?.proofOfHumanAction ?? null,
      paymentState: extra?.paymentState ?? "none",
      nextAction,
      detail: extra?.detail,
    };
  }
}

export function validateQuote(quote: Quote, now: number) {
  if (quote.outputMint !== OFFICIAL_MINT) return { ok: false as const, code: "WRONG_MINT" };
  if (quote.cluster !== SOLANA_CLUSTER) return { ok: false as const, code: "WRONG_CHAIN" };
  if (quote.decimals !== MINT_DECIMALS) return { ok: false as const, code: "BAD_DECIMALS" };
  if (!/^\d+$/.test(quote.inAmount) || !/^\d+$/.test(quote.outAmount) || quote.outAmount === "0") {
    return { ok: false as const, code: "BAD_AMOUNT" };
  }
  const impact = Number(quote.priceImpactPct);
  if (!Number.isFinite(impact) || Math.abs(impact) > MAX_PRICE_IMPACT) {
    return { ok: false as const, code: "PRICE_IMPACT" };
  }
  if (!Number.isInteger(quote.slippageBps) || quote.slippageBps < 0 || quote.slippageBps > MAX_SLIPPAGE_BPS) {
    return { ok: false as const, code: "SLIPPAGE" };
  }
  if (!quote.requestId || quote.requestId.length < 8) return { ok: false as const, code: "QUOTE_ID" };
  if (now > quote.quotedAt + QUOTE_TTL_MS) return { ok: false as const, code: "QUOTE_STALE" };
  if (!quote.hops.length) return { ok: false as const, code: "NO_ROUTE" };
  return { ok: true as const, code: "QUOTE_OK" };
}

function verifyReceipt(invoice: Invoice, receipt: Receipt) {
  if (!invoice.quote) return { ok: false as const, code: "QUOTE_MISSING" };
  if (receipt.invoiceId !== invoice.id) return { ok: false as const, code: "INVOICE_MISMATCH" };
  if (receipt.mint !== OFFICIAL_MINT) return { ok: false as const, code: "WRONG_MINT" };
  if (receipt.cluster !== SOLANA_CLUSTER) return { ok: false as const, code: "WRONG_CHAIN" };
  if (receipt.amountBaseUnits !== invoice.quote.outAmount) return { ok: false as const, code: "AMOUNT_MISMATCH" };
  if (!receipt.destination.startsWith("settle_")) return { ok: false as const, code: "WRONG_DESTINATION" };
  if (receipt.finality === "unknown") return { ok: false as const, code: "FINALITY_UNKNOWN" };
  if (receipt.finality !== "finalized" || receipt.slot == null) {
    return { ok: false as const, code: "NOT_FINALIZED" };
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(receipt.signature) && !receipt.signature.startsWith("sim_")) {
    return { ok: false as const, code: "SIGNATURE_FORMAT" };
  }
  return { ok: true as const, code: "RECEIPT_OK" };
}

export function quoteForCents(cents: number, now: number, requestId: string): Quote {
  const units = BigInt(cents) * 126_223_000n;
  return {
    inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    outputMint: OFFICIAL_MINT,
    inAmount: String(cents * 10_000),
    outAmount: units.toString(),
    priceImpactPct: "0.0026",
    slippageBps: 50,
    decimals: MINT_DECIMALS,
    cluster: SOLANA_CLUSTER,
    router: "metis-simulated",
    requestId,
    quotedAt: now,
    hops: ["simulated USDC to SOL", "simulated SOL to MEKUSI via recorded Pump.fun Amm"],
  };
}
