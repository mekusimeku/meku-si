# MEKU Human Cloud — official MCP Registry record

MEKU Human Cloud is already indexed as `farm.meku/human-cloud` (version `1.0.0`) by third-party directories that ingest the Official MCP Registry. These are **existing-listing references**, not evidence of a new publication from this branch:

- https://whobuildsagents.com/meku.farm
- https://protocolprobe.com/mcp/servers/topic/other/1

The canonical remote endpoint is `https://meku.farm/api/public/mcp`. The checked-in [server.json](server.json) records the known server name and a safe, human-readable remote configuration for maintainers. It is **not proof** that this exact local JSON matches the current published record, nor proof that a publisher login or live update has run.

## Do not create another listing

Do **not** publish a second server under `io.github.mekusimeku/*` just to repeat the existing `farm.meku/human-cloud` record. Do **not** re-publish version `1.0.0` without first checking the actual Registry response and publication history.

For read-only confirmation, query the Official Registry:

```sh
curl --fail-with-body --silent --show-error \
  'https://registry.modelcontextprotocol.io/v0.1/servers?search=farm.meku'
```

Compare its name, latest version, remote URL, status, and authentication details with [server.json](server.json) before making a new release. If the record differs, reconcile it rather than overwriting blindly. The Registry is currently in preview, so external index entries can be stale.

## Validation and publishing controls

The Registry accepts remote Streamable HTTP servers in a `remotes` array; no npm package is required. This manifest deliberately contains no API tokens, DNS private key, credential, wallet secret, or server-side authentication logic.

```sh
# Validate locally; never assume a successful publication from validation alone.
mcp-publisher validate registry/server.json
```

If a **new version** is justified, first validate against the current official schema and test the deployed endpoint in an approved, read-only manner. Then use the existing `farm.meku` domain-based publisher identity (not a new GitHub namespace), with a properly authorized owner and a new version number. The site has a public domain-verification route at `/.well-known/mcp-registry-auth`; that publicly served verification key is not a publisher's private signing key. Never commit its matching private key.

The registry publication action is external to GitHub: committing or merging this manifest **does not publish or update** the Registry. We have not added a GitHub Actions publishing workflow: runner failures and ownership/secret handling need to be resolved before introducing automated release credentials.

Official references:

- https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx
- https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/remote-servers.mdx
- https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx

## Safe connection notes

The server implementation in the website source currently allows limited public metadata discovery (`initialize` and `tools/list` for the read-only search tool) without a key. **All tool calls**, including `meku_search_humans`, require a valid operator-issued MEKU Agent API key. Normal authorized keys can also submit review requests and check their own request status; read-only keys cannot submit. Consult https://meku.farm/docs and https://meku.farm/ai-access for the deployed contract.

Do not make a write call just to test connectivity: `meku_request_human` creates a real request for operator review. A request is not a paid mission, human acceptance, completed work, or a payment. Never disclose keys or personal worker information in Registry metadata or issue reports.

## Verification boundaries — 11 November 2026

- Existing Registry listing: corroborated by external indexes; direct Official Registry API response **not independently confirmed** in this change.
- Public endpoint compatibility: source-inspected; no new live, credentialed client test made.
- Local file: checked for basic schema fields, name format, description length, and Streamable HTTP transport shape; **not validated using the official `mcp-publisher` CLI** in this change.
- Deployment / Registry update: **none**.
