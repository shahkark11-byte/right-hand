// The splash screen and the first chat, which ends by creating the first sessions.
import * as M from '../mind.js';
import * as SS from '../sessions.js';
import { setState } from '../ollie.js';
import { parseCSV } from '../rules.js';
import { $, DEMO_TODAY, esc, reduceMotion, saveMind, state, wait } from './state.js';
import { activateSession, analyse, sx, toSession } from './sessions-ui.js';
import { refreshMind } from './results.js';
import { openBrief } from './brief.js';
import { show } from './nav.js';
import { attachMic } from './talk-ui.js';

const ROLES = [
  { id: 'parent', label: 'Mum or dad' }, { id: 'business', label: 'Business owner' },
  { id: 'worker', label: 'Worker' }, { id: 'student', label: 'Student' },
  { id: 'teacher', label: 'Teacher' }, { id: 'other', label: 'Something else' },
];
const QUESTIONS = {
  business: [
    { q: 'What type of business?', opts: ['Salon or barber', 'Cafe or restaurant', 'Shop', 'Trades', 'Other'], key: 'btype' },
    { q: 'How many staff?', opts: ['Just me', '1-5', '6-20', '20+'], key: 'staff' },
  ],
  parent: [
    { q: 'Children\'s ages?', opts: ['Under 5', '5-11', '12-17', 'Mixed'], key: 'ages' },
    { q: 'Biggest headache?', opts: ['School letters', 'Childcare costs', 'Bills', 'Clubs'], key: 'headache' },
  ],
  worker: [
    { q: 'What kind of job?', opts: ['Office', 'Shop or hospitality', 'Trade', 'Other'], key: 'job' },
    { q: 'Your contract?', opts: ['Full-time', 'Part-time', 'Zero-hours', 'Agency'], key: 'contract' },
  ],
  student: [
    { q: 'Level', opts: ['School', 'College (HNC/HND)', 'University', 'Apprenticeship'], key: 'slevel' },
    { q: 'Subject', text: true, placeholder: 'Legal Services', key: 'ssubject' },
  ],
  teacher: [
    { q: 'What level?', opts: ['Primary', 'Secondary', 'College', 'University'], key: 'tlevel' },
    { q: 'Main subject area?', opts: ['Humanities', 'Science or tech', 'Arts', 'Other'], key: 'tsubject' },
  ],
  other: [
    { q: 'In a few words, what do you need help with?', opts: ['Paperwork', 'Bills', 'Studying', 'Something else'], key: 'other' },
    { q: 'How often will you use it?', opts: ['Daily', 'Weekly', 'Now and then'], key: 'often' },
  ],
};

const CHAT_Q = {
  btype: 'What type of business do you run?', staff: 'How many staff do you have?', ages: 'How old are your children?',
  headache: 'What is your biggest headache?', job: 'What kind of job do you do?', contract: 'What is your contract?',
  slevel: 'What level are you studying at?', ssubject: 'And what is your subject?', tlevel: 'What level do you teach?',
  name: 'What should I call you?', tsubject: 'What is your main subject area?', other: 'In a few words, what do you need help with?', often: 'How often will you use me?',
};
const ROLE_WORDS = {
  parent: ['mum', 'mom', 'dad', 'mother', 'father', 'parent'], business: ['business', 'owner', 'salon', 'barber', 'self-employed', 'cafe', 'trades'],
  worker: ['worker', 'employee', 'employed', 'job', 'work'], student: ['student', 'study', 'studying', 'college', 'uni', 'university', 'school'],
  teacher: ['teacher', 'teach', 'lecturer', 'tutor'], other: ['else', 'other'],
};
const chat = { run: 0, i: 0, marks: [], waiting: null };
export const chatCanBack = () => chat.i > 1;
const chatScroll = () => { const t = $('chatThread'); t.scrollTop = t.scrollHeight; };

function chatSteps() {
  const list = [{ t: 'intro' }, { t: 'q', q: { key: 'name', q: 'What should I call you?', text: true, skip: true, placeholder: 'Your first name' } }, { t: 'roles' }];
  for (const r of ROLES) if (state.roles.has(r.id)) QUESTIONS[r.id].forEach(q => list.push({ t: 'q', q, role: r.id }));
  list.push({ t: 'files' });
  return list;
}
function chatBubble(who, text) {
  const row = document.createElement('div');
  row.className = 'msg ' + (who === 'user' ? 'user' : 'ollie-msg');
  const bubble = document.createElement('div'); bubble.className = 'bubble';
  const t = document.createElement('span'); t.textContent = text; bubble.appendChild(t);
  if (who !== 'user') row.innerHTML = '<span class="ollie p7 av" aria-hidden="true"></span>';
  row.appendChild(bubble);
  $('chatThread').appendChild(row); chatScroll();
  return row;
}
// Ollie's typing dots, then the bubble. Resolves with the row, or null if the chat moved on meanwhile.
async function say(text, run) {
  const typing = document.createElement('div'); typing.className = 'msg ollie-msg';
  typing.innerHTML = '<span class="ollie p7 av" aria-hidden="true"></span><div class="bubble typing" aria-label="Ollie is typing"><i></i><i></i><i></i></div>';
  $('chatThread').appendChild(typing); chatScroll();
  await wait(reduceMotion() ? 60 : 650);
  typing.remove();
  if (run !== chat.run) return null;
  const row = chatBubble('ollie', text);
  setState(row.querySelector('.ollie'), 'talk');
  return row;
}
function ansRow(html) {
  const d = document.createElement('div'); d.className = 'ans'; d.innerHTML = html;
  $('chatThread').appendChild(d); chatScroll();
  return d;
}
function chatNudge(text) { chatBubble('ollie', text); }

