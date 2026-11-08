import { CAPABILITIES } from "./constants.ts";
import {
  quoteForCents,
  RealityEngine,
  type EngineSnapshot,
  type Quote,
  type Receipt,
  type ToolResult,
} from "./engine.ts";

export type LabAgent = {
  token: string;
  agentId: string;
  orgId: string;
  readOnly: boolean;
  revoked: boolean;
  keyId: string | null;
};

export type LabHuman = { token: string; ref: string; role: "worker" | "reviewer" | "operator" };

type Idempotent = { status: number; body: unknown };

const FIELD_TOOLS = new Set([
  "meku.inspect",
  "meku.verify",
  "meku.collect",
  "meku.test",
  "meku.execute",
  "meku.report",
  "meku_inspect",
  "meku_verify",
  "meku_collect",
  "meku_test",
  "meku_execute",
  "meku_report",
  "meku_search_humans",
  "meku_request_human",
  "meku_get_request_status",
]);

export class LabSession {
  readonly agents = new Map<string, LabAgent>();
  readonly humans = new Map<string, LabHuman>();
  readonly engine: RealityEngine;
  readonly environment: "TEST" = "TEST";
  private readonly clockBox: { value: number };
  private idempotency = new Map<string, Idempotent>();
  private lock: Promise<void> = Promise.resolve();

  constructor(engine: RealityEngine, clockBox: { value: number }) {
    this.engine = engine;
    this.clockBox = clockBox;
  }

  static open(start = 1_762_560_000_000): LabSession {
    const clockBox = { value: start };
    const session = new LabSession(new RealityEngine(() => clockBox.value), clockBox);
    session.seed();
    return session;
  }

  static restore(snapshot: EngineSnapshot, agents: LabAgent[], humans: LabHuman[], clock: number): LabSession {
    const clockBox = { value: clock };
    const session = new LabSession(RealityEngine.restore(snapshot, () => clockBox.value), clockBox);
    for (const agent of agents) session.agents.set(agent.token, agent);
    for (const human of humans) session.humans.set(human.token, human);
    return session;
  }

  private seed() {
    const operator = this.engine.issueKey({
      agentId: "agent_operator",
      orgId: "org_lab",
      spendLimitCents: 50_000,
      allowanceApproved: true,
    });
    const other = this.engine.issueKey({
      agentId: "agent_other",
      orgId: "org_other",
      spendLimitCents: 20_000,
      allowanceApproved: true,
    });
    const reader = this.engine.issueKey({
      agentId: "agent_reader",
      orgId: "org_lab",
      spendLimitCents: 0,
      allowanceApproved: false,
      capabilities: [],
    });
    this.agents.set("meku_test_operator", {
      token: "meku_test_operator",
      agentId: "agent_operator",
      orgId: "org_lab",
      readOnly: false,
      revoked: false,
      keyId: operator.id,
    });
    this.agents.set("meku_test_other", {
      token: "meku_test_other",
      agentId: "agent_other",
      orgId: "org_other",
      readOnly: false,
      revoked: false,
      keyId: other.id,
    });
    this.agents.set("meku_test_reader", {
      token: "meku_test_reader",
      agentId: "agent_reader",
      orgId: "org_lab",
      readOnly: true,
      revoked: false,
      keyId: reader.id,
    });
    this.humans.set("human_test_worker", { token: "human_test_worker", ref: "human_7f3a", role: "worker" });
    this.humans.set("human_test_reviewer", { token: "human_test_reviewer", ref: "reviewer_independent", role: "reviewer" });
    this.humans.set("human_test_operator", { token: "human_test_operator", ref: "operator", role: "operator" });
  }

  advance(ms: number) {
    this.clockBox.value += ms;
  }

  exportState() {
    return {
      environment: this.environment,
      clock: this.clockBox.value,
      snapshot: this.engine.snapshot(),
      agents: [...this.agents.values()],
      humans: [...this.humans.values()],
      report: this.engine.founderReport(),
    };
  }

