// Loaded only with ?dev. An autopilot that walks both beans through a list of formations, with
// the simulation stepped synchronously (no rendering), to prove a level can be finished.
//
//   pilot(levelIndex, steps) -> { ok, time, step, falls, bonks, a, b }
// A step is { a: [x, z], b: [x, z] } (where each bean should stand) plus optional:
//   ha, hb: -1 | 0 | 1   couch held low / normal / high (sticks until changed)
//   ja, jb: true         that bean jumps as the step begins
//   until: [period, from, to]   first wait until the level clock, as a fraction of period, is in from..to
//   wait: seconds        stand still that long after arriving
//   tol: metres          how close counts as arrived (default 0.3)
import { LEVELS } from './levels.js';
import { Game } from './game.js';

export function pilot(index, steps, opts = {}) {
  const g = new Game(LEVELS[index], index), [a, b] = g.players, dt = 1 / 60, hold = [0, 0];
  let i = 0, stepT = 0, waited = 0, begun = false;
  const drive = (p, to, tol) => {
    const dx = to[0] - p.x, dz = to[1] - p.z, d = Math.hypot(dx, dz);
    p.input.mx = d > tol ? dx / d : 0; p.input.mz = d > tol ? dz / d : 0;
    return d <= tol;
  };
  const r = v => Math.round(v * 100) / 100;
  const report = ok => ({ ok, time: r(g.time), step: i, falls: g.stats.falls, bonks: g.stats.bonks, cp: g.cp,
    a: [r(a.x), r(a.y), r(a.z)], b: [r(b.x), r(b.y), r(b.z)] });
  while (i < steps.length && g.time < (opts.max || 300)) {
    const s = steps[i], tol = s.tol || 0.3;
    if (s.ha != null) hold[0] = s.ha;
    if (s.hb != null) hold[1] = s.hb;
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
      stepT += dt;
    }
    g.update(dt);
    for (const e of g.events.splice(0)) {
      if (e.type === 'fell') { g.stats.falls++; if (opts.stopOnFall !== false) return report(false); g.respawn(); }
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
