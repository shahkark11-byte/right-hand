// The four student job cards (revision pack, deposit, bursary, payslip) and the "Recognised:" step.
// Cards are drawn from the session's own files, so they look the same after a reload.
import * as SS from '../sessions.js';
import { readLetter } from '../jobs.js';
import { parseBrief } from '../student.js';
import { checkAuthorities, classifyMaterial, findAuthorities, makeFlashcards, makeQuiz, openBookIndex, parseNotes, studyPlan } from '../study.js';
import { depositCheck, fundingCheck, payslipCheck } from '../student_jobs.js';
import { DEMO_TODAY, ICONS, curSession, dayWord, esc, gbp, longDate, state } from './state.js';
import { toast } from './nav.js';
import { openDraft } from './drafts.js';
import { download, ics } from './jobs-ui.js';

export const STUDY_IDS = ['notes', 'deposit', 'bursary', 'payslip'];
const parse = t => { try { return JSON.parse(t); } catch { return null; } };
const longMonth = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayMonth = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const pounds = n => '£' + Number(n).toLocaleString('en-GB');
const hours = n => (n === 1 ? '1 hour' : n + ' hours');
const sign = () => (state.mem.facts.name?.value || '').trim() || '[Your name]';
const list = names => (names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);
const raw = a => (a.kind === 'act' ? `${a.name}, ${a.cite}` : `${a.name} ${a.cite}`);

/* ---------- what each job reads from its files ---------- */
function notesPack(d) {
  if (!d.notes || !d.authorities) return null;
  const verified = parse(d.authorities)?.authorities || [];
  const notes = parseNotes(d.notes), checked = checkAuthorities(findAuthorities(d.notes), verified), cards = makeFlashcards(checked);
  return {
    notes, checked, cards, quiz: makeQuiz(cards, 5, 1), index: openBookIndex(d.notes, verified), plan: studyPlan(d.notes, DEMO_TODAY),
    wrong: checked.filter(a => a.status === 'wrong-citation'), unver: checked.filter(a => a.status === 'not-verified'),
    subject: notes.title.split(',')[0].replace(/^my\s+/i, '').replace(/\s+notes$/i, '').trim(),
  };
}
export function depositOf(d) {
  const lease = d.lease ? parse(d.lease) : null;
  return lease ? { lease, ...depositCheck(lease, DEMO_TODAY) } : null;
}
export function fundingOf(d) {
  if (!d.funding) return null;
  const rows = d.bankpay || SS.findFile('bankpay')?.file.rows || null;
  return { ...fundingCheck(d.funding, rows || [], DEMO_TODAY), hasBank: !!rows, from: readLetter(d.funding).from || 'Student Funding' };
}
function payslipOf(d) {
  const p = d.payslip ? parse(d.payslip) : null;
  return p ? { p, ...payslipCheck(p) } : null;
}

