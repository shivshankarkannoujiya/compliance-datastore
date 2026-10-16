/**
 * Calendar dates without a time zone, written as ISO strings (YYYY-MM-DD).
 *
 * Compliance rules compare whole days (Excel serial dates in the legacy workbook), so dates are converted to a
 * day number (days since 1970-01-01) for arithmetic. Using UTC throughout avoids daylight-saving shifts.
 */
export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function toDayNumber(date: IsoDate): number {
  const match = ISO_DATE.exec(date);
  if (!match) {
    throw new RangeError(`Invalid ISO date "${date}", expected YYYY-MM-DD`);
  }
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
  if (fromDayNumber(ms / MS_PER_DAY) !== date) {
    throw new RangeError(`Invalid calendar date "${date}"`);
  }
  return ms / MS_PER_DAY;
}

export function fromDayNumber(day: number): IsoDate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Excel EDATE: the same day of the month `months` later, clamped to the last day of a shorter month. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = new Date(toDayNumber(date) * MS_PER_DAY);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}

/** Excel WORKDAY without a holiday list: steps `workdays` weekdays forward, skipping Saturdays and Sundays. */
export function addWorkdays(date: IsoDate, workdays: number): IsoDate {
  if (!Number.isInteger(workdays) || workdays < 0) {
    throw new RangeError('workdays must be a non-negative integer');
  }
  let day = toDayNumber(date);
  let remaining = workdays;
  while (remaining > 0) {
    day += 1;
    if (!isWeekend(day)) {
      remaining -= 1;
    }
  }
  return fromDayNumber(day);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

function isWeekend(day: number): boolean {
  const weekday = new Date(day * MS_PER_DAY).getUTCDay();
  return weekday === 0 || weekday === 6;
}
