// Ollie's mind: what Ollie knows about you, what it learned from your corrections, and what it notices first.
// Pure logic, no DOM, nothing is mutated. app.js keeps the memory in localStorage and draws it.
// It only works from the profile, the checked results and your own corrections. It never invents.

const clone = x => JSON.parse(JSON.stringify(x));
const gbp = n => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);
const todayIso = () => new Date().toISOString().slice(0, 10);

export function createMemory() { return { facts: {}, rules: [], history: [] }; }

/* ---------- matching helpers (the same approach as talk.js applyObjection, copied so talk.js stays untouched) ---------- */
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'the']);
const cleanName = n => n.toLowerCase().replace(/\b(ltd|limited|co|company|plc)\b\.?/g, '').replace(/\s+/g, ' ').trim();
const firstToken = n => cleanName(n).split(' ').find(w => !TITLES.has(w) && w.length >= 4) || '';
const hasWord = (lc, w) => !!w && new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(lc);
const mentions = (lc, name) => { const c = cleanName(name); return hasWord(lc, c) || hasWord(lc, firstToken(name)); };
function invoiceNo(lc) { const m = lc.match(/\binv-?\s?(\d+)/); return m ? 'INV-' + m[1] : ''; }
function findChase(lc, ctx) {
  const no = invoiceNo(lc);
  if (no) { const hit = ctx.chase.find(c => c.invoice === no); if (hit) return hit; }
  return ctx.chase.find(c => mentions(lc, c.customer)) || null;
}
const findFee = (lc, ctx) => ctx.fees.find(f => mentions(lc, f.client)) || null;
const NEW_WORDS = /\b(new|first time|never been)\b/;
const PAID_WORDS = /\b(paid|settled)\b/;

/* ---------- remembering ---------- */
const FROM_PROFILE = 'You told me in Getting to know you';
const FROM_FILES = 'From your files';
const LABELS = {
  name: 'What to call you', roles: 'Who you are', btype: 'Business type', staff: 'Staff',
  level: 'Study level', subject: 'Subject',
  lateInvoices: 'Late invoices', unclaimedFees: 'Wrong Fresha fees to claim', nextDeadline: 'Next deadline',
};
const FILE_KEYS = ['lateInvoices', 'unclaimedFees', 'nextDeadline'];
const ROLE_NAME = { parent: 'Mum or dad', business: 'Business owner', worker: 'Worker', student: 'Student', teacher: 'Teacher', other: 'Something else' };

function withFacts(mem, add, drop = []) {
  const next = clone(mem);
  drop.forEach(k => { delete next.facts[k]; });
  Object.entries(add).forEach(([k, f]) => { if (f && f.value) next.facts[k] = f; });
  return next;
}

export function rememberProfile(mem, { roles = [], answers = {} } = {}, today = todayIso()) {
  const at = today, put = v => (v ? { value: String(v), source: FROM_PROFILE, at } : null);
  const a = answers;
  return withFacts(mem, {
    name: put(a.name),
    roles: put(roles.map(r => ROLE_NAME[r] || r).join(', ')),
    btype: put(a.btype),
    staff: put(a.staff),
    level: put(a.level || a.slevel),
    subject: put(a.subject || a.ssubject),
  });
}

export function rememberResults(mem, ctx, today = todayIso()) {
  const put = value => ({ value, source: FROM_FILES, at: today });
  const add = {};
  const biz = (ctx.chase || []).filter(c => c.lawApplies);
  if (ctx.chase && ctx.chase.length) {
    add.lateInvoices = put(`${plural(ctx.chase.length, 'invoice', 'invoices')} past due, ${gbp(sum(ctx.chase, c => c.amount))} owed${biz.length ? ` (${biz.length} to businesses)` : ''}`);
  }
  if (ctx.fees && ctx.fees.length) add.unclaimedFees = put(`${gbp(sum(ctx.fees, f => f.amount))} in ${plural(ctx.fees.length, 'fee', 'fees')} Fresha shouldn't have charged`);
  const next = (ctx.deadlines || []).find(d => d.daysLeft >= 0);
  if (next) add.nextDeadline = put(`${next.title}, ${next.daysLeft === 0 ? 'today' : plural(next.daysLeft, 'day', 'days') + ' left'}`);
  return withFacts(mem, add, FILE_KEYS);
}

