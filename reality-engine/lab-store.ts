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
  const readReceipt = db.prepare("select signature from lab_receipts where signature = ?");
  let failWrites = 0;
  let crashBeforeCommit = 0;
  return {
    load(): LabDisk | null {
      const row = readState.get() as { body: string } | undefined;
      if (!row) return null;
      return JSON.parse(row.body) as LabDisk;
    },
    failNextSave() {
      failWrites += 1;
    },
    crashNextCommit() {
      crashBeforeCommit += 1;
    },
    hasReceipt(signature: string) {
      return Boolean(readReceipt.get(signature));
    },
    /**
     * Receipt insert and subscription snapshot commit together.
     * A unique signature rolls both back. A crash before commit leaves neither.
     */
    save(disk: LabDisk, receipt?: { signature: string; invoiceId: string; agentId: string } | null) {
      if (failWrites > 0) {
        failWrites -= 1;
        throw new Error("DISK_WRITE_FAILED");
      }
      db.exec("begin immediate");
      try {
        if (receipt) claim.run(receipt.signature, receipt.invoiceId, receipt.agentId);
        if (crashBeforeCommit > 0) {
          crashBeforeCommit -= 1;
          throw new Error("CRASH_BEFORE_COMMIT");
        }
        writeState.run(JSON.stringify(disk));
        db.exec("commit");
        return "ok" as const;
      } catch (error) {
        try {
          db.exec("rollback");
        } catch {
          /* already rolled back */
        }
        if (/unique/i.test(String(error))) return "replay" as const;
        throw error;
      }
    },
  };
}
