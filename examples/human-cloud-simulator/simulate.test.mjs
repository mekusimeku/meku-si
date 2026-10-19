import assert from "node:assert/strict";
import { test } from "node:test";
import { runSimulation, SCENARIOS } from "./simulate.mjs";

test("simulates the full handoff without claiming live work", () => {
  const report = runSimulation({ scenario: "storefront_hours" });

  assert.equal(report.mode, "SIMULATION ONLY");
  assert.equal(report.status, "completed_in_simulation");
  assert.equal(report.noNetwork, true);
  assert.equal(report.noRealRequest, true);
  assert.equal(report.paymentStatus, "not_simulated");
  assert.deepEqual(report.simulatedToolTrace.map((item) => item.tool), [
    "meku_search_humans",
    "meku_request_human",
    "meku_get_request_status",
  ]);
  assert.ok(report.simulatedToolTrace.every((item) => item.called === false && item.simulated));
  assert.ok(report.events.some((event) => event.step === "operator_approves_mock_request"));
  assert.ok(report.events.some((event) => event.step === "human_accepts_mock_work"));
});

test("stops before request submission when the requester declines", () => {
  const report = runSimulation({ requesterApproves: false });

  assert.equal(report.status, "stopped_by_requester");
  assert.equal(report.simulatedToolTrace.some((item) => item.tool === "meku_request_human"), false);
});

test("keeps operator rejection and human refusal as separate outcomes", () => {
  const operatorRejected = runSimulation({ operatorApproves: false });
  const humanDeclined = runSimulation({ humanAccepts: false });

  assert.equal(operatorRejected.status, "rejected_by_operator");
  assert.equal(humanDeclined.status, "declined_by_human");
  assert.notEqual(operatorRejected.status, humanDeclined.status);
});

test("offers three bounded public or permission-based scenarios", () => {
  assert.deepEqual(Object.keys(SCENARIOS), ["storefront_hours", "public_entrance", "shelf_count"]);
  assert.ok(SCENARIOS.shelf_count.boundaries.some((item) => item.includes("permission")));
});

test("rejects an unknown scenario", () => {
  assert.throws(() => runSimulation({ scenario: "unknown" }), /Unknown scenario/);
});
