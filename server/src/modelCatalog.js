import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import BUNDLED from '../models.json' with { type: 'json' };

// server/models.json, one level up from src/.
const FILE = fileURLToPath(new URL('../models.json', import.meta.url));

const failed = (detail) => {
  const err = new Error(`server/models.json ${detail}`);
  err.status = 500;
  throw err;
};

/**
 * The model list the Settings dropdown offers, grouped by provider. Read on
 * every call so an added model name shows up without touching code or
 * restarting the backend; a hosted build has no editable file, so the copy
 * baked into the deploy is used instead.
 */
export async function modelCatalog() {
  let text;
  try {
    text = await fs.readFile(FILE, 'utf8');
  } catch {
    return normalise(BUNDLED, 'the bundled list');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    failed(`is not valid JSON: ${error.message}`);
  }

  return normalise(parsed);
}

function normalise(parsed, origin = '') {
  const entries = Object.entries(parsed ?? {}).filter(([, entry]) => Array.isArray(entry?.models) && entry.models.length);
  if (!entries.length) {
    failed(`${origin || 'could not be read'}: it lists no provider with a non-empty "models" array.`);
  }

  return Object.fromEntries(
    entries.map(([provider, entry]) => [
      provider,
      { label: String(entry.label || provider), models: entry.models.map((model) => String(model).trim()).filter(Boolean) },
    ]),
  );
}
