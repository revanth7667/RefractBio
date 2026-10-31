import { describe, it, expect } from 'vitest';
import { formatLocalDate } from '../../src/prompt/formatDate';

describe('formatLocalDate (A22, §12.1)', () => {
  it('formats a normal date as YYYY-MM-DD', () => {
    // Note: Month is 0-indexed in JavaScript Date (9 = October)
    const date = new Date(2026, 9, 29);
    expect(formatLocalDate(date)).toBe('2026-10-29');
  });

  it('pads single-digit month and day with leading zeroes', () => {
    const date = new Date(2026, 3, 5); // April 5, 2026
    expect(formatLocalDate(date)).toBe('2026-04-05');
  });

  it('correctly handles month boundary (last day of month to first day of next month)', () => {
    const endOfMonth = new Date(2026, 0, 31); // Jan 31
    expect(formatLocalDate(endOfMonth)).toBe('2026-01-31');

    const startOfNextMonth = new Date(2026, 1, 1); // Feb 1
    expect(formatLocalDate(startOfNextMonth)).toBe('2026-02-01');

    const leapFebEnd = new Date(2024, 1, 29); // Feb 29, 2024 leap year
    expect(formatLocalDate(leapFebEnd)).toBe('2024-02-29');
  });

  it('correctly handles year boundary (Dec 31 23:59 to Jan 1 00:00)', () => {
    const newYearsEve = new Date(2026, 11, 31, 23, 59, 59);
    expect(formatLocalDate(newYearsEve)).toBe('2026-12-31');

    const newYearsDay = new Date(2027, 0, 1, 0, 0, 1);
    expect(formatLocalDate(newYearsDay)).toBe('2027-01-01');
  });
});
