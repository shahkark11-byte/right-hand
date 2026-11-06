// The jobs on the home, and the four new job cards: letter, company, website, grants.
// Cards are drawn from the session's own files, so they look the same after a reload.
import * as SS from '../sessions.js';
import { parseCSV } from '../rules.js';
import { buildSite, companyDeadlines, daysBetween, latePenalty, matchGrants, readLetter } from '../jobs.js';
import { $, CHECKED_ON, DEMO_TODAY, ICONS, curSession, dayWord, esc, gbp, longDate, state } from './state.js';
import { sheet, toast } from './nav.js';
import { openDraft } from './drafts.js';
import { SALES_QS, SALES_WHO, buildSalesCard, onSalesButton, salesCardHtml, salesDraft, salesFacts, salesSteps } from './sales-ui.js';
import { STUDY_IDS, STUDY_QS, STUDY_WHO, adjustStudy, buildStudyCards, onStudyButton, studyCardHtml, studyDraft, studyFacts, studySteps } from './study-jobs-ui.js';

/* ---------- the job list ---------- */
// files: what a job loads. A file with a kind skips detection; the rest are read by their columns, as when you add them yourself.
export const JOBS = {
  letter: { group: 'biz', icon: 'book', title: 'Explain a letter', note: 'Council, HMRC or landlord letter? I explain it in your language and catch the deadline.', session: 'Letter explained', ask: /letter/i,
    files: [{ name: 'letter_EXAMPLE.txt', kind: 'letter' }, { name: 'letter_explained_EXAMPLE.json', kind: 'letterx' }] },
  company: { group: 'biz', icon: 'law', title: 'Stop a strike-off', note: 'I watch Companies House and warn you before a deadline costs you.', session: 'Company deadlines', ask: /strike|companies house|company/i,
    files: [{ name: 'company_EXAMPLE.json', kind: 'company' }] },
  chase: { group: 'biz', icon: 'chase', title: 'Chase unpaid invoices', note: 'I chase politely and work out the interest the law allows.', ask: /invoice/i, files: [{ name: 'invoices_EXAMPLE.csv' }] },
  fees: { group: 'biz', icon: 'fee', title: 'Find wrong fees', note: "I check Fresha and Deliveroo statements for fees you shouldn't pay.", ask: /fees?|fresha/i, files: [{ name: 'fresha_statement_EXAMPLE.csv' }], clients: 'fresha_clients_EXAMPLE.csv' },
  site: { group: 'biz', icon: 'pen', title: 'Make my website', note: 'Give me your prices and hours. I build the site and keep it updated.', session: 'Website', ask: /web ?site|site/i,
    files: [{ name: 'salon_info_EXAMPLE.json', kind: 'siteinfo' }, { name: 'salon_prices_EXAMPLE.csv', kind: 'prices' }] },
  grants: { group: 'biz', icon: 'coin', title: 'Find grants', note: 'I find funding that fits, track the dates and start the form.', session: 'Grants', ask: /grants?|funding/i, files: [{ name: 'grants_EXAMPLE.csv', kind: 'grants' }] },
  customers: { group: 'biz', icon: 'roles', title: 'Find me customers', note: 'Give me a list of local businesses. I draft a personal email to each and wait for your OK.', session: 'Find customers', ask: /customers?|leads?|prospects?/i,
    files: [{ name: 'leads_EXAMPLE.csv', kind: 'leads' }, { name: 'sender_EXAMPLE.json', kind: 'sender' }, { name: 'replies_EXAMPLE.csv', kind: 'replies' }] },
  notes: { group: 'stu', icon: 'book', title: 'Turn my notes into revision', note: 'Give me your class notes. I tidy them, make flashcards and a quiz, and flag anything that looks wrong.', session: 'Revision pack', ask: /notes|revision/i,
    files: [{ name: 'notes_EXAMPLE.txt', kind: 'notes' }, { name: 'authorities_verified.json', kind: 'authorities' }] },
  essay: { group: 'stu', icon: 'cap', title: 'Check my essay against the brief', note: "I show what's missing before you hand it in.", ask: /essay/i, files: [{ name: 'brief_EXAMPLE.txt' }, { name: 'draft_EXAMPLE.txt' }] },
  deadlines: { group: 'stu', icon: 'cal', title: 'My deadlines', note: "Everything that's due, in order.", ask: /deadlines?/i, files: [{ name: 'deadlines_EXAMPLE.csv' }] },
  deposit: { group: 'stu', icon: 'law', title: 'Get my deposit back', note: 'Send me your lease. I check the deposit was protected and count down your deadline.', session: 'Deposit', ask: /deposit|lease|tenanc/i, files: [{ name: 'lease_EXAMPLE.json', kind: 'lease' }] },
  bursary: { group: 'stu', icon: 'coin', title: 'Check my bursary', note: 'Snap your funding letter. I put the dates in your calendar and chase a missing payment.', session: 'Bursary', ask: /bursary|funding/i,
    files: [{ name: 'bursary_letter_EXAMPLE.txt', kind: 'funding' }, { name: 'bank_payments_EXAMPLE.csv', kind: 'bankpay' }] },
  payslip: { group: 'stu', icon: 'fee', title: 'Check my payslip', note: 'Snap your payslip. I check your pay, holiday and tax code.', session: 'Payslip', ask: /pay ?slip|wage/i, files: [{ name: 'payslip_EXAMPLE.json', kind: 'payslip' }] },
  subs: { group: '', icon: 'subs', title: 'Subscriptions', note: 'Price rises and doubled-up plans', ask: /subscriptions?/i, files: [{ name: 'bank_EXAMPLE.csv' }] },
};
export const JOB_LABEL = { letter: 'letter', letterx: 'letter explanation', company: 'company record', siteinfo: 'shop details', prices: 'price list', grants: 'grants list', notes: 'class notes', authorities: 'verified authorities', lease: 'tenancy', funding: 'funding letter', bankpay: 'bank export', payslip: 'payslip', leads: 'list of businesses', sender: 'sender details', replies: 'replies' };
const GROUPS = { biz: ['letter', 'company', 'chase', 'fees', 'site', 'grants', 'customers'], stu: ['notes', 'essay', 'deadlines', 'deposit', 'bursary', 'payslip'] };

