// The beans and the couch. All motion here is procedural and cosmetic: the physics only knows
// a bean as a cylinder, so limbs, squash and googly eyes are free to be as floppy as they like.
import * as THREE from 'three';
import { PHYS as P, COLORS } from './config.js';

const ramp = new THREE.DataTexture(new Uint8Array([105, 165, 215, 255]), 4, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;
export const toon = (color, map) => new THREE.MeshToonMaterial({ color, map: map || null, gradientMap: ramp });

const V = () => new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const t0 = V(), t1 = V(), t2 = V(), t3 = V();

// A bendy tube along a quadratic curve: arms and legs.
class Noodle {
  constructor(parent, mat, r0, r1, n = 9, sides = 7) {
    this.n = n; this.sides = sides; this.r0 = r0; this.r1 = r1;
    const count = (n + 1) * sides, idx = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + (j + 1) % sides, c = a + sides, d = b + sides;
      idx.push(a, c, b, b, c, d);
    }
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    parent.add(this.mesh);
    this.nrm = V(); this.bin = V(); this.tan = V(); this.pt = V();
  }

  set(a, c, b) {
    const pos = this.geo.attributes.position.array, nor = this.geo.attributes.normal.array, { n, sides, nrm, bin, tan, pt } = this;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pt.set(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z);
      tan.set(u * (c.x - a.x) + t * (b.x - c.x), u * (c.y - a.y) + t * (b.y - c.y), u * (c.z - a.z) + t * (b.z - c.z));
      if (tan.lengthSq() < 1e-8) tan.set(0, -1, 0);
      tan.normalize();
      if (i === 0) nrm.set(1, 0, 0);
      nrm.addScaledVector(tan, -nrm.dot(tan));                 // carry the frame along so the tube never twists
      if (nrm.lengthSq() < 1e-6) nrm.set(0, 0, 1).addScaledVector(tan, -tan.z);
      nrm.normalize();
      bin.crossVectors(tan, nrm);
      const r = this.r0 + (this.r1 - this.r0) * t;
      for (let j = 0; j < sides; j++) {
        const ang = j / sides * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang), k = (i * sides + j) * 3;
        const x = nrm.x * cs + bin.x * sn, y = nrm.y * cs + bin.y * sn, z = nrm.z * cs + bin.z * sn;
        nor[k] = x; nor[k + 1] = y; nor[k + 2] = z;
        pos[k] = pt.x + x * r; pos[k + 1] = pt.y + y * r; pos[k + 2] = pt.z + z * r;
      }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true;
  }
}

// A point that chases a target on a spring: the source of all the flop.
// It lives relative to `origin` (the bean), so a bean running at full speed does not leave its
// limbs trailing behind; only changes of pose wobble.
class Flop {
  constructor() { this.p = V(); this.v = V(); this.out = V(); this.fresh = true; }
  step(target, origin, k, damp, dt) {
    t3.subVectors(target, origin);
    if (this.fresh || this.p.distanceToSquared(t3) > 4) { this.p.copy(t3); this.v.set(0, 0, 0); this.fresh = false; }
    this.v.addScaledVector(t3.sub(this.p), k * dt).multiplyScalar(Math.max(0, 1 - damp * dt));
    this.p.addScaledVector(this.v, dt);
    return this.out.addVectors(origin, this.p);
  }
}

