// One chat per job: messages, files, packs, working steps, the sessions drawer, rename and delete.
import * as SS from '../sessions.js';
import { buildStudentContext } from '../student.js';
import { setPose, setState } from '../ollie.js';
import { $, curSession, esc, reduceMotion, state, studentChosen, things, wait } from './state.js';
import { compute, makeCtx, onCardButton, refreshCards, refreshMind, sessCardHtml } from './results.js';
import { sheet, show, toast } from './nav.js';
import { renderHome, viewer } from './progress-ui.js';
import { briefEl, openNotice, repaintBrief } from './brief.js';
import { attachMic, getReply, speakAloud } from './talk-ui.js';
import { openQuiz } from './study-ui.js';
import { openDraft } from './drafts.js';
import { isBankExport } from '../study.js';
import { askAbout, entriesFor, recogniseSteps } from './study-jobs-ui.js';
import { JOBS, JOB_LABEL, homeEl, jobFile, jobFromChat, jobSteps, onHomeClick, onJobButton } from './jobs-ui.js';

/* ---------- sessions: one chat per job ---------- */
export const sx = { busy: false, quiet: false, finishing: false };
const BORROW_WORDS = [['invoices?', 'invoices'], ['client list|clients', 'clients'], ['statement', 'statement'], ['bank', 'bank'], ['brief', 'brief'], ['draft|essay', 'draft'], ['deadlines?', 'deadlines']];
const fileLabel = k => JOB_LABEL[k] || SS.KIND_LABEL[k] || k;
const UNREADABLE = "I couldn't read that one. In this demo I read CSV, TXT and MD files.";

// Point the app's working state (files, results, cards) at one session.
export function activateSession(id) {
  const s = SS.getSession(id); if (!s) return;
  SS.setCurrent(id);
  const d = SS.dataOf(s);
  state.data = d;
  const pack = SS.packOf(s);
  state.roles = new Set(pack === 'student' ? ['student'] : pack === 'mixed' ? ['business', 'student'] : ['business']);
  state.answers = { ...SS.profile().answers };
  state.off = new Set(); state.quiz = null;
  state.results = compute();
  state.ctx = makeCtx();
  state.sctx = studentChosen() ? buildStudentContext({ brief: state.results.brief, check: state.results.check, deadlines: state.results.deadlines, level: state.answers.slevel, subject: state.answers.ssubject }) : null;
  refreshCards();
}
export function toSession() {
  state.history = [];
  show('sess', { push: false });
  maybeOfferNew();
}
export function openSession(id) {
  if (!SS.getSession(id)) { toast('That session is gone.'); return; }
  sheet.close(); closeDrawer(); viewer.close();
  activateSession(id); toSession();
}

/* messages */
function chipHtml(c) {
  return `<span class="fchip">${esc(c.name)}${/EXAMPLE/.test(c.name) ? '<b class="badge">EXAMPLE</b>' : ''}</span>`;
}

function msgEl(m, s) {
  const row = document.createElement('div');
  if (m.who === 'me') {
    row.className = 'msg user';
    row.innerHTML = `<div class="bubble">${(m.chips || []).map(chipHtml).join('')}${m.text ? `<span>${esc(m.text)}</span>` : ''}</div>`;
    return row;
  }
  row.className = 'msg ollie-msg';
  let html = '<span class="ollie p7 av" aria-hidden="true"></span><div class="bubble">';
  if (m.text) html += `<span>${esc(m.text)}</span>`;
  if (m.borrowed) {
    const from = SS.getSession(m.borrowed.id);
    html += `<button class="fchip borrowed" type="button" data-open="${esc(m.borrowed.id)}">Using your ${esc(m.borrowed.label)} from <i>${esc(from ? from.title : m.borrowed.title)}</i></button>`;
  }
  if (m.card) {
    const c = (s.results.cards || []).find(x => x.id === m.card);
    if (c) html += sessCardHtml(c, s);
  }
  const btns = [];
  if (m.act?.type === 'addfile') btns.push('<button class="btn primary" type="button" data-sact="addfile">Add file</button>');
  if (m.act?.type === 'newsession') btns.push('<button class="btn primary" type="button" data-sact="newsession">New session</button>');
  if (m.act?.type === 'draft') btns.push(`<button class="btn primary" type="button" data-sact="draft" data-card="${esc(m.act.card)}">Open draft</button>`);
  if (m.act?.type === 'recognise') btns.push('<button class="btn primary" type="button" data-sact="recog-yes">Yes</button><button class="btn" type="button" data-sact="recog-else">Something else</button>');
  if (m.act?.type === 'quiz') btns.push('<button class="btn primary" type="button" data-sact="quiz">Start quiz</button>');
  if (btns.length) html += `<div class="bubble-tools">${btns.join('')}</div>`;
  row.innerHTML = html + '</div>';
  return row;
}

