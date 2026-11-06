// Ollie's body language as pure numbers: poseAt(state, tMs, opts) returns every rig value for one moment.
// No three.js and no DOM in here, so it is unit-tested (tests/ollie3d.test.js) and the same moment always gives the same pose.
// Units: Ollie's body is 1.0 tall; angles in radians. Arm convention: rotZ is a swing in the picture plane, so the
// right arm (screen right) lifts outward with a positive value and the left arm lifts inward; rotX > 0 swings an arm forward, < 0 behind the back.
// Timings come from the design system: breath 3770 ms, sway 6100 ms (Fibonacci, see DESIGN_SYSTEM.md).

export const STATES = ['idle', 'sleep', 'wake', 'walk', 'thinking', 'happy', 'money', 'learned', 'talk', 'hop', 'shy', 'wave',
  'typing', 'idea', 'present', 'inspect', 'search', 'checklist', 'gavel', 'read', 'hold'];
export const DURATION = { wake: 900, happy: 1000, money: 1600, learned: 1200, talk: 540, hop: 520, wave: 1500, idea: 2400, inspect: 2600 };
export const POSE_TO_STATE = { 1: 'sleep', 2: 'wake', 3: 'happy', 4: 'shy', 5: 'thinking', 6: 'money', 7: 'idle', 8: 'learned' };

