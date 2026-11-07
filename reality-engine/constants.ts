/** Locked commercial constants. Do not edit prices here to "tune" a demo. */

export const OFFICIAL_MINT = "J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump";
export const MINT_DECIMALS = 6;
export const MINT_SYMBOL = "MEKUSI";
export const MINT_NAME = "MEKU SI";
export const TOKEN_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const SOLANA_CLUSTER = "mainnet-beta";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const PLATFORM_FEE_BPS = 500;
export const SUBSCRIPTION_MS = 30 * 24 * 60 * 60 * 1000;
export const QUOTE_TTL_MS = 90_000;
export const MAX_PRICE_IMPACT = 0.03;
export const MAX_SLIPPAGE_BPS = 100;
export const LAB_INTEGRITY_KEY = "MEKU-REALITY-LAB-NOT-A-PRODUCTION-KEY";

export const PLANS = {
  AGENT: { id: "AGENT" as const, priceCents: 2900, activeMissions: 1 },
  OPERATOR: { id: "OPERATOR" as const, priceCents: 9900, activeMissions: 5 },
  NETWORK: { id: "NETWORK" as const, priceCents: 29900, activeMissions: 25 },
  INTELLIGENCE: { id: "INTELLIGENCE" as const, priceCents: 99999, activeMissions: null },
};

export type PlanId = keyof typeof PLANS;

export const CAPABILITIES = [
  "meku.inspect",
  "meku.verify",
  "meku.collect",
  "meku.test",
  "meku.execute",
  "meku.report",
] as const;

export type CapabilityName = (typeof CAPABILITIES)[number];

/** Public names use dots. Hosts that reject dots may send the underscore alias. */
export const CAPABILITY_ALIASES: Record<string, CapabilityName | "legacy"> = {
  "meku.inspect": "meku.inspect",
  meku_inspect: "meku.inspect",
  "meku.verify": "meku.verify",
  meku_verify: "meku.verify",
  "meku.collect": "meku.collect",
  meku_collect: "meku.collect",
  "meku.test": "meku.test",
  meku_test: "meku.test",
  "meku.execute": "meku.execute",
  meku_execute: "meku.execute",
  "meku.report": "meku.report",
  meku_report: "meku.report",
  meku_search_humans: "legacy",
  meku_request_human: "legacy",
  meku_get_request_status: "legacy",
};

/**
 * Read-only Jupiter Swap API V2 observation taken 2026-11-07.
 * Proves a route exists for the exact mint. It is not a purchase,
 * not an atomic subscription transaction, and not a price promise.
 */
export const VERIFIED_ROUTE_OBSERVATION = {
  observedAt: "2026-11-07T19:35:40Z",
  endpoint: "https://api.jup.ag/swap/v2/order",
  inputMint: USDC_MINT,
  outputMint: OFFICIAL_MINT,
  inAmount: "29000000",
  outAmount: "3660464227938",
  priceImpactPct: "0.0026104410171248725",
  slippageBps: 50,
  router: "metis",
  requestId: "01a1b782-ee31-71e2-94ac-34782f3682d5",
  hops: [
    { label: "GoonFi V2", ammKey: "GMCJvYGf5Ex2ARiMquaBDqU6iKM8uiEQkB8jCnoNfHpC" },
    { label: "Pump.fun Amm", ammKey: "7t9V42FMq8bHrtrYA4YnnB7WCEFw5NTNP5WEMPgxFtya" },
  ],
  directSolPool: "7t9V42FMq8bHrtrYA4YnnB7WCEFw5NTNP5WEMPgxFtya",
  onChain: {
    owner: TOKEN_PROGRAM,
    decimals: MINT_DECIMALS,
    symbol: MINT_SYMBOL,
    name: MINT_NAME,
    mintAuthority: null,
    freezeAuthority: null,
    supplyBaseUnits: "948800826843768",
  },
  atomicCheckout: "not-demonstrated" as const,
  note: "Quote only. transaction was null because no taker wallet was supplied. No funds moved.",
};
