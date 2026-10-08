# PIVOOOOT!

Two-player online co-op: two bean characters carry a couch through obstacle courses. three.js from
a CDN, plain ES modules, no build step, no dependencies to install. Online play is WebRTC through
PeerJS's public broker, so the whole game is a static site. `node` is not installed on this
machine; a syntax error shows up as a page that fails to load in the headless check.

## Where things are

| Need to change… | Look in |
|---|---|
| Any number (speeds, jump, couch size, reach, net rates, shout lines) | `src/config.js` |
| A level: geometry, movers, checkpoints, hints, set dressing | `src/levels.js` (format in the header comment) |
| Movement, collisions, the couch solver | `src/physics.js` |
| Level state, checkpoints, win, what goes over the network | `src/game.js` |
| Connection (PeerJS, and the BroadcastChannel stand-in for tests) | `src/net.js` |
| Keys and touch controls | `src/input.js` |
| Materials, painted textures, mover models, props, camera, particles | `src/view.js` |
| The beans' and the couch's models and procedural animation | `src/models.js` |
| Sounds, the beans' voices, the music loop (all synthesized) | `src/audio.js` |
| Screens, HUD, speech bubbles, the frame loop, network message handling | `src/main.js`, `index.html`, `style.css` |
| Test hooks (`?dev`): autopilot, `dev.put`, `dev.run` | `src/dev.js` |

## How the simulation works

- World = axis-aligned boxes. +x east (screen right), +z south (towards the camera), +y up. The
  camera always looks from the south, so walls on the south side of a walkway are cut away
  (`vis: 0` = invisible but solid, `vis: 1.3` = drawn low).
- A bean is an upright cylinder that walks up anything lower than `STEP` (in the air only
  `LEDGE`, so nobody jumps onto a bar meant to be ducked). The couch is a capsule between the two
  beans' hands. It is **stateless**: every step it starts at the hands, is made rigid again, is
  pushed out of the world, and whatever distance is left between a bean and its end of the couch
  moves the bean. That is why a blocked couch blocks the beans.
- The couch is where the hands hold it. The world only ever pushes it **sideways** (it cannot
  ride up over a box or squeeze under a bar by being walked into one); a bean on its feet keeps
  its end within `ARM_GIVE` of its hold height (`grip`), so a squeezed couch does not tilt by
  itself and a standing bean is never lifted by it. It can rest on something it was lowered onto
  (the hands follow). Only a bean in the air is carried by its end of the couch (hanging).
- Walking along the couch while the partner stands still is hauling: `TOW_SLOW`. It is decided
  from the two inputs alone, so both machines agree.
- Fixed 120 Hz steps (`Game.update` accumulates). Movers are a function of the level clock.
- Nothing in the physics is rotated. A thing that turns (sweeper arms, turning bridges) is a
  `spin` plus a set of small boxes riding round it (`'orbit'` movers, built by `sweeper()` and
  `turnBridge()` in `levels.js`); the view draws one model per spin and turns it by `spinAngle`.
  A box with `belt: [vx, vz]` is a conveyor.
- Online: each browser owns its own bean and sends its state 60 times a second; the other bean is
  simulated locally from its last input and eased (`NET.EASE`) towards where the report says it
  is **by now** (the report run forward by half the round trip, `Game.applyRemote`). Height is the
  exception: taken from reports only on the way up in a jump, never eased into a floor. The couch
  is never sent, both sides derive it. The host's clock is the level clock.
- Every state and event message carries `app.run` (bumped by the host at each level start) and
  is dropped if it is from another run; `epoch` counts respawns inside a run. Without the run
  tag, the last messages of one level corrupt the next (checkpoint index, positions).
- The room must survive a host on a tablet: `net.js` puts the broker link back when it drops or
  the page returns to view, never lets a half-open connection block the next knock, and a
  joining guest keeps knocking for 30 s. `peertest.py` exercises all three.
- `game.events` is the only way the simulation talks to the rest (sounds, toasts, network).

## Testing

```sh
tools/setup.sh        # once (a venv with websocket-client)
tools/serve.sh &      # http://localhost:8770/, everything below expects it
tools/.venv/bin/python tools/playtest.py            # autopilot finishes every level (routes.json)
tools/.venv/bin/python tools/nettest.py             # host + guest in two iframes, no network needed
tools/.venv/bin/python tools/peertest.py            # same through real PeerJS/WebRTC (needs internet)
tools/.venv/bin/python tools/shots.py NAME LEVEL [CHECKPOINT] [SECONDS] [JS]   # screenshot -> tools/out/
tools/.venv/bin/python tools/cdp.py steps.json [url]                            # scripted page session
```

- After changing a level or any physics number, run `playtest.py`. If a level's geometry moved,
  its route in `tools/routes.json` (a list of where each bean stands, see `src/dev.js`) moves too.
  The output lists every bonk (`hits`: step, time, bean, x, z). Route steps marked `dodge` are
  played by reflex (hop, wait, duck) instead of by timing; `pilot(i, steps, { delay })` starts at
  another moment of the obstacles' cycles.
- After a visual change take a screenshot with `shots.py` and look at it.
- After touching `net.js`, `game.snapshot/applyRemote` or the message handling in `main.js`, run
  `nettest.py` (it also delays every message by 100 ms and measures how far the two sides'
  ideas of each bean drift apart) and `peertest.py`. `tools/duo.html` is the same two-player page for a human.
- Headless Chrome hardly runs `requestAnimationFrame`: open pages with `?dev&manual` and step
  them with `dev.run(seconds, [inputA, inputB])`. Other URL switches: `?level=N` (straight into a
  level on one keyboard), `?room=CODE` (join), `?net=bc` (BroadcastChannel instead of PeerJS).
- Throwaway files go in `tools/out/` (git-ignored).

## Things to know before changing it

- A new obstacle that blocks must leave a way through: the couch body is 2.4 long and 0.8 thick,
  the hands are 3.3 apart, a jump clears about 1.3 up and 2.9 along. Holding high puts the couch's
  underside 1.4 above the feet, holding low puts its top at 0.9 and the bean's head at 0.95.
- A box to duck under uses the `bar()` helper (underside at 1.2: a couch held low and level clears
  it by 0.3, a tilted one may not); box-pile obstacles are 0.7 high. Leave 4 between a bar and a
  box pile, or one bean is on the pile (couch tilted up) while the other is under the bar.
- Sweeper arms to hop are at 0.2 to 0.4 (the couch passes over them at normal height), arms to
  duck at 1.1 to 1.35. A hop only clears an arm that crosses the bean in under about half a
  second, so keep arms moving at 3.5 m/s or more where beans are meant to stand (speed = 2π ×
  radius / period). `GRACE` forgives a clipped toe.
- A turning bridge of half-length 2.8 needs its banks 3 from the centre (0.2 gap when docked).
- Colours come from the palette at the top of `style.css` and `COLORS` in `config.js`; textures
  are painted in `view.js` (`PAT`) and laid out in world units, so neighbouring boxes tile.
- The user plays on an iPad too: check the touch layout (`{"viewport": [w, h], "touch": true}` in a
  cdp script) when changing the HUD.
