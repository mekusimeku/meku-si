import assert from "node:assert/strict";
import { test } from "node:test";
import { runSmokeCheck } from "./mcp-readonly-smoke.mjs";

function jsonResponse(id, result, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("requires an API key before making any request", async () => {
  let calls = 0;
  await assert.rejects(
    runSmokeCheck({ apiKey: "", fetchImpl: async () => { calls += 1; } }),
    /Set MEKU_API_KEY/,
  );
  assert.equal(calls, 0);
});

test("initializes, discovers, and calls search only, with bearer auth on every POST", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const payload = JSON.parse(options.body);
    requests.push({ url: String(url), headers: options.headers, payload });

    if (payload.method === "notifications/initialized") {
      return new Response("", { status: 202 });
    }
    if (payload.method === "initialize") {
      return jsonResponse(payload.id, {
        protocolVersion: "2025-06-18",
        capabilities: {},
        serverInfo: { name: "mock", version: "0.0.0" },
      });
    }
    if (payload.method === "tools/list") {
      return jsonResponse(payload.id, { tools: [
        { name: "meku_search_humans" },
        { name: "meku_request_human" },
        { name: "meku_get_request_status" },
      ] });
    }
    if (payload.method === "tools/call") {
      assert.equal(payload.params.name, "meku_search_humans");
      return jsonResponse(payload.id, {
        content: [{ type: "text", text: JSON.stringify({
          listed_humans: 8,
          online_humans: 3,
          matching_humans: 2,
          private_name: "DO NOT PRINT THIS MOCK VALUE",
        }) }],
        isError: false,
      });
    }
    throw new Error(`Unexpected request method: ${payload.method}`);
  };

  const report = await runSmokeCheck({
    endpoint: "https://mcp.example.test/api/public/mcp",
    apiKey: "local-test-key",
    fetchImpl,
  });

  assert.deepEqual(requests.map(({ payload }) => payload.method), [
    "initialize",
    "notifications/initialized",
    "tools/list",
    "tools/call",
  ]);
  assert.ok(requests.every(({ headers, payload }) => {
    assert.equal(headers.Authorization, "Bearer local-test-key");
    assert.equal(headers["Content-Type"], "application/json");
    return payload.jsonrpc === "2.0";
  }));
  assert.equal(report.readOnlyToolCalled, "meku_search_humans");
  assert.deepEqual(report.resultSummary.aggregateCounts, {
    listed_humans: 8,
    online_humans: 3,
    matching_humans: 2,
  });
  assert.equal(JSON.stringify(report).includes("DO NOT PRINT THIS MOCK VALUE"), false);
  assert.equal(JSON.stringify(report).includes("local-test-key"), false);
});

test("rejects endpoint credentials and query parameters", async () => {
  await assert.rejects(
    runSmokeCheck({ endpoint: "https://user:pass@example.test/mcp", apiKey: "local-test-key" }),
    /Do not put credentials/,
  );
  await assert.rejects(
    runSmokeCheck({ endpoint: "https://example.test/mcp?token=secret", apiKey: "local-test-key" }),
    /Do not put credentials/,
  );
});

test("does not retry HTTP 429", async () => {
  let calls = 0;
  await assert.rejects(runSmokeCheck({
    endpoint: "https://mcp.example.test/api/public/mcp",
    apiKey: "local-test-key",
    fetchImpl: async () => {
      calls += 1;
      return new Response("{}", { status: 429 });
    },
  }), /Automatic retries are disabled/);
  assert.equal(calls, 1);
});
