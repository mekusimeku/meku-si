# Developer guide: run MEKU pilot POW-001 with your own AI agent

This guide is for the independent developer in the [POW-001 protocol](protocol.md). It takes about 30 minutes of your time, spread over a few days while MEKU reviews and a person does the task. Nothing here moves money: MEKU's MCP server has no payment tool, and the pilot is unpaid.

## 0. Check that you are eligible

Post your records only if all four statements are true. Your `developer_ready` record affirms them publicly.

1. **Not MEKU staff or contractor.** You are not MEKU staff, a MEKU contractor, or an AI agent working for MEKU.
2. **Not paid by MEKU.** MEKU is not paying you, in money or tokens, for this pilot.
3. **No financial interest in MEKU.** This includes holding MEKU SI tokens or expecting to profit from MEKU.
4. **Your own agent.** You control the agent or MCP client that makes the calls.

You also need: Node.js 20 or newer, `git`, and a GitHub account. Your GitHub account will be public in the ledger.

## 1. Try the public endpoint without a key (optional)

```sh
curl -sS -X POST https://meku.farm/api/public/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Without a key you see only `meku_search_humans`. That is expected: every `tools/call` needs a key. More no-key checks: [five-minute public test](../public-mcp-five-minute-test.md).

## 2. Ask for a pilot key

Email contact@meku.farm with the subject **"MEKU POW-001 pilot"**. Include your GitHub login and the MCP client or agent you will use, and say that you meet the four statements above. You can also apply through [meku.farm/ai-access](https://meku.farm/ai-access) and mention POW-001.

The MEKU operator will then:

- send you a **pilot key** privately, never through GitHub. It can submit and read its own requests, and nothing else. It is limited to about 5 calls a minute and 30 a day. Every call that carries the key counts, including the 3 calls an MCP host makes to connect.
- open the **ledger issue** in this repository, with a `pilot_opened` record (seq 0) naming your GitHub login.

Never paste the key into a file you commit, a GitHub comment, a screenshot, a prompt shared with others, or a report. If it leaks, tell the operator so it can be revoked.

Subscribe to the ledger issue (**Subscribe** on GitHub), so that GitHub's notification emails keep your own copy of every comment. Do not rename your GitHub account until the report is published: roles are matched by login.

## 3. Get the tools (no installs)

Use the exact version the ledger names. Its first record, `pilot_opened`, links the protocol at a commit: `https://github.com/mekusimeku/meku-si/blob/<COMMIT>/docs/proof-of-work/protocol.md`.

```sh
git clone https://github.com/mekusimeku/meku-si && cd meku-si
git checkout <COMMIT>                                              # the commit named in pilot_opened
node --test tools/pow/pow.test.mjs tools/pow/pow-docs.test.mjs   # offline; all tests should pass
node tools/pow/synthetic.mjs /tmp/pow-try   # a SYNTHETIC example ledger
node tools/pow/verify.mjs /tmp/pow-try/bundle.json --allow-synthetic
```

The tools are small, dependency-free Node.js files in [`tools/pow/`](../../tools/pow/README.md). Read them before you trust them. Your private files (`pow-request.json`, receipts, exports) are already listed in `.gitignore`; keep them out of any commit.

Put the key in your environment for this terminal only:

```sh
read -s MEKU_API_KEY && export MEKU_API_KEY     # macOS / Linux: paste, then Enter (nothing is shown)
```

```powershell
$env:MEKU_API_KEY = Read-Host -MaskInput "MEKU key"   # Windows PowerShell 7
```

## 4. Choose how your agent makes the MCP calls

- **Path A, the built-in client.** `tools/pow/request.mjs` is itself a minimal MCP client. It writes exact receipts and prints each record for you.
- **Path B, your own MCP host.** Claude Code, Cursor, an Agents SDK or MCP Inspector can make the calls. Configure the server URL `https://meku.farm/api/public/mcp` with the header `Authorization: Bearer ${MEKU_API_KEY}`; see the [Claude Code](../../examples/claude-code/README.md) and [Cursor](../../examples/cursor/README.md) examples. After each tool call, save the tool result text **exactly** as MEKU returned it (the JSON in `content[0].text`) and import it with `request.mjs`. Your records then name your host as the client.

Both paths produce records of the same form, and the verifier checks them the same way. With Path B, three things differ. The `arguments` in your seq 2 record are the ones the tool gave your host to send; only your host's own log shows what it actually sent. `observed_at` is the time you import the result, unless you pass `--observed-at`. And the saved result text is hashed without its leading and trailing whitespace, so a trailing newline from saving the file does not matter.

## 5. Connect and post `developer_ready` (seq 1)

Path A:

```sh
node tools/pow/request.mjs check --pilot POW-001 \
  --client-name meku-pow-request --client-version 1.0.0 \
  --agent "Describe your agent, model and runtime" --affirm-independence
```

Keep `--agent` to at most 160 characters, without `<!--`, `-->` or three backticks. The tools never print a record the verifier would refuse; they say what to fix instead.

Path A spends one keyed call: initialization goes without the key, and only `tools/list` carries it.

Path B: ask your agent to connect and list MEKU's tools. Confirm that `meku_request_human` appears, then run the following, listing exactly the tools your host showed:

```sh
node tools/pow/request.mjs ready-manual --pilot POW-001 \
  --client-name "Claude Code" --client-version "<version>" --agent "Describe your agent" \
  --server-version 1.0.0 --protocol-version 2025-06-18 \
  --tools meku_search_humans,meku_request_human,meku_get_request_status --affirm-independence
```

