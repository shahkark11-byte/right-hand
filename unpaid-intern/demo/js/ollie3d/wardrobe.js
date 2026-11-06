// The wardrobe lists, kept pure (no three.js, no DOM) so tests and the pitch tools can read them.
export const OUTFITS = ['none', 'suit', 'grad', 'glasses', 'detective', 'hardhat', 'wig'];
export const PROPS = ['none', 'laptop', 'briefcase', 'book', 'magnifier', 'clipboard', 'gavel', 'envelope', 'certificate'];
// Which hand holds each prop: left, right, both, or none (it stands on the ground in front of Ollie).
export const PROP_HAND = { laptop: 'ground', briefcase: 'L', book: 'both', magnifier: 'R', clipboard: 'L', gavel: 'R', envelope: 'R', certificate: 'both' };
