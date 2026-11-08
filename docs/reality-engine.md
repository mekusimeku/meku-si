# MEKU Reality Engine — reference contract

Status: **implemented and unit-tested as a simulation**. Not deployed to `meku.farm`. Not a Mainnet payment system.

The live MCP server in `screenshot-magic-5054` still exposes only:

- `meku_search_humans`
- `meku_request_human`
- `meku_get_request_status`

That production file was not changed. Paid tools stay off the public server until a separate review. The isolated lab in this reference adds those three tools plus the six capabilities, market quote/settle, delegation, and STOP. It authenticates test bearer keys, persists by snapshot across a restart, and settles only simulated receipts.

Run the handler acceptance:

```bash
node --experimental-strip-types --test reality-engine/lab-acceptance.test.ts
```

## Plans (locked)

| Plan | Price | Active missions |
| --- | --- | --- |
| AGENT | $29 | 1 |
| OPERATOR | $99 | 5 |
| NETWORK | $299 | 25 |
| INTELLIGENCE | $999.99 | explicit enterprise cap, never unlimited |

A subscription lasts 30 days from verified settlement. Renewal needs a new verified purchase. One receipt activates one invoice.

## Market gate

Official mint, verified on Solana mainnet as Token-2022, 6 decimals, mint authority null:

`J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump`

On 2026-11-07 a read-only Jupiter Swap API V2 quote (`GET https://api.jup.ag/swap/v2/order`) routed 29 USDC to this mint through GoonFi V2 and the Pump.fun AMM pool `7t9V42FMq8bHrtrYA4YnnB7WCEFw5NTNP5WEMPgxFtya`. No taker was supplied, so Jupiter returned `transaction: null`. That is a route proof, not a purchase.

Atomic checkout (buy and subscription settlement in one transaction) is **not demonstrated**. The reference flow is two-step: acquire from liquidity, then settle the invoice. Unknown finality does not activate access and is not retried.

There is no company MEKUSI inventory in this design. Burns are modeled only. Mint authority is already null. Nothing in this package burns tokens.

Human mission budgets are separate from the subscription. The platform fee is 5% of completed human work (`500` bps), disclosed as worker amount plus fee. The whole mission budget is not company revenue.

## Run the tests

```bash
node --experimental-strip-types --test reality-engine/engine.test.ts
```

The tests use simulated humans and simulated receipts. They do not talk to Solana.
