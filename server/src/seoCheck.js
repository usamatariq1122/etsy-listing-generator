// A checklist of the limits the marketplace states and the habits its search
// field is known for. It scores what the model wrote against the keywords the
// seller picked; it never promises a position, because nobody can.

const TAG_MAX = 20;
const TAG_COUNT = 13;
// A phrase a shopper types once in a title is a keyword; the same phrase six
// times reads as stuffing to a human and to search alike.
const MAX_REPEAT = 3;
const TITLE_HEAD_WORDS = 6;

const norm = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

// "crochet patterns" and "crochet pattern" are the same query for these rules.
const stem = (word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word);
const skeletal = (value) => norm(value).split(' ').filter(Boolean).map(stem).join(' ');

function contains(haystack, phrase) {
  const text = ` ${skeletal(haystack)} `;
  const needle = skeletal(phrase);
  return Boolean(needle) && text.includes(` ${needle} `);
}

function countOccurrences(text, phrase) {
  const words = skeletal(phrase).split(' ').filter(Boolean);
  if (!words.length) return 0;
  const source = ` ${skeletal(text)} `;
  // Counting on a padded string keeps "hat" from matching inside "hats off".
  const re = new RegExp(`(?<= )${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(' ')}(?= )`, 'g');
  return (source.match(re) || []).length;
}

const HEADING = /^\s*(?:[1-9]\d?[.)]\s+|[-#*_]{1,6}\s|#\s)/;

/**
 * The Description section of File 2, whether it starts on its own heading line
 * ("3. DESCRIPTION") or inline ("Description: …"). Everything up to the next
 * numbered section belongs to it.
 */
export function descriptionOf(file2Text) {
  const lines = String(file2Text ?? '').split('\n');
  const start = lines.findIndex((line) => /^\s*(?:\d{1,2}[.)]\s*)?description\b\s*[:]?\s*$/i.test(line.trim()));
  if (start >= 0) {
    const body = [];
    for (let i = start + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.trim() && HEADING.test(line)) break;
      body.push(line);
    }
    return body.join('\n').trim();
  }

  // A heading with the text on the same line, or a bold "**Description:**" run.
  const inline = lines.findIndex((line) => /^\s*(?:\d{1,2}[.)]\s*)?[*_]{0,2}description\b/i.test(line));
  if (inline < 0) return '';
  const first = lines[inline].replace(/^\s*(?:\d{1,2}[.)]\s*)?[*_]{0,2}description\b[*_\s:.-]*/i, '').trim();
  const body = [first];
  for (let i = inline + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() && HEADING.test(line)) break;
    body.push(line);
  }
  return body.join('\n').trim();
}

const firstLines = (text, count) =>
  String(text ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, count)
    .join(' ');

/** The phrase the whole listing is built around: the first one the seller ticked. */
export function mainKeyword({ picked = [], terms = [], productName = '' }) {
  return [picked[0], terms[0], productName].map((v) => norm(v)).find(Boolean) || '';
}

/**
 * Scores the finished SEO fields against the picked keywords.
 * `shape.seo_title` / `shape.seo_tags` are the values after repairSeo and
 * alignSeo, so the score always describes what the seller will actually copy.
 */
export function checkSeo({ shape, file2Text, picked = [], terms = [], productName = '', main = '' }) {
  const title = String(shape?.seo_title ?? '').trim();
  const tags = Array.isArray(shape?.seo_tags) ? shape.seo_tags : [];
  const description = descriptionOf(file2Text);
  const keyword = main || mainKeyword({ picked, terms, productName });
  const tracked = [...new Set([...picked, keyword].map(norm).filter(Boolean))];

  const head = norm(title).split(' ').slice(0, TITLE_HEAD_WORDS).join(' ');
  const repeats = tracked
    .map((phrase) => ({ phrase, times: countOccurrences(`${title} ${description}`, phrase) }))
    .filter((entry) => entry.times > MAX_REPEAT)
    .sort((a, b) => b.times - a.times);

  const tooLong = tags.filter((tag) => [...String(tag).trim()].length > TAG_MAX);
  const seen = new Set();
  const duplicates = tags.filter((tag) => {
    const key = norm(tag);
    if (!key || seen.has(key)) return true;
    seen.add(key);
    return false;
  });

  const items = [
    {
      label: `Main keyword “${keyword}” opens the title`,
      pass: Boolean(keyword) && contains(head, keyword),
      detail: keyword
        ? contains(head, keyword)
          ? 'It is in the first words, where search weighs it most.'
          : `The title starts with “${cut(head, 60)}” instead.`
        : 'No keyword to place — pick at least one before generating.',
    },
    {
      label: 'Main keyword in the first two lines of the description',
      pass: Boolean(keyword) && contains(firstLines(description, 2), keyword),
      detail: keyword
        ? contains(firstLines(description, 2), keyword)
          ? 'A shopper who searches the phrase sees it in the preview line.'
          : 'The opening lines talk around it; move it into the first sentence.'
        : 'No keyword to place.',
    },
    {
      label: `${TAG_COUNT} tags`,
      pass: tags.length === TAG_COUNT,
      detail: `The listing carries ${tags.length} tag${tags.length === 1 ? '' : 's'}.`,
    },
    {
      label: `Every tag ${TAG_MAX} characters or less`,
      pass: tags.length > 0 && !tooLong.length,
      detail: tooLong.length
        ? `Too long: ${tooLong.slice(0, 3).map((tag) => `“${cut(tag, 28)}” (${[...tag].length})`).join(', ')}.`
        : 'All tags fit the field.',
    },
    {
      label: 'No duplicate tags',
      pass: tags.length > 0 && !duplicates.length,
      detail: duplicates.length ? `Repeated: ${duplicates.map((tag) => `“${tag}”`).join(', ')}.` : 'Every tag says something different.',
    },
    {
      label: `No keyword used more than ${MAX_REPEAT} times`,
      pass: !repeats.length,
      detail: repeats.length
        ? `Stuffed: ${repeats.slice(0, 3).map((entry) => `“${entry.phrase}” ${entry.times}×`).join(', ')}.`
        : 'Phrases are spread out rather than repeated.',
    },
  ];

  const passed = items.filter((item) => item.pass).length;
  return {
    score: Math.round((passed / items.length) * 100),
    passed,
    total: items.length,
    keyword,
    items,
    // The client prints this: the score is a checklist, never a promise.
    note: 'A checklist of the marketplace’s own limits and common search habits. It is not a ranking guarantee.',
  };
}

const cut = (value, max) => ([...String(value)].length <= max ? String(value) : `${[...String(value)].slice(0, max).join('').trimEnd()}…`);
