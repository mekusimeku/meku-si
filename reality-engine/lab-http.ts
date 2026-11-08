import http from "node:http";
import type { LabSession } from "./lab-session.ts";

export function startLabServer(port: number, session: LabSession) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ ok: true, environment: "TEST", fundsMoved: false, productionProof: false }));
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const raw = Buffer.concat(chunks);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(", "));
      }
      const request = new Request(`http://127.0.0.1:${port}${req.url ?? "/"}`, {
        method: req.method,
        headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : raw,
      });
      const response = req.url === "/human" ? await session.handleHuman(request) : await session.handleMcp(request);
      const text = await response.text();
      res.writeHead(response.status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(text);
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, code: "SERVER_ERROR" }));
    }
  });
  return new Promise<http.Server>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
