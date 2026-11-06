// What Ollie found: the checks, the result cards, where each answer came from, and approving one.
import * as M from '../mind.js';
import * as SS from '../sessions.js';
import { BASE_RATE_EXAMPLE, anonymise, chaseInvoices, checkFreshaFees, findSubscriptionIssues } from '../rules.js';
import { checkDraft, deadlines as buildDeadlines, parseBrief, studyPack } from '../student.js';
import { LAW_SOURCE, buildContext } from '../talk.js';
import { CHECKED_ON, DEMO_TODAY, ICONS, bizChosen, dayWord, esc, gbp, saveMind, state, studentChosen, things } from './state.js';
import { renderHome, syncCards } from './progress-ui.js';
import { toast } from './nav.js';
import { openQuiz, openStudy } from './study-ui.js';
import { adjustBox, openJury } from './jury-ui.js';
import { openDraft, openEscalate } from './drafts.js';
import { adjustJob, buildJobCards, jobCardHtml } from './jobs-ui.js';

export function compute() {
  const t0 = performance.now();
  const d = state.data;
  const res = { t: {} };
  let lap = performance.now();
  if (d.statement) {
    const anon = anonymise(d.statement, 'client');
    res.feeMap = anon.map;
    const alias = {}; Object.entries(anon.map).forEach(([a, n]) => { alias[n] = a; });
    res.fees = checkFreshaFees(d.statement, d.clients || []);
    res.feesAnon = res.fees.map(f => ({ ...f, client: alias[f.client] }));
    res.t.fees = performance.now() - lap; lap = performance.now();
  }
  if (d.invoices) {
    const anon = anonymise(d.invoices, 'customer');
    res.invMap = anon.map;
    const alias = {}; Object.entries(anon.map).forEach(([a, n]) => { alias[n] = a; });
    res.chase = chaseInvoices(d.invoices, { today: DEMO_TODAY, baseRate: BASE_RATE_EXAMPLE });
    res.chaseAnon = res.chase.map(c => ({ ...c, customer: alias[c.customer] }));
    res.t.chase = performance.now() - lap; lap = performance.now();
  }
  if (d.bank) { res.subs = findSubscriptionIssues(d.bank); res.t.subs = performance.now() - lap; lap = performance.now(); }
  res.feeAlias = d.statement ? Object.fromEntries(Object.entries(res.feeMap).map(([a, n]) => [n, a])) : {};
  res.invAlias = d.invoices ? Object.fromEntries(Object.entries(res.invMap).map(([a, n]) => [n, a])) : {};
  if (studentChosen()) {
    if (d.brief) res.brief = parseBrief(d.brief);
    if (d.brief && d.draft) res.check = checkDraft(res.brief, d.draft);
    if (d.deadlines) res.deadlines = buildDeadlines(d.deadlines, DEMO_TODAY);
    res.study = res.brief ? studyPack(res.brief.title) : null;
    res.t.student = performance.now() - lap;
  }
  res.ms = performance.now() - t0;
  return res;
}

// The facts for this session, with everything Ollie has learned applied. Also counts the learned things that changed something.
export function makeCtx() {
  const raw = buildContext({ fees: state.results.fees, chase: state.results.chase, subs: state.results.subs, business: state.answers.btype });
  state.usedRules = M.rulesUsed(state.mem, raw);
  return M.applyRules(state.mem, raw);
}

// What Ollie can see across all your sessions (the newest file of each kind), with learned rules applied. Feeds the brief.
export function briefCtx() {
  const rows = k => SS.findFile(k)?.file.rows;
  const st = rows('statement'), cl = rows('clients'), inv = rows('invoices'), bank = rows('bank'), dl = rows('deadlines');
  const roles = SS.profile().roles, biz = roles.includes('business') || !roles.includes('student');
  const raw = buildContext({
    fees: st && cl ? checkFreshaFees(st, cl) : [],
    chase: inv ? chaseInvoices(inv, { today: DEMO_TODAY, baseRate: BASE_RATE_EXAMPLE }) : [],
    subs: bank ? findSubscriptionIssues(bank) : undefined,
    business: biz ? (SS.profile().answers.btype || 'Business') : '',
  });
  raw.deadlines = dl ? buildDeadlines(dl, DEMO_TODAY) : [];
  return M.applyRules(state.mem, raw);
}

