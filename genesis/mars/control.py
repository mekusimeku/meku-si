"""Local UI controller. All incidents and actions stay inside the simulator."""
import json
import threading
from pathlib import Path
from .core import Network, Rejected, Settlement, RESERVE, SENSOR_UNITS, UNITS, package
from .experiment import benchmark

NAMES = ("ARES", "HESTIA", "PROMETHEUS")
FOCUS = {"ARES": "Water, air & greenhouse", "HESTIA": "Maintenance & robotics",
         "PROMETHEUS": "Power & storage"}
TOPIC = {"ARES": "water-flow", "HESTIA": "filter-repair", "PROMETHEUS": "solar-output"}
TASK = {"ARES": ("inspect-water", "engineer", False), "HESTIA": ("inspect-filter", "engineer", False),
        "PROMETHEUS": ("reserve-power", "engineer", True)}
ACT = {"inspect-water": ("inspection", "human_work", 1),
       "inspect-filter": ("inspection", "human_work", 1),
       "reserve-power": ("reserve battery", "battery", 2)}


class Control:
    def __init__(self, directory):
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.config = self.directory / "control.json"
        self._open()
        if not self.config.exists():
            self.running, self.offline = False, set()
            self._seed()
            self._save()
        else:
            data = json.loads(self.config.read_text())
            self.running, self.offline = bool(data["running"]), set(data["offline"])
            self.net.offline = set(self.offline)

    def _open(self):
        self.nodes = {name: Settlement(self.directory / f"{name}.sqlite", name, allow_shared_thread=True) for name in NAMES}
        self.net = Network(self.nodes)

    def _save(self):
        temp = self.config.with_suffix(".tmp")
        temp.write_text(json.dumps({"running": self.running, "offline": sorted(self.offline)}))
        temp.replace(self.config)

    def _seed(self):
        a, h, p = (self.nodes[n] for n in NAMES)
        a.observe("water-flow", 8, "L", "sim-sensor-A", step=0)
        a.observe("water-flow", 5, "L", "sim-sensor-B", step=0)
        h_obs = h.observe("filter-repair", 1, "count", "sim-robot", step=0)
        h.verify(h_obs, "independent-verifier", "simulated bench check")
        p.observe("solar-output", 20, "kWh", "sim-solar", step=0)
        p.observe("solar-output", 9, "kWh", "sim-backup", step=0)
        for node in (a, p):
            action, role, risk = TASK[node.name]
            node.propose(action, [e["id"] for e in node.evidence(TOPIC[node.name])], role,
                         risk, "conflicting simulated readings require human review")
        self.net.send("HESTIA", "ARES", package(h, "filter-repair", "inspect filter seal", "v1", [h_obs]), delay=3)

    def reset(self):
        with self.lock:
            self.running = False
            for node in self.nodes.values():
                node.db.close()
            for name in NAMES:
                for suffix in (".sqlite", ".sqlite-wal", ".sqlite-shm"):
                    (self.directory / (name + suffix)).unlink(missing_ok=True)
            self.config.unlink(missing_ok=True)
            self.offline = set()
            self._open()
            self._seed()
            self._save()

    def action(self, command, data):
        with self.lock:
            if command == "reset":
                self.reset()
            elif command == "start":
                self.running = True
            elif command == "pause":
                self.running = False
            elif command == "advance":
                self.net.tick()
            elif command == "blackout":
                name = self._name(data)
                if name in self.offline:
                    self.offline.remove(name)
                else:
                    self.offline.add(name)
                self.net.offline = set(self.offline)
            elif command == "sensor_failure":
                name = self._name(data)
                node = self.nodes[name]
                topic = TOPIC[name]
                value = {"ARES": 99, "HESTIA": 0, "PROMETHEUS": 0}[name]
                node.observe(topic, value, SENSOR_UNITS[topic], "injected-simulated-failure", self.net.clock)
                action, role, high = TASK[name]
                node.propose(action, [e["id"] for e in node.evidence(topic)], role, high,
                             "injected sensor failure; values disputed, inspect before acting")
            elif command == "shortage":
                self.nodes[self._name(data)].inject_resource_loss(self._resource(data))
            elif command == "decision":
                node = self.nodes[self._name(data)]
                node.approve(self._text(data, "task"), self._text(data, "role"),
                             "simulated-ui-operator", self._text(data, "decision"))
            elif command == "execute":
                node = self.nodes[self._name(data)]
                tid = self._text(data, "task")
                row = node.db.execute("SELECT action FROM tasks WHERE id=?", (tid,)).fetchone()
                if not row or row["action"] not in ACT:
                    raise Rejected("unknown simulated task")
                action, resource, qty = ACT[row["action"]]
                node.act(tid, action, qty, resource, "simulated operator-triggered action completed")
            elif command == "package_review":
                node = self.nodes[self._name(data)]
                if data.get("decision") not in ("accept", "reject"):
                    raise Rejected("invalid package decision")
                node.review_package(self._text(data, "package"), "independent-verifier",
                                    data.get("decision") == "accept")
            else:
                raise Rejected("unknown command")
            self._save()
            return self.state()

    def _name(self, data):
        name = data.get("settlement")
        if name not in NAMES:
            raise Rejected("unknown settlement")
        return name

    def _resource(self, data):
        resource = data.get("resource")
        if resource not in UNITS:
            raise Rejected("unknown resource")
        return resource

    def _text(self, data, key):
        value = data.get(key)
        if not isinstance(value, str) or not value or len(value) > 128:
            raise Rejected("invalid " + key)
        return value

    def advance_if_running(self):
        with self.lock:
            if self.running:
                self.net.tick()

    def state(self):
        with self.lock:
            settlements = {}
            for name, node in self.nodes.items():
                evidence = node.evidence()
                evidence_by_id = {e["id"]: e for e in evidence}
                tasks = []
                for row in node.db.execute("SELECT * FROM tasks ORDER BY rowid DESC"):
                    ids = json.loads(row["evidence"])
                    approvals = [dict(r) for r in node.db.execute("SELECT role,actor,decision FROM approvals WHERE task=?", (row["id"],))]
                    tasks.append({"id": row["id"], "action": row["action"], "status": row["status"], "role": row["role"],
                                  "high_risk": bool(row["high_risk"]), "reason": row["reason"],
                                  "evidence": [evidence_by_id.get(i, {"id": i, "status": "missing"}) for i in ids],
                                  "approvals": approvals})
                packages = [{**dict(r), "body": json.loads(r["body"])} for r in node.db.execute("SELECT * FROM packages ORDER BY rowid DESC")]
                incoming = [json.loads(r["envelope"]) for r in node.db.execute("SELECT envelope FROM inbox WHERE envelope IS NOT NULL ORDER BY rowid DESC LIMIT 30")]
                outgoing = [{**json.loads(r["envelope"]), "due": r["due"], "delivered": bool(r["delivered"])}
                            for r in node.db.execute("SELECT envelope,due,delivered FROM outbox ORDER BY seq DESC LIMIT 30")]
                resources = node.resources()
                alerts = []
                if name in self.offline:
                    alerts.append("Communication blackout")
                if any(e["status"] == "disputed" for e in evidence):
                    alerts.append("Conflicting sensor evidence")
                alerts += [f"{k.replace('_',' ')} at reserve" for k, qty in resources.items() if qty <= RESERVE[k]]
                settlements[name] = {"name": name, "focus": FOCUS[name], "resources": resources,
                                     "units": UNITS, "alerts": alerts, "tasks": tasks,
                                     "evidence": evidence[::-1], "packages": packages,
                                     "incoming": incoming, "outgoing": outgoing,
                                     "online": name not in self.offline, "events": node.events()[-40:][::-1],
                                     "log_valid": node.verify_log()}
            return {"clock": self.net.clock, "running": self.running, "settlements": settlements,
                    "pending_messages": len(self.net.queue), "simulated": True}


def comparison(seeds=(1, 2, 3, 4, 5)):
    return benchmark(list(seeds))
