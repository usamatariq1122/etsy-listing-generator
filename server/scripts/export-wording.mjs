// Writes this shop's listing brief out as plain text so it can be uploaded to the
// blob store a deployment reads (see src/prompts/listing.js). Run it whenever the
// brief changes, then follow the command it prints.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LISTING_WORDING } from '../src/prompts/wording.js';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(SERVER, 'tmp', 'listing-wording.txt');

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, LISTING_WORDING, 'utf8');

console.log(`${LISTING_WORDING.length} characters written to ${target}`);
console.log(`Upload it with: netlify blobs:set listora-locked listing-wording -i ${path.relative(process.cwd(), target)}`);
