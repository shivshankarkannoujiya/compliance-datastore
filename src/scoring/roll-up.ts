import type { CompliancePolicy, RequirementStatus } from '../compliance-rules';
import { containsText, mean, sameText } from '../shared/numbers';
import { bandScore } from './band';
import type { GroupScore, SubGroupScore, Thresholds, TypeScore } from './types';

/**
 * Type → sub group → group roll-up (tab 04 rows 218–221 and 234–246).
 *
 * Grouping uses Group + Sub Group throughout. The workbook's Incidents/HR Metrics counts and the default branch's
 * average key on the sub-group name alone; the two only differ if one sub-group name is reused under two groups.
 */
export function scoreTypes(rows: readonly RequirementStatus[], policy: CompliancePolicy): TypeScore[] {
  return [...groupBy(rows, (r) => key(r.catalogue.group, r.catalogue.subGroup, r.catalogue.complianceType))].map(
    ([, typeRows]) => {
      const entry = typeRows[0]!.catalogue;
      const percentCompliant = mean(present(typeRows.map((r) => r.compliance)));
      const percentCompliantCore = mean(present(typeRows.map((r) => r.complianceCore)));
      return {
        group: entry.group,
        subGroup: entry.subGroup,
        complianceType: entry.complianceType,
        percentCompliant,
        percentCompliantCore,
        rag: percentCompliant === null ? null : bandScore(percentCompliant, entry.thresholds, policy.scoring.bandScores),
        ragCore:
          percentCompliantCore === null ? null : bandScore(percentCompliantCore, entry.thresholds, policy.scoring.bandScores),
      };
    },
  );
}

export function scoreSubGroups(
  rows: readonly RequirementStatus[],
  types: readonly TypeScore[],
  policy: CompliancePolicy,
): SubGroupScore[] {
  const { scoring } = policy;
  return [...groupBy(rows, (r) => key(r.catalogue.group, r.catalogue.subGroup))].map(([, subRows]) => {
    const { group, subGroup } = subRows[0]!.catalogue;
    const subTypes = types.filter((t) => sameText(t.group, group) && sameText(t.subGroup, subGroup));
    const excludedFromPercent = scoring.percentExcludedSubGroups.some((s) => sameText(s, subGroup));
    const percentCompliant = excludedFromPercent ? null : mean(present(subTypes.map((t) => t.percentCompliant)));
    const percentCompliantCore = excludedFromPercent ? null : mean(present(subTypes.map((t) => t.percentCompliantCore)));
    const thresholds = averageThresholds(subRows);
    const ragExcluded = scoring.ragExcludedSubGroups.some((s) => sameText(s, subGroup));
    return {
      group,
      subGroup,
      percentCompliant,
      percentCompliantCore,
      thresholds,
      rag: ragExcluded ? null : subGroupRag(subGroup, subTypes, percentCompliant, thresholds, policy, 'all'),
      ragCore: ragExcluded ? null : subGroupRag(subGroup, subTypes, percentCompliantCore, thresholds, policy, 'core'),
    };
  });
}

export function scoreGroups(
  rows: readonly RequirementStatus[],
  subGroups: readonly SubGroupScore[],
  policy: CompliancePolicy,
): GroupScore[] {
  return [...groupBy(rows, (r) => key(r.catalogue.group))].map(([, groupRows]) => {
    const { group } = groupRows[0]!.catalogue;
    const subs = subGroups.filter((s) => sameText(s.group, group));
    const percentCompliant = mean(present(subs.map((s) => s.percentCompliant)));
    const percentCompliantCore = mean(present(subs.map((s) => s.percentCompliantCore)));
    const thresholds = averageThresholds(groupRows);
    const band = (p: number | null) => (p === null ? null : bandScore(p, thresholds, policy.scoring.bandScores));
    return { group, percentCompliant, percentCompliantCore, thresholds, rag: band(percentCompliant), ragCore: band(percentCompliantCore) };
  });
}

/**
 * Sub-group RAG (tab 04 rows 243–244). Incidents and SPC sub groups count failing types; all others pass a gate
 * (average type RAG minus a penalty per type at 0 %) and are then banded on the sub-group percentage.
 *
 * As in the workbook, the Incidents and SPC rules use the all-requirements type RAG in both the all and core
 * variants; only the default branch switches to core values.
 */
function subGroupRag(
  subGroup: string,
  types: readonly TypeScore[],
  percent: number | null,
  thresholds: Thresholds,
  policy: CompliancePolicy,
  variant: 'all' | 'core',
): number | null {
  const { incidents, spcRule, bandScores, zeroTypePenalty } = policy.scoring;
  const failing = types.filter((t) => t.rag === 0).map((t) => t.complianceType);
  const spcFailures = failing.filter((name) => containsText(name, incidents.spcMarker)).length;
  const spcScore = () =>
    spcFailures >= 2 ? spcRule.twoOrMoreFailuresScore : spcFailures >= 1 ? spcRule.oneFailureScore : 1;

  if (sameText(subGroup, incidents.subGroup)) {
    const otherFailure = failing.some(
      (name) => !containsText(name, incidents.spcMarker) && !containsText(name, incidents.moderateMarker),
    );
    if (otherFailure) {
      return 0;
    }
    if (failing.filter((name) => sameText(name, incidents.moderateHarmType)).length === 1) {
      return incidents.singleModerateHarmScore;
    }
    return spcScore();
  }
  if (spcRule.subGroups.some((s) => sameText(s, subGroup))) {
    return spcScore();
  }

  const typeRag = (t: TypeScore) => (variant === 'core' ? t.ragCore : t.rag);
  const typePercent = (t: TypeScore) => (variant === 'core' ? t.percentCompliantCore : t.percentCompliant);
  const averageRag = mean(present(types.map(typeRag)));
  if (averageRag === null || percent === null) {
    return null;
  }
  const zeroTypes = types.filter((t) => typePercent(t) === 0).length;
  const penalty = zeroTypePenalty[Math.min(zeroTypes, zeroTypePenalty.length - 1)] ?? 0;
  if (averageRag - penalty < 0) {
    return 0;
  }
  return bandScore(percent, thresholds, bandScores);
}

/** Row-weighted, as AVERAGEIFS over the requirement rows: a type with more requirements weighs more. */
function averageThresholds(rows: readonly RequirementStatus[]): Thresholds {
  const at = (i: number) => mean(rows.map((r) => r.catalogue.thresholds[i]!)) ?? 0;
  return [at(0), at(1), at(2), at(3), at(4)];
}

function present(values: readonly (number | null)[]): number[] {
  return values.filter((v): v is number => v !== null);
}

function key(...parts: string[]): string {
  return parts.map((p) => p.trim().toLowerCase()).join('\u0000');
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = keyOf(item);
    const list = out.get(k);
    if (list) {
      list.push(item);
    } else {
      out.set(k, [item]);
    }
  }
  return out;
}
