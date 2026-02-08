/**
 * Cron expression parser and utilities.
 *
 * Provides functionality to parse standard 5-field cron expressions,
 * validate them, and calculate next occurrence times for reminder scheduling.
 *
 * Cron format: minute hour day month weekday
 * - minute: 0-59
 * - hour: 0-23
 * - day: 1-31
 * - month: 1-12
 * - weekday: 0-6 (0=Sunday, 6=Saturday)
 *
 * Supported patterns include single values, wildcards (*), ranges (1-5),
 * lists (1,3,5), and steps (* /4 or 1-5/2).
 *
 * @packageDocumentation
 */

/**
 * Parsed cron field with a set of allowed values.
 */
interface ParsedCronField {
  readonly type: 'minute' | 'hour' | 'day' | 'month' | 'weekday';
  readonly values: ReadonlySet<number>;
  readonly min: number;
  readonly max: number;
}

/**
 * Parsed cron expression with all five fields.
 */
interface ParsedCronExpression {
  readonly minute: ParsedCronField;
  readonly hour: ParsedCronField;
  readonly day: ParsedCronField;
  readonly month: ParsedCronField;
  readonly weekday: ParsedCronField;
}

type FieldType = 'minute' | 'hour' | 'day' | 'month' | 'weekday';

const FIELD_MIN: Record<FieldType, number> = {
  minute: 0,
  hour: 0,
  day: 1,
  month: 1,
  weekday: 0,
};

const FIELD_MAX: Record<FieldType, number> = {
  minute: 59,
  hour: 23,
  day: 31,
  month: 12,
  weekday: 6,
};

function parseField(field: FieldType, expr: string): ParsedCronField {
  const min = FIELD_MIN[field];
  const max = FIELD_MAX[field];
  const values = new Set<number>();
  const parts = expr.split(',');

  for (const part of parts) {
    const trimmedPart = part.trim();

    if (trimmedPart === '*') {
      for (let i = min; i <= max; i++) {
        values.add(i);
      }
      continue;
    }

    const stepMatch = trimmedPart.match(/^(.+?)\/(\d+)$/);
    if (stepMatch !== null && stepMatch[1] !== undefined && stepMatch[2] !== undefined) {
      const baseExpr = stepMatch[1];
      const step = Number.parseInt(stepMatch[2], 10);

      if (Number.isNaN(step) || step < 1) {
        throw new Error(`Invalid step value in ${field}: ${trimmedPart}`);
      }

      const baseValues = parseSingleField(field, baseExpr, min, max);
      for (let i = 0; i < baseValues.length; i += step) {
        const value = baseValues[i];
        if (value !== undefined) {
          values.add(value);
        }
      }
      continue;
    }

    const singleValues = parseSingleField(field, trimmedPart, min, max);
    for (const v of singleValues) {
      values.add(v);
    }
  }

  if (values.size === 0) {
    throw new Error(`No valid values in ${field}: ${expr}`);
  }

  return { type: field, values, min, max };
}

function parseSingleField(
  field: FieldType,
  expr: string,
  min: number,
  max: number
): readonly number[] {
  if (expr === '*') {
    const arr: number[] = [];
    for (let i = min; i <= max; i++) {
      arr.push(i);
    }
    return arr;
  }

  const rangeMatch = expr.match(/^(\d+)-(\d+)$/);
  if (rangeMatch !== null && rangeMatch[1] !== undefined && rangeMatch[2] !== undefined) {
    const start = Number.parseInt(rangeMatch[1], 10);
    const end = Number.parseInt(rangeMatch[2], 10);

    if (Number.isNaN(start) || Number.isNaN(end)) {
      throw new Error(`Invalid range in ${field}: ${expr}`);
    }

    if (start < min || end > max || start > end) {
      throw new Error(`Range out of bounds in ${field}: ${expr}`);
    }

    const arr: number[] = [];
    for (let i = start; i <= end; i++) {
      arr.push(i);
    }
    return arr;
  }

  const value = Number.parseInt(expr, 10);
  if (Number.isNaN(value) || value < min || value > max) {
    throw new Error(`Invalid value in ${field}: ${expr}`);
  }

  return [value];
}

export function parseCronExpression(expr: string): ParsedCronExpression {
  const parts = expr.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(
      `Cron expression must have exactly 5 fields, got ${String(parts.length)}: ${expr}`
    );
  }

  if (
    parts[0] === undefined ||
    parts[1] === undefined ||
    parts[2] === undefined ||
    parts[3] === undefined ||
    parts[4] === undefined
  ) {
    throw new Error(`Cron expression has undefined parts: ${expr}`);
  }

  return {
    minute: parseField('minute', parts[0]),
    hour: parseField('hour', parts[1]),
    day: parseField('day', parts[2]),
    month: parseField('month', parts[3]),
    weekday: parseField('weekday', parts[4]),
  };
}

export function isValidCronExpression(expr: string): boolean {
  try {
    parseCronExpression(expr);
    return true;
  } catch {
    return false;
  }
}

export function getNextOccurrence(cronExpr: string, fromDate: Date = new Date()): Date {
  const parsed = parseCronExpression(cronExpr);

  const isDayOfMonthRestricted = parsed.day.values.size < 31;
  const isWeekdayRestricted = parsed.weekday.values.size < 7;
  const bothRestricted = isDayOfMonthRestricted && isWeekdayRestricted;

  const current = new Date(fromDate.getTime());

  const searchLimit = 4 * 365 * 24 * 60;
  let iterations = 0;

  while (iterations < searchLimit) {
    iterations++;

    current.setMinutes(current.getMinutes() + 1);

    if (
      parsed.minute.values.has(current.getMinutes()) &&
      parsed.hour.values.has(current.getHours()) &&
      parsed.month.values.has(current.getMonth() + 1)
    ) {
      const day = current.getDate();
      const weekday = current.getDay();

      let dayMatches = false;

      if (bothRestricted) {
        dayMatches = parsed.day.values.has(day) || parsed.weekday.values.has(weekday);
      } else if (isDayOfMonthRestricted) {
        dayMatches = parsed.day.values.has(day);
      } else if (isWeekdayRestricted) {
        dayMatches = parsed.weekday.values.has(weekday);
      } else {
        dayMatches = true;
      }

      if (dayMatches && current.getTime() > fromDate.getTime()) {
        current.setSeconds(0, 0);
        return current;
      }
    }
  }

  throw new Error(`Could not find next occurrence for cron expression: ${cronExpr}`);
}
