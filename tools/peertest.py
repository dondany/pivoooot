"""The real thing: host and guest in two iframes, connected through PeerJS and WebRTC (needs
internet for the PeerJS broker). Checks the room opens, the invite link joins it, and the level
start and the clock reach the guest.

    tools/.venv/bin/python tools/peertest.py      (needs tools/serve.sh running)

Headless Chrome hides local addresses from WebRTC, so two pages on one machine never find each
other; the flag below turns that off for this test.
"""
import os, sys, time
os.environ["CHROME_FLAGS"] = "--disable-features=WebRtcHideLocalIpsWithMdns"
from cdp import Browser

HOST, GUEST = "document.getElementById('host').contentWindow", "document.getElementById('guest').contentWindow"
b = Browser(size=(1600, 600))
ok = False
try:
    b.send("Page.navigate", {"url": "http://localhost:8770/tools/duo.html?blank"})
    time.sleep(0.5)
    b.js("document.getElementById('guest').src = 'about:blank'; document.getElementById('host').src = '../index.html?auto=host'; 1")
    code = None
    for _ in range(100):
        time.sleep(0.2)
        code = b.js(f"(() => {{ const a = {HOST}.app; return a && a.net && a.mode === 'lobby' ? a.net.code : null; }})()")
        if code:
            break
    print("room:", code or "none (" + str(b.js(f"{HOST}.document.getElementById('menu-msg').textContent")) + ")")
    if code:
        b.js(f"document.getElementById('guest').src = '../index.html?room={code}'; 1")
        state = None
        for _ in range(120):
            time.sleep(0.2)
            state = b.js(f"(() => {{ const a = {GUEST}.app; return a ? a.mode + '|' + !!(a.net && a.net.open) + '|' + {GUEST}.document.getElementById('menu-msg').textContent : null; }})()")
            if state and (state.startswith("lobby|true") or state.startswith("menu|false|No") or "Could not" in state):
                break
        print("guest:", state)
        if state and state.startswith("lobby|true"):
            b.js(f"{HOST}.app.startLevel(0); 1")
            time.sleep(3)
            mode = b.js(f"{GUEST}.app.mode")
            diff = b.js(f"Math.abs({HOST}.app.game.time - {GUEST}.app.game.time)")
            print(f"guest in level: {mode}; clocks {diff:.3f}s apart; round trip {b.js(f'{GUEST}.app.net.rtt') * 1000:.0f} ms")
            ok = mode == "play" and diff < 0.25
    print("PASS" if ok else "FAIL")
    print("\n".join(l for l in b.logs if "PCFSoft" not in l))
finally:
    b.close()
sys.exit(0 if ok else 1)
