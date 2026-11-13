import assert from "node:assert/strict";
import { test } from "node:test";
import { runSmokeCheck } from "./mcp-readonly-smoke.mjs";

test("compatibility entry point requires a credential and explicit endpoint before fetching", async () => {
  let calls = 0;
  await assert.rejects(
    runSmokeCheck({
      apiKey: "",
      fetchImpl: async () => {
        calls++;
      },
    }),
    /credential-required/,
  );
  assert.equal(calls, 0);
});
test("compatibility entry point cannot be switched to a denial-only phase to bypass active verification", async () => {
  let calls = 0;
  await assert.rejects(
    runSmokeCheck({
      endpoint: "http://127.0.0.1/api/public/mcp",
      apiKey: "meku_" + "b".repeat(48),
      phase: "revoked",
      intervalMs: 0,
      fetchImpl: async (_url, init) => {
        calls++;
        const request = JSON.parse(init.body);
        assert.equal(request.method, "initialize");
        return Response.json(
          {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32001, message: "API key has been revoked." },
          },
          {
            status: 401,
            headers: {
              "cache-control": "no-store",
              "www-authenticate": "Bearer",
            },
          },
        );
      },
    }),
    /invalid-rpc-result/,
  );
  assert.equal(calls, 1);
});
