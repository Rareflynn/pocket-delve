# static file server for the scratch game copy that also accepts POST /save/<name> (writes the body to that file)
import http.server, os, sys

# serves a COPY of the game (argv[2], default tools/pd/web) so sims and POSTed files never touch the real web folder
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pd', 'web')


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_POST(self):
        if not self.path.startswith('/save/'):
            self.send_error(404); return
        name = os.path.basename(self.path[len('/save/'):])
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        with open(os.path.join(ROOT, name), 'wb') as f:
            f.write(body)
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
