# Human Override A2UI Worker — source of record

`worker.js` is a byte-for-byte copy of the module currently deployed as the Cloudflare Worker
`meku-human-override-a2ui` (https://meku-human-override-a2ui.mekusi-team.workers.dev/).

- Deployment: `5c69ed4a-bd3d-42df-9ee3-245238a8db42`, uploaded through the Cloudflare API on
  2026-11-15T13:12:35Z, compatibility date 2026-11-15, no bindings.
- SHA-256 of the deployed module, read back on 2026-11-22: `cf41f5b8b42f3392b1a57dac85b00c32b8196ed557cb9e3851ad6468900a339a`.
- Live `/token.json` and `/llms.txt` SHA-256 (independent Cloudflare URL Scanner, 2026-11-22) equal
  the output of this file: `2383ebe0…033f` and `a26f305a…a1d8`.

Why this exists: the deployed Worker had been edited directly on Cloudflare and its token identity
(`/token.json`, the token section of `/llms.txt` and the page's mint panel) was not in any repository.
The older `../index.html` is the demo page only and has no mint. Redeploying from `../index.html` would
remove the official token identity from this public endpoint.

Rules:

- The only approved mint is `J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump` (Solana Mainnet, Token-2022).
- Change `worker.js` and the `DEPLOYED_SHA256` pin in `worker.test.mjs` in the same reviewed PR.
- Committing here does not deploy anything. Deploying needs separate founder approval.
- The Worker stays synthetic: GET/HEAD only, no bindings, no wallet, no payments, no signing.

Test: `node --test demos/a2ui-human-override/worker/worker.test.mjs` (offline).
Live check of all twelve public endpoints (read-only GETs): `node tools/mint-integrity-live-check.mjs`.
