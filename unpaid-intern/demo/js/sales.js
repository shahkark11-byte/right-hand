// Find me customers: draft a personal email to each business, block anyone UK law says needs consent first,
// and hold everything for approval. Pure logic, no DOM, no network. Nothing here sends anything.
// The heartbeat, quiet hours, daily budget and "nothing goes out unapproved" are ideas from the open-source sales agent Harvey (MIT licence).

const CORPORATE = ['ltd', 'llp', 'scottish_partnership'];
export const TYPE_LABEL = { ltd: 'Ltd', llp: 'LLP', scottish_partnership: 'Scottish partnership', sole_trader: 'Sole trader' };

// PECR reg 22: no unsolicited marketing email to an individual subscriber (a sole trader) without consent.
// Reg 2(1): a company and a partnership in Scotland are corporate subscribers.
export function pecrCheck(lead) {
  const t = String(lead?.type || '').trim();
  if (CORPORATE.includes(t)) return { allowed: true, why: 'corporate subscriber' };
  if (t === 'sole_trader') return { allowed: false, why: 'needs consent (PECR reg 22)' };
  return { allowed: false, why: 'check the business type first' };
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export function draftEmail(lead, sender) {
  const body = ['Hello,', '',
    `I noticed this on your website: ${lead.fact}.`, '',
    `I run ${sender.business} in ${sender.town}. We do ${sender.offer} for local businesses.`,
    `If it would help ${lead.name}, I can send a short quote.`, '',
    'Thank you,', sender.name, sender.business, '',
    `Don't want emails from us? ${sender.optout}.`].join('\n');
  return { to: lead.email, subject: `${cap(sender.offer)} for ${lead.name}`, body };
}

// Companies and Scottish partnerships get a draft that waits for approval; the rest are blocked, with the reason.
export function buildOutbox(rows, sender, suppressed = []) {
  const stop = new Set(suppressed.map(a => String(a).toLowerCase()));
  const drafts = [], blocked = [];
  for (const lead of rows) {
    if (stop.has(String(lead.email).toLowerCase())) { blocked.push({ lead, why: 'asked not to be emailed' }); continue; }
    const c = pecrCheck(lead);
    if (!c.allowed) { blocked.push({ lead, why: c.why }); continue; }
    drafts.push({ lead, email: draftEmail(lead, sender), status: 'awaiting approval' });
  }
  return { drafts, blocked };
}

export function classifyReply(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(stop|remove|unsubscribe|opt[- ]?out)\b|take (me|us) off|do not (email|contact)|don't (email|contact)/.test(t)) return 'unsubscribe';
  if (/\b(yes|yeah|call me|ring me|looking for|keen|sounds good|tell me more)\b|(?<!not )\binterested\b/.test(t)) return 'interested';
  if (/already have|not interested|no thanks|no thank you|happy with/.test(t)) return 'objection';
  return 'question';
}

// Label each reply; stop requests join the do-not-email list.
export function handleReplies(rows) {
  const items = rows.map(r => ({ from: r.from, text: r.text, kind: classifyReply(r.text) }));
  return { items, suppressed: items.filter(i => i.kind === 'unsubscribe').map(i => i.from) };
}

// The heartbeat: what to do next, decided in code (no model). Replies first, then new drafts, then new leads.
export function decideNext({ quiet, budgetLeft, unreadReplies, newLeads }) {
  if (quiet || budgetLeft <= 0) return 'sleep';
  if (unreadReplies > 0) return 'handle_replies';
  if (newLeads > 0) return 'write_drafts';
  return 'find_leads';
}
