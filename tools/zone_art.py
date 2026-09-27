"""Makes the Discord zone pictures (discord/zones/<slug>.png) for any zone that doesn't have one yet.

  python tools/zone_art.py          only the missing ones (run by the git pre-commit hook)
  python tools/zone_art.py --all    redo every zone (after changing a zone's look or Lord)

Renders with the game's own drawing code (tools/zone_art.js) in a hidden pywebview window.
"""
import http.server, os, re, sys, threading, time

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)
WEB = os.path.join(ROOT, 'web')
OUT = os.path.join(ROOT, 'discord', 'zones')


def slug(name):
    return re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')  # same as zoneSlug() in game.js


def zone_names():
    with open(os.path.join(WEB, 'data.js'), encoding='utf-8') as f:
        found = re.findall(r"""\{ name: ('(?:[^'\\]|\\.)*'|"[^"]*"), mobs:""", f.read())
    return [re.sub(r'\\(.)', r'\1', q[1:-1]) for q in found]  # 'Dragon\'s Roost' → Dragon's Roost


def main():
    os.makedirs(OUT, exist_ok=True)
    names = zone_names()
    want = names if '--all' in sys.argv else [n for n in names if not os.path.exists(os.path.join(OUT, slug(n) + '.png'))]
    if not want:
        print(f'zone pictures: all {len(names)} zones have one')
        return
    print('zone pictures: making', ', '.join(want))
    wanted = {slug(n) for n in want}

    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=WEB, **k)  # read-only: pictures are POSTed straight into discord/zones

        def do_POST(self):
            name = os.path.basename(self.path)
            body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
            s = name[len('zone_'):-len('.png')] if name.startswith('zone_') and name.endswith('.png') else None
            if s in wanted:
                with open(os.path.join(OUT, s + '.png'), 'wb') as f:
                    f.write(body)
            self.send_response(200); self.end_headers(); self.wfile.write(b'ok')

        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    import webview
    js = open(os.path.join(TOOLS, 'zone_art.js'), encoding='utf-8').read()

    def run(w):
        time.sleep(4)  # let the game boot
        try:
            print('zone pictures: rendered', w.evaluate_js(js))
        except Exception as e:
            print('zone pictures: ERR', e)
        w.destroy()

    w = webview.create_window('zone art', f'http://127.0.0.1:{srv.server_address[1]}/index.html?art={time.time()}', hidden=True)
    webview.start(run, w, private_mode=True)
    srv.shutdown()
    missing = [n for n in want if not os.path.exists(os.path.join(OUT, slug(n) + '.png'))]
    if missing:
        print('zone pictures: FAILED for', ', '.join(missing))
        sys.exit(1)


if __name__ == '__main__':
    main()
