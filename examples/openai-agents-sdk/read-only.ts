// Reference example only. Not tested against a MEKU-issued key.
// Keep both API keys in a private runtime environment. Never commit them.
import { Agent, MCPServerStreamableHttp, createMCPToolStaticFilter, run } from "@openai/agents";

const mekuApiKey = process.env.MEKU_API_KEY;
const endpoint = process.env.MEKU_MCP_URL;
if (!endpoint) throw new Error("Set MEKU_MCP_URL to the approved endpoint");
if (!mekuApiKey) {
  throw new Error("Set MEKU_API_KEY in the private runtime environment");
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error("Set OPENAI_API_KEY in the private runtime environment");
}

// The client connects directly from this runtime to MEKU. The static allowlist
// exposes only the read-only search tool to the agent.
const meku = new MCPServerStreamableHttp({
  name: "MEKU Human Cloud",
  url: endpoint,
  requestInit: {
    headers: { Authorization: `Bearer ${mekuApiKey}` },
  },
  toolFilter: createMCPToolStaticFilter({
    allowed: ["meku_search_humans"],
  }),
  timeout: 15_000,
});

const agent = new Agent({
  name: "MEKU read-only demo",
  instructions:
    "Use only meku_search_humans to check for photography skills. Return an aggregate summary only. Do not include names, member IDs, contact details, precise locations, or raw profiles. Never submit work.",
  mcpServers: [meku],
});

async function main() {
  try {
    await meku.connect();
    const result = await run(
      agent,
      "Search MEKU for humans with photography skills. Return only an aggregate summary.",
      { maxTurns: 3 },
    );
    // Avoid printing arbitrary model/tool output into evidence logs.
    void result;
    console.log("Optional SDK model run finished; no raw response logged.");
  } finally {
    await meku.close();
  }
}

main().catch(() => {
  // Avoid printing raw responses or request details that could contain personal
  // information or credentials. Inspect the local client logs privately.
  console.error(
    "MEKU read-only MCP test failed. Check the client version, endpoint, and key privately; do not share credentials or raw profiles.",
  );
  process.exitCode = 1;
});
