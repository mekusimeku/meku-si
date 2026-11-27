# Invitation to the independent developer from issue #31

Ready for the founder to send. Nothing has been posted or sent. The person invited is the outside tester who published an MCP Inspector run of MEKU's public endpoint in [issue #31](https://github.com/mekusimeku/meku-si/issues/31). That account posted as an AI agent, Instinct, acting for a person, Tal.

How to send it:

- **Publicly**, as a comment in issue #31 from the founder's account. Copy the whole block. Its first line mentions the account, so GitHub notifies them.
- **Privately**, if you prefer: the short version at the end, for example by email.
- If PR #43 has been merged by then, replace `pow/independent-proof-of-work-pilot-20261128` with `main` in the links.

Wait until the [phone test](founder-setup.md#1-phone-test-about-15-minutes) has passed and the [second reviewer account](founder-setup.md#2-second-reviewer-account) exists, so that a yes can be followed up within a day.

## Public comment for issue #31

```text
@alondamri, Tal and Instinct: an invitation, with no pressure at all.

Thank you again for your careful MCP Inspector run in this issue. I would like to ask whether you would be the independent developer in MEKU's first proof-of-work pilot, POW-001.

What it is: one small, unpaid pilot, coordinated by hand. Your agent sends one fixed request through meku_request_human. A second MEKU account reviews it. A consenting adult, who is neither you nor anyone working for MEKU, writes a fresh code by hand next to an everyday object and posts a screenshot of a photo. You check the evidence and accept or reject it. Every step is a public comment in a GitHub issue, and anyone can re-check all of it with offline tools.

What it is not: it is not automated. MEKU's operator relays the task to the person by hand, because MEKU delivers a mission to a person only after a confirmed payment, and payments are off. It shows nothing about payments, tokens or scale. Nothing has run yet, and this would be the first attempt.

What you would do: about 30 minutes of your time, spread over up to 7 days, mostly copying and pasting. You prepare the request, connect, submit it, read its status, reveal the object, then check the evidence and decide. You need Node.js 20 or newer and git; the tools have no dependencies to install. Instinct can make the calls, but a person approves the exact request first: the tool asks for its code to be typed back.

Before saying yes, please check the four statements in the developer guide: you are not MEKU staff, a MEKU contractor or an AI agent working for MEKU; MEKU is not paying you in money or tokens; you have no financial interest in MEKU, including MEKU SI tokens; and you control the agent that makes the calls. Your GitHub login and your records will be public in the ledger.

What MEKU provides: a restricted pilot key, sent privately and never through GitHub. It can submit and read its own requests and nothing else, it is limited to 5 calls a minute and 30 a day, and it is revoked when the pilot closes. Nobody is paid: no money, token or reward, now or later.

You can say no, ask questions first, or stop at any time, also halfway through. If you are interested, reply here, or email contact@meku.farm with the subject "MEKU POW-001 pilot".

Draft protocol and tools, pending my approval: https://github.com/mekusimeku/meku-si/pull/43
Developer guide: https://github.com/mekusimeku/meku-si/blob/pow/independent-proof-of-work-pilot-20261128/docs/proof-of-work/developer-guide.md
What a passing pilot shows and does not show: https://github.com/mekusimeku/meku-si/blob/pow/independent-proof-of-work-pilot-20261128/docs/proof-of-work/protocol.md#what-a-verified-cycle-shows-and-what-it-does-not

Thank you either way.
Gerardo, founder of MEKU SI
```

## Short private version

```text
Subject: MEKU POW-001: would you be the independent developer?

Hello Tal and Instinct,

Thank you again for your MCP Inspector run of MEKU's public endpoint. Would you be the independent developer in MEKU's first proof-of-work pilot, POW-001? It is one small, unpaid pilot, coordinated by hand: your agent sends one fixed request through meku_request_human, a second MEKU account reviews it, a consenting adult does a five-minute paper-and-object task, and you check the evidence and decide. Everything is public in a GitHub issue and can be re-checked offline. It takes about 30 minutes of your time over up to 7 days. MEKU sends a restricted key privately and revokes it at the end. Nobody is paid in money or tokens. Please first check the four eligibility statements in the developer guide:
https://github.com/mekusimeku/meku-si/blob/pow/independent-proof-of-work-pilot-20261128/docs/proof-of-work/developer-guide.md

No pressure at all. You can decline or stop at any time.

Gerardo, founder of MEKU SI
```

## After a reply

- **Yes, with the four statements confirmed:** issue the [pilot key](founder-setup.md#3-pilot-key-issue-limit-watch-revoke) and send it privately. Then open the ledger ([runbook, seq 0](operator-runbook.md#seq-0-open-the-ledger)) with their login and send them its link.
- **Yes, but a statement is not true for them:** thank them. They cannot take the developer role in this pilot, because the verifier's report would rest on a false statement.
- **No, or no answer within a week:** thank them and do not ask again. Never imply payment, tokens or any reward to change the answer.
