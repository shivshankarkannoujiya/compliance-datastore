import type { ComplianceWarning, EvaluatedRecord, RequirementStatus } from '../compliance-rules';
import type { IsoDate } from '../shared/local-date';

/** Average Thresholds 1–5 over the requirement rows in a sub group or group, as AVERAGEIFS computes them. */
export type Thresholds = readonly [number, number, number, number, number];

export interface TypeScore {
  group: string;
  subGroup: string;
  complianceType: string;
  /** Fraction 0–1 of required, active requirements that are compliant; null when none count. */
  percentCompliant: number | null;
  percentCompliantCore: number | null;
  rag: number | null;
  ragCore: number | null;
}

export interface SubGroupScore {
  group: string;
  subGroup: string;
  percentCompliant: number | null;
  percentCompliantCore: number | null;
  rag: number | null;
  ragCore: number | null;
  thresholds: Thresholds;
}

export interface GroupScore {
  group: string;
  percentCompliant: number | null;
  percentCompliantCore: number | null;
  rag: number | null;
  ragCore: number | null;
  thresholds: Thresholds;
}

export interface ScoreResult {
  asOf: IsoDate;
  policyVersion: string;
  records: EvaluatedRecord[];
  requirements: RequirementStatus[];
  types: TypeScore[];
  subGroups: SubGroupScore[];
  groups: GroupScore[];
  warnings: ComplianceWarning[];
}
