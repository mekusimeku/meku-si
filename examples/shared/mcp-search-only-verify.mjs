#!/usr/bin/env node
/** Dependency-free MCP contract verifier. Credentials and response bodies stay in memory. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PROTOCOL = "2025-06-18";
const NOTE =
  "Aggregate availability only. Individual humans are never identified, and every human consents before any mission.";
const DENIED = "This API key permits aggregate human search only.";
const TEST_ID = "00000000-0000-4000-8000-000000000099";
const MAX_BYTES = 65536;
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v, keys) =>
  object(v) && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));

class VerificationFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function requireCheck(value, code) {
  if (!value) throw new VerificationFailure(code);
}

function endpointUrl(value, allowRemote) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new VerificationFailure("endpoint-required");
  }
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  // This procedure is for isolated tests. Remote approval never permits the live site.
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  requireCheck(!["meku.farm", "www.meku.farm"].includes(host), "production-endpoint-denied");
  requireCheck(
    !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/api/public/mcp",
    "unsafe-endpoint",
  );
  requireCheck(url.protocol === "https:" || (local && url.protocol === "http:"), "https-required");
  requireCheck(local || allowRemote === true, "remote-approval-required");
  return { url, local };
}

async function boundedJson(response) {
  requireCheck(
    response.headers.get("content-type")?.split(";")[0]?.trim() === "application/json",
    "expected-json",
  );
  requireCheck(
    response.headers.get("cache-control")?.split(/,\s*/).includes("no-store"),
    "cache-protection-missing",
  );
  const length = response.headers.get("content-length");
  requireCheck(
    length === null || (Number.isFinite(Number(length)) && Number(length) <= MAX_BYTES),
    "response-too-large",
  );
  requireCheck(response.body, "empty-response");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new VerificationFailure("response-too-large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof VerificationFailure) throw error;
    throw new VerificationFailure("response-read-failed");
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new VerificationFailure("invalid-json");
  }
}

function toolText(result, error = false) {
  requireCheck(
    exact(result, error ? ["content", "isError"] : ["content"]) ||
      (!error && exact(result, ["content", "isError"]) && result.isError === false),
    "unexpected-tool-fields",
  );
  requireCheck(error ? result.isError === true : result.isError !== true, "tool-result-state");
  requireCheck(Array.isArray(result.content) && result.content.length === 1, "unexpected-content");
  const block = result.content[0];
  requireCheck(
    exact(block, ["type", "text"]) && block.type === "text" && typeof block.text === "string",
    "unexpected-content",
  );
  return block.text;
}

function aggregateCounts(result) {
  let data;
  try {
    data = JSON.parse(toolText(result));
  } catch (error) {
    if (error instanceof VerificationFailure) throw error;
    throw new VerificationFailure("invalid-aggregate-json");
  }
  requireCheck(
    exact(data, [
      "listed_humans",
      "online_humans",
      "matching_humans",
      "matched_skills",
      "countries",
      "note",
    ]),
    "private-or-unexpected-search-fields",
  );
  for (const name of ["listed_humans", "online_humans", "matching_humans"])
    requireCheck(
      Number.isInteger(data[name]) && data[name] >= 0 && data[name] <= 500,
      "invalid-aggregate-counts",
    );
  requireCheck(
    data.matching_humans <= data.online_humans && data.online_humans <= data.listed_humans,
    "inconsistent-aggregate-counts",
  );
  requireCheck(
    Array.isArray(data.matched_skills) && data.matched_skills.length === 0,
    "unexpected-skill-data",
  );
  requireCheck(
    Array.isArray(data.countries) &&
      data.countries.length <= data.online_humans &&
      new Set(data.countries).size === data.countries.length,
    "invalid-countries",
  );
  requireCheck(
    data.countries.every(
      (v) => typeof v === "string" && v.length <= 80 && !/[@:/\\\r\n]|meku_|sb_/i.test(v),
    ),
    "unexpected-country-data",
  );
  requireCheck(data.note === NOTE, "unexpected-search-note");
  // Never include countries, skills, arbitrary server strings or raw envelopes in the report.
  return {
    listed_humans: data.listed_humans,
    online_humans: data.online_humans,
    matching_humans: data.matching_humans,
  };
}

