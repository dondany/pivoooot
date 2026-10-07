"""Drive the game in headless Chrome over the DevTools protocol.

    tools/.venv/bin/python tools/cdp.py script.json [url]

script.json is a list of steps:
    {"wait": seconds}
    {"eval": "js expression"}          the value is printed as "=> ..."; promises are awaited
    {"shot": "name"}                   screenshot to tools/out/name.png
    {"click": [x, y]}
    {"viewport": [w, h], "mobile": bool, "touch": bool}
The url defaults to http://localhost:8770/ (start it with tools/serve.sh). CDP_PORT picks the
debugging port (default 9340); CHROME_FLAGS adds flags to the Chrome command line.
"""
import base64, json, os, shutil, subprocess, sys, threading, time, urllib.request
import websocket

TOOLS = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(TOOLS, "out")
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
PORT = int(os.environ.get("CDP_PORT", "9340"))


class Browser:
    """A headless Chrome with one page, and a blocking send()."""

    def __init__(self, port=PORT, size=(1280, 800)):
        self.profile = os.path.join(OUT, f"chrome-prof-{port}")
        shutil.rmtree(self.profile, ignore_errors=True)
        self.proc = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={self.profile}",
                                      "--use-angle=swiftshader", "--enable-unsafe-swiftshader", f"--window-size={size[0]},{size[1]}",
                                      "--hide-scrollbars", "--remote-allow-origins=*", "--autoplay-policy=no-user-gesture-required",
                                      *os.environ.get("CHROME_FLAGS", "").split(), "about:blank"],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                page = next(t for t in json.load(urllib.request.urlopen(f"http://localhost:{port}/json")) if t["type"] == "page")
                break
            except Exception:
                time.sleep(0.1)
        self.ws = websocket.create_connection(page["webSocketDebuggerUrl"], max_size=None)
        self.ids = 0
        self.pending = {}
        self.logs = []
        self.lock = threading.Lock()
        threading.Thread(target=self._read, daemon=True).start()
        for m in ("Runtime.enable", "Log.enable", "Page.enable"):
            self.send(m)

    def _read(self):
        while True:
            try:
                m = json.loads(self.ws.recv())
            except Exception:
                return
            if "id" in m:
                with self.lock:
                    self.pending[m["id"]] = m
            elif m.get("method") == "Runtime.consoleAPICalled":
                args = m["params"]["args"]
                self.logs.append(f"[console.{m['params']['type']}] " + " ".join(str(a.get("value", a.get("description", ""))) for a in args))
            elif m.get("method") == "Runtime.exceptionThrown":
                d = m["params"]["exceptionDetails"]
                self.logs.append(f"[EXCEPTION] {d.get('exception', {}).get('description', d.get('text'))}")
            elif m.get("method") == "Log.entryAdded":
                e = m["params"]["entry"]
                if "GPU stall" not in e["text"]:
                    self.logs.append(f"[log.{e['level']}] {e['text']}")

    def send(self, method, params=None, timeout=600):
        with self.lock:
            self.ids += 1
            i = self.ids
        self.ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
        end = time.time() + timeout
        while time.time() < end:
            with self.lock:
                if i in self.pending:
                    return self.pending.pop(i)
            time.sleep(0.005)
        raise TimeoutError(method)

    def js(self, expr, await_promise=True):
        """Evaluate and return the value; raises on a JS exception."""
        r = self.send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": await_promise}).get("result", {})
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description"))
        return r.get("result", {}).get("value")

    def shot(self, path, fmt="png", quality=92):
        params = {"format": fmt} if fmt == "png" else {"format": fmt, "quality": quality}
        data = self.send("Page.captureScreenshot", params)["result"]["data"]
        open(path, "wb").write(base64.b64decode(data))

    def close(self):
        self.proc.kill()


def run(steps, url="http://localhost:8770/"):
    os.makedirs(OUT, exist_ok=True)
    b = Browser()
    try:
        b.send("Page.navigate", {"url": url})
        for step in steps:
            if "wait" in step:
                time.sleep(step["wait"])
            elif "eval" in step:
                try:
                    v = b.js(step["eval"])
                    if v is not None:
                        print("=>", v if isinstance(v, str) else json.dumps(v))
                except RuntimeError as e:
                    print("EVAL ERROR:", e)
            elif "click" in step:
                x, y = step["click"]
                for t in ("mousePressed", "mouseReleased"):
                    b.send("Input.dispatchMouseEvent", {"type": t, "x": x, "y": y, "button": "left", "clickCount": 1})
            elif "viewport" in step:
                w, h = step["viewport"]
                b.send("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": bool(step.get("mobile", w < 700))})
                if step.get("touch"):
                    b.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
            elif "shot" in step:
                b.shot(os.path.join(OUT, step["shot"] + ".png"))
                print("shot", os.path.join("tools/out", step["shot"] + ".png"))
        time.sleep(0.2)
        print("\n".join(b.logs) or "(no console output)")
    finally:
        b.close()


if __name__ == "__main__":
    run(json.load(open(sys.argv[1])), sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8770/")
