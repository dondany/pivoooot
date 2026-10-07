// Levels are plain data: boxes to collide with (and draw), zones, props.
// Axes: +x is east (screen right), +z is south (towards the camera), +y is up.
//
// A box is { x0,y0,z0, x1,y1,z1, mat } plus optional:
//   vis: n      draw only the bottom n metres (0 = invisible wall). The camera looks from the
//               south, so walls on the south side of a walkway are cut away like a dollhouse.
//   deco: true  drawn, never collided with
//   move: { to: [dx,dy,dz], period, phase, mode: 'ping' | 'loop' | 'slam' }
//   hazard: true  touching it sends a bean flying
//   look: 'car' | 'roomba' | 'ball' | 'lift' | 'door' | 'goose'   a model instead of a plain box
//   belt: [vx, vz]   a conveyor: carries whoever stands on it
// Things that turn (sweeper arms, turning bridges) are built by sweeper() and turnBridge() below.
// Hint texts use {up} {down} {jump} {shout}, filled in with the player's actual keys.

const mk = () => ({ boxes: [], cps: [], hints: [], props: [], spins: [], killY: -30 });
const add = (l, x0, y0, z0, x1, y1, z1, mat, o) => {
  const b = { x0, y0, z0, x1, y1, z1, mat, ...o };
  l.boxes.push(b);
  return b;
};
const zone = (x0, y0, z0, x1, y1, z1) => ({ x0, y0, z0, x1, y1, z1 });
const cp = (l, z, a, b) => l.cps.push({ zone: z, spawn: [a, b] });
const hint = (l, z, text) => l.hints.push({ zone: z, text });
const prop = (l, type, x, y, z, o) => l.props.push({ type, x, y, z, ...o });

// A bar to duck under, 1.1 above floor level y, with a post at each end so it reads as a barrier.
function bar(l, x0, y, z0, x1, z1) {
  add(l, x0, y + 1.1, z0, x1, y + 1.4, z1, 'pipe');
  const o = { deco: true };
  if (z1 - z0 > x1 - x0) { add(l, x0, y, z0, x1, y + 1.1, z0 + 0.14, 'pipe', o); add(l, x0, y, z1 - 0.14, x1, y + 1.1, z1, 'pipe', o); }
  else { add(l, x0, y, z0, x0 + 0.14, y + 1.1, z1, 'pipe', o); add(l, x1 - 0.14, y, z0, x1, y + 1.1, z1, 'pipe', o); }
}

// ---- things that turn about a vertical axis ----
// The physics has no rotated shapes: a turning thing is a set of small boxes riding round its
// centre ('orbit' movers, see physics.js). The view draws one model per spin and turns it.
function spin(l, x, y, z, o) {
  const s = { x, y, z, period: 6, ...o };
  l.spins.push(s);
  return s;
}
const orbit = (l, s, u, v, y0, y1, size, o) => add(l, s.x + u - size / 2, y0, s.z + v - size / 2, s.x + u + size / 2, y1, s.z + v + size / 2, null,
  { move: { mode: 'orbit', spin: s, u, v }, ...o });

// A post with arms sweeping round it. arms: [turn (0..1 round the post), bottom, top] each;
// heights are above y. Touching an arm sends a bean flying; the couch just gets shoved.
function sweeper(l, x, y, z, len, arms, o = {}) {
  const s = spin(l, x, y, z, { kind: 'sweeper', len, arms, post: 1.2, ...o });
  add(l, x - 0.3, y, z - 0.3, x + 0.3, y + s.post, z + 0.3, 'post');
  for (const [turn, y0, y1] of arms) {
    const a = turn * 2 * Math.PI;
    for (let r = 0.5; r <= len + 0.01; r += 0.24) orbit(l, s, r * Math.cos(a), r * Math.sin(a), y + y0, y + y1, 0.24, { hazard: true });
  }
  return s;
}

