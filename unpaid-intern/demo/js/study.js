// Class notes into revision, and Ollie knowing what it has been given. Pure functions: no DOM, no network.
// Authorities are only ever checked against the verified list. Nothing here writes coursework.
import { parseCSV } from './rules.js';

const DAY = 86400000;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = n => String(n).padStart(2, '0');
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);

/* ---------- what is this? ---------- */
const hasCols = (text, cols) => {
  const rows = parseCSV(text);
  return rows.length > 0 && cols.every(c => c in rows[0]);
};
// Plain keyword and file-name clues. Funding is checked before letter because a funding letter is also a letter.
export function classifyMaterial(text, filename = '') {
  const t = String(text || ''), name = String(filename || '').toLowerCase();
  if (/"landlord"/.test(t) && /"deposit"/.test(t)) return { kind: 'lease', why: 'it names a landlord and a deposit' };
  if (/"hourly_rate"/.test(t) && /"tax_code"/.test(t)) return { kind: 'payslip', why: 'it has an hourly rate and a tax code' };
  if (hasCols(t, ['invoice', 'customer', 'amount', 'due', 'paid'])) return { kind: 'invoices', why: 'the columns are invoice, customer, amount and due' };
  if (hasCols(t, ['date', 'client', 'fee_type', 'fee_amount'])) return { kind: 'statement', why: 'the columns are client, fee type and fee amount' };
  if (hasCols(t, ['title', 'type', 'due'])) return { kind: 'deadlines', why: 'the columns are title, type and due' };
  if (hasCols(t, ['date', 'description', 'amount'])) return { kind: 'unknown', why: 'it is a bank export, which the other jobs use' };
  if ((/^\s*(course|unit|assignment|task)\s*:/im.test(t) && /word count|deadline|must cover/i.test(t)) || /brief/.test(name)) return { kind: 'brief', why: 'it reads like an assignment brief' };
  if (/bursary|student funding|funding award/i.test(t)) return { kind: 'funding', why: 'it talks about a bursary and payment dates' };
  if (/^\s*(from|subject)\s*:/im.test(t) && /\bdear\b/i.test(t)) return { kind: 'letter', why: 'it has a sender, a subject and a greeting' };
  if (/^LO\d+\s+\S/m.test(t) || (/\bnotes\b/.test(name) && /^\s*-\s+\S/m.test(t))) return { kind: 'notes', why: 'it has learning outcomes and bullet points' };
  return { kind: 'unknown', why: 'nothing in it matches a job I know' };
}

// A bank export (date, description, amount): the bursary check reads payments from it.
export const isBankExport = text => hasCols(text, ['date', 'description', 'amount']);

/* ---------- notes ---------- */
const longDateToIso = s => {
  const m = String(s).match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  return m ? `${m[3]}-${pad(MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${pad(+m[1])}` : null;
};
export function parseNotes(text) {
  const lines = String(text).split(/\r?\n/);
  const sections = [];
  let title = '', exam = null;
  lines.forEach((raw, i) => {
    const l = raw.trim(), n = i + 1;
    if (!l) return;
    const lo = l.match(/^(LO\d+)\s+(.+)$/);
    const ex = l.match(/^Exam\s*:\s*(.*)$/i);
    if (!title && !lo && !ex) title = l;
    else if (lo) sections.push({ lo: lo[1], title: lo[2], line: n, points: [] });
    else if (ex) exam = { openBook: /open[- ]book/i.test(ex[1]), date: longDateToIso(ex[1]) };
    else if (/^[-*]\s+/.test(l) && sections.length) sections[sections.length - 1].points.push({ text: l.replace(/^[-*]\s+/, ''), line: n });
  });
  return { title, sections, exam };
}

