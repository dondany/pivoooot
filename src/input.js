// Keyboard (one or two players on it) and touch. read(scheme) gives one bean's input for a frame.

const SCHEMES = {
  // online: everything works, so either hand position is fine
  solo: {
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], north: ['KeyW', 'ArrowUp'], south: ['KeyS', 'ArrowDown'],
    jump: ['Space'], up: ['KeyE', 'ShiftLeft', 'ShiftRight'], down: ['KeyQ', 'KeyC'], shout: ['KeyF'], shut: ['KeyG'],
  },
  // same keyboard: left half, right half
  p1: {
    left: ['KeyA'], right: ['KeyD'], north: ['KeyW'], south: ['KeyS'],
    jump: ['Space'], up: ['KeyE'], down: ['KeyQ'], shout: ['KeyF'], shut: ['KeyG'],
  },
  p2: {
    left: ['ArrowLeft'], right: ['ArrowRight'], north: ['ArrowUp'], south: ['ArrowDown'],
    jump: ['Enter', 'ShiftRight', 'Numpad0'], up: ['Period'], down: ['Comma'], shout: ['KeyM'], shut: ['KeyN'],
  },
};

export const KEY_LABELS = {
  solo: { up: 'E', down: 'Q', jump: 'Space', shout: 'F' },
  local: { up: 'E / .', down: 'Q / ,', jump: 'Space / Enter', shout: 'F / M' },
  touch: { up: '▲', down: '▼', jump: 'JUMP', shout: 'PIVOT!' },
};

const GAME_KEYS = new Set(Object.values(SCHEMES).flatMap(s => Object.values(s).flat()));

export class Input {
  constructor() {
    this.down = new Set(); this.pressed = new Set();
    this.touch = { mx: 0, mz: 0, up: false, down: false, pressed: new Set(), used: false };
    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    this.bindTouch();
  }

  read(name) {
    const s = SCHEMES[name], held = k => s[k].some(c => this.down.has(c)), hit = k => s[k].some(c => this.pressed.has(c));
    const t = name === 'p2' ? null : this.touch;
    const out = {
      mx: (held('right') ? 1 : 0) - (held('left') ? 1 : 0) + (t ? t.mx : 0),
      mz: (held('south') ? 1 : 0) - (held('north') ? 1 : 0) + (t ? t.mz : 0),
      hold: (held('up') || (t && t.up) ? 1 : 0) - (held('down') || (t && t.down) ? 1 : 0),
      jump: hit('jump') || !!(t && t.pressed.has('jump')),
      shout: hit('shout') || !!(t && t.pressed.has('shout')),
      shut: hit('shut'),
    };
    for (const k of ['jump', 'shout', 'shut']) for (const c of s[k]) this.pressed.delete(c);
    if (t) t.pressed.clear();
    return out;
  }

  endFrame() { this.pressed.clear(); this.touch.pressed.clear(); }

  bindTouch() {
    const root = document.getElementById('touch');
    if (!root) return;
    const t = this.touch, zone = root.querySelector('.stick-zone'), stick = root.querySelector('.stick'), nub = stick.firstElementChild;
    let id = null, ox = 0, oy = 0;
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; t.mx = t.mz = 0; stick.hidden = true;
    };
    zone.addEventListener('pointerdown', e => {
      id = e.pointerId; ox = e.clientX; oy = e.clientY; t.used = true;
      zone.setPointerCapture(id);
      stick.hidden = false; stick.style.left = ox + 'px'; stick.style.top = oy + 'px'; nub.style.transform = '';
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      let dx = (e.clientX - ox) / 46, dy = (e.clientY - oy) / 46;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      t.mx = Math.abs(dx) < 0.15 ? 0 : dx; t.mz = Math.abs(dy) < 0.15 ? 0 : dy;
      nub.style.transform = `translate(${dx * 46}px, ${dy * 46}px)`;
    });
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    for (const b of root.querySelectorAll('button')) {
      const k = b.dataset.k, off = () => { if (k === 'up' || k === 'down') t[k] = false; b.classList.remove('on'); };
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); t.used = true; b.classList.add('on');
        if (k === 'up' || k === 'down') t[k] = true; else t.pressed.add(k);
      });
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    }
  }
}
