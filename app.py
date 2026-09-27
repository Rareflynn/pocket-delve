"""Pocket Delve — launches the game in a small, borderless, always-on-top window."""
import ctypes
import json
import os
import threading
from ctypes import wintypes

import webview

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('POCKETDELVE_DATA') or os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'PocketDelve')
SAVE_FILE = os.path.join(DATA_DIR, 'save.json')
WINDOW_FILE = os.path.join(DATA_DIR, 'window.json')
TITLE = os.environ.get('POCKETDELVE_TITLE') or 'Pocket Delve'  # tests use another title so they never touch the real window
os.makedirs(DATA_DIR, exist_ok=True)


def read_json(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_atomic(path, text):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(text)
    os.replace(tmp, path)


# ---------------- native window placement ----------------
# pywebview's x/y/width/height units get mixed up under Windows display scaling, so the
# window is positioned with the Win32 API in real (physical) pixels instead.
# Calls from the game's buttons arrive on a worker thread. Going through pywebview's window
# properties (on_top, minimize) blocks on the UI thread and can deadlock ("Not Responding"),
# so everything uses the async Win32 variants, which just post a message and return.
user32 = ctypes.windll.user32
user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
SWP_NOSIZE, SWP_NOMOVE, SWP_NOZORDER, SWP_NOACTIVATE, SWP_ASYNCWINDOWPOS = 0x0001, 0x0002, 0x0004, 0x0010, 0x4000
HWND_TOPMOST, HWND_NOTOPMOST = wintypes.HWND(-1), wintypes.HWND(-2)
SW_MINIMIZE = 6
MONITOR_DEFAULTTONULL, MONITOR_DEFAULTTONEAREST = 0, 2


class MONITORINFO(ctypes.Structure):
    _fields_ = [('cbSize', wintypes.DWORD), ('rcMonitor', wintypes.RECT), ('rcWork', wintypes.RECT), ('dwFlags', wintypes.DWORD)]


def hwnd():
    return user32.FindWindowW(None, TITLE)


def get_rect(h):
    r = wintypes.RECT()
    user32.GetWindowRect(h, ctypes.byref(r))
    return r


def monitor_info(h):
    mi = MONITORINFO(cbSize=ctypes.sizeof(MONITORINFO))
    user32.GetMonitorInfoW(user32.MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST), ctypes.byref(mi))
    return mi


def work_area(h):
    return monitor_info(h).rcWork  # monitor minus the taskbar


fullscreen_prev = None  # window rect to restore when leaving full screen


def scale(h):
    try:
        return user32.GetDpiForWindow(h) / 96 or 1
    except Exception:
        return 1


def place(h, x, y, w, ht):
    user32.SetWindowPos(h, None, int(x), int(y), int(w), int(ht), SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS)


def on_a_monitor(x, y, w):
    # the title bar area must be on some monitor, otherwise fall back to the default corner
    return all(user32.MonitorFromPoint(wintypes.POINT(int(px), int(y) + 10), MONITOR_DEFAULTTONULL)
               for px in (x + 20, x + w - 20))


DEFAULT_SIZE = (300, 165)  # CSS pixels; matches the "medium" preset in web/game.js


def snap_to_corner(h, size=None, corner='br'):
    r, wa, k = get_rect(h), work_area(h), scale(h)
    w, ht = (round(size[0] * k), round(size[1] * k)) if size else (r.right - r.left, r.bottom - r.top)
    m = round(12 * k)
    x = wa.left + m if 'l' in corner else wa.right - w - m
    y = wa.top + m if 't' in corner else wa.bottom - ht - m
    place(h, x, y, w, ht)


# ---------------- fade when the mouse is away ----------------
# The window turns see-through (and, if asked, lets clicks pass through) while the cursor isn't over it.
# A background thread watches the cursor, since a click-through window never gets mouse events itself.
GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT, LWA_ALPHA = -20, 0x80000, 0x20, 0x2
user32.GetWindowLongW.restype = ctypes.c_long
user32.SetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_long]
user32.SetLayeredWindowAttributes.argtypes = [wintypes.HWND, wintypes.DWORD, ctypes.c_ubyte, wintypes.DWORD]
fade = {'alpha': 255, 'through': False, 'state': None}


def fade_loop():
    while True:
        try:
            h = hwnd()
            if h:
                pt = wintypes.POINT(); user32.GetCursorPos(ctypes.byref(pt))
                r = get_rect(h)
                inside = r.left <= pt.x < r.right and r.top <= pt.y < r.bottom
                want = (255, False) if inside or fade['alpha'] >= 255 else (fade['alpha'], fade['through'])
                # fading off and never used: leave the window style alone
                if want == (255, False) and fade['state'] is None and not fade.get('used'):
                    pass
                elif want != fade['state']:
                    fade['used'] = True
                    ex = user32.GetWindowLongW(h, GWL_EXSTYLE) | WS_EX_LAYERED
                    ex = ex | WS_EX_TRANSPARENT if want[1] else ex & ~WS_EX_TRANSPARENT
                    user32.SetWindowLongW(h, GWL_EXSTYLE, ex)
                    user32.SetLayeredWindowAttributes(h, 0, want[0], LWA_ALPHA)
                    fade['state'] = want
        except Exception:
            pass
        threading.Event().wait(0.15)