async function runStep(i) {
  const run = ++chat.run;
  chat.i = i; chat.waiting = null;
  chat.marks[i] = $('chatThread').children.length;
  $('backBtn').hidden = !chatCanBack();
  const st = chatSteps()[i];
  if (st.t === 'intro') {
    if (!await say("Hi, I'm Ollie, your unpaid intern. I work for free, but I need to get to know you.", run)) return;
    return runStep(1);
  }
  if (st.t === 'roles') {
    state.roles = new Set();
    if (!await say('Who are you? Pick all that fit.', run)) return;
    const ui = ansRow(`<div class="chips" role="group" aria-label="Who are you">${ROLES.map(r => `<button class="chip" type="button" data-id="${r.id}" aria-pressed="false">${r.label}</button>`).join('')}</div><button class="btn primary" type="button" data-done>That's me</button>`);
    chat.waiting = { st, ui };
    return;
  }
  if (st.t === 'q') {
    const row = await say(CHAT_Q[st.q.key] || st.q.q, run);
    if (!row) return;
    if (st.q.text) {
      const form = document.createElement('form'); form.className = 'sub-form';
      form.innerHTML = `<div class="field plain"><input type="text" autocomplete="off" aria-label="${esc(CHAT_Q[st.q.key])}" placeholder="${esc(st.q.placeholder || '')}"></div><button class="btn primary" type="submit">Done</button>${st.q.skip ? '<button class="chip" type="button" data-skip>Skip</button>' : ''}`;
      row.querySelector('.bubble').appendChild(form);
      chat.waiting = { st, ui: form };
    } else {
      chat.waiting = { st, ui: ansRow(`<div class="chips" role="group" aria-label="${esc(CHAT_Q[st.q.key] || st.q.q)}">${st.q.opts.map(o => `<button class="chip" type="button">${o}</button>`).join('')}</div>`) };
    }
    return;
  }
  if (!await say('Last thing: show me your stuff.', run)) return;
  chat.waiting = { st, ui: ansRow('<button class="btn primary" type="button" data-files>Bring my files</button>') };
}

function chatReact(q, val) {
  if (q.key === 'name') return val === 'Skip' ? 'No problem, you can tell me later.' : `Nice to meet you, ${val}.`;
  if (q.key === 'btype') return val === 'Salon or barber' ? 'Nice, a salon.' : val === 'Other' ? 'Good, thanks.' : `Nice, ${val.toLowerCase()}.`;
  if (q.key === 'slevel') return /HNC/.test(val) ? 'HNC, good luck with it.' : `${val.split(' (')[0]}, good luck with it.`;
  if (q.key === 'ssubject') return `${val}. Good choice.`;
  if (q.key === 'staff') return val === 'Just me' ? 'Just you, got it.' : 'Got it.';
  return 'Thanks, noted.';
}
async function chatNext(reaction) {
  const run = chat.run, i = chat.i;
  if (!await say(reaction, run)) return;
  runStep(i + 1);
}
function commitRoles() {
  const w = chat.waiting; if (!w || w.st.t !== 'roles') return;
  chat.waiting = null; w.ui.remove();
  chatBubble('user', ROLES.filter(r => state.roles.has(r.id)).map(r => r.label).join(', '));
  chatNext('Lovely. A couple of quick ones, then.');
}
function commitQ(val) {
  const w = chat.waiting; if (!w || w.st.t !== 'q') return;
  if (w.st.q.key === 'name' && val !== 'Skip') val = val.trim().split(/\s+/)[0];
  state.answers[w.st.q.key] = w.st.q.key === 'name' && val === 'Skip' ? '' : val;
  chat.waiting = null; w.ui.remove();
  chatBubble('user', val);
  chatNext(chatReact(w.st.q, val));
}