const sScroll = () => { const t = $('sThread'); t.scrollTop = t.scrollHeight; };

export function renderThread() {
  const s = curSession(); if (!s) return;
  const th = $('sThread'); th.innerHTML = '';
  if (state.brief && state.brief.open) th.appendChild(briefEl());
  s.messages.forEach(m => th.appendChild(msgEl(m, s)));
  syncHome();
  if (state.current === 'sess') $('appbarTitle').textContent = s.title;
  if (state.brief && state.brief.open) th.scrollTop = 0; else sScroll();
}
// The home (what the intern can do) sits at the bottom of an empty session and goes once a file is in.
function syncHome() {
  const th = $('sThread'), s = curSession();
  th.querySelector('.jobs-home')?.remove();
  if (s && !s.files.length && !(pending && pending.sid === s.id)) th.appendChild(homeEl(SS.profile().roles));
}

function pushUser(sid, msg) {
  SS.addMessage(sid, msg);
  if (SS.currentId() === sid) { $('sThread').appendChild(msgEl(msg, SS.getSession(sid))); sScroll(); if (state.current === 'sess') $('appbarTitle').textContent = SS.getSession(sid).title; syncHome(); }
}
// Ollie's typing dots, then the bubble. msg can be a function that works the message out while the dots show.
async function ollieSay(sid, msgOrFn) {
  let typing = null;
  if (!sx.quiet && SS.currentId() === sid) {
    typing = document.createElement('div'); typing.className = 'msg ollie-msg';
    typing.innerHTML = '<span class="ollie p7 av" aria-hidden="true"></span><div class="bubble typing" aria-label="Ollie is typing"><i></i><i></i><i></i></div>';
    $('sThread').appendChild(typing); sScroll();
  }
  const pause = sx.quiet ? Promise.resolve() : wait(reduceMotion() ? 60 : 600);
  const msg = { who: 'ollie', ...(typeof msgOrFn === 'function' ? (await Promise.all([msgOrFn(), pause]))[0] : (await pause, msgOrFn)) };
  if (typing) typing.remove();
  SS.addMessage(sid, msg);
  if (sx.quiet || SS.currentId() !== sid) return { msg, row: null };
  const row = msgEl(msg, SS.getSession(sid));
  $('sThread').appendChild(row); syncHome(); sScroll();
  const av = row.querySelector('.ollie');
  setState(av, 'talk');
  if (state.prefs.speak === 'on' && msg.text) speakAloud(msg.text, av);
  return { msg, row };
}

/* files and jobs */
async function borrowFile(sid, kind) {
  const hit = SS.findFile(kind, { excludeId: sid });
  if (!hit) return false;
  const { file, session } = hit;
  SS.addFile(sid, { ...file, fromSession: { id: session.id, title: session.title } });
  await ollieSay(sid, { text: `This check needs your ${fileLabel(kind)}, so I looked in your other sessions.`, borrowed: { kind, label: fileLabel(kind), id: session.id, title: session.title } });
  return true;
}