export async function verifySearchOnly({
  endpoint,
  apiKey,
  phase = "active",
  allowRemote = false,
  intervalMs = 13000,
  fetchImpl = fetch,
} = {}) {
  requireCheck(
    typeof apiKey === "string" && /^meku_[A-Za-z0-9_-]{15,75}$/.test(apiKey),
    "credential-required",
  );
  requireCheck(["active", "expired", "revoked"].includes(phase), "invalid-phase");
  const { url, local } = endpointUrl(endpoint, allowRemote);
  requireCheck(
    !String(endpoint).toLowerCase().includes(apiKey.toLowerCase()) &&
      !url.href.toLowerCase().includes(apiKey.toLowerCase()),
    "unsafe-endpoint",
  );
  requireCheck(
    Number.isInteger(intervalMs) && intervalMs >= (local ? 0 : 13000) && intervalMs <= 60000,
    "unsafe-request-interval",
  );
  let requests = 0;
  let id = 0;
  const checks = [];
  async function send(path, method, payload) {
    if (requests > 0 && intervalMs) await new Promise((done) => setTimeout(done, intervalMs));
    requests++;
    let response;
    try {
      response = await fetchImpl(new URL(path, url), {
        method,
        redirect: "error",
        cache: "no-store",
        credentials: "omit",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": PROTOCOL,
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new VerificationFailure("network-or-redirect-failure");
    }
    requireCheck(
      !response.redirected && (response.status < 300 || response.status >= 400),
      "redirect-denied",
    );
    requireCheck(response.status !== 429, "rate-limited-stop-no-retry");
    return response;
  }
  async function rpc(method, params = {}, notification = false) {
    const requestId = ++id;
    const payload = { jsonrpc: "2.0", ...(notification ? {} : { id: requestId }), method, params };
    const response = await send(url.pathname, "POST", payload);
    if (notification) {
      requireCheck(
        response.status === 202 && response.headers.get("cache-control")?.includes("no-store"),
        "notification-failed",
      );
      if (response.body) {
        const reader = response.body.getReader();
        try {
          const first = await reader.read();
          if (!first.done) {
            await reader.cancel();
            throw new VerificationFailure("unexpected-notification-body");
          }
        } catch (error) {
          if (error instanceof VerificationFailure) throw error;
          throw new VerificationFailure("response-read-failed");
        } finally {
          reader.releaseLock();
        }
      }
      return null;
    }
    const body = await boundedJson(response);
    if (phase !== "active") {
      requireCheck(
        response.status === 401 && response.headers.get("www-authenticate")?.startsWith("Bearer"),
        "credential-not-denied",
      );
      requireCheck(
        exact(body, ["jsonrpc", "id", "error"]) &&
          body.jsonrpc === "2.0" &&
          body.id === null &&
          exact(body.error, ["code", "message"]) &&
          body.error.code === -32001,
        "unexpected-auth-error",
      );
      requireCheck(
        body.error.message ===
          (phase === "expired" ? "API key has expired." : "API key has been revoked."),
        "wrong-auth-denial-reason",
      );
      return null;
    }
    requireCheck(
      response.status === 200 &&
        exact(body, ["jsonrpc", "id", "result"]) &&
        body.jsonrpc === "2.0" &&
        body.id === requestId &&
        object(body.result),
      "invalid-rpc-result",
    );
    return body.result;
  }
  const initialize = await rpc("initialize", {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: "meku-search-only-verifier", version: "1.0.0" },
  });
  let counts;
  const requestRoutes = [
    ["/api/public/agent/requests", "GET", undefined, "list"],
    [`/api/public/agent/requests/${TEST_ID}`, "GET", undefined, "status"],
    ["/api/public/agent/requests", "POST", { title: "" }, "submission"],
  ];
  if (phase !== "active") {
    await rpc("tools/list");
    await rpc("tools/call", { name: "meku_search_humans", arguments: {} });
    checks.push(
      `${phase}-initialize-denied`,
      `${phase}-discovery-denied`,
      `${phase}-search-denied`,
    );
    for (const [path, method, payload, label] of requestRoutes) {
      const response = await send(path, method, payload);
      const body = await boundedJson(response);
      requireCheck(
        response.status === 401 &&
          exact(body, ["error"]) &&
          body.error ===
            (phase === "expired" ? "API key has expired." : "API key has been revoked."),
        "missing-rest-auth-denial",
      );
      checks.push(`${phase}-rest-${label}-denied`);
    }
  } else {
    requireCheck(
      initialize.protocolVersion === PROTOCOL &&
        initialize.serverInfo?.name === "meku-human-cloud" &&
        object(initialize.capabilities?.tools),
      "initialization-contract-mismatch",
    );
    checks.push("initialize");
    await rpc("notifications/initialized", {}, true);
    checks.push("initialized-notification");
    const inventory = await rpc("tools/list");
    requireCheck(
      exact(inventory, ["tools"]) &&
        Array.isArray(inventory.tools) &&
        inventory.tools.length === 1 &&
        inventory.tools[0]?.name === "meku_search_humans" &&
        inventory.tools[0]?.inputSchema?.type === "object",
      "credential-not-search-only-stop",
    );
    checks.push("one-search-tool-only");
    counts = aggregateCounts(
      await rpc("tools/call", { name: "meku_search_humans", arguments: {} }),
    );
    checks.push("aggregate-search-schema");
    for (const [name, args] of [
      // Intentionally invalid submission: a broken scope gate cannot create a valid request.
      ["meku_request_human", { title: "", action: "", description: "", skills: [] }],
      ["meku_get_request_status", { id: TEST_ID }],
      ["meku_operator", {}],
    ]) {
      requireCheck(
        toolText(await rpc("tools/call", { name, arguments: args }), true) === DENIED,
        "missing-tool-permission-denial",
      );
      checks.push(`${name}-denied`);
    }
    for (const [path, method, payload, label] of requestRoutes) {
      const response = await send(path, method, payload);
      const body = await boundedJson(response);
      requireCheck(
        response.status === 403 &&
          exact(body, ["error"]) &&
          body.error ===
            (method === "POST"
              ? "This API key does not permit request submissions."
              : "This API key does not permit request access."),
        "missing-rest-permission-denial",
      );
      checks.push(`rest-${label}-denied`);
    }
  }
  return {
    report_version: 1,
    phase,
    observed_at: new Date().toISOString(),
    endpoint: url.origin + url.pathname,
    environment: local ? "local-http" : "hosted-endpoint",
    requests,
    checks,
    ...(counts ? { aggregateCounts: counts } : {}),
    independent_adoption_verified: false,
    limits:
      "Contract observations only. External tester identity, lifecycle setup and server commit require separate evidence. No mission or payment tested.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    requireCheck(
      args.every((v) =>
        ["--phase=active", "--phase=expired", "--phase=revoked", "--allow-remote"].includes(v),
      ) && args.filter((v) => v.startsWith("--phase=")).length <= 1,
      "invalid-cli-arguments",
    );
    const report = await verifySearchOnly({
      endpoint: process.env.MEKU_MCP_URL,
      apiKey: process.env.MEKU_API_KEY,
      phase: args.find((v) => v.startsWith("--phase="))?.slice(8) || "active",
      allowRemote: args.includes("--allow-remote"),
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    // Never print raw exceptions: fetch, TLS and server errors can contain credentials.
    console.error(
      `MEKU verification failed: ${error instanceof VerificationFailure ? error.code : "unexpected-failure"}.`,
    );
    process.exitCode = 1;
  }
}
