// Entry point: wires the screens together and starts the app. Each screen lives in js/ui/.
import * as SS from './sessions.js';
import * as M from './mind.js';
import { probeLive } from './jury.js';
import { DEMO_TODAY, state, saveMind } from './ui/state.js';
import { initNav, show } from './ui/nav.js';
import { initOnboarding } from './ui/onboarding.js';
import { activateSession, initSessions } from './ui/sessions-ui.js';
import { openBrief } from './ui/brief.js';
import { refreshMind } from './ui/results.js';
import { initJury } from './ui/jury-ui.js';
import { initDrafts } from './ui/drafts.js';
import { initTalk } from './ui/talk-ui.js';
import { initProgress } from './ui/progress-ui.js';
import { initStudy } from './ui/study-ui.js';
import { applyPrefs, initSettings } from './ui/settings.js';

initNav();
initOnboarding();
initSessions();
initJury();
initDrafts();
initTalk();
initProgress();
initStudy();
initSettings();
applyPrefs();

SS.load();
const bootSession = SS.getSession(SS.currentId()) || SS.listSessions().flatMap(g => g.items)[0];
if (SS.isOnboarded() && bootSession) {
  // Sessions were saved on this device, so skip the intro and go straight back to the chat.
  state.ready = true;
  state.answers = { ...SS.profile().answers };
  // Saved before Ollie had a memory: learn the profile from the saved answers once.
  if (!Object.keys(state.mem.facts).length && !state.mem.rules.length) { state.mem = M.rememberProfile(state.mem, SS.profile(), DEMO_TODAY); saveMind(); }
  activateSession(bootSession.id);
  refreshMind();
  openBrief();
  show('sess', { push: false });
} else show('splash', { push: false });

// Is the local model there? Live becomes the default when it is; otherwise recorded answers are used and say so.
probeLive(1500).then(ok => { state.liveOk = ok; applyPrefs(); });
