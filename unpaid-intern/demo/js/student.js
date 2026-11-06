// Student pack: pure logic, no DOM. It checks work against a brief and never writes any of it.
// Every number comes from the files, so nothing is invented.

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const STOP_WORDS = new Set(['In', 'See', 'The', 'As', 'Following', 'Under']);
const DAY = 86400000;

const clone = x => JSON.parse(JSON.stringify(x));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const short = iso => new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const inDays = n => n === 0 ? 'today' : 'in ' + plural(n, 'day', 'days');

/* ---------- brief ---------- */
export function parseBrief(text) {
  const t = String(text || '');
  const line = label => { const m = t.match(new RegExp('^\\s*' + label + '\\s*:\\s*(.+)$', 'im')); return m ? m[1].trim() : ''; };
  const wc = t.match(/word count\s*:\s*([\d,]+)\s*(?:-|\u2013|\u2014|to)\s*([\d,]+)/i);
  const num = s => Number(s.replace(/,/g, ''));
  const cm = t.match(/at least\s+(\w+)\s+(?:decided\s+|reported\s+)?cases?/i);
  const casesRequired = cm ? (/^\d+$/.test(cm[1]) ? Number(cm[1]) : NUMBER_WORDS[cm[1].toLowerCase()] || 0) : 0;
  const cover = line('must cover');
  const dm = t.match(/deadline\s*:\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/i);
  return {
    title: line('assignment'),
    unit: line('unit'),
    minWords: wc ? num(wc[1]) : 0,
    maxWords: wc ? num(wc[2]) : 0,
    casesRequired,
    mustCover: cover ? cover.split(';').map(s => s.trim().toLowerCase()).filter(Boolean) : [],
    deadline: dm ? dm[1] + 'T' + (dm[2] || '00:00') : '',
    needsConclusion: /conclusion/i.test(t),
  };
}