# ---------------- backups ----------------
BACKUP_DIR = os.path.join(DATA_DIR, 'backups')
os.makedirs(BACKUP_DIR, exist_ok=True)
KEEP = {'auto': 10, 'manual': 20}


placed = threading.Event()


def initial_placement():
    if placed.is_set():
        return  # page reloads (e.g. after a reset) keep the current position
    try:
        h = hwnd()
        saved = read_json(WINDOW_FILE, {}).get('rect')
        if h and saved and on_a_monitor(saved[0], saved[1], saved[2]):
            place(h, *saved)
        elif h:
            snap_to_corner(h, DEFAULT_SIZE)
    finally:
        placed.set()
        window.show()


def remember_geometry():
    try:
        h = hwnd()
        if not h:
            return
        r = get_rect(h)
        cfg = read_json(WINDOW_FILE, {})
        cfg['rect'] = fullscreen_prev or [r.left, r.top, r.right - r.left, r.bottom - r.top]
        write_atomic(WINDOW_FILE, json.dumps(cfg))
    except Exception:
        pass


# ---------------- Discord Rich Presence ----------------
# Talks to the local Discord app over its IPC pipe (no extra packages). The game hands over what to show
# via Api.presence(); a background thread connects when Discord is running and resends when it changes.
DISCORD_APP_ID = '1553779549375037510'  # Application ID from https://discord.com/developers/applications
presence = {'activity': None, 'sent': None, 'start': None}


class DiscordIPC:
    def __init__(self):
        self.pipe = None

    def frame(self, op, payload):
        import struct
        body = json.dumps(payload).encode('utf-8')
        self.pipe.write(struct.pack('<II', op, len(body)) + body)
        self.pipe.flush()
        op, n = struct.unpack('<II', self.pipe.read(8))
        return json.loads(self.pipe.read(n) or b'{}')

    def connect(self):
        for i in range(10):
            try:
                self.pipe = open(rf'\\.\pipe\discord-ipc-{i}', 'r+b', buffering=0)
            except OSError:
                continue
            try:
                if self.frame(0, {'v': 1, 'client_id': DISCORD_APP_ID}).get('evt') == 'READY':
                    return True
            except Exception:
                pass
            self.close()
        return False

    def set_activity(self, activity):
        import uuid
        self.frame(1, {'cmd': 'SET_ACTIVITY', 'args': {'pid': os.getpid(), 'activity': activity}, 'nonce': str(uuid.uuid4())})

    def close(self):
        try:
            self.pipe.close()
        except Exception:
            pass
        self.pipe = None


art_ok = {}  # picture URL -> is it online yet (a new zone's picture only exists once it's pushed)


def with_art(activity):
    url = (activity or {}).get('assets', {}).get('large_image', '')
    if not url.startswith('https://'):
        return activity
    import time
    if url not in art_ok or (art_ok[url] is not True and time.time() > art_ok[url]):
        import urllib.request
        try:
            urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=5)
            art_ok[url] = True
        except Exception:
            art_ok[url] = time.time() + 600  # not there (yet): ask again in 10 minutes
    if art_ok[url] is True:
        return activity
    a = dict(activity, assets=dict(activity['assets'], large_image='logo'))
    del a['assets']['small_image'], a['assets']['small_text']
    return a


def presence_loop():
    ipc = DiscordIPC()
    while True:
        try:
            want = with_art(presence['activity'])
            if want and not ipc.pipe:
                if ipc.connect():
                    presence['sent'] = None
            if ipc.pipe and want != presence['sent']:
                ipc.set_activity(want or None)  # {} = cleared (turned off in settings)
                presence['sent'] = want
        except Exception:
            ipc.close()  # Discord closed or restarted: try again later
        threading.Event().wait(15)


