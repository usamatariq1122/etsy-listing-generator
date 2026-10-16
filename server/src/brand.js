import { deleteSetting, getSetting, setSetting } from './db.js';

// The brand the owner chooses in Settings. It is the only shop name this portal
// ever writes, and the only one the scrubber is allowed to leave in place.
export const DEFAULT_BRAND = 'Your Shop';
const SETTING = 'brand_name';
const MAX = 40;

export async function brandName() {
  const saved = (await getSetting(SETTING))?.trim();
  return saved || DEFAULT_BRAND;
}

export function brandIssues(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return ['Enter a brand name.'];
  if (value.length > MAX) return [`Brand name is too long (max ${MAX} characters).`];
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .&'-]*$/u.test(value)) {
    return ['A brand name may contain letters, numbers, spaces, dots, ampersands and hyphens only.'];
  }
  return [];
}

export async function saveBrand(raw) {
  const value = String(raw ?? '').trim();
  const issues = brandIssues(value);
  if (issues.length) {
    const err = new Error(issues.join(' '));
    err.status = 400;
    err.issues = issues;
    throw err;
  }
  await setSetting(SETTING, value);
  return value;
}

export async function clearBrand() {
  await deleteSetting(SETTING);
  return DEFAULT_BRAND;
}
