# First Contact demo evidence

Current preparation update, 2026-10-24: use the [full search-only verification
procedure](first-contact-verification.md). Historical counts and indexed page
claims below are dated records, not current hosted enforcement evidence. The new
verifier rejects unexpected fields and checks direct/REST denials and lifecycle
failures. No hosted or external integration was performed in this update.

## What this proves

This repository includes a reproducible **local simulation** of an agent preparing a human task, requester approval, operator review, synthetic human selection and consent, work completion, proof submission/review, and a simulated payment result.

It does not prove that MEKU's production MCP service completed any of those actions. The real documented MCP tools are limited to aggregate search, submitting an execution request for operator review, and checking that request's status. The tools do not create missions, receive proof, or make payment.

## Reproduce

Requirements: Node.js 20 or newer. No dependencies or API key are needed for the simulation.

```sh
node --version
node --test examples/human-cloud-simulator/simulate.test.mjs examples/shared/mcp-readonly-smoke.test.mjs
node examples/human-cloud-simulator/simulate.mjs
```

The local verification recorded 13 passing Node tests on Node.js 24.19.0: 8 simulator tests and 5 MCP smoke-check mock tests. The simulator emitted 13 ordered events. The successful mock result was `SIMULATED_SUCCESS_NOT_PAID`; its `actualTransfer` is false and its transaction signature is null. No MCP tool was called by the simulator.

The authenticated smoke-check client now refuses to call any tool unless `tools/list` contains exactly `meku_search_humans`. A regression test confirms it stops before `tools/call` if the server also exposes request-status access. This matters because a read-only key that still exposes `meku_get_request_status` is not search-only. The test covers mock HTTP only; it is not live authentication evidence.

A checked-in example trace is available at [`evidence/first-contact-simulation.json`](../evidence/first-contact-simulation.json). It is simulated output, not an external integration record.

The MCP smoke-check tests use mocked HTTP responses. A direct unauthenticated GET to the documented production MCP endpoint timed out from the verification environment; no authenticated live MCP call was made. This timeout does not establish whether the service is up or down for other clients.

## Public production evidence checked

On 2026-10-23, the public [AI access page](https://meku.farm/ai-access) and [developer documentation](https://meku.farm/docs) were readable through an indexed web retrieval. They state that the MCP endpoint is `https://meku.farm/api/public/mcp`, every JSON-RPC POST requires an operator-issued key, and the three current tools are aggregate search, request submission for operator review, and per-key request status. The pages explicitly say that MCP cannot create missions or make payments.

The same public AI access page says **public checkout and customer refunds are live on Solana Mainnet**, while human payouts remain operator-approved and manually released. This is a confirmed statement on MEKU's published page, not independent confirmation of runtime switches, deployed code, or on-chain behavior. The pages do not document the operator-test payment switch. The exact deployed website commit and effective runtime switches remain unknown: no authenticated deployment metadata or live MCP response was available, and the direct endpoint GET timed out here.

No `.env` file is tracked in this repository (`git ls-files` returned no `.env` paths), so this repository has no tracked environment file to remediate. This check does not cover other MEKU repositories or deployment-secret stores.

## Evidence labels

| Stage                                         | Evidence                                                                                 | Status                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Local workflow                                | Node built-in test runner and deterministic simulator                                    | Verified locally; simulated                                                         |
| MCP client sequence                           | Unit tests for initialize, tool discovery, and search-only call using mock HTTP          | Verified locally; not a live integration                                            |
| Production MCP connection                     | No operator-issued test key; direct unauthenticated GET timed out here                   | Unknown                                                                             |
| Published payment status                      | AI access page says checkout/refunds are live and payouts are manually operator-released | Public claim verified; effective production switches unverified                     |
| Deployed source commit / operator-test switch | No public deployment metadata found in the evidence checked                              | Unknown                                                                             |
| Tracked `.env` credential exposure            | No tracked `.env` path in this repository                                                | No remediation indicated for this repository; other repositories/stores not checked |
| Independent developer integration             | No external developer result supplied or verified                                        | Not verified                                                                        |
| Real request, human work, proof, or payment   | Not attempted                                                                            | Not performed                                                                       |

## Smallest path to the first independent integration

1. An authorized MEKU operator issues one separate test key whose server-side permissions allow only `meku_search_humans` and confirms its expiry or revocation method.
2. One external developer follows [the MCP quickstart](quickstart.md) from a clean client and shares a redacted log showing successful initialization, tool discovery, and search.
3. A maintainer checks that the credential could not invoke `meku_request_human`, then records the client/version and test date. This is a read-only integration only; it is not a mission or payment.

If MEKU cannot enforce search-only access on the server, stop before the live test. Do not replace this gate with a client-side allowlist.
