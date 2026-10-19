# MEKU proposal: a human-work handoff profile for AI agents

**Status:** exploratory proposal, 2026-10-19. Not an official standard, MCP extension, or claim of current MEKU endpoint support.

## Why examine this?

Agent systems already have primitives for invoking tools, pausing for approval, and tracking asynchronous work. A human-work request adds domain questions those generic primitives do not answer: whether a real person accepted, what consent covers, who can cancel, what evidence demonstrates completion, and whether payment was separately settled.

This proposal is narrower than a new task protocol. It asks whether an optional vocabulary and evidence profile could make human-work handoffs easier to implement and audit across MCP clients and agent frameworks.

## Existing primitives and limits

- MCP tools expose callable operations and annotations. Annotations are hints to clients, not an authorization boundary; authorization must be enforced by the server.
- MCP Tasks describes generic asynchronous task retrieval, updates, cancellation, and completion/failure states. It does not define human-worker acceptance, consent scope, labor evidence, or payment settlement. MEKU's currently documented endpoint should not be assumed to implement Tasks.
- Agent-framework approval mechanisms can pause a run pending a caller or operator decision. That is distinct from server-side authorization, MEKU operator review, and the worker's independent choice.
- SEP-2848 explores asynchronous approval for tool calls. A human-work profile should complement—not rename or duplicate—generic tool approval.

These are separate boundaries. A UI approval is not a server permission; operator approval is not worker consent; an accepted request is not completed work; completion is not payment.

## Proposed concepts

An optional human-work profile could define interoperable fields and event meanings while leaving transport and marketplace implementation to each system:

| Concept | Minimum question |
| --- | --- |
| Capability discovery | What broad capability and region/time window are relevant, without revealing unnecessary worker identity? |
| Request | What bounded outcome is requested, what constraints apply, and what compensation is proposed or how is it determined? |
| Requester authorization | Did the agent's authorized principal approve this specific write and its cost/scope? |
| Operator review | Was the request accepted, modified, or rejected by the service operator? |
| Worker choice | Did a person explicitly accept or decline? A missing response must remain distinct from acceptance. |
| Lifecycle | Can the requester distinguish submitted, under review, approved, rejected, cancelled, worker accepted, in progress, completed, and disputed? |
| Evidence | What minimum privacy-preserving evidence supports the reported result, who attested to it, and what remains unverified? |
| Payment | Is compensation proposed, authorized, pending, settled, failed, or disputed? Settlement evidence is separate from task completion. |
| Privacy and safety | What data is necessary, who can see it, what retention applies, and what task boundaries prohibit unsafe or intrusive work? |

## Illustrative lifecycle (not a MEKU API contract)

    draft → requester_authorized → submitted → operator_review
                                         ↘ rejected
    operator_approved → offered_to_worker → accepted | declined | expired
    accepted → in_progress → completed | cancelled | disputed
    completed → payment_pending → paid | payment_failed | payment_disputed

Implementations should record the actor and timestamp for consequential transitions, allow cancellation where safe, and distinguish a service's report from independently verified evidence. They should not expose worker personal data as a prerequisite for basic discovery.

## Candidate interoperability rules

1. Keep tool discovery separate from permission to call a tool.
2. Make write operations explicit and require server-side authorization; annotations are not enough.
3. Represent requester approval, operator review, and worker consent as distinct actors and events.
4. Treat refusal, timeout, cancellation, dispute, and failure as first-class outcomes.
5. Label evidence provenance and verification level; a status field alone does not prove physical completion.
6. Represent compensation and payment separately from the request and completion assertion.
7. Minimize personal data and document retention, visibility, and redaction expectations.
8. Allow status mapping without claiming support for a protocol capability that an implementation does not provide.

## Open questions

- Should this be transport-neutral, an MCP metadata convention, or an application-level schema first?
- What is the smallest evidence envelope that protects privacy yet supports dispute resolution?
- How should status be mapped when a service exposes only request-level states?
- Which safety constraints belong in an interoperable schema, and which must remain jurisdiction- and service-specific?
- How can a client show a human the consequences of a request before an agent submits it?

## Relationship to MEKU

MEKU SI currently documents three tools: meku_search_humans, meku_request_human, and meku_get_request_status. Public docs describe operator review and request statuses but do not establish a tool for worker lifecycle, completion verification, dispute handling, or payment. This proposal is a design discussion, not a statement that those capabilities exist at MEKU.

Feedback is welcome through a focused GitHub discussion or documentation pull request. Identify the related standard or implementation and propose a concrete field, state mapping, or safety property. Do not share private worker or requester data.

## References

- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2025-06-18)
- [MCP Tasks extension](https://modelcontextprotocol.io/specification/2026-07-28/basic/utilities/tasks)
- [MCP tool annotations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-annotations)
- [SEP-2848: Asynchronous Approval for Tool Calls](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2848)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)

Standards evolve; check current versions before implementing or making compatibility claims.
