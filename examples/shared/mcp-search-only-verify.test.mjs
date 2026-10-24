import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { verifySearchOnly } from "./mcp-search-only-verify.mjs";

const key = "meku_" + "a".repeat(48);
const endpoint = "http://127.0.0.1:55442/api/public/mcp";
const note =
  "Aggregate availability only. Individual humans are never identified, and every human consents before any mission.";
const aggregate = () => ({
  listed_humans: 2,
  online_humans: 1,
  matching_humans: 1,
  countries: ["Indonesia"],
  matched_skills: [],
  note,
});
const text = (value, error = false) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
  ...(error ? { isError: true } : {}),
});
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

function fixture(edit = (body) => body) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      const payload = options.body === undefined ? undefined : JSON.parse(options.body);
      const path = new URL(url).pathname;
      calls.push({ path, options, payload });
      if (payload?.method === "notifications/initialized")
        return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
      if (path.startsWith("/api/public/agent/"))
        return json(
          edit(
            {
              error:
                options.method === "POST"
                  ? "This API key does not permit request submissions."
                  : "This API key does not permit request access.",
            },
            payload,
            path,
          ),
          403,
        );
      let result;
      if (payload.method === "initialize")
        result = {
          protocolVersion: "2025-06-18",
          serverInfo: { name: "meku-human-cloud", version: "1.0.0" },
          capabilities: { tools: {} },
        };
      else if (payload.method === "tools/list")
        result = { tools: [{ name: "meku_search_humans", inputSchema: { type: "object" } }] };
      else
        result =
          payload.params.name === "meku_search_humans"
            ? text(aggregate())
            : text("This API key permits aggregate human search only.", true);
      return json(edit({ jsonrpc: "2.0", id: payload.id, result }, payload, path));
    },
  };
}
const run = (f, extra = {}) =>
  verifySearchOnly({ endpoint, apiKey: key, intervalMs: 0, fetchImpl: f.fetchImpl, ...extra });

test("checks initialization, one-tool discovery, aggregate search, direct and REST denials without returning private values", async () => {
  const f = fixture();
  const report = await run(f);
  assert.equal(report.requests, 10);
  assert.equal(report.checks.length, 10);
  assert.deepEqual(report.aggregateCounts, {
    listed_humans: 2,
    online_humans: 1,
    matching_humans: 1,
  });
  assert.equal(report.independent_adoption_verified, false);
  assert.ok(!JSON.stringify(report).includes(key));
  assert.ok(!JSON.stringify(report).includes("Indonesia"));
  for (const { options } of f.calls) {
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
  }
  const submission = f.calls.find(({ payload }) => payload?.params?.name === "meku_request_human");
  assert.equal(submission.payload.params.arguments.title, "");
});

for (const phase of ["expired", "revoked"])
  test(`${phase} requires the correct server reason on MCP and all REST routes`, async () => {
    const methods = [];
    const routes = [];
    const report = await run(
      {
        fetchImpl: async (url, options) => {
          if (new URL(url).pathname.startsWith("/api/public/agent/")) {
            routes.push(options.method);
            return json(
              { error: phase === "expired" ? "API key has expired." : "API key has been revoked." },
              401,
            );
          }
          const body = JSON.parse(options.body);
          methods.push(body.method);
          return json(
            {
              jsonrpc: "2.0",
              id: null,
              error: {
                code: -32001,
                message: phase === "expired" ? "API key has expired." : "API key has been revoked.",
              },
            },
            401,
            { "www-authenticate": 'Bearer realm="meku-mcp"' },
          );
        },
      },
      { phase },
    );
    assert.deepEqual(methods, ["initialize", "tools/list", "tools/call"]);
    assert.deepEqual(routes, ["GET", "GET", "POST"]);
    assert.equal(report.requests, 6);
    assert.equal(report.checks.length, 6);
  });

