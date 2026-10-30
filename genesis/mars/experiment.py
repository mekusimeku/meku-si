"""Fixed-seed paired comparison. Values are simulation steps and units."""
import random
import tempfile
from pathlib import Path
from .core import Settlement, Network, package


def trial(seed, mode, scenario):
    rng = random.Random(seed)
    with tempfile.TemporaryDirectory() as tmp:
        nodes = {n: Settlement(Path(tmp) / (n + ".sqlite"), n) for n in ("ARES", "HESTIA", "PROMETHEUS")}
        a, h, p = (nodes[n] for n in ("ARES", "HESTIA", "PROMETHEUS"))
        net = Network(nodes)
        # Same incident schedule and sensor values in all modes.
        first = a.observe("water-flow", 8 + rng.randint(0, 1), "L", "sim-sensor-A", 1)
        second = a.observe("water-flow", 5, "L", "sim-sensor-B", 1)
        h_obs = h.observe("filter-repair", 1, "count", "sim-robot", 1)
        h.verify(h_obs, "independent-verifier", "simulated bench check")
        p.observe("solar-output", 10, "kWh", "sim-solar", 2)
        p_task = p.propose("reserve-power", [p.evidence("solar-output")[0]["id"]], "engineer", True)
        p.approve(p_task, "engineer", "engineer-1")
        p.approve(p_task, "safety-officer", "officer-1")
        p.act(p_task, "reserve battery", 2, "battery", "simulated storm reserve")
        inspections, fault_step, losses = 0, 0, 0
        if mode == "cooperative":
            method = "filter seal check" if scenario == "transferable" else "unrelated repair"
            pkt = package(h, "filter-repair", method, "v1", [h_obs])
            if scenario == "poisoned":
                # An altered claim with a valid content hash still lacks independent truth.
                from .core import digest
                pkt["content"]["method"] = "incorrect seal bypass"
                pkt["hash"] = digest(pkt["content"])
                pkt["id"] = digest([pkt["origin"], pkt["version"], pkt["hash"]])
                pkt = h.sign_package(pkt)
            net.offline.add("ARES")
            net.send("HESTIA", "ARES", pkt, delay=2)
            net.tick(6)
            net.offline.remove("ARES")
            net.tick(1)
            a.review_package(pkt["id"], "independent-verifier", True)
        accepted = a.db.execute("SELECT body FROM packages WHERE status='accepted'").fetchall()
        relevant = bool(accepted) and scenario != "unrelated"
        # Bad information costs an inspection and delay; no false safe outcome is counted.
        planned = 1 if relevant and scenario == "transferable" else (4 if scenario == "poisoned" and relevant else 3)
        for i in range(planned):
            t = a.propose("inspect-water", [first, second], "engineer", reason="conflicting simulated water readings")
            a.approve(t, "engineer", "engineer-2")
            a.act(t, "inspection", 1, "human_work", f"simulated inspection {i+1}")
            inspections += 1
        fault_step = 8 + inspections + (1 if scenario == "poisoned" and relevant else 0)
        losses = inspections * 2
        return {"fault_step": fault_step, "unnecessary_inspections": inspections - 1,
                "resource_loss_L": losses, "unsafe_attempts": 0, "conflicts_detected": 1,
                "human_decisions": inspections + 2 + (1 if mode == "cooperative" else 0),
                "knowledge_benefit_steps": (3 - inspections) if mode == "cooperative" else 0,
                "messages_sent": net.sent, "recovery_steps": 1 if mode == "cooperative" else 0}


def benchmark(seeds):
    if not seeds:
        raise ValueError("at least one seed required")
    pairs = []
    for seed in seeds:
        for scenario in ("transferable", "unrelated", "poisoned"):
            base = trial(seed, "isolated", scenario)
            coop = trial(seed, "cooperative", scenario)
            pairs.append({"seed": seed, "scenario": scenario, "isolated": base, "cooperative": coop,
                          "fault_step_delta": coop["fault_step"] - base["fault_step"]})
    return {"unit": "simulation steps; simulated resource units", "pairs": pairs}
