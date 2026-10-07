// Boot, screens, the frame loop, and the glue between Game, View, Input, Net and audio.
import { LEVELS } from './levels.js';
import { Game } from './game.js';
import { View } from './view.js';
import { Input, KEY_LABELS } from './input.js';
import { Net, cleanCode } from './net.js';
import { audio } from './audio.js';
import { NET, SHOUTS, SHUT_UP, SHOUT_COMBO } from './config.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SCREENS = ['menu', 'lobby', 'pause', 'win'];

const app = window.app = {
  mode: 'menu',          // menu | lobby | play | win
  online: false, me: 0,  // me: which bean this browser drives online (host 0, guest 1)
  net: null, game: null, paused: false,
  view: new View($('scene')), input: new Input(),
};
const { view, input } = app;
const isHost = () => !app.online || app.me === 0;
const shoutState = [0, 1].map(() => [{ t: -9, level: 0 }, { t: -9, level: 0 }]);
const bubbles = [0, 1].map(i => ({ el: $('bubble' + i), until: 0 }));
let sendAcc = 0, hintTimer = 0, toastTimer = 0, levelClock = 0, lastState = 0;

// ---------------------------------------------------------------- screens
function show(name) {
  for (const s of SCREENS) $(s).hidden = s !== name;
  $('hud').hidden = app.mode !== 'play' && app.mode !== 'win';
  $('touch').hidden = app.mode !== 'play' || !matchMedia('(pointer: coarse)').matches;
}