export function refreshMind() { state.mem = M.rememberResults(state.mem, briefCtx(), DEMO_TODAY); saveMind(); }

/* ---------- the cards ---------- */
export const feeKey = f => 'f|' + f.date + '|' + f.client;
export const chaseKey = c => 'c|' + c.invoice;
// What the report, jury and drafts work from: the current facts minus any unticked lines.
export function view() {
  const r = state.results, d = state.data, c = state.ctx;
  const fees = d.statement ? c.fees.filter(f => !state.off.has(feeKey(f))) : undefined;
  const chase = d.invoices ? c.chase.filter(x => !state.off.has(chaseKey(x))) : undefined;
  return {
    fees, chase, subs: d.bank ? c.subs : undefined,
    feesAnon: fees && fees.map(f => ({ ...f, client: r.feeAlias[f.client] })),
    chaseAnon: chase && chase.map(x => ({ ...x, customer: r.invAlias[x.customer] })),
    statementNew: d.statement ? d.statement.filter(x => x.fee_type === 'New client fee').length : 0,
  };
}

function buildCards() {
  const r = view(), cards = [];
  if (r.fees) {
    const total = r.fees.reduce((s, f) => s + f.amount, 0);
    cards.push({
      id: 'fees', juryType: 'fees', icon: 'fee', title: 'Fee checker',
      headline: r.fees.length ? `Fresha charged ${r.fees.length} new-client fee${r.fees.length === 1 ? '' : 's'} on clients who weren't new` : 'No wrong Fresha fees left to dispute',
      detail: r.fees.length ? 'Fresha\'s own rules say these should not have been charged.' : '',
      tag: gbp(total), tagClass: 'tag-money', amount: total,
    });
  }
  if (r.chase) {
    const biz = r.chase.filter(c => c.lawApplies), cons = r.chase.filter(c => !c.lawApplies);
    const owed = biz.reduce((s, c) => s + c.amount, 0);
    const interest = biz.reduce((s, c) => s + c.interest, 0);
    const fixed = biz.reduce((s, c) => s + c.fixedSum, 0);
    cards.push({
      id: 'chase', juryType: 'chase', icon: 'chase', title: 'Money chaser',
      headline: !r.chase.length ? 'No overdue invoices to chase' : `${biz.length} business invoice${biz.length === 1 ? '' : 's'} overdue · ${gbp(owed)} + ${gbp(interest)} interest + £${fixed} fixed fees the law allows`,
      detail: cons.length ? cons.map(c => `${c.invoice} is a consumer invoice: reminder only, the late payment law doesn't cover consumers.`).join(' ') : '',
      tag: gbp(interest + fixed) + ' extra', tagClass: 'tag-money', amount: interest + fixed,
    });
  }
  if (r.subs) {
    const rise = r.subs.priceRises[0], dup = r.subs.duplicates[0];
    const parts = [];
    if (rise) parts.push(`${rise.merchant} went up from £${rise.from} to £${rise.to}`);
    if (dup) parts.push(`two ${dup.category} plans doing the same job, save ${gbp(dup.saving)}/month`);
    cards.push({
      id: 'subs', juryType: 'subs', icon: 'subs', title: 'Subscriptions',
      headline: parts.join(' · ') || 'No price rises or doubled-up plans found',
      detail: rise ? `That is ${rise.increasePct.toFixed(0)}% more than before.` : '',
      tag: dup ? gbp(dup.saving) + '/month' : 'All clear', tagClass: 'tag-money', amount: 0,
    });
  }
  cards.push({
    id: 'law', juryType: 'law', icon: 'law', title: 'New-law radar',
    headline: 'Since 6 April 2026, statutory sick pay starts from the first day off. Your staff policy is drafted.',
    detail: 'Source: ' + LAW_SOURCE,
    tag: 'New law', tagClass: 'tag-risk', amount: 0,
  });
  return cards;
}

