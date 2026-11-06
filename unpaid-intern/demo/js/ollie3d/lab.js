// The lab page: one 3D Ollie at 600 px and smaller, a button per state, green/black, reduced motion and a three-quarter turn.
// window.__lab is a hook so a screenshot script can freeze Ollie at an exact moment of a move.
import { mount, forceReduced } from './stage.js';
import { STATES, DURATION } from './poses.js';
import { OUTFITS, PROPS } from './wardrobe.js';

const $q = (s, r = document) => r.querySelector(s);
const els = [...document.querySelectorAll('.ollie')];
let entries = els.map(el => mount(el));
const bar = $q('.lab-states');
const BASES = ['idle', 'sleep', 'thinking', 'walk', 'shy', 'typing', 'present', 'search', 'checklist', 'gavel', 'read', 'hold'];

function go(state) {
  entries.forEach(e => { if (!e) return; e.free(); if (BASES.includes(state)) e.setBase(state); else e.play(state); });
}
STATES.forEach(s => {
  const b = document.createElement('button');
  b.textContent = s + (DURATION[s] ? ' (once)' : '');
  b.addEventListener('click', () => go(s));
  bar.appendChild(b);
});
const toggle = (cls, fn) => {
  const b = $q(cls);
  b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); fn(on); });
};
toggle('.lab-black', on => {
  entries.forEach(e => e && e.dispose());
  els.forEach(el => { el.querySelectorAll('.o3d').forEach(n => n.remove()); el.dataset.variant = on ? 'black' : 'green'; });
  entries = [];
  setTimeout(() => { entries = els.map(el => mount(el, { outfit: outfitSel.value, prop: propSel.value })); }, 1500);   // give the browser time to free the old WebGL contexts
});
// outfit and prop pickers: every combination with every move
const pick = (cls, list) => { const sel = $q(cls); list.forEach(n => { const o = document.createElement('option'); o.value = o.textContent = n; sel.appendChild(o); }); sel.addEventListener('change', wear); return sel; };
const outfitSel = pick('.lab-outfit', OUTFITS), propSel = pick('.lab-prop', PROPS);
function wear() { entries.forEach(e => e && e.setWardrobe(outfitSel.value, propSel.value)); }
toggle('.lab-reduced', on => forceReduced(on));
toggle('.lab-turn', on => entries.forEach(e => e && e.turn(on ? -0.62 : 0)));

// a frame counter, to check the loop holds about 60 fps
const out = $q('.lab-fps');
let n = 0, t0 = performance.now();
(function count(now) { n++; if (now - t0 > 1000) { out.textContent = Math.round(n * 1000 / (now - t0)) + ' fps'; n = 0; t0 = now; } requestAnimationFrame(count); })(t0);

window.__lab = { entries: () => entries, go, big: () => entries[0], wear: (o, p) => { outfitSel.value = o; propSel.value = p; wear(); } };
