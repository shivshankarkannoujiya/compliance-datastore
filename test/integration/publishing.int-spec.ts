import { ConflictError, ForbiddenError } from '../../src';
import { createHarness, version, type Harness } from './harness';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => h.reset());

const AS_OF = '2026-10-16';

/** Two staff with DBS (detailed hierarchy too) and Fire Training; one is lapsed on DBS and missing Fire Training. */
async function seed() {
  const jane = await h.subjects.create({ kind: 'PERSON', displayName: 'Jane Smith' });
  const raj = await h.subjects.create({ kind: 'PERSON', displayName: 'Raj Patel' });
  const dbs = await h.catalogue.createType('DBS', version({ detailedGroup: 'People', detailedSubGroup: 'Vetting' }), 'admin');
  const fire = await h.catalogue.createType(
    'Fire Training',
    version({ groupLevel2: 'Training', subGroup: 'Training', core: false, timeframeMonths: 12 }),
    'admin',
  );
  for (const subject of [jane, raj]) {
    for (const type of [dbs, fire]) {
      await h.requirements.assign({ subjectId: subject.id, complianceTypeId: type.complianceTypeId, activeFrom: '2025-01-01' }, 'admin');
    }
  }
  await h.evidence.record({ subjectId: jane.id, complianceTypeId: dbs.complianceTypeId, completionDate: '2024-03-01', dueDate: '2027-03-01', source: 'MANUAL' }, 'op');
  await h.evidence.record({ subjectId: raj.id, complianceTypeId: dbs.complianceTypeId, completionDate: '2023-01-01', dueDate: '2026-01-01', source: 'MANUAL' }, 'op');
  await h.evidence.record({ subjectId: jane.id, complianceTypeId: fire.complianceTypeId, completionDate: '2026-02-01', completionStatus: 'Completed', dueDate: '2027-02-01', source: 'IMPORT' }, 'op');
  return { jane, raj, dbs, fire };
}

describe('publishing', () => {
  it('calculates a draft with requirement statuses and scores for both hierarchies', async () => {
    const { jane, raj, dbs } = await seed();
    const run = await h.publishing.calculate(AS_OF, 'operator');
    expect(run).toMatchObject({
      asOf: AS_OF,
      status: 'DRAFT',
      policyVersion: 'excel-parity-1',
      counts: { requirements: 4, typeScores: 3, subGroupScores: 3, groupScores: 2 },
      warnings: [],
    });

    const statuses = await h.prisma.publishedRequirementStatus.findMany({ where: { runId: run.id, complianceTypeId: dbs.complianceTypeId } });
    const bySubject = new Map(statuses.map((s) => [s.subjectId, s]));
    expect(bySubject.get(jane.id)).toMatchObject({ compliant: true, compliance: 1, dueDateKind: 'DATE' });
    expect(bySubject.get(raj.id)).toMatchObject({ compliant: false, compliance: 0, weeksNonCompliant: 41 });

    const types = await h.prisma.publishedTypeScore.findMany({ where: { runId: run.id, hierarchy: 'PRIMARY' }, orderBy: { complianceType: 'asc' } });
    expect(types.map((t) => [t.complianceType, t.percentCompliant, t.rag])).toEqual([
      ['DBS', 0.5, 0],
      ['Fire Training', 0.5, 0],
    ]);
    const detailed = await h.prisma.publishedSubGroupScore.findMany({ where: { runId: run.id, hierarchy: 'DETAILED' } });
    expect(detailed).toEqual([expect.objectContaining({ group: 'People', subGroup: 'Vetting', percentCompliant: 0.5 })]);
  });

  it('needs a second person to publish, and only then shows in the reporting views', async () => {
    await seed();
    const run = await h.publishing.calculate(AS_OF, 'operator');
    expect(await h.prisma.$queryRaw`SELECT * FROM "reporting_group_score"`).toEqual([]);

    await expect(h.publishing.approve(run.id, 'operator')).rejects.toBeInstanceOf(ForbiddenError);
    const published = await h.publishing.approve(run.id, 'manager');
    expect(published).toMatchObject({ status: 'PUBLISHED', decidedBy: 'manager' });
    await expect(h.publishing.approve(run.id, 'manager')).rejects.toBeInstanceOf(ConflictError);
    expect((await h.publishing.latestPublished())?.id).toBe(run.id);

    const groups = await h.prisma.$queryRaw<{ group: string; as_of: Date }[]>`SELECT "group", "as_of" FROM "reporting_group_score" ORDER BY "group"`;
    expect(groups.map((g) => g.group)).toEqual(['People', 'Staff']);
    const statuses = await h.prisma.$queryRaw<{ subject_name: string }[]>`SELECT "subject_name" FROM "reporting_requirement_status" ORDER BY "subject_name"`;
    expect(statuses.map((s) => s.subject_name)).toEqual(['Jane Smith', 'Jane Smith', 'Raj Patel', 'Raj Patel']);
  });

  it('reproduces a past date after later corrections', async () => {
    const { raj, dbs } = await seed();
    const first = await h.publishing.calculate(AS_OF, 'operator');
    const [rajRecord] = await h.evidence.history(raj.id, dbs.complianceTypeId);
    await h.evidence.correct(rajRecord!.id, { completionDate: '2026-01-01', dueDate: '2029-01-01', source: 'MANUAL' }, 'Renewal missed', 'op');

    const today = new Date().toISOString().slice(0, 10);
    const now = await h.publishing.calculate(today, 'operator');
    const rajNow = await h.prisma.publishedRequirementStatus.findFirstOrThrow({ where: { runId: now.id, subjectId: raj.id, complianceTypeId: dbs.complianceTypeId } });
    expect(rajNow.compliant).toBe(true);

    const rajBefore = await h.prisma.publishedRequirementStatus.findFirstOrThrow({ where: { runId: first.id, subjectId: raj.id, complianceTypeId: dbs.complianceTypeId } });
    expect(rajBefore.compliant).toBe(false);
  });

  it('a discarded draft never reaches the reporting views', async () => {
    await seed();
    const run = await h.publishing.calculate(AS_OF, 'operator');
    expect(await h.publishing.discard(run.id, 'operator')).toMatchObject({ status: 'DISCARDED' });
    expect(await h.publishing.latestPublished()).toBeNull();
    await expect(h.publishing.approve(run.id, 'manager')).rejects.toBeInstanceOf(ConflictError);
  });

  it('enforces four eyes in the database too', async () => {
    await seed();
    const run = await h.publishing.calculate(AS_OF, 'operator');
    await expect(
      h.prisma.publishRun.update({ where: { id: run.id }, data: { status: 'PUBLISHED', decidedAt: new Date(), decidedBy: 'operator' } }),
    ).rejects.toThrow(/publish_run_four_eyes/);
  });
});
