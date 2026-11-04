# MEKU Pocket Stage 13 — dependency provenance checkpoint

2026-11-04 — **SOURCE MANIFESTS CHECKED; NO NPM PACKAGES INSTALLED; NO SECURITY APPROVAL**

## Directly checked source-tag package manifests

| Package | Requested upstream Git tag | Reported package version | Direct dependency in tagged manifest | Git **blob SHA-1 of package.json** |
| --- | --- | --- | --- | --- |
| `@scure/bip39` | `paulmillr/scure-bip39` tag `2.4.0` | `2.4.0` | `@noble/hashes` **exactly `2.4.0`** | `9084f204d69ffcc58702560047058221140dedf9` |
| `@noble/curves` | `paulmillr/noble-curves` tag `2.4.0` | `2.4.0` | `@noble/hashes` **exactly `2.4.0`** | `5c342e939dea80827b5f3780fa3d66ad4231574f` |
| `@noble/hashes` | `paulmillr/noble-hashes` tag `2.4.0` | `2.4.0` | no direct dependencies reported | `3ac73d10fa0a20d8bfe145fa0433f81ac276928d` |

These are Git **blob IDs for the manifest files only**; they are NOT SHA-256 checks of the full repository, not npm package integrity hashes, not reproducible-build proof and not proof of developer signature verification.

Source URLs:
- https://github.com/paulmillr/scure-bip39/blob/2.4.0/package.json
- https://github.com/paulmillr/noble-curves/blob/2.4.0/package.json
- https://github.com/paulmillr/noble-hashes/blob/2.4.0/package.json
- https://www.npmjs.com/package/@scure/bip39
- https://www.npmjs.com/package/@noble/curves
- https://solana.com/docs/frontend/client

## Security context (do not overstate)
- `@scure/bip39` published information states an independent Cure53 review at 1.0.0 and project self-audit at 2.2.0. **Neither automatically proves version 2.4.0 / MEKU integration is independently reviewed.**
- `@noble/curves` release 2.4.0 includes additional security hardening; published dependency vulnerability listings show no currently known direct issues. That does **not** establish safety of new wallet code or dependency supply chain.
- **SLIP-0010 Ed25519 hardened derivation is not provided by the `@scure/bip39` BIP39 function alone.** Must choose & independently check a correct implementation against the existing disposable Stage 10–12 vectors, and keep exact `m/44'/501'/0'/0'` path. `@scure/bip32` is NOT a drop-in Ed25519 SLIP-0010 solution.
- `@solana/kit` is currently listed at 8.6.0 but moves rapidly. This version is only an option; we have NOT selected, installed or audited a transaction toolchain, especially Token-2022 instructions/fees/hooks.
- The official MEKU SI mint address is `J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump`, program ID `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, expected 6 decimals. **Actual fresh on-chain mint owner/extensions have not been independently read at this checkpoint**; must confirm before send.

## What blocked installation

`curl -I https://registry.npmjs.org/%40scure%2Fbip39` returned `Could not resolve host: registry.npmjs.org` in the current execution container on November 4, 2026. Node 22.16.0 is available but the relevant crypto packages are not present in the local npm cache. Therefore **no npm tarball, published integrity hash, provenance attestation or built dependency tree has been verified**, and no lockfile is claimed. A manually authored lockfile would be misleading. Do not install from an unverified CDN or copy source by hand into the production wallet.

## Next actual package-verification gate

1. Restore registry access in a trusted isolated build environment.
2. Fetch exact tagged versions, verify npm published package tarball digests / provenance and committed lockfile package integrity.
3. Inspect BIP39 module + its `@noble/hashes` dependency, check supported Safari/ESM behavior and published test vectors.
4. Inspect `@noble/curves` Ed25519 APIs and a separate SLIP-0010 hardened derivation implementation, with cross-device and wrong-path tests.
5. Select a reviewed Solana transaction kit for the exact production Pocket v9 source, not by latest-version popularity. Verify official MEKU SI mint extensions.
6. Independent security review and explicit founder sign-off before wallet creation with real keys.

**STATUS: published-source identity VERIFIED for three package manifests; installed/approved dependency chain NOT VERIFIED.**
