// Loaded only with ?dev. An autopilot that walks both beans through a list of formations, with
// the simulation stepped synchronously (no rendering), to prove a level can be finished.
//
//   pilot(levelIndex, steps, { delay, max, stopOnFall }) -> { ok, time, step, falls, bonks, hits, a, b }
// A step is { a: [x, z], b: [x, z] } (where each bean should stand) plus optional:
//   ha, hb: -1 | 0 | 1   couch held low / normal / high (sticks until changed)
//   ja, jb: true         that bean jumps as the step begins
//   until: [period, from, to]   first wait until the level clock, as a fraction of period, is in from..to
//   wait: seconds        stand still that long after arriving
//   tol: metres          how close counts as arrived (default 0.3)
//   dodge: true          play it by reflex, as a person would: a bean hops a low hazard just before
//                        it arrives, does not walk into the back of one, and both duck while a
//                        high one passes over them or the couch
import { LEVELS } from './levels.js';
import { Game } from './game.js';
import { spinAngle } from './physics.js';

// Where the middle of a moving box will be `lead` seconds from now.
function ahead(b, t, lead) {
  const m = b.move;
  if (m.mode !== 'orbit') return [(b.x0 + b.x1) / 2 + b.dx * 120 * lead, (b.z0 + b.z1) / 2 + b.dz * 120 * lead];
  const a = spinAngle(m.spin, t + lead), c = Math.cos(a), s = Math.sin(a);
  return [m.spin.x + m.u * c + m.v * s, m.spin.z - m.u * s + m.v * c];
}

function reflexes(g) {
  const [a, b] = g.players;
  let duck = false;
  for (const h of g.movers) {
    if (!h.hazard) continue;
    for (const p of [a, b]) {            // low enough to hop
      if (!p.grounded || h.y1 <= p.y || h.y1 - p.y > 0.6) continue;
      const [x0, z0] = ahead(h, g.time, 0), [x1, z1] = ahead(h, g.time, 0.05), [x, z] = ahead(h, g.time, 0.3);
      const d = Math.hypot(p.x + p.vx * 0.3 - x, p.z + p.vz * 0.3 - z), gap = Math.hypot(p.x - x0, p.z - z0) || 1;
      const closing = ((x1 - x0) * (p.x - x0) + (z1 - z0) * (p.z - z0)) / 0.05 / gap;    // its speed towards me
      if (d < 0.55 && closing > 1) p.jumpQ = true;             // it is coming for me: the peak of the jump meets it
      else if (d < 0.8) p.input.mx = p.input.mz = 0;           // I am the one walking into it: wait
    }
    if (h.y0 - a.y < 0.9 || h.y0 - a.y > 1.6) continue;
    for (const lead of [0, 0.15, 0.3, 0.45]) {   // overhead: is it over a bean or the couch soon?
      const [x, z] = ahead(h, g.time, lead), dx = b.x - a.x, dz = b.z - a.z;
      const s = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(a.x + dx * s - x, a.z + dz * s - z) < 0.85) duck = true;
    }
  }
  if (duck) a.input.hold = b.input.hold = -1;
}

export function pilot(index, steps, opts = {}) {
  const g = new Game(LEVELS[index], index), [a, b] = g.players, dt = 1 / 60, hold = [0, 0];
  let i = 0, stepT = 0, waited = 0, begun = false;
  const drive = (p, to, tol) => {
    const dx = to[0] - p.x, dz = to[1] - p.z, d = Math.hypot(dx, dz);
    p.input.mx = d > tol ? dx / d : 0; p.input.mz = d > tol ? dz / d : 0;
    return d <= tol;
  };
  const r = v => Math.round(v * 100) / 100;
  const hits = [];     // every bonk: [step, time, who, x, z]
  const report = ok => ({ ok, time: r(g.time), step: i, falls: g.stats.falls, bonks: g.stats.bonks, hits, cp: g.cp,
    a: [r(a.x), r(a.y), r(a.z)], b: [r(b.x), r(b.y), r(b.z)] });
  for (let t = 0; t < (opts.delay || 0); t += dt) g.update(dt);     // start at another moment of every cycle
  while (i < steps.length && g.time < (opts.max || 300)) {
    const s = steps[i], tol = s.tol || 0.3;
    if (begun || !s.until) {             // a step waiting for its moment keeps the previous holds
      if (s.ha != null) hold[0] = s.ha;
      if (s.hb != null) hold[1] = s.hb;
    }
    a.input.hold = hold[0]; b.input.hold = hold[1];
    let there = false;
    if (!begun && s.until) {
      const u = (g.time / s.until[0]) % 1;
      if (u >= s.until[1] && u <= s.until[2]) begun = true;
      a.input.mx = a.input.mz = b.input.mx = b.input.mz = 0;
    } else {
      if (!begun || stepT === 0) { begun = true; if (s.ja) a.jumpQ = true; if (s.jb) b.jumpQ = true; }
      const ta = drive(a, s.a, tol), tb = drive(b, s.b, tol);
      there = ta && tb;
      // A bean that has arrived keeps leaning the way its partner is still going, so it counts as
      // carrying, not as dead weight (hauling a standing partner is slow by design).
      if (ta && !tb) { a.input.mx = b.input.mx * 0.2; a.input.mz = b.input.mz * 0.2; }
      if (tb && !ta) { b.input.mx = a.input.mx * 0.2; b.input.mz = a.input.mz * 0.2; }
      stepT += dt;
    }
    if (s.dodge) reflexes(g);
    g.update(dt);
    for (const e of g.events.splice(0)) {
      if (e.type === 'fell') { g.stats.falls++; if (opts.stopOnFall !== false) return report(false); g.respawn(); }
      if (e.type === 'bonk') hits.push([i, r(g.time), 'ab'[e.i], r(g.players[e.i].x), r(g.players[e.i].z)]);
      if (e.type === 'win') return report(true);
    }
    if (there) { waited += dt; if (waited >= (s.wait || 0)) { i++; stepT = 0; waited = 0; begun = false; } }
    else if (stepT > (s.timeout || 10)) return report(false);
  }
  return report(g.done);
}

export function install(app) {
  window.pilot = pilot;
  window.dev = {
    // Put the beans somewhere and let them settle: dev.put([x, y, z], [x, y, z])
    put(pa, pb) {
      const [a, b] = app.game.players;
      Object.assign(a, { x: pa[0], y: pa[1], z: pa[2], vx: 0, vy: 0, vz: 0 });
      Object.assign(b, { x: pb[0], y: pb[1], z: pb[2], vx: 0, vy: 0, vz: 0 });
      app.view.snap = true;
    },
    // Advance the real game by `seconds` in 60 Hz frames (headless Chrome barely runs rAF), holding
    // an input per bean: dev.run(2, [{ mx: 1, hold: 1 }, { mx: 1, jump: true }])
    run(seconds, input) {
      app.puppet = input || [{}, {}];       // main.js uses this instead of the keyboard
      for (let t = 0; t < seconds; t += 1 / 60) {
        app.frame(1 / 60);
        for (const q of app.puppet) q.jump = q.shout = q.shut = false;   // one-shot buttons
      }
      app.puppet = null;
    },
  };
}
