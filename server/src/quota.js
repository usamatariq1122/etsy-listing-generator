import { generationsToday } from './db.js';
import { config } from './config.js';

// The per-account daily cap on listing generations. The owner who runs the
// portal is exempt (they manage their own quota), and a limit of 0 removes the
// cap for everyone. Everyone else may start at most `limit` generations per day.

export const dailyLimit = () => Math.max(0, config.generation.dailyLimit | 0);

/** Turns a role + today's count into what the UI needs to show and gate on. */
export function summarize(role, today) {
  const limit = dailyLimit();
  const exempt = role === 'admin' || limit <= 0;
  return { today, limit, exempt, remaining: exempt ? null : Math.max(0, limit - today) };
}

/** The account's usage right now, or an exempt shape for a legacy/unowned run. */
export async function usageFor(userId) {
  // No owner means a legacy portal-password or unlocked-local run, which is never
  // capped: the person who runs the portal manages their own quota.
  if (!userId) return { today: 0, limit: dailyLimit(), exempt: true, remaining: null };
  const row = await generationsToday(userId);
  if (!row) return summarize('user', 0);
  return summarize(row.role, row.today);
}

export const canGenerate = (usage) => usage.exempt || usage.remaining > 0;

/** The message a blocked generation or a full Settings screen shows. */
export const limitMessage = (usage) =>
  `You have used all ${usage.limit} generations for today. Your count resets at midnight (UTC), or ask the owner for more.`;