/* ---------- learning from a correction ---------- */
export function learnFromObjection(mem, cardType, text, ctx, today = todayIso()) {
  const lc = String(text || '').toLowerCase();
  let rule = null;
  if (cardType === 'fees') {
    const hit = findFee(lc, ctx);
    if (hit && NEW_WORDS.test(lc)) rule = { id: 'fees-not-new:' + hit.client, type: 'fees-not-new', client: hit.client, text: `${hit.client} counts as a new client`, at: today };
  } else if (cardType === 'chase') {
    const hit = findChase(lc, ctx);
    if (hit && PAID_WORDS.test(lc)) rule = { id: 'invoice-paid:' + hit.invoice, type: 'invoice-paid', invoice: hit.invoice, text: `${hit.invoice} is paid`, at: today };
  }
  if (!rule) return { mem, rule: null, note: '' };
  if (mem.rules.some(r => r.id === rule.id)) return { mem, rule: null, note: 'Ollie already knows that.' };
  const next = clone(mem);
  next.rules.push(rule);
  return { mem: next, rule, note: `Ollie learned: ${rule.text}` };
}

export function applyRules(mem, ctx) {
  const next = clone(ctx);
  for (const r of mem.rules) {
    if (r.type === 'fees-not-new') next.fees = (next.fees || []).filter(f => f.client !== r.client);
    else if (r.type === 'invoice-paid') next.chase = (next.chase || []).filter(c => c.invoice !== r.invoice);
  }
  return next;
}
export function removeRule(mem, id) {
  const next = clone(mem);
  next.rules = next.rules.filter(r => r.id !== id);
  return next;
}
export function forgetFact(mem, key) {
  const next = clone(mem);
  delete next.facts[key];
  return next;
}
// How many of the rules that were applied actually changed something (for the "Used N things Ollie learned" line).
export function rulesUsed(mem, ctx) {
  return mem.rules.filter(r => (r.type === 'fees-not-new' && (ctx.fees || []).some(f => f.client === r.client))
    || (r.type === 'invoice-paid' && (ctx.chase || []).some(c => c.invoice === r.invoice))).length;
}

/* ---------- "I noticed..." ---------- */
export function notices(mem, ctxIn, today = todayIso()) {
  const ctx = applyRules(mem, ctxIn), out = [];
  (ctx.chase || []).filter(c => c.lawApplies).forEach(c => out.push({
    id: 'chase:' + c.invoice, card: 'chase', priority: 80 + Math.min(c.daysLate, 100) / 10,
    text: `${c.customer.replace(/\s+(ltd|limited)\.?$/i, '')} still hasn't paid. It's ${plural(c.daysLate, 'day', 'days')} late. Want me to chase it?`,
  }));
  if ((ctx.fees || []).length) out.push({
    id: 'fees', card: 'fees', priority: 70,
    text: `Fresha still owes you ${gbp(sum(ctx.fees, f => f.amount))}. The dispute is ready.`,
  });
  (ctx.deadlines || []).filter(d => d.daysLeft >= 0 && d.daysLeft <= 7).forEach(d => out.push({
    id: 'deadline:' + d.title, card: 'deadlines', priority: 78 - d.daysLeft / 2,
    text: `${d.title} is ${d.daysLeft === 0 ? 'today' : 'in ' + plural(d.daysLeft, 'day', 'days')}.`,
  }));
  if (ctx.business) out.push({
    id: 'law', card: 'law', priority: 40,
    text: 'The sick pay rules changed on 6 April 2026. I drafted a staff policy for you.',
  });
  return out.sort((a, b) => b.priority - a.priority);
}

/* ---------- what Ollie knows ---------- */
export function knowledgeList(mem) {
  const facts = Object.entries(mem.facts).map(([key, f]) => ({
    key, label: LABELS[key] || key, value: f.value, source: f.source, group: FILE_KEYS.includes(key) ? 'files' : 'about',
  }));
  const rules = mem.rules.map(r => ({
    key: 'rule:' + r.id, label: 'Rule Ollie learned', value: r.text, source: `You told me in a jury check, ${r.at}`, group: 'rules',
  }));
  return [...facts, ...rules];
}
export const growthLevel = mem => Math.max(0, Math.min(1, (Object.keys(mem.facts).length + 2 * mem.rules.length) / 20));
