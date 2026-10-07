"""Prove the levels can be finished: an autopilot walks both beans along tools/routes.json.

    tools/.venv/bin/python tools/playtest.py [level ...]      (needs tools/serve.sh running)

Each route is a list of formations (see src/dev.js). Prints one line per level; a failure shows
the step it got stuck on and where the beans were.
"""
import json, os, sys
from cdp import Browser, TOOLS

routes = json.load(open(os.path.join(TOOLS, "routes.json")))
want = sys.argv[1:] or list(routes)
b = Browser()
try:
    b.send("Page.navigate", {"url": "http://localhost:8770/?dev&manual"})
    for _ in range(100):
        if b.js("typeof window.pilot") == "function":
            break
        __import__("time").sleep(0.1)
    levels = b.js("import('./src/levels.js').then(m => m.LEVELS.map(l => l.id))")
    bad = 0
    for name in want:
        r = b.js(f"pilot({levels.index(name)}, {json.dumps(routes[name])})")
        bad += not r["ok"]
        print(("PASS" if r["ok"] else "FAIL"), name, json.dumps(r))
    print("\n".join(b.logs))
    sys.exit(1 if bad else 0)
finally:
    b.close()
