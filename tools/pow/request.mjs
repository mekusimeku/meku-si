#!/usr/bin/env node
// Developer-side client for the MEKU proof-of-work pilot (meku.pow/1).
// Speaks MCP Streamable HTTP (JSON-RPC 2.0 over POST) to https://meku.farm/api/public/mcp,
// keeps local receipts, and prints ledger records to post as GitHub comments.
//
// Safety: reads MEKU_API_KEY only from the environment and never prints or stores it;
// makes exactly one MCP call per tool action and never retries on its own; refuses to
// submit unless you type back the code you reviewed. It cannot move money: MEKU's MCP
// server has no payment tool.

import { randomInt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  MCP_ENDPOINT,
  OBJECTS,
  PROTOCOL,
  buildRequestArguments,
  canonicalize,
  generateCode,
  isLedgerUrl,
  recordProblems,
  requestArgumentProblems,
  requestIdCommitment,
  sha256Hex,
} from "./lib.mjs";

export const CLIENT_NAME = "meku-pow-request";
export const CLIENT_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-06-18";
const TIMEOUT_MS = 20_000;

/** Classify a key by its public shape only (the server stays the authority). */
export function keyKind(key) {
  if (typeof key !== "string" || !key.trim()) return "missing";
  if (/^meku_exp1_\d{13}_[0-9a-f]{48}$/.test(key)) return "search-only";
  if (/^meku_[0-9a-f]{48}$/.test(key)) return "writable";
  return "unrecognized";
}

function validateEndpoint(endpoint) {
  const url = new URL(endpoint);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw new Error("Use HTTPS (HTTP only for localhost tests).");
  if (url.username || url.password || url.search || url.hash) throw new Error("No credentials, query or fragment in the endpoint URL.");
  return url;
}

export function makeClient({ endpoint = MCP_ENDPOINT, apiKey, fetchImpl = fetch, now = () => new Date() }) {
  const url = validateEndpoint(endpoint);
  if (keyKind(apiKey) === "missing") throw new Error("Set MEKU_API_KEY in your environment (never in a file you commit).");
  let nextId = 0;
  let initialized = false;
  async function post(method, params, { notification = false } = {}) {
    const payload = notification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: ++nextId, method, params };
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (initialized) headers["MCP-Protocol-Version"] = PROTOCOL_VERSION;
    const response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await response.text();
    const observedAt = now().toISOString();
    if (notification) return { status: response.status, observedAt };
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${method}: HTTP ${response.status} without a JSON-RPC body`);
    }
    if (body?.error) {
      const retry = response.headers?.get?.("retry-after");
      throw new Error(`${method}: HTTP ${response.status}, JSON-RPC ${body.error.code} ${body.error.message}${retry ? ` (Retry-After ${retry}s; do not retry automatically)` : ""}`);
    }
    if (body?.jsonrpc !== "2.0" || body.id !== payload.id || !body.result) throw new Error(`${method}: unexpected JSON-RPC envelope`);
    if (method === "initialize") initialized = true;
    return { status: response.status, result: body.result, observedAt };
  }
  async function callTool(name, args) {
    const answer = await post("tools/call", { name, arguments: args });
    const block = Array.isArray(answer.result.content) ? answer.result.content[0] : null;
    if (typeof block?.text !== "string") throw new Error(`${name}: no text content in the result`);
    if (answer.result.isError) throw new Error(`${name}: tool error: ${block.text.slice(0, 300)}`);
    let parsed;
    try {
      parsed = JSON.parse(block.text);
    } catch {
      throw new Error(`${name}: tool text is not JSON`);
    }
    return { ...answer, text: block.text, parsed };
  }
  return { post, callTool };
}

export function recordComment(record, label) {
  return `MEKU proof-of-work record: seq ${record.seq} ${record.type} (${record.pilot_id})${label ? ` - ${label}` : ""}\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`;
}

const writePrivate = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: "wx" });

// ---- Actions -----------------------------------------------------------------

export function prepareRequest({ pilotId, ledgerUrl, randomSource }) {
  if (!isLedgerUrl(ledgerUrl)) throw new Error("--ledger must be the GitHub issue URL of the pilot ledger.");
  const code = generateCode(randomSource);
  const args = buildRequestArguments({ pilotId, code, ledgerUrl });
  const problems = requestArgumentProblems(args);
  if (problems.length) throw new Error(problems.join("; "));
  return { format: "meku.pow-request/1", pilot_id: pilotId, ledger_url: ledgerUrl, code, arguments: args };
}

export async function checkConnection({ client, apiKey, clientInfo, agent, affirmIndependence, pilotId }) {
  const kind = keyKind(apiKey);
  const init = await client.post("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: clientInfo.name, version: clientInfo.version },
  });
  await client.post("notifications/initialized", {}, { notification: true });
  const list = await client.post("tools/list", {});
  const tools = (list.result.tools ?? []).map((t) => t?.name).filter((n) => typeof n === "string");
  const summary = {
    key_kind_by_shape: kind,
    server: init.result.serverInfo,
    protocol_version: init.result.protocolVersion,
    tools_listed: tools,
    can_submit: tools.includes("meku_request_human"),
  };
  if (!affirmIndependence) return { summary, record: null };
  const record = {
    pow: PROTOCOL,
    pilot_id: pilotId,
    seq: 1,
    type: "developer_ready",
    role: "developer",
    client: { name: clientInfo.name, version: clientInfo.version },
    agent,
    server: { name: init.result.serverInfo?.name, version: String(init.result.serverInfo?.version ?? ""), protocol_version: String(init.result.protocolVersion ?? "") },
    tools_listed: tools,
    independence: { not_meku_staff_or_contractor: true, not_paid_by_meku: true, no_meku_financial_interest: true, controls_own_agent: true },
    payment: "none",
  };
  return { summary, record };
}

export async function submitRequest({ client, prepared, confirm }) {
  if (confirm !== prepared.code) throw new Error("Refusing to submit: --confirm must repeat the exact code shown by prepare, after a person reviewed the request text.");
  const problems = requestArgumentProblems(prepared.arguments);
  if (problems.length) throw new Error(problems.join("; "));
  const answer = await client.callTool("meku_request_human", prepared.arguments);
  return submissionRecords({ prepared, answer });
}

function parseToolText(name, text, observedAt) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${name}: the saved tool result is not the JSON text MEKU returned (copy content[0].text exactly)`);
  }
  return { status: null, text, parsed, observedAt };
}

