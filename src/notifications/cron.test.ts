import { describe, it, expect } from 'vitest';
import { parseCronExpression, isValidCronExpression, getNextOccurrence } from './cron.js';

describe('parseCronExpression', () => {
  it('should parse a simple daily expression', () => {
    const parsed = parseCronExpression('0 9 * * *');

    expect(parsed.minute.type).toBe('minute');
    expect(parsed.minute.values).toContain(0);
    expect(parsed.hour.values).toContain(9);
    expect(parsed.day.values.size).toBe(31);
    expect(parsed.month.values.size).toBe(12);
    expect(parsed.weekday.values.size).toBe(7);
  });

  it('should parse expression with step', () => {
    const parsed = parseCronExpression('0 */4 * * *');

    expect(parsed.minute.values).toContain(0);
    expect(parsed.hour.values).toContain(0);
    expect(parsed.hour.values).toContain(4);
    expect(parsed.hour.values).toContain(8);
    expect(parsed.hour.values).toContain(12);
    expect(parsed.hour.values).toContain(16);
    expect(parsed.hour.values).toContain(20);
  });

  it('should parse expression with range', () => {
    const parsed = parseCronExpression('30 9-17 * * *');

    expect(parsed.minute.values).toContain(30);
    expect(parsed.hour.values).toContain(9);
    expect(parsed.hour.values).toContain(10);
    expect(parsed.hour.values).toContain(17);
  });

  it('should parse expression with weekday range', () => {
    const parsed = parseCronExpression('0 9 * * 1-5');

    expect(parsed.weekday.values.size).toBe(5);
    expect(parsed.weekday.values).toContain(1);
    expect(parsed.weekday.values).toContain(5);
    expect(parsed.weekday.values).not.toContain(0);
    expect(parsed.weekday.values).not.toContain(6);
  });

  it('should parse expression with list', () => {
    const parsed = parseCronExpression('0 9,12,18 * * *');

    expect(parsed.hour.values).toContain(9);
    expect(parsed.hour.values).toContain(12);
    expect(parsed.hour.values).toContain(18);
  });

  it('should parse expression with multiple patterns', () => {
    const parsed = parseCronExpression('15,45 9-17 * * 1-5');

    expect(parsed.minute.values).toContain(15);
    expect(parsed.minute.values).toContain(45);
    expect(parsed.hour.values.size).toBe(9);
    expect(parsed.weekday.values.size).toBe(5);
  });

  it('should throw error for wrong number of fields', () => {
    expect(() => parseCronExpression('0 9 * *')).toThrow();
    expect(() => parseCronExpression('0 9 * * * *')).toThrow();
  });

  it('should throw error for invalid minute value', () => {
    expect(() => parseCronExpression('99 9 * * *')).toThrow();
    expect(() => parseCronExpression('-1 9 * * *')).toThrow();
  });

  it('should throw error for invalid hour value', () => {
    expect(() => parseCronExpression('0 99 * * *')).toThrow();
    expect(() => parseCronExpression('0 -1 * * *')).toThrow();
  });

  it('should throw error for invalid day value', () => {
    expect(() => parseCronExpression('0 9 0 * *')).toThrow();
    expect(() => parseCronExpression('0 9 32 * *')).toThrow();
  });

  it('should throw error for invalid month value', () => {
    expect(() => parseCronExpression('0 9 * 0 *')).toThrow();
    expect(() => parseCronExpression('0 9 * 13 *')).toThrow();
  });

  it('should throw error for invalid weekday value', () => {
    expect(() => parseCronExpression('0 9 * * 7')).toThrow();
    expect(() => parseCronExpression('0 9 * * -1')).toThrow();
  });

  it('should throw error for invalid step value', () => {
    expect(() => parseCronExpression('0 */0 * * *')).toThrow();
  });

  it('should throw error for invalid range', () => {
    expect(() => parseCronExpression('0 5-3 * * *')).toThrow();
  });
});

describe('isValidCronExpression', () => {
  it('should return true for valid expressions', () => {
    expect(isValidCronExpression('0 9 * * *')).toBe(true);
    expect(isValidCronExpression('0 */4 * * *')).toBe(true);
    expect(isValidCronExpression('0 9 * * 1-5')).toBe(true);
    expect(isValidCronExpression('15,45 9-17 * * 1-5')).toBe(true);
    expect(isValidCronExpression('*/10 * * * *')).toBe(true);
  });

  it('should return false for invalid expressions', () => {
    expect(isValidCronExpression('99 99 * * *')).toBe(false);
    expect(isValidCronExpression('0 9 * *')).toBe(false);
    expect(isValidCronExpression('0 9 * * * *')).toBe(false);
    expect(isValidCronExpression('invalid')).toBe(false);
    expect(isValidCronExpression('')).toBe(false);
    expect(isValidCronExpression('0 -1 * * *')).toBe(false);
  });
});

