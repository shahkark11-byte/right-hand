// Ollie's controller. With 3D (js/ollie3d/) every Ollie is a real 3D character and this file only maps the app's calls onto the stage.
// The rest of the file is the PNG fallback. Poses are flat images there, so life comes from motion:
// breathing, swaying, eyelids drawn over the eyes, squash-and-stretch and particles.
// Layers per Ollie: .o-rig (sway) > .o-breath > .o-act (one-shot moves) > .ollie-art + .lids, plus .fx.
// Timers live in one place (later / clearTimers) and are cleared when a rig changes state or leaves the DOM.

import { POSE_TO_STATE } from './ollie3d/poses.js';

// 3D first: the stage draws Ollie as a real 3D character. If WebGL or three.js is missing (or the page has ?no3d) S3 stays null
// and every Ollie takes the PNG path below, exactly as before.
let S3 = null;
try { const m = await import('./ollie3d/stage.js'); if (m.supported) S3 = m; } catch { S3 = null; }
const BASE3 = new Set(['sleep', 'shy', 'thinking']);
const SHOTS3 = new Set(['wake', 'happy', 'money', 'learned', 'talk', 'hop', 'wave']);

const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';
// Motion lengths come from the design tokens (--t-micro, --t-large), so the CSS and this file never drift apart.
const token = (name, fallback) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || fallback;
const POSE_RE = /\bp([1-8])\b/;
const LID_PAD = 0.8;            // lids are a little bigger than the eye box (percent of the image, each side)
// eyes.json measured pose 4 badly (narrow left eye, lid colours picked up the blush). Fix here, not in the data.
const LID_FIX = {}; // pose 4 eyes now corrected in eyes.json (re-cut 6 Nov)
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];

const rigs = new WeakMap();
const live = new Set();
let EYES = null;
fetch(new URL('../assets/poses/eyes.json', import.meta.url))
  .then(r => r.json())
  .then(j => { EYES = j; live.forEach(buildLids); })
  .catch(() => { EYES = {}; });

/* ---------- timers ---------- */
function later(r, ms, fn) {
  const t = setTimeout(() => { r.timers.delete(t); if (!r.dead) fn(); }, ms);
  r.timers.add(t);
  return t;
}
// Resolves true after ms, or false if the rig changed state first.
function wait(r, ms) {
  return new Promise(res => {
    const w = { res };
    r.waiters.add(w);
    later(r, ms, () => { r.waiters.delete(w); res(true); });
  });
}
function clearTimers(r) {
  r.timers.forEach(clearTimeout); r.timers.clear();
  r.waiters.forEach(w => w.res(false)); r.waiters.clear();
}
function cancelAnims(r) { r.anims.forEach(a => a.cancel()); r.anims.clear(); }
function kill(r) { r.dead = true; clearTimers(r); cancelAnims(r); live.delete(r); }

// One-shot move on the .o-act layer. Returns a promise that resolves when it ends or is cancelled.
function act(r, frames, opts) {
  if (reduced()) return Promise.resolve();
  const a = r.act.animate(frames, { fill: 'none', ...opts });
  r.anims.add(a);
  return a.finished.then(() => r.anims.delete(a), () => r.anims.delete(a));
}

/* ---------- build ---------- */
function initOne(el) {
  if (rigs.has(el)) return rigs.get(el);
  const m = POSE_RE.exec(el.className);
  el.textContent = '';
  const stage = S3 && S3.mount(el);
  if (stage) {
    const r = { el, pose: m ? +m[1] : 7, stage, dead: false };
    rigs.set(el, r);
    pose3(r, r.pose);
    const ds = el.dataset.state;
    if (ds && ds !== 'idle') stage.setBase(ds);
    return r;
  }
  el.innerHTML = '<span class="o-rig"><span class="o-breath"><span class="o-act"><span class="ollie-art"></span><span class="lids"></span></span></span></span><span class="fx"></span>';
  const r = {
    el, pose: m ? +m[1] : 7, base: 'idle', tok: 0, dead: false, playing: false,
    timers: new Set(), waiters: new Set(), anims: new Set(), lean: 0,
    act: el.querySelector('.o-act'), lids: el.querySelector('.lids'), fx: el.querySelector('.fx'),
  };
  rigs.set(el, r); live.add(r);
  buildLids(r);
  enter(r, el.dataset.state || 'idle');
  return r;
}

// Pose pictures become expressions: sleep, shy and thinking are base loops; the others are held on top of the idle loop.
function pose3(r, n) {
  r.pose = n;
  const s = POSE_TO_STATE[n] || 'idle';
  if (BASE3.has(s)) r.stage.setBase(s, null); else r.stage.setBase('idle', s === 'idle' ? null : s);
}
function later3(r, fn, ms) { setTimeout(() => { if (!r.dead) fn(); }, ms); }

