import copy
import tempfile
import unittest
from pathlib import Path
from mars.core import Network, Rejected, Settlement, package, digest


class TrustMemoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.nodes = self.open_nodes()
        self.net = Network(self.nodes)

    def open_nodes(self):
        return {n: Settlement(Path(self.tmp.name) / f"{n}.sqlite", n) for n in ("ARES", "HESTIA", "PROMETHEUS")}

    def packet(self):
        h = self.nodes["HESTIA"]
        e = h.observe("filter-repair", 1, "count", "sim-robot")
        h.verify(e, "independent-verifier", "sim bench")
        return package(h, "filter-repair", "seal", "v1", [e])

    def restart(self):
        for node in self.nodes.values():
            node.db.close()
        self.nodes = self.open_nodes()
        self.net = Network(self.nodes)

    def test_identity_survives_restart(self):
        key = self.nodes["ARES"].public_key()
        self.restart()
        self.assertEqual(self.nodes["ARES"].public_key(), key)

    def test_pending_delayed_message_survives_restart(self):
        pkt = self.packet()
        self.net.send("HESTIA", "ARES", pkt, delay=10)
        self.net.tick(4)
        self.restart()
        self.assertEqual(len(self.net.queue), 1)
        self.net.tick(5)
        self.assertEqual(self.nodes["ARES"].db.execute("SELECT COUNT(*) FROM inbox").fetchone()[0], 0)
        self.net.tick()
        self.assertEqual(len(self.net.queue), 0)
        self.assertEqual(self.nodes["ARES"].review_package(pkt["id"], "independent-verifier", True), "accepted")

    def test_interrupted_after_receipt_recovers_without_duplicate_processing(self):
        pkt = self.packet()
        self.net.send("HESTIA", "ARES", pkt)
        with self.assertRaises(InterruptedError): self.net.tick(interrupt_after_receive=True)
        self.assertEqual(len(self.net.queue), 1)
        before = self.nodes["ARES"].db.execute("SELECT COUNT(*) FROM inbox").fetchone()[0]
        self.restart()
        self.net.tick()
        self.assertEqual(self.nodes["ARES"].db.execute("SELECT COUNT(*) FROM inbox").fetchone()[0], before)
        self.assertEqual(len(self.net.queue), 0)

    def test_out_of_order_messages_remain_distinct_after_restart(self):
        pkt = self.packet()
        self.net.send("HESTIA", "ARES", pkt, delay=9)
        self.net.send("HESTIA", "ARES", pkt, delay=1)
        self.net.tick(2)
        self.restart()
        self.net.tick(7)
        self.assertEqual(self.nodes["ARES"].db.execute("SELECT COUNT(*) FROM inbox").fetchone()[0], 2)
        self.assertTrue(any(e["kind"] == "stale-message" for e in self.nodes["ARES"].events()))

    def test_partial_delivery_persists_remaining(self):
        pkt = self.packet()
        self.net.send("HESTIA", "ARES", pkt)
        self.net.send("HESTIA", "PROMETHEUS", pkt)
        self.net.tick(limit=1)
        self.assertEqual(len(self.net.queue), 1)
        self.restart()
        self.net.tick()
        self.assertEqual(len(self.net.queue), 0)

    def test_outage_survives_restart(self):
        self.net.send("HESTIA", "ARES", self.packet())
        self.net.offline.add("ARES")
        self.net.tick(20)
        self.restart()
        self.assertEqual(len(self.net.queue), 1)
        self.net.tick()
        self.assertEqual(len(self.net.queue), 0)

    def test_duplicate_signed_message_after_restart(self):
        msg = self.net.send("HESTIA", "ARES", self.packet())
        self.net.tick()
        self.restart()
        self.assertFalse(self.nodes["ARES"].receive(msg))

    def test_unknown_sender_rejected(self):
        rogue = Settlement(Path(self.tmp.name) / "ROGUE.sqlite", "ROGUE")
        msg = rogue.queue_message("ARES", {"type": "knowledge"}, 0)
        with self.assertRaisesRegex(Rejected, "unknown sender"):
            self.nodes["ARES"].receive(msg)

    def test_changed_message_rejected(self):
        msg = self.net.send("HESTIA", "ARES", self.packet())
        changed = copy.deepcopy(msg)
        changed["payload"]["content"]["method"] = "unsafe edit"
        with self.assertRaisesRegex(Rejected, "invalid signature"):
            self.nodes["ARES"].receive(changed)
        self.assertEqual(self.nodes["ARES"].db.execute("SELECT COUNT(*) FROM inbox").fetchone()[0], 0)

    def test_invalid_signature_rejected(self):
        msg = self.net.send("HESTIA", "ARES", self.packet())
        msg["signature"] = "00" * 64
        with self.assertRaisesRegex(Rejected, "invalid signature"):
            self.nodes["ARES"].receive(msg)

    def test_package_signature_checked_independently_of_envelope(self):
        pkt = self.packet()
        pkt["signature"] = "00" * 64
        self.net.send("HESTIA", "ARES", pkt)
        self.net.tick()
        self.assertEqual(self.nodes["ARES"].db.execute("SELECT COUNT(*) FROM packages").fetchone()[0], 0)
        self.assertTrue(any(e["kind"] == "package-invalid" for e in self.nodes["ARES"].events()))

    def test_reused_sequence_with_new_signed_id_is_rejected(self):
        msg = self.net.send("HESTIA", "ARES", self.packet())
        self.net.tick()
        h = self.nodes["HESTIA"]
        changed = {**msg, "id": "another-id"}
        changed["signature"] = h._sign({k: v for k, v in changed.items() if k != "signature"})
        with self.assertRaisesRegex(Rejected, "replayed"):
            self.nodes["ARES"].receive(changed)

    def test_peer_key_substitution_requires_manual_review(self):
        rogue = Settlement(Path(self.tmp.name) / "ROGUE.sqlite", "ROGUE")
        with self.assertRaisesRegex(Rejected, "peer key changed"):
            self.nodes["ARES"].register_peer("HESTIA", rogue.public_key())

    def test_signature_does_not_approve_package(self):
        pkt = self.packet()
        self.net.send("HESTIA", "ARES", pkt)
        self.net.tick()
        row = self.nodes["ARES"].db.execute("SELECT status FROM packages WHERE id=?", (pkt["id"],)).fetchone()
        self.assertEqual(row["status"], "quarantined")

    def test_signed_transfer_without_local_debit_is_rejected(self):
        raw = {"type": "transfer", "transfer_id": "bad", "origin": "HESTIA", "recipient": "ARES",
               "kind": "water", "qty": 100, "unit": "L", "simulated": True}
        with self.assertRaisesRegex(Rejected, "prepared local debit"):
            self.net.send("HESTIA", "ARES", raw)

    def test_transfer_replay_after_restart_does_not_credit_twice(self):
        a = self.nodes["ARES"]
        e = a.observe("water-flow", 5, "L", "sim-sensor")
        t = a.propose("transfer", [e], "engineer")
        a.approve(t, "engineer", "crew")
        payload = a.prepare_transfer("once", "HESTIA", "water", 3, t)
        self.net.send("ARES", "HESTIA", payload)
        self.net.tick()
        self.restart()
        self.net.send("ARES", "HESTIA", payload)
        self.net.tick()
        self.assertEqual(self.nodes["HESTIA"].resources()["water"], 103)
        self.assertEqual(self.nodes["ARES"].resources()["water"], 97)


if __name__ == "__main__": unittest.main()
