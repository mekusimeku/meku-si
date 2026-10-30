import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from mars.web import create_server


class WebTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.server = create_server(port=0, directory=self.tmp.name)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def get(self, path):
        with urllib.request.urlopen(self.url + path) as response:
            return response.status, response.read(), response.headers

    def post(self, command, **kwargs):
        request = urllib.request.Request(self.url + "/api/action", data=json.dumps({"command": command, **kwargs}).encode(),
                                         headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read())

    def test_page_and_assets_are_served(self):
        for path, marker in [("/", b"MEKU MARS"), ("/app.js", b"/api/action"), ("/style.css", b"#ff6000")]:
            status, body, _ = self.get(path)
            self.assertEqual(status, 200)
            self.assertIn(marker, body.lower() if path == "/style.css" else body)

    def test_state_matches_real_node_databases(self):
        data = json.loads(self.get("/api/state")[1])
        self.assertEqual(set(data["settlements"]), {"ARES", "HESTIA", "PROMETHEUS"})
        self.assertEqual(data["settlements"]["ARES"]["resources"]["water"], 100)
        self.assertEqual(data["pending_messages"], 1)
        self.assertTrue(all(s["log_valid"] for s in data["settlements"].values()))

    def test_advance_delivers_signed_package_and_review_changes_state(self):
        for _ in range(3): self.post("advance")
        data = json.loads(self.get("/api/state")[1])
        a = data["settlements"]["ARES"]
        self.assertEqual(a["packages"][0]["status"], "quarantined")
        self.assertTrue(a["incoming"][0]["signature"])
        pid = a["packages"][0]["id"]
        reviewed = self.post("package_review", settlement="ARES", package=pid, decision="reject")
        self.assertEqual(reviewed["settlements"]["ARES"]["packages"][0]["status"], "rejected")

    def test_refusal_blocks_action(self):
        data = json.loads(self.get("/api/state")[1])
        tid = data["settlements"]["ARES"]["tasks"][0]["id"]
        refused = self.post("decision", settlement="ARES", task=tid, role="engineer", decision="refuse")
        self.assertEqual(refused["settlements"]["ARES"]["tasks"][0]["status"], "refused")
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.post("execute", settlement="ARES", task=tid)
        self.assertEqual(ctx.exception.code, 400)

    def test_blackout_and_shortage_are_real_simulated_events(self):
        out = self.post("blackout", settlement="PROMETHEUS")
        self.assertFalse(out["settlements"]["PROMETHEUS"]["online"])
        out = self.post("shortage", settlement="PROMETHEUS", resource="energy")
        self.assertEqual(out["settlements"]["PROMETHEUS"]["resources"]["energy"], 10)
        self.assertTrue(any(e["kind"] == "simulated-shortage" for e in out["settlements"]["PROMETHEUS"]["events"]))

    def test_sensor_failure_creates_evidence_and_task(self):
        out = self.post("sensor_failure", settlement="HESTIA")
        h = out["settlements"]["HESTIA"]
        self.assertEqual(h["tasks"][0]["status"], "pending")
        self.assertEqual(h["evidence"][0]["body"]["source"], "injected-simulated-failure")

    def test_high_risk_task_requires_both_human_roles(self):
        state = json.loads(self.get("/api/state")[1])
        tid = state["settlements"]["PROMETHEUS"]["tasks"][0]["id"]
        one = self.post("decision", settlement="PROMETHEUS", task=tid, role="engineer", decision="approve")
        self.assertEqual(one["settlements"]["PROMETHEUS"]["tasks"][0]["status"], "pending")
        with self.assertRaises(urllib.error.HTTPError):
            self.post("execute", settlement="PROMETHEUS", task=tid)
        two = self.post("decision", settlement="PROMETHEUS", task=tid, role="safety-officer", decision="approve")
        self.assertEqual(two["settlements"]["PROMETHEUS"]["tasks"][0]["status"], "approved")
        completed = self.post("execute", settlement="PROMETHEUS", task=tid)
        self.assertEqual(completed["settlements"]["PROMETHEUS"]["resources"]["battery"], 28)

    def test_start_pause_controls_local_tick(self):
        self.post("start")
        self.server.control.advance_if_running()
        self.assertEqual(json.loads(self.get("/api/state")[1])["clock"], 1)
        self.post("pause")
        self.server.control.advance_if_running()
        self.assertEqual(json.loads(self.get("/api/state")[1])["clock"], 1)

    def test_reset_is_local_and_reseeds_three_nodes(self):
        self.post("advance")
        self.post("shortage", settlement="ARES", resource="water")
        out = self.post("reset")
        self.assertEqual(out["clock"], 0)
        self.assertEqual(out["settlements"]["ARES"]["resources"]["water"], 100)
        self.assertEqual(out["pending_messages"], 1)

    def test_benchmark_endpoint_runs_paired_experiment(self):
        result = json.loads(self.get("/api/benchmark")[1])
        self.assertEqual(len(result["pairs"]), 15)
        self.assertTrue(any(p["fault_step_delta"] > 0 for p in result["pairs"]))

    def test_bad_requests_fail_closed(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.post("shortage", settlement="ARES", resource="not-a-resource")
        self.assertEqual(ctx.exception.code, 400)
        request = urllib.request.Request(self.url + "/api/action", data=b'{"command":"reset"}',
                                         headers={"Content-Type": "application/json", "Origin": "https://attacker.example"}, method="POST")
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(request)
        self.assertEqual(ctx.exception.code, 403)


if __name__ == "__main__": unittest.main()
