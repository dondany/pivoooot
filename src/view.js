// three.js side: turns a Game into a picture. Reads game state every frame, never writes it.
import * as THREE from 'three';
import { Bean, Couch, toon } from './models.js';
import { spinAngle } from './physics.js';

// ---- painted textures (all drawn on canvases, tiled in world units) ----
function tex(px, size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  draw(c.getContext('2d'), px);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = toon(0xffffff, t);
  m.userData.size = size;
  return m;
}
const fill = (g, s, c) => { g.fillStyle = c; g.fillRect(0, 0, s, s); };
const PAT = {
  checker: (a, b, size = 1.3) => tex(64, size, (g, s) => { fill(g, s, a); g.fillStyle = b; g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2); }),
  planks: (a, b, size = 1) => tex(128, size, (g, s) => {
    fill(g, s, a); g.fillStyle = b;
    for (let i = 0; i < 4; i++) { g.fillRect(0, i * s / 4, s, 3); g.fillRect((i * 53) % s, i * s / 4, 3, s / 4); }
  }),
  paper: (bg, a, b) => tex(256, 2.4, (g, s) => {
    fill(g, s, bg);
    const blob = (x, y) => [[0.2, a], [0.14, bg], [0.085, b]].forEach(([r, c]) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r * s, 0, 7); g.fill(); });
    for (const [x, y] of [[0.25, 0.25], [0.75, 0.75]]) for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) blob(x * s + ox, y * s + oy);
    g.fillStyle = a;
    for (const [x, y] of [[0.75, 0.25], [0.25, 0.75]]) { g.beginPath(); g.arc(x * s, y * s, 0.035 * s, 0, 7); g.fill(); }
  }),
  stripes: (a, b, size = 0.9) => tex(64, size, (g, s) => { fill(g, s, a); g.fillStyle = b; g.fillRect(0, 0, s * 0.3, s); g.fillRect(s * 0.5, 0, s * 0.08, s); }),
  brick: (a, b) => tex(128, 1.2, (g, s) => {
    fill(g, s, b); g.fillStyle = a;
    for (let r = 0; r < 4; r++) for (let c = -1; c < 2; c++) g.fillRect(c * s / 2 + (r % 2) * s / 4 + 3, r * s / 4 + 3, s / 2 - 6, s / 4 - 6);
  }),
  slabs: (a, b, size = 2) => tex(128, size, (g, s) => { fill(g, s, a); g.strokeStyle = b; g.lineWidth = 4; g.strokeRect(0, 0, s / 2, s / 2); g.strokeRect(s / 2, s / 2, s / 2, s / 2); g.strokeRect(s / 2, 0, s / 2, s / 2); g.strokeRect(0, s / 2, s / 2, s / 2); }),
  speckle: (a, b, size = 4) => tex(128, size, (g, s) => {
    fill(g, s, a); g.fillStyle = b;
    for (let i = 0; i < 260; i++) g.fillRect((i * 7919) % s, (i * 104729 >> 3) % s, 2, 2);
  }),
  hazard: (a, b) => tex(64, 1, (g, s) => {
    fill(g, s, a); g.strokeStyle = b; g.lineWidth = s * 0.18;
    for (let i = -1; i < 3; i++) { g.beginPath(); g.moveTo(i * s / 2, s); g.lineTo(i * s / 2 + s, 0); g.stroke(); }
  }),
  belt: () => tex(64, 1, (g, s) => { fill(g, s, '#4a3f4f'); g.fillStyle = '#665870'; g.fillRect(0, 0, s * 0.14, s); g.fillRect(s * 0.5, 0, s * 0.14, s); }),
  windows: (wall, win, lit) => tex(128, 4, (g, s) => {
    fill(g, s, wall);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { g.fillStyle = (r + c) % 2 ? lit : win; g.fillRect(c * s / 2 + s * 0.12, r * s / 2 + s * 0.1, s * 0.26, s * 0.3); }
  }),
};

