// In-memory MOCK of MEKU's documented MCP contract, for offline tests and the synthetic
// example only. It is NOT the live server and proves nothing about it. Behaviour mirrors
// https://meku.farm/docs as of 2026-11-28: keyless initialize/tools/list, keyed tools/call,
// search-only keys list only meku_search_humans, request text trimmed and capped, an
// idempotency key returns the saved request, status scoped to the submitting key.

const LIMITS = { title: 120, action: 200, description: 2000, country: 80, region: 80, deliverable: 300, timeframe: 120, budget_text: 80 };
const DECLARED = new Set(["title", "action", "description", "country", "region", "skills", "deliverable", "timeframe", "budget_text", "travel_required", "equipment_required", "idempotencyKey"]);
const TOOL_NAMES = ["meku_search_humans", "meku_request_human", "meku_get_request_status"];

export function createMockMeku({ keys = {}, ids = [], clock = () => new Date("2026-01-05T10:00:00Z") } = {}) {
  const requests = new Map();
  const calls = [];
  const idQueue = [...ids];
  const json = (status, body, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
  const rpc = (id, result) => ({ jsonrpc: "2.0", id, result });
  const err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  const text = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
  const toolError = (message) => ({ content: [{ type: "text", text: message }], isError: true });
  const clean = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

  async function fetchImpl(url, init = {}) {
    const body = JSON.parse(init.body);
    const auth = init.headers?.Authorization ?? "";
    const key = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    calls.push({ url: String(url), method: body.method, headers: { ...init.headers }, body });
    const agent = key ? keys[key] : null;
    if (key && !agent) return json(401, err(null, -32001, "Invalid API key."));
    if (body.method === "initialize")
      return json(200, rpc(body.id, { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "meku-human-cloud", version: "1.0.0" } }));
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/list")
      return json(200, rpc(body.id, { tools: (agent?.readOnly === false ? TOOL_NAMES : ["meku_search_humans"]).map((name) => ({ name })) }));
    if (!agent) return json(401, err(null, -32001, "Missing API key. Send Authorization: Bearer meku_..."));
    if (body.method !== "tools/call") return json(200, err(body.id, -32601, `Method not found: ${body.method}`));
    const { name, arguments: args = {} } = body.params ?? {};
    if (agent.readOnly !== false && name !== "meku_search_humans") return json(200, rpc(body.id, toolError("This read-only key permits only meku_search_humans through MCP.")));
    if (name === "meku_request_human") {
      if (Object.keys(args).some((k) => !DECLARED.has(k))) return json(400, err(body.id, -32602, "Invalid tool parameters."));
      const saved = {
        title: clean(args.title, LIMITS.title),
        action: clean(args.action, LIMITS.action),
        description: clean(args.description, LIMITS.description),
        country: clean(args.country, LIMITS.country) || null,
        region: clean(args.region, LIMITS.region) || null,
        skills: (args.skills ?? []).map((s) => clean(s, 40)).filter(Boolean).slice(0, 10),
        deliverable: clean(args.deliverable, LIMITS.deliverable) || null,
        timeframe: clean(args.timeframe, LIMITS.timeframe) || null,
        budget_text: clean(args.budget_text, LIMITS.budget_text) || null,
        travel_required: args.travel_required === true,
        equipment_required: args.equipment_required === true,
        requester_kind: "agent",
      };
      if (saved.title.length < 4) return json(200, rpc(body.id, toolError("Title must be at least 4 characters")));
      const existing = [...requests.values()].find((r) => r.keyId === agent.id && r.idempotencyKey && r.idempotencyKey === args.idempotencyKey);
      if (existing) return json(200, rpc(body.id, text({ id: existing.id, status: existing.status, created_at: existing.created_at, deduplicated: true })));
      const id = idQueue.shift() ?? crypto.randomUUID();
      const row = { ...saved, id, status: "submitted", created_at: clock().toISOString(), keyId: agent.id, idempotencyKey: args.idempotencyKey ?? null };
      requests.set(id, row);
      return json(200, rpc(body.id, text({ id, status: row.status, created_at: row.created_at, note: "Request submitted for operator review. No mission or payment was created; a human must consent before anything happens." })));
    }
    if (name === "meku_get_request_status") {
      const row = requests.get(args.id);
      if (!row || row.keyId !== agent.id) return json(200, rpc(body.id, toolError("Request not found.")));
      const { keyId, idempotencyKey, ...visible } = row;
      void keyId;
      void idempotencyKey;
      return json(200, rpc(body.id, text({ request: visible })));
    }
    return json(200, err(body.id, -32602, `Unknown tool: ${name}`));
  }

  return {
    fetchImpl,
    calls,
    setStatus(id, status) {
      requests.get(id).status = status;
    },
    tamper(id, field, value) {
      requests.get(id)[field] = value;
    },
  };
}
