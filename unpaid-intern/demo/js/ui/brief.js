// The morning brief: Ollie speaks first.
import * as M from '../mind.js';
import * as SS from '../sessions.js';
import { companyDeadlines, daysBetween, matchGrants, readLetter } from '../jobs.js';
import { $, DEMO_TODAY, dayWord, esc, gbp, state, things } from './state.js';
import { briefCtx } from './results.js';
import { toast } from './nav.js';
import { openSession } from './sessions-ui.js';
import { openJury } from './jury-ui.js';
import { handleReplies } from '../sales.js';
import { depositOf, fundingOf } from './study-jobs-ui.js';

// Your role decides what the brief talks about: students hear about essays and dates, everyone else about the business.
const STUDENT_CARDS = ['deadlines', 'brief', 'notes', 'deposit', 'bursary', 'payslip'];
const parse = t => { try { return JSON.parse(t); } catch { return null; } };

// Deadlines inside the jobs you have run (letter, company, grants, deposit, bursary): the newest session holding each file speaks.
function jobNotices() {
  const out = [], latest = k => {
    for (const s of SS.allSessions().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) { const d = SS.dataOf(s); if (d[k]) return { s, d }; }
    return null;
  };
  const add = (id, card, priority, text) => out.push({ id: 'job:' + id, card, priority, text });
  const lt = latest('letter');
  if (lt) {
    const l = readLetter(lt.d.letter), days = l.deadline ? daysBetween(DEMO_TODAY, l.deadline) : -1;
    const first = String(l.from || '').split(',')[0].trim(), who = /^Your /.test(first) ? 'Your ' + first.slice(5).toLowerCase() : first || 'A letter';
    if (l.amount !== null && days >= 0) add('letter', 'letter', 79 - days / 2, `${who} wants ${gbp(l.amount)} in ${dayWord(days)}.`);
  }
  const co = latest('company'), c = co && parse(co.d.company);
  const acc = c && companyDeadlines(c, DEMO_TODAY).items.find(i => i.what === 'Accounts');
  if (acc && acc.overdue) add('company', 'company', 84, `${c.name}'s accounts are ${dayWord(-acc.daysLeft)} late.`);
  const gr = latest('grants');
  if (gr) { const g = matchGrants(gr.d.grants, { type: gr.s.results.jobs?.org || 'charity' }, DEMO_TODAY).open[0]; if (g) add('grants', 'grants', 50, `${g.name} closes in ${dayWord(g.daysLeft)}.`); }
  const dep = latest('lease'), dc = dep && depositOf(dep.d);
  if (dc && !dc.protected && dc.daysLeft > 0) add('deposit', 'deposit', 76, `${dayWord(dc.daysLeft)} left to claim your deposit back.`);
  const bu = latest('funding'), fc = bu && fundingOf(bu.d), miss = fc && fc.hasBank && fc.payments.find(p => p.status === 'missing');
  if (miss) add('bursary', 'bursary', 83, `Your ${new Date(miss.date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })} bursary payment hasn't arrived.`);
  const sl = latest('leads'), rp = sl && sl.d.replies && handleReplies(sl.d.replies).items;
  const need = rp ? rp.filter(r => r.kind !== 'unsubscribe') : [], call = need.filter(r => r.kind === 'interested').length;
  if (need.length) add('customers', 'customers', 81, `${need.length} ${need.length === 1 ? 'reply' : 'replies'} about your emails need${need.length === 1 ? 's' : ''} you.${call ? ` ${call} want${call === 1 ? 's' : ''} a call.` : ''}`);
  return out;
}
function roleOf() {
  const roles = SS.profile().roles, stu = roles.includes('student'), biz = roles.includes('business') || !stu;
  return stu && !biz ? 'student' : stu ? 'both' : 'business';
}
export function openBrief() {
  const role = roleOf(), all = [...M.notices(state.mem, briefCtx(), DEMO_TODAY), ...jobNotices()].sort((a, b) => b.priority - a.priority);
  const items = role === 'both' ? all : all.filter(n => STUDENT_CARDS.includes(n.card) === (role === 'student'));
  state.brief = { open: true, dismissed: new Set(), items, role, expanded: false };
}
export function briefEl() {
  const b = state.brief, first = (state.mem.facts.name?.value || '').trim();
  const left = b.items.filter(n => !b.dismissed.has(n.id)), shown = b.expanded ? left : left.slice(0, 2), more = left.length - shown.length;
  const weekday = new Date(DEMO_TODAY + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }).toUpperCase();
  const empty = !b.items.length, ask = empty && b.role === 'student';
  // With items to show, the items speak for themselves: the brief stays inside its 38.2%.
  const line = ask ? 'Nothing is due this week. Want me to check your essay against the brief?'
    : empty ? 'Nothing needs you right now. I am keeping an eye on things.'
    : !left.length ? "That's everything for now. I'll keep an eye on things." : '';
  const wrap = document.createElement('section');
  wrap.className = 'brief' + (b.expanded ? ' open' : ''); wrap.setAttribute('aria-label', "Ollie's morning brief");
  wrap.innerHTML = `
    <div class="brief-top">
      <div><p class="mono-cap">${weekday} · WHILE YOU SLEPT</p>
        <h2 class="brief-h">Good morning${first ? ', ' + esc(first) : ''}.</h2>
        ${line ? `<p class="brief-line">${esc(line)}</p>` : ''}</div>
      <span class="ollie sm p3 brief-ollie" role="img" aria-label="Ollie"></span>
    </div>
    ${ask ? '<div class="notices"><button class="btn primary" type="button" data-bjob="essay">Check my essay</button></div>' : ''}
    ${shown.length ? `<ul class="notices">${shown.map(n => `<li><button class="notice-open" type="button" data-bopen="${esc(n.id)}" title="Open"><span>${esc(n.text)}</span></button>
      <button class="notice-later" type="button" data-blater="${esc(n.id)}" aria-label="Not now" title="Not now">×</button></li>`).join('')}</ul>` : ''}
    <div class="brief-foot">
      ${more > 0 ? `<button class="linkbtn" type="button" data-bmore>and ${more} more</button>` : ''}
      <button class="linkbtn brief-know" type="button" data-know>Ollie knows ${things(M.knowledgeList(state.mem).length)}</button>
    </div>`;
  return wrap;
}
export function repaintBrief() { const old = $('sThread').querySelector('.brief'); if (old) old.replaceWith(briefEl()); }
// Open: the jury for that card (in the session that holds it), or the session if the card has no jury.
export function openNotice(n) {
  const holders = SS.allSessions().filter(s => (s.results.cards || []).some(c => c.id === n.card) && (n.card !== 'law' || s.pack === 'law'))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (!holders.length) { toast("I can't find that one right now. Add the file in a session first."); return; }
  openSession(holders[0].id);
  const card = state.cards && state.cards.find(c => c.id === n.card);
  if (card && card.juryType) openJury(card, false);
}
