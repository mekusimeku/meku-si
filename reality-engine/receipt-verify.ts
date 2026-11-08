import { OFFICIAL_MINT, SOLANA_CLUSTER } from "./constants.ts";
import type { Receipt } from "./engine.ts";

export type ChainObservation = {
  signature: string;
  mint: string;
  destination: string;
  amountBaseUnits: string;
  finalized: boolean;
  cluster: string;
};

export type ChainReader = {
  read(signature: string): Promise<ChainObservation | null>;
};

export function isSimulatedSignature(signature: string) {
  return signature.startsWith("sim_");
}

/**
 * Simulated signatures are a lab credential. They are never production proof.
 * A chain candidate still needs a read-only observation before it can settle.
 */
export function screenReceipt(receipt: Receipt, channel: "test-lab" | "production") {
  const simulated = isSimulatedSignature(receipt.signature);
  if (simulated && channel !== "test-lab") {
    return { ok: false as const, code: "SIMULATED_NOT_PRODUCTION", productionProof: false as const };
  }
  if (!simulated && channel === "test-lab") {
    return { ok: false as const, code: "CHAIN_RECEIPT_NOT_ACCEPTED_IN_LAB", productionProof: false as const };
  }
  if (simulated) return { ok: true as const, code: "TEST_LAB_SIMULATED", productionProof: false as const };
  return { ok: true as const, code: "CHAIN_CANDIDATE", productionProof: false as const };
}

export async function verifyProductionReceipt(
  receipt: Receipt,
  expected: { mint: string; amountBaseUnits: string; destination: string },
  reader: ChainReader,
) {
  const screened = screenReceipt(receipt, "production");
  if (!screened.ok) return { ...screened, activatesAccount: false as const };
  const observed = await reader.read(receipt.signature);
  if (!observed || observed.signature !== receipt.signature) {
    return { ok: false as const, code: "RECEIPT_NOT_ON_CHAIN", productionProof: false as const, activatesAccount: false as const };
  }
  if (!observed.finalized || observed.cluster !== SOLANA_CLUSTER) {
    return { ok: false as const, code: "NOT_FINALIZED", productionProof: false as const, activatesAccount: false as const };
  }
  if (observed.mint !== OFFICIAL_MINT || observed.mint !== expected.mint || receipt.mint !== OFFICIAL_MINT) {
    return { ok: false as const, code: "WRONG_MINT", productionProof: false as const, activatesAccount: false as const };
  }
  if (observed.amountBaseUnits !== expected.amountBaseUnits || observed.amountBaseUnits !== receipt.amountBaseUnits) {
    return { ok: false as const, code: "AMOUNT_MISMATCH", productionProof: false as const, activatesAccount: false as const };
  }
  if (observed.destination !== expected.destination || observed.destination !== receipt.destination) {
    return { ok: false as const, code: "DESTINATION_MISMATCH", productionProof: false as const, activatesAccount: false as const };
  }
  return {
    ok: true as const,
    code: "CHAIN_OBSERVATION_MATCHED",
    productionProof: false as const,
    activatesAccount: false as const,
  };
}

/** A chain observation, including a test fixture, is not allowed to activate an account. */
export function authorizeProductionAccount(_observation: { code: string }) {
  return { activated: false as const, code: "PRODUCTION_ACTIVATION_DISABLED" as const };
}