for (const phase of ["expired", "revoked"])
  for (const [label, response] of [
    ["success", () => json({ requests: [] })],
    [
      "scope-only denial",
      () => json({ error: "This API key does not permit request access." }, 403),
    ],
    ["invalid-key denial", () => json({ error: "Invalid API key." }, 401)],
  ])
    test(`${phase} cannot pass with a REST ${label}`, async () => {
      await assert.rejects(
        run(
          {
            fetchImpl: async (url) =>
              new URL(url).pathname.startsWith("/api/public/agent/")
                ? response()
                : json(
                    {
                      jsonrpc: "2.0",
                      id: null,
                      error: {
                        code: -32001,
                        message:
                          phase === "expired"
                            ? "API key has expired."
                            : "API key has been revoked.",
                      },
                    },
                    401,
                    { "www-authenticate": "Bearer" },
                  ),
          },
          { phase },
        ),
        /missing-rest-auth-denial/,
      );
    });

test("a random invalid key is not expiry evidence", async () => {
  await assert.rejects(
    run(
      {
        fetchImpl: async () =>
          json(
            { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid API key." } },
            401,
            { "www-authenticate": "Bearer" },
          ),
      },
      { phase: "expired" },
    ),
    /wrong-auth-denial-reason/,
  );
});

test("stops before any tool calls if an overprivileged key or extra tool is discovered", async () => {
  const f = fixture((body, request) => {
    if (request?.method === "tools/list") body.result.tools.push({ name: "meku_request_human" });
    return body;
  });
  await assert.rejects(run(f), /credential-not-search-only-stop/);
  assert.equal(f.calls.filter(({ payload }) => payload?.method === "tools/call").length, 0);
});

for (const field of ["email", "region", "human_id", "profiles", "contact", "wallet", "api_key"])
  test(`rejects private or unexpected search field: ${field}`, async () => {
    const f = fixture((body, request) => {
      if (request?.params?.name === "meku_search_humans")
        body.result = text({ ...aggregate(), [field]: "private synthetic value" });
      return body;
    });
    await assert.rejects(run(f), /private-or-unexpected-search-fields/);
    assert.equal(f.calls.length, 4);
  });

for (const patch of [
  { matching_humans: 3 },
  { listed_humans: -1 },
  { online_humans: 501 },
  { countries: ["person@example.test"] },
  { countries: ["meku_private"] },
  { countries: ["Indonesia", "Indonesia"] },
  { matched_skills: ["private name"] },
  { note: "private name" },
])
  test(`rejects malformed aggregate values: ${Object.keys(patch)[0]} ${JSON.stringify(patch)}`, async () => {
    const f = fixture((body, request) => {
      if (request?.params?.name === "meku_search_humans")
        body.result = text({ ...aggregate(), ...patch });
      return body;
    });
    await assert.rejects(run(f));
  });

test("a validation error is not proof of authorization denial", async () => {
  const f = fixture((body, request) => {
    if (request?.params?.name === "meku_request_human")
      body.result = text("Title must be at least 4 characters", true);
    return body;
  });
  await assert.rejects(run(f), /missing-tool-permission-denial/);
});

test("a generic REST 403 does not prove the scope restriction", async () => {
  const f = fixture((body, _request, path) =>
    path.includes("/agent/") ? { error: "unrelated forbidden" } : body,
  );
  await assert.rejects(run(f), /missing-rest-permission-denial/);
});

test("rejects a mismatched JSON-RPC ID", async () => {
  const f = fixture((body) => ({ ...body, id: 999 }));
  await assert.rejects(run(f), /invalid-rpc-result/);
});

test("rejects a different protocol", async () => {
  const f = fixture((body, request) => {
    if (request?.method === "initialize") body.result.protocolVersion = "unknown";
    return body;
  });
  await assert.rejects(run(f), /initialization-contract-mismatch/);
});

for (const badEndpoint of [
  undefined,
  "https://user:secret@example.test/api/public/mcp",
  "https://example.test/api/public/mcp?key=secret",
  "https://example.test/api/public/mcp#secret",
  "http://example.test/api/public/mcp",
  "https://example.test/other",
])
  test(`rejects missing or unsafe endpoint before network: ${String(badEndpoint)}`, async () => {
    const f = fixture();
    await assert.rejects(run(f, { endpoint: badEndpoint, allowRemote: true }));
    assert.equal(f.calls.length, 0);
  });

test("requires explicit remote approval and a safe interval", async () => {
  const f = fixture();
  await assert.rejects(
    run(f, { endpoint: "https://example.test/api/public/mcp" }),
    /remote-approval-required/,
  );
  await assert.rejects(
    run(f, { endpoint: "https://example.test/api/public/mcp", allowRemote: true }),
    /unsafe-request-interval/,
  );
  assert.equal(f.calls.length, 0);
});

for (const productionEndpoint of [
  "https://meku.farm/api/public/mcp",
  "https://www.meku.farm/api/public/mcp",
  "https://MEKU.FARM:443/api/public/mcp",
  "https://meku.farm./api/public/mcp",
  "https://%6deku.farm/api/public/mcp",
])
  test(`rejects the known production endpoint even with remote approval: ${productionEndpoint}`, async () => {
    let calls = 0;
    await assert.rejects(
      run(
        {
          fetchImpl: async () => {
            calls++;
            throw new Error("No request permitted");
          },
        },
        { endpoint: productionEndpoint, allowRemote: true, intervalMs: 13000 },
      ),
      /production-endpoint-denied/,
    );
    assert.equal(calls, 0);
  });

test("rejects a percent-encoded credential in the normalized URL before sending it", async () => {
  let calls = 0;
  const hostname = [...key].map((letter) => "%" + letter.charCodeAt(0).toString(16)).join("");
  await assert.rejects(
    verifySearchOnly({
      endpoint: `https://${hostname}/api/public/mcp`,
      apiKey: key,
      allowRemote: true,
      fetchImpl: async () => {
        calls++;
        throw new Error("No request permitted");
      },
    }),
    /unsafe-endpoint/,
  );
  assert.equal(calls, 0);
});

test("never exposes a raw network exception", async () => {
  await assert.rejects(
    run({
      fetchImpl: async () => {
        throw new Error(key);
      },
    }),
    (error) => error.message === "network-or-redirect-failure",
  );
});

test("stops on rate limiting without retries", async () => {
  let calls = 0;
  await assert.rejects(
    run({
      fetchImpl: async () => {
        calls++;
        return json({ secret: key }, 429);
      },
    }),
    /rate-limited-stop-no-retry/,
  );
  assert.equal(calls, 1);
});

test("rejects redirects, including a redirected error response", async () => {
  const response = json({ secret: key }, 401);
  Object.defineProperty(response, "redirected", { value: true });
  await assert.rejects(run({ fetchImpl: async () => response }), /redirect-denied/);
});

test("rejects missing cache protection", async () => {
  await assert.rejects(
    run({ fetchImpl: async () => json({}, 200, { "cache-control": "public" }) }),
    /cache-protection-missing/,
  );
});

test("bounds streamed response bodies and cancels excessive data", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(65537));
      },
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
  await assert.rejects(run({ fetchImpl: async () => response }), /response-too-large/);
  assert.equal(cancelled, true);
});

test("bounds responses before reading an excessive Content-Length", async () => {
  await assert.rejects(
    run({ fetchImpl: async () => json({}, 200, { "content-length": "1000000" }) }),
    /response-too-large/,
  );
});

test("does not print keys supplied in a malformed URL or CLI argument", () => {
  const result = spawnSync(
    process.execPath,
    [new URL("./mcp-search-only-verify.mjs", import.meta.url).pathname, `--unknown=${key}`],
    {
      env: { ...process.env, MEKU_API_KEY: key, MEKU_MCP_URL: "https://" + key },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.ok(!result.stdout.includes(key));
  assert.ok(!result.stderr.includes(key));
  assert.match(result.stderr, /invalid-cli-arguments/);
});
