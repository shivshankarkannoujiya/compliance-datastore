import { addMonths, addWorkdays, daysBetween, toDayNumber } from './local-date';
import { excelRound } from './numbers';

describe('local dates', () => {
  it('rejects malformed and impossible dates', () => {
    expect(() => toDayNumber('2026-2-01')).toThrow(RangeError);
    expect(() => toDayNumber('2026-02-30')).toThrow(RangeError);
  });

  it('adds months like EDATE, clamping to the month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2026-10-16', 3)).toBe('2027-01-16');
  });

  it('adds working days like WORKDAY, skipping weekends', () => {
    // Friday 16 Oct 2026 + 10 working days = Friday 30 Oct.
    expect(addWorkdays('2026-10-16', 10)).toBe('2026-10-30');
    // Saturday start: the first working day is Monday.
    expect(addWorkdays('2026-10-17', 1)).toBe('2026-10-19');
    expect(addWorkdays('2026-10-16', 0)).toBe('2026-10-16');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-01-01', '2026-01-15')).toBe(14);
    expect(daysBetween('2026-01-15', '2026-01-01')).toBe(-14);
  });
});

describe('excelRound', () => {
  it('rounds halves away from zero', () => {
    expect(excelRound(2.5)).toBe(3);
    expect(excelRound(-2.5)).toBe(-3);
    expect(excelRound(-2.4)).toBe(-2);
  });
});
