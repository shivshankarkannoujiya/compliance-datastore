import type { IsoDate } from '../shared/local-date';
import { evaluateRecord } from './evaluate-record';
import { selectLatestRecords, subjectKey } from './latest-record';
import type { CompliancePolicy } from './policy';
import type {
  CatalogueEntry,
  ComplianceRecord,
  ComplianceWarning,
  DueDateStatus,
  EvaluatedRecord,
  Requirement,
  RequirementStatus,
} from './types';

export interface RequirementStatusInput {
  asOf: IsoDate;
  catalogue: readonly CatalogueEntry[];
  requirements: readonly Requirement[];
  records: readonly ComplianceRecord[];
}

export interface RequirementStatusResult {
  records: EvaluatedRecord[];
  requirements: RequirementStatus[];
  warnings: ComplianceWarning[];
}

/**
 * Joins each requirement to its subject's latest record for that type (Due Date, Compliance Status, Completion
 * Status, Compliance and Compliance (Core) columns; tab 04 rows 212–217).
 *
 * A requirement with no record is Non Compliant. Requirements whose type is not in the catalogue are dropped with a
 * warning, as the Power Query join and "Compliance Group 3 <> null" filter drop them today.
 */
export function evaluateRequirements(input: RequirementStatusInput, policy: CompliancePolicy): RequirementStatusResult {
  const catalogue = new Map(input.catalogue.map((c) => [c.complianceType.trim().toLowerCase(), c]));
  const latest = selectLatestRecords(input.records, policy);
  const evaluated = new Map<string, EvaluatedRecord>();
  for (const [key, record] of latest.bySubjectAndType) {
    evaluated.set(key, evaluateRecord(record, input.asOf, policy));
  }

  const warnings = [...latest.warnings];
  const requirements: RequirementStatus[] = [];
  for (const requirement of input.requirements) {
    const entry = catalogue.get(requirement.complianceType.trim().toLowerCase());
    if (!entry) {
      warnings.push({ code: 'UNKNOWN_COMPLIANCE_TYPE', subjectId: requirement.subjectId, complianceType: requirement.complianceType });
      continue;
    }
    const match = evaluated.get(subjectKey(requirement.subjectId, requirement.complianceType)) ?? null;
    const compliant = match?.compliant ?? false;
    const counts = requirement.required && requirement.active;
    const value: 0 | 1 = compliant ? 1 : 0;
    requirements.push({
      requirement,
      catalogue: entry,
      evaluated: match,
      dueDate: dueDateStatus(match),
      compliant,
      completionStatus: blankToNull(match?.record.completionStatus ?? null),
      compliance: counts ? value : null,
      complianceCore: counts && entry.core ? value : null,
    });
  }
  return { records: [...evaluated.values()], requirements, warnings };
}

function dueDateStatus(match: EvaluatedRecord | null): DueDateStatus {
  if (!match) {
    return { kind: 'NO_RECORD' };
  }
  return match.record.dueDate === null ? { kind: 'NO_EXPIRY_DATE_SET' } : { kind: 'DATE', date: match.record.dueDate };
}

function blankToNull(text: string | null): string | null {
  return text === null || text.trim() === '' ? null : text;
}
