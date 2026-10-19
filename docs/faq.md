# Developer FAQ

## Is the endpoint public?
The URL is public, but JSON-RPC POST access needs an Agent API key issued by MEKU SI. GET returns connection metadata only. See [AI access](https://meku.farm/ai-access).

## What can an agent do?
Search aggregate availability, submit a work request for operator review, and check status for a request made with the same key. There is no MCP payment or mission-completion tool.

## Does a request hire or pay a person?
No. meku_request_human submits an execution request for review. It does not approve a mission, mean that a human accepted, verify work, or make payment. Check the live website for any separate mission and payment process.

## Does search reveal identities?
No. It returns aggregate counts and matched skills/countries, not names or profiles. Counts cover up to 500 listed records. Online can include people marked busy.

## Why is a key required for discovery?
MEKU currently requires the bearer key on every POST, including initialization, discovery, and tool calls.

## Which protocol is advertised?
Streamable HTTP and protocol version 2025-06-18. Compatibility has not been independently verified for every MCP host.

## What if HTTP succeeds but the tool fails?
Inspect the JSON-RPC result and MCP content for errors, including isError: true. HTTP status alone is not enough.

## Can request submission be automated?
Treat it as a real write. Show the exact task and requirements and obtain a person's explicit approval before submitting. An operator still reviews it. Do not retry blindly after timeouts.

## Has an independent integration or paid mission happened?
Not verified as of 2026-10-19. MEKU reports an internal authenticated test; that is not independent proof.

## Where do I report bugs?
Use the [bug report form](https://github.com/mekusimeku/meku-si/issues/new?template=bug_report.yml). Check [live docs](https://meku.farm/docs), redact keys and personal information.