function matchOption(text, opts) {
  const t = text.toLowerCase().trim();
  const hit = opts.find(o => o.toLowerCase() === t) || opts.find(o => t.includes(o.toLowerCase()));
  if (hit) return hit;
  const words = t.split(/[^a-z0-9-]+/).filter(w => w.length >= 3);
  return opts.find(o => o.toLowerCase().split(/[^a-z0-9-]+/).filter(w => w.length >= 3 && w !== 'and').some(w => words.includes(w)));
}
function chatHandleText(raw) {
  const text = raw.trim(), w = chat.waiting;
  if (!text || !w) return;
  $('chatInput').value = '';
  const lost = "Sorry, I didn't catch that. Pick one of the buttons, or say it another way.";
  if (w.st.t === 'roles') {
    const t = text.toLowerCase();
    const got = ROLES.filter(r => ROLE_WORDS[r.id].some(k => t.includes(k)));
    if (!got.length) { chatNudge(lost); return; }
    state.roles = new Set(got.map(r => r.id)); commitRoles();
  } else if (w.st.t === 'q') {
    if (w.st.q.text) { commitQ(w.st.q.skip && /^skip$/i.test(text) ? 'Skip' : text); return; }
    const m = matchOption(text, w.st.q.opts);
    if (m) commitQ(m); else chatNudge(lost);
  } else if (/file|yes|ok|sure|bring|show|go/i.test(text)) finishOnboarding();
  else chatNudge(lost);
}
export function chatBack() {
  const t = chat.i - 1; if (t < 1) return;
  const th = $('chatThread');
  while (th.children.length > chat.marks[t]) th.lastElementChild.remove();
  const st = chatSteps()[t];
  if (st.t === 'q') delete state.answers[st.q.key];
  runStep(t);
}
function startChat() {
  $('chatThread').innerHTML = '';
  state.roles = new Set(); state.answers = {}; chat.marks = []; chat.waiting = null;
  runStep(0);
}

/* onboarding ends here: "Getting to know you" becomes the first session, then the first job opens */
async function finishOnboarding() {
  if (sx.finishing) return;
  sx.finishing = true;
  const bizRole = state.roles.has('business');
  const studentOnly = state.roles.has('student') && !bizRole;
  const transcript = [...$('chatThread').querySelectorAll('.msg')].map(r => ({ who: r.classList.contains('user') ? 'me' : 'ollie', text: r.querySelector('.bubble span')?.textContent || '' })).filter(m => m.text);
  const grab = async f => parseCSV(await (await fetch('data/' + f)).text());
  let clients, invoices;
  try { [clients, invoices] = await Promise.all([grab('fresha_clients_EXAMPLE.csv'), grab('invoices_EXAMPLE.csv')]); } catch { /* seed without files */ }
  SS.setOnboarded({ answers: state.answers, roles: [...state.roles] });
  state.mem = M.rememberProfile(state.mem, { roles: [...state.roles], answers: state.answers }, DEMO_TODAY); saveMind();
  state.ready = true;
  const seeded = SS.seedDemoHistory({ onboarding: transcript, clients, invoices });
  if (seeded && studentOnly) SS.deleteSession(seeded.oct.id);   // a student has no use for the invoice history
  else if (seeded) {
    sx.quiet = true;
    try {
      activateSession(seeded.oct.id);
      await analyse(seeded.oct.id, seeded.oct.files.map(f => f.name));
    } finally { sx.quiet = false; }
  }
  const first = SS.createSession('First job');
  SS.addMessage(first.id, { who: 'ollie', text: 'This is your first job. Pick one below, or add a file.' });
  if (seeded && bizRole) {
    // The New-law radar, kept as its own session. Dated a second ahead so it sits above First job.
    const law = SS.createSession('New law: sick pay', { pack: 'law', auto: false, createdAt: new Date(Date.now() + 1000).toISOString() });
    SS.addMessage(law.id, { who: 'ollie', text: 'I keep an eye on new laws for you. One affects your staff.' });
    activateSession(law.id);
    SS.addMessage(law.id, { who: 'ollie', text: '', card: 'law' });
    SS.setResults(law.id, { shown: ['law'] });
  }
  activateSession(first.id);
  refreshMind(); openBrief();
  toSession();
  sx.finishing = false;
}

export function initOnboarding() {
  // The splash: tap to wake Ollie, then the first chat starts.
  let waking = false;
  $('wakeBtn').addEventListener('click', async () => {
    if (waking) return;
    waking = true;
    const o = $('splashOllie');
    o.setAttribute('aria-label', 'Ollie, wide awake');
    await setState(o, 'wake');
    waking = false;
    show('chat'); startChat();
  });
  $('chatThread').addEventListener('click', e => {
    const w = chat.waiting; if (!w) return;
    const chip = e.target.closest('.chip');
    if (chip && chip.hasAttribute('data-skip') && w.st.t === 'q') { commitQ('Skip'); return; }
    if (w.st.t === 'roles') {
      if (chip) {
        const id = chip.dataset.id;
        state.roles.has(id) ? state.roles.delete(id) : state.roles.add(id);
        chip.setAttribute('aria-pressed', String(state.roles.has(id)));
      } else if (e.target.closest('[data-done]')) {
        if (state.roles.size) commitRoles(); else chatNudge('Pick at least one so I know where to start.');
      }
    } else if (w.st.t === 'q' && chip && !w.st.q.text) commitQ(chip.textContent);
    else if (w.st.t === 'files' && e.target.closest('[data-files]')) finishOnboarding();
  });
  $('chatThread').addEventListener('submit', e => {
    e.preventDefault();
    const w = chat.waiting, inp = e.target.querySelector('input');
    if (w && w.st.q && inp && inp.value.trim()) commitQ(inp.value.trim());
  });
  $('chatForm').addEventListener('submit', e => { e.preventDefault(); chatHandleText($('chatInput').value); });
  attachMic($('chatMic'), $('chatInput'), chatHandleText);
}
