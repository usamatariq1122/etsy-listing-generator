import { activeRules, bannedRe } from './content.js';

// Replace/find patterns are global; test patterns deliberately are not, because
// .test() on a /g/ regex is stateful and would produce flaky validation.
const BRACKETS_FIND = /\[[^\[\]]*\]/g;
const URLS_FIND = /\b(?:https?:\/\/|www\.)\S+/gi;
const URL_TEST = /(?:https?:\/\/|www\.)\S/i;
const FOOTNOTES_FIND = /\[\^\d+\]|(?<=[\w.)"])[\u00b9\u00b2\u00b3\u2074-\u2079\u2070]+/g;
const INLINE_CITATION_FIND = /\(\s*[A-Z][\w.'-]+(?:\s*,?\s*(?:&|and)\s*[A-Z][\w.'-]+)*\s*,?\s*(?:1[89]\d{2}|20\d{2})[a-z]?\s*\)/g;
const CITATION_LINE_FIND = /^[ \t]*(?:sources?|references?|works?\s+cited|bibliography|footnotes?|citations?|image\s+credits?|via)\b[^\n]*$/gim;
const CITATION_LINE_TEST = /^[ \t]*(?:sources?|references?|works?\s+cited|bibliography|footnotes?|citations?|image\s+credits?|via)\b/im;
const REFERENCE_HEADING = /^[ \t]*(?:#{1,6}[ \t]*)?(?:references|sources|works cited|bibliography|source list)[ \t]*:?$/im;

const tidy = (text) =>
  String(text)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Drops a trailing reference/source block, keeping the guide body intact. */
function dropReferenceSection(text) {
  const match = text.match(REFERENCE_HEADING);
  if (!match) return { text, dropped: false };
  const start = match.index;
  const tail = text.slice(start);
  if (tail.trim().length < Math.max(600, text.length * 0.25)) {
    return { text: text.slice(0, start), dropped: true };
  }
  return { text, dropped: false };
}

const escapeRe = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const LEFTOVER_LINE = /^[.,;:!?'"\-]+$/;

// Deleting a phrase can leave "text,," or "layout,." behind.
const PUNCT_CLEANUP = [
  [/[ \t]+([.,;:!?])/g, '$1'],
  [/(?:[ \t]*,[ \t]*){2,}/g, ', '],
  [/,([.;:!?])/g, '$1'],
  [/[ \t]*,[ \t]*$/gm, ''],
  [/^[ \t]*,[ \t]*/gm, ''],
];

// Most specific first, so removing a mention never leaves a dangling "by" or a
// half sentence behind: attributions go whole, "<brand> shop" becomes "my shop",
// a prepositional mention goes with its preposition, and anything left drops with
// its clause, including the "and subtle"-style lead-in that introduced it.
const phraseRules = (BRAND) => [
  [new RegExp(`\\(\\s*[^()]*${BRAND}[^()]*\\)`, 'gi'), ''],
  [new RegExp(`\\s*\\b(?:created|prepared|designed|made|brought to you)\\s+by\\s+${BRAND}[^\\n]*`, 'gi'), ''],
  [new RegExp(`${BRAND}(?=\\s+(?:shop|store)\\b)`, 'gi'), 'my'],
  [new RegExp(`\\s+\\b(?:by|from|of|with|to|at|in|for)\\s+${BRAND}`, 'gi'), ''],
  [
    new RegExp(
      `\\s*(?:\\b(?:and|with)\\b\\s*)?(?:\\b(?:subtle|discreet|visible|light|small|faint|optional|prominent|minimal)\\b\\s*)?${BRAND}[^,.\\n]*`,
      'gi',
    ),
    '',
  ],
];

// Any shop name the model invents, not just the legacy ones. An attribution is
// dropped unless the named brand is the one the owner configured in Settings.
// The verb is written out in both cases because the name that follows must stay
// capitalised, and a global /i flag would match "made by hand" too.
const ATTRIBUTION_FIND =
  /\s*[\[(]?\b(?:[Cc]reated|[Dd]esigned|[Mm]ade|[Pp]repared|[Pp]ublished|[Bb]rought to you)\s+by\s+([A-Z][\w'&.-]{1,29})\b[^.,;:)\]]*[\])]?/g;
const SHOP_NAME_FIND = /\b([A-Z][\w'-]{2,29})\s+(?:shop|store|boutique)\b/g;

function scrubForeignNames(value, allowed) {
  const keep = (name) => allowed.includes(String(name).toLowerCase());
  let out = value.replace(ATTRIBUTION_FIND, (match, name) => (keep(name.toLowerCase()) ? match : ''));
  out = out.replace(SHOP_NAME_FIND, (match, name) => (keep(name.toLowerCase()) ? match : 'my shop'));
  return out;
}

/**
 * Removes every shop name except the brand configured in Settings, so nothing
 * stored, displayed or printed carries a name the owner did not choose.
 */
export function scrubBranding(text, { allow = [] } = {}) {
  const allowed = allow.map((name) => String(name).trim().toLowerCase()).filter(Boolean);
  const brands = activeRules.legacyBrands.filter((name) => !allowed.includes(name.toLowerCase()));
  let value = String(text ?? '');

  if (brands.length) {
    for (const [pattern, replacement] of phraseRules(`\\b(?:${brands.map(escapeRe).join('|')})\\b`)) {
      value = value.replace(pattern, replacement);
    }
  }

  value = scrubForeignNames(value, allowed);
  for (const [pattern, replacement] of PUNCT_CLEANUP) value = value.replace(pattern, replacement);
  return tidy(value.split('\n').filter((line) => !LEFTOVER_LINE.test(line.trim())).join('\n'));
}

/** More than a few lines means the model already gave us structure to lay out. */
const isCollapsed = (text) => String(text ?? '').split('\n').filter((line) => line.trim()).length < 4;

const LABEL_TAIL = /[A-Z][A-Za-z ()&'/-]{0,44}:/;
const BULLET_LABELS =
  /^(materials|tools|what'?s? included|includes|sizes|abbreviations|notes|care|you need|you'?ll need)\b/i;

/**
 * Some models return the whole document as one long line, which the PDF then
 * prints as a single justified block. When that happens the text is re-grooved
 * onto lines: label-led sections become subheadings, enumerations become
 * bullets and numbered sections get their own line. Text that already has line
 * breaks is returned untouched, so this never rewrites a well-formed guide.
 */
export function groove(text) {
  const value = String(text ?? '').trim();
  if (!value || !isCollapsed(value)) return value;

  const oneLine = value.replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ');
  const lines = [];

  /** Writes one chunk out as a heading plus its body, keeping any "3." marker attached. */
  const emit = (chunk, prefix = '') => {
    const numbered = chunk.match(/^(\d{1,2}[.)])\s+(.*)$/s);
    if (numbered) {
      chunk = numbered[2];
      prefix = `${numbered[1]} `;
    }

    const label = chunk.match(/^([^.\n]{2,60}?):\s*(.*)$/);
    if (label && LABEL_TAIL.test(`${label[1]}:`)) {
      lines.push(`${prefix}${label[1].replace(/\s+/g, ' ')}:`.trim(), '');
      const rest = label[2].trim();
      const items =
        BULLET_LABELS.test(label[1]) && rest.length < 300
          ? rest
              .split(/,\s*(?:and\s+)?|\s+and\s+/)
              .map((item) => item.replace(/\.$/, '').trim())
              .filter((item) => item.length > 1)
          : [];
      if (items.length > 2) lines.push(...items.map((item) => `- ${item}`), '');
      else if (rest) lines.push(rest, '');
      return;
    }

    // A run-on section: break it at sentence ends so each idea gets its own paragraph.
    // The lookbehind keeps a list marker like "2." from being read as a sentence end.
    lines.push(
      ...chunk
        .split(/(?<=[.!?])(?<!\d[.!?])\s+(?=[A-Z])/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
        .map((sentence, i) => (i === 0 ? `${prefix}${sentence}` : sentence)),
      '',
    );
  };

  // Numbered sections such as "1. SEO Title: ... 2. 13 Tags: ..." start a line each.
  const parts = oneLine
    .replace(/\s+(?=\d{1,2}[.)]\s+\S)/g, '\n')
    .replace(/(?<!\d)([.!?])\s+(?=[A-Z][A-Za-z ()&'/-]{0,44}:)/g, '$1\n')
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) emit(part);

  return tidy(lines.join('\n'));
}

const LICENSE_HEADING = /^(?:#{1,6}\s*)?licen[cs]e(?:\s+(?:terms?|information|policy))?!?\s*:?\s*$/i;
const LICENSE_INLINE = /^(licen[cs]e(?:\s+terms?)?)\s*:\s*(\S.*)$/i;
const LICENSE_STAMP = /^.{1,60} holds all rights to this guide and to the designs in it\./;

/**
 * Credits the configured brand inside the guide's licence section. Existing
 * terms the model wrote stay where they are; the brand line is added above them,
 * and a section is created when the guide has none.
 */
export function applyBrandLicense(text, brand) {
  const value = String(text ?? '');
  const name = String(brand ?? '').trim();
  if (!name || !value.trim()) return value;

  const sentence = `${name} holds all rights to this guide and to the designs in it. Buying it grants you a personal and commercial-use licence for items you make yourself.`;
  // A guide generated under an earlier brand name keeps only the current one.
  const lines = value.split('\n').filter((line) => !LICENSE_STAMP.test(line.trim()));

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (LICENSE_HEADING.test(line)) {
      lines.splice(i + 1, 0, '', sentence);
      return tidy(lines.join('\n'));
    }
    const inline = line.match(LICENSE_INLINE);
    if (inline) {
      lines.splice(i, 1, `${inline[1]}:`, '', sentence, '', inline[2]);
      return tidy(lines.join('\n'));
    }
  }

  return tidy(`${value}\n\nLicense:\n\n${sentence}`);
}

/**
 * Strips everything File 1 is not allowed to contain and reports what it
 * removed, so the UI can tell the user the text was auto-cleaned.
 */
export function cleanFileOne(raw) {
  let text = String(raw ?? '');
  const removed = {
    brackets: 0, urls: 0, footnotes: 0, inlineCitations: 0,
    citationLines: 0, bannedWord: 0, referenceSection: false,
  };

  const section = dropReferenceSection(text);
  text = section.text;
  removed.referenceSection = section.dropped;

  removed.brackets = (text.match(BRACKETS_FIND) || []).length;
  text = text.replace(BRACKETS_FIND, '');

  removed.urls = (text.match(URLS_FIND) || []).length;
  text = text.replace(URLS_FIND, '');

  removed.footnotes = (text.match(FOOTNOTES_FIND) || []).length;
  text = text.replace(FOOTNOTES_FIND, '');

  removed.inlineCitations = (text.match(INLINE_CITATION_FIND) || []).length;
  text = text.replace(INLINE_CITATION_FIND, '');

  const keptLines = [];
  for (const line of text.split('\n')) {
    if (CITATION_LINE_TEST.test(line)) removed.citationLines += 1;
    else keptLines.push(line);
  }
  text = keptLines.join('\n');

  const banned = scrubBannedWord(text);
  removed.bannedWord = banned.count;

  return { text: tidy(banned.text), removed };
}

export function scrubBannedWord(text) {
  const value = String(text ?? '');
  const count = (value.match(bannedRe()) || []).length;
  if (!count) return { text: value, count: 0 };
  return { text: tidy(value.replace(bannedRe(), '')), count };
}

/** How often the banned word appears across a list of image prompts. */
export function countBannedWord(values) {
  if (!Array.isArray(values)) return 0;
  return values.reduce((sum, value) => sum + scrubBannedWord(String(value ?? '')).count, 0);
}

/** Problems that would make File 1 unusable. Empty array means it passed. */
export function validateFileOne(text) {
  const value = String(text ?? '');
  const issues = [];

  if (!value.trim()) issues.push('File 1 came back empty.');
  if (value.includes('[') || value.includes(']')) issues.push('File 1 still contains a [ ] bracket.');
  if (URL_TEST.test(value)) issues.push('File 1 still contains a URL.');
  if (activeRules.bannedTest.test(value)) issues.push(`File 1 still contains the banned word "${activeRules.bannedWord}".`);
  if (CITATION_LINE_TEST.test(value)) issues.push('File 1 still contains a source, reference or footnote line.');
  if (value.trim().length && value.trim().length < 400) {
    issues.push('File 1 is suspiciously short (under 400 characters).');
  }
  return issues;
}

export function validateFileTwo(text) {
  const value = String(text ?? '').trim();
  if (!value) return ['File 2 came back empty.'];
  if (value.length < 400) return ['File 2 is suspiciously short (under 400 characters).'];
  return [];
}

export function normalizeShape(raw, { allow = [] } = {}) {
  const text = (value) => scrubBranding(typeof value === 'string' ? value : '', { allow });
  const list = (value) =>
    Array.isArray(value) ? value.map((v) => text(v).trim()).filter(Boolean) : [];
  // A prompt is copied straight into an image tool, so the marketplace word has
  // to be gone before the seller ever sees it.
  const promptList = (value) =>
    Array.isArray(value) ? value.map((v) => scrubBannedWord(text(v)).text.trim()).filter(Boolean) : [];
  return {
    file1_text: text(raw?.file1_text),
    file2_text: text(raw?.file2_text),
    seo_title: text(raw?.seo_title).trim(),
    seo_tags: list(raw?.seo_tags),
    mockup_prompts: promptList(raw?.mockup_prompts).slice(0, 4),
    infographic_prompts: promptList(raw?.infographic_prompts).slice(0, 3),
  };
}

export function shapeIssues(shape) {
  const issues = [];
  if (shape.mockup_prompts.length !== 4) issues.push(`Expected 4 mockup prompts, got ${shape.mockup_prompts.length}.`);
  if (shape.infographic_prompts.length !== 3) issues.push(`Expected 3 infographic prompts, got ${shape.infographic_prompts.length}.`);
  return issues;
}

const SEO_TITLE_MAX = 140;
const SEO_TAG_MAX = 20;
const SEO_TAG_COUNT = 13;

/** Marketplace limits from the brief: title length, tag count and tag length. */
export function seoIssues(shape) {
  const issues = [];

  const title = [...shape.seo_title].length;
  if (!title) issues.push('SEO title is missing.');
  else if (title > SEO_TITLE_MAX) issues.push(`SEO title is ${title} characters (max ${SEO_TITLE_MAX}).`);

  const tags = shape.seo_tags;
  if (tags.length !== SEO_TAG_COUNT) issues.push(`Expected ${SEO_TAG_COUNT} SEO tags, got ${tags.length}.`);

  const tooLong = tags.filter((tag) => [...tag].length > SEO_TAG_MAX);
  if (tooLong.length) {
    issues.push(
      `${tooLong.length} tag(s) exceed ${SEO_TAG_MAX} characters: ${tooLong
        .slice(0, 3)
        .map((tag) => `"${tag}" (${[...tag].length})`)
        .join(', ')}.`,
    );
  }

  const seen = new Set();
  const duplicates = tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
  if (duplicates.length) issues.push(`Duplicate SEO tag(s): ${duplicates.map((tag) => `"${tag}"`).join(', ')}.`);

  return issues;
}

/** Trims to `max` characters on a word boundary, without a dangling separator. */
function cut(value, max) {
  const chars = [...String(value).trim()];
  if (chars.length <= max) return String(value).trim();
  return chars.slice(0, max).join('').replace(/\s+\S*$/, '').replace(/[,:;.\-]+$/, '').trim();
}

/**
 * Brings the SEO fields inside the marketplace limits locally instead of paying
 * for a second model call, and rewrites the same strings inside File 2 so the
 * PDF never disagrees with the tag list.
 */
export function repairSeo(shape) {
  const notes = [];
  const replacements = [];

  const title = cut(shape.seo_title, SEO_TITLE_MAX);
  if (title !== shape.seo_title.trim()) {
    notes.push(`SEO title shortened to ${[...title].length} characters`);
    replacements.push([shape.seo_title.trim(), title]);
  }

  const seen = new Set();
  const tags = [];
  for (const tag of shape.seo_tags) {
    const short = cut(tag, SEO_TAG_MAX);
    if (short !== tag) {
      notes.push(`tag "${tag}" shortened to "${short}"`);
      replacements.push([tag, short]);
    }
    const key = short.toLowerCase();
    if (!short || seen.has(key)) {
      notes.push(`dropped the repeated tag "${short || tag}"`);
      continue;
    }
    seen.add(key);
    if (tags.length >= SEO_TAG_COUNT) {
      notes.push(`dropped the extra tag "${short}"`);
      continue;
    }
    tags.push(short);
  }

  if (tags.length < SEO_TAG_COUNT) notes.push(`only ${tags.length} tags were returned`);

  const file2_text = replacements.reduce(
    (text, [from, to]) => (from ? text.replace(from, to) : text),
    shape.file2_text,
  );

  return { shape: { ...shape, seo_title: title, seo_tags: tags, file2_text }, notes };
}

const key = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

// "macrame pattern" and "macrame patterns" are the same demand, so plurals are
// folded before any tag is compared with a query.
const stem = (word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word);

const words = (value) => new Set(key(value).split(' ').filter(Boolean).map(stem));

function overlap(a, b) {
  const set = words(b);
  return [...words(a)].filter((w) => set.has(w)).length;
}

/**
 * A tag counts as searched when its words fit inside a real query, or the whole
 * query fits inside it. "crochet hat" is backed by "crochet bucket hat", so a
 * broader tag is never thrown away for a longer one.
 */
function sharesWords(a, b) {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  const inside = (small, big) => [...small].every((word) => big.has(word));
  return inside(A, B) || inside(B, A);
}

const BULLET = /^[-*•]\s+/;
const TAG_HEAD = /^\s*(?:\d{1,2}[.)]\s*)?(?:13\s*)?(?:seo\s+)?tags?\b\s*:?/i;

/**
 * Rewrites the tag list inside File 2 from the final tags, so the PDF can never
 * disagree with the field the seller copies. Bullet lists stay bullets, a comma
 * paragraph stays a comma paragraph, and a list on the heading line stays there.
 */
/** A heading alone ("13 Tags:") or a line whose tail is a comma-separated tag list. */
function isTagLine(line) {
  const text = line.trim();
  if (!TAG_HEAD.test(text)) return false;
  const inline = text.match(/^.*?:\s*(\S.*)$/);
  if (!inline) return text.length <= 40;
  const items = inline[1].replace(/[,.]$/, '').split(',');
  return items.length >= 2 && items.every((item) => item.trim().length <= SEO_TAG_MAX + 5);
}

function rewriteTagSection(text, tags) {
  const lines = String(text ?? '').split('\n');
  const head = lines.findIndex(isTagLine);
  if (head < 0) return text;

  const inline = lines[head].match(/^(.*?:\s*)(\S.*)$/);
  if (inline && !BULLET.test(inline[2])) {
    lines[head] = `${inline[1]}${tags.join(', ')}.`;
    return lines.join('\n');
  }

  let end = head + 1;
  while (end < lines.length && !lines[end].trim()) end += 1;
  if (end >= lines.length) return text;

  const bullets = BULLET.test(lines[end].trim());
  let stop = end;
  while (stop < lines.length && (bullets ? BULLET.test(lines[stop].trim()) : lines[stop].trim())) stop += 1;
  if (stop === end) return text;

  const list = bullets ? tags.map((tag) => `- ${tag}`) : [`${tags.join(', ')}.`];
  lines.splice(end, stop - end, ...list);
  return lines.join('\n');
}

/**
 * Puts real buyer queries to work. A tag nobody types is worth nothing in
 * marketplace search, so each unbacked tag is swapped for the closest unused
 * query, missing slots up to 13 are filled from the same list, and File 2 is
 * rewritten to match. Terms longer than the tag limit are never truncated into
 * fragments: a phrase that does not fit on its own is left out.
 */
export function alignSeo(shape, terms = []) {
  const notes = [];
  const list = [...new Set(terms.map(key).filter(Boolean))];
  if (!list.length || !shape.seo_tags.length) return { shape, notes };

  const backed = (tag) => list.some((term) => sharesWords(term, tag));
  const used = new Set(shape.seo_tags.map(key));
  const take = (tag) => {
    // Ranking only: a filler tag like "knot craft guide" shares no word with the
    // niche queries and still has to go, so the best remaining query wins even
    // when the overlap is zero.
    const fits = list
      .filter((term) => [...term].length <= SEO_TAG_MAX && !used.has(term))
      .sort((a, b) => overlap(b, tag) - overlap(a, tag) || list.indexOf(a) - list.indexOf(b));
    if (!fits.length) return null;
    used.add(fits[0]);
    return fits[0];
  };

  const tags = shape.seo_tags.map((tag) => {
    if (backed(tag)) return tag;
    const picked = take(tag);
    if (!picked) return tag;
    notes.push(`replaced the tag "${tag}" with the buyer query "${picked}"`);
    return picked;
  });

  if (tags.length < SEO_TAG_COUNT) {
    const spare = list.filter((term) => [...term].length <= SEO_TAG_MAX && !used.has(term));
    while (tags.length < SEO_TAG_COUNT && spare.length) {
      const [next] = spare.splice(0, 1);
      used.add(next);
      tags.push(next);
      notes.push(`added the buyer query "${next}" to fill tag ${tags.length}`);
    }
  }

  const unbacked = tags.filter((tag) => !backed(tag));
  if (unbacked.length) {
    notes.push(`${unbacked.length} tag(s) have no buyer query behind them: ${unbacked.map((t) => `"${t}"`).join(', ')}`);
  }
  const titleTerm = list.find((term) => key(shape.seo_title).includes(term) && term.split(' ').length > 1);
  if (!titleTerm) notes.push('the SEO title does not contain a searched phrase from this niche');

  return { shape: { ...shape, seo_tags: tags, file2_text: rewriteTagSection(shape.file2_text, tags) }, notes };
}

export function summarizeCleaning(removed) {
  const notes = [];
  if (removed.brackets) notes.push(`removed ${removed.brackets} bracketed span(s)`);
  if (removed.citationLines) notes.push(`removed ${removed.citationLines} citation/source line(s)`);
  if (removed.inlineCitations) notes.push(`removed ${removed.inlineCitations} inline citation(s)`);
  if (removed.footnotes) notes.push(`removed ${removed.footnotes} footnote marker(s)`);
  if (removed.urls) notes.push(`removed ${removed.urls} URL(s)`);
  if (removed.referenceSection) notes.push('removed a trailing reference section');
  if (removed.bannedWord) notes.push(`removed ${removed.bannedWord} occurrence(s) of "${activeRules.bannedWord}"`);
  return notes;
}