/* ---------- draft ---------- */
function findCases(text) {
  const re = /\b([A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+)*)\s+v\s+([A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+)*)/g;
  const found = [];
  for (const m of text.matchAll(re)) {
    let left = m[1].split(/\s+/);
    if (left.length > 1 && STOP_WORDS.has(left[0])) left = left.slice(1);
    const name = left.join(' ') + ' v ' + m[2];
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

export function checkDraft(brief, text) {
  const t = String(text || '');
  const wordCount = t.split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length;
  const wordStatus = wordCount < brief.minWords ? 'under' : wordCount > brief.maxWords && brief.maxWords ? 'over' : 'ok';
  const casesFound = findCases(t);
  const casesShort = Math.max(0, brief.casesRequired - casesFound.length);
  const lc = t.toLowerCase();
  const covered = brief.mustCover.filter(p => lc.includes(p));
  const missing = brief.mustCover.filter(p => !lc.includes(p));
  const hasConclusion = /conclusion/i.test(t);

  const issues = [];
  if (wordStatus !== 'ok') issues.push({ id: 'words', text: `${wordCount} words. The brief asks for ${brief.minWords} to ${brief.maxWords}.` });
  if (casesShort) issues.push({ id: 'cases', text: `${plural(casesFound.length, 'case', 'cases')} cited. The brief asks for at least ${brief.casesRequired}.` });
  for (const m of missing) issues.push({ id: 'topic:' + m, text: `${m[0].toUpperCase() + m.slice(1)} isn't covered yet.` });
  if (brief.needsConclusion && !hasConclusion) issues.push({ id: 'conclusion', text: 'No conclusion yet.' });
  return { wordCount, wordStatus, casesFound, casesShort, covered, missing, hasConclusion, issues };
}

/* ---------- deadlines ---------- */
export function deadlines(rows, today) {
  const t0 = Date.parse(today.slice(0, 10) + 'T00:00:00Z');
  return rows.filter(r => r.title && r.due).map(r => {
    const daysLeft = Math.round((Date.parse(r.due.slice(0, 10) + 'T00:00:00Z') - t0) / DAY);
    return { title: r.title, type: r.type || '', due: r.due, daysLeft, status: daysLeft < 0 ? 'overdue' : daysLeft <= 7 ? 'soon' : 'later' };
  }).sort((a, b) => a.due.localeCompare(b.due));
}

/* ---------- study pack (exactly these sources, checked by the planner) ---------- */
const NEGLIGENCE = {
  topic: 'Negligence (Scots law)',
  sources: [
    { title: 'Donoghue v Stevenson [1932] UKHL 100: the neighbour principle (the judgment itself)', url: 'https://www.bailii.org/uk/cases/UKHL/1932/100.html', trust: 'court', note: 'Duty of care' },
    { title: 'Muir v Glasgow Corporation [1943] UKHL 2: the reasonable person standard', url: 'https://www.bailii.org/uk/cases/UKHL/1943/2.html', trust: 'court', note: 'Breach of duty' },
    { title: 'Hughes v Lord Advocate [1963] UKHL 8: foreseeable type of harm', url: 'https://www.bailii.org/uk/cases/UKHL/1963/8.html', trust: 'court', note: 'Remoteness of damage' },
    { title: 'BAILII OpenLaw: Delict (Scotland) case list', url: 'https://www.bailii.org/openlaw/delict_scotland.html', trust: 'guide', note: 'Find more Scottish cases, including on causation' },
  ],
  quiz: [
    { q: 'Which case set out the "neighbour principle"?', options: ['Donoghue v Stevenson', 'Muir v Glasgow Corporation', 'Hughes v Lord Advocate'], answer: 'Donoghue v Stevenson' },
    { q: 'How is the standard of care judged?', options: ["By what a reasonable person in the defender's position would do", 'By what the defender honestly believed', 'By whether harm actually happened'], answer: "By what a reasonable person in the defender's position would do" },
    { q: 'Why was the manageress in Muir v Glasgow Corporation not liable?', options: ['The accident was not reasonably foreseeable', 'There was no duty of care', 'The children consented'], answer: 'The accident was not reasonably foreseeable' },
    { q: 'What is Hughes v Lord Advocate about?', options: ['Remoteness: the type of harm was foreseeable, even if the exact way it happened was not', 'Duty to consumers', 'The standard of care for professionals'], answer: 'Remoteness: the type of harm was foreseeable, even if the exact way it happened was not' },
    { q: 'What must the pursuer show for causation?', options: ['That the breach caused the loss (the "but for" test)', 'That the defender intended harm', 'That there was a contract'], answer: 'That the breach caused the loss (the "but for" test)' },
  ],
};

export function studyPack(topic) {
  return /negligence/i.test(String(topic || '')) ? clone(NEGLIGENCE) : null;
}

/* ---------- a calm plan: one task a day ---------- */
export function calmPlan(sctx, today) {
  const dl = sctx.deadlines || [], check = sctx.check, brief = sctx.brief;
  const t0 = Date.parse(today + 'T00:00:00Z');
  const dayLabel = n => new Date(t0 + n * DAY).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const essay = brief?.deadline ? Math.round((Date.parse(brief.deadline.slice(0, 10) + 'T00:00:00Z') - t0) / DAY) : null;
  const upcoming = dl.filter(d => d.daysLeft >= 0);
  const last = Math.max(1, essay ?? Math.min(7, ...upcoming.map(d => d.daysLeft)));
  const fixed = {};
  const pres = upcoming.find(d => d.type === 'presentation');
  if (pres && pres.daysLeft >= 1) fixed[pres.daysLeft - 1] = `Run through ${pres.title} once`;
  if (essay !== null && essay >= 1) fixed[essay - 1] = 'Read your essay through once and check it against the brief';
  const queue = [];
  for (const d of dl.filter(x => x.status === 'overdue')) queue.push(`Sort out the overdue item: ${d.title}`);
  if (check) {
    for (const m of check.missing) queue.push(`Look at your notes on ${m}`);
    if (check.casesShort) queue.push(`Find ${plural(check.casesShort, 'more decided case', 'more decided cases')} in your study pack`);
    if (check.wordStatus === 'under') queue.push('Check how far you are from the word count');
    if (brief?.needsConclusion && !check.hasConclusion) queue.push('Plan your conclusion');
  }
  const plan = [];
  for (let n = 0; n <= last; n++) {
    if (fixed[n]) plan.push({ day: dayLabel(n), task: fixed[n] });
    else if (queue.length) plan.push({ day: dayLabel(n), task: queue.shift() });
  }
  if (queue.length && plan.length) plan[plan.length - 1].task += ' · also ' + queue.join('; ');
  return plan;
}

/* ---------- talk ---------- */
export function buildStudentContext({ brief, check, deadlines: dl, level, subject }) {
  return clone({ brief: brief || null, check: check || null, deadlines: dl || [], level: level || '', subject: subject || '', pack: studyPack(brief?.title) });
}

const KW = {
  honesty: /write (my|the) (essay|assignment)|write it for me|do my (assignment|essay)|answer the question for me/,
  brief: /\b(missing|essay|draft|check|word|words|brief|cases)\b/,
  deadline: /\b(deadline|deadlines|due|when|next|week)\b/,
  quiz: /\b(quiz|test me)\b/,
  study: /\b(study|learn|revise|explain|negligence|duty|breach|causation|remoteness)\b/,
};

const REFUSAL = "I can't write it for you; that would break your college's rules and wouldn't help you learn. I can check your draft against the brief, explain the law, or quiz you.";
const HELP = "I can help with:\n- checking your draft against the brief\n- your deadlines\n- explaining the law you're studying\n- a quick quiz\nTry asking:\n- What's missing from my essay?\n- When is my next deadline?\n- Explain causation";

function explain(lc) {
  if (/causation|\bcaus/.test(lc)) return 'Causation: the pursuer must show the breach caused the loss. The usual check is the "but for" test: but for the defender\'s breach, would the loss still have happened?';
  if (/remote/.test(lc)) return "Remoteness of damage: the defender is only liable for the type of harm that was reasonably foreseeable, even if the exact way it happened wasn't (Hughes v Lord Advocate).";
  if (/breach|standard/.test(lc)) return "Breach of duty: the defender fell below the standard of a reasonable person in their position (Muir v Glasgow Corporation).";
  if (/duty/.test(lc)) return 'Duty of care: you must take reasonable care to avoid harm you can reasonably foresee to your neighbour, meaning anyone so closely affected that you ought to have them in mind (Donoghue v Stevenson).';
  return 'Negligence in Scots law has four steps: a duty of care, a breach of that duty, causation of the loss, and loss that is not too remote.';
}

function deadlineText(sctx) {
  const dl = sctx.deadlines;
  if (!dl.length) return "I haven't got your deadlines yet. Add the deadlines file under Files.";
  const next = dl.filter(d => d.daysLeft >= 0), over = dl.filter(d => d.status === 'overdue');
  const lines = [];
  if (next.length) {
    lines.push(`Your next deadline is ${next[0].title}, ${inDays(next[0].daysLeft)} (${short(next[0].due)}).`);
    if (next.length > 1) lines.push('After that: ' + next.slice(1).map(d => `${d.title} ${inDays(d.daysLeft)}`).join('; ') + '.');
  } else lines.push('Nothing is coming up.');
  if (over.length) lines.push('Overdue: ' + over.map(d => d.title).join('; ') + '.');
  return lines.join('\n');
}

export function studentAnswer(text, sctx) {
  const lc = String(text || '').toLowerCase();
  if (KW.honesty.test(lc)) return { text: REFUSAL, topic: 'honesty' };
  if (KW.brief.test(lc)) {
    const c = sctx.check;
    if (!c) return { text: "I need your brief and your draft first. Add them under Files and I'll check one against the other.", topic: 'brief' };
    if (!c.issues.length) return { text: 'Your draft matches the brief on words, cases, topics and conclusion. Read it through once more before you hand it in.', topic: 'brief' };
    const gaps = c.missing.length ? `Topics not covered yet: ${c.missing.join(', ')}.\n` : '';
    return { text: `Here's what I found against the brief (${plural(c.issues.length, 'thing', 'things')} to fix):\n${gaps}` + c.issues.map(i => '- ' + i.text).join('\n'), topic: 'brief' };
  }
  if (KW.deadline.test(lc)) return { text: deadlineText(sctx), topic: 'deadline' };
  if (KW.quiz.test(lc)) return { text: "Here's a 5-question quiz from your study pack.", topic: 'quiz', action: { type: 'quiz' } };
  if (KW.study.test(lc)) return { text: explain(lc) + ' Your study pack has the sources.', topic: 'study' };
  return { text: HELP, topic: 'help' };
}