# ---------------- JS API ----------------
class Api:
    def load(self):
        try:
            with open(SAVE_FILE, encoding='utf-8') as f:
                return f.read() or None
        except OSError:
            return None

    def save(self, data):
        if data:
            write_atomic(SAVE_FILE, data)
        elif os.path.exists(SAVE_FILE):
            os.remove(SAVE_FILE)  # empty string = reset
        return True

    def minimize(self):
        h = hwnd()
        if h:
            user32.ShowWindowAsync(h, SW_MINIMIZE)

    def close(self):
        # WM_CLOSE goes through the normal close path (which also remembers the geometry)
        h = hwnd()
        if h:
            user32.PostMessageW(h, 0x0010, 0, 0)
        else:
            window.destroy()

    def set_on_top(self, value):
        h = hwnd()
        if h:
            user32.SetWindowPos(h, HWND_TOPMOST if value else HWND_NOTOPMOST, 0, 0, 0, 0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS)

    def toggle_fullscreen(self):
        """Fill the current monitor, or go back to the previous size/position. Returns the new state."""
        global fullscreen_prev
        h = hwnd()
        if not h:
            return False
        if fullscreen_prev:
            place(h, *fullscreen_prev)
            fullscreen_prev = None
            return False
        r = get_rect(h)
        fullscreen_prev = [r.left, r.top, r.right - r.left, r.bottom - r.top]
        m = monitor_info(h).rcMonitor
        place(h, m.left, m.top, m.right - m.left, m.bottom - m.top)
        return True

    def resize(self, width, height):
        """Resize to a CSS-pixel size, keeping the bottom-right corner where it is."""
        h = hwnd()
        if not h or fullscreen_prev:
            return
        r, k = get_rect(h), scale(h)
        w, ht = round(width * k), round(height * k)
        place(h, r.right - w, r.bottom - ht, w, ht)

    def snap(self, corner='br'):
        h = hwnd()
        if h and not fullscreen_prev:
            snap_to_corner(h, None, corner if corner in ('br', 'bl', 'tr', 'tl') else 'br')

    def set_fade(self, percent, click_through):
        """Opacity (%) while the mouse is away from the window; 100 = never fade."""
        fade['alpha'] = max(25, min(255, round(255 * float(percent) / 100)))
        fade['through'] = bool(click_through) and fade['alpha'] < 255
        fade['state'] = None  # re-apply

    def backup(self, data, kind='auto'):
        if not data or kind not in KEEP:
            return False
        import time
        write_atomic(os.path.join(BACKUP_DIR, f'{kind}_{time.strftime("%Y%m%d_%H%M%S")}.json'), data)
        old = sorted(f for f in os.listdir(BACKUP_DIR) if f.startswith(kind + '_'))
        for f in old[:-KEEP[kind]]:
            os.remove(os.path.join(BACKUP_DIR, f))
        return True

    def list_backups(self):
        out = []
        for f in sorted(os.listdir(BACKUP_DIR), reverse=True):
            if f.endswith('.json'):
                p = os.path.join(BACKUP_DIR, f)
                out.append({'name': f, 'size': os.path.getsize(p), 'time': os.path.getmtime(p)})
        return out

    def read_backup(self, name):
        p = os.path.join(BACKUP_DIR, os.path.basename(name))  # no paths from outside the folder
        try:
            with open(p, encoding='utf-8') as f:
                return f.read()
        except OSError:
            return None

    def open_backups(self):
        os.startfile(BACKUP_DIR)

    def presence(self, details, state, big_text, image='logo'):
        """What Discord shows under your name. Empty details = show nothing. image: an https URL (zone picture) or an uploaded asset name."""
        if not details:
            presence['activity'] = {}
            return
        if presence['start'] is None:
            import time
            presence['start'] = int(time.time())
        presence['activity'] = {
            'details': str(details)[:128], 'state': str(state)[:128],
            'timestamps': {'start': presence['start']},
            'assets': {'large_image': str(image)[:256], 'large_text': str(big_text)[:128],
                       'small_image': 'logo', 'small_text': 'Pocket Delve'},
        }


save_data = read_json(SAVE_FILE, {})
on_top = save_data.get('settings', {}).get('onTop', True) if isinstance(save_data, dict) else True

window = webview.create_window(
    TITLE,
    url=os.path.join(HERE, 'web', 'index.html'),
    js_api=Api(),
    width=440, height=200,
    min_size=(200, 28),  # small enough for the mini strip (230×30)
    resizable=True,
    frameless=True,
    on_top=on_top,
    focus=False,
    hidden=True,  # shown once it's been moved into place
    background_color='#14121c',
)
window.events.loaded += initial_placement
window.events.closing += remember_geometry


def failsafe_show():
    if not placed.is_set():
        placed.set()
        window.show()


def clear_web_cache():
    # WebView2 kept serving old copies of the game files after updates, so drop its file caches on start
    # (the save lives in save.json, not in here)
    import shutil
    for d in ('Cache', 'Code Cache'):
        shutil.rmtree(os.path.join(DATA_DIR, 'EBWebView', 'Default', d), ignore_errors=True)


if __name__ == '__main__':
    clear_web_cache()
    threading.Timer(6, failsafe_show).start()
    threading.Thread(target=fade_loop, daemon=True).start()
    if DISCORD_APP_ID and not os.environ.get('POCKETDELVE_TITLE'):  # test instances stay quiet
        threading.Thread(target=presence_loop, daemon=True).start()
    webview.start(private_mode=False, storage_path=DATA_DIR)