// Work out what the session's files can answer, borrow what is missing, then post any new result cards.
// "Ollie is working": each step with real counts and timings, then one summary line you can tap open.
async function showWorking(sid, names) {
  if (sx.quiet || SS.currentId() !== sid || state.current !== 'sess') return;
  const r = state.results, s = SS.getSession(sid), steps = [...recogniseSteps(SS.getSession(sid))];
  const ms = x => (x < 1 ? '<1' : Math.round(x)) + ' ms';
  const lines = f => f.rows ? f.rows.length : String(f.text || '').split(/\r?\n/).filter(l => l.trim()).length;
  for (const f of s.files) steps.push(`Read ${fileLabel(f.kind)} · ${lines(f)} line${lines(f) === 1 ? '' : 's'}${f.fromSession ? ' (from ' + f.fromSession.title + ')' : ''}`);
  const last = o => 'A-' + String.fromCharCode(64 + Math.min(26, Object.keys(o).length));
  if (r.feeMap) steps.push(`Hid client names · ${Object.keys(r.feeMap).length} → ${last(r.feeMap)}`);
  if (r.invMap) steps.push(`Hid customer names · ${Object.keys(r.invMap).length} → ${last(r.invMap)}`);
  if (r.fees && state.data.clients) steps.push(`Checked Fresha's rules · ${r.fees.length} flag${r.fees.length === 1 ? '' : 's'} · ${ms(r.t.fees || 0)}`);
  if (r.chase) steps.push(`Worked out late-payment interest · ${r.chase.length} invoice${r.chase.length === 1 ? '' : 's'} · ${ms(r.t.chase || 0)}`);
  if (state.data.bank && r.subs) steps.push(`Checked subscriptions · ${r.subs.priceRises.length + r.subs.duplicates.length} flags · ${ms(r.t.subs || 0)}`);
  if (r.check) steps.push(`Checked your draft against the brief · ${things(r.check.issues.length)} to fix · ${ms(r.t.student || 0)}`);
  if (r.deadlines) steps.push(`Lined up deadlines · ${r.deadlines.length} dates`);
  steps.push(...jobSteps(s));
  if (state.usedRules) steps.push(`Used ${things(state.usedRules)} Ollie learned`);
  if (!steps.length) return;
  const el = document.createElement('div'); el.className = 'work'; el.setAttribute('role', 'status');
  el.innerHTML = '<p class="mono-cap work-h"><i class="dot"></i>OLLIE IS WORKING</p><ul class="work-steps"></ul>';
  $('sThread').appendChild(el); sScroll();
  const ul = el.querySelector('ul');
  for (const t of steps) {
    const li = document.createElement('li'); li.innerHTML = `<span class="tk">✓</span><span>${esc(t)}</span>`;
    ul.appendChild(li); sScroll();
    await wait(reduceMotion() ? 20 : 280);
  }
  await wait(reduceMotion() ? 20 : 350);
  el.classList.add('done');
  el.innerHTML = `<button class="work-sum mono-cap" type="button" aria-expanded="false"><span class="tk">✓</span> OLLIE WORKED · ${steps.length} STEPS · ${ms(r.ms)}</button><ul class="work-steps" hidden>${steps.map(t => `<li><span class="tk">✓</span><span>${esc(t)}</span></li>`).join('')}</ul>`;
  const sum = el.querySelector('.work-sum');
  sum.addEventListener('click', () => { const u = el.querySelector('ul'); u.hidden = !u.hidden; sum.setAttribute('aria-expanded', String(!u.hidden)); });
}

export async function analyse(sid, names) {
  const kinds = () => new Set(SS.getSession(sid).files.map(f => f.kind));
  const need = [];
  if (kinds().has('statement') && !kinds().has('clients')) need.push('clients');
  if (kinds().has('brief') && !kinds().has('draft')) need.push('draft');
  if (kinds().has('draft') && !kinds().has('brief')) need.push('brief');
  const missing = [];
  for (const k of need) if (!await borrowFile(sid, k)) missing.push(k);
  if (SS.currentId() === sid || sx.quiet) activateSession(sid);
  const s = SS.getSession(sid);
  const fresh = (s.results.cards || []).filter(c => !(s.results.shown || []).includes(c.id));
  if (fresh.length || names.length) await showWorking(sid, names);
  if (fresh.length) {
    await ollieSay(sid, { text: names.length ? `I read ${names.join(' and ')}. Here's what I found.` : "Here's what I found." });
    for (const c of fresh) {
      const { row } = await ollieSay(sid, { text: '', card: c.id });
      if (row && c.money) { const av = row.querySelector('.ollie'); setPose(av, 6); setState(av, 'money'); }
      SS.setResults(sid, { shown: [...SS.getSession(sid).results.shown, c.id] });
    }
  } else if (!missing.length && names.length) {
    await ollieSay(sid, { text: `Got ${names.join(' and ')}. I'll keep it in this session. Add something to check it against, or ask me a question.` });
  }
  for (const k of missing) {
    await ollieSay(sid, { text: `Can you add your ${fileLabel(k)}? I need it for this check, and I couldn't find one in your other sessions.`, act: { type: 'addfile' } });
  }
  refreshMind();
}

