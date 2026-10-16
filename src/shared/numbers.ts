/** Excel ROUND(x, 0): halves round away from zero (Math.round rounds -2.5 to -2, Excel to -3). */
export function excelRound(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** Mean of the values, or null when there are none (Excel AVERAGEIFS errors, wrapped in IFERROR → ""). */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Case-insensitive, whitespace-trimmed comparison, matching Excel's text comparison in SWITCH and COUNTIFS. */
export function sameText(a: string, b: string): boolean {
  return normalise(a) === normalise(b);
}

export function containsText(haystack: string, needle: string): boolean {
  return normalise(haystack).includes(normalise(needle));
}

export function normalise(text: string): string {
  return text.trim().toLowerCase();
}
