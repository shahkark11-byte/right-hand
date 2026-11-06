// Voice and talking: the microphone, read-aloud, one answer router, and the walkie-talkie.
import * as SS from '../sessions.js';
import { UNSUPPORTED_MSG, speak, startListening, stopSpeaking, voiceSupported } from '../voice.js';
import { setState, setTalking } from '../ollie.js';
import { answer, buildContext } from '../talk.js';
import { studentAnswer } from '../student.js';
import { askLive } from '../jury.js';
import { show, toast } from './nav.js';
import { $, bizChosen, liveOn, state, studentChosen } from './state.js';
import { view } from './results.js';
import { toSession } from './sessions-ui.js';

/* ---------- microphone ---------- */
// Turns a mic button into a push-to-talk toggle that fills `input`. onDone(text) runs after speech ends.
export function attachMic(btn, input, onDone) {
  const label = btn.getAttribute('aria-label'), hint = input.placeholder;
  let ctl = null, heard = false;
  const idle = () => { ctl = null; btn.classList.remove('listening'); btn.setAttribute('aria-label', label); btn.title = ''; input.placeholder = hint; };
  btn.addEventListener('click', () => {
    if (ctl) { ctl.stop(); return; }
    heard = false;
    ctl = startListening({
      onText: t => { heard = true; input.value = t; },
      onEnd: () => { idle(); if (heard && onDone && input.value.trim()) onDone(input.value); },
      onError: err => {
        idle();
        if (err === 'unsupported') toast(UNSUPPORTED_MSG);
        else if (err === 'not-allowed' || err === 'service-not-allowed') toast('The microphone is blocked. Allow it in the browser, or type instead.');
        else if (err !== 'aborted') toast("I didn't catch that. Try again, or type it.");
      },
    });
    if (ctl) { btn.classList.add('listening'); btn.setAttribute('aria-label', 'Listening…'); btn.title = 'Listening…'; input.placeholder = 'Listening…'; }
  });
}

// Read aloud, and keep the avatar bobbing while the browser is speaking.
let talkPoll = null, talkAv = null;
export function stopTalkBob() { clearInterval(talkPoll); if (talkAv) setTalking(talkAv, false); talkAv = null; }
export function speakAloud(text, av) {
  speak(text);
  stopTalkBob();
  if (!av || !('speechSynthesis' in window)) return;
  talkAv = av; setTalking(av, true);
  const t0 = Date.now();
  talkPoll = setInterval(() => { if (Date.now() - t0 > 700 && !speechSynthesis.speaking) stopTalkBob(); }, 300);
}

// Live mode only: swap the real names in a question for Client A, B... before it leaves the page.
function anonText(text) {
  const r = state.results;
  let out = text;
  for (const map of [r.feeMap || {}, r.invMap || {}]) {
    for (const [alias, real] of Object.entries(map)) {
      const bits = [real, real.split(' ').find(w => w.length >= 4)].filter(Boolean);
      for (const b of bits) out = out.replace(new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), alias);
    }
  }
  return out;
}
// One answer router for the chat and the walkie-talkie.
export async function getReply(text) {
  const v = view();
  const ctx = buildContext({ fees: v.fees, chase: v.chase, subs: v.subs, business: state.answers.btype });
  let a = answer(text, ctx);
  // Student questions go to the student pack when it is on. Honesty refusals always win.
  if (state.sctx && studentChosen()) {
    const sa = studentAnswer(text, state.sctx);
    const bizSpecific = bizChosen() && a.topic !== 'help' && sa.topic === 'brief';  // e.g. "draft the Fresha email"
    if (sa.topic === 'honesty' || !bizChosen() || (sa.topic !== 'help' && !bizSpecific)) a = sa;
  }
  const live = liveOn() && a.topic === 'help' && bizChosen();
  const extra = live ? await askLive(anonText(text), { fees: v.feesAnon, chase: v.chaseAnon, subs: v.subs }) : '';
  return extra ? { ...a, text: extra } : a;
}

