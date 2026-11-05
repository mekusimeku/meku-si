# MEKU POCKET — Stage 15, PostgreSQL session-level claim test

**TEST ONLY. NO REAL MONEY. NOT PRODUCTION CODE.**

This experiment follows Stage 14's verified local SQLite race tests and keeps Stage 13 Draft PR #3 and Stage 14 Draft PR #5 unchanged. Redundant Stage 14 Draft PR #4 was closed unmerged after all five GitHub file hashes matched PR #5. No previous work was rebuilt.

## What is new?

The GitHub Actions workflow starts a clean **PostgreSQL 16 database service**, runs the separate `schema.sql` and `smoke-and-setup.sql`, then races **12 independent PostgreSQL client sessions** against the same owner/request. Only one session should transition `SIGNED_RECORDED` to `CLAIMED_UNKNOWN`; the other 11 should get `DO_NOT_RETRY`.

The PostgreSQL function locks the owner STOP row and then claims the intent within one transaction. The test also checks: a fresh session after a simulated worker restart can't claim again; STOP serializes with claim; STOP prevents further claims after it commits; owner IDs do not mix; `REVIEW_REQUIRED` preserves uncertain results. The SQL runs only in GitHub's disposable database service.

## Hard limits

- The `owner_key` parameter is **user-supplied fixture text**, not an authenticated user. **There is no server identity check**.
- The `test_signature` is fake test data, never a cryptographically verified Solana signature.
- There is no encrypted vault, wallet private key, human approval, real transaction, Solana RPC, Mainnet, actual MEKU SI mint inspection, browser UI, deployment or live payment.
- The schema is **not a production migration** and **must never be applied to a real database unchanged**.
- A single-use claim is NOT proof of exactly-once blockchain delivery. After an unknown broadcast outcome, reconcile with the chain rather than re-signing or retrying automatically.
- A real system still needs exact Pocket v9 source, verified owner identity, real wallet consent, durable signed bytes and network receipt records, PostgreSQL least-privilege permissions/RLS, cross-service controls, independent review, then explicit release permission. NEURA never gets signer access.

## Running in CI

Workflow: `.github/workflows/pocket-stage15-postgres-test-only.yml`, starts PostgreSQL 16, executes `pocket-browser-test/stage15-postgres/ci-race.sh` using the service's container ID. No app secrets are passed. CI must be green before claiming an actual PostgreSQL race pass.

## Source continuity

- Website main at start: `1f1c19de406fcdbc2926ef46836b0412136a6a2c`.
- Original Pocket v9 source commit `cdda79046ec97bdcd219fcc2f963a252aeef7ea4` remains unavailable. Never substitute the older demo.
- Independent throwaway cross-device seed recovery Stage 12 already passed.
- Stage 14 local SQLite tests 18/18 and GitHub CI already passed; these are not rerun here.
- Separate Stage 15 branch: `pocket-stage15-postgres-ci-test-only-20261105` — DRAFT only; do not merge as a live wallet.
