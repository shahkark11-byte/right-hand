// Jury answers. Recorded mode is pre-written; live mode asks a local model on this laptop.
// Only anonymised facts (Client A, B...) are ever put in a prompt.

export const RECORDED_LABEL = 'Recorded AI answers for this demo';
export const LIVE_FAIL_LABEL = 'Live AI not reachable, showing recorded answers';

const RECORDED = {
  fees: {
    law: 'Fresha\'s published rule says no new-client fee applies to clients already on your list or booked through your own profile link. Three of the new-client lines match those two cases.',
    money: 'Three fees add up to £50.00. That is worth a short dispute, and the evidence is already in the statement.',
    wording: 'A polite, specific email: three dated lines, one reason each, and a request for a refund to the next payout.',
    verdict: 'Worth disputing. Send the email once you have checked the three lines.',
  },
  chase: {
    law: 'The late payment law covers business-to-business debts only. Both business invoices are past their due date, so interest and a fixed sum can be claimed. The consumer invoice gets a reminder only.',
    money: 'Interest is small compared with the fixed sums, but both together make a firm, fair reminder. The money owed is the main point.',
    wording: 'Friendly but clear: invoice number, due date, days late, the amount, then the interest and fixed sum, with a payment date.',
    verdict: 'Send the business reminders. Keep the consumer note friendly, with no added charges.',
  },
  subs: {
    law: 'No law is involved in cancelling or switching a subscription. Check the notice terms in your own contract before you cancel.',
    money: 'One subscription rose by 67% and two cloud storage plans do the same job. Dropping the cheaper storage plan saves £5.99 a month.',
    wording: 'A short note asking the accounting provider to explain the rise, plus a cancellation note for the duplicate storage plan.',
    verdict: 'Ask about the rise first, then cancel the duplicate. Both are small, easy wins.',
  },
  law: {
    law: 'gov.uk says the sick pay changes in the Employment Rights Act 2025 came into force on 6 April 2026: pay now starts from the first day off sick, with no waiting days.',
    money: 'No cost to you today. A written policy now avoids a scramble when your staff start to ask.',
    wording: 'A one-page staff policy in plain words: when pay starts, how to report, who to tell.',
    verdict: 'Policy drafted. Read it, adjust it to your business and keep the source with it.',
  },
};

// Student cards: seats are Tutor, Honesty and Wellbeing. Written for the example files.
const RECORDED_STUDENT = {
  brief: {
    tutor: 'The brief asks for 600 to 800 words, three decided cases, four topics and a conclusion. The draft is under on words and cases, and two topics are not covered yet.',
    honesty: 'This only checks your draft against the brief. It never writes or suggests any of your essay, so the work stays yours.',
    wellbeing: 'Eight days is enough time if you spread the fixes out. Five small jobs is better than one long night.',
    verdict: 'Use the fix list as your to-do list. The writing is yours to do.',
  },
  deadlines: {
    tutor: 'The dates come straight from your deadlines file. The essay is the biggest piece of work, with the presentation three days before it.',
    honesty: 'Nothing here is written for you. It is a list of dates and how many days are left.',
    wellbeing: 'Two items land within a few days of each other, so start the essay fixes early. One thing is overdue and quick to sort out.',
    verdict: 'Do the overdue item first, then keep the checklist handy.',
  },
  wellbeing: {
    tutor: 'The plan fits the fixes from your brief check around the dates in your deadlines file.',
    honesty: 'The plan lists jobs, not essay text. It never writes your work.',
    wellbeing: 'One task a day keeps the load light. Move a task to another day if you need a break.',
    verdict: 'A calm plan: one job a day, with room to move things around.',
  },
};
const STUDENT_SEATS = ['tutor', 'honesty', 'wellbeing'];

// Is the local model reachable? Used at start so Live can be the default. Never throws.
export async function probeLive(ms = 1500) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return (await fetch('http://localhost:11434/api/tags', { signal: ctl.signal })).ok; } catch { return false; } finally { clearTimeout(timer); }
}

export function stripThink(text) {
  return String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function buildPrompt(cardType, facts) {
  if (RECORDED_STUDENT[cardType]) return [
    'You are a jury of three seats checking the work plan of a student. Use ONLY the facts below.',
    'Seats: tutor (does it fit the brief and level), honesty (checks only, never writes the work), wellbeing (workload and timing).',
    'Answer with JSON only: {"tutor":"...","honesty":"...","wellbeing":"...","verdict":"...","disagreement":"..."}.',
    'disagreement: say in one short sentence where the three seats do not fully agree, or "none" if they agree.',
    'One short sentence per field. British English. Never write any essay text. Do not call anything tutor-approved, legal or other advice.',
    'Card type: ' + cardType,
    'Facts (counts only, no essay text): ' + JSON.stringify(facts),
  ].join('\n');
  return [
    'You are a jury of three seats checking a small-business finding. Use ONLY the facts below.',
    'Seats: law (does the cited rule fit), money (is it worth doing), wording (how to say it).',
    'Answer with JSON only: {"law":"...","money":"...","wording":"...","verdict":"...","disagreement":"..."}.',
    'disagreement: say in one short sentence where the three seats do not fully agree, or "none" if they agree.',
    'One short sentence per field. British English. Do not call anything legal or financial advice.',
    'Card type: ' + cardType,
    'Facts (names hidden): ' + JSON.stringify(facts),
  ].join('\n');
}

// Talk screen, live mode: one short answer from the local model. Anonymised facts and the question only.
// Returns the text, or '' on any failure so the caller keeps its own help text.
export async function askLive(question, anonymisedFacts) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const prompt = [
      'You are Ollie, a friendly helper for a small business owner. Use ONLY the facts below and invent no numbers.',
      'Answer in two short sentences in British English. Do not call anything legal or financial advice.',
      'Facts (names hidden): ' + JSON.stringify(anonymisedFacts),
      'Question: ' + question,
    ].join('\n');
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST', signal: ctl.signal,
      body: JSON.stringify({ model: 'qwen3:8b', prompt, stream: false }),
    });
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    return stripThink(data.response);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

export async function getJuryAnswer(cardType, anonymisedFacts, { live = false } = {}) {
  const student = !!RECORDED_STUDENT[cardType];
  const recorded = RECORDED_STUDENT[cardType] || RECORDED[cardType] || RECORDED.fees;
  if (!live) return { ...recorded, label: RECORDED_LABEL, source: 'recorded' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45000);
  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      signal: ctl.signal,
      // think:false and format:json make the answer much shorter and faster than the model's default long reasoning.
      body: JSON.stringify({ model: 'qwen3:8b', prompt: buildPrompt(cardType, anonymisedFacts), stream: false, think: false, format: 'json', options: { num_predict: 300, temperature: 0.2 } }),
    });
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    const clean = stripThink(data.response);
    const json = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
    const out = {};
    for (const k of [...(student ? STUDENT_SEATS : ['law', 'money', 'wording']), 'verdict']) {
      if (typeof json[k] !== 'string' || !json[k]) throw new Error('missing ' + k);
      out[k] = json[k];
    }
    // Optional: where the seats disagree. "none" (or nothing) means they agree.
    const dis = typeof json.disagreement === 'string' ? json.disagreement.trim() : '';
    if (dis && !/^none\.?$/i.test(dis)) out.disagreement = dis;
    return { ...out, label: 'Live answers from a local AI model on this laptop', source: 'live' };
  } catch {
    return { ...recorded, label: LIVE_FAIL_LABEL, source: 'recorded' };
  } finally {
    clearTimeout(timer);
  }
}
