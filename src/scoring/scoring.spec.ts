import { entry, record, requirement } from '../../test/fixtures';
import { EXCEL_PARITY_POLICY, type CatalogueEntry, type ComplianceRecord, type Requirement } from '../compliance-rules';
import { bandScore } from './band';
import { scoreCompliance } from './score-compliance';

const AS_OF = '2026-10-16';
const P = EXCEL_PARITY_POLICY;
const BANDS = P.scoring.bandScores;

/** Builds one sub group where each type has `outcomes.length` subjects, true = compliant. */
function subGroup(
  group: string,
  subGroupName: string,
  types: Record<string, boolean[]>,
  options: { level2?: string; core?: (type: string) => boolean } = {},
) {
  const catalogue: CatalogueEntry[] = [];
  const requirements: Requirement[] = [];
  const records: ComplianceRecord[] = [];
  for (const [type, outcomes] of Object.entries(types)) {
    catalogue.push(entry({ complianceType: type, group, subGroup: subGroupName, core: options.core?.(type) ?? true }));
    outcomes.forEach((ok, i) => {
      const subjectId = `${type}-${i}`;
      requirements.push(requirement(subjectId, type));
      records.push(
        record({
          subjectId,
          complianceType: type,
          groupLevel1: group,
          groupLevel2: options.level2 ?? subGroupName,
          dueDate: ok ? '2027-06-01' : '2026-01-01',
          issue: ok ? 10 : 6,
        }),
      );
    });
  }
  return { catalogue, requirements, records };
}

function merge(...parts: ReturnType<typeof subGroup>[]) {
  return {
    asOf: AS_OF,
    catalogue: parts.flatMap((p) => p.catalogue),
    requirements: parts.flatMap((p) => p.requirements),
    records: parts.flatMap((p) => p.records),
  };
}

describe('bandScore (tab 04 row 220)', () => {
  const t = [1, 0.9, 0.8, 0.7, 0.6] as const;
  it.each([
    [1, 1],
    [0.95, 0.8],
    [0.9, 0.8],
    [0.8, 0.6],
    [0.7, 0.4],
    [0.6, 0.2],
    [0.59, 0],
  ])('%s → %s', (percent, score) => expect(bandScore(percent, t, BANDS)).toBe(score));

  it('tolerates floating-point error at a threshold', () => {
    expect(bandScore(0.1 * 9, t, BANDS)).toBe(0.8);
  });
});

describe('type scores', () => {
  it('averages required, active requirements and bands them', () => {
    const result = scoreCompliance(merge(subGroup('Staff', 'Checks', { DBS: [true, true, true, false] })), P);
    expect(result.types).toEqual([
      expect.objectContaining({ complianceType: 'DBS', percentCompliant: 0.75, percentCompliantCore: 0.75, rag: 0.4, ragCore: 0.4 }),
    ]);
  });

  it('leaves core values empty for non-core types', () => {
    const result = scoreCompliance(merge(subGroup('Staff', 'Checks', { Appraisal: [true] }, { core: () => false })), P);
    expect(result.types[0]).toMatchObject({ percentCompliant: 1, percentCompliantCore: null, rag: 1, ragCore: null });
  });
});

describe('default sub-group RAG (tab 04 row 243)', () => {
  it('reproduces the worked example in DSL §5.2: 100 %, 100 %, 50 %, 0 % → 0.2', () => {
    const result = scoreCompliance(
      merge(subGroup('Organisation', 'Policies', { A: [true, true], B: [true, true], C: [true, false], D: [false, false] })),
      P,
    );
    expect(result.subGroups[0]).toMatchObject({ percentCompliant: 0.625, rag: 0.2, ragCore: 0.2 });
  });

  it('forces 0 when the zero-type penalty outweighs the average type RAG', () => {
    // Type RAGs 1, 1, 0, 0 average 0.5; two types at 0 % → penalty 0.6 → gate fails.
    const result = scoreCompliance(
      merge(subGroup('Organisation', 'Policies', { A: [true], B: [true], C: [false], D: [false] })),
      P,
    );
    expect(result.subGroups[0]).toMatchObject({ percentCompliant: 0.5, rag: 0 });
  });

  it('averages thresholds over requirement rows, so larger types weigh more', () => {
    const data = merge(subGroup('Organisation', 'Policies', { A: [true, true, true], B: [true] }));
    data.catalogue[1] = { ...data.catalogue[1]!, thresholds: [1, 0.5, 0.5, 0.5, 0.5] };
    const result = scoreCompliance(data, P);
    [1, 0.8, 0.725, 0.65, 0.575].forEach((t, i) => expect(result.subGroups[0]!.thresholds[i]).toBeCloseTo(t, 12));
  });

  it('gives no percentage to Onboarding and no RAG to Accreditation', () => {
    const result = scoreCompliance(
      merge(subGroup('Staff', 'Onboarding', { Induction: [true] }), subGroup('Staff', 'Accreditation', { CQC: [true] })),
      P,
    );
    expect(result.subGroups.find((s) => s.subGroup === 'Onboarding')).toMatchObject({ percentCompliant: null, rag: null });
    expect(result.subGroups.find((s) => s.subGroup === 'Accreditation')).toMatchObject({ percentCompliant: 1, rag: null, ragCore: null });
  });
});