/* ---------- headlines for the cards ---------- */
const DESCRIBE = {
  notes(d) {
    const k = notesPack(d); if (!k) return null;
    const things = k.wrong.length + k.unver.length;
    return { title: 'Revision pack', icon: 'book', headline: `Your ${k.subject} notes, ready to revise`, urgent: false,
      tag: [k.cards.length === 1 ? '1 flashcard' : k.cards.length + ' flashcards', k.quiz.length ? `${k.quiz.length}-question quiz` : '', `${things === 1 ? '1 thing' : things + ' things'} to check`].filter(Boolean).join(' · ') };
  },
  deposit(d) {
    const c = depositOf(d); if (!c) return null;
    if (c.protected) return { title: 'Deposit', icon: 'law', headline: `Your ${pounds(c.lease.deposit)} deposit is protected`, tag: 'Nothing to do', urgent: false };
    return { title: 'Deposit', icon: 'law', headline: `Your ${pounds(c.lease.deposit)} deposit wasn't protected`, urgent: c.daysLeft >= 0,
      tag: c.daysLeft < 0 ? 'The tribunal deadline has passed' : `${dayWord(c.daysLeft)} left to apply to the tribunal` };
  },
  bursary(d) {
    const f = fundingOf(d); if (!f) return null;
    const miss = f.payments.find(p => p.status === 'missing');
    if (!f.hasBank) return { title: 'Bursary', icon: 'coin', headline: `I found ${f.payments.length} payment dates in your letter`, tag: 'Add your bank export to check them', urgent: false };
    if (miss) return { title: 'Bursary', icon: 'coin', headline: `Your ${dayMonth(miss.date)} payment (${gbp(f.amount)}) hasn't arrived`, tag: `${dayWord(miss.daysLate)} late`, urgent: true };
    const next = f.payments.find(p => p.status === 'upcoming');
    return { title: 'Bursary', icon: 'coin', headline: 'Your bursary payments have all arrived', tag: next ? `Next payment in ${dayWord(next.daysLeft)}` : 'Nothing left this term', urgent: false };
  },
  payslip(d) {
    const c = payslipOf(d); if (!c) return null;
    if (c.rateOk) return { title: 'Payslip', icon: 'fee', headline: `You were paid ${gbp(c.p.hourly_rate)} an hour. That is above the minimum of ${gbp(c.minRate)}.`, tag: 'Pay rate is fine', urgent: false };
    return { title: 'Payslip', icon: 'fee', headline: `You were paid ${gbp(c.p.hourly_rate)} an hour. The minimum for you is ${gbp(c.minRate)}.`, tag: `Underpaid by ${gbp(c.underpaid)} on this payslip`, urgent: true };
  },
};
export function buildStudyCards(d) {
  const out = [];
  for (const k of STUDY_IDS) {
    const x = DESCRIBE[k](d); if (!x) continue;
    out.push({ id: k, job: k, icon: x.icon, title: x.title, headline: x.headline, detail: '', tag: x.tag, tagClass: x.urgent ? 'tag-risk' : 'tag-money', amount: 0, urgent: x.urgent });
  }
  return out;
}

/* ---------- the four blocks ---------- */
const fold = (title, body, open = false) => `<details class="fold"${open ? ' open' : ''}><summary>${esc(title)}</summary><div class="fold-body">${body}</div></details>`;
const lawLine = t => `<p class="law-line">${esc(t)}</p>`;
const authorityText = a => (a.status === 'not-verified' ? `${raw(a)} (not checked)` : `${a.kind === 'case' ? `${a.name} ${a.expected || a.cite}` : `${a.name}, ${a.cite}`} (${a.principle})`);

