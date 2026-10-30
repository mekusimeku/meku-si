# MEKU MARS — Genesis (local simulation)

Three SQLite-backed settlements test evidence, human authority, local resources, and delayed knowledge exchange. Python 3.11+ and the free `cryptography` library. No hardware, external network, token, or production integration.

Run from this directory:

```sh
python3 -m pip install -r requirements.txt
python3 -m unittest discover -s tests -v
python3 -m mars demo --dir /tmp/meku-mars-demo
python3 -m mars benchmark --seeds 1 2 3 4 5
```

`demo` creates three separate databases. Reuse a fresh directory or pass `--dir` to inspect records after the run. `benchmark` prints JSON with per-seed isolated, cooperative, and poisoned-message cases. Each case starts with the same seed and incident schedule; the poisoned case is an explicit additional fault injection. Numbers are simulation steps, not real time. The model uses scripted human approvals for repeatability, not a claim that humans would approve these actions.

Evidence statuses: `observed`, `human-reported`, `AI-predicted`, `disputed`, `independently-verified`, `invalidated`. All observations in this prototype are **simulated**. A claim records source, time, location, units, uncertainty, verification method, supporting and conflicting IDs. The append-only event table chains SHA-256 hashes; the database owner can still replace the entire database, so hashes prove neither source identity nor external truth.

Each settlement generates an Ed25519 key once and saves it in its local SQLite database, with file mode 0600. `Network` is a local simulator that enrolls the three nodes in its supplied roster by registering their public keys; a real system needs an independently checked key enrollment process. Changed keys fail closed. The sending node saves a signed envelope to its outbox before delivery; the recipient verifies the signature against its local registry and commits the envelope and effect in one SQLite transaction. It rejects unknown keys, changed messages, and reused ID/sequence pairs. The sender marks delivery after the recipient commits; if interrupted between those steps, replay is safe. The clock and pending outbox survive process restart. Offline status is a temporary network setting and must be supplied again after restart. Knowledge packages have their own origin signature and content hash, and stay quarantined until a local verifier reviews them.

The key is **not encrypted** in SQLite. An attacker with database access can copy or change it; this is not a secure key store. A valid signature proves control of a registered key, not truth, human approval, or a safe action. The simulator checks a recorded source approval and debit before it sends a transfer, while the recipient checks the approval claim carried by the signed message. That claim is not independent proof of the remote human's identity. External authenticated identity and independent receipt checks are future work.

Roles are simulated identities passed to CLI/library calls; there is no authentication. Approval is a state transition guarded by a role and a required second safety-officer approval for high risk. It must not control real equipment. Each settlement stores its own events, resource balances, inbox, tasks, and knowledge. No live MEKU integration exists. Future adapters should map a human identity provider to `approve`, a read-only model to `suggest`, and external records to evidence with independent checks; keep the deterministic gate local.

The comparison is a small fixed scripted scenario, not a scientific finding about Mars. It shows when a repair note can save inspections, when no relevant knowledge does nothing, and when a signed but bad note costs time. The sender signs the bad note in the fault injection; cryptographic validity does not make it true. Next: independently checked key enrollment and cross-node approval proof before any wider pilot.
