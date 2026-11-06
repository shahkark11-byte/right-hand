// The "Find me customers" job: the card, the outbox you approve, the blocked list and the replies.
// Nothing is ever sent. Approving only marks a draft as approved in this demo.
import * as SS from '../sessions.js';
import { TYPE_LABEL, buildOutbox, decideNext, handleReplies } from '../sales.js';
import { ICONS, curSession, esc, state } from './state.js';
import { sheet } from './nav.js';
import { openDraft } from './drafts.js';

const parse = t => { try { return JSON.parse(t); } catch { return null; } };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const STOPPED = 'asked not to be emailed';

/* ---------- what the job reads from its files ---------- */
export function salesOf(d) {
  const sender = d.sender ? parse(d.sender) : null;
  if (!d.leads || !sender) return null;
  const rep = handleReplies(d.replies || []);
  const out = buildOutbox(d.leads, sender, rep.suppressed);
  const consent = out.blocked.filter(b => b.why !== STOPPED);
  return { sender, rep, drafts: out.drafts, consent, stopped: out.blocked.filter(b => b.why === STOPPED) };
}
const marks = s => ({ approved: [], skipped: [], ...(s?.results?.jobs?.sales || {}) });
function saveMarks(s, m) { SS.setResults(s.id, { jobs: { ...(s.results.jobs || {}), sales: m } }); }
const nameOf = (x, email) => x.drafts.concat(x.consent, x.stopped).map(r => r.lead).find(l => l.email === email)?.name || email;

export function buildSalesCard(d) {
  const x = salesOf(d); if (!x) return null;
  const tag = `${x.consent.length} blocked: sole traders need consent first` + (x.stopped.length ? ` · ${x.stopped.length} asked us to stop` : '');
  return { id: 'customers', job: 'customers', icon: 'roles', title: 'Find me customers', headline: `${plural(x.drafts.length, 'email', 'emails')} ready for your OK`, detail: '', tag, tagClass: 'tag-money', amount: 0, urgent: false };
}

/* ---------- the card ---------- */
const fold = (title, body, open = false) => `<details class="fold"${open ? ' open' : ''}><summary>${esc(title)}</summary><div class="fold-body">${body}</div></details>`;
const lawLine = t => `<p class="law-line">${esc(t)}</p>`;
const LAWS = [
  'Privacy and Electronic Communications (EC Directive) Regulations 2003, reg 22(2) (no unsolicited marketing email to an individual subscriber, such as a sole trader, unless they have consented)',
  'Privacy and Electronic Communications (EC Directive) Regulations 2003, reg 2(1) (a corporate subscriber includes a company and a partnership in Scotland)',
  'Privacy and Electronic Communications (EC Directive) Regulations 2003, reg 23 (a marketing email must not hide the sender and must give a valid address to ask it to stop)',
];

