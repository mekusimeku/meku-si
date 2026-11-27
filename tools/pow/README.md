# Proof-of-work pilot tools (`meku.pow/1`)

Small, dependency-free Node.js 20+ tools for the [MEKU proof-of-work pilot](../../docs/proof-of-work/protocol.md). Nothing needs installing. Only `request.mjs` talks to MEKU, and only with your key from the `MEKU_API_KEY` environment variable. `export.mjs`, `verify.mjs --from-issue`, and `record.mjs check-image` and `check-comment` with a link read public GitHub data, without any key. Everything else works offline.

| File | Who uses it | What it does |
| --- | --- | --- |
| `request.mjs` | developer | MCP client: `prepare`, `check`, `submit`, `status`, `reveal`; also `ready-manual`, `import-submit` and `import-status` when your own MCP host makes the calls. It refuses edited requests, never retries on its own, never follows a redirect with the key, keeps private receipts and prints ledger records. |
| `record.mjs` | everyone | Prints ready-to-post records: `opened`, `reviewed`, `offered`, `consent`, `evidence`, `returned`, `decision`, `closed`, `stop`, `verification`, `digest`, `schema`; `check-image` runs the evidence checks on a file, an attachment link or every attachment in a comment, and `check-comment` shows how the verifier reads one posted record: both for the phone tests before a pilot. |
| `export.mjs` | anyone | Ledger issue to `bundle.json` plus evidence files, using GitHub's public API. |
| `verify.mjs` | anyone | Verifier: 33 automated checks, manual checks M01 to M06 (with every participant comment that is not a counted record, in full), verdict and exit code. `--from-issue <url>` exports the live ledger first. Only such a self-made export counts; a bundle file alone proves nothing. `--previous <bundle>` compares with earlier exports to catch deleted comments. Exit codes: 0 PASS from a live export, 5 PASS on a file only, 1 FAIL, 2 other verdicts, 3 usage, 4 could not complete. |
| `digest_reference.py` | anyone | Independent Python implementation of record extraction and the ledger digest. It shares no code with the JavaScript tools. |
| `lib.mjs` | | Canonical JSON (RFC 8785 subset), hashes, record schema, image metadata scanner. |
| `pow-record-v1.schema.json` | implementers | JSON Schema generated from `lib.mjs` (`node tools/pow/record.mjs schema`). |
| `synthetic.mjs`, `mock-meku-mcp.mjs` | tests | A SYNTHETIC ledger built by running the real tools against an in-memory **mock** of MEKU's documented MCP contract. Not the live server and not evidence. |
| `pow.test.mjs`, `pow-docs.test.mjs` | CI | Offline tests, including planted faults the verifier must catch and checks that the docs match the tools. |

Try it in a minute:

```sh
node --test tools/pow/pow.test.mjs tools/pow/pow-docs.test.mjs
node tools/pow/synthetic.mjs /tmp/pow-try
node tools/pow/verify.mjs /tmp/pow-try/bundle.json --allow-synthetic
python3 -I tools/pow/digest_reference.py /tmp/pow-try/bundle.json
```

The synthetic ledger passes only with `--allow-synthetic`, and every report it produces says it is synthetic test data.
