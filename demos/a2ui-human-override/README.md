# MEKU SI / A2UI 1.0 Human Override Lab

**Status: public synthetic demo, not a security certification.** This is a standalone browser page designed for AI developers who want to study how human authority should constrain agent actions.

## Try it

- Previous hosted interactive challenge: https://huggingface.co/spaces/MEKU-SI/meku-human-override
- Public source for this **A2UI protocol sample**: [index.html](index.html)
- Free installable agent instructions: [MEKU Human Override skill](../../skills/meku-human-override/SKILL.md)
- MEKU Human Cloud public MCP check: https://meku.farm/first-contact.html

## What it does

- Runs four **deterministic, local, synthetic** scenarios: REVOKE, REPLAY, PARTITION, and STALE RETRY (an independent agent challenge by lilt on Moltbook).
- Checks the local simulation's final authority gate and records observed results; it does **not** connect to a real AI agent, live task, wallet, or payment.
- Creates **A2UI v1.0** `createSurface` and `updateDataModel` JSON envelopes. It uses the documented Basic Catalog component shapes `Column` and `Text`.
- Renders those envelopes with a small custom allowlisted projection instead of executing agent-delivered JS. **This is not Google's full A2UI SDK or compatibility renderer.**
- Exports a JSON report with `LOCAL_SYNTHETIC`, `productionProof:false` and unrun scenarios marked `NOT_RUN`.

## Safety boundary

No public MCP `tools/call` is performed. There is no account login, telemetry, third-party script, cookie, session write, private data, bot posting, or wallet signing. The browser fetches nothing. The public site serves a static page.

## A2UI

A2UI is a JSON format for describing interactive agent interfaces; it is **not** an authorization or security engine. This demo shows a concrete link between a test outcome and A2UI messages. A deployed agent's behavior must be tested separately through its actual final execution gate.

Protocol: https://a2ui.org/ and https://github.com/a2ui-project/a2ui/tree/main/specification/v1_0

## Review and local test

Run `index.html` in a modern browser, or serve it locally via any static server. No build or npm package is needed. Test each button and check its expected outputs:

| Case | Local expected result | Fake action count |
| --- | --- | --- |
| REVOKE | ABORT | 0 |
| REPLAY | EXECUTE then DENY | 1 |
| PARTITION | DENY while offline, DENY after restore with stale permit | 0 |
| STALE RETRY | ABORT on revoke, DENY offline, DENY old retry after reconnect, DENY relabeled fake permit | 0 |

Inspect the generated A2UI JSON; it should contain a unique `surfaceId`, `version: "1.0"`, `createSurface` with a `root` component, and later `updateDataModel` envelopes. Download the report and inspect the `productionProof:false` marker.

**Limits:** Only a toy sequential replay model is simulated. The local model now tracks issued permit object identity to reject simple relabeling; this is **not** a signature, a durable authority journal, or proof that a real agent cannot forge or replay its grants. It does not test concurrency, distributed locks, cryptographic signatures, live partitions, remote agents, production execution paths, or payment safety. Do not infer those properties from a PASS.

## Independent feedback: lilt's stale-permit retry case (Nov 15, 2026)

An outside agent [lilt](https://www.moltbook.com/post/f424270e-dd59-4db7-a20c-c3a65bbee8c2) asked whether a revoked permit might still work if an agent retries after the network comes back. This is now a **fourth reproducible local model case**, not a new claim of production security.

- Human STOP revokes permit `p-stale-retry` before the final gate: **ABORT**
- Authority goes offline; a retry with the same permit: **DENY**
- Authority returns at a new epoch; the old permit is tried again: **DENY**
- Attempt to relabel an old permit and copy the current epoch: **DENY**
- Original permit executes zero fake actions throughout.

Run the independent test harness using Node 22:

```bash
node --test demos/a2ui-human-override/stale-retry.test.mjs
```

The harness tests the **actual pure fixture functions inside the HTML source** and the browser report strings. GitHub Actions repeats this check on changes. A real system must bind permits cryptographically to authority, decision, action and state, use trusted revocation storage, reject concurrent retries, and fail closed while the authoritative status is unknown. Those production properties are **not** tested here.

## Release path

Source lives in a separate public GitHub folder and can be hosted on a separate static endpoint without changing the MEKU production website or Fable/Astra branches. A public demo launch requires hosted URL verification before marketing it as live.
