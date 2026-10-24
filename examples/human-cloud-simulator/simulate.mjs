export const SCENARIOS = Object.freeze({
  storefront_hours: Object.freeze({
    title: "Read public storefront hours",
    task: "Transcribe the hours on a public-facing storefront sign.",
    skills: ["local observation", "transcription"],
    boundaries: [
      "Stay in a public area; do not enter the property.",
      "Do not photograph people, vehicle plates, or private information.",
      "The person may decline without giving a reason.",
    ],
  }),
  public_entrance: Object.freeze({
    title: "Describe a public venue entrance",
    task: "Report visible entrance features from an area open to the public.",
    skills: ["local observation", "accessibility description"],
    boundaries: [
      "Report visible facts only; do not make a legal accessibility judgment.",
      "Do not enter restricted areas or approach visitors.",
      "Do not photograph people or private information.",
    ],
  }),
  shelf_count: Object.freeze({
    title: "Count a shelf item with store permission",
    task: "Count one named item on one shelf at a store that has agreed to the visit.",
    skills: ["counting", "local observation"],
    boundaries: [
      "Only visit with clear store permission.",
      "Do not move stock, buy anything, or photograph customers or staff.",
      "The person may decline without giving a reason.",
    ],
  }),
});

const TOOL_NAMES = Object.freeze([
  "meku_search_humans",
  "meku_request_human",
  "meku_get_request_status",
]);
const MOCK_WORKERS = Object.freeze(["SIMULATED-HUMAN-001", "SIMULATED-HUMAN-002"]);

/**
 * Run a deterministic local illustration of an agent-to-human handoff.
 * This function makes no network requests and never calls MEKU.
 * Every person, result, decision, proof item, and payment result is synthetic.
 */
export function runSimulation({
  scenario = "storefront_hours",
  requesterApproves = true,
  operatorApproves = true,
  humanSelection = 0,
  humanAccepts = true,
  workCompletes = true,
  proofAccepted = true,
} = {}) {
  const brief = SCENARIOS[scenario];
  if (!brief) {
    throw new Error(`Unknown scenario: ${scenario}. Choose: ${Object.keys(SCENARIOS).join(", ")}`);
  }
  if (!Number.isInteger(humanSelection) || !MOCK_WORKERS[humanSelection]) {
    throw new Error(`humanSelection must be 0 or 1.`);
  }

  const events = [];
  const simulatedToolTrace = [];
  const addEvent = (step, details = {}) => {
    events.push({ sequence: events.length + 1, step, ...details });
  };

  addEvent("agent_identifies_human_only_task", { task: brief.task });
  simulatedToolTrace.push({
    tool: TOOL_NAMES[0],
    called: false,
    simulated: true,
    result: { matching_humans: 2, note: "MOCK VALUE — not a live MEKU result" },
  });
  addEvent("mock_capability_search", {
    tool: TOOL_NAMES[0],
    result: "MOCK VALUE — no people were searched or contacted",
    candidates: MOCK_WORKERS,
  });

  addEvent("mission_prepared_in_simulation", {
    title: brief.title,
    task: brief.task,
    skills: brief.skills,
    boundaries: brief.boundaries,
    note: "A local draft only; no mission or request exists on MEKU.",
  });

  if (!requesterApproves) {
    addEvent("requester_declines_submission");
    return makeReport("stopped_by_requester", brief, events, simulatedToolTrace);
  }

  addEvent("requester_approves_simulated_request", {
    note: "This is a simulator choice, not recorded user consent on MEKU.",
  });
  simulatedToolTrace.push({
    tool: TOOL_NAMES[1],
    called: false,
    simulated: true,
    result: { id: "SIMULATED-REQUEST-ID", status: "submitted" },
  });
  addEvent("mock_request_submitted_for_operator_review", {
    tool: TOOL_NAMES[1],
    requestId: "SIMULATED-REQUEST-ID",
  });

  if (!operatorApproves) {
    addEvent("operator_rejects_mock_request");
    simulatedToolTrace.push({
      tool: TOOL_NAMES[2],
      called: false,
      simulated: true,
      result: { status: "rejected" },
    });
    return makeReport("rejected_by_operator", brief, events, simulatedToolTrace);
  }

  addEvent("operator_approves_mock_request");
  const selectedHuman = MOCK_WORKERS[humanSelection];
  addEvent("agent_selects_synthetic_human", {
    workerId: selectedHuman,
    note: "Synthetic choice only; MEKU search does not return worker identities.",
  });

  if (!humanAccepts) {
    addEvent("selected_human_declines_work", {
      workerId: selectedHuman,
      note: "No real person was contacted. A real person's choice is required.",
    });
    simulatedToolTrace.push({
      tool: TOOL_NAMES[2],
      called: false,
      simulated: true,
      result: { status: "approved" },
    });
    addEvent("mock_status_checked", { tool: TOOL_NAMES[2] });
    return makeReport("declined_by_human", brief, events, simulatedToolTrace);
  }

  addEvent("selected_human_accepts_mock_work", {
    workerId: selectedHuman,
    note: "No real person was contacted; this is a mock decision.",
  });
  simulatedToolTrace.push({
    tool: TOOL_NAMES[2],
    called: false,
    simulated: true,
    result: { status: "approved" },
  });
  addEvent("mock_status_checked", { tool: TOOL_NAMES[2] });

  if (!workCompletes) {
    addEvent("mock_work_stops_before_completion");
    return makeReport("accepted_in_simulation", brief, events, simulatedToolTrace);
  }

  addEvent("mock_work_completed", { workerId: selectedHuman });
  addEvent("proof_submitted_in_simulation", {
    proofId: "SIMULATED-PROOF-001",
    evidence: "MOCK TEXT — no photo, visit, or real deliverable exists",
  });

  if (!proofAccepted) {
    addEvent("proof_rejected_in_simulation", {
      note: "No payment result is created when the mock proof is rejected.",
    });
    return makeReport("proof_rejected_in_simulation", brief, events, simulatedToolTrace);
  }

  addEvent("proof_accepted_in_simulation", {
    note: "This is a mock review result, not MEKU verification.",
  });
  addEvent("simulated_payment_result", {
    status: "SIMULATED_SUCCESS_NOT_PAID",
    asset: "MEKU SI",
    amount: null,
    transactionSignature: null,
    actualTransfer: false,
    note: "Illustrative result only. The MCP tools do not create or verify payment.",
  });
  return makeReport("completed_in_simulation", brief, events, simulatedToolTrace);
}

function makeReport(status, brief, events, simulatedToolTrace) {
  const paymentEvent = events.find((event) => event.step === "simulated_payment_result");
  return {
    mode: "SIMULATION ONLY",
    scenario: brief.title,
    task: brief.task,
    boundaries: brief.boundaries,
    status,
    paymentStatus: paymentEvent?.status ?? "not_created",
    paymentNote: paymentEvent?.note ?? "No simulated payment result was created.",
    simulatedToolTrace,
    events,
    noNetwork: true,
    noRealRequest: true,
    noRealHuman: true,
    noProof: true,
    noPayment: true,
    availableMcpTools: TOOL_NAMES,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const scenario = process.argv[2] ?? "storefront_hours";
  try {
    process.stdout.write(`${JSON.stringify(runSimulation({ scenario }), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