// A job's file as the session stores it: tables as rows, everything else as text.
export function jobFile(e) {
  return ['prices', 'grants', 'bankpay', 'leads', 'replies'].includes(e.kind) ? { kind: e.kind, rows: parseCSV(e.text) } : { kind: e.kind, text: e.text };
}
// A typed "start the subscriptions check" finds its job.
export function jobFromChat(text) {
  if (!/^\s*(please )?(start|run|try|open|do)\b/i.test(text)) return '';
  return Object.keys(JOBS).find(k => JOBS[k].ask.test(text)) || '';
}

/* ---------- the home ---------- */
const jobCard = k => `<button class="jobcard" type="button" data-start="${k}"><span class="card-icon">${ICONS[JOBS[k].icon]}</span><span class="job-text"><b>${esc(JOBS[k].title)}</b><span>${esc(JOBS[k].note)}</span></span></button>`;
// Who you said you are decides the order: your side first, the other side folded away below it.
export function homeEl(roles) {
  const stu = roles.includes('student'), biz = roles.includes('business') || !stu;
  const group = (key, heading, open, fold, extra = '') => `<div class="jobs-group">
      ${fold ? `<button class="jobs-toggle mono-cap" type="button" data-fold aria-expanded="${open}">${heading}<i aria-hidden="true"></i></button>` : `<h3 class="mono-cap">${heading}</h3>`}
      <div class="jobs-grid" ${open ? '' : 'hidden'}>${GROUPS[key].map(jobCard).join('')}${extra}</div></div>`;
  const more = `<p class="jobs-more">More student jobs are on the way. Tell me what you need and I'll add it.</p><button class="btn" type="button" data-start="tell">Tell Ollie</button>`;
  const stuG = (open, fold) => group('stu', 'For students', open, fold, more);
  const el = document.createElement('section');
  el.className = 'jobs-home'; el.setAttribute('aria-label', 'What can your intern do?');
  el.innerHTML = `<p class="jobs-empty">Drop a file or pick a job.</p><h2 class="mini-h">What can your intern do?</h2>`
    + (stu && !biz ? stuG(true, false) + group('biz', 'For businesses', false, true)
      : stu ? group('biz', 'For your business', true, false) + stuG(true, false)
      : group('biz', 'For your business', true, false) + stuG(false, true));
  return el;
}
export function onHomeClick(e) {
  const f = e.target.closest('[data-fold]');
  if (!f) return false;
  const grid = f.nextElementSibling, open = grid.hidden;
  grid.hidden = !open; f.setAttribute('aria-expanded', String(open));
  return true;
}

