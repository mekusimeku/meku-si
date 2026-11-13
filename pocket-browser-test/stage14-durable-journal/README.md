# MEKU Pocket — Stage 14: durable one-shot claim experiment

**2026-11-05 · ISOLATED TEST-ONLY · NO REAL WALLET · DO NOT MERGE OR DEPLOY AS PAYMENT CODE**

## What is new

Stage 13 has a **view-only** cross-origin request gate. Earlier custody tests have an in-memory `SimulatedTransferJournal` and mocked database behavior. Those cannot prove the behavior of two independent processes competing to record one transfer submission. Stage 14 uses the Python standard library SQLite database in WAL mode to check **disk-backed atomicity across processes** and recovery after a simulated worker crash.

- An owner-bound, immutable `(principal, request_id, intent_sha256)` is stored in a local SQLite file. The `principal` is an **unverified test identity input** here; a real app must obtain this from authenticated server context, never a request body.
- Open with the same intent digest is idempotent; same request with different digest refuses.
- A **test-only** arming step and **dummy** base58 signature-shape check simulate external approval and recording a signed transaction. Neither proves human consent, cryptographic signature validity, or signed bytes equality.
- A `BEGIN IMMEDIATE` database transaction commits `claims=1` and `CLAIMED_UNKNOWN` **before** any hypothetical send. Only one concurrent worker can receive the claim. Restarting after a crash **cannot claim again**. A crash between claim and network send means the transfer stays blocked pending review; this is intentional.
- Unknown result moves to `REVIEW_REQUIRED`, never resends automatically.
- `STOP` prevents new opens/claims, cancels unsigned drafts and preserves signed or claimed evidence for later review.
- `test_only=True` must be passed to instantiate the simulator. That flag **does not** make it production-safe.

## Run

Requires Python 3.11+ standard library; no package downloads, Solana RPC, key generation or real wallet addresses.

```sh
python -m unittest discover -s pocket-browser-test/stage14-durable-journal -p 'test_*.py' -v
```

The suite includes 18 tests, including 12 separate Python processes racing for the same claim and a worker that exits after a confirmed commit. No worker ever sends a transaction. The source contains **zero** wallet keys or personal data.

## Critical open gates (do not infer from passing tests)

1. **SQLite is only this local experiment.** Real Pocket production must use a database supported by the actual service, with audited PostgreSQL migrations, unique constraints, atomic claims, owner-bound RLS/permissions, reliable transactions, backup, migrations and disaster-recovery tests.
2. There is **no authentication or real account linkage**. All test `principal` strings are caller-provided. In production, use verified authenticated server identity and explicit consent; defend against cross-account request ID collisions and stale sessions.
3. There is **no actual human approval**. `arm_test_only` simulates a separate approval decision. It must be replaced with verifiable human UI approval bound to full transaction data.
4. There is **no real cryptography**. The signature is only checked for base58 character shape; the transaction SHA-256 digest is supplied by the caller and not derived or checked against signed Solana transaction bytes. Any production adapter must validate actual signer, message, network, programs, mint, amount and recipient.
5. There is **no Solana broadcast or finalized on-chain check**; no RPC access, no cross-provider verification, and no real transfer. This code must **never be wired to a live send method**.
6. `STOP` is local database state, not proof that an already-sent transaction can be reversed. A stolen private key cannot be stopped by database controls.
7. No data is persisted safely across a network of hosts by this example, and it does not test power loss or full disk failure. Test with actual production storage and failover before use.
8. Exact Pocket v9 source is still unavailable: `cdda79046ec97bdcd219fcc2f963a252aeef7ea4`. Do not substitute older Pocket versions or the website source. Independent security review and explicit mainnet authorization remain required.

## Continuity and scope

- Stages 10–12 were already completed (including founder-provided iPhone→Android disposable-recovery evidence). **Do not repeat them.**
- Stage 13 PR #3 is a separate DRAFT in `mekusimeku/meku-si`, with view-only review gate and a green targeted GitHub Actions workflow. **Do not modify or merge PR #3 as part of Stage 14.**
- Stage 14 is a separate new draft PR, no live app source changes, no wallet integration, no server deployment, no Lovable credits.

**Status: TEST-ONLY STAGE 14 prototype complete; production wallet unchanged.**
