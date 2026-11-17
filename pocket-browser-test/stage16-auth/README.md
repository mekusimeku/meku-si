# MEKU Pocket — Stage 16 PostgreSQL role-bound test (Nov 5, 2026)

**TEST ONLY. DO NOT APPLY SCHEMA TO PRODUCTION. DO NOT MERGE AS LIVE WALLET CODE.**

Stage 15 tests one-shot submissions across 12 database connections using a supplied owner ID; Stage 16 asks whether a caller can claim a *different owner's* already-signed fixture. The answer must be **NO**, and the caller must not be able to change the database's identity mapping or write directly to payment records.

In a private PostgreSQL 16 CI service, create three disposable **database login roles** (Alice, Bob, outsider), a separate NOLOGIN execution role with tightly scoped table privileges, and `SECURITY DEFINER` functions with a fixed `pg_catalog` search path. The functions use the authenticated PostgreSQL `SESSION_USER` to choose the bound owner **without accepting an owner-key parameter**. Test same request key across two owners, a 12-client race under Alice, STOP state isolation, stale claim refusal after reconnect, direct table grants denied, outsider execution denied, and attempted role switching denied.

## Crucial limits

- These tests use **distinct PostgreSQL login roles for each test owner**. The live MEKU application uses a different application/user authentication design and likely a shared connection pool. **This test is NOT proof of production user identity, session authorization, RLS or JWT validation.** Implement real server-verified login and transaction-specific authorization before using anything like this.
- Test-only users have obvious published passwords; CI uses a disposable PostgreSQL instance with synthetic data. NEVER reuse this in a live database.
- No Solana signatures are verified. No wallet, key, recovery phrase, funds, RPC, broadcasting, fee, Token-2022 mint, payment/refund changes, NEURA signing access or live deployment.
- An exposed frontend cannot be trusted to supply owner identity or approval. Even a trusted auth session cannot replace transaction-specific human approval and independent signed-byte checks.
- Exactly one DB claim does **not** mean exactly one confirmed chain payment, especially after ambiguous RPC results. Do not auto-resend.
- Stage 12 cross-device disposable recovery, Stage 13 PR #3, Stage 14 PR #5 and Stage 15 PR #6 remain separate; original Pocket v9 source still missing.

**Acceptance:** GitHub Actions on pull request must run PostgreSQL 16 with a clean ephemeral database and show all distinct-user, privilege and concurrency checks passing. No production DB/migration rights supplied.