// A plank, 2 * half long and 1.6 wide, turning about its middle in quarter turns with a pause
// between. With steps: 4 it lies east-west, then north-south, and so on.
function turnBridge(l, x, y, z, half, o = {}) {
  const s = spin(l, x, y, z, { kind: 'bridge', half, steps: 4, move: 0.4, period: 16, ...o });
  for (let u = -half + 0.25; u < half; u += 0.5) for (const v of [-0.5, 0, 0.5]) orbit(l, s, u, v, y - 0.3, y, 0.6);
  return s;
}

const RUN = 0.5, RISE = 0.25;

// A flight of n steps starting at x and climbing in direction dir. rail = z of a handrail, if any.
function flight(l, x, y, z0, z1, dir, n, rail) {
  for (let i = 0; i < n; i++) {
    const xa = x + dir * i * RUN, xb = x + dir * (i + 1) * RUN, top = y + (i + 1) * RISE;
    add(l, Math.min(xa, xb), -0.5, z0, Math.max(xa, xb), top, z1, 'stair');
    if (rail != null) add(l, Math.min(xa, xb), top, rail, Math.max(xa, xb), top + 1, rail + 0.12, 'rail');
  }
}

// ---------------------------------------------------------------- 1: the stairwell
function stairwell() {
  const l = mk();
  // Flights are W wide, 5 long and 2.5 high; landings are D deep. At W = 2 the couch only just
  // fits across a landing, so the corners want the couch lifted over the railing.
  const W = 2, D = 2.2, N = 10, FL = N * RUN, FH = N * RISE;
  l.theme = 'indoor';

  // lobby
  add(l, -8, -0.5, 0, 0, 0, W, 'checker');
  add(l, -8.3, 0, 0, -8, 3.4, W, 'paper');
  add(l, -8.3, 0, -0.3, -D - 0.3, 3.4, 0, 'paper');
  add(l, -8.3, 0, W, FL + D + 0.3, 14, W + 0.3, null, { vis: 0 });
  prop(l, 'door', -6.2, 0, 0, { label: 'EXIT' });
  prop(l, 'plant', -7.4, 0, 0.5);
  prop(l, 'frame', -4.2, 1.5, 0, { c: '#e0693e' });

  // flight 1 east, landing A, flight 2 west, landing B, flight 3 east, landing C
  flight(l, 0, 0, 0, W, 1, N);
  add(l, FL, -0.5, -W, FL + D, FH, W, 'landing');
  add(l, FL + D, 0, -W, FL + D + 0.3, FH + 3.2, W, 'paper');
  flight(l, FL, FH, -W, 0, -1, N, -0.12);
  add(l, -D, -0.5, -2 * W, 0, 2 * FH, 0, 'landing');
  add(l, -D, 2 * FH, -0.12, 0, 2 * FH + 1, 0, 'rail');
  add(l, -D - 0.3, 0, -2 * W, -D, 2 * FH + 3.2, 0, 'paper');
  flight(l, 0, 2 * FH, -2 * W, -W, 1, N, -W - 0.12);
  add(l, FL, -0.5, -2 * W, FL + D, 3 * FH, -W, 'landing');
  add(l, FL, 3 * FH, -W - 0.12, FL + D, 3 * FH + 1, -W, 'rail');
  prop(l, 'frame', FL + D / 2, 2 * FH + 1.2, -2 * W, { c: '#2a9d8f' });   // on the back wall

  // top hallway, then the apartment
  const Y = 3 * FH, HX = FL + D, AN = -2 * W - 2.4, AS = -W + 1.2, AC = (AN + AS) / 2;
  add(l, HX, -0.5, -2 * W, 20, Y, -W, 'hall');
  add(l, HX, Y, -W, 20, Y + 5, -W + 0.3, null, { vis: 0 });
  add(l, -D - 0.3, 0, -2 * W - 0.3, 20, Y + 3.6, -2 * W, 'paper');
  bar(l, 11.35, Y, -2 * W, 11.65, -W);
  add(l, 16.6, Y, -2 * W, 17.4, Y + 0.7, -W, 'crate');
  prop(l, 'frame', 14, Y + 1.6, -2 * W, { c: '#e9b44c' });
  prop(l, 'door', 9.4, Y, -2 * W, { label: '19' });
  prop(l, 'plant', 19.3, Y, -2 * W + 0.5);

  add(l, 20, -0.5, AN, 28, Y, AS, 'apt');
  add(l, 20, Y, AN - 0.3, 28.3, Y + 3.6, AN, 'paper2');
  add(l, 28, Y, AN, 28.3, Y + 3.6, AS, 'paper2');
  add(l, 19.85, Y, AN, 20.15, Y + 3.6, -2 * W, 'paper2');
  add(l, 19.85, Y, -W, 20.15, Y + 3.6, AS, 'paper2', { vis: 1.2 });
  add(l, 20, Y, AS, 28.3, Y + 5, AS + 0.3, null, { vis: 0 });
  prop(l, 'rug', 24.5, Y, AC, { w: 4.6, d: 3.4 });
  prop(l, 'plant', 27.3, Y, AN + 0.6);
  prop(l, 'frame', 24.5, Y + 1.7, AN, { c: '#ff5c8a', w: 1.6 });
  prop(l, 'lamp', 21.2, Y + 3.3, AN + 0.6);
  l.goal = zone(22.5, Y - 0.2, AC - 1.7, 26.5, Y + 2.5, AC + 1.7);

  cp(l, null, [-3, 0, W / 2], [-6.3, 0, W / 2]);
  cp(l, zone(FL + 0.3, FH - 0.2, -W, HX, FH + 2.5, W), [FL + D / 2, FH, -1.6], [FL + D / 2, FH, 1.6]);
  cp(l, zone(-D, 2 * FH - 0.2, -2 * W, -0.3, 2 * FH + 2.5, 0), [-D / 2, 2 * FH, -2 * W + 0.4], [-D / 2, 2 * FH, -0.5]);
  cp(l, zone(HX, Y - 0.2, -2 * W, HX + 2, Y + 2.5, -W), [HX + 1.2, Y, -1.5 * W], [HX - 2.1, Y, -1.5 * W]);

  hint(l, zone(-8, -1, 0, -1, 3, W), 'You each hold one end. Walk it up the stairs, together.');
  hint(l, zone(3, 1, 0, HX, 6, W), 'Tight corner! Both hold {up} to lift the couch over the railing as you turn. And yell {shout}.');
  hint(l, zone(HX + 0.5, Y - 1, -2 * W, 10.6, Y + 3, -W), 'Low pipe. Both hold {down} to duck under it.');
  hint(l, zone(13, Y - 1, -2 * W, 16, Y + 3, -W), 'Boxes! Hold {up} to raise the couch, then {jump} over them.');
  hint(l, zone(19, Y - 1, AN, 22, Y + 3, AS), 'Onto the rug with it!');
  return l;
}

