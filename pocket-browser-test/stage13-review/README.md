# MEKU Pocket — Stage 13 isolated transfer review boundary (November 4, 2026)

**STATUS: TEST-ONLY, VIEW-ONLY, NEVER ALLOWED TO SIGN OR SEND REAL FUNDS.**

This is an additive, isolated checkpoint that continues after founder-confirmed Stage 12 cross-device disposable recovery, with no repeated seed/phone tests. The real Pocket v9 source (`cdda79046ec97bdcd219fcc2f963a252aeef7ea4`) has still not been recovered from its original Sites workspace. Do not replace that original project with this bundle, Library v8/v6 material, or a separate Lovable website.

## Scope

* `review-origin-gate.mjs` — a pure JavaScript **VIEW-ONLY** message boundary for a future separate first-party wallet review origin. Requires one exact preconfigured allowed origin, an exact source window identity, a versioned closed-schema message, a fresh timestamp, a strictly checked normalized SOL/MEKU SI intent and at most one active preview. Rejects extra untrusted properties including AI approval, transaction bytes and keys. Maintains in-memory duplicate-request detection until page reload and a local STOP that never grants permission.
* `transfer-preflight.mjs` — **byte-for-byte unchanged** prior Stage 2 preflight source (SHA-256 `e4768236349d6e37adfee12a924f6c1334555abe609a5e9b1fcc9971bbb18b8d`), reused instead of rebuilt. It validates amount units and token/mint identity **shape only**.
* `review-origin-gate.test.mjs` — 15 focused unit tests for origin/source spoofing, strict schema, unsupported transfer details, stale requests, duplicates, output isolation and STOP.
* `isolated-test-log.txt` — local Node 22 test result, 15/15 passing.
* `stage11-regression-log.txt` — existing Stage 11 isolated bundle re-tested separately; 336/336 passed, inherited source not modified.

**Combined local scope:** 351 passing tests (336 inherited + 15 new). They are tests of local prototypes and known vectors, NOT production wallet safety tests.

## Hard separation

- No private keys, BIP39 phrase import, seed storage, real signer, transaction approval, RPC, token transfer, live website, server, or wallet login.
- No fallback to localhost, alternate domain, iframe, generic messages, or user-supplied "trustedOrigin" from message data.
- `nonce` is only an in-memory display marker and must NEVER be treated as a wallet approval or authentication token.
- No cross-tab or cross-device durable duplicate prevention here. The prior Stage 4 atomic journal remains an isolated mock dependent on externally supplied real auth/proof. No code in this bundle proves real account-bound server permissions.
- When real code exists, signer must independently decode *all Solana transaction bytes* and directly present the exact recipient, amount, instructions, fees, owner and token extensions to the human before one active, explicit approval. An accepted PREVIEW is NEVER permission to sign.
- A compromised allowed-origin page or compromised device can still send a malicious **request**. This module cannot stop XSS or phishing; isolated signer origin + strong transaction review and independent security audit remain mandatory.
- Use no real money until source restoration, reviewed dependencies, production backend, transaction decoder, secure key storage and founder-approved mainnet tests.

## Run

```bash
node --test review-origin-gate.test.mjs
```

## Next approved technical work

The founder approved the Stage 13 separate signer design; that is not approval to move money or publish a live wallet. Original Pocket v9 source recovery remains the primary integration block. The three upstream source tag manifests for `@scure/bip39@2.4.0`, `@noble/curves@2.4.0`, and `@noble/hashes@2.4.0` were checked previously, but npm registry DNS is blocked in this environment. No npm tarball lockfile/integrity was verified; do not ship an unaudited crypto dependency.