// name -> { top, side } materials. Built on first use.
const MAT_DEFS = {
  checker: () => ({ top: PAT.checker('#fbe9c3', '#e0693e'), side: toon(0xa5552f) }),
  tile: () => ({ top: PAT.checker('#fbe9c3', '#8a5fbf'), side: toon(0x5c3d86) }),
  stair: () => ({ top: toon(0xc98a4b), side: toon(0xf6dba9) }),
  landing: () => ({ top: PAT.checker('#fbe9c3', '#e9b44c'), side: toon(0xf6dba9) }),
  hall: () => ({ top: PAT.checker('#fbe9c3', '#2a9d8f'), side: PAT.brick('#c2583c', '#ecc9a0') }),
  apt: () => ({ top: PAT.planks('#e2a868', '#b97f45', 1.6), side: PAT.brick('#c2583c', '#ecc9a0') }),
  paper: () => { const m = PAT.paper('#f2b84b', '#e0693e', '#fbe9c3'); return { top: m, side: m }; },
  paperB: () => { const m = PAT.paper('#5fb49c', '#fbe9c3', '#e9b44c'); return { top: m, side: m }; },
  paper2: () => { const m = PAT.stripes('#fbe9c3', '#f29e7a'); return { top: toon(0xf29e7a), side: m }; },
  rail: () => { const m = toon(0x6b3a22); return { top: m, side: m }; },
  pipe: () => { const m = PAT.hazard('#e9b44c', '#3a2a22'); return { top: m, side: m }; },
  crate: () => ({ top: PAT.slabs('#d9a866', '#a8763a', 1.6), side: PAT.slabs('#cf9c58', '#a8763a', 1.4) }),
  desk: () => ({ top: PAT.planks('#8f5a34', '#6b3f22', 1.2), side: toon(0x7a4a2a) }),
  sidewalk: () => ({ top: PAT.slabs('#ead9c0', '#c9b396'), side: toon(0xbfa98c) }),
  dock: () => ({ top: PAT.hazard('#e9b44c', '#3a2a22'), side: toon(0x9c8b78) }),
  asphalt: () => ({ top: PAT.speckle('#5b4a5e', '#6d5a70'), side: toon(0x4a3c4d) }),
  brick: () => { const m = PAT.brick('#c2583c', '#ecc9a0'); return { top: toon(0x9a4530), side: m }; },
  brick2: () => { const m = PAT.brick('#d9a441', '#fbe9c3'); return { top: toon(0xb5862f), side: m }; },
  dirt: () => ({ top: PAT.speckle('#c98d55', '#a8703d', 3), side: PAT.speckle('#a8703d', '#8a5a30', 3) }),
  pit: () => { const m = toon(0x4a2f33); return { top: m, side: m }; },
  plank: () => ({ top: PAT.planks('#e2b06c', '#b98445', 1.2), side: toon(0xb98445) }),
  grass: () => { const m = PAT.speckle('#9cc45f', '#86b24c', 5); return { top: m, side: m }; },
  lawn: () => ({ top: PAT.speckle('#a9cf68', '#8fb955', 3), side: toon(0x8a5a30) }),
  path: () => ({ top: PAT.speckle('#f1d6a0', '#dfbd80', 3), side: toon(0xb98c56) }),
  water: () => { const m = toon(0x55bcc9); return { top: m, side: m }; },
  hedge: () => { const m = PAT.speckle('#3f9b6d', '#2f8259', 1.5); return { top: m, side: m }; },
  post: () => { const m = toon(0x6b5a6e); return { top: m, side: m }; },
  metal: () => ({ top: PAT.slabs('#9fc1bb', '#7fa5a0', 2), side: toon(0x4f6f72) }),
  panel: () => { const m = PAT.stripes('#4f9390', '#427f7d', 1.6); return { top: toon(0x386b6a), side: m }; },
  belt: () => ({ top: PAT.belt(), side: toon(0x2f2630) }),
};
const mats = {};
const mat = name => mats[name] || (mats[name] = (MAT_DEFS[name] || MAT_DEFS.checker)());

