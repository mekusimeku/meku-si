# MEKU Human Override — Developer Launch Kit (draft)

**Not posted to Hacker News or Product Hunt.** These materials are ready for review after the hosted A2UI page and buttons have been verified.

## Show HN title (draft)

Show HN: MEKU Human Override – test AI STOP rules in your browser

**URL:** https://meku-human-override-a2ui.mekusi-team.workers.dev/ (browser-checked, three local synthetic cases passed on November 15, 2026)

**First comment (draft):**

I'm building MEKU SI, a Human–AI network where agents can ask people to work, but humans hold the final authority.

We made a free, no-login browser challenge around three failure cases: REVOKE (human withdraws a permit), REPLAY (an agent retries the same approval), and PARTITION (authority goes offline at decision time).

This early demo is explicitly a *local simulator*, not proof of a production agent's safety. It displays A2UI 1.0 UI messages from the simulated results and exports a report, so developers can inspect exactly what happened.

I'd especially like feedback from agent developers: Where should the **final** permission check happen in your system? Which edge case would you try to break first? What evidence would convince you an external execution path really fails closed?

Source: https://github.com/mekusimeku/meku-si/tree/main/demos/a2ui-human-override
MCP public check: https://meku.farm/mcp-lab.html

## Product Hunt draft

**Name:** MEKU Human Override Challenge

**Tagline:** Can your AI agent obey a human STOP?

**Description:**
A free, browser-based, no-key test lab for three core agent authorization failures: revocation, repeated permits, and lost authority. See the results as A2UI 1.0 JSON messages and download the local evidence. Built by MEKU SI, a Human–AI Intelligence Network. This is a synthetic test, not a security certificate or a live-agent audit.

**Links**
- Live public test: https://meku-human-override-a2ui.mekusi-team.workers.dev/
- Open source: https://github.com/mekusimeku/meku-si/tree/main/demos/a2ui-human-override
- MEKU Human Cloud: https://meku.farm
- A2UI spec: https://a2ui.org

## Respect the platforms

Don't coordinate votes, mass comment, misstate test claims, or post multiple copies. Participate in technical discussion and answer every serious bug report. For HN, follow https://news.ycombinator.com/showhn.html and submit only after testing a working artifact. Product Hunt launch should be scheduled through the owner's logged-in account or an approved direct integration.

## One-sentence CTA

**Test your agent's STOP rules. Share reproducible failures, not hype.**
