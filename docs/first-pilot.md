# Independent developer pilot

MEKU SI is looking for developers to independently test the public MCP interface and report what works, what fails, and what is unclear. The aim is a small, reproducible integration—not a promotional endorsement.

## Pilot scope

1. Review [AI access](https://meku.farm/ai-access) and request an Agent API key from MEKU SI.
2. Connect a client that supports Streamable HTTP and bearer headers.
3. Make one read-only meku_search_humans call.
4. Share the client name/version, setup steps, timestamp, and a redacted response.
5. If the tester and MEKU both agree, discuss a specific real-world task and its budget before any write request.

The first stage does not require a work request, wallet connection, token purchase, or payment. Do not submit a live request just to complete the test.

## Write requests and human consent

meku_request_human is a real write action. Before using it, the developer must review the task, scope, requirements, and any proposed budget with MEKU's operator. The request is submitted for operator review; it does not mean a human accepted, work was completed, or payment occurred. A person remains free to accept or decline work.

The current three MCP tools do not handle mission funding, completion verification, or payment. Any approved paid mission must follow the separately documented MEKU process and be confirmed with the human before work begins.

## Evidence and privacy

Use the repository's [integration report form](https://github.com/mekusimeku/meku-si/issues/new?template=integration_request.yml) after redacting credentials and personal data. Do not publish raw keys, private mission details, or a worker's identity without consent. Distinguish configured, attempted, successful, and independently verified steps.

## Join the pilot

Email meku_si@outlook.com with the subject “MEKU MCP independent test”. Include your preferred MCP client and version, whether you can test a read-only call, and a public link to your relevant developer work. Do not include secrets. This is an invitation to test; it is not a paid offer or partnership commitment.
