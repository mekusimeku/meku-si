# MEKU Pocket — Stage 13 production wallet security design

**DRAFT FOR FOUNDER/SECURITY REVIEW · November 4, 2026 · NO DEPLOYMENT OR REAL KEYS**

## 0. Continuity / hard constraints
- Exact original Pocket v9 source expected: `cdda79046ec97bdcd219fcc2f963a252aeef7ea4`. Not found in connected GitHub, Lovable, or user Library at this checkpoint. DO NOT replace v9 with Library `MEKU Pocket Demo.txt` identified as `0.6.0-chain-link`, older v8, or the separate Lovable website repository.
- Website `mekusimeku/screenshot-magic-5054` main: `a3399d75ddec71fb59e33abf325431bd625ab301`; CORE PR #120 remains untouched. This design does not touch main/public Pocket, the payment system, or production.
- Stages 10–12: throwaway BIP39/Ed25519 browser checks and iPhone-to-Android recovery test **passed**. They do not prove an audited wallet or safe custody of funds.
- Founder chose **Option A**: first-party browser/iPhone web-only self-custody; no mandatory Privy, Phantom, native wallet or external signer. SOL and official MEKU SI Token-2022 only. NEURA never gets wallet signing access.
- Do not enable live signing, fund addresses, merge, deploy, publish, or claim wallet completion without exact source, pinned verified dependencies, independent security review and fresh approval.

## 1. Browser-wallet risk that cannot be wished away
A live website can change the JavaScript it serves. Malicious updates, XSS, build compromise, compromised domain/DNS, extensions and infected devices can steal the recovery phrase or signing key **while unlocked**. Encryption at rest does not solve runtime compromise. Browsers cannot guarantee that old plaintext bytes are erased from memory. Neither an app password, CSP, HTTPS, an audited cryptographic library nor a successful disposable test makes a web-only wallet equivalent to hardware storage.

**Decision proposal:** put real signing, backup, and key operations in a tiny **dedicated first-party wallet origin**, separate by ORIGIN (not just path) from chat, user content, NEURA and analytics. Example `vault.meku.farm` is a PROPOSAL ONLY, not an existing or deployed site. `pocket.meku.farm` would show wallet controls and send a narrowly defined request to the vault; vault must independently decode and display the exact transaction and require a direct tap. Never send phrase/key bytes to Pocket/NEURA/server. The vault must not embed third-party scripts, trackers, chat content or rich HTML. The exact origin arrangement needs founder approval and a security review before implementation.

## 2. Recovery and local key storage proposed defaults
1. **Create locally:** audited BIP39 English 12-word generation with secure device randomness. BIP39 passphrase is intentionally **empty in v1**; using extra optional BIP39 passphrases later requires a migration plan and explicit UI. Reuse exact Solana hardened path `m/44'/501'/0'/0'`, check known public vectors, and verify imported-wallet interoperability independently.
2. **Paper backup first:** show words once in a private view, require a random-word confirmation. State clearly that app password alone does not restore a lost device. No telemetry, cloud sync, logs, clipboard, screenshots or external API call containing the phrase.
3. **Encrypt at rest only:** a per-wallet random salt, memory-hard password KDF such as properly reviewed Argon2id (suitable for iPhone performance), and AES-256-GCM with a unique random IV and authenticated metadata. WebCrypto PBKDF2 fallback is NOT approved without a separate reviewed threat tradeoff. Stored data includes encrypted seed/secret, public address, version, derivation path, KDF parameters and an authenticated checksum/binding. Never store plaintext keys.
4. **Unlock narrowly:** a user-entered local password unlocks the encrypted wallet; no secret shares with the server. Signer remains locked except while user is actively reviewing and approving ONE transfer; close/reload/visibility change and short idle lock should remove usable JS references best effort. Do not promise secure memory wiping or offline password retry limits that software cannot enforce.
5. **Restore:** new physical device imports only user-held words, recreates exact address at explicit path, establishes its own local encryption password, and requires new-device checks. Do not depend on the old phone, browser IndexedDB, Pocket login or server storage. The original Stage 12 disposable phrase shown in chat is PUBLIC and permanently unsafe to fund.
6. **Failure recovery:** a lost device without a valid phrase may mean funds cannot be recovered. Avoid misleading safety claims. A compromised phrase means funds are at risk even if the app is locked or stopped.