export function initOllies(root = document) {
  const list = root.matches && root.matches('.ollie') ? [root] : [];
  root.querySelectorAll && list.push(...root.querySelectorAll('.ollie'));
  list.forEach(initOne);
}

function buildLids(r) {
  r.lids.textContent = '';
  const eyes = EYES && (LID_FIX['p' + r.pose] || EYES['p' + r.pose]);
  if (!eyes) return;
  for (const e of eyes) {
    const d = document.createElement('i');
    d.className = 'lid';
    d.style.cssText = `left:${e.x - LID_PAD}%;top:${e.y - LID_PAD}%;width:${e.w + LID_PAD * 2}%;height:${e.h + LID_PAD * 2}%;background:${e.lid}`;
    r.lids.appendChild(d);
  }
}
function swapPose(r, n) {
  r.el.classList.remove('p' + r.pose);
  r.pose = n;
  r.el.classList.add('p' + n);
  buildLids(r);
}

/* ---------- blinking and looking ---------- */
export function blinkNow(el, double = false) {
  const r = rigs.get(el); if (!r) return;
  blink(r, double);
}
function blink(r, double) {
  if (r.stage) { r.stage.blink(); if (double) later3(r, () => r.stage.blink(), 230); return; }
  const lids = r.lids.children; if (!lids.length) return;
  const frames = [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)', offset: .45 }, { transform: 'scaleY(0)' }];
  for (const l of lids) {
    l.animate(frames, { duration: 150, easing: 'ease-in-out' });
    if (double) l.animate(frames, { duration: 150, delay: 230, easing: 'ease-in-out' });
  }
}
function scheduleBlink(r) {
  if (r.base === 'sleep') return;
  const [lo, hi] = r.base === 'shy' ? [6000, 10000] : [2500, 5500];
  later(r, rand(lo, hi), () => {
    if (r.el.offsetParent) blink(r, Math.random() < .25);
    scheduleBlink(r);
  });
}
function scheduleLook(r) {
  if (r.base !== 'idle') return;
  later(r, rand(8000, 14000), () => {
    if (r.el.offsetParent && !r.playing) {
      const s = Math.random() < .5 ? 1 : -1;
      act(r, [
        { transform: 'translateY(0) rotate(0)' },
        { transform: `translateY(-8px) rotate(${4 * s}deg)`, offset: .35 },
        { transform: `translateY(0) rotate(${4 * s}deg)`, offset: .6 },
        { transform: 'translateY(0) rotate(0)' },
      ], { duration: 700, easing: 'ease-in-out' });
    }
    scheduleLook(r);
  });
}

/* ---------- particles ---------- */
function put(r, html, cls, ms) {
  const t = document.createElement('div');
  t.innerHTML = html;
  const n = t.firstElementChild;
  n.classList.add(cls);
  r.fx.appendChild(n);
  if (ms) later(r, ms, () => n.remove());
  return n;
}
function clearFx(r, transientOnly) {
  r.fx.querySelectorAll(transientOnly ? '.fx-t' : '*').forEach(n => n.remove());
}
function persistentFx(r) {
  if (reduced()) return;
  if (r.base === 'sleep') ['Z', 'z', 'z'].forEach(c => put(r, `<i class="z">${c}</i>`, 'fx-p'));
  if (r.base === 'thinking') {
    put(r, '<i class="glow"></i>', 'fx-p');
    for (let i = 0; i < 3; i++) put(r, '<i class="dot"></i>', 'fx-p');
  }
}
const STAR = c => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0c.8 5.2 4.8 9.2 10 10-5.2.8-9.2 4.8-10 10-.8-5.2-4.8-9.2-10-10C5.2 9.2 9.2 5.2 10 0z" fill="${c}"/></svg>`;
function sparkles(r, n = 5) {
  if (reduced()) return;
  const spots = [[8, 22], [82, 16], [90, 52], [4, 58], [70, 4], [26, 4]];
  const cols = ['#E8B93C', '#8FA84A', '#F5D36B', '#B9CF6A', '#E8B93C'];
  for (let i = 0; i < n; i++) {
    const s = put(r, `<span class="spark">${STAR(cols[i % cols.length])}</span>`, 'fx-t', 1700);
    s.style.left = spots[i][0] + '%'; s.style.top = spots[i][1] + '%';
    s.style.animationDelay = (i * 0.17).toFixed(2) + 's';
  }
}
function coins(r, n = 8) {
  if (reduced()) return;
  for (let i = 0; i < n; i++) {
    const ang = (-160 + (320 / (n - 1)) * i) * Math.PI / 180;      // fan upward and outward
    const dist = rand(34, 56), up = -rand(34, 58) - Math.abs(Math.sin(ang)) * 6;
    const c = put(r, '<span class="coin"><i>£</i></span>', 'fx-t', 1300);
    c.style.setProperty('--dx', (Math.sin(ang) * dist).toFixed(1) + 'cqw');
    c.style.setProperty('--up', up.toFixed(1) + 'cqw');
    c.style.setProperty('--fall', '30cqw');
    c.style.animationDelay = c.firstChild.style.animationDelay = (i * 0.03).toFixed(2) + 's';
  }
}

