"""Screenshots of spots in the levels, for looking at changes.

    tools/.venv/bin/python tools/shots.py NAME LEVEL [CHECKPOINT] [SECONDS] [JS]

Starts LEVEL (0-based) on one keyboard, jumps to CHECKPOINT, runs SECONDS of game time, runs
the optional JS (window.app, window.dev), and writes tools/out/NAME.png. W and H env vars set the
window size.
"""
import os, sys, time
from cdp import Browser, OUT

name, level = sys.argv[1], int(sys.argv[2])
cp = int(sys.argv[3]) if len(sys.argv) > 3 else 0
secs = float(sys.argv[4]) if len(sys.argv) > 4 else 1
js = sys.argv[5] if len(sys.argv) > 5 else ""
b = Browser(size=(int(os.environ.get("W", 1280)), int(os.environ.get("H", 800))))
try:
    b.send("Page.navigate", {"url": "http://localhost:8770/?dev&manual"})
    for _ in range(100):
        if b.js("typeof window.dev") == "object":
            break
        time.sleep(0.1)
    b.js(f"app.startLevel({level}); app.game.cp = {cp}; app.game.respawn(); app.view.snap = true; dev.run({secs}); {js}; dev.run(0.05); 1")
    time.sleep(0.4)
    b.shot(os.path.join(OUT, name + ".png"))
    print("tools/out/" + name + ".png")
    print("\n".join(b.logs))
finally:
    b.close()
