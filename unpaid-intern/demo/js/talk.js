// Talk to Ollie: pure logic, no DOM. Keyword matching only, so every number comes from the checked results.
import { BASE_RATE_EXAMPLE } from './rules.js';

// The new-law item lives here so app.js and Talk use one source.
export const LAW_SOURCE = 'gov.uk: sick pay changes in force 6 April 2026 (Employment Rights Act 2025)';
export const LAW_URL = 'https://www.gov.uk/government/news/millions-of-workers-get-new-access-to-sick-pay-and-parental-leave';
export const LAW_TITLE = 'New-law radar';
export const LAW_TEXT = 'Since 6 April 2026, statutory sick pay starts from the first day off sick, with no waiting days.';

const gbp = n => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const clone = x => JSON.parse(JSON.stringify(x));
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);

export function buildContext({ fees, chase, subs, business }) {
  return clone({
    fees: fees || [], chase: chase || [], subs: subs || { priceRises: [], duplicates: [] }, business: business || '',
    law: { title: LAW_TITLE, text: LAW_TEXT, url: LAW_URL, label: LAW_SOURCE },
  });
}

/* ---------- matching helpers ---------- */
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'the']);
const cleanName = n => n.toLowerCase().replace(/\b(ltd|limited|co|company|plc)\b\.?/g, '').replace(/\s+/g, ' ').trim();
const firstToken = n => cleanName(n).split(' ').find(w => !TITLES.has(w) && w.length >= 4) || '';
const hasWord = (lc, w) => !!w && new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(lc);
const mentions = (lc, name) => { const c = cleanName(name); return hasWord(lc, c) || hasWord(lc, firstToken(name)); };

function invoiceNo(lc) {
  const m = lc.match(/\binv-?\s?(\d+)/);
  return m ? 'INV-' + m[1] : '';
}
function findChase(lc, ctx) {
  const no = invoiceNo(lc);
  if (no) { const hit = ctx.chase.find(c => c.invoice === no); if (hit) return hit; }
  return ctx.chase.find(c => mentions(lc, c.customer)) || null;
}
function findFee(lc, ctx) {
  return ctx.fees.find(f => mentions(lc, f.client)) || null;
}

const KW = {
  fees: /\b(fresha|fee|overcharg|new client|booking)/,
  chase: /\b(invoice|late|overdue|owe|paid|interest|inv-|chase|reminder|customer)/,
  subs: /\b(subscription|save|saving|cancel|bookkeep|cloud|storage|price)/,
  law: /\b(sick|ssp|law|employment|staff|new rule)/,
  draft: /\b(write|draft|email|reminder|letter|send)/,
};

function explainChaseOne(c) {
  if (!c.lawApplies) {
    return `${c.invoice} is for ${c.customer}, a consumer: ${gbp(c.amount)}, ${plural(c.daysLate, 'day', 'days')} late. The late payment law covers business-to-business debts only, so send a friendly reminder with no added charges.`;
  }
  const rate = BASE_RATE_EXAMPLE + 8;
  return `${c.invoice} (${c.customer}): ${gbp(c.amount)}, ${plural(c.daysLate, 'day', 'days')} late. Interest is ${gbp(c.interest)}. It is worked out as the Bank of England base rate (example ${BASE_RATE_EXAMPLE}%) + 8% = ${rate}% a year, for ${plural(c.daysLate, 'day', 'days')}, simple interest. The fixed sum is ${gbp(c.fixedSum)}, so ${gbp(c.total)} in total.`;
}

function feesText(ctx) {
  if (!ctx.fees.length) return "I haven't found any wrong Fresha fees. If you haven't added a Fresha statement yet, add it under Files.";
  const total = sum(ctx.fees, f => f.amount);
  const list = ctx.fees.map(f => `- ${f.client}, ${short(f.date)}: ${gbp(f.amount)}. ${f.reason}`).join('\n');
  return `Fresha charged ${plural(ctx.fees.length, 'new-client fee', 'new-client fees')} it shouldn't have, ${gbp(total)} in total:\n${list}\nFresha's partner terms give 10 days from the statement to dispute; check yours.`;
}

function chaseText(ctx, lc) {
  if (!ctx.chase.length) return "I haven't found any overdue invoices. If you haven't added your invoices yet, add them under Files.";
  const one = findChase(lc, ctx);
  if (one) return explainChaseOne(one);
  const biz = ctx.chase.filter(c => c.lawApplies), cons = ctx.chase.filter(c => !c.lawApplies);
  const lines = [];
  if (biz.length) {
    lines.push(`${plural(biz.length, 'business invoice is', 'business invoices are')} overdue, ${gbp(sum(biz, c => c.total))} in total with interest and fixed sums:`);
    biz.forEach(c => lines.push(`- ${c.invoice}, ${c.customer}: ${plural(c.daysLate, 'day', 'days')} late, ${gbp(c.amount)} plus ${gbp(c.interest)} interest and ${gbp(c.fixedSum)} fixed, ${gbp(c.total)} in total`));
  }
  cons.forEach(c => lines.push(`- ${c.invoice}, ${c.customer}: ${plural(c.daysLate, 'day', 'days')} late, ${gbp(c.amount)}. A consumer, so reminder only: the late payment law covers business-to-business debts only.`));
  return lines.join('\n');
}