export const SEATS_BIZ = ['law', 'money', 'wording'], SEATS_STUDENT = ['tutor', 'honesty', 'wellbeing'];

export function essayDays() {
  const b = state.results?.brief;
  return b?.deadline ? Math.round((Date.parse(b.deadline.slice(0, 10) + 'T00:00:00Z') - Date.parse(DEMO_TODAY + 'T00:00:00Z')) / 86400000) : null;
}

function buildStudentCards() {
  const r = state.results, cards = [];
  if (r.check) {
    const c = r.check, b = r.brief;
    const bits = [];
    if (c.missing.length) bits.push(c.missing.length === 1 ? '1 topic' : c.missing.length + ' topics');
    if (c.casesShort) bits.push(c.casesShort === 1 ? '1 case' : c.casesShort + ' cases');
    const who = b.unit ? `Your ${b.unit.toLowerCase()} essay` : 'Your essay';
    cards.push({
      id: 'brief', juryType: 'brief', seats: SEATS_STUDENT, icon: 'cap', title: 'Brief check',
      headline: `${who} ${bits.length ? 'is missing ' + bits.join(' and ') : 'covers every topic and has enough cases'} · ${c.wordCount} of ${b.minWords}-${b.maxWords} words`,
      detail: '', tag: c.issues.length ? things(c.issues.length) + ' to fix' : 'All clear', tagClass: c.issues.length ? 'tag-risk' : 'tag-money', amount: 0,
    });
  }
  if (r.deadlines) {
    const dl = r.deadlines, over = dl.filter(d => d.status === 'overdue').length;
    const next = dl.filter(d => d.daysLeft >= 0 && !(r.brief && d.type === 'assignment')).slice(0, 2);
    const parts = next.map(d => `${d.title} ${d.daysLeft === 0 ? 'today' : 'in ' + dayWord(d.daysLeft)}`);
    if (over) parts.push(`${over} overdue`);
    cards.push({
      id: 'deadlines', juryType: 'deadlines', seats: SEATS_STUDENT, icon: 'cal', title: 'Deadlines',
      headline: parts.join(' · ') || 'No deadlines coming up', detail: '',
      tag: dl.filter(d => d.daysLeft >= 0).length + ' coming up', tagClass: 'tag-money', amount: 0,
    });
  }
  if (r.study) {
    cards.push({
      id: 'study', icon: 'book', title: 'Study pack: negligence', study: true,
      headline: `${r.study.sources.length} trusted sources, checked links + a ${r.study.quiz.length}-question quiz`, detail: '',
      tag: 'Links checked ' + CHECKED_ON, tagClass: 'tag-money', amount: 0,
    });
  }
  if (r.deadlines) {
    const soon = r.deadlines.filter(d => d.daysLeft >= 0 && d.daysLeft <= 14);
    const span = soon.length ? Math.max(...soon.map(d => d.daysLeft)) : 0;
    cards.push({
      id: 'wellbeing', juryType: 'wellbeing', seats: SEATS_STUDENT, icon: 'heart', title: 'Wellbeing',
      headline: soon.length ? `${soon.length === 1 ? '1 deadline' : soon.length + ' deadlines'} in the next ${dayWord(span)}. Here's a calm plan: one task a day.` : 'Nothing close. A calm week, so keep one small task a day.',
      detail: '', tag: 'Calm plan', tagClass: 'tag-money', amount: 0,
    });
  }
  return cards;
}

