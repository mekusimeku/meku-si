# MEKU Pocket — Stage 17: trusted application identity gate (TEST ONLY)

**Nov 5, 2026. Not production authorization. No money. No signing. No broadcasts. No Pocket website changes.**

## Why this is new
Stage 15 exercised PostgreSQL concurrent one-shot claims using a caller-supplied owner. Stage 16 bound claim rights to distinct database **login roles**. A web app typically uses one trusted backend database login for many people. Stage 17 checks how a trusted backend can verify identity then derive the owner before any database request, with a shared database login and SQL privilege separation.

## Test-only design
- `auth-gateway.mjs`: verifies a short-lived, fixed issuer/audience HMAC fixture token (HS256, 32+ byte key, strict header/claim shapes, exp/nbf/iat, signed payload). The backend maps its verified `sub` to a private owner record; an owner name from the browser is refused. No user-supplied SQL, transaction payloads or signing functions.
- `test-auth.mjs`: 19 independent Node tests covering malformed/missing/modified tokens, wrong issuer/audience, future/expired or long-lived tokens, extra owner/role fields, cross-owner isolation, STOP and replay.
- `schema.sql`: **throwaway PostgreSQL 16** schema with a shared app login that can only call `claim_once`, `status_owner` and `stop_owner` functions owned by a separate NOLOGIN role. Application login cannot directly select or alter tables. Function keeps owner-control row locked while claiming a synthetic signed-record fixture. All secrets and credentials are publicly known CI test values.
- `postgres-integration.mjs`: eight? focused Node tests using actual independent PostgreSQL sessions, including a 12-client claim race after authenticated fixture identity lookup. (The Node test runner reports exact number.) No RPC, keys or transactions.
- `ci-test.sh` + GitHub Actions workflow: builds an empty PostgreSQL 16 CI service; tests both identity and database permissions. It is an isolated workflow, not production deployment.

## What this does NOT establish
**This is not the real Pocket identity system.** The HMAC fixture signer is NOT the live issuer, not a credential provider, not a browser login, and NOT production JWT verification. No authenticated user or real wallet has been used. Database `p_owner` is trusted solely because it is supplied by this carefully limited test backend; a compromised backend app DB credential could impersonate every owner. A production design needs a real vetted issuer and signing keys (likely asymmetric/JWKS), key rotation/revocation, CSRF/origin controls, hardened request parsing, limited database role, comprehensive audit, denied offline operation, and independent security review.

The `claim_once` function proves **one database claim**, not one Solana transfer; it never signs or submits a transaction. A full production flow still requires a confirmed human review, verified signed bytes, immutable evidence before broadcast, durable cross-service recovery and correct finalized on-chain matching. The original exact Pocket v9 source is still unavailable and must not be substituted with v8 or the website app. Stage 14/15/16 draft PRs remain unchanged; no merge or launch is authorized.

## CI commands
Run in GitHub's throwaway CI container only:

```bash
bash pocket-browser-test/stage17-auth-gateway/ci-test.sh
```

Local pure Node checks (no database):

```bash
node --test pocket-browser-test/stage17-auth-gateway/test-auth.mjs
```

No production secrets or real recovery phrases belong in this repository.
