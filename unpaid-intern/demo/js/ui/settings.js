// Settings, What Ollie knows, the Ollie Promise sheet, and Start again.
import * as M from '../mind.js';
import * as SS from '../sessions.js';
import { stopSpeaking } from '../voice.js';
import { resetTreeGrowth } from '../home.js';
import { setPose, setState } from '../ollie.js';
import { $, ICONS, clearMind, curSession, esc, liveOn, saveMind, savePrefs, state } from './state.js';
import { resetTalk, stopTalkBob } from './talk-ui.js';
import { activateSession, closeDrawer, sx } from './sessions-ui.js';
import { refreshMind } from './results.js';
import { sheet, show, toast } from './nav.js';
import { resetJury } from './jury-ui.js';
import { viewer } from './progress-ui.js';

/* ---------- preferences ---------- */
const SEGS = [['segTheme', 'theme'], ['segSize', 'size'], ['segJury', 'jury'], ['segSpeak', 'speak']];
export function applyPrefs() {
  document.documentElement.dataset.theme = state.prefs.theme;
  document.documentElement.dataset.size = state.prefs.size;
  for (const [id, key] of SEGS) {
    $(id).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === state.prefs[key])));
  }
  $('liveNote').textContent = state.prefs.jury !== 'live' ? 'Recorded answers are on.'
    : liveOn() ? 'Live AI is ready on this laptop.' : 'Recorded answers (live AI not available here).';
  savePrefs();
}

/* ---------- What Ollie knows about you ---------- */
export function renderKnow() {
  const list = M.knowledgeList(state.mem);
  const groups = [['about', 'About you'], ['files', 'From your files'], ['rules', 'Rules Ollie learned']];
  $('knowBody').innerHTML = !list.length ? '<p class="tiny">Ollie does not know anything about you yet.</p>' : groups.map(([g, title]) => {
    const items = list.filter(k => k.group === g);
    return `<h2 class="mini-h know-h">${title}</h2>` + (items.length ? items.map(k => `
      <div class="know-item"><div><p class="mono-cap">${esc(k.label.toUpperCase())}</p><p class="know-v">${esc(k.value)}</p><p class="tiny">${esc(k.source)}</p></div>
      <button class="btn" type="button" data-forget="${esc(k.key)}" aria-label="Forget ${esc(k.label)}">Forget</button></div>`).join('') : '<p class="tiny know-none">Nothing yet.</p>');
  }).join('');
}

// The Law check panel: the last real run saved by tools/law_eval.mjs, or "Not run yet."
async function renderLawCheck() {
  let r = null;
  try { const res = await fetch('data/law_eval_results.json'); if (res.ok) r = await res.json(); } catch { /* not run yet */ }
  if (!r || !Array.isArray(r.results)) return;
  const day = new Date(r.date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  $('lawLine').textContent = `${r.total} Scots law questions, each marked against a checklist. Last run: ${r.score} of ${r.total} passed (${r.model}, ${day}).`;
  const qs = {};
  try { const t = await fetch('data/law_tests.json'); if (t.ok) for (const x of (await t.json()).questions) qs[x.id] = x.q; } catch { /* show ids */ }
  $('lawList').innerHTML = r.results.map(x => `<li><b>${esc(qs[x.id] || x.id)}</b><span class="${x.pass ? 'tag-money' : 'tag-risk'} stat">${x.pass ? 'Pass' : 'Fail'}</span></li>`).join('');
  $('lawFold').hidden = false;
}

export function initSettings() {
  renderLawCheck();
  for (const [id, key] of SEGS) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.prefs[key] = b.dataset.v; applyPrefs();
      if (key === 'speak' && b.dataset.v === 'off') { stopSpeaking(); stopTalkBob(); }
    });
  }
  $('knowBody').addEventListener('click', e => {
    const b = e.target.closest('[data-forget]'); if (!b) return;
    const key = b.dataset.forget;
    if (key.startsWith('rule:')) {
      state.mem = M.removeRule(state.mem, key.slice(5)); saveMind();
      const cur = curSession(); if (cur) activateSession(cur.id);   // the current session's facts come back without that rule
      refreshMind();
      toast('Forgotten. Ollie will not use that rule again.');
    } else { state.mem = M.forgetFact(state.mem, key); saveMind(); toast('Forgotten.'); }
    renderKnow();
  });
  $('knowBtn').addEventListener('click', () => show('know'));
  // The Ollie Promise, as a bottom sheet.
  $('promiseBtn').addEventListener('click', () => sheet.open({
    icon: ICONS.tick, title: 'The Ollie Promise', headline: 'Three promises, said plainly',
    html: `<ul class="promise-list">
      <li><b class="mono-cap">✓ YOU KNOW WHERE YOUR FILES GO</b><span>In this demo your files are read on this device; the page only reaches out for its fonts (Google Fonts) and, when it is available, for the AI model running on this laptop. In the real app some jobs use online AI services, which may read your files only on our instructions under a written contract (UK GDPR, Article 28(3)(a) (a processor may process personal data only on documented instructions from the controller)).</span></li>
      <li><b class="mono-cap">✓ NOTHING SENT WITHOUT YOU</b><span>Ollie writes drafts and notes. This demo has no Send button: you copy a draft and send it yourself.</span></li>
      <li><b class="mono-cap">✓ EVERY ANSWER SHOWS ITS SOURCE</b><span>Each result says whether it was checked by code (and by which rule), is an AI opinion from the local model, or is a recorded answer. The jury model only ever sees anonymised facts (Client A, B…) and the rules you taught Ollie, never real names or your file contents.</span></li>
    </ul>`,
  }, [{ label: 'Got it', primary: true, fn: () => {} }]));
  // Start again: forget everything on this device and go back to the splash screen.
  $('startAgain').addEventListener('click', () => {
    resetTalk(); resetJury(); viewer.close(); sheet.close(); closeDrawer(); resetTreeGrowth();
    SS.clearAll(); sx.busy = false; sx.finishing = false; $('sThread').innerHTML = '';
    clearMind();
    state.brief = null; state.opinion = {}; state.awayAt = 0; state.usedRules = 0;
    state.roles = new Set(['business']); state.answers = {}; state.data = {};
    state.results = null; state.ctx = null; state.off = new Set(); state.ready = false; state.cards = null; state.sctx = null; state.quiz = null;
    state.justPicked = new Set(); state.seen = new Set(); state.history = []; state.active = null; state.draftCard = null;
    const o = $('splashOllie'); setPose(o, 1); setState(o, 'sleep'); o.setAttribute('aria-label', 'Ollie the olive, fast asleep');
    show('splash', { push: false });
  });
  // Offline: say so, and the jury uses recorded answers.
  const syncOnline = () => { $('offlineNote').hidden = navigator.onLine !== false; applyPrefs(); };
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
  syncOnline();
}
