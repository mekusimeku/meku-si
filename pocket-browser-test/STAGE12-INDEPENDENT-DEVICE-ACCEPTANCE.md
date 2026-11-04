# MEKU Pocket — Stage 12 independent physical-device recovery

**STATUS: PENDING actual second physical-device test.** Stage 11 showed a successful recovery result in iPhone Safari, but its screenshot did not independently establish a clean reload or a second physical device. Stage 12 is NOT complete.

**REUSE THE UNCHANGED STAGE 11 PAGE.** No new wallet, derivation library, or seed-collection service is needed:

https://raw.githack.com/mekusimeku/meku-si/0b12be7f4f35246223f2f721ef51af65b9265881/pocket-browser-test/iphone-disposable-seed-recovery-stage11.html

Pinned test-only commit: `0b12be7f4f35246223f2f721ef51af65b9265881`. No main branch, production app, payment, or NEURA changes.

## Strict safety rules

- Use **ONLY newly generated disposable words** from this test. Never enter personal wallet words from Phantom, Ledger, Pocket, or anywhere else, **even if the wallet is empty**.
- NEVER send 12 words in chat, screenshots, email, cloud notes, issue comments, or online forms.
- Never fund the disposable test address with any SOL or MEKU SI.
- Write disposable words and public address privately on paper. Do not photograph the words. Destroy paper after verification.
- This test page handles a throwaway private key in JS memory and is **unaudited**. It is not a secure wallet and it cannot guarantee memory clearing.

## Required two-device acceptance (no repeated Stage 11 coding)

1. On physical **device A**, load the pinned HTTPS test page, click **Generate disposable test words**, write down the fresh 12 throwaway words and public test address privately.
2. Close the page on A. Do not use A while testing on device B.
3. On physically **different device B**, open the **same pinned link** and go straight to section 2. **Do not press Generate** on B.
4. Enter only the disposable words made on A and the expected public address from A. Click **Check test-only recovery**.
5. **PASS** requires B's exact message: `PASS — Test phrase restored the same public address with a valid fixed-message signature` and an identical public address.
6. Optional negative check: change a single character in the expected public address and repeat. The result must be FAIL. Keep the disposable words private.
7. Clear the screen, close test tabs, destroy the paper. Report only **PASS/FAIL and two device types**; no phrase or screenshot with words.

**Not equivalent:** two tabs, Safari Private Browsing, a second profile, a Node VM, or a reload on the **same phone**. If no second physical device is available, status stays **BLOCKED**, not PASS.

## Separate source-level safety review

Six static checks of the existing Stage 11 HTML passed locally (see `stage12-safety-review.test.mjs`). Checks cover external scripts, CSP, deliberate network calls, deliberate browser storage calls, test-only warnings and text-only output assignments. **These are basic source checks, NOT a security audit.**

Noted limitations:
- Inline JavaScript is permitted in the *test* page; that is not suitable security for a funded wallet.
- A temporary extractable Ed25519 private key is used for a fixed **nontransaction** signature diagnostic; it must not be ported into production unchanged.
- A third-party hosting origin or a compromised device can still defeat code-based protections.

## Production remains blocked

Exact Pocket v9 source `cdda79046ec97bdcd219fcc2f963a252aeef7ea4` was not found in connected GitHub/Lovable/Library. Do not replace it with v8 or the website code.

The candidate versions `@scure/bip39@2.4.0` and `@noble/curves@2.4.0` have NOT been installed, independently reviewed for MEKU, or locked to verified npm package integrity. Local npm registry check returned `EAI_AGAIN`.

Actual production work still requires source recovery, verified pinned crypto dependencies, secure encrypted key vault, human-approved signing, cross-device spend protections, Token-2022 / SOL live integration, on-chain receipt matching, independent security review and explicit founder approval. **NEURA never receives signing keys or authority.**

Do not claim the live Pocket wallet is finished from disposable testing.