/* ---------- authorities ---------- */
const ACT = /\b((?:[A-Z][A-Za-z]*\s+)+Act\s+\d{4}),\s*(ss?\d[\w()\-]*)/g;
const REPORTED = /(\[\d{4}\]\s+(?:\d+\s+)?[A-Z][A-Za-z]*\s+\d+)/;
// The party names before a citation: walk back from "v" while the words look like part of a name.
function caseName(before) {
  const at = before.search(/\sv\s/);
  if (at < 0) return '';
  const words = before.slice(0, at).trim().split(/\s+/), left = [];
  for (let i = words.length - 1; i >= 0 && !/[,:;]$/.test(words[i]) && /^([A-Z&]|of$|and$|the$)/.test(words[i]); i--) left.unshift(words[i]);
  return left.length ? (left.join(' ') + before.slice(at)).trim() : '';
}
const BARE = /(?:^|[\s-])([A-Z][\w'&.]*(?:\s+[A-Z&][\w'&.]*)*\s+v\s+[A-Z][\w'&.]*(?:\s+[A-Z&][\w'&.]*)*?)\s+(\d{4})\b/;
// Every case and every Act section in the notes, with the line it was on.
export function findAuthorities(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    const found = [];
    for (const m of line.matchAll(ACT)) found.push({ at: m.index, a: { kind: 'act', name: m[1], cite: m[2], line: i + 1 } });
    const rep = line.match(REPORTED);
    if (rep) {
      const name = caseName(line.slice(0, rep.index));
      if (name) found.push({ at: rep.index, a: { kind: 'case', name, cite: rep[1], line: i + 1 } });
    } else {
      const bare = line.match(BARE);
      if (bare) found.push({ at: bare.index, a: { kind: 'case', name: bare[1], cite: bare[2], line: i + 1 } });
    }
    found.sort((x, y) => x.at - y.at).forEach(f => out.push(f.a));
  });
  return out;
}
const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
// ok / wrong-citation (right name, wrong year or page) / not-verified (not on the verified list).
export function checkAuthorities(found, verified) {
  return found.map(a => {
    const same = verified.filter(v => v.kind === a.kind && norm(v.name) === norm(a.name));
    const exact = same.find(v => norm(v.cite) === norm(a.cite));
    if (exact) return { ...a, status: 'ok', principle: exact.principle };
    if (a.kind === 'case' && same.length === 1) return { ...a, status: 'wrong-citation', expected: same[0].cite, principle: same[0].principle };
    return { ...a, status: 'not-verified' };
  });
}
const label = a => (a.kind === 'case' ? `${a.name} ${a.expected || a.cite}` : `${a.name}, ${a.cite}`);
const usable = checked => checked.filter(a => a.status !== 'not-verified');

/* ---------- flashcards and quiz ---------- */
export function makeFlashcards(checked) {
  return usable(checked).map(a => ({ front: label(a), back: a.principle }));
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// "Which authority says: ...?" with three options. The same seed gives the same quiz.
export function makeQuiz(cards, n, seed) {
  if (cards.length < 3) return [];
  const rand = rng(seed || 1), pick = shuffle(cards, rand).slice(0, Math.min(n, cards.length));
  return pick.map(c => {
    const others = shuffle(cards.filter(x => x !== c), rand).slice(0, 2);
    const options = shuffle([c, ...others], rand).map(x => x.front);
    return { question: `Which authority says: "${c.back}"?`, options, answer: options.indexOf(c.front) };
  });
}

/* ---------- open-book index and plan ---------- */
export function openBookIndex(text, verified) {
  const notes = parseNotes(text), checked = usable(checkAuthorities(findAuthorities(text), verified));
  const loOf = line => (notes.sections.filter(s => s.line <= line).pop() || {}).lo || '';
  return checked.map(a => ({ term: label(a), where: loOf(a.line), line: a.line })).sort((x, y) => (x.term < y.term ? -1 : x.term > y.term ? 1 : 0));
}
// One learning outcome a day from tomorrow, then flashcards and quiz in turn, a full mock quiz the day before the exam.
export function studyPlan(text, todayISO) {
  const notes = parseNotes(text);
  if (!notes.exam || !notes.exam.date) return [];
  const days = daysBetween(todayISO, notes.exam.date) - 1, plan = [];
  for (let i = 0; i < days; i++) {
    const sec = notes.sections[i];
    plan.push({ date: addDays(todayISO, i + 1), task: sec ? `${sec.lo}: ${sec.title}` : (i - notes.sections.length) % 2 === 0 ? 'Flashcards: all topics' : 'Quiz: all topics' });
  }
  if (plan.length) plan[plan.length - 1].task = 'Full mock quiz';
  return plan;
}