/* ---------- per-session job state (language, who is applying, edited prices) ---------- */
const jobsOf = s => ({ lang: 'en', org: 'charity', prices: {}, ...(s?.results?.jobs || {}) });
const saveJobs = (s, patch) => SS.setResults(s.id, { jobs: { ...jobsOf(s), ...patch } });
const parse = t => { try { return JSON.parse(t); } catch { return null; } };
export const signName = () => (state.mem.facts.name?.value || '').trim() || '[Your name]';

const longMonth = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const pounds = n => '£' + Number(n).toLocaleString('en-GB');
const daysLeft = n => (n > 1 ? `${n} days left` : n === 1 ? '1 day left' : n === 0 ? 'Due today' : `${dayWord(-n)} late`);
const senderOf = from => { const n = String(from || '').split(',')[0].trim(); return /^Your /.test(n) ? 'Your ' + n.slice(5).toLowerCase() : n; };
const pricesOf = (d, js) => (d.prices || []).map(r => ({ ...r, price: js.prices[r.service] ?? r.price }));
const ORGS = [['charity', 'Charity'], ['business', 'Business'], ['school', 'School']];
const orgName = t => (ORGS.find(o => o[0] === t) || ORGS[0])[1];

/* ---------- what each job knows about itself ---------- */
function letterOf(d) { return d.letter ? readLetter(d.letter) : null; }
function companyOf(d) { const c = d.company ? parse(d.company) : null; return c ? companyDeadlines(c, DEMO_TODAY) : null; }
function grantsHeads(m) {
  const first = m.open.length === 0 ? 'No grant fits you right now'
    : m.open.length === 1 ? `1 grant fits you now: ${m.open[0].name}, up to ${pounds(m.open[0].max)}, closes in ${dayWord(m.open[0].daysLeft)}`
    : `${m.open.length} grants fit you now, the first closes in ${dayWord(m.open[0].daysLeft)}`;
  const sub = m.soon.length === 0 ? '' : m.soon.length === 1 ? `1 opens soon: ${m.soon[0].name}, in ${dayWord(m.soon[0].opensIn)}` : `${m.soon.length} open soon, the first in ${dayWord(m.soon[0].opensIn)}`;
  return { first, sub };
}

const DESCRIBE = {
  letter(d) {
    const l = letterOf(d); if (!l) return null;
    const days = l.deadline ? daysBetween(DEMO_TODAY, l.deadline) : null;
    const who = senderOf(l.from) || 'A letter';
    const headline = l.amount !== null && l.deadline ? `${who} wants ${gbp(l.amount)} by ${longMonth(l.deadline)}` : `${who} sent you a letter${l.subject ? ': ' + l.subject : ''}`;
    return { title: 'Letter explained', icon: 'book', headline, tag: days === null ? 'No deadline found' : daysLeft(days), urgent: days !== null && days <= 14 };
  },
  company(d) {
    const c = companyOf(d); if (!c) return null;
    const acc = c.items.find(i => i.what === 'Accounts');
    const headline = !acc ? `${c.name}: nothing due` : acc.overdue ? `${c.name}: accounts are ${dayWord(-acc.daysLeft)} late` : `${c.name}: accounts are due in ${dayWord(acc.daysLeft)}`;
    return { title: 'Company deadlines', icon: 'law', headline, tag: acc && acc.overdue ? `Penalty if filed today: ${pounds(acc.penalty)}` : 'No penalty yet', urgent: c.strikeOff || !!(acc && acc.overdue) };
  },
  site(d, js) {
    if (!d.siteinfo || !d.prices) return null;
    return { title: 'Website', icon: 'pen', headline: 'Your website is ready', tag: `${d.prices.length} prices on the page`, urgent: false };
  },
  grants(d, js) {
    if (!d.grants) return null;
    const m = matchGrants(d.grants, { type: js.org }, DEMO_TODAY), h = grantsHeads(m);
    return { title: 'Grants', icon: 'coin', headline: h.first, sub: h.sub, tag: `${m.open.length} open · ${m.soon.length} soon`, urgent: false };
  },
};
// The result cards for the session now open (called from results.js).
export function buildJobCards() {
  const s = curSession(), js = jobsOf(s), out = [];
  for (const k of Object.keys(DESCRIBE)) {
    const x = DESCRIBE[k](state.data, js); if (!x) continue;
    out.push({ id: k, job: k, icon: x.icon, title: x.title, headline: x.headline, detail: x.sub || '', tag: x.tag, tagClass: x.urgent ? 'tag-risk' : 'tag-money', amount: 0, urgent: x.urgent });
  }
  const sales = buildSalesCard(state.data);
  return [...out, ...(sales ? [sales] : []), ...buildStudyCards(state.data)];
}

