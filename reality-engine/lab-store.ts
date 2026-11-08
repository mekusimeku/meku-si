import { DatabaseSync } from "node:sqlite";
import type { EngineSnapshot } from "./engine.ts";

export type LabDisk = {
  snapshot: EngineSnapshot;
  clock: number;
  agents: {
    token: string;
    agentId: string;
    orgId: string;
    readOnly: boolean;
    revoked: boolean;
    keyId: string | null;
  }[];
  humans: { token: string; ref: string; role: "worker" | "reviewer" | "operator" }[];
};

export function openLabStore(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`
    create table if not exists lab_state (
      id integer primary key check (id = 1),
      body text not null
    );
    create table if not exists lab_receipts (
      signature text primary key,
      invoice_id text not null,
      agent_id text not null
    );
  `);
  const readState = db.prepare("select body from lab_state where id = 1");
  const writeState = db.prepare(
    "insert into lab_state (id, body) values (1, ?) on conflict(id) do update set body = excluded.body",
  );
  const claim = db.prepare("insert into lab_receipts (signature, invoice_id, agent_id) values (?, ?, ?)");
  return {
    load(): LabDisk | null {
      const row = readState.get() as { body: string } | undefined;
      if (!row) return null;
      return JSON.parse(row.body) as LabDisk;
    },
    save(disk: LabDisk) {
      db.exec("begin");
      try {
        writeState.run(JSON.stringify(disk));
        db.exec("commit");
      } catch (error) {
        db.exec("rollback");
        throw error;
      }
    },
    claimReceipt(signature: string, invoiceId: string, agentId: string) {
      try {
        claim.run(signature, invoiceId, agentId);
        return true;
      } catch {
        return false;
      }
    },
  };
}
