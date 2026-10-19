#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Protocol-level, read-only smoke check for MEKU's documented MCP endpoint.
 * This is a diagnostic, not a replacement for an MCP SDK.
 * It has not been tested with an operator-issued MEKU key.
 */

function validateEndpoint(endpoint) {
  let endpointUrl;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    throw new Error("MEKU_MCP_URL must be a valid URL.");
  }

  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(endpointUrl.hostname);
  if (endpointUrl.protocol !== "https:" && !(endpointUrl.protocol === "http:" && isLoopback)) {
    throw new Error("Use HTTPS for remote servers. HTTP is allowed only for localhost tests.");
  }
  if (endpointUrl.username || endpointUrl.password || endpointUrl.search || endpointUrl.hash) {
    throw new Error("Do not put credentials, query parameters, or fragments in the endpoint URL.");
  }
  return endpointUrl;
}

function summarizeSearch(result) {
  const blocks = Array.isArray(result?.content) ? result.content : [];
  const counts = {};
  const safeCountFields = ["listed_humans", "online_humans", "matching_humans"];

  for (const block of blocks) {
    if (typeof block?.text !== "string") continue;
    try {
      const parsed = JSON.parse(block.text);
      for (const field of safeCountFields) {
        if (Number.isInteger(parsed?.[field]) && parsed[field] >= 0) counts[field] = parsed[field];
      }
    } catch {
      // Keep non-JSON tool text out of stdout; print only its block type below.
    }
  }

  return {
    isError: result?.isError === true,
    contentBlockTypes: blocks.map((block) => typeof block?.type === "string" ? block.type : "unknown"),
    ...(Object.keys(counts).length ? { aggregateCounts: counts } : {}),
  };
}

export async function runSmokeCheck({
  endpoint = process.env.MEKU_MCP_URL || "https://meku.farm/api/public/mcp",
  apiKey = process.env.MEKU_API_KEY,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Set MEKU_API_KEY in a local secret store or process environment.");
  }
  const endpointUrl = validateEndpoint(endpoint);
  let nextId = 0;

  async function postRpc(method, params = {}, { notification = false } = {}) {
    const payload = notification
      ? { jsonrpc: "2.0", method, params }
      : { jsonrpc: "2.0", id: ++nextId, method, params };

    const response = await fetchImpl(endpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.text();

    // MEKU's current docs say notifications/initialized returns 202 with no body.
    if (notification && response.status === 202 && body.length === 0) return null;

    if (!response.ok) {
      const retryNote = response.status === 429
        ? " Automatic retries are disabled; the server documents no Retry-After header."
        : "";
      throw new Error(`HTTP ${response.status} for ${method}.${retryNote}`);
    }
    if (!body) throw new Error(`Empty response body for ${method}.`);

    let envelope;
    try {
      envelope = JSON.parse(body);
    } catch {
      throw new Error(`Expected a JSON response for ${method}.`);
    }

    if (envelope?.jsonrpc !== "2.0") throw new Error("Invalid JSON-RPC envelope for " + method + ".");
    if (envelope?.error) {
      const code = Number.isInteger(envelope.error.code) ? envelope.error.code : "unknown";
      // Do not print server-provided error messages; they may contain request data.
      throw new Error(`JSON-RPC ${code} for ${method}.`);
    }
    if (!notification && envelope?.id !== payload.id) {
      throw new Error(`Response id did not match the request for ${method}.`);
    }
    if (!notification && (!envelope.result || typeof envelope.result !== "object")) {
      throw new Error(`Missing JSON-RPC result for ${method}.`);
    }
    return envelope.result;
  }

  const initialized = await postRpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "meku-readonly-smoke", version: "0.1.0" },
  });
  if (typeof initialized.protocolVersion !== "string") {
    throw new Error("initialize returned no protocolVersion.");
  }

  await postRpc("notifications/initialized", {}, { notification: true });

  const inventory = await postRpc("tools/list");
  const toolNames = Array.isArray(inventory.tools)
    ? inventory.tools.map((tool) => tool?.name).filter((name) => typeof name === "string")
    : [];
  if (!toolNames.includes("meku_search_humans")) {
    throw new Error("tools/list did not include meku_search_humans.");
  }

  // Deliberately allowlist one read-only tool. No write or status tool is called.
  const search = await postRpc("tools/call", {
    name: "meku_search_humans",
    arguments: {},
  });
  if (search.isError === true) throw new Error("meku_search_humans returned isError: true.");

  return {
    endpoint: `${endpointUrl.origin}${endpointUrl.pathname}`,
    initialize: "response received",
    toolsListed: toolNames,
    readOnlyToolCalled: "meku_search_humans",
    resultSummary: summarizeSearch(search),
    note: "No write tool, operator approval, human acceptance, task completion, or payment was tested.",
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  try {
    const report = await runSmokeCheck();
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`MEKU MCP smoke check failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = error?.message?.startsWith("Set MEKU_API_KEY") ? 2 : 1;
  }
}