function outboxRows(x, m) {
  return x.drafts.map(r => {
    const e = r.lead.email, st = m.approved.includes(e) ? 'Approved, not sent in this demo' : m.skipped.includes(e) ? 'Skipped' : '';
    return `<li class="out-row"><div><b>${esc(r.lead.name)}</b> <span class="tag-money stat">${esc(TYPE_LABEL[r.lead.type] || r.lead.type)}</span>
      <span class="out-fact">${esc(r.lead.fact)}</span></div>
      ${st ? `<span class="out-state">${esc(st)}</span>` : `<button class="btn" type="button" data-job="c-read" data-e="${esc(e)}" aria-label="Read and approve the email to ${esc(r.lead.name)}">Read and approve</button>`}</li>`;
  }).join('');
}
const counter = (x, m) => `Approved ${m.approved.length} of ${x.drafts.length}`;
function blockedRows(x) {
  return x.consent.map(b => `<li><b>${esc(b.lead.name)}</b><span>Sole trader: needs their consent before any marketing email.</span></li>`).join('')
    + x.stopped.map(b => `<li><b>${esc(b.lead.name)}</b><span>Asked us to stop. On the do-not-email list.</span></li>`).join('');
}
const LABEL = { interested: r => (/monday/i.test(r.text) ? 'Wants a call on Monday' : 'Is interested'), objection: () => 'Not sure yet', question: () => 'Has a question' };
function replyRows(x) {
  return x.rep.items.map(r => `<li><b>${esc(nameOf(x, r.from))}</b><span class="out-fact">${esc(r.text)}</span>
    ${r.kind === 'unsubscribe' ? `<span class="out-state">Removed. I won't email them again.</span>`
      : `<span class="tag-money stat">${esc(LABEL[r.kind](r))}</span><button class="btn" type="button" data-job="c-reply" data-e="${esc(r.from)}">Draft a reply</button>`}</li>`).join('');
}
export function nextStep(x) {
  return decideNext({ quiet: false, budgetLeft: 20, unreadReplies: x.rep.items.filter(i => i.kind !== 'unsubscribe').length, newLeads: x.drafts.length });
}
const NEXT_SAY = { sleep: 'sleep', handle_replies: 'handle replies', write_drafts: 'write drafts', find_leads: 'find new leads' };

export function salesCardHtml(c, s) {
  const d = SS.dataOf(s), x = salesOf(d), card = buildSalesCard(d); if (!x) return '';
  const m = marks(s), done = (s.results.picked || []).includes(c.id);
  return `<article class="card rcard job ${done ? 'done' : ''}" data-cid="${esc(c.id)}">
    <p class="mono-cap status ${done ? 'ok' : 'eye'}">${done ? 'DONE' : 'NEEDS YOUR EYE'} <b class="badge">EXAMPLE</b></p>
    <div class="card-top"><span class="card-icon">${ICONS.roles}</span>
      <div><h3 class="job-head">${esc(card.headline)}</h3><span class="tag-money big">${esc(card.tag)}</span></div></div>
    ${fold(`Outbox (${x.drafts.length})`, `<p class="job-sub" data-out-count aria-live="polite">${counter(x, m)}</p><ul class="dl-list" data-out-list>${outboxRows(x, m)}</ul>`, true)}
    ${fold(`Blocked (${x.consent.length})`, `<ul class="dl-list">${blockedRows(x)}</ul>`)}
    ${fold(`Replies (${x.rep.items.length})`, `<ul class="dl-list">${replyRows(x)}</ul>`, true)}
    ${fold('How Ollie works this job', `<p class="job-sub">I check every 15 minutes, 8am to 6pm on weekdays, at most 20 emails a day, and I decide the next step in code: replies first, then new drafts, then new leads. Nothing goes out without your OK.</p>
      <p class="job-sub"><b>Next step: ${esc(NEXT_SAY[nextStep(x)])}</b></p>`)}
    ${LAWS.map(lawLine).join('')}
    <p class="tiny">Ideas from the open-source sales agent Harvey (MIT licence).</p>
    <p class="prov mono-cap">PECR CHECKED BY CODE · BUSINESS TYPE FROM YOUR LIST</p>
    <div class="card-btns">
      <button class="btn primary" type="button" data-card="${c.id}" data-act="approve" ${done ? 'disabled' : ''} aria-label="Approve ${esc(card.title)}">${done ? 'Approved' : 'Approve'}</button>
      <button class="btn" type="button" data-card="${c.id}" data-act="adjust" aria-label="Adjust ${esc(card.title)}">Adjust</button>
      <button class="btn" type="button" data-card="${c.id}" data-act="escalate" aria-label="Escalate ${esc(card.title)}">Escalate</button>
    </div></article>`;
}

/* ---------- drafts, facts and steps ---------- */
const who = x => `${x.sender.name}\n${x.sender.business}`;
function replyDraft(x, r) {
  const body = r.kind === 'interested'
    ? `Hello,\n\nThank you for replying. I would be glad to call you${/monday/i.test(r.text) ? ' on Monday' : ''}. What time suits you?\n\nThank you,\n${who(x)}`
    : `Hello,\n\nThank you for telling me. If it helps, our ${x.sender.offer} is [your price] a month. Would you like a short quote to compare?\n\nThank you,\n${who(x)}\n\nDon't want emails from us? ${x.sender.optout}.`;
  return { title: `Reply to ${nameOf(x, r.from)}`, to: `To: ${r.from}`, body: `Subject: Re: your email\n\n${body}` };
}
export function salesDraft() {
  const s = curSession(), x = salesOf(state.data), m = marks(s);
  const line = r => { const e = r.lead.email, ok = m.approved.includes(e); return `${ok ? '✓' : '☐'} ${r.lead.name}: ${ok ? 'approved' : m.skipped.includes(e) ? 'skipped' : 'read it, then approve or skip'}`; };
  return { title: 'Outbox checklist', to: 'For: me', body: x.drafts.map(line).join('\n') + '\n\nThis demo never sends an email. Copy a draft and send it yourself.' };
}
export const SALES_WHO = { customers: 'adviser' };
export const SALES_QS = { customers: ['Is it right to email this list under the marketing rules?', 'Is my stop line enough for the rules?'] };
export function salesFacts() {
  const x = salesOf(state.data);
  return [`${x.drafts.length} drafts waiting for approval`, `${x.consent.length} sole traders blocked until they consent`, ...(x.stopped.length ? [`${x.stopped.length} asked us to stop`] : [])];
}
export function salesSteps(s) {
  const d = SS.dataOf(s), x = salesOf(d); if (!x) return [];
  return [`Recognised: a list of ${d.leads.length} local businesses`,
    `Checked ${d.leads.length} business types against the marketing rules · ${x.consent.length} need consent first`,
    `Drafted ${x.drafts.length} emails · none sent`,
    ...(d.replies ? [`Sorted ${x.rep.items.length} replies · ${x.stopped.length} asked us to stop`] : [])];
}

/* ---------- buttons ---------- */
export function onSalesButton(b, k) {
  const el = b.closest('[data-cid]'), s = curSession(); if (!el || !s) return;
  const d = SS.dataOf(s), x = salesOf(d), card = state.cards.find(c => c.id === el.dataset.cid), e = b.dataset.e;
  if (k === 'c-reply') { openDraft(card, replyDraft(x, x.rep.items.find(r => r.from === e))); return; }
  const r = x.drafts.find(q => q.lead.email === e); if (!r) return;
  const set = kind => {
    const m = marks(s), other = kind === 'approved' ? 'skipped' : 'approved';
    saveMarks(s, { ...m, [kind]: [...m[kind].filter(a => a !== e), e], [other]: m[other].filter(a => a !== e) });
    const now = marks(s);
    el.querySelector('[data-out-list]').innerHTML = outboxRows(x, now);
    el.querySelector('[data-out-count]').textContent = counter(x, now);
  };
  sheet.open({ icon: ICONS.roles, title: 'Email draft', headline: r.lead.name, detail: 'Not sent. This demo never sends an email.',
    html: `<p class="job-sub"><b>To:</b> ${esc(r.email.to)}</p><p class="job-sub"><b>Subject:</b> ${esc(r.email.subject)}</p><pre class="email-body">${esc(r.email.body)}</pre>` },
  [{ label: 'Approve', primary: true, fn: () => set('approved') }, { label: 'Not this one', fn: () => set('skipped') }]);
}
