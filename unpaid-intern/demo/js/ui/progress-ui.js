// Progress (the olive tree, bento tiles) and What's new (stories), read from every session.
import * as M from '../mind.js';
import * as SS from '../sessions.js';
import { createViewer, renderBento, renderProgress, renderStories, renderTree } from '../home.js';
import { $, ICONS, curSession, dayWord, esc, gbp, state, things } from './state.js';
import { essayDays, view } from './results.js';
import { sheet } from './nav.js';
import { openDrawer, openSession } from './sessions-ui.js';

/* ---------- Progress and What's new: read from every session ---------- */
const STREAK = 12;   // demo constant
export const viewer = createViewer($('storyView'), { onAct: actOn, onClose: () => renderStoryRow() });

function homeCards() {
  const r = view(), res = state.results;
  const dup = r.subs?.duplicates[0];
  return (state.cards || []).map(c => {
    let urgent = !!c.job && !!c.urgent;
    if (c.id === 'chase') urgent = !!r.chase?.length;
    else if (c.id === 'deadlines') urgent = (res.deadlines || []).some(d => d.status === 'overdue' || (d.daysLeft >= 0 && d.daysLeft <= 5));
    else if (c.id === 'brief') { const d = essayDays(); urgent = d !== null && d <= 5; }
    return { ...c, urgent, money: c.amount > 0 || (c.id === 'subs' && !!dup) };
  });
}
// The fee check needs the client list, so until it is there the fees card is held back.
const feesBlocked = () => !!state.data.statement && !state.data.clients;
function summaryOf() {
  const r = view(), res = state.results, parts = [];
  if (r.fees && !feesBlocked()) parts.push(r.fees.length ? `${r.fees.length} wrong fee${r.fees.length === 1 ? '' : 's'} · ${gbp(r.fees.reduce((s, f) => s + f.amount, 0))}` : 'No wrong fees');
  if (r.chase) parts.push(r.chase.length ? `${r.chase.length} late invoice${r.chase.length === 1 ? '' : 's'}` : 'No late invoices');
  if (r.subs && (r.subs.priceRises.length || r.subs.duplicates.length)) parts.push('Subscriptions to review');
  if (res.check) parts.push(`${things(res.check.issues.length)} to fix`);
  if (res.deadlines) { const n = res.deadlines.find(d => d.daysLeft >= 0); if (n) parts.push(`${n.title} ${n.daysLeft === 0 ? 'today' : 'in ' + dayWord(n.daysLeft)}`); }
  return parts.slice(0, 3).join(' · ');
}
// Save the current session's result cards (what the chat, the tree and the lists show).
export function syncCards() {
  const s = curSession(); if (!s || !state.results) return;
  const cards = homeCards().filter(c => (c.id !== 'law' || s.pack === 'law') && !(c.id === 'fees' && feesBlocked())).map(c => ({
    id: c.id, title: c.title, icon: c.icon, headline: c.headline, detail: c.detail, tag: c.tag, tagClass: c.tagClass,
    amount: c.amount || 0, urgent: !!c.urgent, money: !!c.money, study: !!c.study, juryType: c.juryType || '', job: c.job || '',
  }));
  SS.setResults(s.id, { cards, summary: s.pack === 'law' ? 'Sick pay from day one' : summaryOf() });
  renderHome(false);
}

