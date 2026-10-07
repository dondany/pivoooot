// The whole simulation, with no three.js in it: beans are upright cylinders, the world is
// axis-aligned boxes, the couch is a capsule strung between the two beans' hands.
import { PHYS as P } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function makePlayer(i) {
  return {
    i, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    grounded: true, was: true, ground: null, coyote: 0, jbuf: 0, jumpQ: false, jumped: false,
    hold: P.HOLD_MID, height: P.H, stun: 0, safe: 0, hit: null, hang: false, towing: false, towed: false, face: Math.PI / 2,
    local: true, input: { mx: 0, mz: 0, hold: 0 }, ev: [],
  };
}

// Moving boxes follow the level clock, so both players see them in the same place.
export function updateMovers(movers, t) {
  for (const b of movers) {
    const m = b.move;
    let u = t / m.period + (m.phase || 0);
    u -= Math.floor(u);
    let f;
    if (m.mode === 'loop') f = u;
    else if (m.mode === 'slam') f = u < 0.12 ? u / 0.12 : u < 0.42 ? 1 : u < 0.6 ? 1 - (u - 0.42) / 0.18 : 0;
    else f = 0.5 - 0.5 * Math.cos(u * 2 * Math.PI);
    const nx = b.bx + m.to[0] * f, ny = b.by + m.to[1] * f, nz = b.bz + m.to[2] * f;
    let dx = nx - b.x0, dy = ny - b.y0, dz = nz - b.z0;
    if (!b.started || Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 2) dx = dy = dz = 0;   // first frame, or a loop wrapping round
    b.started = true;
    b.dx = dx; b.dy = dy; b.dz = dz;
    b.x0 = nx; b.y0 = ny; b.z0 = nz;
    b.x1 = nx + b.sx; b.y1 = ny + b.sy; b.z1 = nz + b.sz;
  }
}

const heightFor = hold => (hold >= P.HOLD_MID ? P.H
  : P.H_CROUCH + (P.H - P.H_CROUCH) * (hold - P.HOLD_LOW) / (P.HOLD_MID - P.HOLD_LOW));

function fits(p, h, boxes) {
  const R2 = P.R * P.R;
  for (const b of boxes) {
    if (p.y + 0.05 >= b.y1 || p.y + h <= b.y0) continue;
    const dx = p.x - clamp(p.x, b.x0, b.x1), dz = p.z - clamp(p.z, b.z0, b.z1);
    if (dx * dx + dz * dz < R2) return false;
  }
  return true;
}

// Input -> velocity -> position. Collisions come after.
export function integrate(p, dt, boxes) {
  const inp = p.input;
  p.stun = Math.max(0, p.stun - dt);
  p.safe = Math.max(0, p.safe - dt);
  const ctl = p.stun <= 0;

  const want = ctl ? inp.hold : 0;
  const tgt = want > 0 ? P.HOLD_HIGH : want < 0 ? P.HOLD_LOW : P.HOLD_MID;
  const nh = p.hold + clamp(tgt - p.hold, -P.HOLD_SPEED * dt, P.HOLD_SPEED * dt);
  const nHeight = heightFor(nh);
  if (nHeight <= p.height || fits(p, nHeight, boxes)) { p.hold = nh; p.height = nHeight; }   // no standing up under a pipe

  let mx = ctl ? inp.mx : 0, mz = ctl ? inp.mz : 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const sp = P.RUN * (Math.abs(p.hold - P.HOLD_MID) > 0.15 ? P.HOLD_SLOW : 1) * (p.towing ? P.TOW_SLOW : 1);
  const acc = (p.grounded ? (ctl ? P.ACCEL * (p.towed ? P.TOW_GRIP : 1) : 5) : P.AIR_ACCEL) * dt;
  if (p.grounded || ml > 0.05) {     // in the air with no input, momentum carries
    let ax = mx * sp - p.vx, az = mz * sp - p.vz;
    const al = Math.hypot(ax, az);
    if (al > acc) { ax *= acc / al; az *= acc / al; }
    p.vx += ax; p.vz += az;
  }
  if (ml > 0.1) p.face = Math.atan2(mx, mz);

  p.coyote = p.grounded ? P.COYOTE : p.coyote - dt;
  if (p.jumpQ) { p.jbuf = P.JUMP_BUFFER; p.jumpQ = false; } else p.jbuf -= dt;
  p.jumped = false;
  if (ctl && p.jbuf > 0 && p.coyote > 0) {
    p.vy = P.JUMP_V; p.jbuf = 0; p.coyote = 0; p.grounded = false; p.jumped = true;
    p.ev.push('jump');
  }
  p.vy = Math.max(p.vy - P.GRAVITY * dt, -P.MAX_FALL);

  const g = p.ground;
  if (p.grounded && g && g.move) { p.x += g.dx; p.y += g.dy; p.z += g.dz; }   // ride a moving floor
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
}

