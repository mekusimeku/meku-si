// Reference example only. Not tested against a MEKU-issued key.
// Keep MEKU_API_KEY in the private runtime environment.
import { Agent, hostedMcpTool, run } from "@openai/agents";

if (!process.env.MEKU_API_KEY) {
  throw new Error("Set MEKU_API_KEY in the private environment");
}

const meku = hostedMcpTool({
  serverLabel: "meku-human-cloud",
  serverUrl: "https://meku.farm/api/public/mcp",
  headers: { Authorization: "Bearer " + process.env.MEKU_API_KEY },
  requireApproval: "always",
});

const agent = new Agent({
  name: "MEKU read-only demo",
  instructions:
    "Use only meku_search_humans. Never submit work or claim a person accepted.",
  tools: [meku],
});

const result = await run(agent, "Search MEKU for photography skills.");
console.log(result.finalOutput);
