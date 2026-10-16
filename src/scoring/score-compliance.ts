import { evaluateRequirements, type CompliancePolicy, type RequirementStatusInput } from '../compliance-rules';
import { scoreGroups, scoreSubGroups, scoreTypes } from './roll-up';
import type { ScoreResult } from './types';

export type ScoreInput = RequirementStatusInput;

/**
 * Full calculation for one as-of date: latest records, compliance rules, requirement statuses, then the type,
 * sub-group and group scores. Pure and deterministic, so the same input and policy always give the same result.
 */
export function scoreCompliance(input: ScoreInput, policy: CompliancePolicy): ScoreResult {
  const { records, requirements, warnings } = evaluateRequirements(input, policy);
  const types = scoreTypes(requirements, policy);
  const subGroups = scoreSubGroups(requirements, types, policy);
  const groups = scoreGroups(requirements, subGroups, policy);
  return { asOf: input.asOf, policyVersion: policy.version, records, requirements, types, subGroups, groups, warnings };
}
