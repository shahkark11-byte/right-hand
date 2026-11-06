// The stage: renderers, camera, lights and the one shared animation loop for every 3D Ollie in the app.
// mount(el) puts a 3D Ollie in an element. At most CAP of them are live (own canvas and renderer, animated); the rest, and every
// small one (.sm, chat avatars), show a snapshot of the same 3D model rendered once to an image and cached.
// Off-screen Ollies and hidden tabs do not render. If WebGL is missing, mount() returns null and the caller keeps its PNG path.
import * as THREE from '../../vendor/three.module.min.js';
import { buildOllie, applyPose, makeEnvScene } from './model.js';
import { poseAt, DURATION } from './poses.js';

const CAP = 4;
const EXTENT_X = 1.24, EXTENT_Y = 1.2;          // the canvas is bigger than the Ollie's box, so jumps and sparkles have room
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let forced = null;                                // the lab page can force reduced motion on or off
const reduced = () => (forced === null ? matchMedia('(prefers-reduced-motion: reduce)').matches : forced);
const fine = matchMedia('(pointer: fine)');

export const supported = (() => {
  try {
    if (new URLSearchParams(location.search).has('no3d')) return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
})();

/* ---------- scene pieces ---------- */
function makeCamera() {
  const cam = new THREE.PerspectiveCamera(20, EXTENT_X / EXTENT_Y, 0.5, 20);
  cam.position.set(0, 1.25, 4.9); cam.lookAt(0, 0.8, 0);
  return cam;
}
function makeScene(rig) {
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight('#ffffff', '#d4dcbc', 1.6));
  const key = new THREE.DirectionalLight('#fff3e2', 1.8); key.position.set(-2.5, 4, 4.5);
  const fill = new THREE.DirectionalLight('#e6efff', 1.3); fill.position.set(3.5, 1.2, 3);
  const rim = new THREE.DirectionalLight('#ffffff', 1.1); rim.position.set(0.5, 3, -4);
  sc.add(key, fill, rim, rig.root);
  return sc;
}
function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  r.setClearColor(0x000000, 0);
  r.toneMapping = THREE.NeutralToneMapping;
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  return r;
}

// The eyes reflect a tiny studio: built from bright panels and baked once per renderer by PMREMGenerator.
function makeEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(makeEnvScene(), 0.035);
  pm.dispose();
  return rt;
}

/* ---------- snapshots ---------- */
const cache = new Map();
let snapGl = null;
const snapRigs = new Map();
export function snapshot(variant, state, size, outfit = 'none', prop = 'none') {
  const key = `${variant}|${state}|${size}|${outfit}|${prop}`;
  if (cache.has(key)) return cache.get(key);
  if (!snapGl) { const canvas = document.createElement('canvas'); const r = makeRenderer(canvas); snapGl = { canvas, r, cam: makeCamera(), env: makeEnv(r) }; }
  const rk = `${variant}|${outfit}|${prop}`;
  if (!snapRigs.has(rk)) { const rig = buildOllie(variant, { outfit, prop }); rig.setEnv(snapGl.env.texture); snapRigs.set(rk, { rig, scene: makeScene(rig) }); }
  const { rig, scene } = snapRigs.get(rk);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  snapGl.r.setPixelRatio(1);
  snapGl.r.setSize(Math.round(size * EXTENT_X * dpr), Math.round(size * EXTENT_Y * dpr), false);
  applyPose(rig, poseAt(state, 0, { reduced: true, prop }), 0);
  snapGl.r.render(scene, snapGl.cam);
  const url = snapGl.canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/* ---------- the shared loop and the pointer ---------- */
const entries = new Set();
const pointer = { x: 0, y: 0, on: false };
let raf = 0;
function tick(now) {
  raf = 0;
  let any = false;
  for (const e of entries) if (e.running()) { any = true; e.frame(now); }
  if (any) raf = requestAnimationFrame(tick);
}
const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
document.addEventListener('visibilitychange', kick);
document.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !fine.matches) return;
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.on = true;
});
document.addEventListener('pointerleave', () => { pointer.on = false; });

export function forceReduced(v) { forced = v; entries.forEach(e => e.refresh()); kick(); }