/** Same records when another MCP host (Claude Code, Cursor, an Agents SDK, Inspector...) made
 *  the call: save the exact text of the tool result, then import it. */
export function importSubmission({ prepared, responseText, observedAt }) {
  return submissionRecords({ prepared, answer: parseToolText("meku_request_human", responseText, observedAt) });
}

export function importStatus({ receipt, responseText, observedAt }) {
  return statusRecords({ receipt, answer: parseToolText("meku_get_request_status", responseText, observedAt) });
}

/** developer_ready when the connection check was done in another MCP host. */
export function manualReadyRecord({ pilotId, clientInfo, agent, server, tools, affirmIndependence }) {
  if (!affirmIndependence) throw new Error("Add --affirm-independence only if every independence statement is true for you.");
  return {
    pow: PROTOCOL,
    pilot_id: pilotId,
    seq: 1,
    type: "developer_ready",
    role: "developer",
    client: { name: clientInfo.name, version: clientInfo.version },
    agent,
    server: { name: "meku-human-cloud", version: server.version, protocol_version: server.protocolVersion },
    tools_listed: tools,
    independence: { not_meku_staff_or_contractor: true, not_paid_by_meku: true, no_meku_financial_interest: true, controls_own_agent: true },
    payment: "none",
  };
}

function submissionRecords({ prepared, answer }) {
  const r = answer.parsed;
  if (typeof r.id !== "string" || typeof r.status !== "string" || typeof r.created_at !== "string") throw new Error("meku_request_human: answer lacks id, status or created_at");
  const receipt = {
    format: "meku.pow-receipt/1",
    kind: "submit",
    pilot_id: prepared.pilot_id,
    code: prepared.code,
    endpoint: MCP_ENDPOINT,
    request_id: r.id,
    sent_arguments: prepared.arguments,
    http_status: answer.status,
    response_text: answer.text,
    response_text_sha256: sha256Hex(answer.text),
    observed_at: answer.observedAt,
  };
  const record = {
    pow: PROTOCOL,
    pilot_id: prepared.pilot_id,
    seq: 2,
    type: "request_submitted",
    role: "developer",
    code: prepared.code,
    arguments: prepared.arguments,
    arguments_sha256: sha256Hex(canonicalize(prepared.arguments)),
    request_id_sha256: requestIdCommitment(r.id),
    response: { status: r.status, created_at: r.created_at, deduplicated: r.deduplicated === true },
    response_text_sha256: receipt.response_text_sha256,
    observed_at: answer.observedAt,
    payment: "none",
  };
  return { receipt, record };
}

const STORED_FIELDS = ["title", "action", "description", "country", "region", "skills", "deliverable", "timeframe", "budget_text", "travel_required", "equipment_required", "requester_kind", "status", "created_at"];

export async function readStatus({ client, receipt }) {
  const answer = await client.callTool("meku_get_request_status", { id: receipt.request_id });
  return statusRecords({ receipt, answer });
}

