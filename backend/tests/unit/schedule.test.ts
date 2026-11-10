import { describe, expect, it } from 'vitest';
import { describeFrequency, isDue, isValidTimeZone, nextRun, zoneOffsetMinutes } from '../../src/domain/schedule';

/** Update-plan schedules: wall-clock times in the plan's time zone, results in UTC. */
const LAGOS = 'Africa/Lagos'; // UTC+1, no daylight saving
const LONDON = 'Europe/London'; // UTC+0 / +1 in summer
const at = (iso: string) => new Date(iso);

describe('time zones', () => {
  it('knows the offset of a zone at an instant', () => {
    expect(zoneOffsetMinutes(at('2026-11-05T12:00:00Z'), LAGOS)).toBe(60);
    expect(zoneOffsetMinutes(at('2026-07-01T12:00:00Z'), LONDON)).toBe(60);
    expect(zoneOffsetMinutes(at('2026-12-01T12:00:00Z'), LONDON)).toBe(0);
  });
  it('accepts real zones and rejects made-up ones', () => {
    expect(isValidTimeZone(LAGOS)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('nextRun', () => {
  it('every day at 08:00 Lagos is 07:00 UTC, today if not yet passed', () => {
    expect(nextRun({ kind: 'daily', at: '08:00' }, LAGOS, at('2026-11-05T05:00:00Z'), null).toISOString()).toBe('2026-11-05T07:00:00.000Z');
  });
  it('every day at 08:00: tomorrow once today has passed (boundary: exactly at the time is not "after")', () => {
    expect(nextRun({ kind: 'daily', at: '08:00' }, LAGOS, at('2026-11-05T07:00:00Z'), null).toISOString()).toBe('2026-11-06T07:00:00.000Z');
    expect(nextRun({ kind: 'daily', at: '08:00' }, LAGOS, at('2026-11-05T09:00:00Z'), null).toISOString()).toBe('2026-11-06T07:00:00.000Z');
  });
  it('respects daylight saving (London 09:00 is 08:00 UTC in summer, 09:00 UTC in winter)', () => {
    expect(nextRun({ kind: 'daily', at: '09:00' }, LONDON, at('2026-07-01T00:00:00Z'), null).toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(nextRun({ kind: 'daily', at: '09:00' }, LONDON, at('2026-12-01T00:00:00Z'), null).toISOString()).toBe('2026-12-01T09:00:00.000Z');
  });
  it('every 4 hours: 4 hours after the last run', () => {
    expect(nextRun({ kind: 'hours', every: 4 }, LAGOS, at('2026-11-05T09:30:00Z'), at('2026-11-05T08:00:00Z')).toISOString()).toBe('2026-11-05T12:00:00.000Z');
  });
  it('every N hours: never ran, or missed several slots → the next whole hour', () => {
    expect(nextRun({ kind: 'hours', every: 2 }, LAGOS, at('2026-11-05T09:30:00Z'), null).toISOString()).toBe('2026-11-05T10:00:00.000Z');
    expect(nextRun({ kind: 'hours', every: 2 }, LAGOS, at('2026-11-05T09:30:00Z'), at('2026-11-04T01:00:00Z')).toISOString()).toBe('2026-11-05T10:00:00.000Z');
  });
  it('every 3 days at 09:00: three days after the last run', () => {
    expect(nextRun({ kind: 'days', every: 3, at: '09:00' }, LAGOS, at('2026-11-05T08:00:00Z'), at('2026-11-05T08:00:00Z')).toISOString()).toBe('2026-11-08T08:00:00.000Z');
  });
  it('every 5 days, never ran: the first 09:00 still to come', () => {
    expect(nextRun({ kind: 'days', every: 5, at: '09:00' }, LAGOS, at('2026-11-05T10:00:00Z'), null).toISOString()).toBe('2026-11-06T08:00:00.000Z');
  });
  it('monthly on day 1 at 07:00: this month if still ahead, else next month, across the year end', () => {
    expect(nextRun({ kind: 'monthly', day: 15, at: '07:00' }, LAGOS, at('2026-11-05T00:00:00Z'), null).toISOString()).toBe('2026-11-15T06:00:00.000Z');
    expect(nextRun({ kind: 'monthly', day: 1, at: '07:00' }, LAGOS, at('2026-12-05T00:00:00Z'), null).toISOString()).toBe('2027-01-01T06:00:00.000Z');
  });
  it('monthly day 28 works in February', () => {
    expect(nextRun({ kind: 'monthly', day: 28, at: '07:00' }, LAGOS, at('2027-02-01T00:00:00Z'), null).toISOString()).toBe('2027-02-28T06:00:00.000Z');
  });
});

describe('isDue', () => {
  const daily = { kind: 'daily', at: '08:00' } as const;
  it('not due before the first slot after the plan was switched on', () => {
    expect(isDue(daily, LAGOS, at('2026-11-05T06:59:00Z'), null, at('2026-11-05T05:00:00Z'))).toBe(false);
  });
  it('due once the slot arrives, and not again the same day after it ran', () => {
    expect(isDue(daily, LAGOS, at('2026-11-05T07:00:00Z'), null, at('2026-11-05T05:00:00Z'))).toBe(true);
    expect(isDue(daily, LAGOS, at('2026-11-05T12:00:00Z'), at('2026-11-05T07:01:00Z'), at('2026-11-05T05:00:00Z'))).toBe(false);
    expect(isDue(daily, LAGOS, at('2026-11-06T07:00:00Z'), at('2026-11-05T07:01:00Z'), at('2026-11-05T05:00:00Z'))).toBe(true);
  });
});

describe('describeFrequency', () => {
  it('reads like plain English', () => {
    expect(describeFrequency({ kind: 'hours', every: 1 }, LAGOS)).toBe('Every hour');
    expect(describeFrequency({ kind: 'hours', every: 4 }, LAGOS)).toBe('Every 4 hours');
    expect(describeFrequency({ kind: 'daily', at: '08:00' }, LAGOS)).toBe('Every day at 08:00 (Africa/Lagos)');
    expect(describeFrequency({ kind: 'days', every: 3, at: '09:00' }, LAGOS)).toBe('Every 3 days at 09:00 (Africa/Lagos)');
    expect(describeFrequency({ kind: 'monthly', day: 1, at: '07:00' }, LAGOS)).toBe('On day 1 of each month at 07:00 (Africa/Lagos)');
  });
});