// Push a bean out of the boxes. Returns whether it ended up standing on something.
export function collide(p, boxes) {
  const R = P.R, R2 = R * R, H = p.height;
  // Walls first, so a railing beside a step stops you before the step can lift you.
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (p.y >= b.y1 || p.y + H <= b.y0) continue;
    const dx = p.x - clamp(p.x, b.x0, b.x1), dz = p.z - clamp(p.z, b.z0, b.z1), d2 = dx * dx + dz * dz;
    if (d2 >= R2) continue;
    if (b.hazard) p.hit = b;
    if (b.y1 - p.y <= P.STEP) continue;                       // a floor or a step: second pass
    if (p.vy > 0 && p.y + H - b.y0 <= 0.35) continue;         // a ceiling: second pass
    let nx = 0, nz = 0, push;
    if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; push = R - d; }
    else {                                                    // centre is inside: leave by the nearest side
      const l = p.x - b.x0, r = b.x1 - p.x, n = p.z - b.z0, s = b.z1 - p.z, m = Math.min(l, r, n, s);
      if (m === l) nx = -1; else if (m === r) nx = 1; else if (m === n) nz = -1; else nz = 1;
      push = m + R;
    }
    p.x += nx * push; p.z += nz * push;
    const vn = p.vx * nx + p.vz * nz;
    if (vn < 0) { p.vx -= vn * nx; p.vz -= vn * nz; }
  }
  let grounded = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (p.y >= b.y1 || p.y + H <= b.y0) continue;
    const dx = p.x - clamp(p.x, b.x0, b.x1), dz = p.z - clamp(p.z, b.z0, b.z1);
    if (dx * dx + dz * dz >= R2) continue;
    if (b.y1 - p.y <= P.STEP) {
      p.y = b.y1;
      if (p.vy <= 0) { p.vy = 0; grounded = true; p.ground = b; }
    } else if (p.vy > 0 && p.y + H - b.y0 <= 0.35) { p.y = b.y0 - H; p.vy = 0; }
  }
  return grounded;
}

// Walking down stairs: stick to a floor that is just below instead of hopping off each step.
export function snapDown(p, boxes) {
  const R2 = P.R * P.R;
  let best = -Infinity, ground = null;
  for (const b of boxes) {
    if (b.y1 > p.y + 1e-6 || b.y1 < p.y - P.STEP || b.y1 <= best) continue;
    const dx = p.x - clamp(p.x, b.x0, b.x1), dz = p.z - clamp(p.z, b.z0, b.z1);
    if (dx * dx + dz * dz < R2) { best = b.y1; ground = b; }
  }
  if (!ground) return false;
  p.y = best; p.vy = 0; p.ground = ground;
  return true;
}

// ---- the couch ----
// Stateless: each step it starts at the two hands, is made rigid again (the rod), is pushed out
// of the world, and whatever distance it then is from a bean's hands drags that bean along.
const A = { x: 0, y: 0, z: 0 }, B = { x: 0, y: 0, z: 0 }, e1 = { x: 0, z: 0 }, e2 = { x: 0, z: 0 };
const S0 = (P.ROD - P.COUCH_LEN) / 2 / P.ROD, S1 = 1 - S0;

function rod() {
  const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, k = 0.5 * (len - P.ROD) / len;
  A.x += dx * k; A.y += dy * k; A.z += dz * k;
  B.x -= dx * k; B.y -= dy * k; B.z -= dz * k;
}

// A ball of the couch's radius at fraction s along the rod, pushed out of box b.
function pushOut(s, b) {
  const r = P.COUCH_R;
  const px = A.x + (B.x - A.x) * s, py = A.y + (B.y - A.y) * s, pz = A.z + (B.z - A.z) * s;
  let nx = px - clamp(px, b.x0, b.x1), ny = py - clamp(py, b.y0, b.y1), nz = pz - clamp(pz, b.z0, b.z1);
  const d2 = nx * nx + ny * ny + nz * nz;
  if (d2 >= r * r) return 0;
  let pen;
  if (d2 > 1e-10) { const d = Math.sqrt(d2); nx /= d; ny /= d; nz /= d; pen = r - d; }
  else {
    const f = [px - b.x0, b.x1 - px, py - b.y0, b.y1 - py, pz - b.z0, b.z1 - pz];
    let m = 0;
    for (let i = 1; i < 6; i++) if (f[i] < f[m]) m = i;
    nx = ny = nz = 0;
    if (m < 2) nx = m ? 1 : -1; else if (m < 4) ny = m === 3 ? 1 : -1; else nz = m === 5 ? 1 : -1;
    pen = f[m] + r;
  }
  const wa = 1 - s, wb = s, k = pen / (wa * wa + wb * wb);
  A.x += nx * wa * k; A.y += ny * wa * k; A.z += nz * wa * k;
  B.x += nx * wb * k; B.y += ny * wb * k; B.z += nz * wb * k;
  return pen;
}