function statusRecords({ receipt, answer }) {
  const request = answer.parsed?.request;
  if (!request || request.id !== receipt.request_id) throw new Error("meku_get_request_status: answer is not this request");
  const stored = Object.fromEntries(STORED_FIELDS.map((k) => [k, request[k] ?? null]));
  const statusReceipt = {
    format: "meku.pow-receipt/1",
    kind: "status",
    pilot_id: receipt.pilot_id,
    request_id: receipt.request_id,
    http_status: answer.status,
    response_text: answer.text,
    response_text_sha256: sha256Hex(answer.text),
    observed_at: answer.observedAt,
  };
  const record =
    request.status === "approved"
      ? {
          pow: PROTOCOL,
          pilot_id: receipt.pilot_id,
          seq: 4,
          type: "request_status_observed",
          role: "developer",
          request_id_sha256: requestIdCommitment(receipt.request_id),
          stored_request: stored,
          stored_request_sha256: sha256Hex(canonicalize(stored)),
          response_text_sha256: statusReceipt.response_text_sha256,
          observed_at: answer.observedAt,
        }
      : null;
  const codeIntact = typeof request.description === "string" && request.description.includes(receipt.code);
  return { status: request.status, codeIntact, statusReceipt, record };
}

export function revealObject({ pilotId, pick = randomInt }) {
  const object = OBJECTS[pick(OBJECTS.length)];
  return { pow: PROTOCOL, pilot_id: pilotId, seq: 7, type: "object_revealed", role: "developer", object };
}

// ---- CLI ---------------------------------------------------------------------

const USAGE = `Usage (run from a checkout of github.com/mekusimeku/meku-si, Node.js 20+):
  node tools/pow/request.mjs prepare --ledger <issue-url> [--pilot POW-001] [--out pow-request.json]
  node tools/pow/request.mjs check   --pilot POW-001 --client-name <name> --client-version <v> --agent "<your agent>" [--affirm-independence]
  node tools/pow/request.mjs submit  --request pow-request.json --confirm <CODE> [--receipt pow-receipt.json] [--retry]
  node tools/pow/request.mjs status  --receipt pow-receipt.json [--out pow-status-N.json]
  node tools/pow/request.mjs reveal  --pilot POW-001
If your own MCP host (Claude Code, Cursor, an Agents SDK, MCP Inspector...) makes the calls instead:
  node tools/pow/request.mjs ready-manual  --pilot POW-001 --client-name <host> --client-version <v> --agent "<agent>" --server-version <v> --protocol-version <v> --tools a,b,c --affirm-independence
  node tools/pow/request.mjs import-submit --request pow-request.json --response-text-file submit-result.txt [--receipt pow-receipt.json]
  node tools/pow/request.mjs import-status --receipt pow-receipt.json --response-text-file status-result.txt
  (save the tool result text exactly as MEKU returned it: content[0].text)
Environment: MEKU_API_KEY (operator-issued pilot key; never commit or print it).`;

