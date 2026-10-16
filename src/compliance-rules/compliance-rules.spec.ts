import { entry, record, requirement } from '../../test/fixtures';
import { evaluateRecord, evaluateRequirements, EXCEL_PARITY_POLICY, selectLatestRecords, subjectKey, type CompliancePolicy } from '.';

const AS_OF = '2026-10-16';
const P = EXCEL_PARITY_POLICY;

function withPolicy(change: (p: CompliancePolicy) => void): CompliancePolicy {
  const copy = structuredClone(P) as CompliancePolicy;
  change(copy);
  return copy;
}

describe('compliance rule by Level 2 group (tab 04 row 192)', () => {
  it.each(['Incidents', 'Feedback', 'HR Metrics', 'Complications', ' incidents '])('%s: compliant only when Issue = 10', (group) => {
    expect(evaluateRecord(record({ subjectId: 'site', complianceType: 'X', groupLevel2: group, issue: 10 }), AS_OF, P)).toMatchObject({
      rule: 'ISSUE_SCORE',
      compliant: true,
    });
    expect(evaluateRecord(record({ subjectId: 'site', complianceType: 'X', groupLevel2: group, issue: 6 }), AS_OF, P).compliant).toBe(false);
  });

  it('Training: compliant when Completion Status is filled, even after the due date (DS-03)', () => {
    const lapsed = record({ subjectId: 'a', complianceType: 'Fire', groupLevel2: 'Training', dueDate: '2026-01-01' });
    expect(evaluateRecord(lapsed, AS_OF, P)).toMatchObject({ rule: 'COMPLETION_STATUS', compliant: true });
    expect(evaluateRecord({ ...lapsed, completionStatus: '  ' }, AS_OF, P).compliant).toBe(false);
  });

  it('Training: lapses at the due date when the policy says so', () => {
    const policy = withPolicy((p) => (p.rules.completionStatus.lapseAtDueDate = true));
    const lapsed = record({ subjectId: 'a', complianceType: 'Fire', groupLevel2: 'Training', dueDate: '2026-01-01' });
    expect(evaluateRecord(lapsed, AS_OF, policy).compliant).toBe(false);
  });

  it('other groups: compliant while the due date is after the as-of date; due today has lapsed', () => {
    expect(evaluateRecord(record({ subjectId: 'a', complianceType: 'DBS', dueDate: '2026-10-17' }), AS_OF, P).compliant).toBe(true);
    expect(evaluateRecord(record({ subjectId: 'a', complianceType: 'DBS', dueDate: AS_OF }), AS_OF, P).compliant).toBe(false);
  });

  it('a blank due date is compliant in the workbook (DS-02) and can be made non compliant', () => {
    const blank = record({ subjectId: 'a', complianceType: 'DBS', dueDate: null });
    expect(evaluateRecord(blank, AS_OF, P).compliant).toBe(true);
    const strict = withPolicy((p) => (p.rules.dueDate.blankDueDateCompliant = false));
    expect(evaluateRecord(blank, AS_OF, strict).compliant).toBe(false);
  });
});

describe('expiry flag (tab 04 row 193)', () => {
  it('flags due dates before EDATE(asOf, 3)', () => {
    expect(evaluateRecord(record({ subjectId: 'a', complianceType: 'DBS', dueDate: '2027-01-15' }), AS_OF, P).expiry).toBe('EXPIRES_WITHIN_WINDOW');
    expect(evaluateRecord(record({ subjectId: 'a', complianceType: 'DBS', dueDate: '2027-01-16' }), AS_OF, P).expiry).toBeNull();
  });

  it('uses 10 working days for Ongoing Audit', () => {
    const audit = (dueDate: string) => record({ subjectId: 'site', complianceType: 'Audit', groupLevel2: 'Ongoing Audit', dueDate });
    expect(evaluateRecord(audit('2026-10-29'), AS_OF, P).expiry).toBe('EXPIRES_WITHIN_SHORT_WINDOW');
    expect(evaluateRecord(audit('2026-10-30'), AS_OF, P).expiry).toBeNull();
    expect(evaluateRecord(audit('2026-12-01'), AS_OF, P).expiry).toBeNull();
  });

  it('flags overdue items too unless the policy excludes them (DS-04)', () => {
    const overdue = record({ subjectId: 'a', complianceType: 'DBS', dueDate: '2026-01-01' });
    expect(evaluateRecord(overdue, AS_OF, P).expiry).toBe('EXPIRES_WITHIN_WINDOW');
    expect(evaluateRecord(overdue, AS_OF, withPolicy((p) => (p.expiry.includeOverdue = false))).expiry).toBeNull();
  });
});

