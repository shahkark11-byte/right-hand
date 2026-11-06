// The jury screen: three seats, the lines you can untick, arguing back, and the verdict.
import * as M from '../mind.js';
import { BASE_RATE_EXAMPLE, FRESHA_RULE_TEXT, FRESHA_RULE_URL } from '../rules.js';
import { LAW_SOURCE, LAW_URL, applyObjection } from '../talk.js';
import { setPose, setState } from '../ollie.js';
import { getJuryAnswer } from '../jury.js';
import { $, CHECKED_ON, DEMO_TODAY, ICONS, dayWord, esc, gbp, liveOn, longDate, reduceMotion, saveMind, state, things, wait } from './state.js';
import { SEATS_BIZ, SEATS_STUDENT, chaseKey, essayDays, feeKey, pickCard, refreshCards, refreshMind, view } from './results.js';
import { show, toast } from './nav.js';
import { toSession } from './sessions-ui.js';
import { openDraft, openEscalate } from './drafts.js';
import { attachMic } from './talk-ui.js';

const SEAT_ICON = { law: 'book', money: 'coin', wording: 'pen', tutor: 'cap', honesty: 'tick', wellbeing: 'heart' };

function studentCodeLines(card) {
  const { brief: b, check: c, deadlines: dl } = state.results;
  const over = dl ? dl.filter(d => d.status === 'overdue').length : 0;
  if (card.id === 'brief') return {
    tutor: `Words: ${c.wordCount} against ${b.minWords}-${b.maxWords} (${c.wordStatus}). Cases: ${c.casesFound.length} found, ${b.casesRequired} asked for. Topics: ${c.covered.length} of ${b.mustCover.length} covered${c.missing.length ? ', missing ' + c.missing.join(' and ') : ''}. Conclusion: ${c.hasConclusion ? 'yes' : 'not yet'}.`,
    honesty: 'This check only counts and matches words. It writes nothing and suggests no essay text. The sources in your study pack are real links to the judgments.',
    wellbeing: `${essayDays() === null ? 'No essay deadline found.' : 'Essay due in ' + dayWord(essayDays()) + '.'} ${things(c.issues.length)} to fix, so about one small job a day.`,
  };
  const soon = dl.filter(d => d.daysLeft >= 0 && d.daysLeft <= 14);
  return {
    tutor: card.id === 'deadlines' ? `${dl.length} dates read from your deadlines file; days counted from ${CHECKED_ON}.` : `The plan uses ${b ? 'the fix list from your brief check and ' : ''}the ${dl.length} dates in your deadlines file.`,
    honesty: 'Dates and tasks only. Nothing here is written for you, and no essay text is ever made.',
    wellbeing: `${soon.length} due in the next 14 days, ${over} overdue. ${card.id === 'wellbeing' ? 'The plan is one task a day.' : 'Sort the overdue one first.'}`,
  };
}

function codeLines(card) {
  if (card.seats === SEATS_STUDENT) return studentCodeLines(card);
  const r = view();
  if (card.id === 'fees') {
    const own = r.fees.filter(f => f.ruleId === 'FRESHA-OWN-LINK').length;
    const ex = r.fees.filter(f => f.ruleId === 'FRESHA-EXISTING-CLIENT').length;
    return {
      law: `Rule matched on ${r.fees.length} of ${r.statementNew} new-client fee lines: ${ex} already on the client list, ${own} from your own profile link.`,
      money: r.fees.length ? `${r.fees.map(f => gbp(f.amount)).join(' + ')} = ${gbp(card.amount)}.` : 'No fees are ticked, so nothing to claim back.',
      wording: 'Draft lists each fee with its date and reason.',
    };
  }
  if (card.id === 'chase') {
    const biz = r.chase.filter(c => c.lawApplies);
    return {
      law: `Late payment law applies to ${biz.length} business invoice${biz.length === 1 ? '' : 's'}; consumer invoices are reminder only. Rate ${BASE_RATE_EXAMPLE + 8}% (example base rate ${BASE_RATE_EXAMPLE}% + 8%).`,
      money: biz.length ? biz.map(c => `${c.invoice}: ${gbp(c.interest)} interest over ${c.daysLate} days + £${c.fixedSum} fixed = ${gbp(c.total)}`).join('; ') + '.' : 'No business invoices are ticked, so no interest to add.',
      wording: 'Draft shows the invoice, days late, interest and fixed sum.',
    };
  }
  if (card.id === 'subs') {
    const rise = r.subs.priceRises[0], dup = r.subs.duplicates[0];
    return {
      law: 'Recurring means paid in 2 or more different months. No rule is applied beyond that.',
      money: [rise && `${rise.merchant}: £${rise.from} to £${rise.to} (+${rise.increasePct.toFixed(0)}%)`, dup && `${dup.category}: ${gbp(dup.monthlyTotal)}/month in total, cheaper plan ${gbp(dup.saving)}`].filter(Boolean).join('; ') + '.',
      wording: 'Draft asks about the rise and cancels the duplicate.',
    };
  }
  return {
    law: 'Pre-written item. Source and date are shown under Why?.',
    money: 'No amount worked out for this item.',
    wording: 'Policy draft uses plain words and keeps the source attached.',
  };
}