export class Bean {
  constructor(scene, i) {
    this.i = i;
    const skin = toon(COLORS.beans[i]), dark = toon(COLORS.beanDark[i]), white = toon(0xffffff), black = toon(0x2b1a12);
    this.root = new THREE.Group();        // at the feet
    this.tilt = new THREE.Group();        // yaw and lean
    this.squash = new THREE.Group();      // stretch from the hips
    this.squash.position.y = 0.1;
    scene.add(this.root); this.root.add(this.tilt); this.tilt.add(this.squash);

    const geo = new THREE.CapsuleGeometry(0.36, 0.62, 8, 20);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {     // pear it: wider at the bottom, a little belly forward
      const y = pos.getY(k), w = 1.12 - 0.2 * (y + 0.67) / 1.34;
      pos.setX(k, pos.getX(k) * w); pos.setZ(k, pos.getZ(k) * w + (y < 0.2 ? 0.03 : 0));
    }
    geo.computeVertexNormals();
    const body = new THREE.Mesh(geo, skin);
    body.position.y = 0.67; body.castShadow = true;
    this.squash.add(body);

    this.eyes = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), white);
      eye.position.set(sx * 0.15, 1.0, 0.26);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), black);
      pupil.position.z = 0.1;
      eye.add(pupil); this.squash.add(eye);
      this.eyes.push({ eye, pupil });
    }
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), black);
    this.mouth.position.set(0, 0.8, 0.325); this.mouth.scale.set(1, 0.35, 0.4);
    this.squash.add(this.mouth);
    for (const sx of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(i ? 0xffb3c9 : 0x9ff0e2));
      cheek.position.set(sx * 0.24, 0.84, 0.25); cheek.scale.set(1, 0.6, 0.4);
      this.squash.add(cheek);
    }
    if (i === 0) {                          // a mover's cap
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
      cap.position.y = 1.24; cap.scale.y = 0.75;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14), dark);
      brim.position.set(0, 1.26, 0.26); brim.scale.z = 0.9;
      this.squash.add(cap, brim);
    } else {                                // a sprout
      this.sprout = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), toon(0xffd166));
      this.sprout.position.y = 1.5;
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), dark);
      stalk.position.y = 1.4;
      this.squash.add(this.sprout, stalk);
    }

    this.arms = [0, 1].map(() => ({ noodle: new Noodle(scene, skin, 0.075, 0.06), elbow: new Flop(),
      hand: new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), skin) }));
    this.legs = [0, 1].map(() => ({ noodle: new Noodle(scene, skin, 0.07, 0.06, 6), foot: new Flop(), knee: new Flop(),
      shoe: new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), dark) }));
    for (const a of this.arms) { a.hand.castShadow = true; scene.add(a.hand); }
    for (const l of this.legs) { l.shoe.castShadow = true; l.shoe.scale.set(0.9, 0.6, 1.3); scene.add(l.shoe); }

    this.y = null; this.yaw = 0; this.idle = 0; this.s = 1; this.sv = 0; this.phase = 0; this.blink = 2; this.shoutT = 0; this.shoutLen = 1;
    this.head = V();
  }

  yell(len) { this.shoutT = this.shoutLen = len; }
  thump(k) { this.sv -= k; }

  // p: the physics bean. other: its partner. grips: where the two hands go (world). t: seconds.
  update(dt, p, other, grips, t) {
    if (this.y == null || Math.abs(this.y - p.y) > 2) this.y = p.y;
    this.y += (p.y - this.y) * Math.min(1, (p.grounded ? 16 : 40) * dt);     // steps become a ramp
    this.root.position.set(p.x, this.y, p.z);

    const speed = Math.hypot(p.vx, p.vz), stunned = p.stun > 0;
    // Runs facing where it is going; standing around, it turns to the camera (and a bit to its
    // partner) so you get to see its face.
    this.idle = speed < 0.4 && p.grounded && !stunned ? this.idle + dt : 0;
    const chat = Math.atan2(other.x - p.x, other.z - p.z);
    let d = (this.idle > 0.5 ? Math.max(-0.7, Math.min(0.7, chat)) : p.face) - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, (this.idle > 0.5 ? 6 : 12) * dt);
    this.tilt.rotation.set(0, this.yaw, 0);
    if (stunned) { this.tilt.rotation.x = Math.sin(t * 23) * 0.5; this.tilt.rotation.z = Math.cos(t * 19) * 0.5; }
    else this.tilt.rotateX(Math.min(0.18, speed * 0.04) + (p.hang ? -0.25 : 0));

    // squash and stretch on a spring
    const crouch = p.height / P.H;
    const target = crouch + (p.grounded ? Math.sin(t * 2.4 + this.i * 2) * 0.012 : Math.max(-0.12, Math.min(0.2, p.vy * 0.018)));
    this.sv += ((target - this.s) * 260 - this.sv * 16) * dt;
    this.s = Math.max(0.45, Math.min(1.4, this.s + this.sv * dt));
    const wide = 1 / Math.sqrt(this.s);
    this.squash.scale.set(wide, this.s, wide);

    // face
    this.blink -= dt;
    if (this.blink < 0) this.blink = 1.5 + Math.random() * 3.5;
    const lid = this.blink < 0.1 ? 0.12 : 1, scared = stunned || p.hang || (!p.grounded && p.vy < -9);
    for (const [k, e] of this.eyes.entries()) {
      e.eye.scale.set(scared ? 1.3 : 1, (scared ? 1.3 : 1) * lid, 1);
      e.pupil.position.x = stunned ? Math.cos(t * 30 + k * 3) * 0.04 : -d * 0.05;
      e.pupil.position.y = stunned ? Math.sin(t * 30 + k * 3) * 0.04 : Math.max(-0.05, Math.min(0.05, -this.sv * 0.04 + p.vy * 0.004));
    }
    this.shoutT = Math.max(0, this.shoutT - dt);
    const open = this.shoutT > 0 ? 0.6 + 0.4 * Math.abs(Math.sin(this.shoutT * 22)) : scared ? 0.7 : 0;
    this.mouth.scale.set(1 + open * 0.7, 0.35 + open * 1.5, 0.4);
    if (this.sprout) { this.sprout.position.x = -this.sv * 0.05; this.sprout.position.z = -Math.min(0.12, speed * 0.02); }
    this.root.updateMatrixWorld(true);
    this.head.set(0, 1.5, 0).applyMatrix4(this.squash.matrixWorld);

    // legs: feet step in a circle on the ground, dangle and kick in the air
    const o = this.root.position;
    this.phase += speed * dt * 3.4;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);            // forward
    const mvx = speed > 0.3 ? p.vx / speed : fx, mvz = speed > 0.3 ? p.vz / speed : fz;
    for (const [k, leg] of this.legs.entries()) {
      const side = k ? 1 : -1, ph = this.phase + k * Math.PI;
      const hip = t0.set(side * 0.17, 0.26, 0).applyMatrix4(this.tilt.matrixWorld);
      const foot = t1.set(p.x + fz * side * 0.17, this.y + 0.07, p.z - fx * side * 0.17);
      if (!p.grounded) {
        const kick = stunned || p.hang ? Math.sin(t * 17 + k * 2.4) * 0.22 : 0;
        foot.set(hip.x - p.vx * 0.03 + fx * kick, hip.y - 0.3 - Math.max(-0.12, Math.min(0.1, p.vy * 0.012)), hip.z - p.vz * 0.03 + fz * kick);
      } else if (speed > 0.3) {
        foot.x += mvx * Math.sin(ph) * 0.3; foot.z += mvz * Math.sin(ph) * 0.3; foot.y += Math.max(0, Math.cos(ph)) * 0.2;
      }
      const f = leg.foot.step(foot, o, p.grounded ? 900 : 160, p.grounded ? 40 : 7, dt);
      const knee = leg.knee.step(t2.addVectors(hip, f).multiplyScalar(0.5).addScaledVector(t3.set(fx, 0, fz), 0.1), o, 300, 14, dt);
      leg.noodle.set(hip, knee, f);
      leg.shoe.position.copy(f); leg.shoe.rotation.y = this.yaw;
    }

    // arms: shoulder to the couch, sagging when there is slack, stretching when there is not
    const sh = [t0.set(-0.3, 0.84, 0.04).applyMatrix4(this.squash.matrixWorld).clone(), t1.set(0.3, 0.84, 0.04).applyMatrix4(this.squash.matrixWorld).clone()];
    const straight = sh[0].distanceToSquared(grips[0]) + sh[1].distanceToSquared(grips[1]);
    const crossed = sh[0].distanceToSquared(grips[1]) + sh[1].distanceToSquared(grips[0]);
    for (const [k, arm] of this.arms.entries()) {
      const hand = grips[straight <= crossed ? k : 1 - k], s = sh[k], len = s.distanceTo(hand);
      const mid = t2.addVectors(s, hand).multiplyScalar(0.5);
      mid.y -= Math.max(0.05, 0.8 - len) * 0.7;
      mid.addScaledVector(t3.set(fz, 0, -fx), (k ? 1 : -1) * 0.12);
      arm.noodle.set(s, arm.elbow.step(mid, o, 220, 9, dt), hand);
      arm.hand.position.copy(hand);
    }
  }

  dispose(scene) {
    scene.remove(this.root);
    for (const a of this.arms) scene.remove(a.noodle.mesh, a.hand);
    for (const l of this.legs) scene.remove(l.noodle.mesh, l.shoe);
  }
}

