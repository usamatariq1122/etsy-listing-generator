// One CSV, many listings. The parser turns pasted text into the rows the studio
// would otherwise take by hand: a product name and the phrases to tick for it.
// Nothing here generates or prices anything — it only reads the file into rows,
// and each row later drives the same single-listing pipeline one at a time.

const NAME_COLUMN = /^(product[_ ]?name|name|title|niche)$/i;
const KEYWORDS_COLUMN = /^(keywords?|tags?|phrases?)$/i;

/**
 * A small, honest CSV reader: double quotes may wrap a cell, a doubled quote is
 * one quote inside it, a comma inside quotes does not split, and CRLF or LF both
 * end a row. It is not trying to be every CSV — just the two-column files this
 * screen asks for.
 */
export function parseRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') endCell();
    else if (ch === '\n') endRow();
    else cell += ch;
  }
  if (cell || row.length) endRow();
  return rows.filter((r) => r.some((value) => value.trim()));
}

/** Header names to column indexes, so the file may list the columns in any order. */
function headerIndexes(header) {
  const indexes = { name: -1, keywords: -1 };
  header.forEach((title, index) => {
    const label = title.trim();
    if (indexes.name < 0 && NAME_COLUMN.test(label)) indexes.name = index;
    else if (indexes.keywords < 0 && KEYWORDS_COLUMN.test(label)) indexes.keywords = index;
  });
  return indexes;
}

const splitKeywords = (value) =>
  String(value ?? '')
    .split(/[;|]/)
    .map((term) => term.trim())
    .filter(Boolean);

/**
 * Turns CSV text into rows of `{ productName, keywords }`. A first line that
 * names a product column is treated as a header and skipped; otherwise the whole
 * file is data and column one is the name, column two the keywords. A name over
 * 200 characters is trimmed to the portal's own limit rather than dropped.
 */
export function parseCsv(text) {
  const rows = parseRows(text);
  if (!rows.length) return { rows: [], skipped: 0 };

  const header = headerIndexes(rows[0]);
  const hasHeader = header.name >= 0;
  const body = hasHeader ? rows.slice(1) : rows;
  const nameAt = hasHeader ? header.name : 0;
  const keywordsAt = hasHeader ? header.keywords : 1;

  const parsed = [];
  let skipped = 0;
  for (const row of body) {
    const productName = String(row[nameAt] ?? '').trim().slice(0, 200);
    if (productName.length < 3) {
      skipped += 1;
      continue;
    }
    parsed.push({ productName, keywords: splitKeywords(row[keywordsAt] ?? '') });
  }
  return { rows: parsed, skipped };
}
