// Screens, the back stack, the tab bar and toasts.
import { createSheet } from '../home.js';
import { setState } from '../ollie.js';
import { $, curSession, state } from './state.js';
import { openBrief } from './brief.js';
import { chatBack, chatCanBack } from './onboarding.js';
import { stopWalk, walk } from './talk-ui.js';
import { renderHome, renderNews } from './progress-ui.js';
import { renderKnow } from './settings.js';
import { renderThread, toSession } from './sessions-ui.js';

// The bottom sheet is shared by the tree, the Promise and the session list.
export const sheet = createSheet($('sheet'));

const TITLES = { study: 'Study pack', quiz: 'Quiz', settings: 'Settings', jury: 'Jury', draft: 'Draft', report: 'Progress', news: "What's new", chat: 'Meet Ollie', talk: 'Walkie-talkie', know: 'What Ollie knows' };
const TAB_OF = { chat: '', know: 'settings', sess: 'sess', study: 'sess', quiz: 'sess', report: 'report', news: 'news', jury: 'sess', draft: 'sess', talk: 'sess', settings: 'settings' };

export function show(name, { push = true } = {}) {
  if (push && state.current && state.current !== 'splash') {
    state.history.push(state.current);
    try { history.pushState({ n: state.history.length }, ''); } catch { /* ignore */ }
  }
  document.querySelectorAll('.screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
  // Ollie speaks first again when you come back to the chat after 30+ seconds away.
  if (state.current === 'sess' && name !== 'sess') state.awayAt = Date.now();
  if (name === 'sess' && state.ready && state.awayAt && Date.now() - state.awayAt > 30000) { openBrief(); state.awayAt = 0; }
  state.current = name;
  $('appbar').hidden = name === 'splash';
  $('backBtn').hidden = name === 'sess' || (name === 'chat' ? !chatCanBack() : !state.history.length || name === 'splash');
  $('menuBtn').hidden = name !== 'sess'; $('newBtn').hidden = name !== 'sess'; $('gearBtn').hidden = name === 'sess';
  $('appbarTitle').textContent = name === 'sess' && curSession() ? curSession().title : TITLES[name] || 'Unpaid Intern';
  $('appbarTitle').disabled = name !== 'sess';
  $('appbarTitle').setAttribute('aria-label', name === 'sess' ? 'Session name, tap to rename' : TITLES[name] || 'Unpaid Intern');
  $('tabbar').hidden = !state.ready || ['splash', 'chat'].includes(name);
  const tab = state.ready ? TAB_OF[name] : '';
  document.querySelectorAll('.tab').forEach(t => { if (t.dataset.tab === tab) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
  $('screens').scrollTop = 0;
  if (name !== 'talk' && walk.on) stopWalk();
  if (name === 'report' && state.ready) {
    renderHome(true);
    if (state.cheer) { state.cheer = false; const t = document.querySelector('.tree-ollie'); if (t) setState(t, 'happy'); }
  }
  if (name === 'news' && state.ready) renderNews();
  if (name === 'know') renderKnow();
  if (name === 'sess') renderThread();
}

// Back pops the app's own stack. The browser history is kept in step, so the Android back button does the same.
function back() {
  if (state.current === 'chat') { if (chatCanBack()) chatBack(); return; }
  const len = state.history.length;
  if (len) {
    history.back();
    setTimeout(() => { if (state.history.length === len) show(state.history.pop(), { push: false }); }, 250);
  } else if (state.ready && state.current !== 'sess') toSession();
}

// Tabs are top-level places, so they reset the back stack.
function goTab(tab) {
  state.history = [];
  if (tab === 'sess') toSession(); else show(tab, { push: false });
}

let toastTimer;
export function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

export function initNav() {
  window.addEventListener('popstate', () => {
    if (state.history.length) show(state.history.pop(), { push: false });
    else {
      if (state.ready && state.current !== 'sess') toSession();
      try { history.pushState({ n: 0 }, ''); } catch { /* ignore */ }
    }
  });
  $('tabbar').addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) goTab(b.dataset.tab); });
  $('backBtn').addEventListener('click', back);
  $('gearBtn').addEventListener('click', () => { if (state.current !== 'settings') show('settings'); });
}