// Box whose texture is laid out in world units, so neighbouring boxes tile into each other.
function boxMesh(b, h) {
  const m = mat(b.mat), sx = b.x1 - b.x0, sz = b.z1 - b.z0;
  const geo = new THREE.BoxGeometry(sx, h, sz), pos = geo.attributes.position, uv = geo.attributes.uv;
  const cx = (b.x0 + b.x1) / 2, cy = b.y0 + h / 2, cz = (b.z0 + b.z1) / 2;
  for (let i = 0; i < pos.count; i++) {
    const face = i >> 2, x = pos.getX(i) + cx, y = pos.getY(i) + cy, z = pos.getZ(i) + cz;
    const size = (face === 2 || face === 3 ? m.top : m.side).userData.size || 1;
    if (face < 2) uv.setXY(i, z / size, y / size); else if (face < 4) uv.setXY(i, x / size, -z / size); else uv.setXY(i, x / size, y / size);
  }
  const mesh = new THREE.Mesh(geo, [m.side, m.side, m.top, m.side, m.side, m.side]);
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// A crate box is one collider, drawn as a row of cardboard boxes.
function crateMesh(b) {
  const g = new THREE.Group(), sx = b.x1 - b.x0, sz = b.z1 - b.z0, h = b.y1 - b.y0, alongX = sx > sz;
  const len = alongX ? sx : sz, wide = alongX ? sz : sx, n = Math.max(1, Math.round(len / 0.68)), w = len / n;
  for (let i = 0; i < n; i++) {
    const o = ((i + 0.5) / n - 0.5) * len, hh = h * (i % 3 === 1 ? 0.86 : 1), c = new THREE.Group();
    c.add(box(alongX ? w - 0.05 : wide - 0.04, hh, alongX ? wide - 0.04 : w - 0.05, [0xd9a866, 0xcf9a55, 0xe2b578][i % 3], 0, 0, 0),
      box(alongX ? 0.12 : wide - 0.03, 0.02, alongX ? wide - 0.03 : 0.12, 0xf3dcae, 0, hh / 2 + 0.005, 0));
    c.position.set(alongX ? o : 0, (hh - h) / 2, alongX ? 0 : o);
    c.rotation.y = ((i * 37) % 7 - 3) * 0.02;
    c.traverse(q => { q.receiveShadow = true; });
    g.add(c);
  }
  g.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  return g;
}

// A handrail: solid for the physics, but drawn as posts and a bar so you can see through it.
function railMesh(b) {
  const g = new THREE.Group(), m = mat('rail').top, sx = b.x1 - b.x0, sz = b.z1 - b.z0, h = b.y1 - b.y0, alongX = sx > sz;
  const len = alongX ? sx : sz, n = Math.max(1, Math.round(len / 0.5));
  g.add(mesh(new THREE.BoxGeometry(sx, 0.1, sz), m, 0, h / 2 - 0.05, 0));
  for (let i = 0; i < n; i++) {
    const o = ((i + 0.5) / n - 0.5) * len;
    g.add(mesh(new THREE.BoxGeometry(0.07, h - 0.1, 0.07), m, alongX ? o : 0, -0.05, alongX ? 0 : o));
  }
  g.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  return g;
}

const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; return o; };
const box = (w, h, d, c, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'number' || typeof c === 'string' ? toon(c) : c, x, y, z);

function label(text, w, h, bg, fg, font = 'Shrikhand') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let px = c.height * 0.62;
  g.font = `${px}px ${font}, "Arial Black", sans-serif`;
  const tw = g.measureText(text).width;
  if (tw > c.width * 0.86) { px *= c.width * 0.86 / tw; g.font = `${px}px ${font}, "Arial Black", sans-serif`; }
  g.fillText(text, c.width / 2, c.height / 2 + px * 0.06);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

