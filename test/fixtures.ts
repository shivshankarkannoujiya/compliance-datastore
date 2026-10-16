import type { CatalogueEntry, ComplianceRecord, Requirement } from '../src';

export const STANDARD_THRESHOLDS = [1, 0.9, 0.8, 0.7, 0.6] as const;

let seq = 0;

export function record(overrides: Partial<ComplianceRecord> & Pick<ComplianceRecord, 'subjectId' | 'complianceType'>): ComplianceRecord {
  seq += 1;
  return {
    id: `r${seq}`,
    groupLevel1: 'Staff',
    groupLevel2: 'Staff Compliance',
    completionDate: '2026-01-01',
    completionStatus: 'Completed',
    dueDate: '2027-01-01',
    issue: null,
    recordedSeq: seq,
    ...overrides,
  };
}

export function entry(overrides: Partial<CatalogueEntry> & Pick<CatalogueEntry, 'complianceType'>): CatalogueEntry {
  return { group: 'Staff', subGroup: 'Staff Compliance', core: true, thresholds: STANDARD_THRESHOLDS, ...overrides };
}

export function requirement(subjectId: string, complianceType: string, overrides: Partial<Requirement> = {}): Requirement {
  return { subjectId, complianceType, required: true, active: true, ...overrides };
}