// The file Ollie has asked about and is waiting on an answer for.
let pending = null;
async function processFiles(entries, { ask = true, chipped = false } = {}) {
  const sid = SS.currentId(); if (!sid) return;
  const added = [], notes = [];
  // One file of your own that Ollie recognises: say what it is and offer the job before doing anything.
  if (ask && entries.length === 1 && !entries[0].kind && !/.(pdf|docx?)$/i.test(entries[0].name)) {
    const q = askAbout(entries[0]);
    if (q) {
      pushUser(sid, { who: 'me', text: '', chips: [{ name: entries[0].name, kind: q.kind }] });
      pending = { sid, entry: entries[0], kind: q.kind };
      await ollieSay(sid, { text: q.text, act: { type: 'recognise', kind: q.kind } });
      return;
    }
  }
  for (let e of entries) {
    if (!e.kind && isBankExport(e.text)) e = { ...e, kind: 'bankpay' };
    const det = e.kind ? jobFile(e) : /\.(pdf|docx?)$/i.test(e.name) ? null : SS.detectKind(e.name, e.text);
    if (!det) { notes.push(UNREADABLE); continue; }
    SS.addFile(sid, { kind: det.kind, name: e.name, ...(det.rows ? { rows: det.rows } : { text: det.text }) });
    added.push({ name: e.name, kind: det.kind });
  }
  if (added.length && !chipped) pushUser(sid, { who: 'me', text: '', chips: added });
  for (const n of notes) await ollieSay(sid, { text: n });
  if (added.length) await analyse(sid, added.map(a => a.name));
}
// Yes runs the job on the user's file. Something else files it the way Ollie always did.
const NAME_FOR = { notes: 'Revision pack', funding: 'Bursary' };
async function answerRecognise(yes) {
  const p = pending, sid = SS.currentId();
  if (!p || p.sid !== sid || sx.busy) { toast('Add the file again and I will have another look.'); return; }
  pending = null; sx.busy = true;
  try {
    const s = SS.getSession(sid);
    if (yes && NAME_FOR[p.kind] && s.titleAuto) { SS.renameSession(sid, NAME_FOR[p.kind]); $('appbarTitle').textContent = NAME_FOR[p.kind]; }
    await processFiles(yes ? await entriesFor(p.kind, p.entry) : [p.entry], { ask: false, chipped: true });
  } finally { sx.busy = false; }
}
async function readFiles(files) {
  if (sx.busy) return;
  sx.busy = true;
  try { await processFiles(await Promise.all([...files].map(async f => ({ name: f.name, text: await f.text() })))); } finally { sx.busy = false; }
}
// A job from the home: load its example files into this empty session, then work as for any file.
async function loadJob(key) {
  if (sx.busy) return;
  sx.busy = true;
  try {
    const job = JOBS[key], files = job.files.map(f => ({ ...f }));
    if (job.clients && !SS.findFile('clients', { excludeId: SS.currentId() })) files.push({ name: job.clients });
    if (job.session) { SS.renameSession(SS.currentId(), job.session); $('appbarTitle').textContent = job.session; }
    const list = await Promise.all(files.map(async f => ({ ...f, text: await (await fetch('data/' + f.name)).text() })));
    await processFiles(list, { ask: false });
  } finally { sx.busy = false; }
}
// Start a job from anywhere (the brief too): a session with files in it is left alone and a new one opens.
export async function startJob(key) {
  if (!JOBS[key] || sx.busy) return;
  const s = curSession();
  if (!s || s.files.length) newSession();
  else if (state.current !== 'sess') toSession();
  await loadJob(key);
}
function borrowIntent(text) {
  const t = text.toLowerCase();
  if (!/^\s*(please |can you |could you )?(use|borrow|pull|grab|bring|get|take)\b/.test(t)) return '';
  const hit = BORROW_WORDS.find(([re]) => new RegExp('\\b(' + re + ')\\b').test(t));
  return hit ? hit[1] : '';
}
async function sessSend(raw) {
  const text = String(raw).trim();
  if (!text || sx.busy) return;
  sx.busy = true;
  $('sInput').value = '';
  const sid = SS.currentId();
  try {
    pushUser(sid, { who: 'me', text });
    const kind = borrowIntent(text), job = jobFromChat(text);
    if (job) { sx.busy = false; await startJob(job); }
    else if (kind) {
      if (await borrowFile(sid, kind)) await analyse(sid, []);
      else await ollieSay(sid, { text: `I can't find a ${fileLabel(kind)} in your other sessions. Can you add one?`, act: { type: 'addfile' } });
    } else {
      let topic = '';
      const { row } = await ollieSay(sid, async () => {
        const a = await getReply(text);
        topic = a.topic;
        return { text: a.text, act: a.action?.type === 'draft' ? { type: 'draft', card: a.action.card } : a.action?.type === 'quiz' ? { type: 'quiz' } : undefined };
      });
      if (row) { const av = row.querySelector('.ollie'); if (topic === 'honesty') { setPose(av, 4); setState(av, 'shy'); } }
    }
  } finally { sx.busy = false; }
}

