import type { Thresholds } from './types';

/**
 * Tolerance for comparing an averaged percentage with a threshold, so 0.9 computed as 0.8999999999 still meets 0.9.
 * Averages of 1/0 values over realistic row counts differ from exact thresholds by far more than this.
 */
const EPSILON = 1e-9;

/**
 * IFS(% >= Threshold 1, 1, % >= Threshold 2, 0.8, …, % >= Threshold 5, 0.2) wrapped in IFERROR(…, 0).
 */
export function bandScore(percent: number, thresholds: Thresholds, bandScores: Thresholds): number {
  for (let i = 0; i < thresholds.length; i += 1) {
    if (percent + EPSILON >= thresholds[i]!) {
      return bandScores[i]!;
    }
  }
  return 0;
}
