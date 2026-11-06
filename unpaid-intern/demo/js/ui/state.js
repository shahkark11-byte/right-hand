// The one shared state object, its persistence (preferences and Ollie's memory) and small helpers every screen uses.
import * as M from '../mind.js';
import * as SS from '../sessions.js';

export const DEMO_TODAY = '2026-11-05';
export const CHECKED_ON = '5 Nov 2026';

export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const gbp = n => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const wait = ms => new Promise(r => setTimeout(r, ms));
export const longDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const ICONS = {
  fee: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16l-3-2-3 2-2-2-2 2-3-2-3 2z"/><path d="M8 9h8M8 13h5"/></svg>',
  chase: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  subs: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0113.7-5.6L20 8M20 4v4h-4M20 12a8 8 0 01-13.7 5.6L4 16M4 20v-4h4"/></svg>',
  law: '<svg viewBox="0 0 24 24"><path d="M12 3v18M6 21h12M5 7h14M5 7l-2 6a3 3 0 006 0zM19 7l-2 6a3 3 0 006 0z"/></svg>',
  tick: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/></svg>',
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.100 0-2-.5-2.500-1.500M12 6.500V8M12 16v1.500"/></svg>',
  speaker: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16.5 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/></svg>',
  cap: '<svg viewBox="0 0 24 24"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.500V16c0 1.500 2.700 3 6 3s6-1.500 6-3v-4.500M22 9v6"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.400-7-10a4 4 0 017-2.500A4 4 0 0119 10c0 5.600-7 10-7 10z"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16.500 4.500a2 2 0 013 3L8 19z"/></svg>',
};

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const plural = (n, one, many) => (n === 1 ? one : many);
export const dayWord = n => plural(n, '1 day', n + ' days');
export const things = n => plural(n, '1 thing', n + ' things');

/* ---------- state ---------- */
export const state = {
  roles: new Set(['business']),
  answers: {},
  data: {},            // key -> parsed rows
  results: null,
  ctx: null,           // the facts Talk and the jury work from (objections change this)
  off: new Set(),      // unticked lines: 'f|date|client' or 'c|invoice'
  ready: false,        // the first run has finished, so the tab bar shows
  draftCard: null,
  sctx: null,          // student facts for Talk
  quiz: null,          // { pack, i, score, picked }
  justPicked: new Set(),
  seen: new Set(),     // stories seen
  history: [],
  current: null,
  active: null,        // card being checked
  cards: null,         // this session's result cards
  prefs: { theme: 'light', size: 'normal', jury: 'live', speak: 'off' },
  liveOk: false,       // is the local model reachable (probed at start)
  usedRules: 0,        // things Ollie learned that changed the current session's results
  opinion: {},         // card id -> 'live' | 'recorded', once the jury has been asked
  brief: null,         // the morning brief shown at the top of the chat
  awayAt: 0,
  cheer: false,        // Ollie celebrates when the tree is next shown
  mem: M.createMemory(),   // Ollie's mind, kept on this device only
};
export const curSession = () => SS.getSession(SS.currentId());
export const studentChosen = () => state.roles.has('student');
export const bizChosen = () => state.roles.has('business') || !state.roles.has('student');

/* ---------- preferences ---------- */
const PREFS_KEY = 'ui-prefs';
try { Object.assign(state.prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch { /* ignore */ }
// v7: Live is the default. Older saved settings only held the old default, so move them across once.
if (!state.prefs.juryV7) { state.prefs.jury = 'live'; state.prefs.juryV7 = true; }
export const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch { /* ignore */ } };
// Live is used only when it is chosen, the local model answered the start-up probe and the phone is online.
export const liveOn = () => state.prefs.jury === 'live' && state.liveOk && navigator.onLine !== false;

/* ---------- Ollie's mind: kept on this device only ---------- */
export const MIND_KEY = 'ui_mind_v1';
try {
  const raw = localStorage.getItem(MIND_KEY);
  if (raw) { const m = JSON.parse(raw); if (m && m.facts && Array.isArray(m.rules)) state.mem = { history: [], ...m }; }
} catch { /* works in memory */ }
export const saveMind = () => { try { localStorage.setItem(MIND_KEY, JSON.stringify(state.mem)); } catch { /* works in memory */ } };
export const clearMind = () => { state.mem = M.createMemory(); try { localStorage.removeItem(MIND_KEY); } catch { /* ignore */ } };
