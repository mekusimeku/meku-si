import assert from "node:assert/strict";
import test from "node:test";
import { OFFICIAL_MINT, PLANS } from "./constants.ts";
import { validateQuote, quoteForCents } from "./engine.ts";
import { runAcceptance, runNegative } from "./scenario.ts";

test("locked prices", () => {
  assert.equal(PLANS.AGENT.priceCents, 2900);
  assert.equal(PLANS.OPERATOR.priceCents, 9900);
  assert.equal(PLANS.NETWORK.priceCents, 29900);
  assert.equal(PLANS.INTELLIGENCE.priceCents, 99999);
  assert.equal(PLANS.INTELLIGENCE.activeMissions, null);
});

test("quote rejects the wrong mint and excessive impact", () => {
  const quote = quoteForCents(9900, 10, "quote_ok");
  assert.equal(validateQuote(quote, 10).code, "QUOTE_OK");
  assert.equal(validateQuote({ ...quote, outputMint: "wrong" }, 10).code, "WRONG_MINT");
  assert.equal(OFFICIAL_MINT.length, 44);
});

test("acceptance scenario", async () => {
  const { checks } = await runAcceptance();
  const failed = checks.filter((check) => !check.pass);
  assert.deepEqual(
    failed.map((check) => `${check.name}: ${check.detail}`),
    [],
  );
});

test("negative scenario", async () => {
  const { checks } = await runNegative();
  const failed = checks.filter((check) => !check.pass);
  assert.deepEqual(
    failed.map((check) => `${check.name}: ${check.detail}`),
    [],
  );
});
