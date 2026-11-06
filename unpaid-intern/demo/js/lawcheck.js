// The Scots law check: grade an answer against a rubric. Pure logic, no DOM, no network.
// Format copied from the open legal benchmark Harvey LAB (MIT licence): every rubric item must pass.
// Items: { all: [phrases] } every phrase appears; { any: [phrases] } at least one appears; { none: [phrases] } none appears. Case is ignored.
const has = (text, p) => text.includes(String(p).toLowerCase());
const passes = (text, item) => (item.all ? item.all.every(p => has(text, p)) : true)
  && (item.any ? item.any.some(p => has(text, p)) : true)
  && (item.none ? !item.none.some(p => has(text, p)) : true);

export function grade(answer, rubric) {
  const text = String(answer || '').toLowerCase();
  const missed = [];
  rubric.forEach((item, i) => { if (!passes(text, item)) missed.push(i); });
  return { pass: missed.length === 0, passed: rubric.length - missed.length, total: rubric.length, missed };
}

export function gradeAll(tests, answersById) {
  const results = tests.map(t => { const g = grade(answersById[t.id] || '', t.rubric); return { id: t.id, pass: g.pass, missed: g.missed }; });
  return { score: results.filter(r => r.pass).length, total: results.length, results };
}
