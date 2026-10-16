import { addMonths, addWorkdays, daysBetween, toDayNumber, type IsoDate } from '../shared/local-date';
import { excelRound, sameText } from '../shared/numbers';
import type { CompliancePolicy } from './policy';
import type { ComplianceRecord, ComplianceRuleKind, EvaluatedRecord, ExpiryFlag } from './types';

/**
 * Applies the compliance rule for a latest record as of a date. Replaces the Compliant, Expires within 3 months and
 * Weeks Non Compliant columns of the Compliance Data table (tab 04 rows 192–194), where TODAY() becomes `asOf`.
 */
export function evaluateRecord(record: ComplianceRecord, asOf: IsoDate, policy: CompliancePolicy): EvaluatedRecord {
  const rule = ruleFor(record.groupLevel2, policy);
  const compliant = isCompliant(record, rule, asOf, policy);
  return {
    record,
    rule,
    compliant,
    expiry: expiryFlag(record, asOf, policy),
    weeksNonCompliant: compliant || record.dueDate === null ? null : excelRound(daysBetween(record.dueDate, asOf) / 7),
  };
}

export function ruleFor(groupLevel2: string, policy: CompliancePolicy): ComplianceRuleKind {
  const { issueScore, completionStatus } = policy.rules;
  if (issueScore.groups.some((g) => sameText(g, groupLevel2))) {
    return 'ISSUE_SCORE';
  }
  if (completionStatus.groups.some((g) => sameText(g, groupLevel2))) {
    return 'COMPLETION_STATUS';
  }
  return 'DUE_DATE';
}

function isCompliant(record: ComplianceRecord, rule: ComplianceRuleKind, asOf: IsoDate, policy: CompliancePolicy): boolean {
  switch (rule) {
    case 'ISSUE_SCORE':
      return record.issue === policy.rules.issueScore.compliantValue;
    case 'COMPLETION_STATUS': {
      const completed = (record.completionStatus ?? '').trim() !== '';
      if (!completed || !policy.rules.completionStatus.lapseAtDueDate || record.dueDate === null) {
        return completed;
      }
      return isAfter(record.dueDate, asOf);
    }
    case 'DUE_DATE':
      return record.dueDate === null ? policy.rules.dueDate.blankDueDateCompliant : isAfter(record.dueDate, asOf);
  }
}

function expiryFlag(record: ComplianceRecord, asOf: IsoDate, policy: CompliancePolicy): ExpiryFlag | null {
  if (record.dueDate === null) {
    return null;
  }
  const { expiry } = policy;
  if (!expiry.includeOverdue && toDayNumber(record.dueDate) < toDayNumber(asOf)) {
    return null;
  }
  const shortWindow = expiry.shortWindowGroups.some((g) => sameText(g, record.groupLevel2));
  const due = toDayNumber(record.dueDate);
  if (shortWindow) {
    return due < toDayNumber(addWorkdays(asOf, expiry.shortWindowWorkdays)) ? 'EXPIRES_WITHIN_SHORT_WINDOW' : null;
  }
  return due < toDayNumber(addMonths(asOf, expiry.windowMonths)) ? 'EXPIRES_WITHIN_WINDOW' : null;
}

/** Due Date > TODAY(): due today already counts as lapsed. */
function isAfter(date: IsoDate, asOf: IsoDate): boolean {
  return toDayNumber(date) > toDayNumber(asOf);
}