function ruleInfo(card) {
  if (card.id === 'brief') return { text: 'Your draft is checked against your brief by code: words, decided cases (written as Name v Name), each topic phrase and a conclusion are counted. Nothing is said about how well you write.', url: '', label: 'Worked out from your brief and draft' };
  if (card.id === 'deadlines') return { text: `Dates are read from your deadlines file. Days left are counted from the demo date, ${CHECKED_ON}. Soon means 7 days or fewer.`, url: '', label: 'Worked out from your deadlines file' };
  if (card.id === 'wellbeing') return { text: 'A simple plan: one task a day, built from your fix list and your dates. Move any task to suit you. It is a suggestion to help you decide, not a rule.', url: '', label: 'Worked out from your brief check and deadlines' };
  if (card.id === 'fees') return { text: FRESHA_RULE_TEXT, url: FRESHA_RULE_URL, label: 'Fresha help centre: marketplace new-client fees' };
  if (card.id === 'chase') return {
    text: `Business-to-business debts: interest at the base rate plus 8% a year (simple interest, example base rate ${BASE_RATE_EXAMPLE}%), plus a fixed sum of £40 under £1,000, £70 from £1,000 to £9,999.99, or £100 from £10,000. It does not cover consumers.`,
    url: 'https://www.gov.uk/late-commercial-payments-interest-debt-recovery', label: 'gov.uk: late commercial payments, interest and debt recovery',
  };
  if (card.id === 'subs') return { text: 'A subscription counts as recurring when it is paid in 2 or more different months. A price rise is the latest payment being higher than the earliest.', url: '', label: 'Worked out from your bank file' };
  return { text: 'Pre-written item from the government roadmap. Check the date before you rely on it.', url: LAW_URL, label: LAW_SOURCE };
}

let juryRun = 0, juryAns = null;

// When Live was wanted but the model is not there, say so plainly.
const labelled = a => (state.prefs.jury === 'live' && !liveOn() && a.source === 'recorded') ? { ...a, label: 'Recorded answers (live AI not available here)' } : a;
// The live jury takes a while on this laptop, so say so and show a line moving.
const setWaiting = on => { $('juryWait').hidden = !on; };
function setJuryLabel(a) { $('juryLabel').innerHTML = `<b class="mono-cap">${a.source === 'live' ? 'AI OPINION · LOCAL MODEL' : 'RECORDED ANSWER'}</b> ${esc(a.label)}`; }
function showDisagree() {
  const d = juryAns && juryAns.disagreement, el = $('disagree');
  el.hidden = !d; el.innerHTML = d ? `<b>The seats disagreed on…</b> ${esc(d)}` : '';
}
// Live mode only: the anonymised facts plus the text of anything Ollie learned (names swapped for Client A, B...).
function factsWith(card) {
  const facts = factsFor(card);
  const rules = state.mem.rules.map(r => r.type === 'fees-not-new' && card.id === 'fees' ? `${state.results.feeAlias[r.client] || 'A client'} counts as a new client`
    : r.type === 'invoice-paid' && card.id === 'chase' ? `${r.invoice} is paid` : '').filter(Boolean);
  return rules.length ? { facts, rulesOllieLearned: rules } : facts;
}

// The recorded opinion was written for the original findings, so once the facts change it is not shown.
function factsChanged(card) {
  const r = view(), o = state.results;
  if (card.id === 'fees') return r.fees.length !== o.fees.length;
  if (card.id === 'chase') return r.chase.length !== o.chase.length;
  return false;
}
// While the live jury thinks, a seat says so and shows a line moving, not an empty box.
const thinkingSeat = seat => `<div class="seat-head">${ICONS[SEAT_ICON[seat]]}${seat[0].toUpperCase() + seat.slice(1)}<span class="seat-kind">Live AI</span></div>
      <p class="seat-wait">Thinking…</p><span class="wait-bar" aria-hidden="true"></span>`;
