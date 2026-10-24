#!/usr/bin/env node
/** Compatibility entry point; the complete search-only verifier is authoritative. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifySearchOnly } from "./mcp-search-only-verify.mjs";

export function runSmokeCheck(options = {}) {
  return verifySearchOnly({
    endpoint: process.env.MEKU_MCP_URL,
    apiKey: process.env.MEKU_API_KEY,
    ...options,
    phase: "active",
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).some((value) => value !== "--allow-remote")) throw new Error();
    console.log(
      JSON.stringify(
        await runSmokeCheck({
          allowRemote: process.argv.includes("--allow-remote"),
        }),
        null,
        2,
      ),
    );
  } catch {
    console.error(
      "MEKU search-only check failed. Use the verification guide; never share raw diagnostics or credentials.",
    );
    process.exitCode = 1;
  }
}
