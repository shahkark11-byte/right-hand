// The study pack and the quiz.
import { setState } from '../ollie.js';
import { $, CHECKED_ON, esc, state } from './state.js';
import { show, toast } from './nav.js';
import { toSession } from './sessions-ui.js';

/* ---------- study pack and quiz ---------- */
const TRUST_LABEL = { court: 'Court', guide: 'Guide', official: 'Official', check: 'Check' };
export function openStudy() {
  const sp = state.results?.study; if (!sp) { toast('Add your brief in a session to build a study pack.'); return; }
  $('studyTitle').textContent = 'Study pack: ' + sp.topic;
  $('sources').innerHTML = sp.sources.map(s => `
    <article class="card source">
      <span class="trust trust-${esc(s.trust)}">${TRUST_LABEL[s.trust] || esc(s.trust)}</span>
      <h3>${esc(s.title)}</h3>
      <p class="detail">${esc(s.note)}</p>
      <a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener">Open source</a>
    </article>`).join('');
  $('studyChecked').textContent = 'Links checked ' + CHECKED_ON;
  show('study');
}
const rotate = (list, n) => list.map((_, i) => list[(i + n) % list.length]);
export function openQuiz() {
  const sp = state.results?.study; if (!sp) { toast('Add your brief in a session to build a quiz.'); return; }
  state.quiz = { pack: sp, i: 0, score: 0, picked: null };
  renderQuiz(); show('quiz');
}
function renderQuiz() {
  const z = state.quiz, body = $('quizBody'), total = z.pack.quiz.length;
  if (z.i >= total) {
    const good = z.score >= 4;
    $('quizCount').textContent = 'Quiz finished';
    body.innerHTML = `<div class="quiz-end"><span class="ollie med ${good ? 'p3' : 'p5'}" id="quizEndOllie" role="img" aria-label="${good ? 'Ollie, happy' : 'Ollie, thinking'}"></span>
      <h1>You got ${z.score} of ${total}</h1>
      <p class="sub">${good ? 'Nicely done. Ollie is pleased.' : "Let's try again. Open the sources first."}</p>
      <div class="actions col"><button class="btn primary" id="quizAgain" type="button">Try again</button>
      <button class="btn" id="quizSources" type="button">Back to study pack</button>
      <button class="btn ghost" id="quizReport" type="button">Back to session</button></div></div>`;
    const end = $('quizEndOllie');
    if (good) {
      setState(end, 'happy');
      setTimeout(() => { if (end.isConnected && $('quizEndOllie') === end) setState(end, 'happy'); }, 1600);
    } else setState(end, 'thinking');
    return;
  }
  const q = z.pack.quiz[z.i];
  const opts = rotate(q.options, z.i % q.options.length);
  $('quizCount').textContent = `Question ${z.i + 1} of ${total}`;
  body.innerHTML = `<span class="ollie sm p7 quiz-me" aria-hidden="true"></span><h1 class="quiz-q">${esc(q.q)}</h1>
    <div class="opts" role="group" aria-label="Answers">${opts.map(o => `<button class="opt" type="button" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
    <p class="quiz-fb" id="quizFb" hidden></p>
    <div class="actions"><button class="btn primary" id="quizNext" type="button" hidden>${z.i + 1 === total ? 'See my score' : 'Next question'}</button></div>`;
}

export function initStudy() {
  $('quizBody').addEventListener('click', e => {
    const z = state.quiz; if (!z) return;
    const opt = e.target.closest('.opt');
    if (opt && z.picked === null) {
      const q = z.pack.quiz[z.i], right = opt.dataset.o === q.answer;
      z.picked = opt.dataset.o; if (right) z.score++;
      $('quizBody').querySelectorAll('.opt').forEach(b => {
        b.disabled = true;
        if (b.dataset.o === q.answer) { b.classList.add('right'); b.insertAdjacentHTML('afterbegin', '<span class="mark" aria-hidden="true">✓ </span>'); }
        else if (b === opt) { b.classList.add('wrong'); b.insertAdjacentHTML('afterbegin', '<span class="mark" aria-hidden="true">✗ </span>'); }
      });
      const me = $('quizBody').querySelector('.quiz-me');
      if (me) setState(me, right ? 'happy' : 'shy');
      const fb = $('quizFb'); fb.hidden = false; fb.className = 'quiz-fb ' + (right ? 'ok' : 'no');
      fb.textContent = right ? 'Right!' : 'Not quite. The right answer is: ' + q.answer;
      $('quizNext').hidden = false; $('quizNext').focus();
      return;
    }
    const id = e.target.closest('button')?.id;
    if (id === 'quizNext') { z.i++; z.picked = null; renderQuiz(); $('screens').scrollTop = 0; }
    else if (id === 'quizAgain') { state.quiz = { pack: z.pack, i: 0, score: 0, picked: null }; renderQuiz(); }
    else if (id === 'quizSources') openStudy();
    else if (id === 'quizReport') { toSession(); }
  });
  $('studyQuiz').addEventListener('click', openQuiz);
  $('studyBack').addEventListener('click', () => { toSession(); });
}
