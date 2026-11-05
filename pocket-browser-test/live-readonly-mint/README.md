# MEKU Pocket — official mint read-only mainnet inspection

**November 5, 2026. NOT a wallet release, NEVER sign/send.** This is a new unfinished safety check that Stage 0–8's local preflight shape tests did not prove: a **live finalized Solana mainnet read** of the official MEKU SI mint account. The same official mint is fixed in source; no client controls the RPC host or mint.

**What it verifies:** the standard Solana JSON-RPC getAccountInfo result for mint `J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump`, commitment finalized, parsed account type mint, program owner `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (Token-2022), initialization, six decimals, finite response size and syntactically valid non-duplicate extension names. It returns extension *names* for review. It NEVER approves transfers based on them, and ALWAYS says `BLOCKED_PENDING_INDEPENDENT_REVIEW`.

**Limits:** public RPC can be rate-limited or return an unparsed fallback. Either fails closed and must not be misreported as a token mismatch. A single RPC endpoint is not independent chain consensus, extension names alone do not establish safe transfer behavior, and a point-in-time read does not mean the mint's mutable properties cannot change. Future production requires independent RPC checks, extension-specific handling, real signed transaction decoding, account ownership and human approval, robust finality and independent security review. No transfer, key, signing authority, funds, production DB, CORE/NEURA, Lovable, site deployment or Pocket v9 changes.

Run offline: `node --test pocket-browser-test/live-readonly-mint/test.mjs`; live *read only*: `node pocket-browser-test/live-readonly-mint/inspect-mint.mjs`. This is a separate draft test branch, **do not merge as production**.
