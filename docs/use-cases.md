# Human Cloud use-case library

These are candidate use cases, not measured demand, customer research, or completed work. Scores are qualitative hypotheses (1-5) used only to order early review; higher safety means lower risk within the stated boundaries. They are not usage data or forecasts.

`meku_search_humans` returns aggregate availability, not worker identities or a guarantee of acceptance. `meku_request_human` submits a real request for operator review. The scenarios below are mock examples, not submitted requests. Start with read-only search; never send a live write to test connectivity.

## Initial task ranking

| # | Candidate task | Demand | Value | Safety | Test ease | Paid potential | Total |
| --: | --- | --: | --: | --: | --: | --: | --: |
| 1 | Read public storefront hours or closure notice from outside | 4 | 4 | 5 | 5 | 3 | 21 |
| 2 | Describe visible features of a public venue entrance route | 4 | 5 | 4 | 4 | 4 | 21 |
| 3 | Count a named shelf item with store permission | 4 | 4 | 4 | 4 | 4 | 20 |
| 4 | Read a temporary transit stop notice from a safe public area | 4 | 4 | 5 | 5 | 2 | 20 |
| 5 | Document a public sidewalk detour without entering work zones | 3 | 4 | 5 | 4 | 3 | 19 |
| 6 | Count a public event queue without identifying people | 3 | 3 | 5 | 5 | 3 | 19 |
| 7 | Check public wayfinding signs between curb and venue entrance | 3 | 4 | 5 | 4 | 3 | 19 |
| 8 | Read posted hours at a public facility | 3 | 4 | 5 | 5 | 2 | 19 |
| 9 | Verify a park amenity from an accessible public path | 3 | 3 | 5 | 5 | 2 | 18 |
| 10 | Observe public EV charger occupancy without capturing plates | 3 | 3 | 5 | 4 | 3 | 18 |
| 11 | Read a bus-stop display for a posted route change | 3 | 4 | 5 | 4 | 2 | 18 |
| 12 | Check if a public recycling point is open and accessible | 3 | 3 | 5 | 4 | 3 | 18 |
| 13 | Read a temporary service notice at a public library | 3 | 3 | 5 | 4 | 2 | 17 |
| 14 | With venue permission, report a public kiosk outage notice | 3 | 3 | 4 | 4 | 3 | 17 |
| 15 | With vendor permission, check if a listed menu item is displayed | 3 | 3 | 4 | 4 | 3 | 17 |
| 16 | Observe a public curb ramp blockage; report facts, not compliance | 3 | 4 | 4 | 3 | 3 | 17 |
| 17 | Locate a posted public-event entrance sign from outside | 3 | 3 | 5 | 4 | 2 | 17 |
| 18 | Photograph a public asset maintenance notice without people/data | 2 | 3 | 5 | 4 | 2 | 16 |
| 19 | Count open bike-share docks from a station display | 2 | 3 | 5 | 4 | 2 | 16 |
| 20 | With permission, confirm a public market stall is operating | 2 | 3 | 4 | 4 | 2 | 15 |

Tasks 1-3 are the strongest first demos because deliverables and boundaries are clear. All require appropriate access, worker consent, and operator review before a real request.

## Reusable agent flow

1. Explain why the requested current local observation cannot be established from available software sources; ask the user before searching.
2. With user approval, call `meku_search_humans` with a broad or relevant filter. Results are aggregate only.
3. The user reviews exact task, scope, location, deliverable, timing, and any proposed compensation through MEKU's current process.
4. Only after explicit approval may an agent call `meku_request_human`. That submits a request for operator review; it does not prove a worker accepted.
5. Check status with `meku_get_request_status` using the same key. Approval is not acceptance, completion, or payment.

## Three mock task briefs (not submitted)

All are illustrations. Confirm the live fields in the [MCP reference](mcp-reference.md) before any approved request. Do not treat an example as a dry run.

### 1. Storefront hours

**Agent reason:** the online listing may be stale. First use `meku_search_humans` with `{}`. If the user later approves a request, ask a worker to transcribe an exterior public-facing sign at a user-provided address during a time window. Stay on public property; do not enter or photograph people. The deliverable is text plus observation time.

### 2. Public entrance route

**Agent reason:** the user wants factual observations for trip planning. First use aggregate search. Any separately approved task should describe only visible features from public areas, such as a ramp or automatic door. Do not enter restricted areas, approach visitors, or claim legal accessibility compliance.

### 3. Shelf count with store permission

**Agent reason:** a participating store has authorized a brief count. First use aggregate search. A real request must name the permitted store, item and shelf, count-only deliverable, and time window. Do not photograph customers or staff, move stock, or purchase anything. The worker can decline.

## Starter scope exclusions

Do not request entry into private homes, purchases or cash handling, account access, medical or legal judgments, childcare, hazardous work, contact with vulnerable people, surveillance, or sensitive personal data collection. Independently assess task risks and local rules before suggesting another use.

## Related resources

- [Quickstart](quickstart.md), [client guides](integrations.md), [integration standard](integration-standard.md)
- [Shared read-only diagnostic](../examples/shared/README.md)
- [Security and consent](security-and-consent.md), [first pilot guide](first-pilot.md)