describe('getNextOccurrence', () => {
  it('should return next occurrence for daily schedule', () => {
    const fromDate = new Date('2024-02-07T08:00:00.000Z');
    const next = getNextOccurrence('0 9 * * *', fromDate);

    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
    expect(next.getTime()).toBeGreaterThan(fromDate.getTime());
  });

  it('should return next occurrence for hourly schedule', () => {
    const fromDate = new Date('2024-02-07T08:30:00.000Z');
    const next = getNextOccurrence('0 * * * *', fromDate);

    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(fromDate.getDate());
  });

  it('should return next occurrence for every 4 hours', () => {
    const fromDate = new Date('2024-02-07T08:00:00.000Z');
    const next = getNextOccurrence('0 */4 * * *', fromDate);

    expect(next.getHours()).toBe(12);
    expect(next.getMinutes()).toBe(0);
  });

  it('should return next occurrence for weekday schedule', () => {
    const fromDate = new Date('2024-02-07T09:00:00.000Z');
    const next = getNextOccurrence('0 9 * * 1-5', fromDate);

    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
    expect(next.getTime()).toBeGreaterThan(fromDate.getTime());
  });

  it('should skip weekends for weekday schedule', () => {
    const fromDate = new Date('2024-02-09T09:00:00.000Z');
    const next = getNextOccurrence('0 9 * * 1-5', fromDate);

    const weekday = next.getDay();
    expect(weekday).toBeGreaterThanOrEqual(1);
    expect(weekday).toBeLessThanOrEqual(5);
    expect(next.getTime()).toBeGreaterThan(fromDate.getTime());
  });

  it('should handle time boundary crossing', () => {
    const fromDate = new Date('2024-02-07T23:30:00.000Z');
    const next = getNextOccurrence('0 */4 * * *', fromDate);

    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(8);
  });

  it('should handle month boundary crossing', () => {
    const fromDate = new Date('2024-02-29T23:59:00.000Z');
    const next = getNextOccurrence('0 9 * * *', fromDate);

    expect(next.getMonth()).toBe(2);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });

  it('should handle year boundary crossing', () => {
    const fromDate = new Date('2023-12-31T23:59:00.000Z');
    const next = getNextOccurrence('0 9 * * *', fromDate);

    expect(next.getFullYear()).toBe(2024);
    expect(next.getMonth()).toBe(0);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });

  it('should return same day if time is before', () => {
    const fromDate = new Date('2024-02-07T08:00:00.000Z');
    const next = getNextOccurrence('0 9 * * *', fromDate);

    expect(next.getDate()).toBe(fromDate.getDate());
    expect(next.getMonth()).toBe(fromDate.getMonth());
    expect(next.getFullYear()).toBe(fromDate.getFullYear());
  });

  it('should return next day if time has passed', () => {
    const fromDate = new Date('2024-02-07T10:00:00.000Z');
    const next = getNextOccurrence('0 9 * * *', fromDate);

    expect(next.getDate()).toBe(8);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });

  it('should handle complex expression', () => {
    const fromDate = new Date('2024-02-07T08:00:00.000Z');
    const next = getNextOccurrence('30 9,15 * * 1-5', fromDate);

    expect(next.getMinutes()).toBe(30);
    expect([9, 15]).toContain(next.getHours());
  });

  it('should handle February 29th for non-leap year', () => {
    const fromDate = new Date('2023-02-28T09:00:00.000Z');
    const next = getNextOccurrence('0 9 29 * *', fromDate);

    expect(next.getDate()).toBe(29);
    expect(next.getMonth()).toBe(2);
    expect(next.getHours()).toBe(9);
    expect(next.getFullYear()).toBe(2023);
  });

  it('should handle February 29th for leap year', () => {
    const fromDate = new Date('2024-02-28T09:00:00.000Z');
    const next = getNextOccurrence('0 9 29 * *', fromDate);

    expect(next.getDate()).toBe(29);
    expect(next.getMonth()).toBe(1);
  });

  it('should use current time when no date provided', () => {
    const now = new Date();
    const next = getNextOccurrence('0 9 * * *');

    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });

  it('should handle minute-level precision', () => {
    const fromDate = new Date('2024-02-07T08:15:00.000Z');
    const next = getNextOccurrence('30 * * * *', fromDate);

    expect(next.getMinutes()).toBe(30);
    expect(next.getHours()).toBe(8);
  });

  it('should handle specific day of month', () => {
    const fromDate = new Date('2024-02-07T09:00:00.000Z');
    const next = getNextOccurrence('0 9 15 * *', fromDate);

    expect(next.getDate()).toBe(15);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });

  it('should handle specific month', () => {
    const fromDate = new Date('2024-02-07T09:00:00.000Z');
    const next = getNextOccurrence('0 9 1 4 *', fromDate);

    expect(next.getMonth()).toBe(3);
    expect(next.getDate()).toBe(1);
    expect(next.getHours()).toBe(9);
  });

  it('should throw error for invalid cron expression', () => {
    const fromDate = new Date('2024-02-07T08:00:00.000Z');

    expect(() => getNextOccurrence('99 99 * * *', fromDate)).toThrow();
    expect(() => getNextOccurrence('invalid', fromDate)).toThrow();
  });

  it('should handle expression with multiple minutes', () => {
    const fromDate = new Date('2024-02-07T08:20:00.000Z');
    const next = getNextOccurrence('0,30 * * * *', fromDate);

    expect([0, 30]).toContain(next.getMinutes());
    expect(next.getTime()).toBeGreaterThan(fromDate.getTime());
  });

  it('should handle range with step', () => {
    const fromDate = new Date('2024-02-07T08:00:00.000Z');
    const next = getNextOccurrence('0 9-17/2 * * *', fromDate);

    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });
});
