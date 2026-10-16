import { toDayNumber } from '../shared/local-date';
import type { CompliancePolicy } from './policy';
import type { ComplianceRecord, ComplianceWarning } from './types';

export interface LatestRecords {
  /** Keyed by subjectKey(subjectId, complianceType). */
  bySubjectAndType: Map<string, ComplianceRecord>;
  warnings: ComplianceWarning[];
}

export function subjectKey(subjectId: string, complianceType: string): string {
  return `${subjectId}\u0000${complianceType.trim().toLowerCase()}`;
}

/**
 * Replaces "Most Recent Record" and Unique Lookups 1–4 (tab 04 rows 191, 196–199).
 *
 * The workbook marks every record with the latest Completion Date as most recent, and every record when none has a
 * date; lookups then take the first match. Here exactly one record wins, chosen by the policy's tie-break, and a
 * warning lists the tie so it can be cleaned up (DS-01).
 */
export function selectLatestRecords(records: readonly ComplianceRecord[], policy: CompliancePolicy): LatestRecords {
  const groups = new Map<string, ComplianceRecord[]>();
  for (const record of records) {
    const key = subjectKey(record.subjectId, record.complianceType);
    const list = groups.get(key);
    if (list) {
      list.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  const bySubjectAndType = new Map<string, ComplianceRecord>();
  const warnings: ComplianceWarning[] = [];
  for (const [key, list] of groups) {
    const latestDay = Math.max(...list.map(completionDay));
    const candidates = list
      .filter((r) => completionDay(r) === latestDay)
      .sort((a, b) => a.recordedSeq - b.recordedSeq);
    const winner = policy.latestRecord.tieBreak === 'FIRST_ENTERED' ? candidates[0] : candidates[candidates.length - 1];
    if (!winner) {
      continue;
    }
    bySubjectAndType.set(key, winner);
    if (candidates.length > 1) {
      warnings.push({
        code: 'AMBIGUOUS_LATEST_RECORD',
        subjectId: winner.subjectId,
        complianceType: winner.complianceType,
        recordIds: candidates.map((r) => r.id),
      });
    }
  }
  return { bySubjectAndType, warnings };
}

/** Records without a completion date rank below any dated record, as blank (0) does in MAXIFS. */
function completionDay(record: ComplianceRecord): number {
  return record.completionDate === null ? Number.NEGATIVE_INFINITY : toDayNumber(record.completionDate);
}