// Where a result came from, in small mono caps (checked by code, a source, an AI opinion or a recorded answer).
const DAY_CAPS = CHECKED_ON.split(' ').slice(0, 2).join(' ').toUpperCase();
const PROV_SRC = { fees: 'FRESHA RULE', chase: 'LATE PAYMENT LAW', subs: 'YOUR BANK FILE', brief: 'YOUR BRIEF', deadlines: 'YOUR DEADLINES FILE' };
function provenance(c) {
  let p;
  if (c.id === 'law') p = `SOURCE · GOV.UK · ${DAY_CAPS}`;
  else if (c.id === 'study') p = `TRUSTED SOURCES · LINKS CHECKED ${DAY_CAPS}`;
  else if (c.id === 'wellbeing') p = `CALM PLAN · FROM YOUR FILES · ${DAY_CAPS}`;
  else p = `CHECKED BY CODE · ${PROV_SRC[c.id] || 'YOUR FILES'} · ${DAY_CAPS}`;
  const op = state.opinion[c.id];
  return op ? `${p} · ${op === 'live' ? 'AI OPINION · LOCAL MODEL' : 'RECORDED ANSWER'}` : p;
}
export function sessCardHtml(c, s) {
  if (c.job) return jobCardHtml(c, s);
  const done = (s.results.picked || []).includes(c.id);
  const btns = c.study
    ? `<button class="btn" type="button" data-card="${c.id}" data-act="open">Open</button><button class="btn primary" type="button" data-card="${c.id}" data-act="quiz">Quiz me</button>`
    : `<button class="btn primary" type="button" data-card="${c.id}" data-act="approve" ${done ? 'disabled' : ''} aria-label="Approve ${esc(c.title)}">${done ? 'Approved' : 'Approve'}</button>
       <button class="btn" type="button" data-card="${c.id}" data-act="adjust" aria-label="Adjust ${esc(c.title)}">Adjust</button>
       <button class="btn" type="button" data-card="${c.id}" data-act="escalate" aria-label="Escalate ${esc(c.title)}">Escalate</button>`;
  const status = done ? 'DONE' : c.study ? 'READY FOR YOU' : 'NEEDS YOUR EYE';
  return `<article class="card rcard ${done ? 'done' : ''}" data-cid="${esc(c.id)}">
    <p class="mono-cap status ${done ? 'ok' : c.study ? '' : 'eye'}">${status}</p>
    <div class="card-top"><span class="card-icon">${ICONS[c.icon] || ''}</span>
      <div><h3>${esc(c.headline)}</h3>${c.detail ? `<p class="detail">${esc(c.detail)}</p>` : ''}<span class="${c.tagClass} big">${esc(c.tag)}</span></div></div>
    <p class="prov mono-cap">${esc(provenance(c))}</p>
    ${c.study ? '' : `<button class="why-link" type="button" data-card="${c.id}" data-act="why" aria-label="Why? Ask the jury about ${esc(c.title)}">Why? See the jury</button>`}
    <div class="card-btns">${btns}</div></article>`;
}

export function pickCard(id) {
  const sid = SS.currentId();
  SS.markPicked(sid, id); state.justPicked.add(sid + ':' + id);
  renderHome(false);
}
// Rebuild this session's result cards from the current facts, and save them for the chat, the tree and the lists.
export function refreshCards() {
  state.cards = [...(bizChosen() ? buildCards() : []), ...(studentChosen() ? buildStudentCards() : []), ...buildJobCards()];
  syncCards();
}

// A tap on one of a result card's buttons, from the chat.
export function onCardButton(b) {
  const card = state.cards.find(c => c.id === b.dataset.card);
  if (!card) { toast('Open this session again to see that result.'); return; }
  const act = b.dataset.act;
  if (act === 'open') { pickCard(card.id); openStudy(); }
  else if (act === 'quiz') { pickCard(card.id); openQuiz(); }
  else if (act === 'why') openJury(card, true);
  else if (act === 'adjust') { if (card.job) adjustJob(card, b); else { openJury(card, false); adjustBox(); } }
  else if (act === 'escalate') openEscalate(card);
  else { pickCard(card.id); state.cheer = true; openDraft(card); }
}
