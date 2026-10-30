"""Deterministic local gate, event history and store-and-forward messages."""
import hashlib
import json
import os
import sqlite3
import uuid
from pathlib import Path
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives import serialization


def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def digest(obj):
    return hashlib.sha256(canonical(obj).encode()).hexdigest()


class Rejected(ValueError):
    pass


UNITS = {"water": "L", "oxygen": "kg", "food": "kg", "energy": "kWh", "battery": "kWh",
         "equipment": "count", "human_work": "h", "robot_work": "h"}
INITIAL = {"water": 100, "oxygen": 80, "food": 60, "energy": 50, "battery": 30,
           "equipment": 10, "human_work": 20, "robot_work": 20}
RESERVE = {"water": 20, "oxygen": 20, "food": 10, "energy": 10, "battery": 5,
           "equipment": 1, "human_work": 0, "robot_work": 0}
SENSOR_UNITS = {"water-flow": "L", "filter-repair": "count", "solar-output": "kWh"}
ROLES = {"crew-operator", "engineer", "researcher", "safety-officer", "independent-verifier"}


class Settlement:
    def __init__(self, path, name, allow_shared_thread=False):
        self.path, self.name = str(path), name
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        # The web controller serializes all access with one lock when shared across HTTP threads.
        self.db = sqlite3.connect(self.path, check_same_thread=not allow_shared_thread)
        os.chmod(self.path, 0o600)  # Private keys are stored locally in this prototype database.
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA busy_timeout=5000")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL, prev TEXT NOT NULL, hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS stock(kind TEXT PRIMARY KEY, qty REAL NOT NULL CHECK(qty>=0));
        CREATE TABLE IF NOT EXISTS deductions(key TEXT PRIMARY KEY, kind TEXT, qty REAL);
        CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, kind TEXT, qty REAL);
        CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY, topic TEXT, status TEXT, body TEXT);
        CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, action TEXT, status TEXT, role TEXT, high_risk INTEGER, evidence TEXT, reason TEXT);
        CREATE TABLE IF NOT EXISTS approvals(task TEXT, role TEXT, actor TEXT, decision TEXT, PRIMARY KEY(task,role));
        CREATE TABLE IF NOT EXISTS packages(id TEXT PRIMARY KEY, body TEXT, status TEXT);
        CREATE TABLE IF NOT EXISTS inbox(id TEXT PRIMARY KEY, sender TEXT, seq INTEGER, body TEXT);
        CREATE TABLE IF NOT EXISTS peer_seq(sender TEXT PRIMARY KEY, seq INTEGER);
        CREATE TABLE IF NOT EXISTS identity(name TEXT PRIMARY KEY, private_key BLOB NOT NULL, public_key BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS trusted_peers(name TEXT PRIMARY KEY, public_key BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, seq INTEGER UNIQUE NOT NULL, due INTEGER NOT NULL,
            envelope TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS clock_state(name TEXT PRIMARY KEY, step INTEGER NOT NULL);
        """)
        if "envelope" not in {r["name"] for r in self.db.execute("PRAGMA table_info(inbox)")}:
            self.db.execute("ALTER TABLE inbox ADD COLUMN envelope TEXT")
        self.db.execute("CREATE UNIQUE INDEX IF NOT EXISTS inbox_sender_seq ON inbox(sender,seq)")
        with self.db:
            bound_names = {r[0] for r in self.db.execute("SELECT name FROM identity")}
            if bound_names and bound_names != {self.name}:
                raise Rejected("database belongs to a different settlement")
            for k, v in INITIAL.items():
                self.db.execute("INSERT OR IGNORE INTO stock VALUES (?,?)", (k, v))
            self.db.execute("INSERT OR IGNORE INTO clock_state VALUES ('network',0)")
            if not self.db.execute("SELECT 1 FROM identity WHERE name=?", (self.name,)).fetchone():
                key = Ed25519PrivateKey.generate()
                private = key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw,
                                            serialization.NoEncryption())
                public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
                self.db.execute("INSERT INTO identity VALUES (?,?,?)", (self.name, private, public))

    def public_key(self):
        return self.db.execute("SELECT public_key FROM identity WHERE name=?", (self.name,)).fetchone()[0]

    def register_peer(self, name, public_key):
        """Explicit, local trust setup. Caller must verify key by an outside channel."""
        if name == self.name or not isinstance(public_key, bytes) or len(public_key) != 32:
            raise Rejected("invalid peer key")
        with self.db:
            old = self.db.execute("SELECT public_key FROM trusted_peers WHERE name=?", (name,)).fetchone()
            if old and old[0] != public_key:
                raise Rejected("peer key changed; manual review required")
            self.db.execute("INSERT OR IGNORE INTO trusted_peers VALUES (?,?)", (name, public_key))
            if not old:
                self.record("peer-registered", {"name": name, "fingerprint": hashlib.sha256(public_key).hexdigest()})

    def _sign(self, data):
        raw = self.db.execute("SELECT private_key FROM identity WHERE name=?", (self.name,)).fetchone()[0]
        return Ed25519PrivateKey.from_private_bytes(raw).sign(canonical(data).encode()).hex()

    def _verify(self, sender, data, signature):
        row = self.db.execute("SELECT public_key FROM trusted_peers WHERE name=?", (sender,)).fetchone()
        if not row:
            raise Rejected("unknown sender")
        try:
            Ed25519PublicKey.from_public_bytes(row[0]).verify(bytes.fromhex(signature), canonical(data).encode())
        except (InvalidSignature, ValueError, TypeError) as exc:
            raise Rejected("invalid signature") from exc

    def sign_package(self, packet):
        if packet.get("origin") != self.name:
            raise Rejected("not package origin")
        unsigned = {k: v for k, v in packet.items() if k != "signature"}
        return {**unsigned, "signature": self._sign(unsigned)}

    def queue_message(self, recipient, payload, due):
        if payload.get("type") == "transfer":
            prepared = self.db.execute("SELECT 1 FROM events WHERE kind='transfer-prepared' AND body=?", (canonical(payload),)).fetchone()
            if not prepared:
                raise Rejected("signed transfer must have a prepared local debit")
        with self.db:
            row = self.db.execute("SELECT MAX(seq) FROM outbox").fetchone()
            seq = (row[0] or 0) + 1
            unsigned = {"id": uuid.uuid4().hex, "from": self.name, "to": recipient, "seq": seq, "payload": payload}
            message = {**unsigned, "signature": self._sign(unsigned)}
            self.db.execute("INSERT INTO outbox VALUES (?,?,?,?,0)", (message["id"], seq, due, canonical(message)))
            self.record("message-queued", {"id": message["id"], "to": recipient, "seq": seq, "due": due})
        return message

    def pending(self):
        return [(r["due"], json.loads(r["envelope"])) for r in self.db.execute(
            "SELECT due,envelope FROM outbox WHERE delivered=0 ORDER BY due,seq")]

    def mark_delivered(self, message_id):
        with self.db:
            if self.db.execute("UPDATE outbox SET delivered=1 WHERE id=? AND delivered=0", (message_id,)).rowcount:
                self.record("message-delivered", {"id": message_id})

    def record(self, kind, body):
        row = self.db.execute("SELECT seq,hash FROM events ORDER BY seq DESC LIMIT 1").fetchone()
        seq, prev = (row["seq"] + 1, row["hash"]) if row else (1, "0" * 64)
        h = digest([seq, kind, body, prev])
        self.db.execute("INSERT INTO events VALUES (?,?,?,?,?)", (seq, kind, canonical(body), prev, h))
        return seq

    def events(self):
        return [dict(r) for r in self.db.execute("SELECT * FROM events ORDER BY seq")]

    def verify_log(self):
        prev = "0" * 64
        for row in self.events():
            if row["prev"] != prev or row["hash"] != digest([row["seq"], row["kind"], json.loads(row["body"]), prev]):
                return False
            prev = row["hash"]
        return True

    def resources(self):
        return {r["kind"]: r["qty"] for r in self.db.execute("SELECT * FROM stock")}

    def allocate(self, key, kind, qty, unit, task):
        if kind not in UNITS or unit != UNITS[kind] or not isinstance(qty, (int, float)) or not 0 < qty < 1e9:
            raise Rejected("invalid quantity or unit")
        with self.db:
            old = self.db.execute("SELECT kind,qty FROM deductions WHERE key=?", (key,)).fetchone()
            if old:
                if old["kind"] != kind or old["qty"] != qty:
                    raise Rejected("idempotency key reused with changed request")
                return False
            if not task or self.db.execute("SELECT status FROM tasks WHERE id=?", (task,)).fetchone()["status"] != "approved":
                raise Rejected("action needs approved task")
            if self.db.execute("UPDATE stock SET qty=qty-? WHERE kind=? AND qty-?>=?", (qty, kind, qty, RESERVE[kind])).rowcount != 1:
                raise Rejected("critical reserve or stock shortage")
            self.db.execute("INSERT INTO deductions VALUES (?,?,?)", (key, kind, qty))
            self.record("allocation", {"key": key, "kind": kind, "qty": qty, "unit": unit, "task": task})
        return True

    def allocation_options(self, kind, requests):
        """Read-only choices for a human; no automatic priority assignment."""
        if kind not in UNITS or any(not isinstance(q, (int, float)) or q <= 0 for q in requests.values()):
            raise Rejected("invalid competing requests")
        available = self.resources()[kind] - RESERVE[kind]
        return {"kind": kind, "unit": UNITS[kind], "available_above_reserve": available,
                "requested": dict(requests), "all_fit": sum(requests.values()) <= available,
                "shortfall": max(0, sum(requests.values()) - available),
                "human_decision_required": True}

    def inject_resource_loss(self, kind):
        """Simulated external incident, not an approved allocation or real action."""
        if kind not in UNITS:
            raise Rejected("unknown resource")
        with self.db:
            before = self.db.execute("SELECT qty FROM stock WHERE kind=?", (kind,)).fetchone()[0]
            after = min(before, RESERVE[kind])
            self.db.execute("UPDATE stock SET qty=? WHERE kind=?", (after, kind))
            self.record("simulated-shortage", {"kind": kind, "unit": UNITS[kind], "before": before,
                                               "after": after, "lost": before - after, "simulated": True})
        return {"before": before, "after": after, "lost": before - after}

    def prepare_transfer(self, transfer_id, recipient, kind, qty, task):
        if not recipient or recipient == self.name or not transfer_id:
            raise Rejected("invalid transfer")
        approved_task = self.db.execute("SELECT * FROM tasks WHERE id=? AND status='approved'", (task,)).fetchone()
        if not approved_task:
            raise Rejected("human authorization required")
        decisions = [dict(r) for r in self.db.execute("SELECT role,actor,decision FROM approvals WHERE task=?", (task,))]
        required = {approved_task["role"]} | ({"safety-officer"} if approved_task["high_risk"] else set())
        if not required <= {r["role"] for r in decisions if r["decision"] == "approve"}:
            raise Rejected("required human decisions missing")
        changed = self.allocate("transfer:" + transfer_id, kind, qty, UNITS.get(kind), task)
        if not changed:
            raise Rejected("transfer already prepared")
        payload = {"type": "transfer", "transfer_id": transfer_id, "origin": self.name,
                   "recipient": recipient, "kind": kind, "qty": qty, "unit": UNITS[kind], "simulated": True,
                   "authorization": {"task": task, "role": approved_task["role"], "high_risk": bool(approved_task["high_risk"]),
                                     "evidence": json.loads(approved_task["evidence"]), "decisions": decisions}}
        with self.db:
            self.record("transfer-prepared", payload)
        return payload

    def observe(self, topic, value, unit, source, step=0, status="observed", supports=(), conflicts=(), uncertainty=None):
        if topic not in SENSOR_UNITS or unit != SENSOR_UNITS[topic] or not isinstance(value, (int, float)):
            raise Rejected("invalid measurement or unit")
        if status not in {"observed", "human-reported", "AI-predicted"}:
            raise Rejected("invalid raw evidence status")
        body = {"simulated": True, "source": source, "timestamp_step": step, "location": self.name,
                "value": value, "unit": unit, "supports": list(supports), "conflicts": list(conflicts),
                "uncertainty": uncertainty, "verification_method": None}
        eid = uuid.uuid4().hex
        with self.db:
            self.db.execute("INSERT INTO evidence VALUES (?,?,?,?)", (eid, topic, status, canonical(body)))
            self.record("evidence", {"id": eid, "topic": topic, "status": status, **body})
            peers = self.evidence(topic)
            if len(peers) > 1 and any(p["body"]["value"] != value for p in peers if p["id"] != eid):
                self.record("conflict", {"topic": topic, "evidence": [p["id"] for p in peers]})
                self.db.execute("UPDATE evidence SET status='disputed' WHERE topic=? AND status='observed'", (topic,))
        return eid

    def evidence(self, topic=None):
        query = "SELECT * FROM evidence" + (" WHERE topic=?" if topic else "")
        return [{**dict(r), "body": json.loads(r["body"])} for r in self.db.execute(query, (topic,) if topic else ())]

    def verify(self, eid, role, method):
        if role != "independent-verifier" or not method:
            raise Rejected("independent verifier and method required")
        with self.db:
            if self.db.execute("UPDATE evidence SET status='independently-verified' WHERE id=? AND status IN ('observed','disputed','human-reported')", (eid,)).rowcount != 1:
                raise Rejected("missing or unsuitable evidence")
            self.record("verification", {"evidence": eid, "method": method, "role": role})

    def invalidate(self, eid, role, reason):
        if role != "independent-verifier" or not reason:
            raise Rejected("verifier and reason required")
        with self.db:
            if self.db.execute("UPDATE evidence SET status='invalidated' WHERE id=?", (eid,)).rowcount != 1:
                raise Rejected("missing evidence")
            self.record("invalidation", {"evidence": eid, "reason": reason})

    def suggest(self, text, evidence_ids):
        with self.db:
            self.record("ai-suggestion", {"text": text, "evidence": evidence_ids, "authority": "none"})

    def propose(self, action, evidence_ids, role, high_risk=False, reason="rule-based recommendation"):
        if role not in {"engineer", "crew-operator", "researcher"} or not evidence_ids:
            raise Rejected("responsible role and evidence required")
        rows = [self.db.execute("SELECT status FROM evidence WHERE id=?", (eid,)).fetchone() for eid in evidence_ids]
        if any(r is None or r["status"] in ("AI-predicted", "invalidated") for r in rows):
            raise Rejected("unverified or absent evidence")
        tid = uuid.uuid4().hex
        with self.db:
            self.db.execute("INSERT INTO tasks VALUES (?,?,?,?,?,?,?)", (tid, action, "pending", role, int(high_risk), canonical(evidence_ids), reason))
            self.record("proposal", {"task": tid, "action": action, "evidence": evidence_ids, "role": role, "high_risk": high_risk, "reason": reason})
        return tid

    def approve(self, tid, role, actor, decision="approve"):
        if role not in ROLES or not actor or decision not in ("approve", "refuse"):
            raise Rejected("invalid human decision")
        with self.db:
            task = self.db.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
            if not task or task["status"] not in ("pending", "approved") or role not in (task["role"], "safety-officer"):
                raise Rejected("unauthorized or terminal task")
            if self.db.execute("SELECT 1 FROM approvals WHERE task=? AND role=?", (tid, role)).fetchone():
                raise Rejected("decision already recorded")
            self.db.execute("INSERT INTO approvals VALUES (?,?,?,?)", (tid, role, actor, decision))
            if decision == "refuse":
                status = "refused"
            else:
                approved = {r["role"] for r in self.db.execute("SELECT role FROM approvals WHERE task=? AND decision='approve'", (tid,))}
                status = "approved" if {task["role"]} | ({"safety-officer"} if task["high_risk"] else set()) <= approved else "pending"
            self.db.execute("UPDATE tasks SET status=? WHERE id=?", (status, tid))
            self.record("human-decision", {"task": tid, "role": role, "actor": actor, "decision": decision, "status": status})

    def cancel(self, tid, role, actor):
        with self.db:
            task = self.db.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
            if not task or role not in (task["role"], "safety-officer") or task["status"] not in ("pending", "approved"):
                raise Rejected("cannot cancel")
            self.db.execute("UPDATE tasks SET status='cancelled' WHERE id=?", (tid,))
            self.record("cancellation", {"task": tid, "role": role, "actor": actor})

    def act(self, tid, action, qty, resource, outcome):
        task = self.db.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
        if not task or task["status"] != "approved" or not outcome:
            raise Rejected("approval and recorded outcome required")
        if action not in {"inspection", "reserve battery", "filter repair", "measure again"}:
            raise Rejected("action outside simulated allowlist")
        with self.db:
            changed = self.allocate("task:" + tid, resource, qty, UNITS.get(resource), tid)
            if not changed:
                raise Rejected("action already performed")
            self.db.execute("UPDATE tasks SET status='completed' WHERE id=?", (tid,))
            self.record("outcome", {"task": tid, "action": action, "simulated": True, "outcome": outcome})
        return True

    def receive(self, message):
        if not isinstance(message, dict) or set(message) != {"id", "from", "to", "seq", "payload", "signature"}:
            raise Rejected("invalid message envelope")
        if message["to"] != self.name or not isinstance(message["id"], str) or not isinstance(message["seq"], int) or message["seq"] < 1 or not isinstance(message["payload"], dict):
            raise Rejected("wrong recipient")
        sender, seq = message["from"], message["seq"]
        self._verify(sender, {k: v for k, v in message.items() if k != "signature"}, message["signature"])
        with self.db:
            prior = self.db.execute("SELECT envelope FROM inbox WHERE id=? OR (sender=? AND seq=?)", (message["id"], sender, seq)).fetchone()
            if prior:
                if prior["envelope"] != canonical(message):
                    raise Rejected("message ID or sequence replayed with changed content")
                return False
            latest = self.db.execute("SELECT seq FROM peer_seq WHERE sender=?", (sender,)).fetchone()
            if latest and seq <= latest["seq"]:
                self.record("stale-message", {"id": message["id"], "sender": sender, "seq": seq})
            else:
                self.db.execute("INSERT INTO peer_seq VALUES (?,?) ON CONFLICT(sender) DO UPDATE SET seq=excluded.seq", (sender, seq))
            self.db.execute("INSERT INTO inbox (id,sender,seq,body,envelope) VALUES (?,?,?,?,?)",
                            (message["id"], sender, seq, canonical(message["payload"]), canonical(message)))
            self.record("message-received", {"id": message["id"], "sender": sender, "seq": seq})
            if message["payload"].get("type") == "knowledge":
                pkt = message["payload"]
                unsigned = {k: v for k, v in pkt.items() if k != "signature"}
                try:
                    self._verify(sender, unsigned, pkt.get("signature"))
                    valid_signature = True
                except Rejected:
                    valid_signature = False
                if not valid_signature or pkt.get("origin") != sender or pkt.get("hash") != digest(pkt.get("content")) or pkt.get("id") != digest([pkt.get("origin"), pkt.get("version"), pkt.get("hash")]):
                    self.record("package-invalid", {"id": message["id"]})
                    return True
                self.db.execute("INSERT OR IGNORE INTO packages VALUES (?,?,'quarantined')", (pkt["id"], canonical(pkt)))
            elif message["payload"].get("type") == "transfer":
                p = message["payload"]
                kind, qty = p.get("kind"), p.get("qty")
                auth = p.get("authorization")
                valid_auth = isinstance(auth, dict) and isinstance(auth.get("evidence"), list) and bool(auth["evidence"]) and auth.get("role") in ROLES and bool(auth.get("task"))
                if valid_auth:
                    required = {auth["role"]} | ({"safety-officer"} if auth.get("high_risk") else set())
                    valid_auth = required <= {d.get("role") for d in auth.get("decisions", []) if isinstance(d, dict) and d.get("decision") == "approve" and d.get("actor")}
                if not valid_auth or p.get("origin") != sender or p.get("recipient") != self.name or kind not in UNITS or p.get("unit") != UNITS[kind] or not isinstance(qty, (int, float)) or not 0 < qty < 1e9 or not p.get("simulated") or not p.get("transfer_id"):
                    self.record("transfer-invalid", {"message": message["id"]})
                elif self.db.execute("INSERT OR IGNORE INTO receipts VALUES (?,?,?)", (p["transfer_id"], kind, qty)).rowcount:
                    self.db.execute("UPDATE stock SET qty=qty+? WHERE kind=?", (qty, kind))
                    self.record("transfer-received", {"id": p["transfer_id"], "kind": kind, "qty": qty, "from": sender})
                else:
                    prior_transfer = self.db.execute("SELECT kind,qty FROM receipts WHERE id=?", (p["transfer_id"],)).fetchone()
                    if prior_transfer["kind"] != kind or prior_transfer["qty"] != qty:
                        raise Rejected("transfer replayed with changed content")
                    self.record("transfer-replayed", {"id": p["transfer_id"]})
        return True

    def review_package(self, pid, role, accept):
        if role != "independent-verifier":
            raise Rejected("verifier required")
        with self.db:
            row = self.db.execute("SELECT body,status FROM packages WHERE id=?", (pid,)).fetchone()
            if not row or row["status"] != "quarantined":
                raise Rejected("package absent or reviewed")
            pkt = json.loads(row["body"])
            compatible = pkt["content"].get("format") == 1 and pkt["content"].get("topic") in SENSOR_UNITS and pkt["content"].get("compatibility") == "genesis-v1"
            status = "accepted" if accept and compatible and pkt["content"].get("verification") else "rejected"
            old = self.db.execute("SELECT body FROM packages WHERE status='accepted'").fetchall()
            if status == "accepted" and any(json.loads(r["body"])["content"]["topic"] == pkt["content"]["topic"] and json.loads(r["body"])["content"]["method"] != pkt["content"]["method"] for r in old):
                status = "conflict-review"
            self.db.execute("UPDATE packages SET status=? WHERE id=?", (status, pid))
            self.record("package-review", {"id": pid, "role": role, "status": status, "basis": "simulation-only local review"})
            return status


def package(node, topic, method, version, evidence_ids):
    if not evidence_ids or any(not node.db.execute("SELECT 1 FROM evidence WHERE id=? AND status='independently-verified'", (eid,)).fetchone() for eid in evidence_ids):
        raise Rejected("verified local evidence required")
    content = {"format": 1, "topic": topic, "method": method, "evidence": evidence_ids,
               "verification": "local independent verifier; simulation only", "compatibility": "genesis-v1"}
    h = digest(content)
    return node.sign_package({"type": "knowledge", "origin": node.name, "version": version, "hash": h,
                              "id": digest([node.name, version, h]), "content": content})


class Network:
    def __init__(self, nodes):
        self.nodes = nodes
        # This is an explicit simulator roster, not remote trust discovery.
        for name, node in nodes.items():
            for peer_name, peer in nodes.items():
                if name != peer_name:
                    node.register_peer(peer_name, peer.public_key())
        self.clock = max((n.db.execute("SELECT step FROM clock_state WHERE name='network'").fetchone()[0]
                          for n in nodes.values()), default=0)
        self.sent = 0
        self.offline = set()

    @property
    def queue(self):
        return [item for node in self.nodes.values() for item in node.pending()]

    def send(self, sender, recipient, payload, delay=0):
        if sender not in self.nodes or recipient not in self.nodes or delay < 0:
            raise Rejected("invalid route")
        msg = self.nodes[sender].queue_message(recipient, payload, self.clock + delay)
        self.sent += 1
        return msg

    def tick(self, steps=1, limit=None, interrupt_after_receive=False):
        for _ in range(steps):
            self.clock += 1
            for node in self.nodes.values():
                with node.db:
                    node.db.execute("UPDATE clock_state SET step=? WHERE name='network'", (self.clock,))
            delivered = 0
            for due, msg in self.queue:
                if due <= self.clock and msg["from"] not in self.offline and msg["to"] not in self.offline and (limit is None or delivered < limit):
                    self.nodes[msg["to"]].receive(msg)
                    delivered += 1
                    if interrupt_after_receive:
                        raise InterruptedError("simulated crash between receipt and sender acknowledgement")
                    self.nodes[msg["from"]].mark_delivered(msg["id"])
