import { listingFields, FIELD_LABELS, sectionRange } from './listingFields.js';
import { HttpError } from './httperror.js';
import { SEO_LIMITS, rewriteTagSection } from './validate.js';

// File 2 is the source of both the preview and the printed PDF, so an edit made
// here is written back into that prose in the same place it was read from. The
// heading line keeps its own wording and number; only the seller's answer inside
// the section changes. Nothing else in the document moves.

const HEADING_TAIL = /^(.*?:\s*)(\S.*)$/;

/** One paragraph per non-empty line, with the blanks the PDF layout expects. */
const paragraphs = (value) =>
  String(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n\n');

/**
 * Replaces the content of one section. A value written on the heading line stays
 * on the heading line; a value written under it stays under it, so the document
 * keeps the shape the PDF was already built for.
 */
function rewriteSection(text, label, value, name) {
  const range = sectionRange(text, label);
  if (!range) throw new HttpError(`File 2 has no ${name} section to edit. Generate the listing text again.`, 409);

  const { start, end, lines } = range;
  const inline = lines[start].match(HEADING_TAIL);
  const body = paragraphs(value).split('\n');

  if (inline) lines.splice(start, end - start, `${inline[1]}${body[0]}`, '', ...body.slice(1));
  else lines.splice(start + 1, end - start - 1, ...body);

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Writes the seller's own title, tags and description back into File 2, then
 * reads them out again. A field that did not land the way it was typed is refused
 * rather than saved: File 2 has to agree with the preview and the PDF, and a
 * silently ignored edit would print the old wording.
 *
 * `edits` carries only what changed; anything left out stays as the model wrote it.
 */
export function applyListingEdits(file2Text, { title, tags, description }) {
  let text = String(file2Text ?? '');
  const changed = [];

  if (Array.isArray(tags)) {
    const list = tags.map((tag) => String(tag).trim()).filter(Boolean);
    text = rewriteTagSection(text, list);
    changed.push('tags');
  }
  if (title !== undefined) {
    text = rewriteSection(text, FIELD_LABELS.title, String(title).trim(), 'SEO title');
    changed.push('title');
  }
  if (description !== undefined) {
    text = rewriteSection(text, FIELD_LABELS.description, description, 'description');
    changed.push('description');
  }

  if (!changed.length) throw new HttpError('Nothing to save — change the title, the tags or the description first.');

  const read = listingFields(text);
  const missed = [
    changed.includes('tags') && read.tags.join('|').toLowerCase() !== tags.map((t) => String(t).trim()).join('|').toLowerCase(),
    changed.includes('title') && read.title !== String(title).trim(),
    changed.includes('description') && !read.description,
  ];
  if (missed.includes(true)) {
    throw new HttpError('That edit did not fit the generated File 2, so nothing was saved. Generate the listing text again.', 409);
  }

  return { text, changed };
}

/**
 * The listing field checker the seller edits against: every marketplace limit
 * from the brief, reported in their words. Same rules seoIssues enforces on a
 * model's output, phrased for someone holding the keyboard rather than a log.
 */
export function tagIssues(tags) {
  const issues = [];
  const seen = new Set();

  tags.forEach((tag, index) => {
    const chars = [...tag].length;
    if (chars > SEO_LIMITS.tagMax) {
      issues.push(`Tag ${index + 1} (“${tag}”) is ${chars} characters; the limit is ${SEO_LIMITS.tagMax}.`);
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) issues.push(`Duplicate tag: “${tag}”.`);
    else seen.add(key);
  });

  if (tags.length !== SEO_LIMITS.tagCount) {
    issues.push(`You have ${tags.length} tag${tags.length === 1 ? '' : 's'}; Etsy wants exactly ${SEO_LIMITS.tagCount}.`);
  }

  return issues;
}

/**
 * Every blocking marketplace limit, read back out of the finished File 2 rather
 * than the form, so the check applies to whatever would actually be printed. The
 * API runs this before it saves and refuses on the first problem; the client
 * checks the same rules live. A model's own output always passes, so this never
 * locks out someone who only edits one field.
 */
export function listingIssues(text) {
  const read = listingFields(text);
  const title = read.title.trim();
  const chars = [...title].length;
  const issues = [];
  if (!title) issues.push('The SEO title is empty.');
  else if (chars > SEO_LIMITS.titleMax) {
    issues.push(`The SEO title is ${chars} characters; the limit is ${SEO_LIMITS.titleMax}.`);
  }
  return [...issues, ...tagIssues(read.tags)];
}
