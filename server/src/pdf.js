import PDFDocument from 'pdfkit';

// Print-friendly palette: one dark ink for titles, one accent for section
// headings and rules, one muted grey for labels and footers. A seller can
// recolour all four through the `theme` argument; these stay the default.
const PALETTE = {
  ink: '#14293d',
  accent: '#2f6f8f',
  muted: '#6b7280',
  hairline: '#d7dee5',
};

// pdfkit's built-in Helvetica is WinAnsi-encoded, so pictographs and dingbats
// have no glyph and would render as garbage.
const UNSUPPORTED = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu;

const sanitize = (value) =>
  String(value ?? '')
    .replace(/→|➡/g, '->')
    .replace(/[✅✔☑]/g, '[x]')
    .replace(/[❌✖]/g, '[ ]')
    .replace(UNSUPPORTED, '')
    .replace(/\t/g, '    ')
    .replace(/\r\n/g, '\n');

const BULLET = /^[-*•]\s+(.*)$/;
const NUMBERED = /^(\d{1,2})[.)]\s+(.*)$/;
const BYLINE = /^(?:\w+\s+)?by\s+\S/i;

// A source line this long is prose; shorter ones are list-ish and stay on
// their own line so tags and attributes do not collapse into one blob.
const PROSE = 60;

const indentLevel = (raw) => Math.min(2, Math.floor((raw.match(/^ */)[0].length || 0) / 2));

const isHeading = (line) =>
  line.length <= 90 && line === line.toUpperCase() && /[A-Z]/.test(line) && !/[.!?]$/.test(line);

const isSubHeading = (line) =>
  line.length <= 80 && (line.endsWith(':') || /^step \d+\b/i.test(line));

const isTitleLine = (line) =>
  line.length <= 90 && !BULLET.test(line) && !NUMBERED.test(line) && !/[:.!?]$/.test(line);

/**
 * Groups raw lines into the block kinds the layout understands. Two soft-wrapped
 * prose lines are merged into one paragraph so they wrap and justify as a single
 * block; short lines are kept apart because they are tags, attributes or labels.
 */