Post the printed block as a **new comment** in the ledger. If `meku_request_human` is missing, your key is search-only: stop and tell the operator.

## 6. Prepare the request (offline) and have a person read it

```sh
node tools/pow/request.mjs prepare --ledger https://github.com/mekusimeku/meku-si/issues/<N>
```

This creates `pow-request.json` with a fresh random code and a secret object salt, and prints the exact request. A real person will read it, so read it yourself first. The text is fixed by the protocol: the tool refuses to send an edited file, and the verifier fails any change, extra request or field. Keep `pow-request.json` private until step 9, because it holds the salt.

## 7. Submit once and post `request_submitted` (seq 2)

Path A, typing back the code shows that a person reviewed this exact request:

```sh
node tools/pow/request.mjs submit --request pow-request.json --confirm <CODE>
```

Path B: tell your agent *"Call the MEKU tool meku_request_human with exactly these arguments, changing nothing"* and give it the `arguments` object from `pow-request.json`. Save the tool's result text to `submit-result.txt`, then:

```sh
node tools/pow/request.mjs import-submit --request pow-request.json --response-text-file submit-result.txt
```

Post the printed block as a new comment. Your private receipt `pow-receipt.json` holds the MEKU request id. Keep it private, but keep it: it proves what MEKU answered.

**Never resend blindly.** If the call timed out or the answer was unclear, do not call again from your agent. Run `submit --retry` instead: it reuses the same idempotency key, and MEKU returns the request it already saved with `deduplicated: true`. If in doubt, ask the operator.

## 8. Wait for review, then post `request_status_observed` (seq 4)

The operator records the review as seq 3. After that, check by hand, a few times a day at most. The tool never polls.

```sh
node tools/pow/request.mjs status --receipt pow-receipt.json
# Path B: save the meku_get_request_status result text, then
node tools/pow/request.mjs import-status --receipt pow-receipt.json --response-text-file status-result.txt
```

When the status is `approved`, post the printed block. If the tool reports that your code is missing from the stored text, post a stop and report it.

## 9. Reveal the object after consent: `object_revealed` (seq 7)

Wait until the human's `human_consent` comment (seq 6) is in the ledger. Only then:

```sh
node tools/pow/export.mjs https://github.com/mekusimeku/meku-si/issues/<N> pow-ledger-6
node tools/pow/request.mjs reveal --request pow-request.json --bundle pow-ledger-6/bundle.json
```

Post the printed block. Its first line tells the human what to write and which object to use: your code followed by 2 more characters, and one object. Neither you nor anyone else chooses them. They follow from your salt, committed in seq 2, and from GitHub's id for the consent comment, and anyone can recompute them. The tool reads that id from the exported ledger, so the reveal always cites the consent the verifier accepts.

**As soon as the human posts the evidence (seq 8), check it at once and tell the operator the result:**

```sh
node tools/pow/verify.mjs --from-issue https://github.com/mekusimeku/meku-si/issues/<N> --out pow-ledger-8
```

Look at check E04 (metadata). If it fails, tell the operator immediately, because the image may reveal a location. The operator posts the result (seq 9) only after E04 has passed.

## 10. Check the result and decide: `requester_decision` (seq 10)

After the operator's `result_returned` (seq 9):

```sh
node tools/pow/verify.mjs --from-issue https://github.com/mekusimeku/meku-si/issues/<N> --out pow-ledger
```

Open the image in `pow-ledger/evidence/` and look at it yourself. Accept only if your code followed by the 2 revealed characters is written by hand and legible, the named object is there, and nothing personal is visible:

```sh
node tools/pow/record.mjs decision --bundle pow-ledger/bundle.json --accept \
  --code-visible --code-matches --object-visible --object-matches --no-personal-data \
  --reason "Code and object match; nothing personal visible"
# or: --reject --reason "<what was wrong>" with the checks that held
```

The decision commits to the exact ledger digest over records 0–9, so it can only be posted on the ledger as it stands. Post it within 7 days of your request.

## 11. After the close

When the operator posts `pilot_closed` (seq 11), run the verifier again, together with the exports you made during the pilot. They show whether any comment disappeared or changed after you saw it, because MEKU, as the owner of the repository, could delete one:

```sh
node tools/pow/verify.mjs --from-issue https://github.com/mekusimeku/meku-si/issues/<N> --out pow-ledger-final \
  --previous pow-ledger-6/bundle.json --previous pow-ledger-8/bundle.json --previous pow-ledger/bundle.json
```

The verdict should be `PASS`, and the run should exit with 0. Exit 5 means that only a supplied file passed, and 4 that the run could not complete. Keep your exports. You may publish your own account using the [report template](report-template.md). Ask a third person to verify independently, starting from the live issue rather than from a file you send them. They look at the photo and read every comment printed under `READ FIRST` (manual checks M01 to M06).

## Stopping

You may stop at any time:

```sh
node tools/pow/record.mjs stop --pilot POW-001 --seq <next seq number> --role developer --reason "<why>"
```

## Errors

- **HTTP 401 / JSON-RPC -32001.** The key is wrong, expired or revoked. Stop and tell the operator.
- **HTTP 429.** You hit the rate limit. Wait; the tool prints `Retry-After` when MEKU sends it, and never retries on its own. If connecting alone hits it, the key's per-minute limit is too low: ask the operator for 5.
- **`isError: true` with HTTP 200.** A tool-level refusal. The tool prints MEKU's message. Do not change the request to get around it.
- **A timeout on submit.** Use `submit --retry`, never a fresh call.
