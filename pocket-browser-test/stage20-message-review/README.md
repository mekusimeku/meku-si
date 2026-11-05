# MEKU Pocket — Stage 20 read-only unsigned transaction message gate

**TEST ONLY. NO APP SOURCE REPLACEMENT. NO SIGNING. NO TRANSACTIONS. NO LIVE FUNDS.**

This stage is a *new* missing check: inspect the **actual raw unsigned Solana transaction message bytes** rather than trusting a transfer-intent object or an AI-generated summary. Stage 13 accepted view-only intents, Stage 17 checked synthetic server identity, Stage 18 verified published npm tarballs, Stage 19 tested a disposable browser vault, and separate PR #11 checked official mint properties at one point in time. This stage does not redo those tests.

The exact original Pocket v9 source (`cdda79046ec97bdcd219fcc2f963a252aeef7ea4`) remains unavailable, so this is an isolated read-only test module, **not** an integration into the live site or a release.

## What it checks

- Accepts **only legacy-format unsigned Solana messages** with a 1232-byte size cap, exactly one signer (wallet owner = fee payer), strictly expected readonly account bits and **exactly one** approved transfer instruction.
- SOL: only the system program's `Transfer` instruction (`u32` opcode 2 and exact 8-byte little-endian lamports), with an exact recipient and amount matching an independently supplied expected intent.
- MEKU SI: only `TransferChecked` (u8 opcode 12, u64 amount, one byte decimals = 6), the specific official MEKU SI Token-2022 mint and program, exact source/mint/destination/authority account references, and exact amount.
- Rejects any unexpected account, program, instruction, amount, authority, unsupported version, lookup table, duplicate account, unexpected signer, malformed public key, nonminimal compact length, truncation or extra bytes.
- Produces a **SHA-256 checksum of exactly the inspected unsigned message bytes** for future human review. This is neither a signature nor on-chain transaction ID.
- `token-account-snapshot.mjs` additionally checks a **read-only** `getMultipleAccounts` JSON-RPC response for exact owner wallets, official mint, Token-2022 program, initialized/non-native state, no delegation, no close authority, explicit empty extension lists, six decimals, enough source balance and one consistent slot. A separate one-shot `readTokenAccountSnapshot` helper can request these *public* addresses from one fixed mainnet RPC with `commitment: finalized`; no write RPC or automatic retry. This is a single-endpoint response snapshot, **not trusted chain consensus or authorization**.
- No transfer builder, signer, passphrase handling, wallet access, approval routine, transaction submission, database write, or secret handling.

## Vital limits — still not approved

The on-chain Solana transaction message **does not identify a cluster/network**. `requestedNetwork: mainnet-beta` is a *caller expectation*, not proof. Its recent blockhash still needs a trusted, fresh RPC check; this code validates only its basic bytes. Fees, balance and owner approval are **not verified**.

For Token-2022, the recipient wallet's key is **not present in TransferChecked**; only its *token account* is. Output sets `recipient: null`, `claimedRecipientWallet`, and `tokenAccountProof: NOT_VERIFIED`. The separate snapshot validator can refuse wrong account owners/mints/amount/fee flags and return `SNAPSHOT_MATCH_ONLY_NO_APPROVAL`. It **never upgrades the message review into approval**. Its result is a single RPC response that a malicious/faulty provider could spoof. It does not prove independent finalized consensus, mint transfer behavior or current chain state. Production must recheck against trusted independent RPC and raw Token-2022 account data. The Token-2022 mint's `metadataPointer` and `tokenMetadata` extensions were identified by separate PR #11; that is not a complete transfer safety review.

This limited safety gate **intentionally rejects Solana v0/v1, address lookup tables, compute-budget instructions, associated token account creation, native SOL wrapping, multisig, delegates, hook programs and other complex transactions**. It is not a general Solana transaction decoder, full independent cryptographic audit, verified producer, token-account ownership proof, signature check or production signing flow. Other valid transactions are deliberately refused.

The expected amount and owner must come from a trusted server/owner confirmation. A hostile page could lie about expectation or take over the UI. A production signer must independently re-check all message bytes immediately before signing under its *own* protected origin, tie the bytes digest to authenticated direct human approval, and record the signed transaction identity in a durable journal before any broadcast. On unknown send state, never resend automatically; reconcile finalized chain receipt. No NEURA agent gets keys or approval.

## Evidence

```
node --test pocket-browser-test/stage20-message-review/*.test.mjs
```

56 local Node 22 tests passed: **40** unsigned raw-message tests and **16** read-only Token-2022 account response tests. The first decoder test run had two **test fixture byte offset** mistakes, corrected the tests, not the decoder. GitHub CI must independently confirm the exact pushed source and tests before recording a stage checkpoint. No main branch changes and no deployment are authorized.

Protocol references (checked November 5, 2026):
- https://solana.com/docs/core/transactions/versioned-transactions
- https://solana.com/docs/core/instructions/instruction-structure
- https://www.solana-program.com/docs/token-2022
- https://solana.com/docs/rpc/http/getmultipleaccounts
- https://solana.com/docs/rpc/json-structures

**Next blockers:** recover exact Pocket v9 source and login; verify source/destination Token-2022 account owners from independent finalized on-chain reads; secure origin and human approval binding; reviewed production crypto and signer; full security audit; explicit founder-approved tiny Mainnet acceptance. Leave all test-only PRs draft.