// ---- models for the things that move ----
const LOOKS = {
  car(b) {
    const g = new THREE.Group(), dir = Math.sign(b.move.to[2]) || 1;
    g.add(box(1.9, 0.55, 3.8, b.c, 0, -0.2, 0), box(1.6, 0.5, 2, 0xfbe9c3, 0, 0.32, -0.2 * dir));
    for (const x of [-0.86, 0.86]) for (const z of [-1.2, 1.2]) {
      const w = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 12), toon(0x2b1a12), x, -0.3, z);
      w.rotation.z = Math.PI / 2; g.add(w);
    }
    for (const x of [-0.6, 0.6]) g.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }), x, -0.12, 1.9 * dir));
    return g;
  },
  goose() {
    const g = new THREE.Group(), white = toon(0xffffff), body = mesh(new THREE.SphereGeometry(0.3, 12, 10), white, 0, -0.05, -0.05);
    body.scale.set(0.85, 0.85, 1.3);
    const beak = mesh(new THREE.ConeGeometry(0.06, 0.2, 8), toon(0xf07a2a), 0, 0.5, 0.42);
    beak.rotation.x = Math.PI / 2;
    g.add(body, mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 8), white, 0, 0.27, 0.22), mesh(new THREE.SphereGeometry(0.13, 10, 8), white, 0, 0.52, 0.25), beak);
    for (const x of [-0.07, 0.07]) g.add(mesh(new THREE.SphereGeometry(0.03, 6, 5), toon(0x2b1a12), x, 0.57, 0.34));
    g.userData.face = true;       // turns to face the way it is going
    return g;
  },
  roomba(b) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.2, 18), toon(0x3a2a35)), mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 10), new THREE.MeshBasicMaterial({ color: 0xff4d4d }), 0, 0.11, 0));
    for (const x of [-0.12, 0.12]) g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), toon(0xffffff), x, 0.13, 0.2));
    return g;
  },
  ball() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.66, 18, 14), toon(0x4a3c4d)), mesh(new THREE.CylinderGeometry(0.05, 0.05, 12, 6), toon(0x3a2a22), 0, 6.5, 0));
    return g;
  },
  lift(b) {
    const g = new THREE.Group(), w = b.x1 - b.x0, d = b.z1 - b.z0, m = PAT.hazard('#e9b44c', '#3a2a22');
    g.add(box(w, 0.4, d, m));
    for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 14, 5), toon(0x3a2a22), x * (w / 2 - 0.1), 7, z * (d / 2 - 0.1)));
    return g;
  },
  door(b) {
    const g = new THREE.Group(), w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0;
    g.add(box(w, h, d, 0xd9482f), box(w * 0.7, 0.08, 0.05, 0x2b1a12, 0, h * 0.22, d / 2 + 0.02));
    for (const x of [-1, 1]) {       // an angry little face
      g.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), toon(0xffffff), x * 0.2, h * 0.3, d / 2));
      const brow = box(0.26, 0.06, 0.05, 0x2b1a12, x * 0.2, h * 0.3 + 0.14, d / 2 + 0.04);
      brow.rotation.z = -x * 0.5; g.add(brow);
    }
    return g;
  },
};

