/** Production MCP tool names. These stay available when the lab flag is off. */
export const PRODUCTION_TOOL_NAMES = [
  "meku_search_humans",
  "meku_request_human",
  "meku_get_request_status",
] as const;

/** Disabled unless MEKU_REALITY_TOOLS=lab. Never a payment or market tool. */
export const LAB_CAPABILITY_NAMES = [
  "meku.inspect",
  "meku.verify",
  "meku.collect",
  "meku.test",
  "meku.execute",
  "meku.report",
] as const;

export function realityLabToolsEnabled(env: Record<string, string | undefined> = process.env) {
  if (env.MEKU_PRODUCTION_PAYMENTS === "1") return false;
  return env.MEKU_REALITY_TOOLS === "lab";
}

export function toolsForAuthenticatedAgent(readOnly: boolean, env: Record<string, string | undefined> = process.env) {
  const tools = readOnly ? ["meku_search_humans"] : [...PRODUCTION_TOOL_NAMES];
  if (!readOnly && realityLabToolsEnabled(env)) tools.push(...LAB_CAPABILITY_NAMES);
  return tools;
}
