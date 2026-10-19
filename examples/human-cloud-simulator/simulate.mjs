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

/**
 * Run a deterministic local illustration of the Human Cloud handoff.
 * This function makes no network requests and never calls MEKU.
 */
export function runSimulation({
  scenario = "storefront_hours",
  requesterApproves = true,
  operatorApproves = true,
  humanAccepts = true,
  workCompletes = true,
} = {}) {
  const brief = SCENARIOS[scenario];
  if (!brief) {
    throw new Error(`Unknown scenario: ${scenario}. Choose: ${Object.keys(SCENARIOS).join(", ")}`);
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
  if (!humanAccepts) {
    addEvent("human_declines_work", {
      note: "A real person's choice is required; silence is not acceptance.",
    });
    simulatedToolTrace.push({
      tool: TOOL_NAMES[2],
      called: false,
      simulated: true,
      result: { status: "approved" },
    });
    return makeReport("declined_by_human", brief, events, simulatedToolTrace);
  }

  addEvent("human_accepts_mock_work", {
    note: "No real person was contacted; this is a mock decision.",
  });
  simulatedToolTrace.push({
    tool: TOOL_NAMES[2],
    called: false,
    simulated: true,
    result: { status: "approved" },
  });
  addEvent("mock_status_checked", { tool: TOOL_NAMES[2] });

  if (workCompletes) {
    addEvent("mock_work_completed", { evidence: "SIMULATED — no deliverable exists" });
    return makeReport("completed_in_simulation", brief, events, simulatedToolTrace);
  }

  addEvent("mock_work_stops_before_completion");
  return makeReport("accepted_in_simulation", brief, events, simulatedToolTrace);
}

function makeReport(status, brief, events, simulatedToolTrace) {
  return {
    mode: "SIMULATION ONLY",
    scenario: brief.title,
    task: brief.task,
    boundaries: brief.boundaries,
    status,
    paymentStatus: "not_simulated",
    paymentNote: "The MCP tools do not pay a person. This local example does not simulate payment.",
    simulatedToolTrace,
    events,
    noNetwork: true,
    noRealRequest: true,
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
