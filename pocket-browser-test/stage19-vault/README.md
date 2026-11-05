# MEKU Pocket — Stage 19 encrypted local vault candidate

**ISOLATED / EXPERIMENTAL / NEVER FUND / NO SIGNING.** Work toward real browser self-custody, but **not a production wallet**. Exact Pocket v9 source is still missing; do not replace or integrate into the existing public app. No private keys or test phrases from screenshots are used here.

## New capability vs Stage 8

Stage 8 proved temporary Ed25519 WebCrypto support on iPhone using a **public test password**, then required manual IndexedDB cleanup. This stage has a browser WebCrypto module with a password supplied by the wallet owner, an atomic IndexedDB persistence adapter, password rotation with write revision checks, password-gated erase, account scope, address and chain binding, auto-expiring unlock sessions with a monotonic clock, explicit lock, wrong-password and record-tamper handling, and no signing or network APIs. It does **not** rerun Stage 8/12 tests, generate wallet words, or deploy.

## Design

- Encrypt **only 16 bytes of disposable BIP39 entropy** using AES-256-GCM, with a fresh 32-byte salt, fresh 12-byte nonce and PBKDF2-HMAC-SHA256 600,000 iterations on every new record/rotation. No fallback to unprotected storage or weak random sources.
- Bind ciphertext through GCM additional authenticated data to record version, account scope, network, public address, revision, salt, nonce and KDF parameters. Identity is a **caller-provided account scope plus public-address namespace**. The scope is isolated in IndexedDB keys and bound to ciphertext, but it is **not proof of logged-in ownership**; the real Pocket login provider and production server policy must supply and verify the scope before integration.
- Store only versioned ciphertext plus public metadata. Do not save a plaintext phrase, passphrase, signing seed, or raw private key. The caller **must clear its own original entropy input**. Browser JS cannot guarantee zeroization of internal crypto copies.
- Unlock obtains a nonextractable WebCrypto `CryptoKey` held in short-lived JS memory. `withEntropy` allows **synchronous** callback use only and zeroes its local entropy array afterward. This callback must be private to reviewed first-party signer code; there is currently no real signer, approval UI, or secure caller. It is deliberately unsafe to expose to agents. `lock()` clears the in-memory reference; the host must also lock on pagehide/visibilitychange/logout and on separate STOP handling. This module has **lazy expiry**, not a timer.
- `idb-store.mjs` models atomic `add`, transaction-scoped compare-and-swap `put`, and matching-revision deletion in IndexedDB. IndexedDB can be evicted or cleared; the owner's independently saved 12-word recovery phrase is the only durable recovery path. **The browser adapter is checked only by an isolated Chromium CI smoke test, not on the founder's iPhone or with the original production app.** No auto-retry on storage errors.
- A production password policy must include a full strength/UX review; current minimum 14 characters is a simple filter, **not an offline brute-force guarantee**.

## Limits

A browser vault **cannot protect secrets from compromised first-party JS, XSS, unsafe extensions, device malware or screen/keyboard capture**. AES/PBKDF2 and tamper tests do not constitute a security audit. `withEntropy` is a future integration boundary, not transaction approval or a safe signing function. No BIP39 words, Solana derivation, transactions, fees, RPC, server identity, authentication, on-chain signatures, funding or finality. No original v9 code touched. Independent security review and real-device validation required before any funds are used.

Run: `node --test pocket-browser-test/stage19-vault/vault-core.test.mjs` (Node 22+ WebCrypto). CI checks only this isolated module. Do not merge into any production site or deploy an app from this PR.
