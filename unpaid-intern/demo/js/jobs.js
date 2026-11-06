// The new jobs, as pure functions: no DOM, no network. Dates are YYYY-MM-DD and compared in UTC.
// Letter reading, Companies House penalties, the shop website and grant matching.

const DAY = 86400000;
const utc = iso => Date.parse(iso + 'T00:00:00Z');
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = n => String(n).padStart(2, '0');

export function daysBetween(fromISO, toISO) {
  return Math.round((utc(toISO) - utc(fromISO)) / DAY);
}

/* ---------- letters ---------- */
const line = (text, label) => (String(text).match(new RegExp('^' + label + ':[ \\t]*(.+)$', 'im')) || [])[1]?.trim() || null;

export function readLetter(text) {
  const t = String(text);
  const money = t.match(/£\s?(\d[\d,]*(?:\.\d+)?)/);
  const by = t.match(/\bby (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})/i);
  let deadline = null, action = null;
  if (by) {
    deadline = `${by[3]}-${pad(MONTHS.indexOf(by[2].toLowerCase()) + 1)}-${pad(+by[1])}`;
    action = t.split(/(?<=[.!?])\s+/).find(s => s.includes(by[0])) || null;
    if (action) action = action.replace(/\s+/g, ' ').trim();
  }
  return { from: line(t, 'From'), subject: line(t, 'Subject'), amount: money ? Number(money[1].replace(/,/g, '')) : null, deadline, action };
}

/* ---------- Companies House late filing (private company, GOV.UK table dated 16 Jan 2026) ---------- */
const BANDS = [[1, 150], [3, 375], [6, 750]];
const TOP_BAND = 1500;

// The due date plus n calendar months, with the day clamped to the length of that month.
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}

export function latePenalty(dueISO, filedISO) {
  if (utc(filedISO) <= utc(dueISO)) return 0;
  const band = BANDS.find(([months]) => utc(filedISO) <= utc(addMonths(dueISO, months)));
  return band ? band[1] : TOP_BAND;
}

export function companyDeadlines(company, todayISO) {
  const make = (what, due, withPenalty) => {
    const daysLeft = daysBetween(todayISO, due), overdue = daysLeft < 0;
    return { what, due, daysLeft, overdue, penalty: withPenalty && overdue ? latePenalty(due, todayISO) : 0 };
  };
  const items = [];
  if (company.accounts_due) items.push(make('Accounts', company.accounts_due, true));
  if (company.confirmation_due) items.push(make('Confirmation statement', company.confirmation_due, false));
  return { name: company.name || '', number: company.number || '', strikeOff: !!company.gazette_notice, gazetteDate: company.gazette_date || null, items };
}

/* ---------- the shop website ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money2 = v => '£' + (Number(v) || 0).toFixed(2);

export function buildSite(info, priceRows) {
  const rows = (priceRows || []).map(r => `<tr><td>${esc(r.service)}</td><td class="p">${money2(r.price)}</td></tr>`).join('');
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(info.name)}</title>
<style>
:root{--ink:#16181D;--cream:#F6F1E3;--paper:#FBFAF7;--deep:#1F2B12;--olive:#5E7A2E;--gold:#E3A51F;--line:#E3DCCB}
*{box-sizing:border-box}
body{margin:0;background:var(--cream);color:var(--ink);font:400 16px/1.618 Inter,system-ui,-apple-system,'Segoe UI',sans-serif}
header{background:var(--deep);color:var(--cream);padding:34px 21px 29px}
header p{margin:0;font:500 12px/1.4 'JetBrains Mono',ui-monospace,Consolas,monospace;letter-spacing:.09em;text-transform:uppercase;color:#A9C25B}
h1{margin:8px 0 0;font:400 42px/1.236 'Instrument Serif',Georgia,serif}
main{padding:21px}
h2{margin:0 0 13px;font:400 26px/1.236 'Instrument Serif',Georgia,serif}
.card{background:var(--paper);border:1px solid var(--line);border-radius:13px;padding:21px;margin-bottom:21px}
table{width:100%;border-collapse:collapse}
td{padding:8px 0;border-bottom:1px solid var(--line)}
tr:last-child td{border-bottom:0}
td.p{text-align:right;font-weight:500;white-space:nowrap}
.hours,.phone{margin:0 0 5px}
footer{padding:0 21px 34px;font:500 12px/1.4 'JetBrains Mono',ui-monospace,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase;color:#5B6152}
</style></head>
<body>
<header><p>${esc(info.town)}</p><h1>${esc(info.name)}</h1></header>
<main>
<section class="card"><h2>Prices</h2><table>${rows}</table></section>
<section class="card"><h2>Come and see us</h2>
<p class="hours">${esc(info.hours)}</p>
<p class="phone">${esc(info.phone)}</p>
<p class="hours">${esc(info.town)}</p></section>
</main>
<footer>Made and kept up to date by Unpaid Intern · EXAMPLE</footer>
</body></html>`;
}

/* ---------- grants ---------- */
export function matchGrants(rows, org, todayISO) {
  const fits = (rows || []).filter(g => String(g.for).split('|').map(x => x.trim().toLowerCase()).includes(String(org.type).toLowerCase()));
  const shape = g => ({ name: g.name, max: Number(g.max_amount), opens: g.opens, closes: g.closes, link: g.link });
  const open = fits.filter(g => g.opens <= todayISO && todayISO <= g.closes)
    .map(g => ({ ...shape(g), daysLeft: daysBetween(todayISO, g.closes) }))
    .sort((a, b) => a.closes.localeCompare(b.closes));
  const soon = fits.filter(g => g.opens > todayISO && daysBetween(todayISO, g.opens) <= 60)
    .map(g => ({ ...shape(g), opensIn: daysBetween(todayISO, g.opens) }))
    .sort((a, b) => a.opens.localeCompare(b.opens));
  return { open, soon };
}
