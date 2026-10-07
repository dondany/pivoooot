"""Online play without a network: tools/duo.html runs host and guest in two iframes over a
BroadcastChannel. Walks both beans, then checks the two simulations agree and that shouts,
respawns and the win reach the other side. Writes tools/out/duo.png.

    tools/.venv/bin/python tools/nettest.py      (needs tools/serve.sh running)
"""
import json, os, sys, time
from cdp import Browser, OUT

STEP = """
window.H = document.getElementById('host').contentWindow; window.G = document.getElementById('guest').contentWindow;
window.both = async (secs, hi, gi) => {
  H.app.puppet = [hi || {}, {}]; G.app.puppet = [{}, gi || {}];
  for (let t = 0; t < secs; t += 1 / 60) { H.app.frame(1 / 60); G.app.frame(1 / 60); await new Promise(r => setTimeout(r, 0)); }
  H.app.puppet = G.app.puppet = null;
};
window.pos = w => w.app.game.players.map(p => [p.x, p.y, p.z].map(v => +v.toFixed(2)));
1
"""
b = Browser(size=(1600, 600))
ok = True
def check(name, cond, detail=""):
    global ok
    ok &= bool(cond)
    print("PASS" if cond else "FAIL", name, detail)
try:
    b.send("Page.navigate", {"url": "http://localhost:8770/tools/duo.html?manual"})
    for _ in range(150):
        time.sleep(0.1)
        try:
            if b.js("!!(document.getElementById('guest').contentWindow.app && document.getElementById('guest').contentWindow.app.frame && document.getElementById('host').contentWindow.app.frame)"):
                break
        except Exception:
            pass
    b.js(STEP)
    time.sleep(1.5)
    b.js("both(0.3)")
    check("connected", b.js("H.app.net.open && G.app.net.open"), b.js("H.app.mode + '/' + G.app.mode + ' me=' + H.app.me + ',' + G.app.me"))
    b.js("H.app.startLevel(0); both(0.5)")
    check("guest follows into the level", b.js("G.app.mode === 'play' && G.app.game.index === 0"))
    b.js("both(1.2, {mx: 1}, {mx: 1})")
    h, g = b.js("pos(H)"), b.js("pos(G)")
    err = max(abs(h[i][k] - g[i][k]) for i in range(2) for k in range(3))
    check("both walked east and the two sims agree", h[0][0] > 1 and err < 0.4, f"host sees {h} guest sees {g} max error {err:.2f}")
    check("clocks agree", b.js("Math.abs(H.app.game.time - G.app.game.time) < 0.15"), b.js("H.app.game.time.toFixed(2) + ' vs ' + G.app.game.time.toFixed(2)"))
    # only the guest walks: it has to drag the host's bean along
    b.js("both(1.5, {}, {mx: 1})")
    h2, g2 = b.js("pos(H)"), b.js("pos(G)")
    moved = h2[0][0] - h[0][0]
    check("guest alone drags the host, slowly (walking together would cover 6.9)", 0.8 < moved < 4 and abs(h2[0][0] - g2[0][0]) < 0.4, f"host bean moved {moved:.2f}; host sees {h2}, guest sees {g2}")
    b.js("G.app.puppet = [{}, {shout: true}]; G.app.frame(1/60); G.app.puppet = null; both(0.3)")
    check("shout reaches the host", b.js("H.document.getElementById('bubble1').textContent") == "PIVOT!", b.js("H.document.getElementById('bubble1').className"))
    b.shot(os.path.join(OUT, "duo.png"))
    b.js("G.document.getElementById('btn-respawn').click(); both(0.5)")
    h3, g3 = b.js("pos(H)"), b.js("pos(G)")
    check("guest's respawn moves both sides", h3 == g3 and abs(h3[0][0] - h2[0][0]) > 1 and b.js("H.app.game.epoch === 1 && G.app.game.epoch === 1"), f"{h3} {g3}")
    b.js("H.dev.put([26, 7.5, -4.8], [22.8, 7.5, -4.8]); G.dev.put([26, 7.5, -4.8], [22.8, 7.5, -4.8]); both(0.6)")
    check("win shows on both sides", b.js("H.app.mode === 'win' && G.app.mode === 'win'"), b.js("H.app.mode + '/' + G.app.mode"))
    b.js("H.document.getElementById('btn-next').click(); both(0.5)")
    check("host's 'next level' takes the guest along", b.js("G.app.mode === 'play' && G.app.game.index === 1"))
    b.js("H.document.getElementById('btn-pause').click(); H.document.getElementById('btn-quit').click(); both(0.3)")
    check("host back to lobby takes the guest along", b.js("G.app.mode === 'lobby' && H.app.mode === 'lobby'"), b.js("H.app.mode + '/' + G.app.mode"))
    print("\n".join(l for l in b.logs if "PCFSoft" not in l))
finally:
    b.close()
sys.exit(0 if ok else 1)