function tidyNotes(k) {
  return k.notes.sections.map(s => `<h4 class="fold-h">${esc(s.lo)} ${esc(s.title)}</h4><ul class="plain">${s.points.map(p => {
    const auth = k.checked.filter(a => a.line === p.line);
    const rest = auth.reduce((t, a) => t.replace(raw(a), ''), p.text).replace(/^[\s:,]+|[\s:,]+$/g, '');
    return `<li>${rest ? `<span>${esc(rest)}</span>` : ''}${auth.map(a => `<span class="law-line">${esc(authorityText(a))}</span>`).join('')}</li>`;
  }).join('')}</ul>`).join('');
}
function checkList(k) {
  const items = [
    ...k.wrong.map(a => `${a.name}: your notes say ${a.cite}; the report is ${a.expected}.`),
    ...k.unver.map(a => `${raw(a)}: I couldn't verify this one. Check it with your lecturer before you use it.`),
  ];
  return items.length ? `<ul class="dl-list">${items.map(t => `<li class="over">${esc(t)}</li>`).join('')}</ul>` : '<p class="tiny">Every authority in your notes matches the verified list.</p>';
}
function flashHtml(k, i, side) {
  const c = k.cards[i];
  return `<button class="flash" type="button" data-job="s-flip" aria-label="Flashcard ${i + 1} of ${k.cards.length}. Tap to flip.">
    <span class="mono-cap">${side === 'front' ? 'Authority' : 'What it says'} · ${i + 1} of ${k.cards.length}</span><span class="flash-text">${esc(side === 'front' ? c.front : c.back)}</span></button>
    <div class="card-btns job-btns"><button class="btn" type="button" data-job="s-prev">Previous</button><button class="btn" type="button" data-job="s-next">Next</button></div>`;
}
function quizHtml(k, z) {
  if (z.i >= k.quiz.length) return `<div class="quiz-sum"><h4 class="fold-h">You got ${z.score} of ${k.quiz.length}</h4><p class="tiny">${z.score >= 4 ? 'Nicely done.' : "Let's go again. The flashcards are above."}</p>
    <button class="btn" type="button" data-job="s-qagain">Try again</button></div>`;
  const q = k.quiz[z.i];
  return `<p class="mono-cap">Question ${z.i + 1} of ${k.quiz.length}</p><h4 class="quiz-q">${esc(q.question)}</h4>
    <div class="opts" role="group" aria-label="Answers">${q.options.map((o, n) => `<button class="opt" type="button" data-job="s-opt" data-o="${n}">${esc(o)}</button>`).join('')}</div>
    <p class="quiz-fb" hidden></p><button class="btn primary" type="button" data-job="s-qnext" hidden>${z.i + 1 === k.quiz.length ? 'See my score' : 'Next question'}</button>`;
}
const NO_CARDS = '<p class="tiny">None of the authorities in your notes are on my verified list, so I have no flashcards.</p>';
const NO_QUIZ = '<p class="tiny">I need at least 3 checked authorities to make a quiz.</p>';
function notesBlock(d) {
  const k = notesPack(d);
  const idx = `<ul class="dl-list">${k.index.map(i => `<li><b>${esc(i.term)}</b><span>${esc(i.where)}, line ${i.line}</span></li>`).join('')}</ul>`;
  const plan = `<ul class="dl-list">${k.plan.map(p => `<li><b>${esc(longDate(p.date))}</b><span>${esc(p.task)}</span></li>`).join('')}</ul>
    <div class="card-btns job-btns"><button class="btn" type="button" data-job="s-plan-ics">Add to my calendar</button></div>`;
  return fold('Tidy notes', tidyNotes(k))
    + fold(`Things to check in your notes (${k.wrong.length + k.unver.length})`, checkList(k), true)
    + fold('Open-book index', idx)
    + fold(`Flashcards (${k.cards.length})`, k.cards.length ? `<div class="flashbox" data-i="0" data-side="front">${flashHtml(k, 0, 'front')}</div>` : NO_CARDS)
    + fold(`Quiz (${k.quiz.length} questions)`, k.quiz.length ? `<div class="quizbox" data-i="0" data-score="0">${quizHtml(k, { i: 0, score: 0 })}</div>` : NO_QUIZ)
    + fold('Revision plan', plan)
    + `<p class="tiny">Revision help only. I never write coursework for you.</p>`;
}
const SCHEME_LAWS = [
  'Tenancy Deposit Schemes (Scotland) Regulations 2011, reg 3(1) (the landlord must pay the deposit into an approved scheme within 30 working days of the tenancy starting)',
  'Tenancy Deposit Schemes (Scotland) Regulations 2011, reg 9(2) (the tenant must apply to the tribunal no later than 3 months after the tenancy ends)',
  'Tenancy Deposit Schemes (Scotland) Regulations 2011, reg 10(a) (the tribunal must order the landlord to pay up to three times the deposit)',
];
function depositBlock(d) {
  const c = depositOf(d), names = c.lease.schemes_checked.map(s => s.name);
  if (c.protected) return `<p class="job-sub">${esc(`Your deposit was found in ${list(c.lease.schemes_checked.filter(s => s.found).map(s => s.name))}.`)}</p>`;
  return `<p class="job-sub">${esc(`It should have been in a scheme by ${longMonth(c.protectBy)}. I checked ${list(names)}: not found (EXAMPLE).`)}</p>
    <p class="job-sub">${esc(`Apply by ${longMonth(c.tribunalBy)}. The tribunal must order the landlord to pay you up to ${pounds(c.maxAward)}.`)}</p>
    ${SCHEME_LAWS.map(lawLine).join('')}
    <div class="card-btns job-btns"><button class="btn" type="button" data-job="s-dep-draft">Draft my tribunal application</button><button class="btn" type="button" data-job="s-dep-ics">Add the deadline to my calendar</button></div>
    <p class="tiny">I'm not a solicitor. Free help: Shelter Scotland or your students' association advice centre.</p>`;
}
const CHIP = { paid: ['tag-money', () => 'Paid'], missing: ['tag-risk', () => 'Missing'], upcoming: ['tag-money', p => `Upcoming, ${p.daysLeft === 1 ? '1 day' : p.daysLeft + ' days'} left`] };
function bursaryBlock(d) {
  const f = fundingOf(d);
  const rows = f.payments.map(p => {
    const [cls, say] = f.hasBank || p.status === 'upcoming' ? CHIP[p.status] : ['tag-money', () => 'Check your bank'];
    return `<li class="${p.status === 'missing' && f.hasBank ? 'over' : ''}"><b>${esc(longMonth(p.date))}</b><span class="${cls} stat">${esc(say(p))}</span></li>`;
  }).join('');
  return `<ul class="dl-list">${rows}</ul>
    <div class="card-btns job-btns">${f.hasBank ? '<button class="btn" type="button" data-job="s-bur-draft">Draft a chase email</button>' : ''}<button class="btn" type="button" data-job="s-bur-ics">Add payment dates to my calendar</button></div>`;
}
const PAYSLIP_LINKS = [['National Minimum Wage rates', 'https://www.gov.uk/national-minimum-wage-rates'], ['Holiday entitlement', 'https://www.gov.uk/holiday-entitlement-rights'], ['Tax codes', 'https://www.gov.uk/tax-codes']];
function payslipBlock(d) {
  const c = payslipOf(d), given = Number(c.p.holiday_hours_given) || 0;
  return `<p class="job-sub">${esc(c.holidayHours ? `Holiday: you earned ${hours(c.holidayHours)} on this payslip; ${given ? hours(given) + ' shown' : 'none is shown'}.` : 'Holiday: nothing extra to add for this payslip.')}</p>
    <p class="job-sub ${c.emergencyTax ? 'alert-line' : ''}">${esc(c.emergencyTax ? `Tax code ${c.p.tax_code} is an emergency tax code. HMRC usually fixes it; you can check it online.` : `Tax code ${c.p.tax_code} does not look like an emergency code.`)}</p>
    ${lawLine('National Minimum Wage Act 1998, s1(1) (a person who qualifies for the national minimum wage must be paid at least that rate)')}
    <p class="tiny">${PAYSLIP_LINKS.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(t)}: ${esc(u)}</a>`).join('<br>')}</p>
    <div class="card-btns job-btns"><button class="btn" type="button" data-job="s-pay-draft">Draft a polite email to my manager</button></div>
    <p class="tiny">Still stuck? Acas gives free, confidential advice.</p>`;
}

const BLOCK = { notes: notesBlock, deposit: depositBlock, bursary: bursaryBlock, payslip: payslipBlock };
const PROV = {
  notes: () => 'CHECKED AGAINST VERIFIED AUTHORITIES · 6 NOV 2026',
  deposit: () => '<a href="https://www.mygov.scot/tenant-deposits/deposit-not-protected" target="_blank" rel="noopener">MYGOV.SCOT · DEPOSIT NOT PROTECTED</a> · EXAMPLE TENANCY',
  bursary: () => 'DATES READ FROM YOUR LETTER · CHECKED AGAINST YOUR BANK EXPORT',
  payslip: () => 'BUILT BY CODE · APRIL 2026 RATES FROM GOV.UK · EXAMPLE PAYSLIP',
};
export function studyCardHtml(c, s) {
  const d = SS.dataOf(s), x = DESCRIBE[c.job](d); if (!x) return '';
  const done = (s.results.picked || []).includes(c.id);
  return `<article class="card rcard job ${done ? 'done' : ''}" data-cid="${esc(c.id)}">
    <p class="mono-cap status ${done ? 'ok' : 'eye'}">${done ? 'DONE' : 'NEEDS YOUR EYE'} <b class="badge">EXAMPLE</b></p>
    <div class="card-top"><span class="card-icon">${ICONS[x.icon] || ''}</span>
      <div><h3 class="job-head">${esc(x.headline)}</h3><span class="${x.urgent ? 'tag-risk' : 'tag-money'} big">${esc(x.tag)}</span></div></div>
    ${BLOCK[c.job](d)}
    <p class="prov mono-cap">${PROV[c.job]()}</p>
    <div class="card-btns">
      <button class="btn primary" type="button" data-card="${c.id}" data-act="approve" ${done ? 'disabled' : ''} aria-label="Approve ${esc(x.title)}">${done ? 'Approved' : 'Approve'}</button>
      <button class="btn" type="button" data-card="${c.id}" data-act="adjust" aria-label="Adjust ${esc(x.title)}">Adjust</button>
      <button class="btn" type="button" data-card="${c.id}" data-act="escalate" aria-label="Escalate ${esc(x.title)}">Escalate</button>
    </div></article>`;
}

/* ---------- drafts, facts and the questions for a person ---------- */
export const STUDY_WHO = { notes: 'lecturer', deposit: 'adviser', bursary: 'adviser', payslip: 'adviser' };
export const STUDY_QS = {
  notes: ['Are these the right authorities for this unit?', 'Is my open-book index the kind the exam allows?'],
  deposit: ['Can I apply to the tribunal on these facts?', 'What should go in the application?'],
  bursary: ['Was my attendance confirmed for the missing payment?', 'When will the missing payment reach me?'],
  payslip: ['Is the pay rate right for my age and job?', 'How do I get my holiday pay added?'],
};
function depositDraft(d) {
  const c = depositOf(d), l = c.lease;
  return { title: 'Tribunal application (draft)', to: 'To: First-tier Tribunal for Scotland, Housing and Property Chamber',
    body: `Draft: check it against the official Form G before you send it\n\nTenant: ${sign()}\nLandlord: ${l.landlord} (EXAMPLE)\nProperty: ${l.address}\nTenancy: ${longMonth(l.start)} to ${longMonth(l.end)}\nDeposit paid: ${gbp(l.deposit)}\n\nWhat happened\nMy landlord did not pay my deposit into an approved scheme. I checked ${list(l.schemes_checked.map(s => s.name))} and it is not held by any of them.\n\nThe law\n${SCHEME_LAWS.join('\n')}\n\nWhat I am asking for\nAn order that the landlord pays me ${gbp(c.maxAward)}, which is three times the deposit, or the amount the tribunal thinks right up to that figure. I am applying before ${longMonth(c.tribunalBy)}.\n\nThank you,\n${sign()}` };
}
function bursaryDraft(d) {
  const f = fundingOf(d), miss = f.payments.filter(p => p.status === 'missing');
  return { title: 'Chase email: missing bursary payment', to: `To: ${f.from}`,
    body: `Subject: Missing bursary payment, ${miss.map(p => dayMonth(p.date)).join(' and ')}\n\nHello,\n\nMy bursary letter says I am paid ${gbp(f.amount)} every two weeks if my attendance is confirmed. The payment due on ${miss.map(p => longMonth(p.date)).join(' and ')} has not reached my bank account.\n\nCould you tell me whether my attendance was confirmed for that period, and when I can expect the payment?\n\nThank you,\n${sign()}` };
}
function payslipDraft(d) {
  const c = payslipOf(d), p = c.p;
  return { title: 'Email to my manager', to: `To: my manager at ${p.employer}`,
    body: `Subject: Question about my payslip for the period ending ${longMonth(p.period_end)}\n\nHello,\n\nThank you for my payslip. I have a question about it.\n\nIt shows ${p.hours} hours at ${gbp(p.hourly_rate)} an hour. The National Minimum Wage for someone my age is ${gbp(c.minRate)} an hour (GOV.UK, April 2026), so I think I am owed ${gbp(c.underpaid)} for this period.\n\nI also could not see any holiday pay. Because my hours change, I think I built up about ${hours(c.holidayHours)} of holiday on this payslip.${c.emergencyTax ? `\n\nMy tax code is ${p.tax_code}, which looks like an emergency code. Could you check it with payroll?` : ''}\n\nCould we go through it together when you have a moment?\n\nThank you,\n${sign()}` };
}
export function studyDraft(card) {
  const d = state.data;
  if (card.job === 'deposit') return depositDraft(d);
  if (card.job === 'bursary') return bursaryDraft(d);
  if (card.job === 'payslip') return payslipDraft(d);
  const k = notesPack(d), box = t => '☐ ' + t;
  return { title: 'Revision checklist', to: 'For: me',
    body: [...k.plan.map(p => box(`${longDate(p.date)}: ${p.task}`)), ...k.wrong.concat(k.unver).map(a => box(`Check ${a.name} with your lecturer`))].join('\n') + '\n\nRevision help only. I never write coursework for you.' };
}
export function studyFacts(card) {
  const d = state.data;
  if (card.job === 'notes') { const k = notesPack(d); return [...k.wrong.map(a => `${a.name}: notes say ${a.cite}, report is ${a.expected}`), ...k.unver.map(a => `${raw(a)}: could not verify`)]; }
  if (card.job === 'deposit') { const c = depositOf(d); return [`Deposit ${pounds(c.lease.deposit)}, not found in any approved scheme`, `Should have been protected by ${longMonth(c.protectBy)}`, `Tribunal deadline ${longMonth(c.tribunalBy)}`]; }
  if (card.job === 'bursary') return fundingOf(d).payments.map(p => `${longMonth(p.date)}: ${p.status}`);
  const c = payslipOf(d);
  return [`Paid ${gbp(c.p.hourly_rate)} an hour, minimum ${gbp(c.minRate)}`, `Underpaid by ${gbp(c.underpaid)}`, `Tax code ${c.p.tax_code}`];
}

/* ---------- the lines in Ollie's working panel ---------- */
export function studySteps(s) {
  const d = SS.dataOf(s), out = [];
  const k = notesPack(d), dep = depositOf(d), fund = fundingOf(d), pay = payslipOf(d);
  if (k) {
    out.push(`Found ${k.checked.length} authorities · ${k.checked.filter(a => a.status === 'ok').length} match, ${k.wrong.length} wrong citation, ${k.unver.length} not verified`);
    out.push(`Made ${k.cards.length} flashcards and a ${k.quiz.length}-question quiz · by code`);
    out.push(`Built the open-book index · ${k.index.length} entries`);
    out.push(`Planned ${k.plan.length} revision days up to the exam`);
  }
  if (dep) {
    out.push(`Counted 30 working days from the start of the tenancy · ${longMonth(dep.protectBy)}`);
    out.push(`Checked ${dep.lease.schemes_checked.length} deposit schemes · ${dep.lease.schemes_checked.filter(x => x.found).length} found`);
    out.push(`Counted ${dayWord(dep.daysLeft)} to the tribunal deadline`);
  }
  if (fund) {
    out.push(`Read ${fund.payments.length} payment dates from the letter · ${gbp(fund.amount)} each`);
    out.push(fund.hasBank ? `Matched them to your bank export · ${fund.payments.filter(p => p.status === 'missing').length} missing` : 'No bank export yet, so I could not check what arrived');
  }
  if (pay) {
    out.push(`Looked up the minimum wage for age ${pay.p.age} · ${gbp(pay.minRate)}`);
    out.push(`Checked pay, holiday and tax code · ${pay.rateOk ? 'pay is fine' : 'underpaid by ' + gbp(pay.underpaid)}`);
  }
  return out;
}

/* ---------- Ollie says what it has been given ---------- */
const WHAT = {
  notes: f => { const n = parseNotes(f.text); return `class notes (${n.title.split(',')[0].trim()}, ${n.sections.length} learning outcomes)`; },
  lease: f => `a tenancy (deposit ${pounds(parse(f.text)?.deposit ?? 0)})`,
  funding: f => { const x = fundingCheck(f.text, [], DEMO_TODAY); return `a funding letter (${x.payments.length} payments of ${gbp(x.amount)})`; },
  payslip: f => { const p = parse(f.text) || {}; return `a payslip (${p.hours} hours at ${gbp(p.hourly_rate)})`; },
  letter: f => `a letter (from ${readLetter(f.text).from || 'someone'})`,
  company: f => `a Companies House record (${parse(f.text)?.name || 'a company'})`,
  brief: f => `an assignment brief${parseBrief(f.text).unit ? ' (' + parseBrief(f.text).unit + ')' : ''}`,
  draft: () => 'an essay draft',
  deadlines: f => `a list of deadlines (${f.rows.length} dates)`,
  invoices: f => `a list of invoices (${f.rows.length})`,
  statement: f => `a Fresha statement (${f.rows.length} lines)`,
  clients: f => `a client list (${f.rows.length} clients)`,
  bank: f => `a bank statement (${f.rows.length} lines)`,
  bankpay: f => `a bank export (${f.rows.length} lines)`,
  grants: f => `a list of grants (${f.rows.length})`,
  siteinfo: () => 'shop details',
  prices: f => `a price list (${f.rows.length} prices)`,
};
export function recogniseSteps(s) {
  const out = [];
  for (const f of s.files) {
    const guess = f.text ? classifyMaterial(f.text, f.name).kind : 'unknown';
    const k = WHAT[guess] ? guess : f.kind;
    if (WHAT[k]) out.push(`Recognised: ${WHAT[k](f)}`);
  }
  return out;
}
// What the user's own file might be, and what Ollie offers to do with it.
const OFFER = {
  notes: ['class notes', 'turn them into revision notes'], brief: ['an assignment brief', 'check your essay against it'],
  letter: ['a letter', 'explain it'], funding: ['a funding letter', 'check your bursary dates'],
  invoices: ['a list of invoices', 'chase the late ones'], statement: ['a Fresha statement', 'check it for wrong fees'],
  deadlines: ['a list of deadlines', 'line them up'],
};
export function askAbout(entry) {
  const k = classifyMaterial(entry.text, entry.name).kind;
  return OFFER[k] ? { kind: k, text: `This looks like ${OFFER[k][0]}. Shall I ${OFFER[k][1]}?` } : null;
}
// Yes: the user's file, filed under the kind Ollie recognised. Notes also bring the verified authorities.
export async function entriesFor(kind, entry) {
  if (kind === 'notes') {
    const auth = await (await fetch('data/authorities_verified.json')).text();
    return [{ ...entry, kind: 'notes' }, { name: 'authorities_verified.json', kind: 'authorities', text: auth }];
  }
  return ['brief', 'letter', 'funding'].includes(kind) ? [{ ...entry, kind }] : [entry];
}

/* ---------- buttons ---------- */
const bar = (el, sel) => el.querySelector(sel);
function paintQuiz(el, k, z) {
  const box = bar(el, '.quizbox');
  box.dataset.i = z.i; box.dataset.score = z.score;
  box.innerHTML = quizHtml(k, z);
}
export function onStudyButton(b, k) {
  const el = b.closest('[data-cid]'), s = curSession(); if (!el || !s) return;
  const d = SS.dataOf(s), card = state.cards.find(c => c.id === el.dataset.cid);
  if (['s-flip', 's-prev', 's-next'].includes(k)) {
    const box = el.querySelector('.flashbox'), kk = notesPack(d), n = kk.cards.length;
    let i = +box.dataset.i, side = box.dataset.side;
    if (k === 's-flip') side = side === 'front' ? 'back' : 'front';
    else { i = (i + (k === 's-next' ? 1 : n - 1)) % n; side = 'front'; }
    box.dataset.i = i; box.dataset.side = side; box.innerHTML = flashHtml(kk, i, side);
    box.querySelector(k === 's-flip' ? '.flash' : `[data-job="${k}"]`).focus();
  } else if (['s-opt', 's-qnext', 's-qagain'].includes(k)) {
    const kk = notesPack(d), box = el.querySelector('.quizbox'), z = { i: +box.dataset.i, score: +box.dataset.score };
    if (k === 's-qagain') paintQuiz(el, kk, { i: 0, score: 0 });
    else if (k === 's-qnext') paintQuiz(el, kk, { i: z.i + 1, score: z.score });
    else {
      const q = kk.quiz[z.i], pick = +b.dataset.o, right = pick === q.answer;
      box.dataset.score = z.score + (right ? 1 : 0);
      box.querySelectorAll('.opt').forEach((o, n) => {
        o.disabled = true;
        if (n === q.answer) { o.classList.add('right'); o.insertAdjacentHTML('afterbegin', '<span class="mark" aria-hidden="true">✓ </span>'); }
        else if (n === pick) { o.classList.add('wrong'); o.insertAdjacentHTML('afterbegin', '<span class="mark" aria-hidden="true">✗ </span>'); }
      });
      const fb = bar(box, '.quiz-fb'); fb.hidden = false; fb.className = 'quiz-fb ' + (right ? 'ok' : 'no');
      fb.textContent = right ? 'Right!' : 'Not quite. The right answer is: ' + q.options[q.answer];
      const nx = bar(box, '[data-job="s-qnext"]'); nx.hidden = false; nx.focus();
    }
  } else if (k === 's-plan-ics') {
    const k2 = notesPack(d);
    download('revision-plan.ics', ics(k2.plan.map(p => ({ uid: 'plan-' + p.date, date: p.date, title: 'Revision: ' + p.task, note: 'Added by Unpaid Intern (EXAMPLE). Revision help only.' }))), 'text/calendar');
    toast(`Calendar file saved with ${k2.plan.length} revision days.`);
  } else if (k === 's-dep-ics') {
    const c = depositOf(d);
    download(`deposit-deadline-${c.tribunalBy}.ics`, ics([{ uid: 'deposit-' + c.tribunalBy, date: c.tribunalBy, title: 'Last day to apply to the tribunal for my deposit', note: `Deposit ${pounds(c.lease.deposit)}. Added by Unpaid Intern (EXAMPLE).` }]), 'text/calendar');
    toast(`Calendar file saved for ${longMonth(c.tribunalBy)}. Open it to add the date.`);
  } else if (k === 's-bur-ics') {
    const f = fundingOf(d);
    download('bursary-payment-dates.ics', ics(f.payments.map(p => ({ uid: 'bursary-' + p.date, date: p.date, title: `Bursary payment ${gbp(f.amount)}`, note: 'Added by Unpaid Intern (EXAMPLE).' }))), 'text/calendar');
    toast(`Calendar file saved with ${f.payments.length} payment dates.`);
  } else if (k === 's-dep-draft') openDraft(card, depositDraft(d));
  else if (k === 's-bur-draft') openDraft(card, bursaryDraft(d));
  else if (k === 's-pay-draft') openDraft(card, payslipDraft(d));
}
export function adjustStudy(btn) {
  btn.closest('[data-cid]').querySelector('summary, .btn[data-job]')?.focus();
}
