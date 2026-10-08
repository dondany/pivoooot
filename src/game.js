// One level being played: two beans, a couch, the level clock. No rendering, no DOM.
// The view reads this state; main.js feeds it input and drains `events`.
import { PHYS as P, NET } from './config.js';
import { makePlayer, updateMovers, integrate, collide, snapDown, solveCouch } from './physics.js';

const inZone = (z, x, y, zz) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1 && zz >= z.z0 && zz <= z.z1;

export class Game {
  constructor(def, index) {
    this.def = def; this.index = index;
    this.level = def.build();
    const boxes = this.level.boxes.filter(b => !b.deco);
    for (const b of boxes) {
      if (!b.move) continue;
      b.bx = b.x0; b.by = b.y0; b.bz = b.z0;
      b.sx = b.x1 - b.x0; b.sy = b.y1 - b.y0; b.sz = b.z1 - b.z0;
      b.dx = b.dy = b.dz = 0;
    }
    this.statics = boxes.filter(b => !b.move);
    this.movers = boxes.filter(b => b.move);
    this.near = boxes;
    this.players = [makePlayer(0), makePlayer(1)];
    this.couch = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, hit: 0 };
    this.time = 0; this.acc = 0;
    this.epoch = 0;          // bumps on every respawn; stale network states carry an old one
    this.cp = 0;
    this.done = false; this.finalTime = 0;
    this.stats = { shouts: 0, falls: 0, bonks: 0 };
    this.hinted = new Set();
    this.events = [];
    updateMovers(this.movers, 0);
    this.place();
  }

  place() {
    const s = this.level.cps[this.cp].spawn;
    this.players.forEach((p, i) => {
      p.x = s[i][0]; p.y = s[i][1]; p.z = s[i][2];
      p.vx = p.vy = p.vz = 0;
      p.hold = P.HOLD_MID; p.height = P.H; p.stun = 0; p.safe = P.SAFE;
      p.grounded = p.was = true; p.ground = null; p.jbuf = 0; p.jumpQ = false;
      p.input.mx = p.input.mz = p.input.hold = 0;
      p.nx = p.ny = p.nz = 0;
      p.face = Math.atan2(s[1 - i][0] - s[i][0], s[1 - i][2] - s[i][2]);
    });
    const [a, b] = this.players, c = this.couch;
    c.ax = a.x; c.ay = a.y + a.hold; c.az = a.z; c.bx = b.x; c.by = b.y + b.hold; c.bz = b.z;
  }

  respawn(epoch) {
    this.epoch = epoch ?? this.epoch + 1;
    this.place();
    this.events.push({ type: 'respawn' });
  }

  get mid() {
    const c = this.couch;
    return { x: (c.ax + c.bx) / 2, y: (c.ay + c.by) / 2, z: (c.az + c.bz) / 2 };
  }

  update(dt) {
    const [a, b] = this.players;
    const x0 = Math.min(a.x, b.x) - 4, x1 = Math.max(a.x, b.x) + 4, y0 = Math.min(a.y, b.y) - 4,
      y1 = Math.max(a.y, b.y) + 5, z0 = Math.min(a.z, b.z) - 4, z1 = Math.max(a.z, b.z) + 4;
    this.near = this.statics.filter(q => q.x1 > x0 && q.x0 < x1 && q.y1 > y0 && q.y0 < y1 && q.z1 > z0 && q.z0 < z1)
      .concat(this.movers);
    const ease = 1 - Math.exp(-dt * NET.EASE);
    for (const p of this.players) {
      if (p.local) continue;
      p.x += p.nx * ease; p.y += p.ny * ease; p.z += p.nz * ease;
      p.nx -= p.nx * ease; p.ny -= p.ny * ease; p.nz -= p.nz * ease;
    }
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= P.DT) { this.step(P.DT); this.acc -= P.DT; }
    this.zones();
  }

  step(dt) {
    if (!this.done) this.time += dt;
    updateMovers(this.movers, this.time);
    const boxes = this.near, ps = this.players;
    for (const p of ps) {
      p.was = p.grounded; p.hit = null;
      integrate(p, dt, boxes, ps[1 - p.i]);
      p.fallV = p.vy;
      p.g1 = collide(p, boxes);
    }
    solveCouch(ps[0], ps[1], this.couch, boxes, dt);
    for (const p of ps) {
      const g2 = collide(p, boxes);
      p.grounded = p.g1 || g2 || (p.was && !p.jumped && p.vy <= 0 && snapDown(p, boxes));
      if (p.grounded && !p.was && p.fallV < -4) this.events.push({ type: 'land', i: p.i, v: -p.fallV });
      while (p.ev.length) this.events.push({ type: p.ev.pop(), i: p.i });
      if (p.local && p.hit && p.stun <= 0 && p.safe <= 0 && !this.done) this.bonk(p, p.hit);
    }
  }

  bonk(p, b) {
    let nx = p.x - (b.x0 + b.x1) / 2, nz = p.z - (b.z0 + b.z1) / 2;
    if (b.move) { nx += (b.dx || 0) * 400; nz += (b.dz || 0) * 400; }   // mostly the way the thing is travelling
    const n = Math.hypot(nx, nz) || 1;
    p.vx = nx / n * P.BONK_V; p.vz = nz / n * P.BONK_V; p.vy = P.BONK_UP;
    p.stun = P.STUN; p.safe = P.STUN + 0.4; p.grounded = false;
    this.stats.bonks++;
    this.events.push({ type: 'bonk', i: p.i });
  }

  zones() {
    if (this.done) return;
    const l = this.level, m = this.mid;
    for (const p of this.players) if (p.local && p.y < l.killY) { this.events.push({ type: 'fell', i: p.i }); return; }
    for (let i = this.cp + 1; i < l.cps.length; i++) {
      if (inZone(l.cps[i].zone, m.x, m.y, m.z)) { this.cp = i; this.events.push({ type: 'checkpoint', cp: i }); }
    }
    l.hints.forEach((h, i) => {
      if (!this.hinted.has(i) && inZone(h.zone, m.x, m.y, m.z)) { this.hinted.add(i); this.events.push({ type: 'hint', text: h.text }); }
    });
    if (inZone(l.goal, m.x, m.y, m.z) && this.players.every(p => p.grounded)) this.finish(this.time);
  }

  finish(time) {
    if (this.done) return;
    this.done = true; this.finalTime = time;
    for (const p of this.players) p.input.mx = p.input.mz = p.input.hold = 0;
    this.events.push({ type: 'win', time });
  }

  // ---- network: each side owns its own bean and reports it; the other side's is a prediction ----
  snapshot(i) {
    const p = this.players[i], r = v => Math.round(v * 1000) / 1000;
    return { e: this.epoch, c: this.cp, t: r(this.time), p: [r(p.x), r(p.y), r(p.z)], v: [r(p.vx), r(p.vy), r(p.vz)],
      i: [r(p.input.mx), r(p.input.mz), p.input.hold], h: r(p.hold), s: r(p.stun), f: r(p.face), g: p.grounded ? 1 : 0 };
  }

  // lag: seconds since the report was made. The bean has moved on since, so aim for where it
  // will be by now, and let update() ease it there instead of jumping.
  applyRemote(i, s, lag = 0) {
    if (s.e < this.epoch) return;
    const p = this.players[i];
    const walking = Math.abs(s.i[0]) + Math.abs(s.i[1]) > 0.1 || !s.g;     // a bean letting go of the stick stops almost at once
    const k = Math.min(NET.MAX_LEAD, lag) * (walking ? 1 : 0.3);
    const ex = s.p[0] + s.v[0] * k - p.x, ez = s.p[2] + s.v[2] * k - p.z;
    // Height. In the air the report is run forward like the rest. On the way up the bean is simply
    // put there (a late take-off looks worse than a pop). On the way down it is only nudged, and
    // landing is left to the simulation here, which knows where the floor is: a report run forward
    // can end up under it. On the ground, height is corrected only if it is plainly the wrong floor.
    const air = !s.g, vy = s.v[1] - (air ? P.GRAVITY * k : 0), rising = air && vy > 0;
    const ey = s.p[1] + (air ? s.v[1] * k - 0.5 * P.GRAVITY * k * k : 0) - p.y;
    if (ex * ex + ey * ey + ez * ez > NET.SNAP * NET.SNAP) { p.x += ex; p.y = s.p[1] + 0.05; p.z += ez; p.nx = p.ny = p.nz = 0; }
    else { p.nx = ex; p.nz = ez; p.ny = air && !rising && !p.grounded ? Math.max(-0.3, Math.min(0.3, ey)) : 0; }
    if (rising) p.y += ey; else if (!air && Math.abs(ey) > 1) p.y = s.p[1] + 0.05;
    if (s.v[1] > 6 && p.vy < 3) this.events.push({ type: 'jump', i });     // their jump, for the sound and the dust
    p.vx = s.v[0]; p.vz = s.v[2];
    if (air || p.grounded) p.vy = vy;
    p.input.mx = s.i[0]; p.input.mz = s.i[1]; p.input.hold = s.i[2];
    p.hold += (s.h - p.hold) * 0.5; p.stun = s.s; p.face = s.f;
    if (s.c > this.cp) this.cp = s.c;
  }
}