export class Couch {
  constructor(scene) {
    const g = this.group = new THREE.Group(), body = toon(COLORS.couch), shade = toon(COLORS.couchShade), leg = toon(COLORS.couchLeg);
    const L = P.COUCH_LEN;
    const part = (w, h, d, x, y, z, m, r = 0.07) => {
      const mesh = new THREE.Mesh(roundBox(w, h, d, r), m);
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    part(L, 0.3, 0.86, 0, -0.16, 0, body);                       // base
    part(L, 0.62, 0.24, 0, 0.16, -0.31, body, 0.1);              // back
    part(0.26, 0.5, 0.86, -L / 2 + 0.13, 0.04, 0, body, 0.1);    // arms
    part(0.26, 0.5, 0.86, L / 2 - 0.13, 0.04, 0, body, 0.1);
    this.cushions = [part(0.92, 0.16, 0.6, -0.47, 0.06, 0.1, shade, 0.07), part(0.92, 0.16, 0.6, 0.47, 0.06, 0.1, shade, 0.07)];
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.12, 8), leg);
      l.position.set(x * (L / 2 - 0.14), -0.36, z * 0.33); l.castShadow = true;
      g.add(l);
    }
    scene.add(g);
    this.x = V(); this.y = V(); this.z = new THREE.Vector3(0, 0, 1); this.m = new THREE.Matrix4();
    this.roll = 0; this.rollV = 0; this.bump = 0;
    this.grips = [[V(), V()], [V(), V()]];
  }

  // c: the solved couch from the physics (its two ends).
  update(dt, c) {
    const { x, y, z } = this;
    x.set(c.bx - c.ax, c.by - c.ay, c.bz - c.az);
    const len = x.length() || 1;
    x.divideScalar(len);
    t0.crossVectors(x, UP);
    if (t0.lengthSq() > 0.01) z.copy(t0.normalize());              // nearly vertical: keep the old side
    y.crossVectors(z, x).normalize();
    // a little cosmetic roll, kicked when the couch hits something
    if (c.hit > 0.004 && this.bump <= 0) { this.rollV += (Math.random() - 0.5) * 3; this.bump = 0.25; }
    this.bump -= dt;
    this.rollV += (-this.roll * 120 - this.rollV * 9) * dt;
    this.roll += this.rollV * dt;
    this.m.makeBasis(x, y, z);
    this.group.quaternion.setFromRotationMatrix(this.m);
    this.group.rotateX(this.roll);
    this.group.position.set((c.ax + c.bx) / 2, (c.ay + c.by) / 2, (c.az + c.bz) / 2);
    for (const [k, cu] of this.cushions.entries()) cu.position.y = 0.06 + Math.abs(this.roll) * 0.25 * (k ? 1 : -1) * Math.sign(this.roll || 1);

    const half = P.COUCH_LEN / 2 + 0.03;
    for (let e = 0; e < 2; e++) for (let h = 0; h < 2; h++) {
      this.grips[e][h].copy(this.group.position).addScaledVector(x, (e ? 1 : -1) * half)
        .addScaledVector(z, (h ? 1 : -1) * 0.3).addScaledVector(y, -0.2);
    }
  }
}

// A box with softened edges: a plain box, its corners pulled in.
function roundBox(w, h, d, r) {
  const g = new THREE.BoxGeometry(w, h, d, 4, 4, 4), p = g.attributes.position, v = V(), c = V();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    v.sub(c);
    if (v.lengthSq() > 0) v.setLength(r);
    p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
  }
  g.computeVertexNormals();
  return g;
}
