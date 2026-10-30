# MEKU MARS — Genesis (local simulation)

Three SQLite-backed settlements test evidence, human authority, local resources, and delayed knowledge exchange. Python 3.11+ standard library only. No hardware, network, token, or production integration.

Run from this directory:

```sh
python3 -m unittest discover -s tests -v
python3 -m mars demo --dir /tmp/meku-mars-demo
python3 -m mars benchmark --seeds 1 2 3 4 5
```

`demo` creates three separate databases. Reuse a fresh directory or pass `--dir` to inspect records after the run. `benchmark` prints JSON with per-seed isolated, cooperative, and poisoned-message cases. Each case starts with the same seed and incident schedule; the poisoned case is an explicit additional fault injection. Numbers are simulation steps, not real time. The model uses scripted human approvals for repeatability, not a claim that humans would approve these actions.

Evidence statuses: `observed`, `human-reported`, `AI-predicted`, `disputed`, `independently-verified`, `invalidated`. All observations in this prototype are **simulated**. A claim records source, time, location, units, uncertainty, verification method, supporting and conflicting IDs. The append-only event table chains SHA-256 hashes; the database owner can still replace the entire database, so hashes prove neither source identity nor external truth. A knowledge package hash detects accidental or deliberate content changes after export; it is **not a signature**. Package trust depends on an explicit local verifier role and local evidence. Remote content is quarantined even if its hash matches.

Roles are simulated identities passed to CLI/library calls; there is no authentication. Approval is a state transition guarded by a role and a required second safety-officer approval for high risk. It must not control real equipment. Each settlement stores its own events, resource balances, inbox, tasks, and knowledge. No live MEKU integration exists. Future adapters should map a human identity provider to `approve`, a read-only model to `suggest`, and external records to evidence with independent checks; keep the deterministic gate local.

The comparison is a small fixed scenario, not a scientific finding about Mars. It shows when a verified repair can save inspections, when no relevant knowledge does nothing, and when bad but plausible data costs time. Next: add authenticated node identities and independently checked package provenance before any wider pilot.