## 3. Human-only signing: exact flow
1. From the trusted owner session, user manually starts SEND. NEURA / agent text is never an authority. The review page displays wallet address, mainnet-beta, asset, full recipient address, amount in exact integer base units and human-readable form, and estimated/maximum fees.
2. For SOL, accept only the independently reviewed System Program transfer shape. For MEKU SI, require exact mint `J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump`, Token-2022 program `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, six decimals and actual on-chain mint owner/extension verification. New extensions, fees, hooks, additional accounts or unsupported programs must **stop the flow** until specifically reviewed; no blind signing.
3. A server-authenticated, owner-bound **durable atomic one-shot journal** must lock the intent against multiple tabs and phones. Client-only IndexedDB is insufficient. STOP must prevent NEW signing permissions; it cannot reverse completed Solana transactions or protect against a stolen phrase.
4. The vault independently decodes *all* transaction instructions, account keys, signer identities, actual fees, recipient and amounts. Any unknown instruction, extra signature, unapproved ATA creation, hook/fee, mismatch, or changed byte content must refuse signing. If the system cannot show an accurate review, refuse.
5. The user taps an explicit **SIGN THIS ONE TRANSFER** control on the vault's own page. No background, silent, AI-triggered, timer-triggered or microphone-triggered signing. Avoid `approve all` or broad spending allowances in v1.
6. The exact signed signature and intent are durably recorded BEFORE the one broadcast attempt. If RPC returns ambiguous status, do NOT sign/resend automatically. Reconcile using finalized chain observations and careful independent providers. A trusted wallet/chain reconciliation review is mandatory before retry.
7. Support explicit Cancel, STOP, unknown result, finality delay, insufficient SOL for fees, wrong address, frozen/delegated token accounts and rejected instruction errors. The UI must distinguish failure to broadcast from a chain failure and from an unverified RPC response.

## 4. Data and permission boundaries
- NEURA can offer opt-in informational guidance only. No mnemonic, decrypted key, vault password, sign method, wallet authority, arbitrary transaction bytes or automatic payment approval.
- Pocket account login, Human Cloud, HYDRA, agents and chat cannot reach the signer merely by sharing a browser origin or injected functions.
- Backend sees minimum public wallet address/amount/status/tx signature for authenticated transactions. It NEVER receives a recovery phrase, signing key or local-encryption password.
- Never fabricate balances: read finalized RPC with exact mint/program, separate stale/unavailable from zero, and verify account ownership and supported Token-2022 extensions. Independent RPC observations are not cryptographic proof.
- Keep full security/audit trail of *public intents, permissions, approvals, STOP and on-chain signatures*, but never log secret material. Allow independent incident evidence to remain intact.

## 5. Build and release acceptance gates
- [ ] Recover exact Pocket v9 code and re-run its original 74 tests before touching the app.
- [ ] Founder reviews dedicated-origin signing design / loss and phishing risks, including web-only tradeoffs.
- [ ] Authenticated npm dependencies fetched into isolated build with **exact versions and integrity-checked lockfile**; tag source verified separately; inspect provenance / published tarballs and dependency chain. No internet registry access in this workspace yet.
- [ ] Independently review BIP39/SLIP-0010/Ed25519 implementation and correct key path, all metadata, fuzz/input cases; no reused Stage 10/11 demonstration code in production.
- [ ] Audit KDF and local encrypted vault on real iPhone Safari, including lock/reload, disabled storage, browser update, malicious UI, lost-phone restore and wrong password.
- [ ] Complete actual server-authenticated wallet journal, STOP, immutable user approval and multi-device races; prior Stage 4 mocked injected verifiers are NOT proof.
- [ ] Verify MEKU SI on-chain Token-2022 mint, fee/hook/extensions, actual transaction builders and signed transaction inspection; block unsupported features.
- [ ] Independent security review including source/build chain, hosted code integrity, XSS/CSP, signer isolation, phishing, clipboard, recovery and unknown RPC outcomes.
- [ ] Founder-approved tiny SOL test then MEKU SI test on actual Mainnet; independently check signed bytes, finalized receipts and matching recipient.
- [ ] Formal founder approval before release/publish/signing. Otherwise LIVE SEND stays OFF.

## 6. Stage 13 status
**DESIGN REVIEW PREPARED, NOT PRODUCTION IMPLEMENTED.** No v9 source; no audited dependencies installed; no secure live vault; no mainnet send; no domain deployed; no production security review. This document is not an approval to launch.
