import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCTION_TOOL_NAMES, toolsForAuthenticatedAgent } from "./mcp-production-gate.ts";

test("production tool list stays the original three when the lab flag is off", () => {
  assert.deepEqual(toolsForAuthenticatedAgent(false, {}), [...PRODUCTION_TOOL_NAMES]);
  assert.deepEqual(toolsForAuthenticatedAgent(true, {}), ["meku_search_humans"]);
});

test("the lab flag adds capabilities but production payments force them off", () => {
  const lab = toolsForAuthenticatedAgent(false, { MEKU_REALITY_TOOLS: "lab" });
  assert.equal(lab.includes("meku.inspect"), true);
  assert.equal(lab.includes("meku.execute"), true);
  assert.equal(lab.includes("meku_market_settle"), false);
  assert.deepEqual(toolsForAuthenticatedAgent(false, { MEKU_REALITY_TOOLS: "lab", MEKU_PRODUCTION_PAYMENTS: "1" }), [
    ...PRODUCTION_TOOL_NAMES,
  ]);
  assert.deepEqual(toolsForAuthenticatedAgent(true, { MEKU_REALITY_TOOLS: "lab" }), [
    "meku_search_humans",
  ]);
});