function toast(text, ms = 2200) {
  const el = $('toast');
  el.textContent = text; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const best = () => { try { return JSON.parse(localStorage.getItem('pivoooot-best') || '{}'); } catch { return {}; } };
function saveBest(id, time) {
  const b = best();
  if (b[id] && b[id] <= time) return false;
  b[id] = time;
  try { localStorage.setItem('pivoooot-best', JSON.stringify(b)); } catch { /* private mode */ }
  return true;
}

function keyLabels() { return KEY_LABELS[input.touch.used ? 'touch' : app.online ? 'solo' : 'local']; }

function loadLevel(i) {
  const g = app.game = new Game(LEVELS[i], i);
  g.players.forEach((p, k) => { p.local = !app.online || k === app.me; });
  view.load(g);
  for (const s of shoutState.flat()) { s.t = -9; s.level = 0; }
  for (const b of bubbles) { b.until = 0; b.el.className = 'bubble'; }
  levelClock = lastState = 0;
  return g;
}

function toMenu(msg) {
  if (app.net) { app.net.close(); app.net = null; }
  app.online = false; app.me = 0; app.mode = 'menu'; app.paused = false;
  loadLevel(0);
  $('menu-msg').textContent = msg || '';
  $('btn-host').disabled = $('btn-join').disabled = false;
  show('menu');
}

function toLobby() {
  app.mode = 'lobby'; app.paused = false;
  if (!app.game || app.game.index !== 0 || app.game.time > 0) loadLevel(0);
  renderLobby();
  show('lobby');
}

function renderLobby() {
  const st = $('lobby-status'), net = app.net, b = best();
  if (!app.online) st.innerHTML = 'Same keyboard. Bean one: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>. Bean two: the arrow keys.';
  else if (app.me === 1) st.innerHTML = `You're in room <b>${net.code}</b>. Your friend picks the level<span class="dots"></span>`;
  else if (net.open) st.innerHTML = `Your friend is in room <b>${net.code}</b>. Pick a level!`;
  else st.innerHTML = `Room code <span class="code">${net.code}</span>Tell your friend, or <button id="btn-copy" class="btn small">copy the invite link</button><br>Waiting for them<span class="dots"></span>`;
  const copy = $('btn-copy');
  if (copy) copy.onclick = () => {
    const url = location.origin + location.pathname + '?room=' + net.code;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Invite link copied'), () => prompt('Send this link to your friend:', url));
  };
  const wrap = $('levels');
  wrap.classList.toggle('locked', !isHost() || (app.online && !net.open));
  wrap.innerHTML = '';
  LEVELS.forEach((l, i) => {
    const el = document.createElement('button');
    el.className = 'level';
    el.innerHTML = `<div class="num">${i + 1}</div><h3>${l.name}</h3><p>${l.blurb}</p><div class="best">${b[l.id] ? 'Best ' + fmt(b[l.id]) : 'Not delivered yet'}</div>`;
    el.onclick = () => { if (isHost()) startLevel(i); };
    wrap.appendChild(el);
  });
  $('lobby-keys').innerHTML = app.online
    ? '<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</span><span><kbd>Space</kbd> jump</span><span><kbd>E</kbd> lift</span><span><kbd>Q</kbd> lower</span><span><kbd>F</kbd> PIVOT!</span><span><kbd>G</kbd> shut up!</span>'
    : '<span>Bean two: <kbd>Enter</kbd> jump</span><span><kbd>.</kbd> lift</span><span><kbd>,</kbd> lower</span><span><kbd>M</kbd> PIVOT!</span><span><kbd>N</kbd> shut up!</span>';
  $('btn-leave').textContent = app.online ? '← Leave room' : '← Back';
}

function startLevel(i, fromNet) {
  if (app.online && !fromNet) app.net.send('start', { level: i });
  loadLevel(i);
  app.mode = 'play'; app.paused = false;
  $('hud-level').textContent = LEVELS[i].name;
  $('hint').classList.remove('show');
  show(null);
  audio.unlock(); audio.startMusic();
  const tags = app.online ? (app.me ? ['', 'YOU'] : ['YOU', '']) : ['WASD', 'ARROWS'];
  tags.forEach((t, k) => { $('tag' + k).textContent = t; });
}

// ---------------------------------------------------------------- online
function wire(net) {
  net.on('connect', () => { audio.ding(); toast('Your friend is here!'); if (app.mode === 'lobby') renderLobby(); });
  net.on('disconnect', () => {
    if (app.me === 1) return toMenu('Lost the connection to the host.');
    toast('Your friend left.', 3500);
    toLobby();
  });
  net.on('start', d => startLevel(d.level, true));
  net.on('lobby', () => toLobby());
  net.on('st', s => {
    const g = app.game;
    if (app.mode !== 'play' && app.mode !== 'win') return;
    g.applyRemote(1 - app.me, s);
    lastState = levelClock;
    if (app.me === 1 && !g.done) {                 // the host's clock is the level clock
      const d = s.t + net.rtt / 2 - g.time;
      g.time += Math.abs(d) > 0.5 ? d : d * 0.1;
    }
  });
  net.on('ev', d => {
    const g = app.game;
    if (app.mode !== 'play' && app.mode !== 'win') return;
    if (d.k === 'shout') shout(1 - app.me, d.kind, true);
    else if (d.k === 'win') g.finish(d.time);
    else if (d.k === 'respawn' && d.e > g.epoch) {
      g.cp = Math.max(g.cp, d.cp);
      if (d.fell) { g.stats.falls++; audio.fall(); }
      g.respawn(d.e);
    }
  });
}

async function host() {
  audio.unlock(); audio.click();
  $('menu-msg').textContent = 'Opening a room...';
  $('btn-host').disabled = $('btn-join').disabled = true;
  const net = app.net = new Net(params.get('net'));
  wire(net);
  try {
    await net.host();
    app.online = true; app.me = 0;
    toLobby();
  } catch (e) { toMenu(e.message); }
}

async function join(code) {
  audio.unlock(); audio.click();
  code = cleanCode(code);
  if (code.length < 4) { $('menu-msg').textContent = 'Room codes are four letters.'; return; }
  $('menu-msg').textContent = 'Knocking on room ' + code + '...';
  $('btn-host').disabled = $('btn-join').disabled = true;
  const net = app.net = new Net(params.get('net'));
  wire(net);
  app.online = true; app.me = 1;
  try {
    await net.join(code);
    if (app.mode === 'menu') toLobby();
  } catch (e) { toMenu(e.message); }
}

// ---------------------------------------------------------------- play
function respawn(fell) {
  const g = app.game;
  if (!g || g.done) return;
  if (fell) { g.stats.falls++; audio.fall(); }
  g.respawn();
  if (app.online) app.net.send('ev', { k: 'respawn', e: g.epoch, cp: g.cp, fell });
}

function shout(i, kind, remote) {
  const g = app.game, lines = kind ? SHUT_UP : SHOUTS, st = shoutState[i][kind], now = performance.now() / 1000;
  st.level = now - st.t < SHOUT_COMBO ? Math.min(st.level + 1, lines.length - 1) : 0;
  st.t = now;
  const b = bubbles[i], len = 1.1 + st.level * 0.3;
  b.el.textContent = lines[st.level];
  b.el.className = 'bubble';
  void b.el.offsetWidth;                      // restart the pop animation
  b.el.className = 'bubble on ' + (st.level >= 3 || (kind && st.level === 2) ? 'loud' : 'pop');
  b.el.style.fontSize = 22 + st.level * 5 + 'px';
  b.until = levelClock + len;
  view.beans[i].yell(len * 0.8);
  if (kind) audio.shut(i, st.level);
  else { audio.shout(i, st.level); g.stats.shouts++; if (st.level >= 3) view.shake = Math.max(view.shake, 0.2); }
  if (!remote && app.online) app.net.send('ev', { k: 'shout', kind });
}

function hint(text) {
  const k = keyLabels(), el = $('hint');
  el.innerHTML = text.replace(/\{(\w+)\}/g, (_, n) => `<b>${k[n] || n}</b>`);
  el.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.remove('show'), 7500);
}

