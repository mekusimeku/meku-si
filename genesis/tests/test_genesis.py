import copy
import tempfile
import threading
import unittest
from pathlib import Path
from mars.core import Settlement, Network, Rejected, package, digest
from mars.experiment import benchmark


class GenesisTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.nodes = {n: Settlement(Path(self.tmp.name) / f"{n}.sqlite", n) for n in ("ARES", "HESTIA", "PROMETHEUS")}
        self.a, self.h, self.p = self.nodes.values()

    def task(self, node=None, high=False):
        node = node or self.a
        e = node.observe("water-flow", 7, "L", "sim-sensor")
        t = node.propose("inspect", [e], "engineer", high)
        return e, t

    def packet(self):
        e = self.h.observe("filter-repair", 1, "count", "sim-robot")
        self.h.verify(e, "independent-verifier", "sim bench")
        return package(self.h, "filter-repair", "seal method", "v1", [e])

    def delivered(self, pkt=None):
        pkt = pkt or self.packet()
        net = Network(self.nodes)
        msg = net.send("HESTIA", "ARES", pkt)
        net.tick()
        return pkt, msg, net

    def test_false_sensor_reading_can_be_invalidated(self):
        e = self.a.observe("water-flow", 999, "L", "sim-faulty")
        self.a.invalidate(e, "independent-verifier", "failed simulated cross-check")
        self.assertEqual(self.a.evidence()[0]["status"], "invalidated")
        self.assertTrue(self.a.verify_log())

    def test_conflicting_observations_are_disputed(self):
        self.a.observe("water-flow", 8, "L", "sim-a")
        self.a.observe("water-flow", 5, "L", "sim-b")
        self.assertEqual([e["status"] for e in self.a.evidence()], ["disputed", "disputed"])

    def test_missing_readings_block_proposal(self):
        with self.assertRaises(Rejected): self.a.propose("inspect", ["missing"], "engineer")

    def test_network_disconnection_preserves_local_actions(self):
        net = Network(self.nodes)
        net.offline.add("ARES")
        net.send("HESTIA", "ARES", self.packet())
        net.tick(100)
        self.assertEqual(len(net.queue), 1)
        _, t = self.task()
        self.a.approve(t, "engineer", "crew")
        self.a.act(t, "inspection", 1, "human_work", "sim completed")
        net.offline.remove("ARES")
        net.tick()
        self.assertEqual(len(net.queue), 0)

    def test_duplicate_messages_are_idempotent(self):
        _, msg, _ = self.delivered()
        self.assertFalse(self.a.receive(msg))
        self.assertEqual(self.a.db.execute("SELECT COUNT(*) FROM inbox").fetchone()[0], 1)

    def test_out_of_order_messages_are_recorded(self):
        pkt = self.packet()
        net = Network(self.nodes)
        old = net.send("HESTIA", "ARES", pkt, delay=5)
        net.send("HESTIA", "ARES", pkt, delay=1)
        net.tick(5)
        self.assertTrue(any(e["kind"] == "stale-message" for e in self.a.events()))
        self.assertFalse(self.a.receive(old))

    def test_replay_attempt_does_not_repeat_allocation(self):
        _, t = self.task()
        self.a.approve(t, "engineer", "crew")
        self.a.allocate("req-1", "water", 3, "L", t)
        self.assertFalse(self.a.allocate("req-1", "water", 3, "L", t))
        self.assertEqual(self.a.resources()["water"], 97)

    def test_invalid_knowledge_hash_is_quarantined_out(self):
        pkt = self.packet()
        pkt["content"]["method"] = "changed"
        self.delivered(pkt)
        self.assertEqual(self.a.db.execute("SELECT COUNT(*) FROM packages").fetchone()[0], 0)

    def test_package_rejection(self):
        pkt, _, _ = self.delivered()
        self.assertEqual(self.a.review_package(pkt["id"], "independent-verifier", False), "rejected")

    def test_unsafe_action_proposal_cannot_act(self):
        _, t = self.task(high=True)
        self.a.approve(t, "engineer", "crew")
        with self.assertRaises(Rejected): self.a.act(t, "reserve battery", 1, "battery", "sim")

    def test_human_refusal_is_terminal(self):
        _, t = self.task()
        self.a.approve(t, "engineer", "crew", "refuse")
        with self.assertRaises(Rejected): self.a.approve(t, "engineer", "other")
        with self.assertRaises(Rejected): self.a.act(t, "inspection", 1, "human_work", "sim")

    def test_unauthorized_approval(self):
        _, t = self.task()
        with self.assertRaises(Rejected): self.a.approve(t, "researcher", "crew")

    def test_duplicate_resource_deduction(self):
        _, t = self.task()
        self.a.approve(t, "engineer", "crew")
        self.a.act(t, "inspection", 1, "human_work", "sim")
        with self.assertRaises(Rejected): self.a.act(t, "inspection", 1, "human_work", "sim")
        self.assertEqual(self.a.resources()["human_work"], 19)

    def test_resource_shortage_and_reserve(self):
        _, t = self.task()
        self.a.approve(t, "engineer", "crew")
        with self.assertRaises(Rejected): self.a.allocate("large", "water", 81, "L", t)
        self.assertEqual(self.a.resources()["water"], 100)

    def test_conflicting_settlement_updates(self):
        first, _, _ = self.delivered()
        self.a.review_package(first["id"], "independent-verifier", True)
        second = self.packet()
        second["content"]["method"] = "other method"
        second["hash"] = digest(second["content"])
        second["id"] = digest([second["origin"], second["version"], second["hash"]])
        second = self.h.sign_package(second)
        self.delivered(second)
        self.assertEqual(self.a.review_package(second["id"], "independent-verifier", True), "conflict-review")

    def test_simulated_hardware_failure_blocks_unknown_action(self):
        _, t = self.task()
        self.a.approve(t, "engineer", "crew")
        with self.assertRaises(Rejected): self.a.act(t, "open-real-valve", 1, "water", "sim")

    def test_recovery_after_restart(self):
        _, t = self.task()
        self.a.approve(t, "engineer", "crew")
        self.a.act(t, "inspection", 1, "human_work", "sim")
        reopened = Settlement(self.a.path, "ARES")
        self.assertEqual(reopened.resources()["human_work"], 19)
        self.assertTrue(reopened.verify_log())

    def test_competing_simultaneous_requests(self):
        _, t = self.task()
        self.a.approve(t, "engineer", "crew")
        results = []
        def run(key):
            node = Settlement(self.a.path, "ARES")
            try: results.append(node.allocate(key, "water", 50, "L", t))
            except Rejected: results.append(False)
        x = threading.Thread(target=run, args=("a",))
        y = threading.Thread(target=run, args=("b",))
        x.start(); y.start(); x.join(); y.join()
        self.assertEqual(sorted(results), [False, True])
        self.assertEqual(self.a.resources()["water"], 50)

    def test_incorrect_measurement_units(self):
        with self.assertRaises(Rejected): self.a.observe("water-flow", 5, "kg", "sim")
        _, t = self.task()
        self.a.approve(t, "engineer", "crew")
        with self.assertRaises(Rejected): self.a.allocate("bad-unit", "water", 1, "kg", t)

    def test_failure_to_meet_performance_benefit_is_reported(self):
        result = benchmark([1, 2])
        self.assertEqual([p["fault_step_delta"] for p in result["pairs"] if p["scenario"] == "unrelated"], [0, 0])
        self.assertTrue(all(p["fault_step_delta"] > 0 for p in result["pairs"] if p["scenario"] == "poisoned"))
        self.assertTrue(all(p["fault_step_delta"] < 0 for p in result["pairs"] if p["scenario"] == "transferable"))

    def test_ai_prediction_is_not_evidence_for_action(self):
        eid = self.a.observe("water-flow", 5, "L", "model", status="AI-predicted")
        self.a.suggest("close valve", [eid])
        with self.assertRaises(Rejected): self.a.propose("close valve", [eid], "engineer")

    def test_bad_origin_is_rejected(self):
        pkt = self.packet()
        pkt["origin"] = "PROMETHEUS"
        net = Network(self.nodes)
        net.send("HESTIA", "ARES", pkt)
        net.tick()
        self.assertEqual(self.a.db.execute("SELECT COUNT(*) FROM packages").fetchone()[0], 0)

    def test_simulated_transfer_replay_does_not_credit_twice(self):
        _, t = self.task()
        self.a.approve(t, "engineer", "crew")
        payload = self.a.prepare_transfer("tx-1", "HESTIA", "water", 4, t)
        net = Network(self.nodes)
        net.send("ARES", "HESTIA", payload)
        net.send("ARES", "HESTIA", payload)
        net.tick()
        self.assertEqual(self.a.resources()["water"], 96)
        self.assertEqual(self.h.resources()["water"], 104)
        with self.assertRaises(Rejected): self.a.prepare_transfer("tx-1", "HESTIA", "water", 4, t)

    def test_competing_resource_options_require_human(self):
        options = self.a.allocation_options("water", {"HESTIA": 50, "PROMETHEUS": 50})
        self.assertEqual(options["shortfall"], 20)
        self.assertTrue(options["human_decision_required"])
        self.assertEqual(self.a.resources()["water"], 100)


if __name__ == "__main__": unittest.main()
