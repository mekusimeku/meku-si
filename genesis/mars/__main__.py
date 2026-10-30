import argparse
import json
from .core import Settlement, Network, package
from .experiment import benchmark


def demo(directory):
    from pathlib import Path
    root = Path(directory)
    root.mkdir(parents=True, exist_ok=True)
    nodes = {name: Settlement(root / f"{name}.sqlite", name) for name in ("ARES", "HESTIA", "PROMETHEUS")}
    a, h, p = (nodes[n] for n in ("ARES", "HESTIA", "PROMETHEUS"))
    a.observe("water-flow", 8, "L", "sensor-1", step=1)
    a.observe("water-flow", 5, "L", "sensor-2", step=1)
    task = a.propose("inspect-water", [e["id"] for e in a.evidence("water-flow")], "engineer")
    a.approve(task, "engineer", "crew-17")
    a.act(task, "inspection", 1, "human_work", outcome="simulated leak inspection completed")
    h.observe("filter-repair", 1, "count", "robot-report", step=1)
    h.verify(h.evidence("filter-repair")[0]["id"], "independent-verifier", "bench simulation only")
    pkt = package(h, "filter-repair", "replace seal; inspect filter", "v1", [h.evidence("filter-repair")[0]["id"]])
    net = Network(nodes)
    net.send("HESTIA", "ARES", pkt, delay=3)
    net.tick(3)
    a.review_package(pkt["id"], "independent-verifier", accept=True)
    p.observe("solar-output", 20, "kWh", "solar-sensor", step=2)
    p.observe("solar-output", 9, "kWh", "backup-sensor", step=2)
    power = p.propose("reserve-power", [e["id"] for e in p.evidence("solar-output")], "engineer", high_risk=True)
    p.approve(power, "engineer", "crew-19")
    p.approve(power, "safety-officer", "crew-20")
    p.act(power, "reserve battery", 2, "battery", outcome="simulated reserve allocation")
    return {n: {"database": str(root / f"{n}.sqlite"), "events": len(s.events()), "resources": s.resources()} for n, s in nodes.items()}


parser = argparse.ArgumentParser()
sub = parser.add_subparsers(dest="command", required=True)
d = sub.add_parser("demo")
d.add_argument("--dir", default="./genesis-demo")
b = sub.add_parser("benchmark")
b.add_argument("--seeds", nargs="+", type=int, default=[1, 2, 3, 4, 5])
args = parser.parse_args()
print(json.dumps(demo(args.dir) if args.command == "demo" else benchmark(args.seeds), indent=2, sort_keys=True))