async function main(argv) {
  const [command, ...rest] = argv;
  const opt = (name) => {
    const i = rest.indexOf(`--${name}`);
    return i === -1 ? undefined : rest[i + 1];
  };
  const flag = (name) => rest.includes(`--${name}`);
  const pilotId = opt("pilot") ?? "POW-001";
  const known = ["prepare", "check", "submit", "status", "reveal", "ready-manual", "import-submit", "import-status"];
  if (!known.includes(command)) {
    console.error(USAGE);
    return 3;
  }
  try {
    if (command === "prepare") {
      const out = opt("out") ?? "pow-request.json";
      if (existsSync(out)) throw new Error(`${out} exists; one pilot uses one code. Remove it only if nothing was submitted.`);
      const prepared = prepareRequest({ pilotId, ledgerUrl: opt("ledger") });
      writePrivate(out, prepared);
      console.log(`Saved ${out}. A person must read the exact request below before anything is sent.\n`);
      for (const [k, v] of Object.entries(prepared.arguments)) console.log(`${k}: ${JSON.stringify(v)}`);
      console.log(`\nCode: ${prepared.code}\nTo submit after review: node tools/pow/request.mjs submit --request ${out} --confirm ${prepared.code}`);
      return 0;
    }
    if (command === "reveal") {
      const record = revealObject({ pilotId });
      console.log("Post this ONLY after the human's consent comment (seq 6) is visible in the ledger:\n");
      console.log(recordComment(record, "object named after consent"));
      return 0;
    }
    const observedAt = opt("observed-at") ?? new Date().toISOString();
    if (command === "ready-manual") {
      const tools = (opt("tools") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
      const record = manualReadyRecord({
        pilotId,
        clientInfo: { name: opt("client-name"), version: opt("client-version") },
        agent: opt("agent"),
        server: { version: opt("server-version"), protocolVersion: opt("protocol-version") },
        tools,
        affirmIndependence: flag("affirm-independence"),
      });
      const problems = recordProblems(record);
      if (problems.length) throw new Error(problems.join("; "));
      if (!tools.includes("meku_request_human")) throw new Error("Your host did not list meku_request_human: the key cannot submit. Stop and ask the operator.");
      console.log(`Post this as a new comment in the ledger:\n\n${recordComment(record)}`);
      return 0;
    }
    if (command === "import-submit") {
      const receiptPath = opt("receipt") ?? "pow-receipt.json";
      const prepared = JSON.parse(readFileSync(opt("request") ?? "pow-request.json", "utf8"));
      const responseText = readFileSync(opt("response-text-file"), "utf8").trim();
      const { receipt, record } = importSubmission({ prepared, responseText, observedAt });
      writePrivate(receiptPath, receipt);
      console.log(`Imported. MEKU status: ${record.response.status}. Private receipt saved to ${receiptPath}.\n\nPost this as a new comment in the ledger:\n\n${recordComment(record)}`);
      return 0;
    }
    if (command === "import-status") {
      const receipt = JSON.parse(readFileSync(opt("receipt") ?? "pow-receipt.json", "utf8"));
      const responseText = readFileSync(opt("response-text-file"), "utf8").trim();
      const { status, codeIntact, record } = importStatus({ receipt, responseText, observedAt });
      console.log(`MEKU request status: ${status}. Code intact in stored text: ${codeIntact}.`);
      if (!codeIntact) console.log("STOP: the stored description does not contain your code. Post a stop record and report it.");
      if (record) console.log(`\nPost this as a new comment in the ledger:\n\n${recordComment(record)}`);
      return 0;
    }
    const apiKey = process.env.MEKU_API_KEY;
    const client = makeClient({ apiKey });
    if (command === "check") {
      const name = opt("client-name");
      const version = opt("client-version");
      const agent = opt("agent");
      if (!name || !version || !agent) throw new Error("check needs --client-name, --client-version and --agent.");
      const { summary, record } = await checkConnection({ client, apiKey, clientInfo: { name, version }, agent, affirmIndependence: flag("affirm-independence"), pilotId });
      console.log(JSON.stringify(summary, null, 2));
      if (!summary.can_submit) {
        console.log("\nThis key cannot submit requests (search-only or not enabled). Ask the MEKU operator for the pilot key. Stop here.");
        return 2;
      }
      if (!record) console.log("\nRead the four independence statements in docs/proof-of-work/developer-guide.md. If every one is true, rerun with --affirm-independence to print your developer_ready record.");
      else console.log(`\nPost this as a new comment in the ledger:\n\n${recordComment(record)}`);
      return 0;
    }
    if (command === "submit") {
      const requestPath = opt("request") ?? "pow-request.json";
      const receiptPath = opt("receipt") ?? "pow-receipt.json";
      if (existsSync(receiptPath) && !flag("retry")) throw new Error(`${receiptPath} exists: this request was already submitted. Use status instead.`);
      if (keyKind(apiKey) === "search-only") throw new Error("This is a search-only key (meku_exp1_...). It cannot submit; ask the operator for the pilot key.");
      const prepared = JSON.parse(readFileSync(requestPath, "utf8"));
      const { receipt, record } = await submitRequest({ client, prepared, confirm: opt("confirm") });
      if (flag("retry") && existsSync(receiptPath)) writeFileSync(`${receiptPath}.retry-${Date.now()}.json`, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
      else writePrivate(receiptPath, receipt);
      console.log(`Submitted. MEKU status: ${record.response.status}. Private receipt saved to ${receiptPath} (it holds the request id; do not publish it).\n`);
      console.log(`Post this as a new comment in the ledger:\n\n${recordComment(record)}`);
      return 0;
    }
    if (command === "status") {
      const receiptPath = opt("receipt") ?? "pow-receipt.json";
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      const { status, codeIntact, statusReceipt, record } = await readStatus({ client, receipt });
      const out = opt("out") ?? `pow-status-${Date.now()}.json`;
      writePrivate(out, statusReceipt);
      console.log(`MEKU request status: ${status}. Code intact in stored text: ${codeIntact}. Receipt: ${out}`);
      if (!codeIntact) console.log("STOP: the stored description does not contain your code. Post a stop record and report it.");
      if (record) console.log(`\nPost this as a new comment in the ledger:\n\n${recordComment(record)}`);
      else console.log("Not approved yet. Check again later by hand; this tool never polls.");
      return 0;
    }
    console.error(USAGE);
    return 3;
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await main(process.argv.slice(2));
