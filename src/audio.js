// Everything you hear is synthesized: effects, the beans' kazoo voices and a funk loop.

class GameAudio {
  constructor() { this.ctx = null; this.musicOn = true; this.playing = false; }

  // Browsers only allow sound after a click or key press; call this from one.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.out = this.ctx.createGain(); this.out.gain.value = 0.9; this.out.connect(this.ctx.destination);
      this.music = this.ctx.createGain(); this.music.gain.value = 0.5; this.music.connect(this.out);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, len);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone({ f, f2, t = 0.15, type = 'sine', vol = 0.2, at = 0, dest, cut, cut2, q = 1, vib = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + t);
    if (vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = 7; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + t);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
    let node = o;
    if (cut) {
      const fl = c.createBiquadFilter();
      fl.type = 'bandpass'; fl.Q.value = q; fl.frequency.setValueAtTime(cut, t0);
      if (cut2) fl.frequency.exponentialRampToValueAtTime(cut2, t0 + t);
      o.connect(fl); node = fl;
    }
    node.connect(g); g.connect(dest || this.out);
    o.start(t0); o.stop(t0 + t + 0.02);
  }

  noise({ t = 0.1, vol = 0.2, f = 1000, q = 1, type = 'bandpass', at = 0, dest }) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + at, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
    s.connect(fl); fl.connect(g); g.connect(dest || this.out);
    s.start(t0, Math.random()); s.stop(t0 + t + 0.02);
  }

  jump() { this.tone({ f: 260, f2: 620, t: 0.16, type: 'triangle', vol: 0.16 }); }
  land(v = 6) { this.noise({ t: 0.09, vol: Math.min(0.3, v * 0.02), f: 220, type: 'lowpass' }); }
  bonk() {
    this.tone({ f: 190, f2: 55, t: 0.3, type: 'square', vol: 0.2 });
    this.noise({ t: 0.16, vol: 0.3, f: 900 });
    this.tone({ f: 900, f2: 1500, t: 0.25, type: 'sine', vol: 0.08, at: 0.12, vib: 80 });
  }
  fall() { this.tone({ f: 700, f2: 90, t: 0.7, type: 'triangle', vol: 0.16 }); }
  ding() { this.tone({ f: 880, t: 0.2, vol: 0.14 }); this.tone({ f: 1320, t: 0.35, vol: 0.14, at: 0.09 }); }
  click() { this.tone({ f: 520, f2: 700, t: 0.06, type: 'triangle', vol: 0.1 }); }
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone({ f, t: 0.28, type: 'triangle', vol: 0.17, at: i * 0.11 }));
    this.noise({ t: 0.7, vol: 0.1, f: 5000, type: 'highpass', at: 0.6 });
  }

  // "PI-VOOOT": a short bright blip, then a long sliding honk that gets longer and wobblier.
  shout(who, level) {
    const base = who ? 300 : 220, len = 0.28 + level * 0.2;
    this.tone({ f: base * 1.7, t: 0.09, type: 'sawtooth', vol: 0.2, cut: 2300, q: 4 });
    this.tone({ f: base * 1.25, f2: base * (0.95 - level * 0.03), t: len, type: 'sawtooth', vol: 0.24, at: 0.1,
      cut: 520, cut2: 900, q: 3, vib: 4 + level * 7 });
    this.noise({ t: 0.05, vol: 0.12, f: 4000, type: 'highpass', at: 0.1 + len });
  }
  shut(who, level) {
    const base = who ? 330 : 240;
    for (let i = 0; i <= level; i++) {
      const at = i * 0.3, long = i === 2;
      this.tone({ f: base * 1.5, t: 0.08, type: 'square', vol: 0.12, at, cut: 2600, q: 3 });
      this.tone({ f: base * 1.1, f2: base * 0.8, t: long ? 0.5 : 0.13, type: 'sawtooth', vol: 0.2, at: at + 0.09, cut: 800, cut2: 600, q: 3, vib: long ? 18 : 0 });
    }
  }

  setMusic(on) {
    this.musicOn = on;
    if (on) this.startMusic(); else this.stopMusic();
  }
  startMusic() {
    if (!this.ctx || this.playing || !this.musicOn) return;
    this.playing = true; this.stepN = 0; this.nextT = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 40);
  }
  stopMusic() { this.playing = false; clearInterval(this.timer); }

  schedule() {
    const c = this.ctx, sixteenth = 60 / 104 / 4;
    const BASS = [0, null, 0, 12, null, 10, null, 7, 0, null, 3, 5, null, 7, 10, null,
      0, null, 0, 12, null, 10, 12, null, 5, null, 5, 7, null, 3, 2, null];
    while (this.nextT < c.currentTime + 0.15) {
      const n = this.stepN++, s = n % 32, at = this.nextT - c.currentTime, m = this.music, swing = s % 2 ? sixteenth * 0.12 : 0;
      const semi = BASS[s];
      if (semi != null) this.tone({ f: 82.41 * 2 ** (semi / 12), t: 0.2, type: 'sawtooth', vol: 0.3, at: at + swing, dest: m, cut: 380, cut2: 140, q: 1.5 });
      if (s % 8 === 0 || s % 16 === 10) this.tone({ f: 130, f2: 42, t: 0.16, vol: 0.5, at, dest: m });
      if (s % 8 === 4) this.noise({ t: 0.11, vol: 0.2, f: 1900, q: 0.8, at, dest: m });
      if (s % 2 === 0) this.noise({ t: 0.03, vol: s % 4 === 2 ? 0.1 : 0.05, f: 8000, type: 'highpass', at, dest: m });
      if (s === 6 || s === 14 || s === 22 || s === 27) {
        for (const k of [0, 3, 7, 10]) this.tone({ f: 329.63 * 2 ** (k / 12), t: 0.12, type: 'square', vol: 0.03, at: at + swing, dest: m });
      }
      this.nextT += sixteenth;
    }
  }
}

export const audio = new GameAudio();
