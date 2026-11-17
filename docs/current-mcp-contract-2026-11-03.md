# MEKU SI — source-checked MCP contract (November 3, 2026)

**Product:** MEKU SI is building a broader Human–AI Intelligence Network. Human Cloud work requests are its first major practical use, not the entire project. The developer endpoint documents human choice and operator review, **not** automatic hiring, missions or payments.

**Official contact:** contact@meku.farm  
**Live developer docs:** https://meku.farm/docs  
**AI access:** https://meku.farm/ai-access  
**MCP endpoint:** https://meku.farm/api/public/mcp

This page is a dated correction to earlier developer notes written before several source fixes were merged. It describes the reviewed site code through website commit `06165776528e400b11a105c3c8447ed26d3aa720`. It does **not** establish that every change has reached the public deployment or that private signed-in connections have been independently tested.

## Access and privacy

- Public GET on the MCP route returns static connection metadata only. Anonymous JSON-RPC `initialize` and `tools/list` expose metadata for the search tool, not real directory records.
- Actual `tools/call` requires an operator-issued, unrevoked MEKU Agent API bearer key. Supplied invalid credentials are rejected, not silently downgraded to anonymous access.
- Search-only keys can use `meku_search_humans` but cannot submit work requests or retrieve per-key request status through MCP. Writable keys expose all three tools. Keys may expire or be revoked; do not store them in public code.
- Safe hosted anonymous GET checks passed on November 3: private Agent Requests returned 401 and no-store without request data, while public MCP metadata returned 200. This is **not** a signed-in account separation test.
- All human work requests remain review- and consent-gated. No MCP tool starts a payment, authorizes an agent to act or assigns a person.

## The three MCP tools

### `meku_search_humans` — aggregate read

Optional filters: `country`, `region` (strings up to 80 characters), and `skills` (up to ten strings of at most 40 characters). Search requires **every requested skill on the same public, listed, explicitly online person**. Busy, offline and unknown availability do not count as online. Country and region are exact matches after trimming and case normalization; saved location is self-reported, not verified current location.

Only counts and matching-country labels are returned. No name, profile ID, contact data or private task details. Results include `listed_humans`, `online_humans`, `matching_humans`, `matched_skills`, `countries`, `counts_complete` and `scanned_profile_limit`. The scanner is stably ordered and limited to 500 saved profiles, plus one row to signal truncation. When `counts_complete=false`, counts and countries cover only that subset; an apparent zero is not proof that no human is available.

### `meku_request_human` — reviewed write, never automatic execution

Required: `title` (4–120 characters), `action` (4–200 characters) and `description` (20–2,000 characters). **Skills are optional** and default to `[]`. Optional text: `country`, `region`, `deliverable`, `timeframe`, `budget_text`. Optional JSON booleans: `travel_required` and `equipment_required`. The public tool's snake_case budget/flag inputs are mapped to the shared validator. Numbers, arrays and objects cannot silently become request text, and string values such as `"true"` cannot silently become a false requirement.

An optional `idempotencyKey` accepts 1–80 letters, numbers, dots, underscores, colons or dashes. An explicitly blank or whitespace-only key is rejected. Identical normalized retries return the original request and `deduplicated: true`. Reusing the same key for a different normalized task returns an error, not a new submission. A failed saved-request lookup blocks unsafe retry. These safeguards are not a guarantee of exactly-once delivery across every network fault.

Submitting a request enters operator review. It does not assign a human, approve a mission, transfer money or promise earnings.

### `meku_get_request_status` — private per-key read

Requires the original request ID. It can read only requests owned by **the exact agent API key** that submitted them. It does not expose private contact, payment or operator notes. An approved request does not mean it is completed or paid.

## Separate public capability endpoint

`GET https://meku.farm/api/public/seek-capabilities` returns only public/listed aggregate countries, skills and bounded counts, with `counts_complete` and `scanned_profile_limit=500`. A partial result is explicitly marked. Results carry no-store headers so an old public listing is not represented as current.

## What is not yet verified

Source tests and a successful GitHub merge are not the same as a fully deployed product. Authenticated multi-account owner/admin separation, live human consent→proof→review→completion, external ARRIVAL identity permissions, signed HYDRA STOP/recovery, Pocket v9 release and final iPhone acceptance remain open. Real mission payments, wallet connections and autonomous agent execution remain disabled.

The current public Pocket site is a separate simulation, not a wallet holding real SOL or MEKU SI. No token transfer is needed to inspect the developer tools.

If an earlier README or MCP reference page contradicts this **dated source update**, use the live `/docs` page and current server source as the newer reference, but verify actual hosted behavior before any real work submission. No independent paid mission is claimed.