describe('Incidents sub-group RAG (tab 04 row 243)', () => {
  const incidents = (types: Record<string, boolean[]>) =>
    scoreCompliance(merge(subGroup('Clinical', 'Incidents', types)), P).subGroups[0]!.rag;

  it('scores 1 with no failing types', () => {
    expect(incidents({ 'Moderate Harm': [true], 'Falls SPC': [true], 'Reported within 48h': [true] })).toBe(1);
  });

  it('scores 0 when any type other than SPC or Moderate fails', () => {
    expect(incidents({ 'Reported within 48h': [false], 'Falls SPC': [true] })).toBe(0);
  });

  it('scores 0.5 for exactly one failing Moderate Harm', () => {
    expect(incidents({ 'Moderate Harm': [false], 'Falls SPC': [true] })).toBe(0.5);
  });

  it('scores 0.5 for two failing SPC types and 0.8 for one', () => {
    expect(incidents({ 'Falls SPC': [false], 'Pressure SPC': [false] })).toBe(0.5);
    expect(incidents({ 'Falls SPC': [false], 'Pressure SPC': [true] })).toBe(0.8);
  });

  it('lets a failing Moderate type not named exactly "Moderate Harm" score 1 (DS-07)', () => {
    // Rule 1 exempts every name containing "Moderate", but rule 2 only counts the exact name.
    expect(incidents({ 'Moderate Harm': [true], 'Moderate Harm - Falls': [false] })).toBe(1);
    expect(incidents({ 'Moderate Harm': [false], 'Moderate Harm - Falls': [false] })).toBe(0.5);
  });

  it('uses the all-requirements type RAG in the core variant too, as the workbook does', () => {
    const result = scoreCompliance(
      merge(subGroup('Clinical', 'Incidents', { 'Reported within 48h': [false] }, { core: () => false })),
      P,
    );
    expect(result.subGroups[0]).toMatchObject({ rag: 0, ragCore: 0 });
  });
});

describe('HR Metrics sub-group RAG', () => {
  it('counts failing SPC types only', () => {
    const hr = (types: Record<string, boolean[]>) =>
      scoreCompliance(merge(subGroup('Organisation', 'HR Metrics', types)), P).subGroups[0]!.rag;
    expect(hr({ 'Sickness SPC': [false], 'Turnover SPC': [false] })).toBe(0.5);
    expect(hr({ 'Sickness SPC': [false], 'Turnover SPC': [true] })).toBe(0.8);
    expect(hr({ 'Vacancy rate': [false] })).toBe(1);
  });
});

describe('group scores (tab 04 rows 236–237, 245–246)', () => {
  it('averages sub-group percentages and bands against row-weighted thresholds', () => {
    const result = scoreCompliance(
      merge(subGroup('Staff', 'Checks', { DBS: [true, true] }), subGroup('Staff', 'Training', { Fire: [true, false] }, { level2: 'Staff Training' })),
      P,
    );
    expect(result.groups).toEqual([
      expect.objectContaining({ group: 'Staff', percentCompliant: 0.75, rag: 0.4, thresholds: [1, 0.9, 0.8, 0.7, 0.6] }),
    ]);
  });

  it('is deterministic and reports the policy version', () => {
    const data = merge(subGroup('Staff', 'Checks', { DBS: [true, false] }));
    expect(scoreCompliance(data, P)).toEqual(scoreCompliance(data, P));
    expect(scoreCompliance(data, P).policyVersion).toBe('excel-parity-1');
  });
});