// ---------------------------------------------------------------- 2: the hallway
function hallway() {
  const l = mk();
  l.theme = 'hall';
  const T = 3.2;   // wall height

  // corridor A, heading east
  add(l, 0, -0.5, 0, 16.4, 0, 2.4, 'tile');
  add(l, -0.3, 0, 0, 0, T, 2.4, 'paperB');
  add(l, -0.3, 0, -0.3, 12.4, T, 0, 'paperB');
  add(l, -0.3, 0, 2.4, 16.7, T, 2.7, null, { vis: 0 });
  add(l, 5.9, 0, 0.1, 6.5, 0.22, 0.7, null, { look: 'roomba', hazard: true, move: { to: [0, 0, 1.6], period: 2.6 } });
  bar(l, 8.8, 0, 0, 9.1, 2.4);
  bar(l, 10.4, 0, 0, 10.7, 2.4);
  prop(l, 'door', 2.6, 0, 0, { label: '2A' });
  prop(l, 'frame', 7.4, 1.6, 0, { c: '#ff5c8a' });
  prop(l, 'plant', 0.5, 0, 0.5);

  // corner 1: a reception desk on the inside of the turn; the couch can pass over it
  add(l, 12.4, 0, -2, 14.4, 1.1, 0, 'desk');
  add(l, 12.1, 0, -2.3, 12.4, T, 0, 'paperB');
  add(l, 12.1, 0, -2.3, 14.4, T, -2, 'paperB');
  prop(l, 'plant', 13, 1.1, -1.4, { s: 0.6 });

  // corridor B, heading north
  add(l, 14.4, -0.5, -8, 16.4, 0, 0, 'tile');
  add(l, 14.1, 0, -10.7, 14.4, T, -2.3, 'paperB', { vis: 1.3 });
  add(l, 16.4, 0, -8, 16.7, T, 2.4, 'paperB', { vis: 1.3 });
  add(l, 14.4, 0, -3.6, 16.4, 0.7, -3, 'crate');
  bar(l, 14.4, 0, -6.3, 16.4, -6);

  // corridor C, heading east, with two doors that fly open
  add(l, 14.4, -0.5, -10.4, 34, 0, -8, 'tile');
  add(l, 14.1, 0, -10.7, 34.3, T, -10.4, 'paperB');
  add(l, 16.4, 0, -8, 34.3, T, -7.7, 'paperB', { vis: 0.3 });
  add(l, 34, 0, -10.4, 34.3, T, -8, 'paperB');
  const door = (x, phase) => add(l, x, 0, -11.9, x + 1.2, 2.1, -10.5, null,
    { look: 'door', hazard: true, move: { to: [0, 0, 1.5], period: 3.2, phase, mode: 'slam' } });
  door(20.2, 0); door(24.8, 0.5);
  prop(l, 'frame', 22.9, 1.7, -10.4, { c: '#e9b44c' });
  prop(l, 'frame', 28, 1.7, -10.4, { c: '#1fb8a6' });
  prop(l, 'door', 31.9, 0, -10.4, { label: 'LIFT', w: 1.8 });
  prop(l, 'rug', 31.8, 0, -9.2, { w: 3.2, d: 1.9 });
  l.goal = zone(30.4, -0.2, -10.4, 33.4, 2.5, -8);

  cp(l, null, [4.6, 0, 1.2], [1.3, 0, 1.2]);
  cp(l, zone(14.4, -0.2, -2.9, 16.4, 2.5, -1.2), [15.4, 0, -2.2], [15.4, 0, 1.1]);
  cp(l, zone(17.6, -0.2, -10.4, 19.2, 2.5, -8), [19.2, 0, -9.2], [15.9, 0, -9.2]);

  hint(l, zone(0, -1, 0, 5, 3, 2.4), 'Mind the robot vacuum. It bites.');
  hint(l, zone(6.6, -1, 0, 8.4, 3, 2.4), 'Two pipes. Hold {down} and keep it down.');
  hint(l, zone(10.8, -1, 0, 14, 3, 2.4), 'It will never fit round that corner... unless you both lift with {up} and swing it over the desk.');
  hint(l, zone(14.4, -1, -2.8, 16.4, 3, -0.4), 'Up for the boxes, straight back down for the pipe.');
  hint(l, zone(14.4, -1, -8, 16.4, 3, -6.6), 'A real corner now. One of you goes in deep, then... {shout}');
  hint(l, zone(16.6, -1, -10.4, 19.6, 3, -8), 'Angry neighbours. Time the doors, or hug the near wall.');
  return l;
}