describe('weeks non compliant (tab 04 row 194)', () => {
  it('rounds whole weeks past the due date', () => {
    // 2026-09-14 → 2026-10-16 is 32 days = 4.57 weeks.
    expect(evaluateRecord(record({ subjectId: 'a', complianceType: 'DBS', dueDate: '2026-09-14' }), AS_OF, P).weeksNonCompliant).toBe(5);
  });

  it('is null when compliant or when there is no due date (DS-05)', () => {
    expect(evaluateRecord(record({ subjectId: 'a', complianceType: 'DBS' }), AS_OF, P).weeksNonCompliant).toBeNull();
    const failed = record({ subjectId: 's', complianceType: 'X', groupLevel2: 'Incidents', issue: 6, dueDate: null });
    expect(evaluateRecord(failed, AS_OF, P).weeksNonCompliant).toBeNull();
  });

  it('is negative for an Issue failure with a future due date, as in the workbook', () => {
    const failed = record({ subjectId: 's', complianceType: 'X', groupLevel2: 'Incidents', issue: 6, dueDate: '2026-10-30' });
    expect(evaluateRecord(failed, AS_OF, P).weeksNonCompliant).toBe(-2);
  });
});

describe('latest record (tab 04 rows 191, 196–199)', () => {
  it('picks the latest completion date per subject and type', () => {
    const old = record({ subjectId: 'a', complianceType: 'DBS', completionDate: '2024-01-01' });
    const recent = record({ subjectId: 'a', complianceType: 'DBS', completionDate: '2025-06-01' });
    const other = record({ subjectId: 'b', complianceType: 'DBS', completionDate: '2023-01-01' });
    const { bySubjectAndType, warnings } = selectLatestRecords([recent, old, other], P);
    expect(bySubjectAndType.get(subjectKey('a', 'dbs'))).toBe(recent);
    expect(bySubjectAndType.size).toBe(2);
    expect(warnings).toEqual([]);
  });

  it('breaks ties by entry order and warns (DS-01)', () => {
    const first = record({ subjectId: 'a', complianceType: 'DBS', completionDate: null });
    const second = record({ subjectId: 'a', complianceType: 'DBS', completionDate: null });
    const parity = selectLatestRecords([second, first], P);
    expect(parity.bySubjectAndType.get(subjectKey('a', 'DBS'))).toBe(first);
    expect(parity.warnings).toEqual([
      { code: 'AMBIGUOUS_LATEST_RECORD', subjectId: 'a', complianceType: 'DBS', recordIds: [first.id, second.id] },
    ]);
    const last = selectLatestRecords([first, second], withPolicy((p) => (p.latestRecord.tieBreak = 'LAST_ENTERED')));
    expect(last.bySubjectAndType.get(subjectKey('a', 'DBS'))).toBe(second);
  });

  it('ranks undated records below dated ones', () => {
    const dated = record({ subjectId: 'a', complianceType: 'DBS', completionDate: '2020-01-01' });
    const undated = record({ subjectId: 'a', complianceType: 'DBS', completionDate: null });
    expect(selectLatestRecords([undated, dated], P).bySubjectAndType.get(subjectKey('a', 'DBS'))).toBe(dated);
  });
});

describe('requirement status (tab 04 rows 212–217)', () => {
  const catalogue = [entry({ complianceType: 'DBS', core: true }), entry({ complianceType: 'Appraisal', core: false })];

  it('marks a requirement without a record as Non Compliant with No record', () => {
    const { requirements } = evaluateRequirements(
      { asOf: AS_OF, catalogue, requirements: [requirement('a', 'DBS')], records: [] },
      P,
    );
    expect(requirements[0]).toMatchObject({ dueDate: { kind: 'NO_RECORD' }, compliant: false, completionStatus: null, compliance: 0, complianceCore: 0 });
  });

  it('reports No expiry date set and keeps core and non-core values apart', () => {
    const { requirements } = evaluateRequirements(
      {
        asOf: AS_OF,
        catalogue,
        requirements: [requirement('a', 'DBS'), requirement('a', 'appraisal')],
        records: [record({ subjectId: 'a', complianceType: 'DBS', dueDate: null }), record({ subjectId: 'a', complianceType: 'Appraisal' })],
      },
      P,
    );
    expect(requirements[0]).toMatchObject({ dueDate: { kind: 'NO_EXPIRY_DATE_SET' }, compliance: 1, complianceCore: 1 });
    expect(requirements[1]).toMatchObject({ dueDate: { kind: 'DATE', date: '2027-01-01' }, compliance: 1, complianceCore: null });
  });

  it('excludes requirements that are not required or not active', () => {
    const { requirements } = evaluateRequirements(
      {
        asOf: AS_OF,
        catalogue,
        requirements: [requirement('a', 'DBS', { active: false }), requirement('b', 'DBS', { required: false })],
        records: [],
      },
      P,
    );
    expect(requirements.map((r) => r.compliance)).toEqual([null, null]);
  });

  it('drops requirements whose type is not in the catalogue, with a warning', () => {
    const result = evaluateRequirements(
      { asOf: AS_OF, catalogue, requirements: [requirement('a', 'Unknown')], records: [] },
      P,
    );
    expect(result.requirements).toEqual([]);
    expect(result.warnings).toEqual([{ code: 'UNKNOWN_COMPLIANCE_TYPE', subjectId: 'a', complianceType: 'Unknown' }]);
  });
});
