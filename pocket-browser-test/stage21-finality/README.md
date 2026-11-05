# MEKU POCKET — Stage 21 finalized-receipt reconciliation (TEST ONLY)

**Nov 5, 2026 — DRAFT, STACKED ON STAGE 20, NOT A RELEASE.** No funding, no signer, no transfer submission, no automatic retry, no live wallet app changes, and no production state changes.

This check continues existing Stage 20 code rather than copying it. Stage 20 verifies the raw unsigned legacy Solana transaction bytes. Stage 21 checks a **recorded transaction signature**, its *real Ed25519 signature over those exact bytes*, and matching finalized JSON-RPC evidence. This is a new failure boundary for Incident #0020: a website or RPC error cannot be interpreted as permission to send twice.

## Test-only checks

- Accept **only** one recorded canonical base58 Ed25519 64-byte signature and an exact previously approved SHA-256 hash of the unsigned message. The same pinned Stage 20 strict message decoder verifies the original SOL or MEKU SI Token-2022 transfer fields. No new payment builder or derivation code.
- Validate Solana **legacy** signed wire format, exactly one signer, cryptographic Ed25519 signature over the exact underlying message bytes, exact message hash, account keys, recipient token-account address, program and atomic amount, and preapproved maximum fee.
- Require `getSignatureStatuses` finalized status, no error, and `getTransaction` with `commitment: finalized`, `encoding: base64`, `maxSupportedTransactionVersion: 0`, matching slot, `meta.err: null` and no unexpected inner instruction metadata.
- Require matching transaction/fee/slot evidence from **two read-only public RPC snapshots**. If one is missing, not finalized, inconsistent, malformed, incorrect, or over fee limit, return **`REVIEW_REQUIRED`**. There is **no resend, broadcast, or payment state mutation API**.
- Read helper makes exactly one request per method to each of two fixed public RPC URLs; it refuses redirects, JSON errors and oversized data. No caller-supplied URL, no automatic RPC retry. Tests use **mock RPC responses**, not live funds, live signatures or an independent production provider.
- Direct caller mutation during an async RPC call cannot change the pre-copied transfer expectation.

## Major limitations

- The function cannot prove the input recorded signature/hash/amount were actually approved by a human or written to a durable authenticated journal before send. A future server must enforce that before calling this code.
- **Two labels or two public RPC endpoints are not proof of independent chain consensus.** Public endpoints can fail, lie or agree on an incorrect response. Production needs vetted separate providers and a security review. This read-only source is not approved production reconciliation.
- Even a cryptographically matched finalized transfer instruction is **not proof of recipient economic delivery**. Token-2022 extensions and account ownership still need trusted finalized checks. This returns `delivery: NOT_VERIFIED` and `providerIndependence: NOT_ATTESTED`, never `PAID`/`SETTLED`.
- `review-message.mjs` is imported from Stage 20 in the parent branch. Stage 21 does not copy, modify or merge Stage 20. Only strict legacy transfers supported; versioned messages, extra programs, inner instructions and missing metadata fail closed.
- Original Pocket v9 source at commit `cdda79046ec97bdcd219fcc2f963a252aeef7ea4` is still unavailable. Do not use an older demo or connect this code to any current website, wallet, payment, CORE or NEURA.
- No production credentials, external npm packages, AI approvals, real signing, live transfers, refunds or deployments. The release still requires real login, production crypto/security review, separate secure signing origin, explicit owner authorization, a durable pre-broadcast journal and on-chain account validation.

## Run tests

```bash
node --test pocket-browser-test/stage20-message-review/*.test.mjs pocket-browser-test/stage21-finality/*.test.mjs
```

This isolated draft is stacked on Stage 20's **test-only** commit. Do not merge either PR or claim the wallet is ready because the checks pass.

Protocol references: https://solana.com/docs/rpc/http/gettransaction, https://solana.com/docs/rpc/http/getsignaturestatuses, https://solana.com/docs/rpc/json-structures.
