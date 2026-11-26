# MEKU Pocket Stage 18 — published cryptography artifact gate (TEST ONLY)

This follows the verified Stage 17 fixture identity-to-PostgreSQL gate without changing it. The exact Pocket v9 app source is still missing. This isolated work advances a different **release blocker**: actual published npm package bytes were not previously checked.

Run local policy tests (no network):

```bash
node --test pocket-browser-test/stage18-crypto-artifacts/test-policy.mjs
```

GitHub CI with registry access also runs:

```bash
node pocket-browser-test/stage18-crypto-artifacts/verify-published.mjs pocket-browser-test/stage18-crypto-artifacts/artifact-report
```

The CI-only script downloads the exact npm-published tarballs for `@scure/bip39@2.4.0`, `@noble/curves@2.4.0`, `@noble/hashes@2.4.0` without running package install scripts, checks each downloaded byte stream against published SHA512/SRI metadata, reads the actual package.json inside each tarball without extracting untrusted paths, checks exact package identity and runtime dependencies, rejects lifecycle install scripts, and checks that a freshly resolved npm v3 lockfile contains only the three expected runtime artifacts with exact hashes. Successful CI uploads the generated lockfile and non-secret JSON evidence as run artifacts for later independent review. A SHA512 matching npm metadata is not an independent source audit, and metadata from the same registry is not an independent trust anchor.

The script fails closed if the registry is unreachable, metadata differs, the package manifest changes, an unexpected transitive dependency appears, or any SHA512 disagrees. The three candidates were identified in Stage 13 from source tags, **not from published npm tarballs**. This stage does not sign, hold, authorize, send, or receive funds, and does not run on the public Pocket site. Do not merge or deploy as production wallet code.

Still required: audit exact published JS files and provenance, review and commit a frozen integrity lockfile under a separate approval, verify package behavior against independent BIP39/SLIP-0010/Ed25519 vectors, restore v9 source, decide actual Pocket auth, build and review a secure vault and signer, test token extensions and Solana finality, and pass independent security review plus explicit founder approval for any live transfer. Never give NEURA signing authority.