/* a finished job offers a fresh session */
function jobFinished(s) {
  const ap = (s.results.cards || []).filter(c => c.juryType);
  return ap.length > 0 && ap.every(c => (s.results.picked || []).includes(c.id));
}
function maybeOfferNew() {
  const s = curSession(); if (!s || s.results.offered || !jobFinished(s)) return;
  SS.setResults(s.id, { offered: true });
  SS.addMessage(s.id, { who: 'ollie', text: 'That job is done. Start a new session?', act: { type: 'newsession' } });
  renderThread();
}

/* new, rename, delete */
function newSession() {
  const s = SS.createSession(SS.DEFAULT_TITLE);
  SS.addMessage(s.id, { who: 'ollie', text: 'New session. What are we working on? Pick a job below, or add a file.' });
  closeDrawer();
  activateSession(s.id); toSession();
}
function dialog({ title, text = '', input = null, yes = 'OK', danger = false }) {
  return new Promise(res => {
    const inp = $('dlgInput');
    $('dlgTitle').textContent = title; $('dlgText').textContent = text; $('dlgText').hidden = !text;
    inp.hidden = input === null; if (input !== null) inp.value = input;
    $('dlgYes').textContent = yes; $('dlgYes').classList.toggle('danger', danger); $('dlgYes').classList.toggle('primary', !danger);
    $('dlg').hidden = false;
    if (input !== null) { inp.focus(); inp.select(); } else $('dlgNo').focus();
    const done = v => { $('dlg').hidden = true; $('dlgForm').onsubmit = null; $('dlgNo').onclick = null; $('dlg').onkeydown = null; res(v); };
    $('dlgForm').onsubmit = e => { e.preventDefault(); done(input !== null ? (inp.value.trim() || null) : true); };
    $('dlgNo').onclick = () => done(null);
    $('dlg').onkeydown = e => { if (e.key === 'Escape') done(null); };
  });
}
async function renameFlow(id) {
  const s = SS.getSession(id); if (!s) return;
  const v = await dialog({ title: 'Rename session', input: s.title, yes: 'Save' });
  if (!v) return;
  SS.renameSession(id, v);
  if (state.current === 'sess') $('appbarTitle').textContent = curSession().title;
  renderDrawer();
}
async function deleteFlow(id) {
  const s = SS.getSession(id); if (!s) return;
  const ok = await dialog({ title: 'Delete this session?', text: `“${s.title}” and its chat will be removed from this phone. This can't be undone.`, yes: 'Delete', danger: true });
  if (!ok) return;
  const wasCurrent = SS.currentId() === id;
  SS.deleteSession(id);
  if (wasCurrent) {
    const next = SS.listSessions().flatMap(g => g.items)[0];
    if (next) { activateSession(next.id); toSession(); } else newSession();
  }
  renderDrawer();
  if (state.current === 'report') renderHome(false);
}

/* the drawer */
function summaryLine(s) {
  if (s.results.summary) return s.results.summary;
  if (s.pack === 'intro') return 'Chat with Ollie';
  return s.files.length ? `${s.files.length} file${s.files.length === 1 ? '' : 's'}, nothing to report yet` : 'Empty';
}
function renderDrawer() {
  const cur = SS.currentId();
  $('drawerList').innerHTML = SS.listSessions().map(g => `<h3 class="drawer-h">${g.label}</h3>` + g.items.map(s => `
    <div class="sitem ${s.id === cur ? 'on' : ''}" data-id="${s.id}">
      <button class="sitem-main" type="button" data-pick="${s.id}"><b>${esc(s.title)}</b><span>${esc(summaryLine(s))}</span></button>
      <button class="iconbtn sitem-more" type="button" data-more="${s.id}" aria-label="Actions for ${esc(s.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg></button>
      <div class="sitem-actions"><button class="btn" type="button" data-rename="${s.id}">Rename</button><button class="btn danger" type="button" data-delete="${s.id}">Delete</button></div>
    </div>`).join('')).join('');
}
export function openDrawer() { renderDrawer(); $('drawer').hidden = false; $('drawerNew').focus(); }
export function closeDrawer() { $('drawer').hidden = true; }