/* ---------- drawing a card ---------- */
const DAY_CAPS = CHECKED_ON.split(' ').slice(0, 2).join(' ').toUpperCase();
const PENALTY_URL = 'https://www.gov.uk/government/publications/late-filing-penalties-from-companies-house/late-filing-penalties';
const IMMIGRATION = 'I explain what a letter says. For immigration letters I explain only and point you to a qualified adviser: Immigration and Asylum Act 1999, s84 (no one may give immigration advice unless they are qualified).';

function letterBlock(d, lang) {
  const set = parse(d.letterx)?.languages || [];
  const cur = set.find(x => x.code === lang) || set[0];
  if (!cur) return '<p class="tiny">No explanation file with this letter.</p>';
  return `<div class="explain" dir="${cur.dir}" lang="${cur.code}">${cur.lines.map(t => `<p>${esc(t)}</p>`).join('')}</div>
    <div class="chips lang" role="group" aria-label="Language">${set.map(x => `<button class="chip" type="button" data-job="lang" data-v="${x.code}" aria-pressed="${x.code === cur.code}">${esc(x.label)}</button>`).join('')}</div>
    <p class="tiny">Translation by AI. Shahkar checks it before real use.</p>
    <div class="card-btns job-btns"><button class="btn" type="button" data-job="ics">Add to my calendar</button><button class="btn" type="button" data-job="reply">Draft a reply</button></div>`;
}
function companyBlock(d) {
  const c = companyOf(d);
  const row = i => `<li class="${i.overdue ? 'over' : ''}"><b>${esc(i.what)}</b><span>${i.overdue ? `was due ${longDate(i.due)}, ${dayWord(-i.daysLeft)} late${i.penalty ? `, ${pounds(i.penalty)} if filed today` : ''}` : `due ${longDate(i.due)}, ${i.daysLeft === 0 ? 'today' : 'in ' + dayWord(i.daysLeft)}`}</span></li>`;
  return `${c.strikeOff ? '<p class="alert-line">Companies House has proposed striking the company off.</p>' : ''}<ul class="dl-list">${c.items.map(row).join('')}</ul>
    <p class="tiny">Why? Companies Act 2006, s1000 (Companies House can strike off a company it believes is not carrying on business).</p>`;
}
const siteHtml = (d, js) => buildSite(parse(d.siteinfo) || {}, pricesOf(d, js));
function siteBlock(d, js) {
  return `<div class="site-prev"><iframe title="Preview of your website" sandbox srcdoc="${esc(siteHtml(d, js))}"></iframe></div>
    <p class="mono-cap site-label">EXAMPLE · built by code from your price list</p>
    <div class="card-btns job-btns"><button class="btn" type="button" data-job="open">Open full page</button><button class="btn" type="button" data-job="price">Change a price</button></div>`;
}
function grantRows(d, org) {
  const m = matchGrants(d.grants, { type: org }, DEMO_TODAY);
  const row = (g, when) => `<li><div><b>${esc(g.name)}</b><span>Up to ${pounds(g.max)} · ${when} <b class="badge">EXAMPLE</b></span>
      <a href="${esc(g.link)}" target="_blank" rel="noopener">Read the details</a></div><button class="btn" type="button" data-job="form" data-g="${esc(g.name)}">Start the form</button></li>`;
  const all = [...m.open.map(g => row(g, `closes ${longDate(g.closes)}`)), ...m.soon.map(g => row(g, `opens ${longDate(g.opens)}`))];
  return all.length ? all.join('') : '<li><span>Nothing fits this type of group in the next 60 days.</span></li>';
}
function grantsBlock(d, js) {
  return `<div class="chips org" role="group" aria-label="Who is applying">${ORGS.map(([v, l]) => `<button class="chip" type="button" data-job="org" data-v="${v}" aria-pressed="${v === js.org}">${l}</button>`).join('')}</div>
    <ul class="grant-list">${grantRows(d, js.org)}</ul>`;
}