function paintSeat(el, seat) {
  const code = codeLines(state.active);
  const stale = juryAns.source === 'recorded' && factsChanged(state.active);
  const opinion = stale ? `Not shown: the recorded opinion was written before the facts changed${state.mem.rules.length ? ' (or before Ollie learned something)' : ''}. ${state.liveOk ? 'Choose Live in Settings for a fresh one.' : 'Live AI is not available here.'}` : juryAns[seat];
  el.innerHTML = `<div class="seat-head">${ICONS.tick}${seat[0].toUpperCase() + seat.slice(1)}</div>
      <p><span class="seat-kind code">Checked by code</span> ${esc(code[seat])}</p>
      <p><span class="seat-kind">${juryAns.source === 'live' ? 'AI opinion' : 'Recorded answer'}</span> ${esc(opinion)}</p>`;
}
function renderLines() {
  const card = state.active, box = $('linesBox');
  const items = card.id === 'fees' ? state.ctx.fees.map(f => ({ key: feeKey(f), text: `${f.client} · ${longDate(f.date)}`, amt: f.amount }))
    : card.id === 'chase' ? state.ctx.chase.map(c => ({ key: chaseKey(c), text: `${c.invoice} · ${c.customer}`, amt: c.total })) : [];
  box.hidden = !items.length;
  $('lines').innerHTML = items.map(i => `<li><label class="line ${state.off.has(i.key) ? 'off' : ''}"><input type="checkbox" data-key="${esc(i.key)}" ${state.off.has(i.key) ? '' : 'checked'}><span>${esc(i.text)}</span><span class="amt">${gbp(i.amt)}</span></label></li>`).join('');
}
// Recompute the cards and the open jury card from the current facts.
function refreshFacts() {
  refreshCards();
  state.active = state.cards.find(c => c.id === state.active.id) || state.active;
  renderLines();
  if (juryAns) $('seats').querySelectorAll('.seat').forEach(el => paintSeat(el, el.dataset.seat));
}

export async function openJury(card, openWhy) {
  const run = ++juryRun;
  state.active = card; juryAns = null;
  show('jury');
  $('juryTitle').textContent = card.title;
  $('verdict').hidden = true; $('juryLabel').textContent = ''; $('disagree').hidden = true;
  $('objText').value = '';
  renderLines();
  const seatsEl = $('seats');
  const info = ruleInfo(card);
  $('whyBox').open = !!openWhy;
  $('whyBody').innerHTML = `<p>${esc(info.text)}</p><p>${info.url ? `<a href="${esc(info.url)}" target="_blank" rel="noopener">${esc(info.label)}</a>` : esc(info.label)}</p><p>Checked ${CHECKED_ON}, against the sources shown.</p>`;
  const seats = card.seats || SEATS_BIZ;
  $('argue').hidden = seats === SEATS_STUDENT;
  seatsEl.innerHTML = seats.map(k => `<div class="seat" data-seat="${k}">${liveOn() ? thinkingSeat(k) : `<div class="seat-head">${ICONS[SEAT_ICON[k]]}${k[0].toUpperCase() + k.slice(1)}<span class="seat-kind">Thinking…</span></div>`}</div>`).join('');
  if (liveOn()) seatsEl.querySelectorAll('.seat').forEach(el => requestAnimationFrame(() => el.classList.add('show')));
  const o = $('juryOllie');
  setPose(o, 7);
  o.classList.remove('cross-mid'); void o.offsetWidth;
  o.style.setProperty('--cross', (seats.length * 0.45 + 1).toFixed(2) + 's');
  o.classList.add('cross-mid');
  o.onanimationend = e => { if (e.target === o) setState(o, 'idle'); };
  setState(o, 'walk');

  setWaiting(liveOn());
  const pending = getJuryAnswer(card.juryType, factsWith(card), { live: liveOn() });
  const ans = labelled(await pending);
  if (run !== juryRun) return;
  setWaiting(false);
  juryAns = ans;
  for (const seat of seats) {
    await wait(reduceMotion() ? 30 : 450);
    if (run !== juryRun) return;
    const el = seatsEl.querySelector(`[data-seat="${seat}"]`);
    paintSeat(el, seat);
    requestAnimationFrame(() => el.classList.add('show'));
  }
  await wait(300);
  if (run !== juryRun) return;
  const v = $('verdict'); v.innerHTML = `<b>Verdict</b>${esc(ans.verdict)}`; v.hidden = false;
  setPose($('juryOllie'), 3); setState($('juryOllie'), 'happy');
  setJuryLabel(ans); showDisagree(); state.opinion[card.id] = ans.source;
}
// Student facts for live mode: counts and missing topics only, never the essay text or file contents.
function studentFactsFor(card) {
  const { brief: b, check: c, deadlines: dl } = state.results;
  if (card.id === 'brief') return { wordCount: c.wordCount, minWords: b.minWords, maxWords: b.maxWords, casesFound: c.casesFound.length, casesRequired: b.casesRequired, missingTopics: c.missing, hasConclusion: c.hasConclusion };
  return { deadlines: dl.map(d => ({ type: d.type, daysLeft: d.daysLeft, status: d.status })), essayDaysLeft: essayDays(), fixesToDo: c ? c.issues.length : 0 };
}
function factsFor(card) {
  if (card.seats === SEATS_STUDENT) return studentFactsFor(card);
  const r = view();
  if (card.id === 'fees') return r.feesAnon.map(f => ({ client: f.client, date: f.date, service: f.service, fee: f.amount, ruleId: f.ruleId }));
  if (card.id === 'chase') return r.chaseAnon.map(c => ({ invoice: c.invoice, customer: c.customer, amount: c.amount, daysLate: c.daysLate, lawApplies: c.lawApplies, interest: c.interest, fixedSum: c.fixedSum }));
  if (card.id === 'subs') return r.subs;
  return { topic: 'statutory sick pay from day one', source: LAW_SOURCE };
}

