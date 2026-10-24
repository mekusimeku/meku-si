import assert from "node:assert/strict";
import { test } from "node:test";
import { runSimulation, SCENARIOS } from "./simulate.mjs";

test("shows the full simulated agent-to-human-to-proof-to-payment result", () => {
  const report = runSimulation({ scenario: "storefront_hours", humanSelection: 1 });

  assert.equal(report.mode, "SIMULATION ONLY");
  assert.equal(report.status, "completed_in_simulation");
  assert.equal(report.paymentStatus, "SIMULATED_SUCCESS_NOT_PAID");
  assert.equal(report.noNetwork, true);
  assert.equal(report.noRealRequest, true);
  assert.equal(report.noRealHuman, true);
  assert.equal(report.noProof, true);
  assert.equal(report.noPayment, true);
  assert.deepEqual(report.simulatedToolTrace.map((item) => item.tool), [
    "meku_search_humans",
    "meku_request_human",
    "meku_get_request_status",
  ]);
  assert.ok(report.simulatedToolTrace.every((item) => item.called === false && item.simulated));
  assert.deepEqual(
    report.events.map((event) => event.step),
    [
      "agent_identifies_human_only_task",
      "mock_capability_search",
      "mission_prepared_in_simulation",
      "requester_approves_simulated_request",
      "mock_request_submitted_for_operator_review",
      "operator_approves_mock_request",
      "agent_selects_synthetic_human",
      "selected_human_accepts_mock_work",
      "mock_status_checked",
      "mock_work_completed",
      "proof_submitted_in_simulation",
      "proof_accepted_in_simulation",
      "simulated_payment_result",
    ],
  );
  const payment = report.events.at(-1);
  assert.equal(payment.workerId, undefined);
  assert.equal(payment.status, "SIMULATED_SUCCESS_NOT_PAID");
  assert.equal(payment.transactionSignature, null);
  assert.equal(payment.actualTransfer, false);
  assert.equal(report.events.find((event) => event.step === "agent_selects_synthetic_human").workerId, "SIMULATED-HUMAN-002");
});

test("stops before request submission when the requester declines", () => {
  const report = runSimulation({ requesterApproves: false });

  assert.equal(report.status, "stopped_by_requester");
  assert.equal(report.simulatedToolTrace.some((item) => item.tool === "meku_request_human"), false);
  assert.equal(report.paymentStatus, "not_created");
});

test("keeps operator rejection and human refusal as separate outcomes", () => {
  const operatorRejected = runSimulation({ operatorApproves: false });
  const humanDeclined = runSimulation({ humanAccepts: false });

  assert.equal(operatorRejected.status, "rejected_by_operator");
  assert.equal(humanDeclined.status, "declined_by_human");
  assert.notEqual(operatorRejected.status, humanDeclined.status);
  assert.equal(operatorRejected.paymentStatus, "not_created");
  assert.equal(humanDeclined.paymentStatus, "not_created");
});

test("does not create a payment result before work completion", () => {
  const report = runSimulation({ workCompletes: false });

  assert.equal(report.status, "accepted_in_simulation");
  assert.equal(report.paymentStatus, "not_created");
  assert.equal(report.events.some((event) => event.step === "proof_submitted_in_simulation"), false);
});

test("rejected proof cannot produce even a simulated payment success", () => {
  const report = runSimulation({ proofAccepted: false });

  assert.equal(report.status, "proof_rejected_in_simulation");
  assert.equal(report.paymentStatus, "not_created");
  assert.equal(report.events.some((event) => event.step === "proof_submitted_in_simulation"), true);
  assert.equal(report.events.some((event) => event.step === "simulated_payment_result"), false);
});

test("selects only synthetic humans and rejects invalid selections", () => {
  const report = runSimulation({ humanSelection: 0 });
  assert.equal(report.events.find((event) => event.step === "agent_selects_synthetic_human").workerId, "SIMULATED-HUMAN-001");
  assert.throws(() => runSimulation({ humanSelection: 2 }), /humanSelection must be 0 or 1/);
  assert.throws(() => runSimulation({ humanSelection: "human-1" }), /humanSelection must be 0 or 1/);
});

test("offers three bounded public or permission-based scenarios", () => {
  assert.deepEqual(Object.keys(SCENARIOS), ["storefront_hours", "public_entrance", "shelf_count"]);
  assert.ok(SCENARIOS.shelf_count.boundaries.some((item) => item.includes("permission")));
});

test("rejects an unknown scenario", () => {
  assert.throws(() => runSimulation({ scenario: "unknown" }), /Unknown scenario/);
});