// ---------------------------------------------------------------- 3: crosstown
function crosstown() {
  const l = mk();
  l.theme = 'street';
  l.killY = -7;
  const facade = (x0, x1, mat = 'brick', h = 6) => add(l, x0, 0, -0.5, x1, h, 0, mat);

  // bounds: the walkable strip is z 0..4 the whole way
  add(l, -2.3, -8, -0.3, 72, 14, 0, null, { vis: 0 });
  add(l, -2.3, -8, 4, 72, 14, 4.3, null, { vis: 0 });
  add(l, -2.3, 0, 0, -2, 14, 4, null, { vis: 0 });

  // sidewalk, road, sidewalk
  add(l, -2, -1, 0, 10, 0, 4, 'sidewalk');
  facade(-2, 10);
  prop(l, 'door', 2, 0, 0, { label: 'SOFAS', w: 1.8 });
  prop(l, 'sign', 5.5, 3.6, 0, { text: 'COUCH DEPOT', w: 5 });
  add(l, 10, -1, -18, 13.2, -0.1, 18, 'asphalt');
  add(l, 13.2, -1, -18, 16.8, 0, 18, 'sidewalk');
  add(l, 16.8, -1, -18, 20, -0.1, 18, 'asphalt');
  const car = (x, dir, phase, c) => add(l, x - 0.95, -0.1, dir > 0 ? -19 : 15.2, x + 0.95, 1.15, dir > 0 ? -15.2 : 19, null,
    { look: 'car', c, hazard: true, move: { to: [0, 0, 34 * dir], period: 5.6, phase, mode: 'loop' } });
  car(11.6, 1, 0, '#e0693e'); car(11.6, 1, 0.5, '#2a9d8f');
  car(18.4, -1, 0.3, '#e9b44c'); car(18.4, -1, 0.8, '#8a5fbf');
  prop(l, 'zebra', 15, -0.09, 2);
  add(l, 20, -1, 0, 27, 0, 4, 'sidewalk');
  facade(20, 27, 'brick2', 7);
  prop(l, 'door', 23.5, 0, 0, { label: 'DELI' });
  prop(l, 'cone', 26.3, 0, 0.6); prop(l, 'cone', 26.3, 0, 3.4);

  // the building site: two trenches to jump, a plank under a wrecking ball, a lift
  add(l, 26, -11, -14, 62, -9, 12, 'pit', { deco: true });
  add(l, 27, -9, -14, 61, 0, -4.5, 'dirt', { deco: true });
  add(l, 20, -9, 0, 27, -1, 4, 'dirt', { deco: true });
  add(l, 29.2, -9, 0.6, 34.6, 0, 3.4, 'dirt');
  add(l, 36.8, -9, 0.6, 41.2, 0, 3.4, 'dirt');
  add(l, 41.2, -0.3, 1.5, 47, 0, 2.5, 'plank');
  add(l, 42.9, 0.15, -2.6, 44.1, 1.35, -1.4, null,
    { look: 'ball', hazard: true, move: { to: [0, 0, 6.4], period: 4 } });
  add(l, 47, -9, 0.6, 52, 0, 3.4, 'dirt');
  add(l, 52, -0.4, 0.7, 56.8, 0, 3.3, null, { look: 'lift', move: { to: [3.2, 0, 0], period: 7 } });
  prop(l, 'crane', 44, 0, -7);
  prop(l, 'cone', 30, 0, 1); prop(l, 'cone', 51.4, 0, 3);

  // the returns dock
  add(l, 60, -9, 0, 70, 0, 4, 'sidewalk');
  add(l, 62, 0, 0, 62.5, 0.25, 4, 'stair'); add(l, 62.5, 0, 0, 63, 0.5, 4, 'stair');
  add(l, 63, 0, 0, 70, 0.75, 4, 'dock');
  add(l, 70, 0, 0, 70.3, 6, 4, 'brick');
  facade(60, 70.3, 'brick', 6.5);
  prop(l, 'sign', 66.5, 4.2, 0, { text: 'RETURNS', w: 4.4 });
  prop(l, 'door', 66.5, 0.75, 0, { label: 'NO REFUNDS', w: 2.2 });
  prop(l, 'rug', 66.6, 0.75, 2, { w: 4.4, d: 3 });
  l.goal = zone(64.6, 0.5, 0, 68.6, 3.5, 4);

  // skyline
  for (let i = 0; i < 9; i++) prop(l, 'building', -6 + i * 9.5, 0, -22 - (i % 3) * 3, { h: 9 + (i * 7 % 5) * 2.5, w: 7, i });

  cp(l, null, [5, 0, 2], [1.7, 0, 2]);
  cp(l, zone(22.5, -0.2, 0, 26, 3, 4), [25.3, 0, 2], [22, 0, 2]);
  cp(l, zone(38.6, -0.2, 0, 41.2, 3, 4), [40.6, 0, 2], [37.3, 0, 2]);
  cp(l, zone(48.8, -0.2, 0, 52, 3, 4), [51.2, 0, 2], [47.9, 0, 2]);

  hint(l, zone(-2, -1, 0, 4, 3, 4), 'It does not fit. Carry it back to the store. All the way across town.');
  hint(l, zone(6.5, -1, 0, 10, 3, 4), 'Traffic! Wait for a gap. The island in the middle is long enough for both of you.');
  hint(l, zone(22, -1, 0, 27, 3, 4), 'Trenches. Run and {jump}, one after the other. The couch keeps you together.');
  hint(l, zone(37.6, -1, 0, 41.2, 3, 4), 'Cross the plank while the wrecking ball swings away.');
  hint(l, zone(48, -1, 0, 52, 3, 4), 'Both of you onto the lift, and stay on it.');
  return l;
}