// Adjust: open the argue box with "Change: " already typed. (Student cards have no re-check, so the box shows only now.)
export function adjustBox() {
  $('argue').hidden = false;
  $('objText').value = 'Change: '; $('objText').focus();
  $('argue').scrollIntoView({ block: 'center' });
}

export function initJury() {
  $('lines').addEventListener('change', e => {
    const inp = e.target.closest('input[data-key]'); if (!inp) return;
    if (inp.checked) state.off.delete(inp.dataset.key); else state.off.add(inp.dataset.key);
    refreshFacts();
  });
  $('recheck').addEventListener('click', async () => {
    const text = $('objText').value.trim();
    if (!text) { toast('Type what you disagree with first, or use the microphone.'); return; }
    if (!juryAns) return;
    const run = ++juryRun, card = state.active;
    const seats = [...$('seats').querySelectorAll('.seat')];
    seats.forEach(el => { el.classList.remove('show'); el.classList.add('re'); });
    setPose($('juryOllie'), 5); setState($('juryOllie'), 'thinking');
    $('verdict').hidden = true;
    const objCtx = { ...state.ctx, fees: view().fees || [], chase: view().chase || [] };
    const learned = M.learnFromObjection(state.mem, card.juryType, text, objCtx, DEMO_TODAY);
    const result = applyObjection(card.juryType, text, objCtx);
    if (learned.rule) { state.mem = learned.mem; saveMind(); toast('✦ Ollie learned: ' + learned.rule.text); }
    if (result.changed) {
      const keepF = new Set(result.ctx.fees.map(feeKey)), keepC = new Set(result.ctx.chase.map(chaseKey));
      state.ctx.fees = state.ctx.fees.filter(f => keepF.has(feeKey(f)) || state.off.has(feeKey(f)));
      state.ctx.chase = state.ctx.chase.filter(c => keepC.has(chaseKey(c)) || state.off.has(chaseKey(c)));
      if (learned.rule) { state.ctx = M.applyRules(state.mem, state.ctx); refreshMind(); }
      refreshFacts();
      if (liveOn()) {
        seats.forEach(el => { el.innerHTML = thinkingSeat(el.dataset.seat); el.classList.remove('re'); el.classList.add('show'); });
        setWaiting(true);
        juryAns = labelled(await getJuryAnswer(card.juryType, factsWith(state.active), { live: true }));
        setWaiting(false);
      }
      if (run !== juryRun) return;
    }
    for (const el of seats) {
      await wait(reduceMotion() ? 30 : 320);
      if (run !== juryRun) return;
      el.classList.remove('re'); paintSeat(el, el.dataset.seat);
      requestAnimationFrame(() => el.classList.add('show'));
    }
    const v = $('verdict'); v.innerHTML = `<b>Verdict</b>${esc(result.reply)}`; v.hidden = false;
    setJuryLabel(juryAns); showDisagree();
    setPose($('juryOllie'), 3); setState($('juryOllie'), learned.rule ? 'learned' : 'happy');
    $('objText').value = '';
  });
  $('juryBack').addEventListener('click', () => { juryRun++; toSession(); });
  $('juryApprove').addEventListener('click', () => { pickCard(state.active.id); state.cheer = true; openDraft(state.active); });
  $('juryAdjust').addEventListener('click', adjustBox);
  $('juryEscalate').addEventListener('click', () => openEscalate(state.active));
  attachMic($('objMic'), $('objText'));
}

export function resetJury() { juryRun++; }