/* ---------- pose changes ---------- */
// Squash out, swap, then pop in with a spring overshoot.
export async function setPose(el, n) {
  const r = rigs.get(el) || initOne(el);
  n = +n;
  if (r.pose === n) return;
  if (r.stage) { pose3(r, n); return; }
  if (reduced()) { swapPose(r, n); return; }
  const tok = r.poseTok = (r.poseTok || 0) + 1;
  r.poseAnim && r.poseAnim.cancel();
  const out = r.act.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(1.08,.9)' }], { duration: token('--t-micro', 89), easing: 'ease-in', fill: 'forwards' });
  r.poseAnim = out;
  try { await out.finished; } catch { return; }
  if (r.dead || tok !== r.poseTok) return;
  swapPose(r, n);
  const pop = r.act.animate([
    { transform: 'scale(.94,1.08)' },
    { transform: 'scale(1.02,.98)', offset: .6 },
    { transform: 'scale(1,1)' },
  ], { duration: token('--t-large', 377), easing: SPRING });
  r.poseAnim = pop;
  out.cancel();
  try { await pop.finished; } catch { /* cancelled */ }
}

/* ---------- states ---------- */
const BASES = ['idle', 'sleep', 'thinking', 'walk', 'shy'];
function enter(r, base) {
  clearTimers(r);
  r.base = base;
  r.playing = false;
  for (const b of BASES) r.el.classList.remove('st-' + b);
  r.el.classList.add('st-' + base);
  clearFx(r);
  persistentFx(r);
  scheduleBlink(r);
  scheduleLook(r);
  if (base === 'shy' && !reduced()) {
    act(r, [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)', offset: .25 }, { transform: 'translateX(3px)', offset: .75 }, { transform: 'translateX(0)' }],
      { duration: 400, iterations: 3, easing: 'ease-in-out' });
  }
}

// Transient moves. When one ends the Ollie returns to `to` (a base state).
async function play(r, kind, to) {
  const tok = ++r.tok;
  clearTimers(r); cancelAnims(r); clearFx(r, true);
  r.playing = true;
  scheduleBlink(r);
  const done = ok => { if (ok && tok === r.tok && !r.dead) enter(r, to); };

  if (kind === 'wake') {
    if (r.base === 'sleep') { r.base = 'idle'; for (const b of BASES) r.el.classList.remove('st-' + b); r.el.classList.add('st-idle'); clearFx(r); }
    if (reduced()) { swapPose(r, 2); await wait(r, 200); return done(true); }
    later(r, 330, () => put(r, '<b class="bang">!</b>', 'fx-t', 800));
    later(r, 450, () => swapPose(r, 2));
    act(r, [
      { transform: 'translateY(0) scale(1,1)' },
      { transform: 'translateY(0) scale(1.1,.85)', offset: .17 },
      { transform: 'translateY(-26px) scale(.93,1.12)', offset: .5 },
      { transform: 'translateY(0) scale(.97,1.03)', offset: .73 },
      { transform: 'translateY(0) scale(1.1,.88)', offset: .83 },
      { transform: 'translateY(0) scale(1,1)' },
    ], { duration: 900, easing: 'ease-in-out' });
    return done(await wait(r, 900));
  }
  if (kind === 'happy') {
    act(r, [
      { transform: 'translateY(0) scale(1,1)' },
      { transform: 'translateY(0) scale(1.08,.9)', offset: .1 },
      { transform: 'translateY(-16px) scale(.95,1.06)', offset: .28 },
      { transform: 'translateY(0) scale(1.06,.94)', offset: .46 },
      { transform: 'translateY(-11px) scale(.96,1.05)', offset: .66 },
      { transform: 'translateY(0) scale(1.04,.96)', offset: .82 },
      { transform: 'translateY(0) scale(1,1)' },
    ], { duration: 950, easing: 'ease-out' });
    return done(await wait(r, 1500));
  }
  if (kind === 'money' || kind === 'learned') {
    sparkles(r);
    act(r, [
      { transform: 'translateY(0) scale(1,1)' },
      { transform: 'translateY(0) scale(1.08,.9)', offset: .15 },
      { transform: 'translateY(-20px) scale(.94,1.08)', offset: .4 },
      { transform: 'translateY(0) scale(1.07,.93)', offset: .7 },
      { transform: 'translateY(0) scale(1,1)' },
    ], { duration: 750, easing: 'ease-out' });
    if (kind === 'money') later(r, 150, () => coins(r));
    return done(await wait(r, 1600));
  }
  if (kind === 'hop') {
    act(r, [
      { transform: 'translateY(0) scale(1,1)' },
      { transform: 'translateY(0) scale(1.06,.92)', offset: .15 },
      { transform: 'translateY(-14px) scale(.96,1.06)', offset: .42 },
      { transform: 'translateY(0) scale(1.05,.95)', offset: .72 },
      { transform: 'translateY(0) scale(1,1)' },
    ], { duration: 520, easing: 'ease-out' });
    return done(await wait(r, 520));
  }
  if (kind === 'talk') {
    act(r, [{ transform: 'scale(1,1)' }, { transform: 'scale(1.06,1.06)', offset: .5 }, { transform: 'scale(1,1)' }],
      { duration: 180, iterations: 3, easing: 'ease-in-out' });
    return done(await wait(r, 540));
  }
  done(true);
}