function win(time) {
  const g = app.game, l = LEVELS[g.index], s = g.stats, m = g.mid;
  app.mode = 'win';
  if (app.online) app.net.send('ev', { k: 'win', time });
  audio.win(); view.confetti(m.x, m.y, m.z);
  $('hint').classList.remove('show');
  const record = saveBest(l.id, time), last = g.index === LEVELS.length - 1;
  $('win-title').textContent = last ? 'Returned!' : "It's in!";
  $('win-stats').innerHTML = `<div><b>${fmt(time)}</b><span>${record ? 'new best!' : 'time'}</span></div><div><b>${s.shouts}</b><span>pivots yelled</span></div><div><b>${s.falls + s.bonks}</b><span>mishaps</span></div>`;
  $('win-quip').textContent = s.shouts === 0 ? 'Not one "PIVOT". Are you two even friends?'
    : s.shouts > 25 ? "I don't think it's gonna pivot any more."
    : s.falls + s.bonks === 0 ? 'Flawless. Suspiciously flawless.'
    : s.falls + s.bonks > 8 ? 'The couch has seen things.' : 'Okay. You did not have to cut it in half.';
  $('btn-next').textContent = last ? 'Do it all again' : 'Next level';
  $('btn-next').hidden = $('btn-levels').hidden = !isHost();
  $('win-wait').textContent = isHost() ? '' : 'Your friend picks what happens next...';
  setTimeout(() => { if (app.mode === 'win' && app.game === g) show('win'); }, 1500);
}

function handle(e) {
  const g = app.game, p = e.i != null ? g.players[e.i] : null;
  switch (e.type) {
    case 'jump': audio.jump(); view.puff(p.x, p.y + 0.1, p.z, 5); break;
    case 'land': audio.land(e.v); view.puff(p.x, p.y + 0.1, p.z, 7); view.beans[e.i].thump(Math.min(4, e.v * 0.25)); break;
    case 'bonk': audio.bonk(); view.shake = 0.5; view.puff(p.x, p.y + 1, p.z, 10, 0xffd166, 4, 5, 9); break;
    case 'fell': respawn(true); toast('Whoops. Back to the checkpoint.'); break;
    case 'checkpoint': audio.ding(); toast('Checkpoint!'); break;
    case 'hint': hint(e.text); break;
    case 'win': win(e.time); break;
  }
}

