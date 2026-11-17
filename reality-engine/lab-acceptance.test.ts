import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { runLabAcceptance } from "./lab-acceptance.ts";

test("isolated MCP acceptance through server handlers", async () => {
  const { checks } = await runLabAcceptance();
  const failed = checks.filter((check) => !check.pass);
  assert.deepEqual(
    failed.map((check) => `${check.name}: ${check.detail}`),
    [],
  );
});

test("sqlite unique receipt constraint rejects a second insert", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("create table receipts (signature text primary key, invoice_id text not null)");
  const insert = db.prepare("insert into receipts (signature, invoice_id) values (?, ?)");
  insert.run("sig_one", "inv_0001");
  assert.throws(() => insert.run("sig_one", "inv_0002"));
  const row = db.prepare("select count(*) as n from receipts").get() as { n: number };
  assert.equal(row.n, 1);
});
