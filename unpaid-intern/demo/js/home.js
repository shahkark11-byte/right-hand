// The Progress and What's new pieces: story circles and viewer, the olive tree, the bento strip, the progress row and the bottom sheet.
// This file only draws. app.js decides what the findings are and what happens when something is tapped.
import { setState } from './ollie.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const STORY_MS = 5000;

/* ---------- story circles ---------- */
export function renderStories(host, stories, seen, onOpen) {
  host.innerHTML = stories.map(s => `
    <button class="story ${seen.has(s.id) ? 'seen' : ''}" type="button" data-id="${s.id}" aria-label="${esc(s.label)} story${seen.has(s.id) ? ', seen' : ', new'}">
      <span class="story-ring"><span class="story-in"><span class="ollie sm p${s.pose}" aria-hidden="true"></span></span></span>
      <span class="story-label">${esc(s.label)}</span>
    </button>`).join('');
  host.onclick = e => {
    const b = e.target.closest('.story'); if (!b) return;
    onOpen(stories.find(s => s.id === b.dataset.id));
  };
}

/* ---------- story viewer ---------- */
// root: the full-screen overlay. slides: { head, line, pose, state, act, label }.
export function createViewer(root, { onAct, onClose }) {
  let story = null, i = 0, drag = null;
  const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function paint() {
    const s = story.slides[i];
    const still = reduced();
    root.innerHTML = `
      <div class="sv-bars" aria-hidden="true">${story.slides.map((_, k) => `<i class="${k < i || (still && k === i) ? 'done' : ''}"><b class="${k === i && !still ? 'run' : ''}"></b></i>`).join('')}</div>
      <button class="sv-x" type="button" aria-label="Close stories">${X}</button>
      <div class="sv-body">
        <p class="sv-label">${esc(story.label)} · ${i + 1} of ${story.slides.length}</p>
        <span class="ollie med p${s.pose}" aria-hidden="true"></span>
        <h2 class="sv-head">${esc(s.head)}</h2>
        <p class="sv-line">${esc(s.line)}</p>
      </div>
      <div class="sv-foot">
        ${s.act ? '<button class="btn primary sv-act" type="button">Act</button><p class="sv-hint">Swipe up or press Act</p>' : ''}
        ${still ? '<p class="sv-hint">Tap the right side for the next one</p>' : ''}
      </div>`;
    setState(root.querySelector('.ollie'), s.state || 'idle');
    const run = root.querySelector('.sv-bars b.run');
    if (run) run.addEventListener('animationend', next, { once: true });
  }
  function next() { if (!story) return; if (i + 1 >= story.slides.length) close(); else { i++; paint(); } }
  function prev() { if (i > 0) { i--; paint(); } else paint(); }
  function close() {
    if (!story) return;
    story = null; root.hidden = true; root.innerHTML = '';
    onClose && onClose();
  }
  function act() { const id = story.slides[i].act; if (!id) return; close(); onAct(id); }

  root.addEventListener('click', e => {
    if (e.target.closest('.sv-x')) close();
    else if (e.target.closest('.sv-act')) act();
  });
  root.addEventListener('pointerdown', e => {
    if (!story || e.target.closest('button')) return;
    drag = { x: e.clientX, y: e.clientY, t: Date.now() };
    root.classList.add('paused');
  });
  const release = e => {
    root.classList.remove('paused');
    if (!drag || !story) { drag = null; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, held = Date.now() - drag.t;
    drag = null;
    if (dy < -70 && Math.abs(dx) < 80) { act(); return; }
    if (held < 300 && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      const b = root.getBoundingClientRect();
      if (e.clientX - b.left < b.width * 0.35) prev(); else next();
    }
  };
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', () => { root.classList.remove('paused'); drag = null; });
  root.addEventListener('keydown', e => {
    if (!story) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  });

  return {
    open(s) { story = s; i = 0; root.hidden = false; paint(); const x = root.querySelector('.sv-x'); x && x.focus(); },
    close,
    get isOpen() { return !!story; },
  };
}

/* ---------- the olive tree ---------- */
// Fixed slots, so an olive never moves. Each is the centre of the olive in the 320 x 330 picture.
const SLOT = {
  fees: [100, 70], chase: [165, 52], subs: [230, 72], law: [70, 125], x1: [108, 168], x2: [214, 170], x3: [58, 92], x4: [268, 94],
  brief: [130, 118], deadlines: [195, 120], study: [255, 128], wellbeing: [160, 175],
};
const BASKET = [255, 292];
const BLOBS = [[110, 92, 60], [205, 88, 62], [160, 132, 70], [76, 132, 46], [250, 138, 46], [160, 72, 50]];
const LEAF = 'M0 0C8-14 22-14 28 0C22 14 8 14 0 0Z';
const SPARK = 'M0-9C1 -4 4 -1 9 0C4 1 1 4 0 9C-1 4 -4 1 -9 0C-4-1 -1-4 0-9Z';

let prevScale = null;

function oliveSvg(c, picked, dropping) {
  const [x, y] = SLOT[c.slot || c.id] || [160, 100];
  const cls = ['olive', c.urgent ? 'black' : 'green', picked ? (dropping ? 'dropping' : 'picked') : ''].join(' ').trim();
  const label = `${c.title}: ${c.headline}. ${c.urgent ? 'Urgent. ' : ''}${picked ? 'Picked.' : 'Tap to open.'}`;
  const drop = dropping ? ` style="--dx:${BASKET[0] - x}px;--dy:${BASKET[1] - y}px"` : '';
  return `<g class="${cls}" data-id="${c.id}" transform="translate(${x} ${y})" tabindex="${picked && !dropping ? -1 : 0}" role="button" aria-label="${esc(label)}">
    <circle class="hit" r="26"/>
    <g class="ol-sway"${drop}>
      <g class="ol-body"><ellipse class="ol-fill" rx="13" ry="16" transform="rotate(14)"/><ellipse class="ol-shine" cx="-4" cy="-6" rx="3" ry="5" transform="rotate(14)"/></g>
      <path class="ol-stem" d="M2 -15C6 -22 12 -23 16 -21C12 -16 7 -14 2 -15Z"/>
      ${c.money ? `<path class="spark" d="${SPARK}" transform="translate(15 -14)"/>` : ''}
    </g></g>`;
}

function basketSvg(n) {
  const dots = Array.from({ length: Math.min(n, 8) }, (_, k) => {
    const cx = BASKET[0] - 22 + (k % 4) * 15, cy = BASKET[1] - 8 - Math.floor(k / 4) * 10;
    return `<circle class="b-ol" cx="${cx}" cy="${cy}" r="7"/>`;
  }).join('');
  return `<g class="basket" role="img" aria-label="${n} picked">
    <path class="b-handle" d="M${BASKET[0] - 28} ${BASKET[1] - 6}C${BASKET[0] - 28} ${BASKET[1] - 44} ${BASKET[0] + 28} ${BASKET[1] - 44} ${BASKET[0] + 28} ${BASKET[1] - 6}"/>
    ${dots}
    <path class="b-body" d="M${BASKET[0] - 36} ${BASKET[1] - 8}H${BASKET[0] + 36}L${BASKET[0] + 28} ${BASKET[1] + 20}H${BASKET[0] - 28}Z"/>
    <path class="b-weave" d="M${BASKET[0] - 31} ${BASKET[1] + 4}H${BASKET[0] + 31}M${BASKET[0] - 29} ${BASKET[1] + 12}H${BASKET[0] + 29}"/>
    <text class="b-count" x="${BASKET[0]}" y="${BASKET[1] + 38}" text-anchor="middle">${n} picked</text></g>`;
}

// model: { cards (with urgent, money), picked: Set, dropping: Set }. Returns the Ollie element at the foot of the tree.
export function renderTree(host, { cards, picked, dropping, growth, onOlive }) {
  const total = cards.length || 1, n = cards.filter(c => picked.has(c.id)).length;
  // The canopy grows with what Ollie knows (0 to 1), not only with the olives picked.
  const scale = growth === undefined ? 0.85 + 0.15 * (n / total) : 0.8 + 0.2 * growth;
  const start = prevScale === null || reduced() ? scale : prevScale;
  const leaf = (x, y, r, cls) => `<path class="lf ${cls}" d="${LEAF}" transform="translate(${x} ${y}) rotate(${r})"/>`;
  const blobs = BLOBS.map(([x, y, r]) => `cx="${x}" cy="${y}" r="${r}"`);
  host.innerHTML = `
    <svg class="tree-svg" viewBox="0 0 320 330" role="group" aria-label="Your olive tree, ${n} of ${cards.length} olives picked">
      <ellipse class="ground" cx="160" cy="312" rx="110" ry="10"/>
      <path class="trunk" d="M138 308C146 272 149 232 140 190L182 190C172 232 177 272 186 308Z"/>
      <path class="trunk-line" d="M156 300C160 270 160 240 158 214M170 296C171 270 168 246 170 222"/>
      <g class="canopy" style="transform:scale(${start})" data-scale="${scale}">
        ${blobs.map(b => `<circle class="c-edge" ${b}/>`).join('')}
        ${blobs.map(b => `<circle class="c-fill" ${b}/>`).join('')}
        <circle class="c-hi" cx="128" cy="62" r="20"/><circle class="c-hi" cx="214" cy="112" r="16"/><circle class="c-hi" cx="90" cy="140" r="14"/>
        ${n >= 1 ? leaf(48, 96, -150, 'lf1') + leaf(60, 70, -120, 'lf1') : ''}
        ${n >= 3 ? leaf(278, 100, -30, 'lf3') + leaf(262, 70, -60, 'lf3') : ''}
        ${n >= cards.length && cards.length ? leaf(100, 28, -100, 'lf9') + leaf(214, 24, -80, 'lf9') + leaf(160, 214, 90, 'lf9') + '<path class="spark big" d="' + SPARK + '" transform="translate(160 30) scale(1.6)"/>' : ''}
        ${cards.map(c => oliveSvg(c, picked.has(c.id), dropping.has(c.id))).join('')}
      </g>
      ${basketSvg(n)}
    </svg>
    <span class="ollie sm p7 tree-ollie" data-state="idle" role="img" aria-label="Ollie, standing by the tree"></span>`;
  prevScale = scale;
  if (start !== scale) requestAnimationFrame(() => requestAnimationFrame(() => {
    const c = host.querySelector('.canopy'); if (c) c.style.transform = `scale(${scale})`;
  }));
  const open = el => { const g = el.closest('.olive'); if (g && !g.classList.contains('picked') && !g.classList.contains('dropping')) onOlive(cards.find(c => c.id === g.dataset.id)); };
  host.onclick = e => open(e.target);
  host.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e.target); } };
  return host.querySelector('.tree-ollie');
}
export function resetTreeGrowth() { prevScale = null; }