function frame(dt) {
  const g = app.game, playing = app.mode === 'play';
  levelClock += dt;
  if (playing && !g.done && !app.paused) {
    const who = app.online ? [[app.me, 'solo']] : [[0, 'p1'], [1, 'p2']];
    for (const [i, scheme] of who) {
      const p = g.players[i], inp = app.puppet ? { mx: 0, mz: 0, hold: 0, ...app.puppet[i] } : input.read(scheme);
      p.input.mx = inp.mx; p.input.mz = inp.mz; p.input.hold = inp.hold;
      if (inp.jump) p.jumpQ = true;
      if (inp.shout) shout(i, 0);
      if (inp.shut) shout(i, 1);
    }
  }
  input.endFrame();
  if (app.online && playing && levelClock - lastState > 0.5) {     // partner's tab went quiet: stop predicting their walk
    const r = g.players[1 - app.me].input;
    r.mx = r.mz = 0;
  }
  if (!app.paused || app.online) g.update(dt);
  const events = g.events.splice(0);
  if (playing || app.mode === 'win') events.forEach(handle);

  if (app.online && app.net.open && (playing || app.mode === 'win')) {
    sendAcc += dt;
    if (sendAcc >= 1 / NET.RATE) { sendAcc = 0; app.net.send('st', g.snapshot(app.me)); }
  }

  view.update(g, dt, app.mode === 'menu' || app.mode === 'lobby');
  view.render();

  if (playing) $('hud-time').textContent = fmt(g.time);
  bubbles.forEach((b, i) => {
    const on = b.until > levelClock && (playing || app.mode === 'win');
    if (!on) { b.el.classList.remove('on'); }
    else { const s = view.project(view.beans[i].head); b.el.style.transform = `translate(${s.x}px, ${s.y - 22}px) translate(-50%, -100%)`; }
    const tag = $('tag' + i), tagOn = playing && levelClock < 7 && !on && !!tag.textContent;
    tag.classList.toggle('on', tagOn);
    if (tagOn) { const s = view.project(view.beans[i].head); tag.style.transform = `translate(${s.x}px, ${s.y - 14}px) translate(-50%, -100%)`; }
  });
}

// ---------------------------------------------------------------- wiring
$('logo').innerHTML = [...'PIVOOOOT!'].map((c, i) => `<span class="${c === 'O' ? 'o' : ''}" style="--i:${i}">${c}</span>`).join('');
$('btn-host').onclick = host;
$('btn-join').onclick = () => join($('join-code').value);
$('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') join($('join-code').value); });
$('join-code').addEventListener('input', e => { e.target.value = cleanCode(e.target.value); });
$('btn-local').onclick = () => { audio.unlock(); audio.click(); app.online = false; toLobby(); };
$('btn-leave').onclick = () => toMenu();
$('btn-music').onclick = () => { audio.unlock(); audio.setMusic(!audio.musicOn); $('btn-music').classList.toggle('off', !audio.musicOn); };
$('btn-respawn').onclick = () => respawn(false);
$('btn-respawn2').onclick = () => { respawn(false); pause(false); };
$('btn-pause').onclick = () => pause(true);
$('btn-resume').onclick = () => pause(false);
const backToLobby = () => {
  if (!isHost()) return toMenu();
  if (app.online) app.net.send('lobby');
  toLobby();
};
$('btn-quit').onclick = backToLobby;
$('btn-levels').onclick = backToLobby;
$('btn-next').onclick = () => startLevel((app.game.index + 1) % LEVELS.length);

function pause(on) {
  if (app.mode !== 'play') return;
  app.paused = on;
  for (const p of app.game.players) if (p.local) p.input.mx = p.input.mz = p.input.hold = 0;
  $('btn-quit').textContent = isHost() ? 'Level select' : 'Leave the game';
  if (on) show('pause'); else show(null);
}
addEventListener('keydown', e => {
  if (e.code === 'Escape' && app.mode === 'play') pause(!app.paused);
  if (e.code === 'KeyR' && app.mode === 'play' && !app.paused && e.target.tagName !== 'INPUT') respawn(false);
});
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => audio.unlock(), { once: true });
addEventListener('contextmenu', e => e.preventDefault());

let last = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  frame(dt);
}

async function boot() {
  await Promise.race([document.fonts ? document.fonts.load('40px Shrikhand') : 0, new Promise(r => setTimeout(r, 1200))]);
  toMenu();
  app.frame = frame; app.startLevel = startLevel; app.host = host; app.join = join;
  if (params.has('dev')) (await import('./dev.js')).install(app);
  if (params.has('level')) { app.online = false; startLevel(+params.get('level') || 0); }
  const room = cleanCode(params.get('room') || '');
  if (params.get('auto') === 'host') host();
  else if (params.get('auto') === 'join') join(params.get('code'));
  else if (room) { $('join-code').value = room; join(room); }
  if (!params.has('manual')) requestAnimationFrame(loop);
}
boot();
