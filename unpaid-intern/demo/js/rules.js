// Pure rule functions: no DOM, no network. Everything the report claims as "checked by code" comes from here.

// Example rate only. Update to the current Bank of England base rate before any real use.
export const BASE_RATE_EXAMPLE = 4.0;

export const FRESHA_RULE_URL = 'https://www.fresha.com/help-center/knowledge-base/billing-and-fees/101357-marketplace-new-client-fees';
export const FRESHA_RULE_TEXT = "Fresha's published rule: no new-client fee is charged when the client is already on your Clients list, was imported, or booked through your own profile's Book Now link.";

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

// Reads CSV text into rows. Double-quoted cells may hold commas, "" is a quote, and CRLF line ends are fine.
function splitCells(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); rows.push(row);
  return rows;
}
export function parseCSV(text) {
  const lines = splitCells(String(text)).filter(r => r.some(c => c.trim() !== ''));
  if (!lines.length) return [];
  const head = lines[0].map(h => h.trim());
  return lines.slice(1).map(cells => {
    const row = {};
    head.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

export function anonymise(rows, field) {
  const map = {};
  const seen = {};
  let n = 0;
  const out = rows.map(r => {
    const real = r[field];
    if (!(real in seen)) {
      seen[real] = 'Client ' + String.fromCharCode(65 + (n % 26)) + (n >= 26 ? Math.floor(n / 26) : '');
      map[seen[real]] = real;
      n++;
    }
    return { ...r, [field]: seen[real] };
  });
  return { rows: out, map };
}

export function checkFreshaFees(statementRows, clientRows) {
  const added = {};
  clientRows.forEach(c => { added[c.client] = c.added_on; });
  const flags = [];
  for (const r of statementRows) {
    if (r.fee_type !== 'New client fee') continue;
    const base = {
      client: r.client, date: r.date, service: r.service,
      amount: Number(r.fee_amount), ruleText: FRESHA_RULE_TEXT,
    };
    if (r.booking_source === 'Own profile link') {
      flags.push({ ...base, ruleId: 'FRESHA-OWN-LINK',
        reason: 'Booked through the salon\'s own profile link, which carries no new-client fee.' });
    } else if (added[r.client] && added[r.client] < r.date) {
      flags.push({ ...base, ruleId: 'FRESHA-EXISTING-CLIENT',
        reason: `Already on the salon's client list since ${added[r.client]}.` });
    }
  }
  return flags;
}

const DAY = 86400000;
const dayNum = iso => Date.parse(iso + 'T00:00:00Z') / DAY;

export function lateInterest({ amount, due, today, baseRate }) {
  const daysLate = Math.max(0, Math.round(dayNum(today) - dayNum(due)));
  const rate = baseRate + 8;
  if (daysLate === 0) return { daysLate: 0, rate, interest: 0, fixedSum: 0, total: round2(amount) };
  const interest = round2(amount * (rate / 100) * (daysLate / 365));
  const fixedSum = amount < 1000 ? 40 : amount < 10000 ? 70 : 100;
  return { daysLate, rate, interest, fixedSum, total: round2(amount + interest + fixedSum) };
}

export function chaseInvoices(invoiceRows, { today, baseRate }) {
  return invoiceRows
    .filter(r => r.paid !== 'yes' && r.due < today)
    .map(r => {
      const amount = Number(r.amount);
      const lawApplies = r.customer_type === 'business';
      const base = { invoice: r.invoice, customer: r.customer, amount, due: r.due, lawApplies };
      if (!lawApplies) {
        const daysLate = Math.max(0, Math.round(dayNum(today) - dayNum(r.due)));
        return { ...base, daysLate, interest: 0, fixedSum: 0, total: round2(amount) };
      }
      const l = lateInterest({ amount, due: r.due, today, baseRate });
      return { ...base, daysLate: l.daysLate, interest: l.interest, fixedSum: l.fixedSum, total: l.total };
    });
}

export function findSubscriptionIssues(bankRows) {
  const byMerchant = {};
  for (const r of bankRows) {
    (byMerchant[r.merchant] ||= { category: r.category, rows: [] }).rows.push({ date: r.date, amount: Number(r.amount) });
  }
  const recurring = [];
  for (const [merchant, m] of Object.entries(byMerchant)) {
    const months = new Set(m.rows.map(x => x.date.slice(0, 7)));
    if (months.size < 2) continue;
    const sorted = m.rows.slice().sort((a, b) => a.date.localeCompare(b.date));
    recurring.push({ merchant, category: m.category, first: sorted[0].amount, last: sorted[sorted.length - 1].amount });
  }
  const priceRises = recurring
    .filter(m => m.last > m.first)
    .map(m => ({ merchant: m.merchant, from: m.first, to: m.last,
      increasePct: round2((m.last - m.first) / m.first * 100) }));
  const cats = {};
  recurring.forEach(m => (cats[m.category] ||= []).push(m));
  const duplicates = Object.entries(cats)
    .filter(([, list]) => list.length >= 2)
    .map(([category, list]) => ({
      category,
      merchants: list.map(m => m.merchant),
      monthlyTotal: round2(list.reduce((s, m) => s + m.last, 0)),
      saving: Math.min(...list.map(m => m.last)),
    }));
  return { priceRises, duplicates };
}