// ---- props: set dressing, nothing collides with them. (x, y, z) is the base, on the floor
// or flat against a north wall facing the camera. ----
const PROPS = {
  rug(p) {
    const g = new THREE.Group(), cols = [0xe0693e, 0xfbe9c3, 0x2a9d8f, 0xe9b44c];
    cols.forEach((c, i) => {
      const k = 1 - i * 0.22, r = box(p.w * k, 0.03, p.d * k, c, 0, 0.015 + i * 0.006, 0);
      r.castShadow = false; r.receiveShadow = true; g.add(r);
    });
    const arrow = mesh(new THREE.ConeGeometry(0.45, 0.9, 4), new THREE.MeshBasicMaterial({ color: 0xffd166 }), 0, 3, 0);
    arrow.rotation.x = Math.PI; arrow.castShadow = false; arrow.userData.bob = 3;
    g.add(arrow);
    return g;
  },
  plant(p) {
    const g = new THREE.Group(), s = p.s || 1;
    g.add(mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.42, 10), toon(0xe0693e), 0, 0.21, 0));
    [[0, 0.75, 0, 0.36], [0.2, 1.05, 0.05, 0.27], [-0.2, 1.0, -0.05, 0.25], [0.02, 1.3, 0, 0.22]].forEach(([x, y, z, r]) => g.add(mesh(new THREE.SphereGeometry(r, 10, 8), toon(0x3f9b6d), x, y, z)));
    g.scale.setScalar(s);
    return g;
  },
  frame(p) {
    const g = new THREE.Group(), w = p.w || 1;
    g.add(box(w + 0.16, 0.86, 0.06, 0x6b3a22, 0, 0, 0.03), box(w, 0.7, 0.07, p.c, 0, 0, 0.04), mesh(new THREE.CircleGeometry(0.2, 16), toon(0xfbe9c3), w * 0.15, 0.05, 0.08));
    return g;
  },
  door(p) {
    const g = new THREE.Group(), w = p.w || 1.1;
    g.add(box(w + 0.2, 2.25, 0.06, 0x6b3a22, 0, 1.12, 0.03), box(w, 2.1, 0.08, 0x2a9d8f, 0, 1.05, 0.04), mesh(new THREE.SphereGeometry(0.07, 8, 6), toon(0xffd166), w * 0.36, 1, 0.1));
    if (p.label) { const s = label(p.label, Math.min(w * 0.8, 1.5), 0.3, '#fbe9c3', '#5a3220'); s.position.set(0, 1.72, 0.09); g.add(s); }
    return g;
  },
  lamp() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 4), toon(0x3a2a22), 0, -0.5, 0), mesh(new THREE.ConeGeometry(0.42, 0.4, 14, 1, true), toon(0xe0693e), 0, -1.1, 0),
      mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }), 0, -1.22, 0));
    return g;
  },
  sign(p) {
    const g = new THREE.Group(), s = label(p.text, p.w, p.w * 0.24, '#fbe9c3', '#d9482f');
    s.position.z = 0.1;
    g.add(box(p.w + 0.24, p.w * 0.24 + 0.24, 0.12, 0x5a3220, 0, 0, 0.03), s);
    return g;
  },
  zebra() {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) { if (Math.abs(i - 4) < 1.5 && i !== 4) continue; const s = box(0.6, 0.02, 3.2, 0xfbe9c3, -4.4 + i * 1.1, 0, 0); s.castShadow = false; g.add(s); }
    return g;
  },
  cone() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.ConeGeometry(0.2, 0.6, 10), toon(0xf07a2a), 0, 0.33, 0), box(0.46, 0.05, 0.46, 0xf07a2a, 0, 0.025, 0), mesh(new THREE.CylinderGeometry(0.105, 0.135, 0.1, 10), toon(0xffffff), 0, 0.36, 0));
    return g;
  },
  tree() {
    const g = new THREE.Group(), leaf = toon(0x4fa76b);
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.8, 8), toon(0x8a5a30), 0, 0.9, 0), mesh(new THREE.SphereGeometry(1.25, 12, 10), leaf, 0, 2.6, 0),
      mesh(new THREE.SphereGeometry(0.85, 10, 8), toon(0x5cb478), 0.7, 3.3, 0.3), mesh(new THREE.SphereGeometry(0.75, 10, 8), leaf, -0.75, 2.2, 0.4));
    return g;
  },
  crane() {
    const g = new THREE.Group(), m = toon(0xe9b44c);
    g.add(box(0.7, 16, 0.7, m, 0, 8, 0), box(18, 0.6, 0.6, m, 3, 15.6, 0), box(2.2, 1.4, 1.6, 0xd9482f, -4, 15.4, 0));
    return g;
  },
  building(p) {
    const cols = [['#c2583c', '#7a3524', '#ffd58a'], ['#8a5fbf', '#573a80', '#ffd58a'], ['#d9a441', '#9c6f20', '#fff0c0'], ['#3f9b8c', '#27665c', '#ffd58a']][p.i % 4];
    const m = PAT.windows(cols[0], cols[1], cols[2]), geo = new THREE.BoxGeometry(p.w, p.h, 5), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * p.w / 4, uv.getY(i) * p.h / 4);
    const b = new THREE.Mesh(geo, m);
    b.position.y = p.h / 2 - 1;
    return b;
  },
};

// ---- models for the things that turn (level.spins). Built around the axis; the view turns them. ----
const SPINS = {
  sweeper(s) {
    const g = new THREE.Group(), red = toon(0xd9482f), cream = toon(0xfbe9c3);
    for (const [turn, y0, y1] of s.arms) {
      const arm = new THREE.Group(), y = (y0 + y1) / 2, n = Math.round(s.len / 0.6);
      arm.rotation.y = -turn * Math.PI * 2;
      for (let i = 0; i < n; i++) arm.add(box(s.len / n, y1 - y0, 0.24, i % 2 ? cream : red, 0.3 + (i + 0.5) * (s.len - 0.2) / n, y, 0));
      arm.add(box(0.5, 0.12, 0.12, 0x3a2a35, 0.25, y, 0), mesh(new THREE.SphereGeometry(0.2, 10, 8), red, s.len + 0.1, y, 0));
      g.add(arm);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.18, 16), toon(0xe9b44c), 0, s.post + 0.09, 0), mesh(new THREE.SphereGeometry(0.16, 10, 8), red, 0, s.post + 0.26, 0));
    return g;
  },
  bridge(s) {
    const g = new THREE.Group(), stripes = PAT.hazard('#e9b44c', '#3a2a22');
    g.add(boxMesh({ x0: -s.half + 0.3, x1: s.half - 0.3, y0: -0.3, y1: 0, z0: -0.8, z1: 0.8, mat: 'plank' }, 0.3));
    for (const x of [-1, 1]) g.add(box(0.3, 0.3, 1.6, stripes, x * (s.half - 0.15), -0.15, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.45, 0.6, 10, 12), toon(0x6b5a6e), 0, -5.3, 0));
    g.traverse(c => { c.receiveShadow = true; });
    return g;
  },
};

