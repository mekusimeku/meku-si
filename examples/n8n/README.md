# n8n MCP setup

Reference steps only; the n8n UI and credential options vary by version and hosting mode. This connection has not been tested against MEKU.

1. Add the MCP Client Tool using the current n8n documentation for your version.
2. Set the endpoint to https://meku.farm/api/public/mcp.
3. Configure the Authorization bearer header using n8n credentials or another supported secret store.
4. Verify that the header is sent on every POST, including discovery.
5. Begin with meku_search_humans only.

Do not store a literal key in exported workflow JSON or logs. If your n8n version cannot securely attach the header, stop rather than bypass authentication. Keep the write tool behind explicit human approval.

See [n8n docs](https://docs.n8n.io/) and MEKU [AI access docs](https://meku.farm/ai-access).
