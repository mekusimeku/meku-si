# MEKU Pocket Stage 17 — trusted server identity test (not a live wallet)

November 5, 2026. **TEST ONLY. Do not merge into production. No keys, real users, signing, broadcasting, Mainnet, Pocket v9 integration or deployments.**

Stage 15 proved one database claim in a PostgreSQL race but accepted an unverified owner. Stage 16 used a separate database login for each user. Stage 17 tests a single trusted web backend login shared by multiple users. The backend must verify a short-lived test identity token, map its signed subject to an owner and refuse browser-supplied owner, role, or signing instructions.

Files: auth-gateway.mjs contains test-fixture HS256 verification and safe action routing. test-auth.mjs has 19 Node cases. schema.sql creates a private PostgreSQL 16 CI database schema with a single application login and three SECURITY DEFINER routines owned by a NOLOGIN role. postgres-integration.mjs uses the test gateway to make separate PostgreSQL calls and checks a 12-session race, owner separation, STOP, record preservation and direct table denial. ci-test.sh and the GitHub workflow run these checks in an empty disposable PostgreSQL service.

**This does not test the real Pocket login provider or protect a live wallet.** HS256 shared-key fixtures are not a production identity scheme. The database app credential remains highly trusted and can act for any owner if stolen. Real deployment requires trusted issuer validation and key rotation, authenticated service identity, production privilege review, CSRF and browser origin defense, signed transaction verification, human approval, STOP and chain settlement checks, plus independent security review.

The original Pocket v9 source commit cdda79046ec97bdcd219fcc2f963a252aeef7ea4 is still missing. Don't use a v8 demo or the Lovable website as a substitute. Leave existing Pocket Draft PRs #3, #5, #6 and #7 unchanged.

Commands: node --test pocket-browser-test/stage17-auth-gateway/test-auth.mjs (local); bash pocket-browser-test/stage17-auth-gateway/ci-test.sh (GitHub PostgreSQL service only).

No real wallet words, addresses or passwords. Do not treat a one-shot database claim as a confirmed blockchain payment.
