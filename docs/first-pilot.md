# Independent developer pilot

MEKU SI is looking for developers to independently test the public MCP interface and report what works, what fails, and what is unclear. The aim is a small, reproducible integration, not a promotional endorsement.

## Read-only test: one MCP tool call

This is the first test for an independent developer. It does not submit work or move funds.

1. Read the current [AI access instructions](https://meku.farm/ai-access) and the [MCP reference](mcp-reference.md).
2. Ask the MEKU operator for a separate test key. Before it is issued, ask whether the key can be limited to `meku_search_humans` and how it can be revoked. Do not use a production operator key. Do not share the test key in email, chat, an issue, a screenshot, or a repository.
3. Store the key in a local secret manager or private shell session. For example:

   ~~~sh
   export MEKU_MCP_URL="https://meku.farm/api/public/mcp"
   read -s MEKU_API_KEY
   export MEKU_API_KEY
   ~~~

4. Make exactly one read-only tool call. Replace the skill with a harmless search term. This request uses the bearer key and consumes the key's shared rate limit.

   ~~~sh
   curl -i -sS -X POST "$MEKU_MCP_URL" \
     -H "Authorization: Bearer $MEKU_API_KEY" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{
       "jsonrpc":"2.0",
       "id":1,
       "method":"tools/call",
       "params":{
         "name":"meku_search_humans",
         "arguments":{"skills":["photography"]}
       }
     }'
   ~~~

5. Check both the HTTP status and the JSON-RPC body. A successful test has an HTTP success response, a matching JSON-RPC `id`, and a result without a tool error. Record the returned aggregate fields as received; counts can change and do not identify people. An HTTP success by itself is not proof that the tool call succeeded.
6. After the test, ask the operator to revoke the test key if it is no longer needed.

If the connection fails, save the client name and version, operating system, timestamp with time zone, HTTP status, JSON-RPC error code/message, and the step that failed. Redact the key and any personal or private data. Do not retry repeatedly; authentication, discovery, tool calls, and failures use the shared rate limit.

## What counts as a confirmed independent test

Record each stage separately:

- **Configured:** the client contains the endpoint and can read the key from a private source.
- **Attempted:** the tester made the read-only call and recorded the response or error.
- **Successful:** the tester received a valid JSON-RPC result from `meku_search_humans`.
- **Independently confirmed:** the tester confirms the client, call, and result, and MEKU can review redacted evidence.

Do not describe a configured or attempted connection as successful. Do not call an internal MEKU test independent.

## Optional later work pilot

The read-only test does not require a work request, wallet connection, token purchase, or payment. Do not submit a live request just to complete the test.

If the tester and MEKU both agree to explore a real task later, first write down its scope, requirements, deliverable, timing, and proposed budget. A person must see that information and choose whether to accept. Do not call `meku_request_human` until the operator has reviewed the proposed task and the developer has explicit approval to submit it.

`meku_request_human` creates a request for operator review; it does not approve work, hire a person, verify completion, or make payment. The current three MCP tools do not handle mission funding, completion verification, or payment. Any approved paid mission must follow the separately documented MEKU process and be confirmed with the human before work begins.

## Evidence and privacy

Use the repository's [integration report form](https://github.com/mekusimeku/meku-si/issues/new?template=integration_request.yml) after redacting credentials and personal data. Do not publish raw keys, private mission details, or a worker's identity without consent. A redacted response may still contain operational details; share only what is needed to reproduce the result.

## Join the pilot

Email meku_si@outlook.com with the subject “MEKU MCP independent test”. Include your preferred MCP client and version, whether you can test one read-only call, and a public link to relevant developer work. Do not include secrets. This is an invitation to test; it is not a paid offer or partnership commitment.
