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
    this.pinger = setInterval(() => this.send('ping', performance.now()), 2000);
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
          peer.on('open', () => { this.peer = peer; res(); });
          peer.on('error', e => { if (!this.peer) { peer.destroy(); rej(e); } else this.peerError(e); });
          peer.on('connection', c => { if (this.conn) c.close(); else this.attach(c); });
        });
        return (this.code = code);
      } catch (e) {
        if (e.type !== 'unavailable-id') throw new Error('Could not reach the matchmaking server.');
      }
    }
    throw new Error('Could not find a free room code. Try again.');
  }

  // Resolves once connected to the host's room.
  async join(code) {
    this.role = 'guest'; this.code = code;
    if (this.kind === 'bc') { this.openChannel(code); return; }
    await loadPeerJs();
    await new Promise((res, rej) => {
      const fail = msg => { this.close(); rej(new Error(msg)); };
      const timer = setTimeout(() => fail('No answer from room ' + code + '.'), 15000);
      const peer = this.peer = new window.Peer();
      peer.on('open', () => {
        const c = peer.connect(NET.PREFIX + code, { reliable: true, serialization: 'json' });
        this.attach(c);
        c.on('open', () => { clearTimeout(timer); res(); });
      });
      peer.on('error', e => {
        if (this.open) return this.peerError(e);
        clearTimeout(timer);
        fail(e.type === 'peer-unavailable' ? 'No room called ' + code + '. Check the code?' : 'Could not connect (' + e.type + ').');
      });
    });
  }

  attach(c) {
    this.conn = c;
    c.on('open', () => { this.open = true; this.emit('connect'); });
    c.on('data', m => { if (m && m.t) this.emit(m.t, m.d); });
    c.on('close', () => this.lost());
    c.on('error', () => this.lost());
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
    clearInterval(this.pinger); clearInterval(this.knock);
    this.handlers = {};
    if (this.bc) { this.bc.postMessage({ from: this.role, t: '_bye' }); this.bc.close(); }
    if (this.peer) this.peer.destroy();
    this.open = false; this.conn = this.peer = this.bc = null;
  }
}
