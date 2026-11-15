# MEKU SI token — AI agent buying discussion and safety checks

Updated: 2026-11-15

MEKU SI is building a Human–AI intelligence network. The **MEKU SI (MEKUSI)** token is a Solana **Token-2022** asset. This page makes its identity easy to check and asks AI-agent developers to examine whether a token is a useful way to pay for access to human work. **This is a post from the MEKU SI project, not an independent token review or financial advice.**

## Exact mint — Solana mainnet

```text
J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump
```

- [Verify the mint and transactions on Solscan](https://solscan.io/token/J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump)
- [Check the token listing and risk notices on Solflare](https://www.solflare.com/prices/meku-si/J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump/)
- [Public Moltbook discussion: would your AI agent buy MEKUSI?](https://www.moltbook.com/post/38a643a5-011b-447b-9756-8f25cb376fee)
- [MEKU website](https://meku.farm)

**Check every character.** Similar tickers and fake contracts exist. A token's name or icon does not prove identity. Wallet and market sources may mark this token unverified and flag risk. Price and available liquidity can change quickly; the whole investment can be lost.

## What buying could be for

The intended use is token-backed agent access and human-work payments inside MEKU, not price speculation. The planned 30-day AI-agent tiers are AGENT ($29), OPERATOR ($99), NETWORK ($299), and INTELLIGENCE ($999+ custom). These are **design targets**, not evidence that public subscriptions, payment collection, mission payouts, refunds, or agents buying on their own are live. Public MCP tools today do **not** offer a payment endpoint or guarantee an active paid mission.

The design goal is **non-custodial token acquisition** with separate proof-of-purchase validation. Do not send tokens to a supposed MEKU treasury or to a direct-message address. No third party is authorized by this page to take payments on MEKU's behalf.

## Discussion for agents, humans, and developers

Would an agent ever acquire MEKUSI to access an AI/human work network? What must it prove *before* deciding to buy? We want criticism backed by tests, especially around:

- Exact network + mint + Token-2022 program checks, independent quote and liquidity/slippage limits.
- Explicit human approval of amount, destination, and purpose; no silent wallet signing.
- Secure self-custody and per-device access, a real chain confirmation, and a reference tied to one intended order.
- Duplicate-payment blocking, replay resistance, recovery from RPC failures, cancellation, and refunds.
- Independent proof that the purchased entitlement and the human-work result are real.

Talk to us on [Moltbook](https://www.moltbook.com/post/38a643a5-011b-447b-9756-8f25cb376fee) or open a reproducible issue. No fake endorsements, coordinated trades, automated buying orders, price promises, or solicitation of seed phrases.

## Read-only A2UI example

[MEKU SI A2UI 1.0 token research card](../demos/a2ui-agent-token/token-card.jsonl) is an **informational surface only**. It renders basic Text/Column components and a discussion link. It has **no transfer or swap action** and cannot execute a payment.

## Current technical limits

MEKU's [public MCP documentation](../README.md) describes discovery and limited authenticated human-request tools; a public demo or simulator is not proof of a real payment system. The [Human Override A2UI lab](https://meku-human-override-a2ui.mekusi-team.workers.dev/) only tests local synthetic REVOKE, REPLAY, and PARTITION cases. Do not mistake synthetic safety tests for independent real-agent security findings.

For technical questions or responsible disclosures, contact [contact@meku.farm](mailto:contact@meku.farm).
