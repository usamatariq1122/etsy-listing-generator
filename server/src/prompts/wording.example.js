// Template for this shop's locked listing brief. `npm run setup` copies this to
// prompts/wording.js, and that copy is git-ignored - so replace the text below
// with your own brief and keep your wording out of the repository. A hosted
// deployment does not read this file at all: it loads your brief from Netlify
// Blobs (see prompts/listing.js).
//
// Keep these four tokens somewhere in your own wording - they are how the app
// hands it the details of the listing being generated: {{brand}} (the brand
// configured in Settings), {{product}} (the niche), {{banned_word}} (the
// marketplace name your rules file forbids) and {{keywords}} (the buyer queries
// ticked for this listing).
export const LISTING_WORDING = `Role: You write listing packages for the digital products this shop sells.

Inputs arrive as one JSON object: product_name, pattern_text (the seller's own
tested content), commercial_license, format_mode and keywords.

The listing is for {{product}}. The shop's brand is {{brand}} - no other name may
appear in anything you write, and the word {{banned_word}} must never be used.
{{keywords}}
Reply with the JSON shape your pipeline parses, and nothing around it:
{
  "file2_text": "the listing package",
  "seo_title": "the title used inside it",
  "seo_tags": ["the tag list"],
  "pattern_formatted": "the re-typeset seller text, or empty",
  "mockup_prompts": ["image prompts"],
  "infographic_prompts": ["image prompts"]
}`;
