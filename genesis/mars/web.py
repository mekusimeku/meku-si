"""Local-only HTTP adapter for Genesis; no production authentication."""
import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from .control import Control, comparison
from .core import Rejected

STATIC = Path(__file__).parent / "static"
FILES = {"/": ("index.html", "text/html; charset=utf-8"),
         "/app.js": ("app.js", "text/javascript; charset=utf-8"),
         "/style.css": ("style.css", "text/css; charset=utf-8")}


def create_server(host="127.0.0.1", port=0, directory="./genesis-state"):
    control = Control(directory)

    class Handler(BaseHTTPRequestHandler):
        def send_bytes(self, status, body, mime):
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def send_json(self, status, value):
            self.send_bytes(status, json.dumps(value, separators=(",", ":"), allow_nan=False).encode(), "application/json; charset=utf-8")

        def do_GET(self):
            if self.path == "/api/state":
                return self.send_json(200, control.state())
            if self.path == "/api/benchmark":
                return self.send_json(200, comparison())
            if self.path in FILES:
                filename, mime = FILES[self.path]
                return self.send_bytes(200, (STATIC / filename).read_bytes(), mime)
            self.send_json(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/api/action":
                return self.send_json(404, {"error": "not found"})
            origin = self.headers.get("Origin")
            host_header = self.headers.get("Host")
            if origin and origin not in ("http://" + host_header, "https://" + host_header):
                return self.send_json(403, {"error": "cross-origin request rejected"})
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 8192 or self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                    raise Rejected("invalid request size or content type")
                body = json.loads(self.rfile.read(size))
                if not isinstance(body, dict):
                    raise Rejected("object required")
                return self.send_json(200, control.action(body.get("command"), body))
            except (Rejected, ValueError, KeyError, TypeError) as exc:
                return self.send_json(400, {"error": str(exc)})

        def log_message(self, format, *args):
            pass

    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    server.control = control
    return server


def main():
    parser = argparse.ArgumentParser(description="Run MEKU MARS on this computer")
    parser.add_argument("--host", default="127.0.0.1", help="127.0.0.1 by default; 0.0.0.0 for trusted local Wi-Fi only")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data", default="./genesis-state", help="directory for simulated SQLite state")
    args = parser.parse_args()
    server = create_server(args.host, args.port, args.data)
    print(f"MEKU MARS local simulator: http://{args.host}:{server.server_port}/", flush=True)
    stop = threading.Event()

    def loop():
        while not stop.wait(1):
            server.control.advance_if_running()

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        server.server_close()


if __name__ == "__main__":
    main()