  async handleMcp(request: Request): Promise<Response> {
    return this.exclusive(() => this.mcp(request));
  }

  async handleHuman(request: Request): Promise<Response> {
    return this.exclusive(() => this.human(request));
  }

  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.lock;
    let release: () => void = () => {};
    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async mcp(request: Request): Promise<Response> {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const agent = token ? this.agents.get(token) : undefined;
    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return rpcResponse(null, null, -32700, "Parse error", 400);
    }
    if (!parsed || typeof parsed !== "object" || (parsed as { jsonrpc?: string }).jsonrpc !== "2.0") {
      return rpcResponse(null, null, -32600, "Invalid JSON-RPC 2.0 request", 400);
    }
    const body = parsed as { id?: string | number | null; method?: string; params?: Record<string, unknown> };
    if (body.method === "initialize") {
      return rpcResponse(body.id ?? null, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "meku-reality-lab", version: "0.1.0" },
        instructions:
          "Isolated TEST server. Simulated receipts only. Humans consent before work. Paid tools require a settled subscription. Production revenue is not affected.",
      });
    }
    if (body.method === "ping") return rpcResponse(body.id ?? null, {});
    if (!agent || agent.revoked) {
      return rpcResponse(body.id ?? null, null, -32001, "Missing or revoked test API key", 401);
    }
    if (body.method === "tools/list") {
      const tools = agent.readOnly ? TOOL_DEFS.filter((tool) => tool.name === "meku_search_humans") : TOOL_DEFS;
      return rpcResponse(body.id ?? null, { tools });
    }
    if (body.method !== "tools/call") {
      return rpcResponse(body.id ?? null, null, -32601, `Method not found: ${body.method ?? ""}`);
    }
    const params = body.params ?? {};
    const name = typeof params.name === "string" ? params.name : "";
    const args = params.arguments && typeof params.arguments === "object" ? (params.arguments as Record<string, unknown>) : {};
    if (agent.readOnly && name !== "meku_search_humans") {
      return rpcResponse(body.id ?? null, toolError("This read-only key permits only meku_search_humans."));
    }
    const idempotencyKey = typeof args.idempotencyKey === "string" ? args.idempotencyKey : "";
    if (idempotencyKey) {
      const cached = this.idempotency.get(`${agent.agentId}:${name}:${idempotencyKey}`);
      if (cached) return Response.json(cached.body, { status: cached.status });
    }
    const result = await this.dispatch(agent, name, args);
    if (result === null) return rpcResponse(body.id ?? null, null, -32602, `Unknown tool: ${name}`);
    const response = rpcResponse(body.id ?? null, result);
    if (idempotencyKey) {
      const cloned = (await response.clone().json()) as unknown;
      this.idempotency.set(`${agent.agentId}:${name}:${idempotencyKey}`, { status: response.status, body: cloned });
    }
    return response;
  }

  private async dispatch(agent: LabAgent, name: string, args: Record<string, unknown>) {
    if (!agent.keyId) return toolError("KEY_MISSING");
    if (name === "meku_market_quote" || name === "meku_market_settle") return this.market(agent, name, args);
    if (name === "meku_delegate") return this.delegate(agent, args);
    if (name === "meku_stop") {
      this.engine.stop(agent.keyId, agent.agentId);
      return toolText({ ok: true, code: "STOPPED", environment: "TEST" });
    }
    if (!FIELD_TOOLS.has(name)) return null;
    const result = await this.engine.call(agent.keyId, name === "meku_get_request_status" ? "meku.report" : name, args);
    return toolText({ ...result, environment: "TEST", fundsMoved: false });
  }

  private delegate(agent: LabAgent, args: Record<string, unknown>) {
    if (!agent.keyId) return toolError("KEY_MISSING");
    const raw = args.spendLimitCents;
    try {
      const spendLimitCents = raw === "unlimited" ? Number.POSITIVE_INFINITY : Number(raw);
      const child = this.engine.issueKey({
        agentId: typeof args.agentId === "string" ? args.agentId : "agent_child",
        orgId: agent.orgId,
        parentKeyId: agent.keyId,
        spendLimitCents,
        allowanceApproved: false,
      });
      return toolText({ ok: true, code: "DELEGATED", keyId: child.id, spendLimitCents: child.spendLimitCents });
    } catch (error) {
      const code = error instanceof Error ? error.message : "DELEGATION_REJECTED";
      return toolText({ ok: false, code, environment: "TEST" });
    }
  }

  private market(agent: LabAgent, name: string, args: Record<string, unknown>) {
    if (!agent.keyId) return toolError("KEY_MISSING");
    const plan = args.plan === "AGENT" || args.plan === "OPERATOR" || args.plan === "NETWORK" || args.plan === "INTELLIGENCE" ? args.plan : null;
    if (name === "meku_market_quote") {
      if (!plan) return toolText({ ok: false, code: "PLAN_UNKNOWN", environment: "TEST" });
      const opened = this.engine.createSubscriptionInvoice(agent.keyId, plan, plan === "INTELLIGENCE" ? Number(args.enterpriseMissionCap) : undefined);
      if (!opened.ok) return toolText({ ok: false, code: opened.code, environment: "TEST", fundsMoved: false });
      const quote = quoteForCents(opened.invoice.priceCents, this.clockBox.value, `lab_${opened.invoice.id}`);
      const attached = this.engine.attachQuote(opened.invoice.id, quote);
      if (!attached.ok) return toolText({ ok: false, code: attached.code, invoiceId: opened.invoice.id, fundsMoved: false });
      return toolText({
        ok: true,
        code: "QUOTE_OK",
        environment: "TEST",
        invoiceId: opened.invoice.id,
        priceCents: opened.invoice.priceCents,
        outAmount: quote.outAmount,
        fundsMoved: false,
        atomicCheckout: "not-demonstrated",
        note: "Simulated quote. No wallet was asked to sign.",
      });
    }
    const invoiceId = typeof args.invoiceId === "string" ? args.invoiceId : "";
    const invoice = this.engine.snapshot().invoices.find((item) => item.id === invoiceId);
    if (!invoice || !invoice.quote) return toolText({ ok: false, code: "INVOICE_MISSING", fundsMoved: false });
    const mode = typeof args.mode === "string" ? args.mode : "simulated-finalized";
    const receipt = labReceipt(invoice.id, invoice.quote, mode);
    const settled = this.engine.submitReceipt(invoice.id, receipt, plan === "INTELLIGENCE" ? Number(args.enterpriseMissionCap) : undefined);
    return toolText({
      ok: settled.ok,
      code: settled.code,
      activated: settled.activated,
      environment: "TEST",
      invoiceId,
      fundsMoved: false,
      note: "Simulated settlement. Not a Mainnet receipt.",
    });
  }

  private async human(request: Request): Promise<Response> {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const human = this.humans.get(token);
    if (!human) return Response.json({ ok: false, code: "HUMAN_AUTH" }, { status: 401 });
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ ok: false, code: "BAD_JSON" }, { status: 400 });
    }
    const missionId = typeof body.missionId === "string" ? body.missionId : "";
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "stop") {
      if (human.role !== "operator") return Response.json({ ok: false, code: "STOP_FORBIDDEN" }, { status: 403 });
      const keyId = typeof body.keyId === "string" ? body.keyId : "";
      this.engine.stop(keyId, human.ref);
      return Response.json({ ok: true, code: "STOPPED", environment: "TEST" });
    }
    if (action === "accept") {
      const result = this.engine.acceptMission(missionId, human.ref);
      return Response.json({ ...result, environment: "TEST", consent: result.ok ? "accepted" : "not_accepted" });
    }
    if (action === "reject") {
      const result = this.engine.rejectMission(missionId, human.ref);
      return Response.json({ ...result, environment: "TEST" });
    }
    if (action === "evidence") {
      const evidenceRef = typeof body.evidenceRef === "string" ? body.evidenceRef : "";
      const result = await this.engine.submitEvidence(missionId, human.ref, evidenceRef);
      return Response.json({ ...result, environment: "TEST", privateEvidenceOnChain: false });
    }
    if (action === "review") {
      const outcome = body.outcome === "accepted" || body.outcome === "rejected" || body.outcome === "disputed" ? body.outcome : "disputed";
      const result = await this.engine.reviewMission(missionId, human.ref, outcome);
      return Response.json(result.ok ? { ok: true, state: result.mission.state, environment: "TEST" } : { ok: false, code: result.code, environment: "TEST" });
    }
    if (action === "fund") {
      const keyId = typeof body.keyId === "string" ? body.keyId : "";
      const funded = this.engine.fundMission(keyId, missionId);
      if (!funded.ok) return Response.json({ ok: false, code: funded.code, environment: "TEST", fundsMoved: false });
      const quote = quoteForCents(funded.invoice.priceCents, this.clockBox.value, `lab_fund_${funded.invoice.id}`);
      const attached = this.engine.attachQuote(funded.invoice.id, quote);
      if (!attached.ok) return Response.json({ ok: false, code: attached.code, fundsMoved: false });
      const paid = this.engine.submitReceipt(funded.invoice.id, labReceipt(funded.invoice.id, quote, "simulated-finalized"));
      return Response.json({
        ok: paid.ok,
        code: paid.ok ? "MISSION_FUNDED" : paid.code,
        disclosed: funded.disclosed,
        environment: "TEST",
        fundsMoved: false,
      });
    }
    return Response.json({ ok: false, code: "UNKNOWN_ACTION" }, { status: 400 });
  }
}