const TRANSIENT = new Set(['wake', 'happy', 'money', 'learned', 'talk', 'hop']);
export function setState(el, state) {
  const r = rigs.get(el) || initOne(el);
  if (r.stage) {
    if (SHOTS3.has(state)) return r.stage.play(state, 'idle');
    r.stage.setBase(state);
    return Promise.resolve();
  }
  r.tok++;
  cancelAnims(r);
  if (TRANSIENT.has(state)) return play(r, state, 'idle');
  enter(r, BASES.includes(state) ? state : 'idle');
  return Promise.resolve();
}
// While read-aloud speaks, the avatar keeps a gentle bob.
export function setTalking(el, on) {
  el.classList.toggle('talking', !!on);
  const r = rigs.get(el);
  if (r && r.stage) r.stage.talking(on);
}

/* ---------- click / tap and mouse lean ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest && e.target.closest('.ollie.big, .ollie.med');
  const r = el && rigs.get(el);
  if (r && r.stage) {                                           // 3D: a little wobble, then a happy jump or a hop
    const st = r.stage;
    if (st.base === 'sleep' || st.shot || r.reacting) return;
    r.reacting = true; st.blink(); st.wobble();
    later3(r, () => { r.reacting = false; if (!reduced()) st.play(Math.random() < .5 ? 'happy' : 'hop', st.base); }, 420);
    return;
  }
  if (!r || r.base === 'sleep' || r.playing || r.reacting) return;
  r.reacting = true;
  const to = r.base;
  if (!reduced()) {
    blink(r, false);
    await act(r, [
      { transform: 'rotate(0)' }, { transform: 'rotate(-8deg)', offset: .2 }, { transform: 'rotate(7deg)', offset: .45 },
      { transform: 'rotate(-4deg)', offset: .7 }, { transform: 'rotate(0)' },
    ], { duration: 420, easing: 'ease-in-out' });
  } else blink(r, false);
  r.reacting = false;
  if (r.dead || reduced()) return;
  play(r, Math.random() < .5 ? 'happy' : 'hop', to);
});

const fine = matchMedia('(pointer: fine)');
let mx = null, leaning = false;
function leanFrame() {
  let moving = false;
  document.querySelectorAll('.ollie.big').forEach(el => {
    const r = rigs.get(el); if (!r || r.stage || !el.offsetParent) return;
    const b = el.getBoundingClientRect();
    const dx = Math.max(-1, Math.min(1, (mx - (b.left + b.width / 2)) / (innerWidth / 2)));
    const target = r.base === 'sleep' ? 0 : dx * 4;
    r.lean += (target - r.lean) * 0.12;
    if (Math.abs(target - r.lean) > 0.03) moving = true;
    el.style.transform = `rotate(${r.lean.toFixed(2)}deg)`;
  });
  if (moving) requestAnimationFrame(leanFrame); else leaning = false;
}
document.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !fine.matches || reduced()) return;
  mx = e.clientX;
  if (!leaning) { leaning = true; requestAnimationFrame(leanFrame); }
});

/* ---------- keep up with new elements ---------- */
new MutationObserver(recs => {
  for (const rec of recs) {
    rec.addedNodes.forEach(n => { if (n.nodeType === 1 && (n.matches('.ollie') || n.querySelector('.ollie'))) initOllies(n); });
    rec.removedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      const gone = n.matches('.ollie') ? [n] : [...n.querySelectorAll('.ollie')];
      gone.forEach(el => { const r = rigs.get(el); if (r && !el.isConnected) { if (r.stage) { r.dead = true; r.stage.dispose(); } else kill(r); } });
    });
  }
}).observe(document.documentElement, { childList: true, subtree: true });

initOllies();
