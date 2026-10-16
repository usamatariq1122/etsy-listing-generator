// Generic stand-in for the shop's own rules file. Copy it to rules.js
// (npm run setup does that) and set the values your shop actually uses -
// rules.js itself is git-ignored, so your old shop names stay private.

// The marketplace word that must never reach a buyer-facing guide or an image.
export const BANNED_WORD = 'Etsy';
export const BANNED_WORD_RE = /etsy/gi;

// Shop names from earlier listings. The scrubber removes any of these from model
// output so only the brand configured in Settings can appear. Start with an
// empty list and add your own retired names.
export const LEGACY_BRANDS = [];

// Upload checks for the 7 listing images. Only JPG and PNG are accepted, and
// dimensions are read straight from the file header.
export const IMAGE_RULES = {
  ratio: 4 / 3,
  ratioTolerance: 0.02,
  minWidth: 2000,
  maxBytes: 25 * 1024 * 1024,
};
