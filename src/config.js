// Every tuning number in one place. Lengths are metres-ish: a bean is 1.45 tall.

export const PHYS = {
  DT: 1 / 120,                 // fixed physics step
  GRAVITY: 26, JUMP_V: 8.4, MAX_FALL: 28,
  RUN: 4.6, HOLD_SLOW: 0.72,   // lifting or lowering the couch slows you down
  ACCEL: 45, AIR_ACCEL: 14,
  R: 0.36, H: 1.45, H_CROUCH: 0.95,
  STEP: 0.42,                  // ledges this low are walked up (stairs are 0.25)
  LEDGE: 0.12,                 // ...but in the air a bean only scrambles up this much
  COYOTE: 0.1, JUMP_BUFFER: 0.12,

  ROD: 3.3,                    // distance between the two pairs of hands
  COUCH_LEN: 2.4, COUCH_R: 0.4, // the couch collides as a capsule between the hands
  HOLD_LOW: 0.5, HOLD_MID: 0.95, HOLD_HIGH: 1.8, HOLD_SPEED: 3.4,
  REACH_MIN: 0.3, REACH_MAX: 2.05, // how far above their feet a bean's hands can be
  ARM_GIVE: 0.15,              // ...and how far the couch can force them up or down from where they hold it
  ARM_SLACK: 0.12,             // sideways give in the arms before the couch drags you
  PULL_V: 6,                   // cap on the speed one step of couch-drag can add
  ANCHOR: 0.75,                // share of a sideways yank that a bean in the air takes for one on the ground
  TOW_SLOW: 0.4,               // your speed while dragging a partner who is just standing there
  TOW_GRIP: 0.3,               // how much of their footing a towed bean keeps

  STUN: 0.8, BONK_V: 6.5, BONK_UP: 6, SAFE: 1.0,
  GRACE: 0.06,                 // a hazard low enough to hop only counts once it is this deep into a bean
};

export const NET = {
  PREFIX: 'pivoooot-v1-',      // PeerJS id = PREFIX + room code
  RATE: 60,                    // state messages per second
  EASE: 18,                    // how fast (per second) a remote bean closes on where it is reported to be
  MAX_LEAD: 0.2,               // never run a report further ahead than this many seconds
  SNAP: 3,                     // beyond this error it teleports
  PEER_JS: 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
};

export const COLORS = {
  beans: [0x1fb8a6, 0xff5c8a],
  beanDark: [0x12776c, 0xb93560],
  couch: 0xfff0cf, couchShade: 0xf2d6a2, couchLeg: 0x5a3220,
};

export const SHOUTS = ['PIVOT!', 'PIVOT!!', 'PIVOOOT!', 'PIVOOOOOT!!', 'PIVOOOOOOOOOT!!!'];
export const SHUT_UP = ['SHUT UP!', 'SHUT UP! SHUT UP!', 'SHUT UP! SHUT UP! SHUT UUUP!'];
export const SHOUT_COMBO = 2.5;  // seconds between shouts to keep escalating
