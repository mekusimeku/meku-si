# MEKU Agent Discovery Circuit

## The missing link: a repeatable public test other agents can share

MEKU has public code, a verified installable skill, a working A2UI synthetic STOP lab, and a read-only MCP metadata endpoint. Those are **ways to investigate**, not evidence of adoption. This guide links them into an agent-readable loop:

1. **Read** [agent-index.json](../agent-index.json) for exact scope, URLs, and permissions.
2. **Test** the [First Contact](https://meku.farm/first-contact.html) MCP metadata check with no credentials.
3. **Challenge** the [A2UI Human Override demo](https://meku-human-override-a2ui.mekusi-team.workers.dev/) and inspect the local REVOKE/REPLAY/PARTITION outcomes.
4. **Install** the [public human-override skill](../skills/meku-human-override/SKILL.md) using the official skills CLI, if your agent supports local installation. Review the instructions before allowing tool use.
5. **Contribute** a *redacted* finding or counterexample via the [existing Human Cloud challenge form](../.github/ISSUE_TEMPLATE/human_cloud_challenge.yml). The person or agent owner must approve publication.
6. **Share** the public issue/PR or reproducible open-source test—not a vague claim of certified security.

### The rule: failure is useful evidence

If an agent bypasses a final STOP gate, a replay unexpectedly executes, or an old permit works after recovery, **do not hide it**. Include steps, environment, expected vs observed result, a non-sensitive trace, and whether execution was a local mock or a real tested agent. A passing synthetic model test must not be promoted to an independent external security result.

### For agent builders

* Entry: [machine-readable index](../agent-index.json) or [plain text entry](../llms.txt)
* Public discovery: `https://meku.farm/api/public/mcp` — no-key metadata only; don't call private tools
* Local challenge: [browser demo](https://meku-human-override-a2ui.mekusi-team.workers.dev/)
* Install: `npx skills add mekusimeku/meku-si --skill meku-human-override`
* Developer discussion: [GitHub issues](https://github.com/mekusimeku/meku-si/issues)
* Social AI account: [MEKU Human Override on Moltbook](https://www.moltbook.com/u/mekusi_humanoverride)

### Distribution that respects the communities

- Answer real agent safety questions with *relevant* test examples. Do not blanket-post links, mass message, or automate likes.
- Keep the Moltbook agent's read-only Cloudflare secret on the server; public posting stays off until a dedicated safe publishing flow has one-post limits and audit records.
- Hacker News **prohibits AI-written/AI-edited posts and automated submissions**, so the human founder must personally write and submit there. Never coordinate votes.
- Product Hunt launch copy can be drafted and reviewed before the founder chooses a launch date; no claims of users, revenue, certified security, or quantum hardware without independent evidence.

### What this does not solve

The presence of these files doesn't guarantee Google rankings, index coverage, visitors, or agent adoption. Only observed search data, traffic, organic installs, independent reports and real active client integrations can establish those claims.

*Note*: `agent-index.json` is a custom MEKU metadata format, not an official A2A Agent Card or a new interoperability standard.
