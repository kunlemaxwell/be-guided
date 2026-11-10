import type { Frequency } from '../../../admin/shared/automation-types';

/**
 * When an update plan is next due. Times ("08:00") are wall-clock times in the
 * plan's time zone; the result is a UTC Date. Pure, so it is unit-tested.
 */

/** Minutes the zone is ahead of UTC at that instant (e.g. Africa/Lagos = 60). */
export function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** True when the zone name is one this runtime knows. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock date (y, m 0-based, d) in the zone at that instant. */
function localDate(at: Date, timeZone: string): { y: number; m: number; d: number } {
  const shifted = new Date(at.getTime() + zoneOffsetMinutes(at, timeZone) * 60_000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
}

/** The UTC instant of a wall-clock time in the zone (DST-safe to within the hour change). */
function zonedInstant(y: number, m: number, d: number, at: string, timeZone: string): Date {
  const [hh, mm] = at.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m, d, hh, mm);
  const offset = zoneOffsetMinutes(new Date(guess), timeZone);
  const first = guess - offset * 60_000;
  const offset2 = zoneOffsetMinutes(new Date(first), timeZone);
  return new Date(guess - offset2 * 60_000);
}

/**
 * The next time the plan should run, strictly after `after`. `lastRun` is the
 * previous run (for "every N days" and "every N hours"); null = never ran.
 */
export function nextRun(freq: Frequency, timeZone: string, after: Date, lastRun: Date | null): Date {
  switch (freq.kind) {
    case 'hours': {
      const step = freq.every * 3_600_000;
      if (lastRun) {
        const next = lastRun.getTime() + step;
        // Ran on time: next slot. Missed several: the next whole hour from now.
        if (next > after.getTime()) return new Date(next);
      }
      const hour = 3_600_000;
      return new Date(Math.floor(after.getTime() / hour) * hour + hour);
    }
    case 'daily':
    case 'days': {
      const step = freq.kind === 'days' ? freq.every : 1;
      const base = freq.kind === 'days' && lastRun ? lastRun : after;
      const { y, m, d } = localDate(base, timeZone);
      for (let i = freq.kind === 'days' && lastRun ? step : 0; i < 400; i += freq.kind === 'days' && lastRun ? step : 1) {
        const candidate = zonedInstant(y, m, d + i, freq.at, timeZone);
        if (candidate.getTime() > after.getTime()) return candidate;
      }
      return zonedInstant(y, m, d + 1, freq.at, timeZone);
    }
    case 'monthly': {
      const { y, m } = localDate(after, timeZone);
      for (let i = 0; i < 3; i++) {
        const candidate = zonedInstant(y, m + i, freq.day, freq.at, timeZone);
        if (candidate.getTime() > after.getTime()) return candidate;
      }
      return zonedInstant(y, m + 1, freq.day, freq.at, timeZone);
    }
  }
}

/**
 * Whether a check is due now: the slot after the last run (or after the plan
 * was switched on) has arrived.
 */
export function isDue(freq: Frequency, timeZone: string, now: Date, lastRun: Date | null, since: Date): boolean {
  const from = lastRun ?? since;
  return nextRun(freq, timeZone, from, lastRun).getTime() <= now.getTime();
}

/** Plain-English description, e.g. "Every day at 08:00 (Africa/Lagos)". */
export function describeFrequency(freq: Frequency, timeZone: string): string {
  const zone = ` (${timeZone})`;
  switch (freq.kind) {
    case 'hours':
      return freq.every === 1 ? 'Every hour' : `Every ${freq.every} hours`;
    case 'daily':
      return `Every day at ${freq.at}${zone}`;
    case 'days':
      return `Every ${freq.every} days at ${freq.at}${zone}`;
    case 'monthly':
      return `On day ${freq.day} of each month at ${freq.at}${zone}`;
  }
}