let balanceQueued = false;
function rebalance() {
  if (balanceQueued) return;
  balanceQueued = true;
  queueMicrotask(() => {
    balanceQueued = false;
    const cand = [...entries].filter(e => e.visible && !e.small() && e.el.isConnected).sort((a, b) => b.el.offsetWidth - a.el.offsetWidth);
    const winners = new Set(cand.slice(0, CAP));
    entries.forEach(e => { if (winners.has(e)) e.tryLive(); else e.goSnap(); });
    kick();
  });
}

/* ---------- one Ollie ---------- */
const BASE = new Set(['idle', 'sleep', 'thinking', 'walk', 'shy', 'typing', 'present', 'search', 'checklist', 'gavel', 'read', 'hold']);
class Entry {
  constructor(el, opts) {
    this.el = el; this.variant = opts.variant || el.dataset.variant || 'green';
    this.outfit = opts.outfit || el.dataset.outfit || 'none'; this.prop = opts.prop || el.dataset.prop || 'none';
    this.base = 'idle'; this.hold = null; this.t0 = performance.now(); this.shot = null;
    this.live = false; this.visible = false; this.talkOn = false; this.talkT0 = 0;
    this.lx = 0; this.ly = 0; this.blinkT = -1e9; this.wobT = -1e9; this.yaw = 0; this.scrubbed = null;
    this.size = 0;
    this.img = document.createElement('img'); this.img.className = 'o3d'; this.img.alt = ''; this.img.draggable = false;
    el.appendChild(this.img);
    this.io = new IntersectionObserver(r => { this.visible = r[r.length - 1].isIntersecting; rebalance(); });
    this.io.observe(el);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    entries.add(this);
    this.snap();
  }
  small() { return this.el.classList.contains('sm') || this.el.classList.contains('av'); }
  running() { return this.live && this.visible && !document.hidden && !reduced() && !this.scrubbed; }
  key() { return this.shot ? this.shot.state : this.base === 'idle' && this.hold ? this.hold : this.base; }

  /* display: a snapshot image, or a live canvas */
  snap() {
    const s = this.size = Math.max(34, Math.round((this.el.offsetWidth || 55) / 8) * 8);
    this.img.src = snapshot(this.variant, this.key(), s, this.outfit, this.prop);
  }
  goLive() {
    if (this.live) return;
    this.live = true;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'o3d';
    this.el.appendChild(this.canvas);
    this.gl = makeRenderer(this.canvas);
    this.cam = makeCamera();
    this.rig = buildOllie(this.variant, { outfit: this.outfit, prop: this.prop });
    this.env = makeEnv(this.gl); this.rig.setEnv(this.env.texture);
    this.scene = makeScene(this.rig);
    this.img.hidden = true;
    this.resize();
    this.draw(performance.now());
  }
  // If the browser refuses another WebGL context, this Ollie quietly stays a snapshot.
  tryLive() { try { this.goLive(); } catch { this.live = false; this.teardown(); this.canvas && this.canvas.remove(); this.canvas = this.gl = null; this.img.hidden = false; } }
  goSnap() {
    if (!this.live) return;
    this.live = false;
    this.teardown();
    this.img.hidden = false;
    this.snap();
  }
  teardown() {
    if (this.gl) { this.env && this.env.dispose(); this.env = null; this.rig.dispose(); this.gl.dispose(); this.canvas.remove(); this.gl = this.rig = this.canvas = this.scene = null; }
  }
  resize() {
    const s = this.el.offsetWidth; if (!s) return;
    if (this.live && this.gl) { this.gl.setSize(Math.round(s * EXTENT_X), Math.round(s * EXTENT_Y), false); this.draw(performance.now()); }
    else if (Math.abs(s - this.size) >= 8) this.snap();
  }