function subsText(ctx) {
  const rise = ctx.subs.priceRises[0], dup = ctx.subs.duplicates[0];
  const parts = [];
  if (rise) parts.push(`${rise.merchant} went up from ${gbp(rise.from)} to ${gbp(rise.to)} a month (${Math.round(rise.increasePct)}% more).`);
  if (dup) parts.push(`${dup.merchants.join(' and ')} do the same job (${dup.category}), ${gbp(dup.monthlyTotal)} a month together. Cancelling the cheaper one saves ${gbp(dup.saving)} a month.`);
  return parts.length ? parts.join('\n') : "I haven't found any price rises or doubled-up plans. If you haven't added a bank statement yet, add it under Files.";
}

const lawText = ctx => `${ctx.law.text} I've drafted a staff policy you can adjust.\nSource: ${ctx.law.label}.`;

const HELP = "I can help with:\n- your Fresha fees\n- late invoices and the interest on them\n- subscriptions and what you could save\n- the new sick pay rule\nTry asking:\n- How much did Fresha overcharge me?\n- Which invoices are late?\n- Write the reminder to Lumen Studio";

export function answer(text, ctx) {
  const lc = String(text || '').toLowerCase();
  const chaseHit = findChase(lc, ctx);
  const feeHit = findFee(lc, ctx);

  if (KW.draft.test(lc)) {
    let card = 'fees';
    if (chaseHit || KW.chase.test(lc)) card = 'chase';
    else if (KW.subs.test(lc)) card = 'subs';
    else if (KW.law.test(lc)) card = 'law';
    return { text: "Here's a draft. Nothing is sent until you press Send.", topic: 'draft', action: { type: 'draft', card } };
  }
  if (chaseHit) return { text: chaseText(ctx, lc), topic: 'chase' };
  if (feeHit || KW.fees.test(lc)) return { text: feesText(ctx), topic: 'fees' };
  if (KW.chase.test(lc)) return { text: chaseText(ctx, lc), topic: 'chase' };
  if (KW.subs.test(lc)) return { text: subsText(ctx), topic: 'subs' };
  if (KW.law.test(lc)) return { text: lawText(ctx), topic: 'law' };
  return { text: HELP, topic: 'help' };
}

/* ---------- arguing with the jury ---------- */
const NEW_WORDS = /\b(new|first time|never been)\b/;
const PAID_WORDS = /\b(paid|settled)\b/;

export function applyObjection(cardType, text, ctx) {
  const lc = String(text || '').toLowerCase();
  const next = clone(ctx);

  if (cardType === 'fees') {
    const hit = findFee(lc, ctx);
    const negated = hit && (new RegExp('\\b(not|remove)\\s+' + (cleanName(hit.client).split(' ')[0]).replace(/[^a-z]/g, '')).test(lc)
      || new RegExp('\\b(not|remove)\\s+' + cleanName(hit.client)).test(lc));
    if (hit && (NEW_WORDS.test(lc) || negated)) {
      next.fees = next.fees.filter(f => f.client !== hit.client);
      const total = sum(next.fees, f => f.amount);
      return { changed: true, ctx: next, reply: `Fair point. I've taken ${hit.client} off. That leaves ${plural(next.fees.length, 'fee', 'fees')}, ${gbp(total)}.` };
    }
    return { changed: false, ctx: next, reply: "I flag a new-client fee when the client was already on your list or booked through your own profile link, which is Fresha's own rule. I couldn't match that to a client I flagged, so the result stands. You can untick any line yourself." };
  }

  if (cardType === 'chase') {
    const hit = findChase(lc, ctx);
    if (hit && PAID_WORDS.test(lc)) {
      next.chase = next.chase.filter(c => c.invoice !== hit.invoice);
      const owed = sum(next.chase, c => c.total);
      return { changed: true, ctx: next, reply: `Good news. I've taken ${hit.invoice} off. That leaves ${plural(next.chase.length, 'overdue invoice', 'overdue invoices')}, ${gbp(owed)} owed in total.` };
    }
    return { changed: false, ctx: next, reply: "I list an invoice when it isn't marked paid and its due date has passed. If one has been paid, name the invoice and say it's paid and I'll take it off. You can also untick any line yourself." };
  }

  return { changed: false, ctx: next, reply: "This one comes straight from the source shown under Why?, so I can't change it from here. You have the final say: read the draft and edit it before you use it." };
}
