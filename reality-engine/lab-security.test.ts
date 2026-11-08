import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { OFFICIAL_MINT } from "./constants.ts";
import { openLabStore } from "./lab-store.ts";
import { verifyProductionReceipt, type ChainReader } from "./receipt-verify.ts";
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
  assert.equal(verdict.code, "CHAIN_VERIFIED");
  assert.equal(verdict.productionProof, true);
  const missing = await verifyProductionReceipt(
    receipt("5notInTheFixture111111111111111111111111111111111111111111111111111111111111"),
    { mint: OFFICIAL_MINT, amountBaseUnits: "100", destination: "settle_inv_test" },
    reader,
  );
  assert.equal(missing.code, "RECEIPT_NOT_ON_CHAIN");
});

test("durable receipt table rejects a second insert", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "meku-lab-"));
  const store = openLabStore(path.join(dir, "lab.sqlite"));
  assert.equal(store.claimReceipt("sig_one", "inv_0001", "agent_operator"), true);
  assert.equal(store.claimReceipt("sig_one", "inv_0002", "agent_other"), false);
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

function runClient(base: string, phase: string, missionId = "") {
  return new Promise<{ ok: boolean; missionId?: string; checks?: { pass: boolean; name: string; detail: string }[] }>((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/reality-lab-client.mjs", base, phase, missionId], { cwd: "/workspace" });
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
  return new Promise<T>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "src/lib/reality/lab-http-main.ts"],
      { cwd: "/workspace", env: { ...process.env, LAB_PORT: String(port), LAB_DB: db } },
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