const BLOCK = { letter: letterBlock, company: companyBlock, site: siteBlock, grants: grantsBlock };
const PROV = {
  letter: () => 'READ FROM THE LETTER · DATE AND AMOUNT FOUND BY CODE',
  company: () => `<a href="${PENALTY_URL}" target="_blank" rel="noopener">COMPANIES HOUSE PENALTY TABLE · GOV.UK, UPDATED 16 JAN 2026</a>`,
  site: () => 'BUILT BY CODE · YOUR SHOP DETAILS AND PRICE LIST · EXAMPLE',
  grants: () => `CHECKED BY CODE · EXAMPLE GRANTS LIST · ${DAY_CAPS}`,
};

export function jobCardHtml(c, s) {
  if (STUDY_IDS.includes(c.job)) return studyCardHtml(c, s);
  if (c.job === 'customers') return salesCardHtml(c, s);
  const d = SS.dataOf(s), js = jobsOf(s), x = DESCRIBE[c.job](d, js);
  if (!x) return '';
  const done = (s.results.picked || []).includes(c.id);
  const block = c.job === 'letter' ? letterBlock(d, js.lang) : BLOCK[c.job](d, js);
  return `<article class="card rcard job ${done ? 'done' : ''}" data-cid="${esc(c.id)}">
    <p class="mono-cap status ${done ? 'ok' : 'eye'}">${done ? 'DONE' : 'NEEDS YOUR EYE'} <b class="badge">EXAMPLE</b></p>
    <div class="card-top"><span class="card-icon">${ICONS[x.icon] || ''}</span>
      <div><h3 class="job-head">${esc(x.headline)}</h3>${x.sub ? `<p class="detail job-sub">${esc(x.sub)}</p>` : ''}<span class="${x.urgent ? 'tag-risk' : 'tag-money'} big">${esc(x.tag)}</span></div></div>
    ${block}
    <p class="prov mono-cap">${PROV[c.job]()}</p>
    ${c.job === 'letter' ? `<p class="tiny">${esc(IMMIGRATION)}</p>` : ''}
    <div class="card-btns">
      <button class="btn primary" type="button" data-card="${c.id}" data-act="approve" ${done ? 'disabled' : ''} aria-label="Approve ${esc(x.title)}">${done ? 'Approved' : 'Approve'}</button>
      <button class="btn" type="button" data-card="${c.id}" data-act="adjust" aria-label="Adjust ${esc(x.title)}">Adjust</button>
      <button class="btn" type="button" data-card="${c.id}" data-act="escalate" aria-label="Escalate ${esc(x.title)}">Escalate</button>
    </div></article>`;
}