function parseBlocks(body) {
  const blocks = [];
  let buffer = [];

  const flush = () => {
    if (buffer.length === 1) blocks.push({ type: 'text', text: buffer[0] });
    else if (buffer.length) blocks.push({ type: 'text', text: buffer.join(' '), merged: true });
    buffer = [];
  };

  const addProseLine = (line) => {
    const prev = buffer[buffer.length - 1];
    const wraps = prev && prev.length >= PROSE && !/[.!?:;]$/.test(prev) && /^[a-z0-9([]/.test(line);
    if (wraps) buffer.push(line);
    else {
      flush();
      buffer.push(line);
    }
  };

  for (const raw of sanitize(body).split('\n')) {
    const line = raw.trim();

    if (!line) {
      flush();
      blocks.push({ type: 'gap' });
      continue;
    }

    const bullet = line.match(BULLET);
    const numbered = bullet ? null : line.match(NUMBERED);

    if (isHeading(line)) {
      flush();
      blocks.push({ type: 'heading', text: line });
    } else if (bullet) {
      flush();
      blocks.push({ type: 'bullet', text: bullet[1], level: indentLevel(raw) });
    } else if (numbered) {
      flush();
      blocks.push({ type: 'numbered', index: numbered[1], text: numbered[2], level: indentLevel(raw) });
    } else if (isSubHeading(line)) {
      flush();
      blocks.push({ type: 'subheading', text: line });
    } else {
      addProseLine(line);
    }
  }

  flush();
  return blocks.filter((block, i) => !(block.type === 'gap' && i === 0));
}

/** Pulls a model-written title (and its byline) off the top of the body. */
function takeCover(body) {
  const lines = sanitize(body).split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i += 1;

  const title = lines[i]?.trim();
  if (!title || !isTitleLine(title)) return { body, title: null, byline: null };

  // An ALL-CAPS opener is only a title when a blank line sets it apart; without
  // that it is just the first section heading of the document.
  if (isHeading(title) && lines[i + 1]?.trim()) return { body, title: null, byline: null };

  let j = i + 1;
  while (j < lines.length && !lines[j].trim()) j += 1;
  const second = lines[j]?.trim();
  const hasByline = Boolean(second) && second.length <= 60 && BYLINE.test(second);

  const used = hasByline ? j + 1 : j;
  return {
    body: lines.slice(used).join('\n').replace(/^\s+/, ''),
    title,
    byline: hasByline ? second : null,
  };
}

/** Drops a byline whose author the subtitle already credits. */
function credit(byline, subtitle) {
  if (!byline) return null;
  const name = byline.replace(/^(?:\w+\s+)?by\s+/i, '').trim();
  return subtitle?.toLowerCase().includes(name.toLowerCase()) ? null : byline;
}

/** Lays out plain listing text as a justified A4 PDF and resolves with the bytes. */
export function textToPdf(body, fallbackTitle, subtitle, { cover = false, brand = null, theme = null } = {}) {
  // A seller's palette over the built-in one. Shadowing the module constants here
  // means the whole layout below is unchanged; it simply prints in these colours.
  const INK = theme?.ink || PALETTE.ink;
  const ACCENT = theme?.accent || PALETTE.accent;
  const MUTED = theme?.muted || PALETTE.muted;
  const HAIRLINE = theme?.hairline || PALETTE.hairline;
  return new Promise((resolve, reject) => {
    const found = cover ? takeCover(body) : { body, title: null, byline: null };
    const title = found.title || fallbackTitle;
    const footer = [subtitle, credit(found.byline, subtitle)].filter(Boolean).join(' - ');

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 66, left: 60, right: 60 },
      bufferPages: true,
      info: { Title: title },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const bottom = doc.page.height - doc.page.margins.bottom;
    const usable = bottom - doc.page.margins.top;
    const BODY = 10.5;
    const LINE = BODY + 2.6;
    // A paragraph shorter than this always moves whole; a heading reserves its
    // full height so the two can never be split across a page boundary.
    const KEEP = 6 * LINE;
    const indentOf = (block) =>
      block.type === 'bullet' ? 15 + block.level * 14 : block.type === 'numbered' ? 22 + block.level * 14 : 0;

    const write = (text, options = {}) => {
      const { font = 'Helvetica', size = BODY, indent = 0, color, ...rest } = options;
      doc.font(font).fontSize(size);
      if (color) doc.fillColor(color);
      doc.text(text, left + indent, doc.y, { width: width - indent, lineGap: 2.6, ...rest });
      if (color) doc.fillColor('#000000');
    };

    const heightOf = (block) => {
      const bold = block.type === 'heading' || block.type === 'subheading';
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? (block.type === 'heading' ? 12 : 11) : BODY);
      const options = { width: width - indentOf(block), lineGap: 2.6 };
      if (block.type === 'heading') options.characterSpacing = 0.6;
      return doc.heightOfString(block.text, options);
    };

    /**
     * Decides where a block of the given height starts: the current page if it
     * fits, otherwise a fresh page. Splittable blocks keep going where they are
     * as long as at least two lines fit, so no page ends on an orphan line.
     */
    const startAt = (needed, { splittable = false } = {}) => {
      const remaining = bottom - doc.y;
      if (needed <= remaining) return;
      const tail = needed - remaining;
      if ((splittable || needed > usable) && remaining >= 2 * LINE && tail >= 2 * LINE) return;
      doc.addPage();
    };

    // Marker (bullet dot or "12.") drawn on the marker column while the block
    // text itself is indented, so wrapped lines hang-align under the text.
    const marker = (label, indent, drawAt, color) => {
      const end = doc.y;
      doc.y = drawAt;
      doc.font('Helvetica').fontSize(BODY).fillColor(color).text(label, left, drawAt, {
        width: indent - 6,
        align: 'right',
        lineGap: 2.6,
      });
      doc.fillColor('#000000');
      doc.y = end;
    };

    const rule = (y, color, lineWidth) => {
      doc.strokeColor(color).lineWidth(lineWidth).moveTo(left, y).lineTo(right, y).stroke();
    };

    doc.y = doc.page.margins.top;
    write(title, { font: 'Helvetica-Bold', size: 19, color: INK, characterSpacing: 0.2, lineGap: 3 });
    doc.y += 6;
    rule(doc.y, ACCENT, 1.6);
    doc.y += 9;
    if (footer) {
      write(footer, { size: 9.5, color: MUTED, characterSpacing: 0.4 });
      doc.y += 4;
    }
    doc.y += 10;

    const blocks = parseBlocks(found.body);
    for (const block of blocks) if (block.type !== 'gap') block.h = heightOf(block);

    // Each list run records how it will be placed: whole when it is only a couple
    // of items long, otherwise as a split that keeps its first two items together.
    const isItem = (block) => block.type === 'bullet' || block.type === 'numbered';
    for (let k = 0; k < blocks.length; k += 1) {
      if (!isItem(blocks[k]) || (k > 0 && isItem(blocks[k - 1]))) continue;
      let end = k;
      while (end < blocks.length && isItem(blocks[end])) end += 1;
      const items = blocks.slice(k, end);
      const height = items.reduce((sum, item) => sum + item.h + 4, 0);
      const pair = items[0].h + (items[1] ? items[1].h + 4 : 0);
      blocks[k].run = { items, height, pair, needed: items.length <= 2 ? height : pair };
      k = end - 1;
    }

    const nextContent = (from) => blocks.slice(from).find((block) => block.type !== 'gap');

    // A heading reserves the space the block after it needs before it splits, so
    // a heading never ends a page on its own.
    const followHeight = (from) => {
      const next = nextContent(from + 1);
      if (!next) return 2 * LINE;
      if (next.run) return Math.min(next.run.needed, usable * 0.6);
      return Math.min(next.h, KEEP);
    };

    let afterHeading = false;
    let i = 0;

    while (i < blocks.length) {
      const block = blocks[i];

      if (block.type === 'gap') {
        doc.y += afterHeading ? 3 : 5;
        i += 1;
        continue;
      }

      if (isItem(block)) {
        const { items, height, pair } = block.run;
        if (items.length <= 2 && height <= usable) startAt(height);
        else if (bottom - doc.y < 2 * LINE) doc.addPage();

        items.forEach((item, k) => {
          const needed = k === 0 ? pair : item.h;
          if (k > 0 && needed > bottom - doc.y) doc.addPage();
          else startAt(needed, { splittable: item.h > usable });
          const top = doc.y;
          const indent = indentOf(item);
          write(item.text, { indent });
          marker(item.type === 'bullet' ? '•' : `${item.index}.`, indent, top, item.type === 'bullet' ? ACCENT : MUTED);
          doc.y += 4;
        });

        afterHeading = false;
        i += items.length;
        continue;
      }

      if (block.type === 'heading') {
        doc.y += afterHeading ? 4 : 13;
        startAt(block.h + followHeight(i) + 14);
        write(block.text, { font: 'Helvetica-Bold', size: 12, color: ACCENT, characterSpacing: 0.8 });
        // Hairline under the heading with a short accent segment on the left.
        rule(doc.y + 4, HAIRLINE, 0.6);
        doc.strokeColor(ACCENT).lineWidth(1.6).moveTo(left, doc.y + 4).lineTo(left + 42, doc.y + 4).stroke();
        doc.y += 12;
        afterHeading = true;
        i += 1;
        continue;
      }

      if (block.type === 'subheading') {
        doc.y += afterHeading ? 4 : 9;
        startAt(block.h + followHeight(i) + 8);
        write(block.text, { font: 'Helvetica-Bold', size: 11, color: INK });
        doc.y += 3;
        afterHeading = true;
        i += 1;
        continue;
      }

      startAt(block.h, { splittable: block.h > KEEP });
      write(block.text, { align: block.merged || block.text.length >= PROSE ? 'justify' : 'left' });
      doc.y += block.text.length >= PROSE ? 6 : 3;
      afterHeading = false;
      i += 1;
    }

    // Footers are stamped last so the total page count is already known.
    // Clearing the bottom margin first stops pdfkit from treating the footer
    // position as overflow and adding a blank page for it.
    const range = doc.bufferedPageRange();
    const stamp = brand ? `© ${new Date().getFullYear()} ${brand}` : null;
    for (let p = range.start; p < range.start + range.count; p += 1) {
      doc.switchToPage(p);
      doc.page.margins.bottom = 0;
      const y = doc.page.height - (stamp ? 50 : 44);
      rule(y - 10, HAIRLINE, 0.6);
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(footer || fallbackTitle, left, y, { width: width * 0.72, lineGap: 0 });
      const footerEnds = doc.y;
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .text(`Page ${p + 1} of ${range.count}`, left + width * 0.72, y, {
          width: width * 0.28,
          align: 'right',
          lineGap: 0,
        });
      if (stamp) {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(MUTED)
          .text(stamp, left, Math.max(footerEnds + 2, y + 11), { width: width * 0.72, lineGap: 0 });
      }
      doc.fillColor('#000000');
    }

    doc.flushPages();
    doc.end();
  });
}