/* ---------- bento and progress ---------- */
// tiles: { id, label, value, sub, wide, dark, card }
export function renderBento(host, tiles, onTap) {
  host.innerHTML = tiles.map(t => `
    <button class="bento ${t.wide ? 'wide' : ''} ${t.dark ? 'dark' : ''}" type="button" data-id="${t.id}">
      <span class="bento-label">${esc(t.label)}</span>
      <span class="bento-value">${esc(t.value)}</span>
      ${t.sub ? `<span class="bento-sub">${esc(t.sub)}</span>` : ''}
    </button>`).join('');
  host.onclick = e => { const b = e.target.closest('.bento'); if (b) onTap(tiles.find(t => t.id === b.dataset.id)); };
}
export function renderProgress(host, items) {
  host.innerHTML = items.map(p => `<div class="prog"><b>${esc(p.value)}</b><span>${esc(p.label)}</span></div>`).join('');
}

/* ---------- bottom sheet ---------- */
export function createSheet(root) {
  let opener = null;
  const close = () => {
    root.classList.remove('open');
    setTimeout(() => { if (!root.classList.contains('open')) { root.hidden = true; root.innerHTML = ''; } }, reduced() ? 0 : 280);
    if (opener && opener.isConnected) opener.focus();
    opener = null;
  };
  root.addEventListener('click', e => { if (e.target.matches('.sheet-back') || e.target.closest('.sheet-x')) close(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  return {
    close,
    // card: { icon (svg html), title, headline, detail, tag, tagClass }, actions: [{ label, primary, fn }]
    open(card, actions) {
      opener = document.activeElement;
      root.hidden = false;
      root.innerHTML = `
        <div class="sheet-back"></div>
        <div class="sheet-card" role="dialog" aria-modal="true" aria-label="${esc(card.title)}">
          <button class="sheet-x iconbtn" type="button" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          <div class="sheet-grip" aria-hidden="true"></div>
          <div class="sheet-top"><span class="card-icon">${card.icon}</span><p class="sheet-title">${esc(card.title)}${card.urgent ? '<span class="sheet-urgent">Urgent</span>' : ''}</p></div>
          <h3>${esc(card.headline)}</h3>
          ${card.detail ? `<p class="detail">${esc(card.detail)}</p>` : ''}
          ${card.html || ''}
          ${card.tag ? `<span class="${card.tagClass}">${esc(card.tag)}</span>` : ''}
          <div class="card-btns">${actions.map((a, k) => `<button class="btn ${a.primary ? 'primary' : ''}" type="button" data-k="${k}">${esc(a.label)}</button>`).join('')}</div>
        </div>`;
      root.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { close(); actions[+b.dataset.k].fn(); }));
      requestAnimationFrame(() => { root.classList.add('open'); const f = root.querySelector('[data-k]'); f && f.focus(); });
    },
  };
}