/* ---------- walkie-talkie ---------- */
export const walk = { on: false, ctl: null, heard: '', busy: false, err: false, poll: null };
const setWalkStatus = t => { $('walkStatus').textContent = t; };
const walkIdle = () => setWalkStatus('Hold the button and talk');
function showWalkType() { $('walkForm').hidden = false; $('walkTypeLink').hidden = true; }
function walkMode(on) {
  walk.on = on;
  $('walkie').hidden = !on;
  $('talkMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === 'walkie') === on)));
  if (on) { walkIdle(); if (!voiceSupported()) { $('holdBtn').hidden = true; showWalkType(); } }
  else stopWalk();
}
function stopWalkSpeakUI() {
  clearInterval(walk.poll);
  $('wave').classList.remove('active', 'speak'); setTalking($('walkAv'), false);
}
export function stopWalk() {
  if (walk.ctl) walk.ctl.stop();
  stopSpeaking(); stopWalkSpeakUI(); $('holdBtn').classList.remove('on'); $('wave').classList.remove('active', 'listen');
  if (walk.on) walkIdle();
}
// Ollie always speaks in this mode, whatever the read-aloud setting says.
function walkSay(text) {
  speak(text);
  stopWalkSpeakUI();
  setWalkStatus('Ollie is speaking');
  $('wave').classList.add('active', 'speak'); setTalking($('walkAv'), true); setState($('walkAv'), 'talk');
  const t0 = Date.now(), can = 'speechSynthesis' in window;
  walk.poll = setInterval(() => {
    if (can ? (Date.now() - t0 > 700 && !speechSynthesis.speaking) : Date.now() - t0 > 1500) { stopWalkSpeakUI(); if (!walk.ctl) walkIdle(); }
  }, 300);
}
async function walkAsk(text) {
  const q = text.trim();
  if (!q || walk.busy) return;
  walk.busy = true;
  $('walkYou').textContent = q; $('walkReply').textContent = '';
  setWalkStatus('Ollie is thinking');
  const a = await getReply(q);
  const sid = SS.currentId();
  if (sid) { SS.addMessage(sid, { who: 'me', text: q }); SS.addMessage(sid, { who: 'ollie', text: a.text }); }
  $('walkReply').textContent = a.text;
  walkSay(a.text);
  walk.busy = false;
}
function endListenUI() { $('holdBtn').classList.remove('on'); $('wave').classList.remove('active', 'listen'); }
function startWalkListen() {
  if (walk.ctl || walk.busy) return;
  stopSpeaking(); stopWalkSpeakUI();
  walk.heard = ''; walk.err = false; $('walkYou').textContent = '';
  const ctl = startListening({
    onText: t => { walk.heard = t; $('walkYou').textContent = t; },
    onEnd: () => {
      walk.ctl = null; endListenUI();
      if (walk.err) { walk.err = false; return; }
      if (walk.heard.trim()) walkAsk(walk.heard); else setWalkStatus("I didn't hear anything. Hold the button and try again.");
    },
    onError: err => {
      walk.ctl = null; walk.err = true; endListenUI();
      if (err === 'unsupported') { setWalkStatus(UNSUPPORTED_MSG); $('holdBtn').hidden = true; showWalkType(); }
      else if (err === 'not-allowed' || err === 'service-not-allowed') { setWalkStatus('The microphone is blocked. Type instead.'); showWalkType(); }
      else if (err === 'no-speech' || err === 'aborted') setWalkStatus("I didn't hear anything. Hold the button and try again.");
      else { setWalkStatus("I didn't catch that. Try again, or type it."); showWalkType(); }
    },
  });
  if (ctl) { walk.ctl = ctl; $('holdBtn').classList.add('on'); $('wave').classList.add('active', 'listen'); setWalkStatus('Ollie is listening'); }
}

export function initTalk() {
  const holdBtn = $('holdBtn');
  holdBtn.addEventListener('pointerdown', e => { e.preventDefault(); try { holdBtn.setPointerCapture(e.pointerId); } catch { /* ignore */ } startWalkListen(); });
  for (const ev of ['pointerup', 'pointercancel']) holdBtn.addEventListener(ev, () => { if (walk.ctl) walk.ctl.stop(); });
  holdBtn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startWalkListen(); } });
  holdBtn.addEventListener('keyup', e => { if ((e.key === ' ' || e.key === 'Enter') && walk.ctl) walk.ctl.stop(); });
  holdBtn.addEventListener('contextmenu', e => e.preventDefault());
  $('walkForm').addEventListener('submit', e => { e.preventDefault(); const v = $('walkInput').value; $('walkInput').value = ''; walkAsk(v); });
  $('walkTypeLink').addEventListener('click', () => { showWalkType(); $('walkInput').focus(); });
  $('talkMode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.v === 'chat') toSession(); else walkMode(true); });
  $('sWalkie').addEventListener('click', () => { show('talk'); walkMode(true); });
}

// Start again: silence everything that is talking or listening.
export function resetTalk() { stopSpeaking(); stopTalkBob(); stopWalk(); walkMode(false); }
