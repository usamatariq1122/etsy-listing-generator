import { readScoped, writeScoped, clearScoped } from './scopedSettings.js';

// The colours the printed PDFs are drawn in. A seller picks these in Settings;
// left unset the portal prints in its built-in palette, so an untouched install
// looks exactly as professional as it always did. Only colours are themeable —
// a custom font or logo would need that file bundled into the serverless
// function, which is a different and heavier change than a palette.

export const DEFAULT_THEME = {
  ink: '#14293d',
  accent: '#2f6f8f',
  muted: '#6b7280',
  hairline: '#d7dee5',
};

const SETTING = 'pdf_theme';
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FIELDS = Object.keys(DEFAULT_THEME);

/** Merges whatever was saved over the default, ignoring anything malformed. */
function normalise(raw) {
  const saved = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_THEME };
  const theme = { ...DEFAULT_THEME };
  for (const field of FIELDS) {
    const value = String(saved[field] ?? '').trim();
    if (HEX.test(value)) theme[field] = value.toLowerCase();
  }
  return theme;
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function themeColors() {
  return normalise((await readScoped(SETTING)).value);
}

export function themeIssues(raw) {
  const value = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!value || typeof value !== 'object') return ['Choose the colours for your PDF.'];
  const bad = FIELDS.filter((field) => field in value && !HEX.test(String(value[field]).trim()));
  if (bad.length) return ['Colours must be hex values like #2f6f8f.'];
  const given = FIELDS.filter((field) => HEX.test(String(value[field] ?? '').trim()));
  if (!given.length) return ['Enter at least one colour as a hex value like #2f6f8f.'];
  return [];
}

export async function saveTheme(raw) {
  const issues = themeIssues(raw);
  if (issues.length) {
    const err = new Error(issues.join(' '));
    err.status = 400;
    err.issues = issues;
    throw err;
  }
  const theme = normalise(raw);
  await writeScoped(SETTING, JSON.stringify(theme));
  return theme;
}

export async function clearTheme() {
  await clearScoped(SETTING);
  return { ...DEFAULT_THEME };
}
