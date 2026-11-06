// The draft screen, and the checklists and notes Ollie writes. Nothing is ever sent.
import { calmPlan } from '../student.js';
import { FRESHA_RULE_URL } from '../rules.js';
import { LAW_SOURCE } from '../talk.js';
import { setPose, setState } from '../ollie.js';
import { $, CHECKED_ON, DEMO_TODAY, dayWord, gbp, longDate, state } from './state.js';
import { SEATS_STUDENT, view } from './results.js';
import { show } from './nav.js';
import { toSession } from './sessions-ui.js';
import { JOB_QS, JOB_WHO, jobDraft, jobFacts, signName } from './jobs-ui.js';

// Student approvals: checklists only, never essay text.
function studentDraftFor(card) {
  const { brief: b, check: c, deadlines: dl } = state.results;
  const box = t => '☐ ' + t;
  if (card.id === 'brief') return {
    title: 'Fix list', to: `For: ${b.title || 'your essay'}`,
    body: (c.issues.length ? c.issues.map(i => box(i.text)).join('\n') : 'Nothing to fix against the brief.') + '\n\nThis list says what to fix. The writing stays yours.',
  };
  if (card.id === 'deadlines') return {
    title: 'Deadline checklist', to: 'For: your own calendar',
    body: dl.map(d => box(`${longDate(d.due.slice(0, 10))} · ${d.title} (${d.status === 'overdue' ? 'overdue' : d.daysLeft === 0 ? 'today' : 'in ' + dayWord(d.daysLeft)})`)).join('\n') + '\n\nAdd these to your calendar yourself. This demo does not touch your calendar.',
  };
  const plan = calmPlan(state.sctx, DEMO_TODAY);
  return {
    title: 'Your calm plan', to: 'One task a day',
    body: (plan.length ? plan.map(p => box(`${p.day}: ${p.task}`)).join('\n') : 'Nothing to plan right now.') + '\n\nMove any task to another day if you need to. It is a suggestion, not a rule.',
  };
}
function draftFor(card) {
  if (card.job) return jobDraft(card);
  if (card.seats === SEATS_STUDENT) return studentDraftFor(card);
  const r = view();
  const biz = state.answers.btype ? `${state.answers.btype}` : 'the salon';
  if (card.id === 'fees' && !r.fees.length) return { title: 'Dispute email to Fresha', to: 'To: Fresha support', body: 'No fee lines are ticked, so there is nothing to dispute. Tick a line on the jury screen to bring it back.' };
  if (card.id === 'chase' && !r.chase.length) return { title: 'Invoice reminders', to: 'To: your customers (one email each)', body: 'No invoice lines are ticked, so there is nothing to chase. Tick a line on the jury screen to bring it back.' };
  if (card.id === 'fees') {
    const lines = r.fees.map(f => `- ${longDate(f.date)}: ${f.client}, ${f.service}, ${gbp(f.amount)}. ${f.reason}`).join('\n');
    return {
      title: 'Dispute email to Fresha', to: 'To: Fresha support',
      body: `Subject: Request to refund ${r.fees.length} new-client fees\n\nHello,\n\nI am writing about ${r.fees.length} new-client fee${r.fees.length === 1 ? "" : "s"} on my recent statement that I believe ${r.fees.length === 1 ? "was" : "were"} charged in error:\n\n${lines}\n\nTotal: ${gbp(card.amount)}.\n\nYour help centre says no new-client fee applies when the client is already on the Clients list, was imported, or booked through the business's own profile link (${FRESHA_RULE_URL}).\n\nPlease review these and refund the total to my next payout. I am happy to send screenshots if that helps.\n\nThank you,\n${signName()}\n${biz}`,
    };
  }
  if (card.id === 'chase') {
    const out = r.chase.map(c => {
      if (!c.lawApplies) return `--- ${c.invoice} (reminder only) ---\nHello ${c.customer},\n\nA friendly reminder that invoice ${c.invoice} for ${gbp(c.amount)} was due on ${longDate(c.due)}. Could you let me know when I can expect payment?\n\nThank you,\n${signName()}`;
      return `--- ${c.invoice} ---\nHello ${c.customer},\n\nInvoice ${c.invoice} for ${gbp(c.amount)} was due on ${longDate(c.due)} and is now ${c.daysLate} days late.\n\nUnder the late payment law for business debts, I am entitled to interest of ${gbp(c.interest)} and a fixed sum of £${c.fixedSum}, which brings the total to ${gbp(c.total)}.\n\nPlease pay by [date].\n\nThank you,\n${signName()}`;
    }).join('\n\n');
    return { title: 'Invoice reminders', to: 'To: your customers (one email each)', body: out };
  }
  if (card.id === 'subs') {
    const rise = r.subs.priceRises[0], dup = r.subs.duplicates[0];
    const cheap = dup && state.data.bank.filter(b => b.category === dup.category && Number(b.amount) === dup.saving)[0]?.merchant;
    return {
      title: 'Subscription notes', to: 'To: your providers (one note each)',
      body: `--- ${rise.merchant} ---\nHello,\n\nMy monthly payment went up from £${rise.from} to £${rise.to}. Could you explain the change and tell me what the plan includes? I may switch if there is a cheaper option.\n\nThank you,\n${signName()}\n\n--- ${cheap || 'Duplicate plan'} ---\nHello,\n\nPlease cancel my ${dup.category} plan from the end of the current billing period and confirm the date in writing.\n\nThank you,\n${signName()}`,
    };
  }
  return {
    title: 'Sick pay policy', to: 'Document: for your staff',
    body: `Statutory sick pay policy (draft)\n\nFrom 6 April 2026, statutory sick pay is paid from the first day a person is off sick (the waiting days and the lower earnings limit were removed).\n\nIf you are ill:\n1. Tell your manager as early as you can on the first day.\n2. Say when you expect to be back.\n3. Keep your manager updated if that changes.\n\nSource: ${LAW_SOURCE}. Checked ${CHECKED_ON}. Please check the dates and wording against the source before you share this.`,
  };
}
// Escalate: a note to a person (accountant, solicitor or tutor) with the facts and the open questions. Never sent.
const ESC_WHO = { fees: 'accountant', chase: 'accountant', subs: 'accountant', law: 'solicitor', brief: 'tutor', deadlines: 'tutor', wellbeing: 'tutor', study: 'tutor' };
const ESC_QS = {
  fees: ['Are these fees really wrong under Fresha\'s published rule?', 'Is the dispute window still open, and what should I send with it?'],
  chase: ['Can I claim the interest and fixed sums on the business invoices?', 'How should I word the reminder for the consumer invoice?'],
  subs: ['Is it safe to cancel the duplicate plan?', 'Should I question the price rise before I decide?'],
  law: ['Does the sick pay change affect my staff policy?', 'Is the policy draft right for my staff contracts?'],
  brief: ['Have I read the brief correctly?', 'Which of the missing points should I do first?'],
  deadlines: ['Is anything here likely to clash?', 'Can any of these dates move if I need more time?'],
  wellbeing: ['Does the one-task-a-day plan look realistic?', 'What should I drop first if I fall behind?'],
};
function escalateFacts(card) {
  if (card.job) return jobFacts(card);
  const r = view();
  if (card.id === 'fees') return r.fees.length ? r.fees.map(f => `${longDate(f.date)}: ${f.client}, ${f.service}, ${gbp(f.amount)}. ${f.reason}`) : [];
  if (card.id === 'chase') return r.chase.map(c => c.lawApplies
    ? `${c.invoice}, ${c.customer}: ${gbp(c.amount)}, ${dayWord(c.daysLate)} late. Interest ${gbp(c.interest)} plus a fixed £${c.fixedSum}.`
    : `${c.invoice}, ${c.customer} (consumer): ${gbp(c.amount)}, ${dayWord(c.daysLate)} late. Reminder only.`);
  if (card.id === 'subs') {
    const rise = r.subs.priceRises[0], dup = r.subs.duplicates[0];
    return [rise && `${rise.merchant} went up from £${rise.from} to £${rise.to} a month.`, dup && `${dup.merchants.join(' and ')} do the same job, ${gbp(dup.monthlyTotal)} a month together.`].filter(Boolean);
  }
  if (card.id === 'law') return [LAW_TEXT_SHORT, 'Source: ' + LAW_SOURCE];
  if (card.id === 'brief') return state.results.check.issues.map(i => i.text);
  if (card.id === 'deadlines') return state.results.deadlines.map(d => `${longDate(d.due.slice(0, 10))}: ${d.title} (${d.status === 'overdue' ? 'overdue' : d.daysLeft === 0 ? 'today' : 'in ' + dayWord(d.daysLeft)})`);
  return calmPlan(state.sctx, DEMO_TODAY).map(p => `${p.day}: ${p.task}`);
}
const LAW_TEXT_SHORT = 'Since 6 April 2026, statutory sick pay starts from the first day off sick.';
function escalateDraft(card) {
  const who = JOB_WHO[card.id] || ESC_WHO[card.id] || 'adviser';
  const facts = escalateFacts(card), qs = JOB_QS[card.id] || ESC_QS[card.id] || ['Is this right for my situation?'];
  return {
    title: `Questions for my ${who}`, to: `For: my ${who} (a note for a person, not sent anywhere)`,
    body: `Hello,\n\nMy assistant app, Ollie, found the item below. Before I act on it I would like you to look it over.\n\nWhat it found\n${card.headline}\n${facts.length ? facts.map(f => '- ' + f).join('\n') : '- (nothing ticked right now)'}\n\nWhat I still want to ask\n${qs.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nThank you,\n${signName()}`,
  };
}
export function openEscalate(card) { openDraft(card, escalateDraft(card)); }
export function openDraft(card, override) {
  state.draftCard = card;
  const d = override || draftFor(card);
  $('draftTitle').textContent = d.title; $('draftTo').textContent = d.to;
  $('draftBody').textContent = d.body; $('copyNote').textContent = '';
  $('draftSub').textContent = override ? 'A note to a person. Nothing is sent: copy it and ask them yourself.'
    : card.seats === SEATS_STUDENT ? 'A checklist, not your essay. Your writing stays yours.' : 'Real names are back in here, for you to check.';
  show('draft');
  setPose($('draftOllie'), 3); setState($('draftOllie'), 'happy');
}

const CARD_QUESTION = {
  fees: 'How much did Fresha overcharge me?', chase: 'Which invoices are late?',
  subs: 'How can I save on subscriptions?', law: 'Tell me about the sick pay change',
  brief: "What's missing from my essay?", deadlines: 'When is my next deadline?', wellbeing: 'When is my next deadline?',
};

export function initDrafts() {
  $('copyBtn').addEventListener('click', async () => {
    const text = $('draftBody').textContent;
    try { await navigator.clipboard.writeText(text); $('copyNote').textContent = 'Copied. Nothing has been sent.'; }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); $('copyNote').textContent = 'Copied. Nothing has been sent.'; } catch { $('copyNote').textContent = 'Could not copy. Select the text and copy it by hand.'; }
      ta.remove();
    }
  });
  $('sendBtn').addEventListener('click', () => { $('copyNote').textContent = 'This demo never sends anything. Copy the draft and send it yourself.'; });
  $('draftBack').addEventListener('click', () => { toSession(); });
  $('askOllie').addEventListener('click', () => {
    toSession();
    $('sInput').value = CARD_QUESTION[state.draftCard?.id] || '';
    $('sInput').focus();
  });
}
