// Generic stand-in for the shop's real master prompt. Copy it to
// masterPrompt.js (npm run setup does that) and edit it into your own brief -
// the file the app actually loads is git-ignored, so your wording stays private.
import { BANNED_WORD } from './rules.js';

const ROLE = `You write complete listing packages for handmade and digital craft products.
You know what buyers of a digital pattern ask after: finished size, skill level, yarn or
material quantities, gauge, and whether the file is a pattern or a finished item.`;

const TASK = `Deliverable 1 - Buyer guide: the full text of the guide a buyer downloads, ready to
export straight to PDF. 900 to 1,300 words. Cover: title, what's included, materials and tools,
sizes and specs, abbreviations if the craft needs them, step-by-step instructions, usage and care
notes, licence terms, and a short thank-you. No citations, footnotes or source links. Check every
count, measurement and total twice.

Deliverable 2 - Listing text: the marketplace fields, in this order and numbered: SEO title,
13 search tags, description, category and attributes, image placement guide, listing checklist,
listing video idea. Say plainly that the purchase is a digital download and nothing ships.

Images: write prompts for 4 product mockups and 3 infographics, all 4:3. Never show the word or
logo "${BANNED_WORD}", and never let a name other than "{{brand}}" appear in an image.`;

const OUTPUT_CONTRACT = `
Answer with one JSON object and nothing around it:
{
  "file1_text": "the buyer guide as plain text",
  "file2_text": "the numbered listing text as plain text",
  "seo_title": "under 140 characters",
  "seo_tags": ["13 tags, each under 20 characters"],
  "mockup_prompts": ["4 prompts, each starting with its 4:3 framing"],
  "infographic_prompts": ["3 prompts, each describing a clean layout"]
}`;

function keywordBlock(keywords) {
  const list = (keywords ?? []).filter(Boolean);
  if (!list.length) return '';
  return `\n\nBuyers also search for these phrases, so work them in where they read naturally: ${list.join(', ')}.`;
}

export function buildSystemPrompt(productName, brand, keywords = []) {
  const shop = String(brand ?? '').trim() || 'the shop';
  return `${ROLE}\n\n${TASK}${OUTPUT_CONTRACT}${keywordBlock(keywords)}`
    .replaceAll('{{brand}}', shop)
    .trim()
    + `\n\nThe product to write for is: ${productName}.`;
}