const TAU = Math.PI * 2;
const BREATH = 3770, SWAY = 6100, STEP = 500;
const REST = 0.96;                                  // arms hang down and out about 30 degrees
const sm = u => u * u * (3 - 2 * u);
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// Eased keyframes: [[ms, value], ...]. Every key is a soft stop; extra keys past 1 or under 1 give the overshoot.
function track(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, a] = keys[i - 1], [t1, b] = keys[i];
      return a + (b - a) * sm((t - t0) / (t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
}
// A value that switches at fixed times: [[ms, value], ...], the last key at or before t wins.
const step = (t, keys) => { let v = keys[0][1]; for (const [ms, x] of keys) if (t >= ms) v = x; return v; };
// A jump: a parabola of height h between a and b.
const arc = (t, a, b, h) => { if (t <= a || t >= b) return 0; const u = (t - a) / (b - a); return 4 * h * u * (1 - u); };

const neutral = () => ({
  root: { y: 0, rotZ: 0, rotY: 0, rotX: 0 }, body: { sx: 1, sy: 1, sz: 1 },
  armL: { rotZ: -REST, rotX: 0 }, armR: { rotZ: REST, rotX: 0 },
  legL: { rotX: 0, y: 0 }, legR: { rotX: 0, y: 0 },
  sprout: { rotZ: 0, droop: 0 },
  eyes: { open: 1, shape: 'sparkle', lookX: 0, lookY: 0 },
  mouth: 'w', blush: 0.8, brows: { show: false, raise: 0 }, fx: [], done: false,
});
// Volume-preserving squash and stretch.
function squash(p, sy) { p.body.sy = sy; p.body.sx = p.body.sz = 1 / Math.sqrt(sy); }
function raise(p, r) { p.armR.rotZ = r; p.armL.rotZ = -r; }

// Blinks: one every 2.5 to 6 s, deterministic from the blink index, sometimes a double. 144 ms to close, a hold, then open.
const lid = d => (d < 0 || d > 288 ? 1 : d < 110 ? 1 - sm(d / 110) : d < 150 ? 0 : sm((d - 150) / 138));
function blinkOpen(t, slow = 1) {
  const P = 4250 * slow, n0 = Math.floor(t / P);
  let open = 1;
  for (let n = Math.max(0, n0 - 1); n <= n0; n++) {
    const T = n * P + hash(n) * 1500 * slow + 600;
    open = Math.min(open, lid(t - T));
    if (hash(n + 777) < 0.25) open = Math.min(open, lid(t - T - 400));
  }
  return open;
}

// The resting loop: whole-body breath, sway, a swaying sprout, a slow glance around, blinks.
function idle(t, o = {}) {
  const p = neutral();
  const br = 0.5 - 0.5 * Math.cos(TAU * (t % (o.breath || BREATH)) / (o.breath || BREATH));
  squash(p, 1 + (o.amp || 0.03) * br);
  p.root.rotZ = (o.sway === undefined ? 0.04 : o.sway) * Math.sin(TAU * t / SWAY);
  p.sprout.rotZ = 0.12 * Math.sin(TAU * t / SWAY - 0.8) + 0.04 * Math.sin(TAU * t / BREATH);
  p.eyes.lookX = 0.25 * Math.sin(t / 2300); p.eyes.lookY = 0.05 * Math.sin(t / 1700);
  p.eyes.open = blinkOpen(t, o.slow);
  p.armL.rotZ -= 0.03 * br; p.armR.rotZ += 0.03 * br;
  return p;
}

const LOOPS = {
  idle: t => idle(t),
  sleep: t => {
    const p = idle(t, { breath: SWAY, amp: 0.045, sway: 0.01 });
    p.eyes = { open: 0, shape: 'closed', lookX: 0, lookY: 0 };
    p.sprout.droop = 0.7; p.sprout.rotZ *= 0.3; p.fx = ['z'];
    p.root.rotZ += 0.02; p.eyes.lookX = 0;
    return p;
  },
  walk: t => {
    const p = idle(t, { sway: 0 });
    const s = Math.sin(Math.PI * t / STEP);        // one full stride (both legs) every two steps
    p.legL.rotX = 0.5 * s; p.legR.rotX = -0.5 * s;
    p.legL.y = 0.03 * Math.max(0, s); p.legR.y = 0.03 * Math.max(0, -s);
    p.root.y = 0.025 * Math.abs(s);
    p.root.rotZ = 0.06 * s;
    p.armL.rotX = 0.5 * s; p.armR.rotX = -0.5 * s;
    p.sprout.rotZ = 0.14 * Math.sin(Math.PI * t / STEP - 0.6);
    return p;
  },
  thinking: t => {
    const p = idle(t, { sway: 0.01, slow: 1.3 });
    p.root.rotZ = -0.07 + 0.015 * Math.sin(TAU * t / BREATH);
    p.armL.rotZ = 1.15 + 0.03 * Math.sin(TAU * t / BREATH); p.armL.rotX = 1.35;
    p.brows = { show: true, raise: 0.8 };
    p.eyes.lookX = 0.55; p.eyes.lookY = 0.6;
    p.mouth = 'w';
    return p;
  },
  shy: t => {
    const p = idle(t, { sway: 0.02, slow: 1.8 });
    p.blush = 1;
    p.eyes.lookX = -0.25; p.eyes.lookY = -0.7;
    p.mouth = 'worry';
    p.armL.rotX = p.armR.rotX = -0.9; p.armL.rotZ = -0.15; p.armR.rotZ = 0.15;
    const f = Math.sin(TAU * t / 1200);
    p.legR.rotX = 0.15 + 0.35 * f; p.legR.y = 0.025 * Math.max(0, f);
    p.root.rotY = 0.22; p.root.rotZ += 0.03;
    squash(p, p.body.sy * 0.97);
    return p;
  },
};

const ONE_SHOT = {
  wake: t => {
    const p = idle(t);
    squash(p, track(t, [[0, 1], [150, 0.88], [330, 1.16], [450, 1], [560, 0.92], [700, 1.04], [900, 1]]));
    p.root.y = arc(t, 200, 520, 0.16);
    p.eyes = { open: t < 140 ? 0 : 1, shape: t < 140 ? 'closed' : t < 460 ? 'wide' : 'sparkle', lookX: 0, lookY: 0 };
    p.mouth = t >= 140 && t < 560 ? 'o' : 'w';
    p.sprout.droop = track(t, [[0, 0.7], [330, -0.1], [600, 0]]);
    raise(p, track(t, [[0, REST], [250, 2.2], [560, 2.2], [800, REST]]));
    p.legL.rotX = p.legR.rotX = p.root.y > 0 ? -0.25 : 0;
    return p;
  },
  happy: t => {
    const p = neutral();
    squash(p, track(t, [[0, 1], [130, 0.86], [210, 1.16], [420, 1.08], [600, 1], [650, 0.84], [780, 1.05], [900, 0.99], [1000, 1]]));
    p.root.y = arc(t, 200, 620, 0.22);
    p.eyes.shape = t >= 80 ? 'happy' : 'sparkle';
    p.mouth = t >= 80 ? 'open' : 'w';
    raise(p, track(t, [[0, REST], [200, 2.4], [620, 2.4], [850, REST]]));
    p.legL.rotX = p.legR.rotX = p.root.y > 0 ? -0.3 : 0;
    p.sprout.rotZ = 0.15 * Math.sin(t / 70) * (1 - t / 1000);
    p.blush = 0.95;
    return p;
  },
  money: t => {
    const p = neutral();
    squash(p, track(t, [[0, 1], [120, 0.88], [200, 1.15], [500, 1.05], [780, 0.86], [900, 1.1], [1000, 1.05], [1150, 0.92], [1300, 1.03], [1600, 1]]));
    p.root.y = arc(t, 150, 750, 0.2) + arc(t, 800, 1150, 0.08);
    p.eyes.shape = t >= 60 && t < 1400 ? 'happy' : 'sparkle';
    p.mouth = t >= 60 && t < 1400 ? 'open' : 'w';
    raise(p, track(t, [[0, REST], [200, 2.6], [1300, 2.6], [1550, REST]]));
    p.fx = t >= 100 && t < 1500 ? ['coins'] : [];
    p.legL.rotX = p.legR.rotX = p.root.y > 0 ? -0.3 : 0;
    p.sprout.rotZ = 0.12 * Math.sin(t / 80);
    return p;
  },
  learned: t => {
    const p = neutral();
    squash(p, track(t, [[0, 1], [160, 0.93], [300, 1.04], [520, 0.93], [700, 1.04], [900, 1], [1200, 1]]));
    p.root.y = arc(t, 420, 800, 0.05);
    p.eyes.lookY = track(t, [[0, 0], [250, -0.5], [450, -0.5], [700, 0.3], [1000, 0]]);
    p.mouth = t >= 100 ? 'smile' : 'w';
    raise(p, track(t, [[0, REST], [450, 1.1], [900, 1.1], [1150, REST]]));
    p.sprout.rotZ = 0.1 * Math.sin(t / 110) * (1 - t / 1200);
    p.fx = t < 1100 ? ['sparkle'] : [];
    return p;
  },
  talk: t => {
    const p = neutral();
    const bob = Math.abs(Math.sin(Math.PI * t / 180));
    squash(p, 1 + 0.03 * bob);
    p.root.y = 0.02 * bob;
    p.mouth = bob > 0.5 ? 'open' : 'w';
    p.sprout.rotZ = 0.08 * Math.sin(TAU * t / 180);
    return p;
  },
  hop: t => {
    const p = neutral();
    squash(p, track(t, [[0, 1], [80, 0.9], [140, 1.1], [330, 1.03], [380, 0.9], [470, 1.02], [520, 1]]));
    p.root.y = arc(t, 100, 380, 0.14);
    p.legL.rotX = p.legR.rotX = p.root.y > 0 ? -0.25 : 0;
    p.sprout.rotZ = 0.1 * Math.sin(t / 60);
    return p;
  },
  wave: t => {
    const p = idle(t);
    p.armR.rotZ = t < 250 ? track(t, [[0, REST], [250, 2.5]]) : t < 1250 ? 2.5 + 0.35 * Math.sin(TAU * (t - 250) / 300) : track(t, [[1250, 2.5], [1500, REST]]);
    p.armR.rotX = 0.2;
    p.root.rotZ = -0.05 * sm(Math.min(1, t / 250)) * (t > 1250 ? 1 - (t - 1250) / 250 : 1);
    p.mouth = 'smile';
    return p;
  },
};

// ---- Wardrobe moves: loops and one-shots for the pitch deck. Props are not known here (except opts.prop for 'hold'). ----
const sinT = (t, ms, ph = 0) => Math.sin(TAU * t / ms + ph);
const clamp01 = u => Math.max(0, Math.min(1, u));
const lerp = (a, b, u) => a + (b - a) * u;
Object.assign(LOOPS, {
  // both hands forward on the keys, taking turns, eyes down at the screen
  typing: t => {
    const p = idle(t, { sway: 0, slow: 2.2 }), k = sinT(t, 300);
    p.armL.rotX = 1.1 + 0.3 * k; p.armR.rotX = 1.1 - 0.3 * k; p.armL.rotZ = 0.3; p.armR.rotZ = -0.3;
    p.eyes.lookY = -0.8; p.eyes.lookX = 0.1 * sinT(t, 2000);
    p.root.rotX = 0.04 + 0.025 * sinT(t, 900);
    return p;
  },
  // right arm out to the side, pointing at the slide
  present: t => {
    const p = idle(t, { sway: 0 });
    p.armR.rotZ = 1.25 + 0.08 * sinT(t, 2400); p.armR.rotX = 0.15; p.armL.rotZ -= 0.1;
    p.root.rotZ = 0.03 * sinT(t, 3000); p.root.rotY = 0.12; p.eyes.lookX = 0.5; p.mouth = 'smile';
    return p;
  },
  // magnifier held out; the whole body looks slowly left and right and the eyes follow
  search: t => {
    const p = idle(t, { sway: 0 }), s2 = sinT(t, 3600);
    p.root.rotY = 0.45 * s2; p.root.rotX = 0.05; p.eyes.lookX = 0.7 * s2; p.eyes.lookY = -0.1;
    p.armR.rotX = 1.3; p.armR.rotZ = 0.45; p.brows = { show: true, raise: 0.4 };
    return p;
  },
  // clipboard in the left hand, the right hand ticks, a nod on each tick
  checklist: t => {
    const p = idle(t, { sway: 0 }), k = sinT(t, 500);
    p.armL.rotX = 1.25; p.armL.rotZ = 0.3; p.armR.rotX = 1.1; p.armR.rotZ = -0.2 + 0.25 * k;
    p.root.rotX = 0.07 * (0.5 + 0.5 * sinT(t, 500, -0.6)); p.eyes.lookY = -0.4;
    return p;
  },
  // the right arm raises and strikes down about every 800 ms, with a little squash on each strike
  gavel: t => {
    const p = idle(t, { sway: 0 }), u = t % 800;
    p.armR.rotZ = track(u, [[0, 1.2], [360, 2.5], [470, 2.55], [560, 0.9], [640, 0.95], [800, 1.2]]);
    p.armR.rotX = 0.1;
    squash(p, track(u, [[0, 1], [500, 1.02], [560, 0.93], [660, 1], [800, 1]]));
    p.brows = { show: true, raise: 0.2 }; p.mouth = 'o'; p.eyes.lookX = 0.2;
    return p;
  },
  // a book in both hands in front, eyes down, a slow page-turn nod
  read: t => {
    const p = idle(t, { sway: 0, slow: 2 });
    p.armL.rotX = p.armR.rotX = 1.2; p.armL.rotZ = 0.45; p.armR.rotZ = -0.45;
    p.eyes.lookY = -0.8; p.eyes.lookX = 0.3 * sinT(t, 1400);
    p.root.rotX = 0.05 + 0.04 * Math.max(0, sinT(t, 3000));
    return p;
  },
  // something held up high, proudly; both hands in front when the prop needs two (opts.prop)
  hold: (t, o = {}) => {
    const p = idle(t, { sway: 0.02 });
    if (o.prop === 'certificate' || o.prop === 'book') { p.armL.rotX = p.armR.rotX = 1.3; p.armL.rotZ = 0.35; p.armR.rotZ = -0.35; }
    else { p.armR.rotZ = 2.6 + 0.05 * sinT(t, 1800); p.armR.rotX = 0.1; }
    p.mouth = 'smile'; p.root.rotX = -0.03;
    return p;
  },
});
Object.assign(ONE_SHOT, {
  // think first, then the bulb lights and a finger goes up
  idea: t => {
    const p = idle(t, { sway: 0.01 });
    p.armL.rotX = track(t, [[0, 0], [250, 1.35], [1200, 1.35], [1500, 0]]);
    p.armL.rotZ = track(t, [[0, -REST], [250, 1.15], [1200, 1.15], [1500, -REST]]);
    p.brows = { show: t < 1750, raise: t < 1250 ? 0.8 : 1 };
    p.eyes.lookX = t < 1250 ? 0.55 : 0; p.eyes.lookY = t < 1250 ? 0.6 : 0.9;
    p.eyes.shape = t >= 1800 ? 'happy' : 'sparkle';
    p.mouth = t < 1250 ? 'w' : t < 1800 ? 'o' : 'smile';
    squash(p, track(t, [[0, 1], [1250, 1], [1350, 1.08], [1500, 1], [2400, 1]]));
    p.root.y = arc(t, 1300, 1650, 0.05);
    p.armR.rotZ = track(t, [[0, REST], [1250, REST], [1650, 2.7], [2200, 2.7], [2400, REST]]);
    p.fx = t >= 1400 ? ['bulb'] : [];
    return p;
  },
  // the magnifier goes up to the right eye, he leans in, then shakes his head: no
  inspect: t => {
    const p = idle(t, { sway: 0 }), up = track(t, [[0, 0], [500, 1], [2300, 1], [2600, 0]]);
    p.armR.rotX = lerp(0, 2.1, up); p.armR.rotZ = lerp(REST, 0.15, up);
    p.root.rotX = 0.14 * track(t, [[0, 0], [700, 1], [1500, 1], [1900, 0.3], [2600, 0]]);
    p.eyes.lookX = 0.5 * up; p.eyes.lookY = 0.1 * up;
    const no = t >= 1500;
    p.root.rotY = no ? 0.35 * sinT(t - 1600, 500) * track(t, [[1500, 0], [1650, 1], [2400, 1], [2600, 0]]) : 0;
    p.mouth = no ? 'worry' : 'w'; p.brows = { show: no, raise: 0.5 };
    return p;
  },
});

// The expression a state is known by. Used by reduced motion (frozen) and by "hold" (a picture pose that keeps breathing).
const KEY = {
  idle: p => p,
  sleep: p => { p.eyes = { open: 0, shape: 'closed', lookX: 0, lookY: 0 }; p.sprout.droop = 0.7; return p; },
  wake: p => { p.eyes.shape = 'wide'; p.mouth = 'o'; raise(p, 1.4); return p; },
  walk: p => p,
  thinking: p => { p.armL.rotZ = 1.15; p.armL.rotX = 1.35; p.brows = { show: true, raise: 0.8 }; p.eyes.lookX = 0.55; p.eyes.lookY = 0.6; p.root.rotZ = -0.07; return p; },
  happy: p => { p.eyes.shape = 'happy'; p.mouth = 'open'; p.armR.rotZ = 2.4; p.blush = 0.95; return p; },
  money: p => { p.eyes.shape = 'happy'; p.mouth = 'open'; raise(p, 2.6); return p; },
  learned: p => { p.mouth = 'smile'; raise(p, 1.0); return p; },
  talk: p => { p.mouth = 'open'; return p; },
  hop: p => p,
  shy: p => { p.blush = 1; p.eyes.lookX = -0.25; p.eyes.lookY = -0.7; p.mouth = 'worry'; p.armL.rotX = p.armR.rotX = -0.9; p.armL.rotZ = -0.15; p.armR.rotZ = 0.15; p.root.rotY = 0.22; return p; },
  wave: p => { p.armR.rotZ = 2.4; p.mouth = 'smile'; return p; },
  typing: p => { p.armL.rotX = p.armR.rotX = 1.1; p.armL.rotZ = 0.3; p.armR.rotZ = -0.3; p.eyes.lookY = -0.8; return p; },
  present: p => { p.armR.rotZ = 1.25; p.armR.rotX = 0.15; p.eyes.lookX = 0.5; p.mouth = 'smile'; p.root.rotY = 0.12; return p; },
  search: p => { p.armR.rotX = 1.3; p.armR.rotZ = 0.45; p.brows = { show: true, raise: 0.4 }; return p; },
  checklist: p => { p.armL.rotX = 1.25; p.armL.rotZ = 0.3; p.armR.rotX = 1.1; p.armR.rotZ = -0.2; p.eyes.lookY = -0.4; return p; },
  gavel: p => { p.armR.rotZ = 2.2; p.mouth = 'o'; return p; },
  read: p => { p.armL.rotX = p.armR.rotX = 1.2; p.armL.rotZ = 0.45; p.armR.rotZ = -0.45; p.eyes.lookY = -0.8; return p; },
  hold: (p, o = {}) => { if (o.prop === 'certificate' || o.prop === 'book') { p.armL.rotX = p.armR.rotX = 1.3; p.armL.rotZ = 0.35; p.armR.rotZ = -0.35; } else p.armR.rotZ = 2.6; p.mouth = 'smile'; return p; },
  idea: p => { p.armR.rotZ = 2.7; p.eyes.shape = 'happy'; p.mouth = 'smile'; return p; },
  inspect: p => { p.armR.rotX = 2.1; p.armR.rotZ = 0.15; p.eyes.lookX = 0.5; return p; },
};

// opts.reduced: the key expression, frozen. opts.hold: a one-shot state's expression kept on while the body keeps its idle loop.
// opts.variant is accepted for callers that pass it and does not change the motion.
export function poseAt(state, tMs, opts = {}) {
  const key = KEY[state] ? state : 'idle';
  if (opts.reduced) return KEY[key](neutral(), opts);
  const t = Math.max(0, tMs);
  if (ONE_SHOT[key]) {
    if (opts.hold) {
      const p = KEY[key](idle(t), opts);
      if (p.eyes.shape !== 'sparkle') p.eyes.open = 1;
      return p;
    }
    if (t >= DURATION[key]) { const p = idle(0); p.done = true; return p; }
    return ONE_SHOT[key](t);
  }
  return LOOPS[key](t, opts);
}
