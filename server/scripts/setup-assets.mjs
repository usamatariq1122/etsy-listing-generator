// One-time setup for a fresh clone: creates the files the app loads but the
// repository never carries - your keys and your own prompt/rules wording.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COPIES = [
  ['.env.example', '.env'],
  ['src/masterPrompt.example.js', 'src/masterPrompt.js'],
  ['src/rules.example.js', 'src/rules.js'],
  ['src/prompts/listing.example.js', 'src/prompts/listing.js'],
];

// On a hosted build there is no .env to edit: keys arrive as platform secrets
// and process.env is already set, so a placeholder file would only confuse.
const hosted = Boolean(process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT);

for (const [from, to] of COPIES) {
  if (hosted && to === '.env') {
    console.log('skipped .env (hosted build uses secrets)');
    continue;
  }
  const target = path.join(SERVER, to);
  if (fs.existsSync(target)) {
    console.log(`kept    ${to} (already there)`);
    continue;
  }
  fs.copyFileSync(path.join(SERVER, from), target);
  console.log(`created ${to} - edit it before the first run`);
}
