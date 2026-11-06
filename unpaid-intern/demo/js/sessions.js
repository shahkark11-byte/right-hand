// Sessions: one chat per job. Pure logic, no DOM. app.js draws it and runs the rules.
// Everything is kept in localStorage on this device (or in memory if storage is blocked).
import { parseCSV } from './rules.js';
import { parseBrief } from './student.js';

export const STORE_KEY = 'ui_sessions_v1';
export const DEFAULT_TITLE = 'New session';

const CSV_KINDS = [
  { kind: 'statement', need: ['date', 'client', 'fee_type', 'fee_amount', 'booking_source'] },
  { kind: 'clients', need: ['client', 'added_on'] },
  { kind: 'invoices', need: ['invoice', 'customer', 'customer_type', 'amount', 'due', 'paid'] },
  { kind: 'bank', need: ['date', 'merchant', 'amount', 'category'] },
  { kind: 'deadlines', need: ['title', 'type', 'due'] },
];
export const KIND_LABEL = {
  statement: 'Fresha statement', clients: 'client list', invoices: 'invoices', bank: 'bank statement',
  brief: 'assignment brief', draft: 'draft', deadlines: 'deadlines',
};
const BIZ_KINDS = ['statement', 'clients', 'invoices', 'bank'];
const STUDENT_KINDS = ['brief', 'draft', 'deadlines'];

let store = { v: 1, sessions: [], current: null, onboarded: false, answers: {}, roles: ['business'] };
let counter = 0;

/* ---------- storage ---------- */
export function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const s = JSON.parse(raw); if (s && Array.isArray(s.sessions)) store = { ...store, ...s }; }
  } catch { /* works in memory */ }
  return store;
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* works in memory */ } }
export function clearAll() {
  store = { v: 1, sessions: [], current: null, onboarded: false, answers: {}, roles: ['business'] };
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
}
export const isOnboarded = () => !!store.onboarded;
export function setOnboarded({ answers, roles }) { store.onboarded = true; store.answers = answers || {}; store.roles = roles || ['business']; save(); }
export const profile = () => ({ answers: store.answers || {}, roles: store.roles || ['business'] });
export const currentId = () => store.current;
export function setCurrent(id) { store.current = id; save(); }

/* ---------- sessions ---------- */
const newId = () => 's' + Date.now().toString(36) + (counter++).toString(36);

export function createSession(title, { pack = 'mixed', createdAt, auto = true } = {}) {
  const s = {
    id: newId(), title: title || DEFAULT_TITLE, titleAuto: auto, createdAt: createdAt || new Date().toISOString(),
    pack, files: [], messages: [], results: { cards: [], picked: [], summary: '', shown: [], offered: false },
  };
  store.sessions.push(s); store.current = s.id; save();
  return s;
}
export const getSession = id => store.sessions.find(s => s.id === id) || null;
export function renameSession(id, title) {
  const s = getSession(id), t = String(title || '').trim();
  if (!s || !t) return false;
  s.title = t.slice(0, 60); s.titleAuto = false; save();
  return true;
}
export function deleteSession(id) {
  store.sessions = store.sessions.filter(s => s.id !== id);
  if (store.current === id) store.current = null;
  save();
}
export const allSessions = () => store.sessions.slice();

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
// Newest first, grouped Today / Earlier. Empty groups are left out.
export function listSessions(now = new Date()) {
  const sorted = store.sessions.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const today = sorted.filter(s => sameDay(s.createdAt, now)), earlier = sorted.filter(s => !sameDay(s.createdAt, now));
  return [{ label: 'Today', items: today }, { label: 'Earlier', items: earlier }].filter(g => g.items.length);
}