/* ---------- buttons on the cards ---------- */
const icsText = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = l => { const out = []; let rest = l; while (rest.length > 70) { out.push(rest.slice(0, 70)); rest = ' ' + rest.slice(70); } out.push(rest); return out.join('\r\n'); };
// A calendar file with one all-day event on the deadline.
export function buildIcs(l) {
  const day = l.deadline.replaceAll('-', ''), next = new Date(Date.parse(l.deadline + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10).replaceAll('-', '');
  const title = `${l.subject || 'Letter deadline'}${l.amount !== null ? ': pay ' + gbp(l.amount) : ''}`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Unpaid Intern//Demo//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:letter-${day}@unpaid-intern.example`, `DTSTAMP:${DEMO_TODAY.replaceAll('-', '')}T000000Z`, `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText(`From ${l.from || 'your letter'}. ${l.action || ''} Added by Unpaid Intern (EXAMPLE).`.replace(/\s+/g, ' '))}`,
    'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// One calendar file with an all-day event for each { uid, date, title, note }.
export function ics(events) {
  const stamp = `DTSTAMP:${DEMO_TODAY.replaceAll('-', '')}T000000Z`;
  const ev = e => {
    const day = e.date.replaceAll('-', ''), next = new Date(Date.parse(e.date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10).replaceAll('-', '');
    return ['BEGIN:VEVENT', `UID:${e.uid}@unpaid-intern.example`, stamp, `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${icsText(e.title)}`, `DESCRIPTION:${icsText(e.note)}`, 'END:VEVENT'];
  };
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Unpaid Intern//Demo//EN', 'CALSCALE:GREGORIAN', ...events.flatMap(ev), 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
const SIGN = () => `Thank you,\n${signName()}`;
function replyDraft(l) {
  return { title: 'Reply to your letter', to: `To: ${l.from || 'the sender'}`,
    body: `Subject: Re: ${l.subject || 'your letter'}\n\nHello,\n\nI am writing about your letter${l.subject ? ` "${l.subject}"` : ''}.${l.amount !== null && l.deadline ? ` It asks me to pay ${gbp(l.amount)} by ${longMonth(l.deadline)}.` : ''}\n\nI may not be able to pay by then. Could you tell me what help is available, or agree to give me more time? Please reply in writing.\n\n${SIGN()}` };
}
function grantDraft(g, org) {
  return { title: `Application: ${g.name}`, to: `To: ${g.name}, applications team (EXAMPLE)`,
    body: `Subject: Application to ${g.name}\n\nHello,\n\nI am writing to apply to the ${g.name} (up to ${pounds(g.max)}, ${g.daysLeft !== undefined ? 'closes ' + longDate(g.closes) : 'opens ' + longDate(g.opens)}).\n\nType of group: ${orgName(org)}\nName of group: [name of your group]\nWhat the money is for: [two sentences on what you would do with it]\nAmount we are asking for: £[amount]\n\nThe details are at ${g.link}\n\n${SIGN()}` };
}

// Approve writes a draft or checklist; Escalate writes the questions for a person.
export function jobDraft(card) {
  const s = curSession(), d = state.data, js = jobsOf(s), box = t => '☐ ' + t;
  if (STUDY_IDS.includes(card.job)) return studyDraft(card);
  if (card.job === 'customers') return salesDraft();
  if (card.job === 'letter') return replyDraft(letterOf(d));
  if (card.job === 'company') {
    const c = companyOf(d), acc = c.items.find(i => i.what === 'Accounts');
    return { title: 'Company to-do list', to: 'For: me and my accountant',
      body: [acc && acc.overdue && box(`File the accounts now. They are ${dayWord(-acc.daysLeft)} late and the penalty is ${pounds(acc.penalty)} if filed today.`),
        c.strikeOff && box('Answer the Companies House strike-off notice before it goes ahead.'),
        ...c.items.filter(i => !i.overdue).map(i => box(`${i.what}: due ${longDate(i.due)}.`))].filter(Boolean).join('\n') + '\n\nThis list says what to do. Nothing is filed by this demo.' };
  }
  if (card.job === 'site') {
    return { title: 'Website checklist', to: 'For: me',
      body: [box('Read the whole page on your phone.'), ...pricesOf(d, js).map(r => box(`Check ${r.service}: £${Number(r.price).toFixed(2)}`)), box('Check the opening hours and phone number.')].join('\n') + '\n\nThis demo does not publish anything. Open the full page to check it first.' };
  }
  const m = matchGrants(d.grants, { type: js.org }, DEMO_TODAY), g = m.open[0] || m.soon[0];
  return g ? grantDraft(g, js.org) : { title: 'Grant application', to: 'For: me', body: `No grant fits a ${orgName(js.org).toLowerCase()} right now, so there is nothing to apply for yet.` };
}
export const JOB_WHO = { letter: 'adviser', company: 'accountant', site: 'web designer', grants: 'adviser', ...SALES_WHO, ...STUDY_WHO };
export const JOB_QS = {
  letter: ['Have I understood what the letter asks me to do?', 'Can I ask for more time or a payment plan?'],
  company: ['Can the accounts still be filed before the strike-off goes ahead?', 'Can the late filing penalty be reduced?'],
  site: ['Are my prices and hours right for the page?', 'Where should the site be hosted?'],
  grants: ['Does my group really fit this fund?', 'What should the application say first?'],
  ...SALES_QS,
  ...STUDY_QS,
};
export function jobFacts(card) {
  const s = curSession(), d = state.data, js = jobsOf(s);
  if (STUDY_IDS.includes(card.job)) return studyFacts(card);
  if (card.job === 'customers') return salesFacts();
  if (card.job === 'letter') { const l = letterOf(d); return [l.action, l.deadline && `Deadline: ${longMonth(l.deadline)}`].filter(Boolean); }
  if (card.job === 'company') { const c = companyOf(d); return [c.strikeOff && 'Companies House has proposed striking the company off.', ...c.items.map(i => `${i.what}: due ${longDate(i.due)}${i.overdue ? `, ${dayWord(-i.daysLeft)} late, ${pounds(i.penalty)} if filed today` : ''}`)].filter(Boolean); }
  if (card.job === 'site') return pricesOf(d, js).map(r => `${r.service}: £${Number(r.price).toFixed(2)}`);
  const m = matchGrants(d.grants, { type: js.org }, DEMO_TODAY);
  return [...m.open.map(g => `${g.name}: up to ${pounds(g.max)}, closes ${longDate(g.closes)}`), ...m.soon.map(g => `${g.name}: opens ${longDate(g.opens)}`)];
}

// The lines in Ollie's working panel: real counts for each job.
export function jobSteps(s) {
  const d = SS.dataOf(s), js = jobsOf(s), out = [...studySteps(s), ...salesSteps(s)];
  const l = letterOf(d), c = companyOf(d);
  if (l) {
    out.push(`Found ${l.amount !== null ? 'the amount ' + gbp(l.amount) : 'no amount'} and ${l.deadline ? 'the deadline ' + longMonth(l.deadline) : 'no deadline'} · by code`);
    if (l.deadline) out.push(`Counted ${dayWord(daysBetween(DEMO_TODAY, l.deadline))} from today`);
    const set = parse(d.letterx)?.languages || [];
    if (set.length) out.push(`Matched ${set.length} languages · ${set[0].lines.length} lines each`);
  }
  if (c) {
    out.push(`Checked ${c.items.length} Companies House dates · ${c.items.filter(i => i.overdue).length} overdue`);
    const acc = c.items.find(i => i.what === 'Accounts');
    if (acc && acc.overdue) out.push(`Looked up the penalty table · ${pounds(acc.penalty)} if filed today`);
    out.push(`Gazette notice: ${c.strikeOff ? 'found' : 'none'}`);
  }
  if (d.siteinfo && d.prices) out.push(`Built the page from ${d.prices.length} prices · ${siteHtml(d, js).length.toLocaleString('en-GB')} characters of HTML`);
  if (d.grants) {
    const m = matchGrants(d.grants, { type: js.org }, DEMO_TODAY);
    out.push(`Matched ${d.grants.length} grants to a ${orgName(js.org).toLowerCase()} · ${m.open.length} open, ${m.soon.length} opening soon`);
  }
  return out;
}

/* ---------- clicks ---------- */
const cardEl = b => b.closest('[data-cid]');
function paintGrants(el, s, org) {
  const d = SS.dataOf(s), m = matchGrants(d.grants, { type: org }, DEMO_TODAY), h = grantsHeads(m);
  el.querySelector('.job-head').textContent = h.first;
  let sub = el.querySelector('.job-sub');
  if (h.sub && !sub) { sub = document.createElement('p'); sub.className = 'detail job-sub'; el.querySelector('.job-head').after(sub); }
  if (sub) { sub.textContent = h.sub; sub.hidden = !h.sub; }
  el.querySelector('.tag-money').textContent = `${m.open.length} open · ${m.soon.length} soon`;
  el.querySelector('.grant-list').innerHTML = grantRows(d, org);
  el.querySelectorAll('[data-job="org"]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === org)));
}
function changePrice(s, el) {
  const d = SS.dataOf(s), js = jobsOf(s), rows = pricesOf(d, js);
  const inputs = rows.map(r => `<label class="price-row"><span>${esc(r.service)}</span><input type="text" inputmode="decimal" data-price="${esc(r.service)}" value="${Number(r.price).toFixed(2)}" aria-label="Price for ${esc(r.service)}"></label>`).join('');
  sheet.open({ icon: ICONS.coin, title: 'Change a price', headline: 'What do you charge now?', detail: 'EXAMPLE prices. Save and the page updates.', html: `<div class="price-form">${inputs}</div>` }, [{
    label: 'Save', primary: true, fn() {
      const prices = { ...js.prices }, changed = [];
      $('sheet').querySelectorAll('[data-price]').forEach(i => {
        const v = Number(i.value.replace(/[£\s]/g, '')), old = rows.find(r => r.service === i.dataset.price);
        if (Number.isFinite(v) && v >= 0 && v.toFixed(2) !== Number(old.price).toFixed(2)) { prices[i.dataset.price] = v.toFixed(2); changed.push(`${gbp(v)} for ${i.dataset.price}`); }
      });
      if (!changed.length) { toast('No price changed.'); return; }
      saveJobs(s, { prices });
      el.querySelector('iframe').srcdoc = siteHtml(d, jobsOf(s));
      toast(`Updated. Your site now shows ${changed.length > 2 ? changed.slice(0, 2).join(', ') + ' and ' + (changed.length - 2) + ' more' : changed.join(' and ')}.`);
    },
  }]);
}
function whatIf() {
  const acc = companyOf(state.data).items.find(i => i.what === 'Accounts');
  sheet.open({ icon: ICONS.cal, title: 'Adjust', headline: 'If you file on…', detail: 'EXAMPLE company. Pick a date to see the penalty.',
    html: `<label class="price-row"><span>Filing date</span><input type="date" data-whatif value="${DEMO_TODAY}" aria-label="Filing date"></label><p class="job-sub" data-whatif-out aria-live="polite"></p>` }, [{ label: 'Done', primary: true, fn() {} }]);
  const inp = $('sheet').querySelector('[data-whatif]'), out = $('sheet').querySelector('[data-whatif-out]');
  const show = () => { out.textContent = inp.value ? `Filed on ${longDate(inp.value)}: ${latePenalty(acc.due, inp.value) ? 'penalty ' + pounds(latePenalty(acc.due, inp.value)) : 'no penalty'}.` : ''; };
  inp.addEventListener('input', show); show();
}
// The extra "Adjust" for the job cards: the thing you can change on each one.
export function adjustJob(card, btn) {
  const el = cardEl(btn), s = curSession();
  if (STUDY_IDS.includes(card.job) || card.job === 'customers') adjustStudy(btn);
  else if (card.job === 'company') whatIf();
  else if (card.job === 'site') changePrice(s, el);
  else el.querySelector('.chip')?.focus();
}
export function onJobButton(b) {
  const el = cardEl(b), s = curSession(); if (!el || !s) return;
  const d = SS.dataOf(s), js = jobsOf(s), card = state.cards.find(c => c.id === el.dataset.cid), k = b.dataset.job;
  if (k.startsWith('s-')) { onStudyButton(b, k); return; }
  if (k.startsWith('c-')) { onSalesButton(b, k); return; }
  if (k === 'lang') {
    const set = parse(d.letterx).languages, cur = set.find(x => x.code === b.dataset.v), box = el.querySelector('.explain');
    box.dir = cur.dir; box.lang = cur.code; box.innerHTML = cur.lines.map(t => `<p>${esc(t)}</p>`).join('');
    el.querySelectorAll('[data-job="lang"]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    saveJobs(s, { lang: cur.code });
  } else if (k === 'ics') {
    const l = letterOf(d);
    if (!l.deadline) { toast('I did not find a date in this letter.'); return; }
    download(`letter-deadline-${l.deadline}.ics`, buildIcs(l), 'text/calendar');
    toast(`Calendar file saved for ${longMonth(l.deadline)}. Open it to add the date.`);
  } else if (k === 'reply') openDraft(card, replyDraft(letterOf(d)));
  else if (k === 'open') window.open(URL.createObjectURL(new Blob([siteHtml(d, js)], { type: 'text/html' })), '_blank', 'noopener');
  else if (k === 'price') changePrice(s, el);
  else if (k === 'org') { saveJobs(s, { org: b.dataset.v }); paintGrants(el, s, b.dataset.v); }
  else if (k === 'form') {
    const m = matchGrants(d.grants, { type: js.org }, DEMO_TODAY), g = [...m.open, ...m.soon].find(x => x.name === b.dataset.g);
    if (g) openDraft(card, grantDraft(g, js.org));
  }
}
