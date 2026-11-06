// Microphone and read-aloud wrappers around the browser's speech features.
// In a browser, recognition may use the browser's own online speech service.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const voiceSupported = () => !!Recognition;
export const UNSUPPORTED_MSG = "Voice isn't supported in this browser; try Chrome or Edge";

// Returns { stop } or null when unsupported (onError('unsupported') is called).
export function startListening({ onText, onEnd, onError }) {
  if (!Recognition) { onError && onError('unsupported'); return null; }
  const rec = new Recognition();
  rec.lang = 'en-GB';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = e => {
    let text = '', final = true;
    for (const r of e.results) { text += r[0].transcript; if (!r.isFinal) final = false; }
    onText && onText(text.trim(), final);
  };
  rec.onerror = e => { onError && onError(e.error || 'error'); };
  rec.onend = () => { onEnd && onEnd(); };
  try { rec.start(); } catch (err) { onError && onError('error'); return null; }
  return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
}

export function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  const v = speechSynthesis.getVoices().find(x => x.lang === 'en-GB') || speechSynthesis.getVoices().find(x => x.lang.startsWith('en-GB'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