/* ---------- files ---------- */
export function addFile(id, file) {
  const s = getSession(id); if (!s) return null;
  s.files.push(file);
  if (s.titleAuto) s.title = autoTitle(s);
  save();
  return file;
}
// The most recent file of a kind in OTHER sessions. Copies that were themselves borrowed are skipped.
export function findFile(kind, { excludeId } = {}) {
  const sorted = store.sessions.filter(s => s.id !== excludeId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const s of sorted) {
    for (let i = s.files.length - 1; i >= 0; i--) {
      const f = s.files[i];
      if (f.kind === kind && !f.fromSession) return { file: f, session: s };
    }
  }
  return null;
}
// Latest file of each kind in this session, as { kind: rows|text }.
export function dataOf(s) {
  const d = {};
  for (const f of s.files) d[f.kind] = f.rows !== undefined ? f.rows : f.text;
  return d;
}
export function packOf(s) {
  const kinds = new Set(s.files.map(f => f.kind));
  const biz = BIZ_KINDS.some(k => kinds.has(k)), stu = STUDENT_KINDS.some(k => kinds.has(k));
  return biz && stu ? 'mixed' : stu ? 'student' : biz ? 'business' : s.pack;
}

// Works out what a file is from its columns or content. Returns { kind, rows | text } or null.
export function detectKind(name, text) {
  const t = String(text || '');
  if (!t.trim()) return null;
  const rows = /\.(csv)$/i.test(name) || /^[^\n]*,[^\n]*\n/.test(t) ? parseCSV(t) : [];
  if (rows.length) {
    const hit = CSV_KINDS.find(k => k.need.every(c => c in rows[0]));
    if (hit) return { kind: hit.kind, rows };
  }
  if (/\.(csv)$/i.test(name)) return null;
  if (parseBrief(t).minWords) return { kind: 'brief', text: t };
  if (/brief/i.test(name) && !/draft/i.test(name)) return { kind: 'brief', text: t };
  return { kind: 'draft', text: t };
}

/* ---------- titles and messages ---------- */
const monthShort = iso => new Date(iso).toLocaleDateString('en-GB', { month: 'short' });
export function autoTitle(s) {
  const own = s.files.filter(f => !f.fromSession), kinds = (own.length ? own : s.files).map(f => f.kind);
  const first = kinds[0];
  if (first === 'statement') return 'Fresha fees · ' + monthShort(s.createdAt);
  if (first === 'invoices' || first === 'clients') return 'Invoices';
  if (first === 'bank') return 'Subscriptions';
  if (first === 'brief' || first === 'draft') return 'Essay check';
  if (first === 'deadlines') return 'Deadlines';
  const q = s.messages.find(m => m.who === 'me' && m.text);
  if (q) return q.text.length > 24 ? q.text.slice(0, 22).trim() + '…' : q.text;
  return s.title && s.title !== DEFAULT_TITLE ? s.title : 'Chat';
}
export function addMessage(id, msg) {
  const s = getSession(id); if (!s) return null;
  s.messages.push(msg);
  if (s.titleAuto && msg.who === 'me' && msg.text) s.title = autoTitle(s);
  save();
  return msg;
}
export function setResults(id, patch) {
  const s = getSession(id); if (!s) return;
  s.results = { ...s.results, ...patch }; save();
}
export function markPicked(id, cardId) {
  const s = getSession(id); if (!s) return;
  if (!s.results.picked.includes(cardId)) s.results.picked.push(cardId);
  save();
}

// Two past sessions so borrowing can be shown. Only runs on a fresh install.
export function seedDemoHistory({ onboarding = [], clients, invoices } = {}) {
  if (store.sessions.length) return null;
  const know = createSession('Getting to know you', { pack: 'intro', auto: false });
  know.messages = onboarding;
  const oct = createSession('Invoices Oct', { pack: 'business', createdAt: '2026-10-28T10:00:00.000Z', auto: false });
  if (clients) oct.files.push({ kind: 'clients', name: 'fresha_clients_EXAMPLE.csv', rows: clients });
  if (invoices) oct.files.push({ kind: 'invoices', name: 'invoices_EXAMPLE.csv', rows: invoices });
  oct.messages.push({ who: 'me', text: '', chips: oct.files.map(f => ({ name: f.name, kind: f.kind })) });
  save();
  return { know, oct };
}