function labReceipt(invoiceId: string, quote: Quote, mode: string): Receipt {
  const finality = mode === "unknown" ? "unknown" : "finalized";
  return {
    signature: mode === "replay" ? `sim_replay_${invoiceId}` : `sim_${invoiceId}_${quote.requestId}_${mode}`.slice(0, 80),
    invoiceId,
    mint: mode === "wrong-mint" ? "So11111111111111111111111111111111111111112" : quote.outputMint,
    cluster: quote.cluster,
    amountBaseUnits: quote.outAmount,
    destination: `settle_${invoiceId}`,
    finality,
    slot: finality === "finalized" ? 100 : null,
  };
}

function rpcResponse(id: string | number | null, result: unknown, code?: number, message?: string, status = 200) {
  if (code !== undefined) {
    return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
  }
  return Response.json({ jsonrpc: "2.0", id, result }, { status });
}

function toolText(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], isError: false };
}

function toolError(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}

const TOOL_DEFS = [
  ...["meku_search_humans", "meku_request_human", "meku_get_request_status"].map((name) => ({
    name,
    description: "Existing Human Cloud tool. Preserved. A request is not dispatch or payment.",
  })),
  ...CAPABILITIES.flatMap((name) => [
    { name, description: "Reality Engine capability. Submits a review request. Does not dispatch, spend, or self-verify." },
    { name: name.replace(".", "_"), description: "Underscore alias of the same capability." },
  ]),
  { name: "meku_market_quote", description: "TEST ONLY simulated Market Gate quote. No transaction is built." },
  { name: "meku_market_settle", description: "TEST ONLY simulated receipt. Does not move Mainnet funds." },
  { name: "meku_delegate", description: "Issue a child execution key. Unlimited spend is rejected." },
  { name: "meku_stop", description: "STOP this key and its open missions." },
];

export async function readTool(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as { result?: { content?: { text?: string }[] }; error?: { message?: string } };
  if (body.error) return { ok: false, code: body.error.message ?? "RPC_ERROR" };
  const text = body.result?.content?.[0]?.text ?? "{}";
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, code: "BAD_TOOL_BODY", text };
  }
}

export function mcpRequest(token: string, id: number, method: string, params?: Record<string, unknown>) {
  return new Request("http://lab.local/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

export type { ToolResult };
