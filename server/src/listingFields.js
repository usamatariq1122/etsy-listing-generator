import { descriptionOf } from './seoCheck.js';

// The listing fields the seller copies into the marketplace form live inside
// File 2 as prose. This reads them back out for the preview without touching
// the generation, the cleaning or the SEO repair — File 2 stays the source.

export const FIELD_LABELS = {
  title: 'seo\\s+title',
  tags: '(?:13\\s*)?seo\\s*tags?|(?:13\\s*)?tags?',
  description: 'description',
  attributes: 'categor(?:y|ies)?(?:\\s*(?:&|and|/)\\s*attribut(?:e|es)?)?|attribut(?:e|es)',
};

// Sections that are not previewed but still end the section before them.
const TAIL_SECTIONS = [
  'image\\s+placement(?:\\s+guide)?|placement\\s+guide',
  'listing\\s+checklist|checklist',
  'listing\\s+video(?:\\s+idea)?|video\\s+idea',
];

const MARKDOWN_HEADING = /^\s*#{1,6}\s+\S/;
const NUMBERED = /^\s*\d{1,2}[.)]\s+[*_]{0,2}\s*\S/;

const startFor = (label) =>
  new RegExp(`^\\s*(?:#{1,6}\\s*)?(?:\\d{1,2}[.)]\\s*)?[*_]{0,2}\\s*(?:${label})\\b`, 'i');

/**
 * A section title carries its own name and little else. "Category path: Craft
 * Supplies > Yarn" is body text even though it opens with the same word, while
 * "5. Category & Attributes:" is the heading. A numbered marker in front of a
 * known section name always means the next section starts there.
 */
function isHeadingLine(line, label) {
  const match = line.match(startFor(label));
  if (!match) return false;
  if (NUMBERED.test(line)) return true;
  const rest = line.slice(match[0].length).replace(/^[*_\s:.\-]+/, '').trim();
  if (!rest) return true;
  return MARKDOWN_HEADING.test(line) ? [...rest].length <= 40 : rest.split(/\s+/).length <= 2;
}

const isAnyHeading = (line) =>
  MARKDOWN_HEADING.test(line) ||
  Object.values(FIELD_LABELS).some((label) => isHeadingLine(line, label)) ||
  TAIL_SECTIONS.some((label) => isHeadingLine(line, label));

/** One section of File 2: the text on its heading line plus the lines under it. */
function sectionOf(text, label) {
  const find = startFor(label);
  const lines = String(text ?? '').split('\n');
  const start = lines.findIndex((line) => find.test(line));
  if (start < 0) return { head: '', body: [] };

  const head = lines[start].slice(lines[start].match(find)[0].length).replace(/^[*_\s:.\-]+/, '').trim();
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trim() && isAnyHeading(lines[i])) break;
    body.push(lines[i]);
  }
  return { head, body };
}

/**
 * Where one section sits in File 2, as line numbers: the heading line and every
 * line that belongs to the section after it. The editor writes a changed field
 * back into exactly this range, so a seller's edit cannot move a section or
 * swallow the next one.
 */
export function sectionRange(text, label) {
  const find = startFor(label);
  const lines = String(text ?? '').split('\n');
  const start = lines.findIndex((line) => find.test(line));
  if (start < 0) return null;
  const head = lines[start].slice(lines[start].match(find)[0].length).replace(/^[*_\s:.\-]+/, '').trim();
  let end = start + 1;
  while (end < lines.length && (!lines[end].trim() || !isAnyHeading(lines[end]))) end += 1;
  return { start, end, head, lines };
}

function tagsFrom({ head, body }) {
  const source = head || body.join('\n');
  return source
    .split(/[,\n]/)
    .map((tag) => tag.replace(/^[-*•\d.)\s]+/, '').replace(/[.*_]+$/, '').trim())
    .filter((tag) => tag && !/^\d{0,2}\s*(?:seo\s*)?tags?$/i.test(tag));
}

/** "Digital files: PDF" becomes { label, value }; a bare line keeps its text. */
function attributesFrom({ head, body }) {
  const pairs = [];
  for (const line of [head, ...body].filter((text) => text && text.trim())) {
    const text = line.replace(/^[-*•\d.)\s]+/, '').trim();
    if (!text) continue;
    const pair = text.match(/^([^:\n]{2,60}?)\s*:\s*(.+)$/);
    if (pair) pairs.push({ label: pair[1].trim(), value: pair[2].trim() });
    else if (text.length <= 120) pairs.push({ label: '', value: text });
  }
  return pairs;
}

const firstLine = ({ head, body }) => head || body.find((line) => line.trim())?.trim() || '';

/** A whole section as prose: the inline heading tail plus every line under it. */
const paragraph = ({ head, body }) => [head, ...body].join('\n').trim();

/** The fields a seller types into the listing form, read straight from File 2. */
export function listingFields(file2Text) {
  const text = String(file2Text ?? '');
  const attributes = sectionOf(text, FIELD_LABELS.attributes);
  return {
    title: firstLine(sectionOf(text, FIELD_LABELS.title)),
    tags: tagsFrom(sectionOf(text, FIELD_LABELS.tags)),
    description: paragraph(sectionOf(text, FIELD_LABELS.description)) || descriptionOf(text),
    attributes: attributesFrom(attributes),
  };
}