// ---------------------------------------------------------------- 4: the park
function park() {
  const l = mk();
  l.theme = 'park';
  l.killY = -3;
  const hedge = (x0, z0, x1, z1, vis = 0.5) => add(l, x0, 0, z0, x1, 5, z1, 'hedge', { vis });   // solid well above what is drawn
  const fence = (x0, z0, x1, z1) => add(l, x0, -4, z0, x1, 8, z1, null, { vis: 0 });

  // lawns and the pond (scenery; you can only stand on paths, plazas and the far bank)
  add(l, -14, -1.2, -22, 21, -0.03, 14, 'grass', { deco: true });
  add(l, 21, -1.2, -22, 72, -0.03, -1, 'grass', { deco: true });
  add(l, 21, -2, -1, 72, -0.8, 14, 'water', { deco: true });
  for (const [x, z] of [[2, -3], [6.5, -4.5], [18.5, -3.5], [24, -10.5], [31, -10], [36.5, -9.5], [50, -10.5], [58.5, -5], [-5, 1.5], [14, -6]]) prop(l, 'tree', x, 0, z);

  // path in, and the first plaza: two arms to jump
  add(l, -2, -1, 0, 8, 0, 4, 'path');
  hedge(-2.4, -0.4, 8, 0); fence(-2.4, 4, 8, 4.3); fence(-2.4, 0, -2, 4);
  add(l, 8, -1, -2, 16, 0, 6, 'sidewalk');
  hedge(7.6, -2.4, 16.4, -2); hedge(7.6, -2, 8, 0); hedge(16, -2, 16.4, 0);
  hedge(7.6, 4, 8, 6.4, 0.4); hedge(16, 4, 16.4, 6.4, 0.4); fence(8, 6, 16, 6.3);
  sweeper(l, 12, 0, 2, 3.6, [[0, 0.2, 0.4], [0.5, 0.2, 0.4]], { period: 5 });

  // path to the pond, and the turning bridge to the north bank
  add(l, 16, -1, 0, 22, 0, 4, 'path');
  hedge(16.4, -0.4, 22, 0); fence(16.4, 4, 22, 4.3);
  turnBridge(l, 25, 0, 2, 2.8);
  add(l, 22, -1, -7, 28, 0, -1, 'lawn');
  hedge(21.6, -7.4, 22, -1); hedge(21.6, -7.4, 39.5, -7); hedge(28, -3, 28.4, -1, 0.4);

  // along the bank: a goose, a hedge, then three arms
  add(l, 28, -1, -7, 39.5, 0, -3, 'path');
  hedge(28, -3, 39.5, -2.6, 0.4);
  add(l, 29.2, 0, -6.9, 29.8, 0.7, -6.3, null, { look: 'goose', hazard: true, move: { to: [0, 0, 3.2], period: 3.2 } });
  add(l, 34, 0, -7, 34.6, 0.7, -3, 'hedge');
  add(l, 39.5, -1, -9, 47.5, 0, -1, 'sidewalk');
  hedge(39.1, -9.4, 47.9, -9); hedge(39.1, -9, 39.5, -7); hedge(47.5, -9, 47.9, -7);
  hedge(39.1, -3, 39.5, -0.6, 0.4); hedge(47.5, -3, 47.9, -0.6, 0.4); fence(39.5, -1, 47.5, -0.7);
  sweeper(l, 43.5, 0, -5, 3.6, [[0, 0.2, 0.4], [1 / 3, 0.2, 0.4], [2 / 3, 0.2, 0.4]], { period: 5.4 });

  // the gate home
  add(l, 47.5, -1, -7, 56, 0, -3, 'path');
  hedge(47.9, -7.4, 56.4, -7); hedge(47.9, -3, 56.4, -2.6, 0.4); hedge(56, -7, 56.4, -3);
  prop(l, 'door', 53, 0, -7, { label: 'HOME', w: 1.6 });
  prop(l, 'rug', 53, 0, -5, { w: 3.6, d: 3 });
  l.goal = zone(51, -0.2, -7, 55, 2.5, -3);

  cp(l, null, [4, 0, 2], [0.7, 0, 2]);
  cp(l, zone(19.2, -0.2, 0, 22, 3, 4), [21, 0, 2], [17.7, 0, 2]);
  cp(l, zone(22, -0.2, -7, 28, 3, -2.2), [25, 0, -5.6], [25, 0, -2.3]);
  cp(l, zone(36.5, -0.2, -7, 39.5, 3, -3), [38.4, 0, -5], [35.1, 0, -5]);

  hint(l, zone(-2, -1, 0, 3, 3, 4), 'No refunds. Fine. Home is on the other side of the park.');
  hint(l, zone(4.5, -1, 0, 8, 3, 4), 'Skipping-rope time: {jump} over the arms as they come round. Go round the post in the middle.');
  hint(l, zone(18.6, -1, 0, 22, 3, 4), 'The bridge turns. Get on while it points at you, ride it round, and get off on the far bank.');
  hint(l, zone(22, -1, -7, 28, 3, -2.2), 'Do not make eye contact with the goose.');
  hint(l, zone(31, -1, -7, 33.6, 3, -3), 'A hedge. Couch up with {up}, then {jump}.');
  hint(l, zone(36.5, -1, -7, 39.5, 3, -3), 'Three arms this time.');
  return l;
}