export function initSessions() {
  $('sThread').addEventListener('click', e => {
    const bo = e.target.closest('[data-bopen]');
    if (bo) { const n = state.brief && state.brief.items.find(x => x.id === bo.dataset.bopen); if (n) openNotice(n); return; }
    const bl = e.target.closest('[data-blater]');
    if (bl) { state.brief.dismissed.add(bl.dataset.blater); repaintBrief(); return; }
    if (e.target.closest('[data-know]')) { show('know'); return; }
    if (e.target.closest('[data-bmore]')) { state.brief.expanded = true; repaintBrief(); return; }
    const bj = e.target.closest('[data-bjob]');
    if (bj) { startJob(bj.dataset.bjob); return; }
    const st = e.target.closest('[data-start]');
    if (st) { if (st.dataset.start === 'tell') $('sInput').focus(); else startJob(st.dataset.start); return; }
    if (onHomeClick(e)) return;
    const jb = e.target.closest('[data-job]');
    if (jb) { onJobButton(jb); return; }
    const open = e.target.closest('[data-open]');
    if (open) { openSession(open.dataset.open); return; }
    const sact = e.target.closest('[data-sact]');
    if (sact) {
      const k = sact.dataset.sact;
      if (k === 'addfile') $('sFile').click();
      else if (k === 'newsession') newSession();
      else if (k === 'recog-yes' || k === 'recog-else') {
        const m = [...curSession().messages].reverse().find(x => x.act?.type === 'recognise');
        if (m) { m.act = null; SS.setResults(SS.currentId(), {}); }
        sact.closest('.bubble-tools')?.remove();
        answerRecognise(k === 'recog-yes');
      }
      else if (k === 'quiz') openQuiz();
      else if (k === 'draft') { const c = state.cards.find(x => x.id === sact.dataset.card); if (c) openDraft(c); else toast("I can't draft that yet. Add the file in this session first."); }
      return;
    }
    const b = e.target.closest('button[data-card]');
    if (b) onCardButton(b);
  });
  $('sForm').addEventListener('submit', e => { e.preventDefault(); sessSend($('sInput').value); });
  $('sFile').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) readFiles(f); });
  attachMic($('sMic'), $('sInput'), sessSend);
  const dropZone = $('s-sess');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drop'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drop'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drop'); if (e.dataTransfer?.files?.length) readFiles(e.dataTransfer.files); });
  $('appbarTitle').addEventListener('click', () => { if (state.current === 'sess') renameFlow(SS.currentId()); });
  $('newBtn').addEventListener('click', newSession);
  $('menuBtn').addEventListener('click', openDrawer);
  $('drawerBack').addEventListener('click', closeDrawer);
  $('drawerNew').addEventListener('click', newSession);
  $('drawer').addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  let pressTimer = null;
  $('drawerList').addEventListener('click', e => {
    const t = id => $('drawerList').querySelector(`.sitem[data-id="${id}"]`);
    const pick = e.target.closest('[data-pick]'), more = e.target.closest('[data-more]');
    if (pick) { if (pick.dataset.held) { delete pick.dataset.held; return; } openSession(pick.dataset.pick); }
    else if (more) t(more.dataset.more).classList.toggle('menu');
    else if (e.target.closest('[data-rename]')) renameFlow(e.target.closest('[data-rename]').dataset.rename);
    else if (e.target.closest('[data-delete]')) deleteFlow(e.target.closest('[data-delete]').dataset.delete);
  });
  // A long press on a session opens the same Rename / Delete menu.
  $('drawerList').addEventListener('pointerdown', e => {
    const p = e.target.closest('[data-pick]'); if (!p) return;
    pressTimer = setTimeout(() => { p.dataset.held = '1'; p.closest('.sitem').classList.add('menu'); }, 600);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('drawerList').addEventListener(ev, () => clearTimeout(pressTimer));
}
