// Two players, one connection. WebRTC through PeerJS (its free cloud broker only introduces the
// two browsers; the game data goes peer to peer). `?net=bc` swaps in a BroadcastChannel so two
// tabs or iframes on one machine can play without any server (used by tools/duo.html).
import { NET } from './config.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const makeCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const cleanCode = s => (s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

function loadPeerJs() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = NET.PEER_JS;
    s.onload = res;
    s.onerror = () => rej(new Error('Could not load the networking library. Are you online?'));
    document.head.appendChild(s);
  });
}

export class Net {
  constructor(kind) {
    this.kind = kind || 'peer';
    this.handlers = {};
    this.open = false; this.role = null; this.code = '';
    this.rtt = 0.08;
    this.pinger = setInterval(() => this.send('ping', performance.now()), 1000);
    this.on('ping', t => this.send('pong', t));
    this.on('pong', t => { this.rtt += ((performance.now() - t) / 1000 - this.rtt) * 0.3; });
  }

  on(type, fn) { this.handlers[type] = fn; }
  emit(type, data) { const h = this.handlers[type]; if (h) h(data); }

  send(t, d) {
    if (!this.open) return;
    if (this.bc) this.bc.postMessage({ from: this.role, t, d });
    else this.conn.send({ t, d });
  }

  // Resolves with the room code once the room exists. 'connect' fires when the guest arrives.
  async host() {
    this.role = 'host';
    if (this.kind === 'bc') return this.openChannel(cleanCode(new URLSearchParams(location.search).get('code')) || makeCode());
    await loadPeerJs();
    for (let tries = 0; tries < 5; tries++) {
      const code = makeCode();
      try {
        await new Promise((res, rej) => {
          const peer = new window.Peer(NET.PREFIX + code);
          peer.on('open', () => { if (!this.peer) { this.peer = peer; res(); } });
          peer.on('error', e => { if (!this.peer) { peer.destroy(); rej(e); } else this.peerError(e); });
          peer.on('connection', c => this.accept(c));
        });
        this.watchSignal();
        return (this.code = code);
      } catch (e) {
        if (e.type !== 'unavailable-id') throw new Error('Could not reach the matchmaking server.');
      }
    }
    throw new Error('Could not find a free room code. Try again.');
  }

  accept(c) {
    if (this.open) { c.on('open', () => c.close()); return; }       // the room is full
    if (this.conn) { try { this.conn.close(); } catch { /* already gone */ } }   // a knock that never got through must not block the next
    this.attach(c);
  }

  // The link to the broker is what makes a room findable. Phones and tablets drop it whenever the
  // browser is not on screen (say, while texting the code to a friend), so put it back whenever it
  // goes, and freshen it when the page comes back into view.
  watchSignal() {
    const peer = this.peer;
    let hiddenAt = 0;
    const again = () => { if (this.peer === peer && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch { /* next round */ } } };
    this.signal = true;
    peer.on('disconnected', () => { this.signal = false; this.emit('signal'); });
    peer.on('open', () => { this.signal = true; this.emit('signal'); });
    this.keep = setInterval(again, 2000);
    this.onShow = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (!this.open && hiddenAt && Date.now() - hiddenAt > 4000 && !peer.disconnected && !peer.destroyed) {
        try { peer.disconnect(); } catch { /* fine */ }             // the old socket may be dead without knowing it
      }
      hiddenAt = 0;
      setTimeout(again, 300);
    };
    document.addEventListener('visibilitychange', this.onShow);
    addEventListener('pageshow', this.onShow);
    addEventListener('online', this.onShow);
  }

  // Resolves once connected to the host's room. Keeps knocking for half a minute: the room may be
  // unreachable for a moment (see watchSignal), and a first handshake does not always get through.
  async join(code) {
    this.role = 'guest'; this.code = code;
    if (this.kind === 'bc') { this.openChannel(code); return; }
    await loadPeerJs();
    await new Promise((res, rej) => {
      let done = false, seen = false, timer;
      const finish = err => {
        if (done) return;
        done = true; clearTimeout(timer); clearTimeout(total);
        if (err) { this.close(); rej(new Error(err)); } else res();
      };
      const total = setTimeout(() => finish(seen
        ? `Room ${code} is there, but the connection would not go through. A firewall or VPN on either side can block it.`
        : `No room called ${code}. Check the code, and ask the host to keep the game on their screen.`), 30000);
      const peer = this.peer = new window.Peer();
      const knock = () => {
        if (done || peer.destroyed) return;
        seen = true;                    // until the broker says otherwise
        const c = peer.connect(NET.PREFIX + code, { reliable: true, serialization: 'json' });
        this.attach(c);
        c.on('open', () => finish());
        clearTimeout(timer);
        timer = setTimeout(() => { this.emit('status', `Still knocking on room ${code}...`); try { c.close(); } catch { /* gone */ } knock(); }, 8000);
      };
      peer.on('open', knock);
      peer.on('error', e => {
        if (this.open) return this.peerError(e);
        if (e.type === 'peer-unavailable') {
          seen = false;
          this.emit('status', `Can't see room ${code} yet. Still trying...`);
          clearTimeout(timer); timer = setTimeout(knock, 2500);
        } else if (e.type !== 'network' && e.type !== 'disconnected') finish('Could not connect (' + e.type + ').');
      });
      peer.on('disconnected', () => { if (!done && !peer.destroyed) { try { peer.reconnect(); } catch { /* the timer ends it */ } } });
    });
  }

  attach(c) {
    this.conn = c;
    const gone = () => {
      if (this.conn !== c) return;
      this.conn = null;
      if (this.open) { this.open = false; this.emit('disconnect'); }
    };
    c.on('open', () => { if (this.conn !== c) { c.close(); return; } this.open = true; this.emit('connect'); });
    c.on('data', m => { if (this.conn === c && m && m.t) this.emit(m.t, m.d); });
    c.on('close', gone);
    c.on('error', gone);
  }

  peerError(e) { if (e.type === 'network' || e.type === 'disconnected') return; console.warn('peer error', e.type); }

  lost() {
    if (!this.open) return;
    this.open = false; this.conn = null;
    this.emit('disconnect');
  }

  openChannel(code) {
    this.code = code;
    const bc = this.bc = new BroadcastChannel('pivoooot-' + code);
    const say = t => bc.postMessage({ from: this.role, t });
    bc.onmessage = ({ data: m }) => {
      if (m.from === this.role) return;
      if (m.t === '_hello' && this.role === 'host') { say('_welcome'); if (!this.open) { this.open = true; this.emit('connect'); } }
      else if (m.t === '_welcome') { if (!this.open) { this.open = true; clearInterval(this.knock); this.emit('connect'); } }
      else if (m.t === '_bye') this.lost();
      else this.emit(m.t, m.d);
    };
    if (this.role === 'guest') { say('_hello'); this.knock = setInterval(() => say('_hello'), 300); }
    return code;
  }

  close() {
    clearInterval(this.pinger); clearInterval(this.knock); clearInterval(this.keep);
    if (this.onShow) {
      document.removeEventListener('visibilitychange', this.onShow);
      removeEventListener('pageshow', this.onShow); removeEventListener('online', this.onShow);
    }
    this.handlers = {};
    if (this.bc) { this.bc.postMessage({ from: this.role, t: '_bye' }); this.bc.close(); }
    if (this.peer) this.peer.destroy();
    this.open = false; this.conn = this.peer = this.bc = null;
  }
}
