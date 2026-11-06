// Three student jobs as pure functions: the tenancy deposit, the bursary and the payslip. No DOM, no network.
// Dates are YYYY-MM-DD and compared in UTC. Rates are the April 2026 National Minimum Wage rates (GOV.UK).

const DAY = 86400000;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = n => String(n).padStart(2, '0');
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const utc = iso => Date.parse(iso + 'T00:00:00Z');
const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / DAY);

// Weekends are skipped. Bank holidays are not counted in the demo.
export function addWorkingDays(iso, n) {
  let t = utc(iso), left = n;
  while (left > 0) {
    t += DAY;
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) left--;
  }
  return new Date(t).toISOString().slice(0, 10);
}
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}

/* ---------- deposit (Scotland) ---------- */
export function depositCheck(lease, todayISO) {
  const tribunalBy = addMonths(lease.end, 3);
  return {
    protectBy: addWorkingDays(lease.start, 30),
    protected: (lease.schemes_checked || []).some(s => s.found),
    tribunalBy,
    daysLeft: daysBetween(todayISO, tribunalBy),
    maxAward: round2(Number(lease.deposit) * 3),
  };
}

/* ---------- bursary ---------- */
export function fundingCheck(letterText, bankRows, todayISO) {
  const t = String(letterText);
  const each = t.match(/£\s?(\d[\d,]*(?:\.\d+)?)\s+each time/i) || t.match(/£\s?(\d[\d,]*(?:\.\d+)?)/);
  const amount = each ? round2(Number(each[1].replace(/,/g, ''))) : null;
  const after = t.slice(Math.max(0, t.search(/payment dates/i)));
  const dates = [...after.matchAll(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi)]
    .map(m => `${m[3]}-${pad(MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${pad(+m[1])}`);
  const payments = dates.map(date => {
    const paid = (bankRows || []).some(r => {
      const lag = daysBetween(date, String(r.date).slice(0, 10));
      return /BURSARY/i.test(r.description || '') && Math.abs(Number(r.amount) - amount) < 0.005 && lag >= 0 && lag <= 3;
    });
    if (paid) return { date, status: 'paid' };
    const gap = daysBetween(date, todayISO);
    return gap > 0 ? { date, status: 'missing', daysLate: gap } : { date, status: 'upcoming', daysLeft: -gap };
  });
  return { amount, payments };
}

/* ---------- payslip ---------- */
export function minimumWage({ age, apprentice_year }) {
  if (apprentice_year != null && (age < 19 || apprentice_year === 1)) return 8;
  if (age >= 21) return 12.71;
  if (age >= 18) return 10.85;
  return 8;
}
export function payslipCheck(p) {
  const minRate = minimumWage(p), rate = Number(p.hourly_rate), hours = Number(p.hours);
  const rateOk = rate >= minRate;
  return {
    minRate, rateOk,
    underpaid: rateOk ? 0 : round2((minRate - rate) * hours),
    holidayHours: p.irregular_hours ? Math.round(hours * 0.1207) : 0,
    emergencyTax: /(W1|M1|X)$/i.test(String(p.tax_code || '').trim()),
  };
}
