import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { OFFICIAL_MINT } from "./constants.ts";
import { LabSession, mcpRequest, readTool } from "./lab-session.ts";
import { openLabStore } from "./lab-store.ts";
import { authorizeProductionAccount, verifyProductionReceipt, type ChainReader } from "./receipt-verify.ts";
import type { Receipt } from "./engine.ts";

const receipt = (signature: string, mint = OFFICIAL_MINT): Receipt => ({
  signature,
  invoiceId: "inv_test",
  mint,
  cluster: "mainnet-beta",
  amountBaseUnits: "100",
  destination: "settle_inv_test",
  finality: "finalized",
  slot: 9,
});

test("simulated receipts are not production proof", async () => {
  const reader: ChainReader = { async read() { throw new Error("reader must not be called"); } };
  const verdict = await verifyProductionReceipt(
    receipt("sim_not_a_chain_signature"),
    { mint: OFFICIAL_MINT, amountBaseUnits: "100", destination: "settle_inv_test" },
    reader,
  );
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, "SIMULATED_NOT_PRODUCTION");
  assert.equal(verdict.productionProof, false);
});

test("a finalized fixture for the official mint verifies without a broadcast", async () => {
  const observed = {
    signature: "5knownChainSignatureFixture111111111111111111111111111111111111111111111111111111",
    mint: OFFICIAL_MINT,
    destination: "settle_inv_test",
    amountBaseUnits: "100",
    finalized: true,
    cluster: "mainnet-beta",
  };
  const reader: ChainReader = {
    async read(signature) {
      return signature === observed.signature ? observed : null;
    },
  };
  const verdict = await verifyProductionReceipt(
    receipt(observed.signature),
    { mint: OFFICIAL_MINT, amountBaseUnits: "100", destination: "settle_inv_test" },
    reader,
  );
  assert.equal(verdict.code, "CHAIN_OBSERVATION_MATCHED");
  assert.equal(verdict.productionProof, false);
  assert.equal(verdict.activatesAccount, false);
  const activation = authorizeProductionAccount(verdict);
  assert.equal(activation.activated, false);
  assert.equal(activation.code, "PRODUCTION_ACTIVATION_DISABLED");
  const missing = await verifyProductionReceipt(
    receipt("5notInTheFixture111111111111111111111111111111111111111111111111111111111111"),
    { mint: OFFICIAL_MINT, amountBaseUnits: "100", destination: "settle_inv_test" },
    reader,
  );
  assert.equal(missing.code, "RECEIPT_NOT_ON_CHAIN");
});

test("receipt claim and subscription snapshot commit or roll back together", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "meku-lab-"));
  const db = path.join(dir, "lab.sqlite");
  const store = openLabStore(db);
  const session = LabSession.open();
  const disk = {
    snapshot: session.engine.snapshot(),
    clock: 1,
    agents: [...session.agents.values()],
    humans: [...session.humans.values()],
  };
  assert.equal(store.save(disk, { signature: "sig_one", invoiceId: "inv_0001", agentId: "agent_operator" }), "ok");
  assert.equal(store.save({ ...disk, clock: 2 }, { signature: "sig_one", invoiceId: "inv_0002", agentId: "agent_other" }), "replay");
  assert.equal(store.load()?.clock, 1);
  store.crashNextCommit();
  assert.throws(() => store.save({ ...disk, clock: 3 }, { signature: "sig_two", invoiceId: "inv_0003", agentId: "agent_operator" }), /CRASH_BEFORE_COMMIT/);
  assert.equal(store.hasReceipt("sig_two"), false);
  assert.equal(store.load()?.clock, 1);
  assert.equal(store.save({ ...disk, clock: 4 }, { signature: "sig_two", invoiceId: "inv_0003", agentId: "agent_operator" }), "ok");
  assert.equal(openLabStore(db).load()?.clock, 4);
});

const TASK = {
  title: "Inspect irrigation laterals",
  action: "Inspect the irrigation system and report visible faults.",
  description: "Walk the authorized Blitar laterals and record visible leaks, blockages, and valve position.",
  country: "ID",
  budgetCents: 10_000,
};