const THEMES = {
  park: { sky: ['#ffbf85', '#fff0c8'], fog: 0xffe6b8, sun: 0xfff3d0, hemi: [0xfff6dc, 0x7aa05a] },
  factory: { sky: ['#4a3550', '#a8686a'], fog: 0x7d5266, sun: 0xffe6c8, hemi: [0xffe2cc, 0x3f6f78] },
  indoor: { sky: ['#f39c5a', '#fbdcaa'], fog: 0xf7c58a, sun: 0xfff1d6, hemi: [0xffe9c7, 0xc7623a] },
  hall: { sky: ['#e97f5f', '#f9d59b'], fog: 0xf3b683, sun: 0xfff1d6, hemi: [0xffe9c7, 0x8a5fbf] },
  street: { sky: ['#ff8a5c', '#ffd9a0'], fog: 0xffc08a, sun: 0xffe0b0, hemi: [0xffd9b0, 0x8a4a6a] },
};

export class View {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 220);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xaa6644, 1.55);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.9);
    const sh = this.sun.shadow;
    sh.mapSize.set(2048, 2048); sh.bias = -0.0006; sh.normalBias = 0.03;
    Object.assign(sh.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 70 });
    sh.camera.updateProjectionMatrix();
    this.sun.castShadow = true;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.beans = [new Bean(this.scene, 0), new Bean(this.scene, 1)];
    this.couch = new Couch(this.scene);
    this.target = new THREE.Vector3(); this.tmp = new THREE.Vector3();
    this.t = 0; this.shake = 0; this.orbit = 0;
    this.particles = [];
    this.puffGeo = new THREE.SphereGeometry(0.12, 6, 5);
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.zoom = Math.max(1, 1.25 / this.camera.aspect);     // back off on tall screens
    this.camera.updateProjectionMatrix();
  }

  load(game) {
    for (const o of [...this.world.children]) {
      this.world.remove(o);
      o.traverse(c => { if (c.geometry) c.geometry.dispose(); });
    }
    this.movers = []; this.bobbers = []; this.spinners = []; this.belts = [];
    const l = game.level, th = THEMES[l.theme] || THEMES.indoor;
    const sky = document.createElement('canvas');
    sky.width = 4; sky.height = 256;
    const g = sky.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, th.sky[0]); gr.addColorStop(1, th.sky[1]);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const bg = new THREE.CanvasTexture(sky);
    bg.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(th.fog, 34, 95);
    this.sun.color.set(th.sun); this.hemi.color.set(th.hemi[0]); this.hemi.groundColor.set(th.hemi[1]);

    for (const b of l.boxes) {
      if (b.look) {
        const m = LOOKS[b.look](b);
        this.world.add(m); this.movers.push({ b, m });
        continue;
      }
      const h = Math.min(b.vis ?? Infinity, b.y1 - b.y0);
      if (h <= 0 || !b.mat) continue;
      if (b.mat === 'rail' || b.mat === 'crate') { this.world.add((b.mat === 'rail' ? railMesh : crateMesh)(b)); continue; }
      const m = boxMesh(b, h);
      if (b.deco) m.castShadow = false;
      if (b.belt) {                 // its own copy of the texture, so it can scroll
        const top = m.material[2].clone(), size = m.material[2].userData.size;
        top.map = top.map.clone(); top.map.needsUpdate = true;
        m.material = m.material.slice(); m.material[2] = top;
        this.belts.push({ b, map: top.map, size });
      }
      this.world.add(m);
      if (b.move) this.movers.push({ b, m, box: true });
    }
    for (const s of l.spins) {
      const m = SPINS[s.kind](s);
      m.position.set(s.x, s.y, s.z);
      this.world.add(m); this.spinners.push({ s, m });
    }
    for (const p of l.props) {
      const o = PROPS[p.type](p);
      o.position.x += p.x; o.position.y += p.y; o.position.z += p.z;
      o.traverse(c => { if (c.userData.bob) this.bobbers.push(c); });
      this.world.add(o);
    }
    for (const b of this.beans) { b.y = null; for (const f of [...b.arms.map(a => a.elbow), ...b.legs.flatMap(q => [q.foot, q.knee])]) f.fresh = true; }
    this.snap = true;
  }

  update(game, dt, attract) {
    this.t += dt;
    const t = this.t, c = game.couch;
    for (const { b, m } of this.movers) {
      m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      if (m.userData.face && (b.dx || b.dz)) m.rotation.y = Math.atan2(b.dx, b.dz);
    }
    for (const { s, m } of this.spinners) m.rotation.y = spinAngle(s, game.time);
    for (const q of this.belts) { q.map.offset.x -= q.b.belt[0] * dt / q.size; q.map.offset.y += q.b.belt[1] * dt / q.size; }
    for (const o of this.bobbers) { o.position.y = o.userData.bob + Math.sin(t * 3) * 0.25; o.rotation.y = t * 1.5; o.visible = !game.done; }
    this.couch.update(dt, c);
    this.beans.forEach((b, i) => b.update(dt, game.players[i], game.players[1 - i], this.couch.grips[i], t));

    // camera: south of the couch, looking down at it
    const m = this.tmp.set((c.ax + c.bx) / 2, Math.min(c.ay, c.by) - 0.6, (c.az + c.bz) / 2);
    if (this.snap) this.target.copy(m); else this.target.lerp(m, 1 - Math.exp(-dt * 4));
    this.snap = false;
    this.orbit = attract ? Math.sin(t * 0.25) * 0.35 : 0;
    const dist = (attract ? 0.75 : 0.9) * this.zoom, cam = this.camera;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    cam.position.set(this.target.x + Math.sin(this.orbit) * 11.5 * dist + sx, this.target.y + 9.6 * dist + sy, this.target.z + Math.cos(this.orbit) * 11.5 * dist);
    cam.lookAt(this.target.x, this.target.y + 1, this.target.z);
    this.sun.position.set(this.target.x + 7, this.target.y + 22, this.target.z + 13);
    this.sun.target.position.copy(this.target);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.m); this.particles.splice(i, 1); continue; }
      p.v.y -= p.g * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.scale.setScalar(p.s * Math.min(1, p.life * 3));
      if (p.spin) { p.m.rotation.x += dt * 9; p.m.rotation.z += dt * 7; }
    }
  }

  render() { this.renderer.render(this.scene, this.camera); }

  puff(x, y, z, n = 6, color = 0xfff3dc, up = 1.5, spread = 2, g = 0) {
    const m = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < n; i++) {
      const o = new THREE.Mesh(this.puffGeo, m), a = Math.random() * 7;
      o.position.set(x, y, z);
      this.scene.add(o);
      this.particles.push({ m: o, v: new THREE.Vector3(Math.cos(a) * spread * Math.random(), up * (0.4 + Math.random()), Math.sin(a) * spread * Math.random()), life: 0.35 + Math.random() * 0.3, s: 0.6 + Math.random() * 0.8, g });
    }
  }

  confetti(x, y, z) {
    const geo = new THREE.BoxGeometry(0.16, 0.16, 0.03);
    for (let i = 0; i < 90; i++) {
      const o = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: [0xff5c8a, 0x1fb8a6, 0xffd166, 0xe0693e, 0xfbe9c3][i % 5] })), a = Math.random() * 7;
      o.position.set(x, y + 1, z);
      this.scene.add(o);
      this.particles.push({ m: o, v: new THREE.Vector3(Math.cos(a) * 4 * Math.random(), 5 + Math.random() * 6, Math.sin(a) * 4 * Math.random()), life: 1.6 + Math.random(), s: 1, g: 11, spin: true });
    }
  }

  // world position -> CSS pixels, for speech bubbles
  project(v) {
    this.tmp.copy(v).project(this.camera);
    return { x: (this.tmp.x + 1) / 2 * innerWidth, y: (1 - this.tmp.y) / 2 * innerHeight };
  }
}
