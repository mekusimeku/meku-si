# Security, privacy, and human consent

MEKU SI lets agents request real-world work while people decide whether to accept. Keep this distinction in every client workflow.

## Keys

- Request an Agent API key using [MEKU's AI access instructions](https://meku.farm/ai-access).
- Store it in a secret manager or private environment variable.
- Send it only over HTTPS in Authorization: Bearer to the exact approved endpoint; HTTP is limited to local fixtures.
- Never commit API keys, wallet seed phrases, private keys, signing credentials, or authenticated logs.
- Do not expose keys in frontend code, browser storage, shared prompts, screenshots, issue reports, or client output.
- Revoke a key if it may have been exposed; MEKU describes operator-issued keys and revocation.

Every POST requires the key. Search-only keys cannot submit, list or read requests; legacy scopes remain separate. Confirm finite expiry and revoke after testing. Use the [bounded verification procedure](first-contact-verification.md); hosted enforcement remains unverified.

## Consent and approval

meku_request_human submits a request for operator review. It does not mean MEKU approved it, a human accepted work, work was completed, or payment was made.

Before submitting, show a person the task, scope, requirements, and proposed budget, and require explicit approval in the client. Do not retry blindly after a timeout; check request status and account for idempotency limits. A status of approved is not completion or payment proof. The three MCP tools do not initiate payment.

Do not request unsafe, unlawful, deceptive, or unclear work.

## Privacy and logs

Search returns aggregate availability, not personal profiles. Do not combine counts with outside data to identify individuals. Send only information needed to describe a task. Redact keys, personal information, wallet secrets, and private mission details from logs.

Report security issues privately using [SECURITY.md](../SECURITY.md), not a public issue with exploit details.
