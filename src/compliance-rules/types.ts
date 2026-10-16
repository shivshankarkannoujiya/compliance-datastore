import type { IsoDate } from '../shared/local-date';

/**
 * One compliance type in the catalogue (one row of a tool's Compliance Timeframes table).
 *
 * The workbook carries two group hierarchies: Requirements uses Compliance Group 1/2 and Requirements_Detailed uses
 * 3/4 (finding DS-08). A catalogue is built for one hierarchy; score it once per hierarchy if both are needed.
 */
export interface CatalogueEntry {
  complianceType: string;
  group: string;
  subGroup: string;
  /** "Core" in the workbook. */
  core: boolean;
  /** Thresholds 1–5, highest first (e.g. 1, 0.9, 0.8, 0.7, 0.6). Compared with a 0–1 compliance fraction. */
  thresholds: readonly [number, number, number, number, number];
}

/** A requirement: this subject must hold this compliance type (one row of a tool's Requirements table). */
export interface Requirement {
  /** Person, site or organisation. Replaces the Name text key. */
  subjectId: string;
  complianceType: string;
  /** "Required (T/F)". */
  required: boolean;
  /** "Active": the subject is current. Inactive rows are kept but do not count toward percentages. */
  active: boolean;
}

/** One completion record in the data store (one row of the Compliance Data table). */
export interface ComplianceRecord {
  id: string;
  subjectId: string;
  complianceType: string;
  /** "Compliance Group - Level 1". */
  groupLevel1: string;
  /** "Compliance Group - Level 2": selects the compliance rule (Incidents, Training, …). */
  groupLevel2: string;
  completionDate: IsoDate | null;
  completionStatus: string | null;
  dueDate: IsoDate | null;
  /** Issue score; 10 means no issue for the Issue-based groups. */
  issue: number | null;
  /** Entry order (row order in the workbook). Breaks ties between records with the same completion date. */
  recordedSeq: number;
  notes?: string | null;
}

export type ComplianceRuleKind = 'ISSUE_SCORE' | 'COMPLETION_STATUS' | 'DUE_DATE';

export type ExpiryFlag = 'EXPIRES_WITHIN_WINDOW' | 'EXPIRES_WITHIN_SHORT_WINDOW';

/** A latest record with the result of its compliance rule. */
export interface EvaluatedRecord {
  record: ComplianceRecord;
  rule: ComplianceRuleKind;
  compliant: boolean;
  expiry: ExpiryFlag | null;
  /** Whole weeks past the due date when non compliant; null when there is no due date. */
  weeksNonCompliant: number | null;
}

export type DueDateStatus =
  | { kind: 'DATE'; date: IsoDate }
  | { kind: 'NO_RECORD' }
  | { kind: 'NO_EXPIRY_DATE_SET' };

/** A requirement joined to its latest record (formula columns of the Requirements tables). */
export interface RequirementStatus {
  requirement: Requirement;
  catalogue: CatalogueEntry;
  evaluated: EvaluatedRecord | null;
  dueDate: DueDateStatus;
  compliant: boolean;
  /** Completion Status of the latest record, or null for "Missing". */
  completionStatus: string | null;
  /** 1/0 when required and active, otherwise null (excluded from percentages). */
  compliance: 0 | 1 | null;
  /** As `compliance`, for core types only. */
  complianceCore: 0 | 1 | null;
}

export type ComplianceWarning =
  | { code: 'AMBIGUOUS_LATEST_RECORD'; subjectId: string; complianceType: string; recordIds: string[] }
  | { code: 'UNKNOWN_COMPLIANCE_TYPE'; subjectId: string; complianceType: string };