const idle = p => p.grounded && p.stun <= 0 && Math.abs(p.input.mx) + Math.abs(p.input.mz) < 0.1;

// How far the couch end E is beyond the reach of bean p's arms, sideways.
function excess(p, E, out) {
  const ox = E.x - p.x, oz = E.z - p.z, hl = Math.hypot(ox, oz), k = hl > P.ARM_SLACK ? (hl - P.ARM_SLACK) / hl : 0;
  out.x = ox * k; out.z = oz * k;
}

function drag(p, cx, cz, dt) {
  const v = P.PULL_V;
  p.x += cx; p.z += cz;
  p.vx += clamp(cx / dt, -v, v); p.vz += clamp(cz / dt, -v, v);
}

// Up and down, the arms give a little around the height the bean is holding at. Past that the
// couch carries the bean: hanging from it, or (holding it high) hauling a hanging partner up.
function arm(p, E, dt) {
  const rel = E.y - p.y, hi = Math.min(P.REACH_MAX, p.hold + P.ARM_GIVE), lo = Math.max(P.REACH_MIN, p.hold - P.ARM_GIVE);
  p.hang = false;
  if (rel > hi) {
    const c = rel - hi;
    p.y += c; p.vy += Math.min(c / dt, P.PULL_V * 2); p.hang = !p.grounded;
  } else if (rel < lo) {
    const c = rel - lo;
    p.y += c; p.vy += Math.max(c / dt, -P.PULL_V);
  }
}

export function solveCouch(p1, p2, couch, boxes, dt) {
  A.x = p1.x; A.y = p1.y + p1.hold; A.z = p1.z;
  B.x = p2.x; B.y = p2.y + p2.hold; B.z = p2.z;
  const r = P.COUCH_R;
  let hit = 0;
  for (let it = 0; it < 4; it++) {
    rod();
    const x0 = Math.min(A.x, B.x) - r, x1 = Math.max(A.x, B.x) + r, y0 = Math.min(A.y, B.y) - r,
      y1 = Math.max(A.y, B.y) + r, z0 = Math.min(A.z, B.z) - r, z1 = Math.max(A.z, B.z) + r;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.x1 < x0 || b.x0 > x1 || b.y1 < y0 || b.y0 > y1 || b.z1 < z0 || b.z0 > z1) continue;
      // Closest point of the couch to the box, by projecting back and forth a few times.
      const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, dd = dx * dx + dy * dy + dz * dz || 1e-6;
      let s = clamp((((b.x0 + b.x1) / 2 - A.x) * dx + ((b.y0 + b.y1) / 2 - A.y) * dy + ((b.z0 + b.z1) / 2 - A.z) * dz) / dd, S0, S1);
      for (let k = 0; k < 3; k++) {
        const qx = clamp(A.x + dx * s, b.x0, b.x1), qy = clamp(A.y + dy * s, b.y0, b.y1), qz = clamp(A.z + dz * s, b.z0, b.z1);
        s = clamp(((qx - A.x) * dx + (qy - A.y) * dy + (qz - A.z) * dz) / dd, S0, S1);
      }
      hit = Math.max(hit, pushOut(s, b), pushOut(S0, b), pushOut(S1, b));
    }
  }
  rod();
  // Sideways, each bean follows its end of the couch. Hauling a partner who just stands there
  // works, but slowly (see integrate): carrying together is the fast way.
  excess(p1, A, e1); excess(p2, B, e2);
  const i1 = idle(p1), i2 = idle(p2), pull1 = e1.x !== 0 || e1.z !== 0, pull2 = e2.x !== 0 || e2.z !== 0;
  p1.towed = i1 && !i2 && pull1; p2.towed = i2 && !i1 && pull2;
  p1.towing = p2.towed && pull1; p2.towing = p1.towed && pull2;
  // One bean on the ground, one in the air: along the couch, the one in the air does most of the
  // moving, so a partner who falls off a ledge swings under you instead of pulling you straight in.
  let ux = B.x - A.x, uz = B.z - A.z;
  const ul = Math.hypot(ux, uz) || 1;
  ux /= ul; uz /= ul;
  const k = p1.grounded === p2.grounded ? 0 : P.ANCHOR * ((p1.grounded ? e1.x : e2.x) * ux + (p1.grounded ? e1.z : e2.z) * uz);
  drag(p1, e1.x - k * ux, e1.z - k * uz, dt); drag(p2, e2.x - k * ux, e2.z - k * uz, dt);
  arm(p1, A, dt); arm(p2, B, dt);
  couch.ax = A.x; couch.ay = A.y; couch.az = A.z;
  couch.bx = B.x; couch.by = B.y; couch.bz = B.z;
  couch.hit = hit;
}
