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


## November 5, 2026: review-only hardening update (supersedes the older 15-test count)

- **Six additional local tests** now cover expiry of old views, fresh-after-expiry requests, replay denial after expiry, bounded request history, rejection of getter-backed intent fields, invalid source-window config and lack of any signing API. Existing 15 tests remain intact: **21/21 PASS**; separately reran **336/336 PASS** inherited Stage 11 synthetic/reference tests (**357/357 combined local tests**, not live wallet testing).
- Once a review's request timestamp exceeds 60 seconds, `getPreview()` or the next `accept()` drops it. **This is lazy expiry, not a background timer.** A future host UI must poll or refresh and remove any displayed stale content; no real signer exists here.
- After 128 unique request IDs in one session, new previews fail closed with `SESSION_REQUEST_LIMIT`. This is only an in-memory guard; a reload clears the history and cannot replace authenticated durable cross-device replay prevention.
- Reject non-record or getter-backed intents *before reading asset*. Reject primitive `expectedSource` configuration. These checks are useful for hostile direct-call tests, but are not proof of browser MessageEvent authenticity or a security audit.
- The original transfer-preflight file is unchanged. A read-only GitHub workflow is proposed to run this isolated test file; do not claim GitHub CI PASS until a matching run completes.
- **No wallet keys, user approval, signatures, network calls, transactions, or live Pocket integration. Do NOT deploy as a real wallet.**
