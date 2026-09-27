import sys, time, webview

JS = open(sys.argv[1], encoding='utf-8').read()


def run(w):
    time.sleep(4)  # let the game boot
    try:
        print(w.evaluate_js(JS), flush=True)
    except Exception as e:
        print('ERR', e, flush=True)
    w.destroy()


w = webview.create_window('sim', 'http://127.0.0.1:8765/index.html?sim=' + str(time.time()), hidden=True)
webview.start(run, w, private_mode=True)