  /* state */
  setBase(state, hold) {
    this.interrupt();
    if (state !== undefined) this.base = BASE.has(state) ? state : 'idle';
    if (hold !== undefined) this.hold = hold;
    this.t0 = performance.now();
    this.refresh();
  }
  setHold(state) { this.hold = state; if (!this.shot) { this.t0 = performance.now(); this.refresh(); } }
  play(state, to) {
    this.interrupt();
    return new Promise(res => {
      const now = performance.now();
      this.shot = { state, t0: now, res, to };
      if (!this.live || reduced()) {
        this.refresh();
        this.shot.timer = setTimeout(() => this.finish(), reduced() ? 600 : DURATION[state] || 0);
      } else kick();
    });
  }
  interrupt() { if (this.shot) { clearTimeout(this.shot.timer); this.shot.res(false); this.shot = null; } }
  finish() {
    if (!this.shot) return;
    const s = this.shot; this.shot = null; clearTimeout(s.timer);
    if (s.to) this.base = s.to;                           // a one-shot hands over to the base state it was asked to return to
    this.t0 = performance.now();
    this.refresh();
    s.res(true);
  }
  refresh() { if (this.live) { this.draw(performance.now()); kick(); } else this.snap(); }
  talking(on) { this.talkOn = !!on; this.talkT0 = performance.now(); kick(); }
  blink() { this.blinkT = performance.now(); kick(); }
  wobble() { this.wobT = performance.now(); kick(); }
  // change what he wears and holds; a live Ollie gets a new rig on the same renderer
  setWardrobe(outfit = 'none', prop = 'none') {
    this.outfit = outfit; this.prop = prop;
    if (this.live && this.gl) {
      this.scene.remove(this.rig.root); this.rig.dispose();
      this.rig = buildOllie(this.variant, { outfit, prop }); this.rig.setEnv(this.env.texture); this.scene.add(this.rig.root);
      this.draw(performance.now()); kick();
    } else this.snap();
  }
  turn(yaw) { this.yaw = yaw; this.refresh(); }
  scrub(state, t, blinkAt) { this.scrubbed = { state, t, blinkAt }; this.draw(performance.now()); }
  free() { this.scrubbed = null; kick(); }

  /* drawing */
  poseNow(now) {
    if (this.scrubbed) return poseAt(this.scrubbed.state, this.scrubbed.t, { variant: this.variant, prop: this.prop });
    if (reduced()) return poseAt(this.key(), 0, { reduced: true });
    if (this.shot) {
      const p = poseAt(this.shot.state, now - this.shot.t0, { variant: this.variant, prop: this.prop });
      if (!p.done) return p;
      this.finish();
    }
    const t = now - this.t0;
    return this.base === 'idle' && this.hold ? poseAt(this.hold, t, { hold: true }) : poseAt(this.base, t, { variant: this.variant, prop: this.prop });
  }
  draw(now) {
    if (!this.live || !this.gl) return;
    const p = this.poseNow(now), calm = reduced() || this.scrubbed;
    if (!calm) {
      if (this.talkOn && !this.shot) {                       // a gentle bob while read-aloud speaks
        const tp = poseAt('talk', (now - this.talkT0) % DURATION.talk);
        p.mouth = tp.mouth; p.root.y += tp.root.y; p.body.sy *= tp.body.sy; p.body.sx = p.body.sz = 1 / Math.sqrt(p.body.sy);
      }
      const w = now - this.wobT;
      if (w >= 0 && w < 420) p.root.rotZ += 0.14 * Math.sin(w / 420 * Math.PI * 3) * (1 - w / 420);
      const d = now - this.blinkT;
      if (d >= 0 && d < 288 && p.eyes.shape === 'sparkle') p.eyes.open = Math.min(p.eyes.open, Math.abs(d - 144) / 144);
      // the eyes and a little of the body turn toward the mouse
      let tx = 0, ty = 0;
      if (pointer.on && this.base !== 'sleep' && this.el.isConnected) {
        const b = this.el.getBoundingClientRect();
        tx = clamp((pointer.x - (b.left + b.width / 2)) / 320, -1, 1); ty = clamp(-(pointer.y - (b.top + b.height * 0.55)) / 320, -1, 1);
      }
      this.lx += (tx - this.lx) * 0.12; this.ly += (ty - this.ly) * 0.12;
      p.eyes.lookX = clamp(p.eyes.lookX + this.lx, -1, 1); p.eyes.lookY = clamp(p.eyes.lookY + this.ly, -1, 1);
      p.root.rotY += this.lx * 0.16;
    }
    if (this.scrubbed && this.scrubbed.blinkAt !== undefined) p.eyes.open = this.scrubbed.blinkAt;
    p.root.rotY += this.yaw;
    const fxT = this.scrubbed ? this.scrubbed.t : now - (this.shot ? this.shot.t0 : this.t0);
    applyPose(this.rig, p, fxT);
    this.gl.render(this.scene, this.cam);
  }
  frame(now) { this.draw(now); }

  dispose() {
    this.interrupt();
    this.io.disconnect(); this.ro.disconnect();
    entries.delete(this);
    this.live = false; this.teardown();
    rebalance();
  }
}

export function mount(el, opts = {}) {
  if (!supported) return null;
  try { return new Entry(el, opts); } catch { return null; }
}