// ---------------------------------------------------------------- 5: the factory
function factory() {
  const l = mk();
  l.theme = 'factory';
  l.killY = -7;
  const T = 3.4;
  const floor = (x0, x1, z0 = 0, z1 = 4) => add(l, x0, -9, z0, x1, 0, z1, 'metal');
  const fence = (x0, z0, x1, z1) => add(l, x0, -8, z0, x1, 14, z1, null, { vis: 0 });

  // walls: the walkway is z 0..4, except on the robot's floor, which is z -2..6
  add(l, -2.3, 0, -0.3, 20, T, 0, 'panel'); add(l, -2.3, 0, 0, -2, T, 4, 'panel');
  add(l, 19.7, 0, -2.3, 28.3, T, -2, 'panel'); add(l, 19.7, 0, -2, 20, T, 0, 'panel'); add(l, 28, 0, -2, 28.3, T, 0, 'panel');
  add(l, 28, 0, -0.3, 60.3, T, 0, 'panel'); add(l, 60, 0, 0, 60.3, T, 4, 'panel');
  fence(-2.3, 4, 20, 4.3); fence(19.7, 4, 20, 6.3); fence(20, 6, 28, 6.3); fence(28, 4, 28.3, 6.3); fence(28, 4, 60.3, 4.3);
  add(l, 30, -11, -3, 42, -9, 7, 'pit', { deco: true });
  prop(l, 'sign', 3.4, 2.4, 0, { text: 'COUCH FACTORY', w: 4.6 });
  prop(l, 'door', -1.1, 0, 0, { label: 'STAFF' });

  // a belt running against you, with a bar to duck and boxes to hop
  floor(-2, 6);
  add(l, 6, -9, 0, 16, 0, 4, 'belt', { belt: [-2.2, 0] });
  bar(l, 9.4, 0, 0, 9.7, 4);
  add(l, 14.4, 0, 0, 15.1, 0.7, 4, 'crate');
  floor(16, 20);

  // the robot: one arm to jump, one to duck
  floor(20, 28, -2, 6);
  sweeper(l, 24, 0, 2, 3.6, [[0, 0.2, 0.4], [0.5, 1.1, 1.35]], { period: 5.6, post: 1.6 });
  floor(28, 33);

  // a bridge that is only straight for a moment
  turnBridge(l, 36, 0, 2, 2.8);
  floor(39, 43);

  // the express belt to Shipping
  add(l, 43, -9, 0, 53, 0, 4, 'belt', { belt: [3, 0] });
  bar(l, 48, 0, 0, 48.3, 4);
  floor(53, 60);
  prop(l, 'sign', 57, 2.5, 0, { text: 'SHIPPING', w: 3.6 });
  prop(l, 'rug', 57, 0, 2, { w: 3.6, d: 3 });
  l.goal = zone(55, -0.2, 0, 59, 2.5, 4);

  cp(l, null, [3, 0, 2], [-0.3, 0, 2]);
  cp(l, zone(17.7, -0.2, 0, 20, 3, 4), [19.6, 0, 2], [16.3, 0, 2]);
  cp(l, zone(29.7, -0.2, 0, 33, 3, 4), [32.4, 0, 2], [29.1, 0, 2]);
  cp(l, zone(40.7, -0.2, 0, 43, 3, 4), [42.6, 0, 2], [39.3, 0, 2]);

  hint(l, zone(-2, -1, 0, 2.6, 3, 4), 'Nobody wants this couch. Send it back where it came from: Shipping is at the far end.');
  hint(l, zone(2.6, -1, 0, 6, 3, 4), 'The belt runs against you. Stand still and you go backwards.');
  hint(l, zone(17.7, -1, 0, 20, 3, 4), 'The robot. {jump} over its low arm; for the high one, both duck with {down}.');
  hint(l, zone(29.7, -1, 0, 33, 3, 4), 'The bridge only lines up for a moment. Run for it, or ride it all the way round.');
  hint(l, zone(40.7, -1, 0, 43, 3, 4), 'Express lane. Mind your heads.');
  return l;
}

export const LEVELS = [
  { id: 'stairwell', name: 'The Stairwell', blurb: 'Three flights. Two corners. One couch.', done: "It's in!", build: stairwell },
  { id: 'hallway', name: 'The Hallway From Hell', blurb: 'Pipes, boxes, a vacuum and the neighbours.', done: 'Delivered!', build: hallway },
  { id: 'crosstown', name: 'Crosstown Returns', blurb: 'Traffic, trenches and a wrecking ball.', done: 'No refunds!', build: crosstown },
  { id: 'park', name: 'Shortcut Through The Park', blurb: 'Spinning arms, a turning bridge and one goose.', done: 'Home again!', build: park },
  { id: 'factory', name: 'The Couch Factory', blurb: 'Conveyor belts, a robot arm and no way back.', done: 'Shipped!', build: factory },
];