test("a failed save releases the request lock", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "meku-lock-"));
  const session = LabSession.open({ dbPath: path.join(dir, "lab.sqlite") });
  session.failNextSave();
  await assert.rejects(() => session.handleMcp(mcpRequest("meku_test_operator", 1, "tools/list")));
  const retried = await session.handleMcp(mcpRequest("meku_test_operator", 2, "tools/list"));
  assert.equal(retried.status, 200);
});

test("a crashed settlement does not activate the subscription", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "meku-crash-"));
  const db = path.join(dir, "lab.sqlite");
  const session = LabSession.open({ dbPath: db });
  const quote = await readTool(await session.handleMcp(mcpRequest("meku_test_operator", 1, "tools/call", {
    name: "meku_market_quote",
    arguments: { plan: "OPERATOR" },
  })));
  assert.equal(quote.ok, true);
  session.crashNextCommit();
  await assert.rejects(() => session.handleMcp(mcpRequest("meku_test_operator", 2, "tools/call", {
    name: "meku_market_settle",
    arguments: { invoiceId: quote.invoiceId, mode: "simulated-finalized" },
  })));
  const reopened = LabSession.open({ dbPath: db });
  assert.equal(reopened.engine.founderReport().simulation.subscriptionRevenueCents, 0);
  const settled = await readTool(await reopened.handleMcp(mcpRequest("meku_test_operator", 3, "tools/call", {
    name: "meku_market_settle",
    arguments: { invoiceId: quote.invoiceId, mode: "simulated-finalized" },
  })));
  assert.equal(settled.activated, true);
  assert.equal(settled.productionProof, false);
  const blocked = await readTool(await LabSession.open({ dbPath: db }).handleMcp(mcpRequest("meku_test_operator", 4, "tools/call", {
    name: "meku.inspect",
    arguments: TASK,
  })));
  assert.equal(blocked.ok, true);
});

test("separate HTTP client completes the lab workflow and survives restart", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "meku-http-"));
  const db = path.join(dir, "lab.sqlite");
  const port = 21000 + (process.pid % 1000);
  const base = `http://127.0.0.1:${port}`;
  const first = await withServer(port, db, () => runClient(base, "full"));
  assert.equal(first.ok, true, JSON.stringify(first.checks?.filter((check: { pass: boolean }) => !check.pass)));
  const second = await withServer(port, db, () => runClient(base, "resume", first.missionId));
  assert.equal(second.ok, true, JSON.stringify(second.checks));
});

function repoRoot() {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 8; hop += 1) {
    if (existsSync(path.join(dir, "scripts", "reality-lab-client.mjs"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("scripts/reality-lab-client.mjs was not found from the test file");
}

function runClient(base: string, phase: string, missionId = "") {
  const root = repoRoot();
  return new Promise<{ ok: boolean; missionId?: string; checks?: { pass: boolean; name: string; detail: string }[] }>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "reality-lab-client.mjs"), base, phase, missionId], { cwd: root });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("exit", (code) => {
      try {
        resolve(JSON.parse(out.trim()));
      } catch {
        reject(new Error(`client exit ${code}: ${out} ${err}`));
      }
    });
  });
}

function withServer<T>(port: number, db: string, run: () => Promise<T>) {
  const root = repoRoot();
  const serverEntry = path.join(path.dirname(fileURLToPath(import.meta.url)), "lab-http-main.ts");
  return new Promise<T>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", serverEntry],
      { cwd: root, env: { ...process.env, LAB_PORT: String(port), LAB_DB: db } },
    );
    let started = false;
    let stderr = "";
    const fail = (error: Error) => {
      child.kill("SIGTERM");
      reject(error);
    };
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.on("data", async (chunk) => {
      if (started || !String(chunk).includes("listening")) return;
      started = true;
      try {
        const value = await run();
        child.kill("SIGTERM");
        resolve(value);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.on("exit", (code) => {
      if (!started) reject(new Error(`server exited ${code}: ${stderr}`));
    });
  });
}