// One olive per result card across all sessions. Each card keeps its own slot so an olive never moves.
const SLOT_ORDER = ['fees', 'chase', 'subs', 'law', 'brief', 'deadlines', 'study', 'wellbeing', 'x1', 'x2', 'x3', 'x4'];
function treeModel() {
  const sessions = SS.allSessions().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const used = new Set(), cards = [], picked = new Set();
  for (const s of sessions) {
    for (const c of s.results.cards || []) {
      const slot = SLOT_ORDER.includes(c.id) && !used.has(c.id) ? c.id : SLOT_ORDER.find(k => !used.has(k)) || c.id;
      used.add(slot);
      const id = s.id + ':' + c.id;
      cards.push({ ...c, id, cardId: c.id, slot, sessionId: s.id, sessionTitle: s.title });
      if ((s.results.picked || []).includes(c.id)) picked.add(id);
    }
  }
  return { cards, picked, sessions };
}
function bentoTiles({ cards, picked, sessions }) {
  const total = cards.reduce((s, c) => s + (c.amount || 0), 0);
  const urgent = cards.filter(c => c.urgent && !picked.has(c.id));
  return [
    { id: 'money', label: 'Money found', value: gbp(total), sub: 'Across all your sessions', wide: true, dark: true, card: cards.find(c => c.amount > 0)?.id },
    { id: 'sessions', label: 'Sessions', value: String(sessions.length), sub: 'tap to see them' },
    { id: 'urgent', label: 'Urgent', value: String(urgent.length), sub: urgent.length ? `${urgent.length === 1 ? 'olive' : 'olives'} to pick first` : 'nothing urgent', card: urgent[0]?.id },
  ];
}
function progressItems({ cards, picked, sessions }) {
  const money = cards.filter(c => picked.has(c.id)).reduce((s, c) => s + (c.amount || 0), 0);
  return [
    { value: `${picked.size}/${cards.length}`, label: cards.length === 1 ? 'olive picked' : 'olives picked' },
    { value: gbp(money), label: 'money recovered' },
    { value: String(sessions.length), label: 'sessions' },
    { value: STREAK + ' days', label: 'streak' },
  ];
}
function openOlive(c) {
  sheet.open({ ...c, icon: ICONS[c.icon], detail: `From “${c.sessionTitle}”` }, [{ label: 'Open session', primary: true, fn: () => openSession(c.sessionId) }]);
}
export function renderHome(animate) {
  const model = treeModel();
  const { cards, picked, sessions } = model;
  const dropping = animate ? new Set([...state.justPicked].filter(id => picked.has(id))) : new Set();
  if (animate) state.justPicked = new Set();
  $('treeTitle').textContent = `Your tree · Ollie knows ${things(M.knowledgeList(state.mem).length)}`;
  $('treeSub').textContent = cards.length ? `${picked.size} of ${cards.length} ${cards.length === 1 ? 'olive' : 'olives'} picked across all sessions. Green is new, black is urgent.` : 'No olives yet. Add a file in a session and the first one grows.';
  renderTree($('treeHost'), { cards, picked, dropping, growth: M.growthLevel(state.mem), onOlive: openOlive });
  renderProgress($('progressRow'), progressItems(model));
  renderBento($('bento'), bentoTiles(model), t => {
    if (t.id === 'sessions') { openDrawer(); return; }
    const c = cards.find(x => x.id === t.card); if (c) openOlive(c);
  });
}

function buildStories() {
  const withCards = SS.listSessions().flatMap(g => g.items).filter(s => (s.results.cards || []).length);
  const out = [];
  if (withCards.length) {
    out.push({ id: 'latest', label: 'Latest', pose: 7, slides: withCards.slice(0, 4).map(s => ({ head: s.title, line: s.results.summary || 'Nothing found yet.', pose: 3, state: 'happy', act: 's:' + s.id })) });
    const money = [];
    for (const s of withCards) for (const c of s.results.cards) if (c.amount > 0 && money.length < 4) money.push({ head: gbp(c.amount), line: `${c.headline} (from “${s.title}”)`, pose: 6, state: 'money', act: 's:' + s.id });
    if (money.length) out.push({ id: 'money', label: 'Money', pose: 6, slides: money });
  }
  out.push({ id: 'new', label: "What's new", pose: 2, slides: [
    { head: 'Sessions', line: 'New: one chat for every job. Start a new session when a job is done.', pose: 2, state: 'hop' },
    { head: 'Borrowing', line: 'New: a session can use your files from other sessions, and tells you when it does.', pose: 7, state: 'talk' },
    { head: 'Walkie-talkie', line: 'New: talk to me with the walkie-talkie, inside any session.', pose: 2, state: 'hop' },
    { head: 'Your tree', line: 'New: your olive tree grows with every session.', pose: 7, state: 'happy' },
  ] });
  return out;
}
function renderStoryRow() {
  const list = buildStories();
  renderStories($('storyRow'), list, state.seen, s => { state.seen.add(s.id); viewer.open(s); });
}
export function renderNews() {
  renderStoryRow();
  const list = SS.listSessions().flatMap(g => g.items).filter(s => s.results.summary);
  $('newsList').innerHTML = list.length
    ? list.map(s => `<button class="sitem-main card-like" type="button" data-id="${s.id}"><b>${esc(s.title)}</b><span>${esc(s.results.summary)}</span></button>`).join('')
    : '<p class="tiny">Nothing yet. Add a file in a session and the results show up here.</p>';
}

function actOn(id) { if (id.startsWith('s:')) openSession(id.slice(2)); }

export function initProgress() {
  $('newsList').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) openSession(b.dataset.id); });
}
