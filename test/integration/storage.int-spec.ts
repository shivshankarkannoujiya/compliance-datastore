import { ConflictError, NotFoundError, ValidationError } from '../../src';
import { createHarness, version, type Harness } from './harness';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => h.reset());

describe('subjects', () => {
  it('resolves a subject by any alias, ignoring case and spacing', async () => {
    const jane = await h.subjects.create({ kind: 'PERSON', displayName: 'Jane Smith', aliases: ['Dr Jane Smith', 'jane  smith'] });
    expect(jane.aliases).toEqual(['Dr Jane Smith', 'Jane Smith']);
    expect((await h.subjects.resolveByName('  DR JANE   SMITH '))?.id).toBe(jane.id);
    expect(await h.subjects.resolveByName('John Smith')).toBeNull();
  });

  it('refuses a name that already belongs to another subject', async () => {
    await h.subjects.create({ kind: 'PERSON', displayName: 'Jane Smith' });
    const other = await h.subjects.create({ kind: 'PERSON', displayName: 'Janet Smith' });
    await expect(h.subjects.create({ kind: 'PERSON', displayName: 'jane smith' })).rejects.toBeInstanceOf(ConflictError);
    await expect(h.subjects.addAlias(other.id, 'Jane Smith')).rejects.toBeInstanceOf(ConflictError);
    expect((await h.subjects.addAlias(other.id, 'J. Smith')).aliases).toContain('J. Smith');
  });
});

describe('catalogue', () => {
  it('versions settings: a new version closes the previous one and snapshots pick the right one', async () => {
    const v1 = await h.catalogue.createType('DBS', version({ validFrom: '2025-01-01' }), 'admin');
    const v2 = await h.catalogue.addVersion(v1.complianceTypeId, version({ validFrom: '2026-04-01', core: false }), 'admin');
    expect(v2).toMatchObject({ version: 2, validFrom: '2026-04-01', validTo: null, core: false });

    const before = await h.catalogue.snapshot('2026-03-31');
    expect(before.versions).toEqual([expect.objectContaining({ version: 1, validTo: '2026-04-01', core: true })]);
    const after = await h.catalogue.snapshot('2026-04-01');
    expect(after.versions).toEqual([expect.objectContaining({ version: 2 })]);
    expect(await h.catalogue.snapshot('2024-12-31')).toMatchObject({ versions: [] });
  });

  it('keeps the detailed hierarchy only for types that have one (DS-10)', async () => {
    await h.catalogue.createType('DBS', version({ detailedGroup: 'People', detailedSubGroup: 'Vetting' }), 'admin');
    await h.catalogue.createType('Complications audit', version({ group: 'Clinical', subGroup: 'Complications' }), 'admin');
    const snapshot = await h.catalogue.snapshot('2026-01-01');
    expect(snapshot.primary.map((e) => e.complianceType)).toEqual(['Complications audit', 'DBS']);
    expect(snapshot.detailed).toEqual([expect.objectContaining({ complianceType: 'DBS', group: 'People', subGroup: 'Vetting' })]);
  });

  it('validates input and rejects duplicates and backdated versions', async () => {
    await expect(h.catalogue.createType('DBS', version({ thresholds: [0.9, 1, 0.8, 0.7, 0.6] }), 'admin')).rejects.toBeInstanceOf(ValidationError);
    await expect(h.catalogue.createType('DBS', version({ timeframeMonths: 0 }), 'admin')).rejects.toBeInstanceOf(ValidationError);
    const v1 = await h.catalogue.createType('DBS', version(), 'admin');
    await expect(h.catalogue.createType(' dbs ', version(), 'admin')).rejects.toBeInstanceOf(ConflictError);
    await expect(h.catalogue.addVersion(v1.complianceTypeId, version({ validFrom: '2025-01-01' }), 'admin')).rejects.toBeInstanceOf(ValidationError);
    await expect(h.catalogue.addVersion('00000000-0000-0000-0000-000000000000', version(), 'admin')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('enforces one open version per type in the database', async () => {
    const v1 = await h.catalogue.createType('DBS', version(), 'admin');
    await expect(
      h.prisma.complianceTypeVersion.create({
        data: {
          complianceTypeId: v1.complianceTypeId,
          version: 2,
          validFrom: new Date('2026-01-01'),
          groupLevel1: 'Staff',
          groupLevel2: 'Staff',
          group: 'Staff',
          subGroup: 'Checks',
          core: true,
          threshold1: 1,
          threshold2: 0.9,
          threshold3: 0.8,
          threshold4: 0.7,
          threshold5: 0.6,
          createdBy: 'admin',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('requirements', () => {
  async function setup() {
    const subject = await h.subjects.create({ kind: 'PERSON', displayName: 'Jane Smith' });
    const type = await h.catalogue.createType('DBS', version(), 'admin');
    return { subjectId: subject.id, complianceTypeId: type.complianceTypeId };
  }

  it('allows one open requirement per subject and type, and ends it without deleting', async () => {
    const ids = await setup();
    const req = await h.requirements.assign({ ...ids, activeFrom: '2025-01-01' }, 'admin');
    await expect(h.requirements.assign({ ...ids, activeFrom: '2025-06-01' }, 'admin')).rejects.toBeInstanceOf(ConflictError);
    await expect(h.requirements.end(req.id, '2025-01-01')).rejects.toBeInstanceOf(ValidationError);
    await h.requirements.end(req.id, '2026-03-01');
    await expect(h.requirements.end(req.id, '2026-04-01')).rejects.toBeInstanceOf(ConflictError);

    expect(await h.requirements.listAsOf('2024-12-31')).toEqual([]);
    expect(await h.requirements.listAsOf('2026-02-28')).toEqual([expect.objectContaining({ id: req.id, active: true })]);
    expect(await h.requirements.listAsOf('2026-03-01')).toEqual([expect.objectContaining({ id: req.id, active: false })]);

    const again = await h.requirements.assign({ ...ids, activeFrom: '2026-06-01' }, 'admin');
    expect(await h.requirements.listAsOf('2026-07-01')).toEqual([expect.objectContaining({ id: again.id, active: true })]);
  });

  it('reports unknown subjects or types as not found', async () => {
    const ids = await setup();
    await expect(
      h.requirements.assign({ ...ids, complianceTypeId: '00000000-0000-0000-0000-000000000000', activeFrom: '2025-01-01' }, 'admin'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('evidence', () => {
  async function setup() {
    const subject = await h.subjects.create({ kind: 'PERSON', displayName: 'Jane Smith' });
    const type = await h.catalogue.createType('DBS', version(), 'admin');
    return { subjectId: subject.id, complianceTypeId: type.complianceTypeId };
  }

  it('corrects by voiding and superseding, keeping the full history', async () => {
    const ids = await setup();
    const original = await h.evidence.record({ ...ids, completionDate: '2026-06-01', dueDate: '2029-06-01', source: 'MANUAL' }, 'operator');
    const fixed = await h.evidence.correct(original.id, { completionDate: '2026-05-01', dueDate: '2029-05-01', source: 'MANUAL' }, 'Typed the wrong month', 'operator');

    expect(fixed).toMatchObject({ supersedesId: original.id, completionDate: '2026-05-01', subjectId: ids.subjectId });
    expect(fixed.recordedSeq).toBeGreaterThan(original.recordedSeq);
    const history = await h.evidence.history(ids.subjectId, ids.complianceTypeId);
    expect(history.map((r) => [r.id, r.voidReason])).toEqual([
      [original.id, 'Typed the wrong month'],
      [fixed.id, null],
    ]);
    await expect(h.evidence.correct(original.id, { source: 'MANUAL' }, 'again', 'operator')).rejects.toBeInstanceOf(ConflictError);
    await expect(h.evidence.void(fixed.id, '  ', 'operator')).rejects.toBeInstanceOf(ValidationError);
  });

  it('is append-only in the database: no edits, no deletes, no second void', async () => {
    const ids = await setup();
    const rec = await h.evidence.record({ ...ids, dueDate: '2027-01-01', source: 'MANUAL' }, 'operator');
    await expect(h.prisma.complianceRecord.update({ where: { id: rec.id }, data: { dueDate: new Date('2028-01-01') } })).rejects.toThrow(/append-only/);
    await expect(h.prisma.complianceRecord.delete({ where: { id: rec.id } })).rejects.toThrow(/append-only/);
    await h.evidence.void(rec.id, 'Duplicate import', 'operator');
    await expect(
      h.prisma.complianceRecord.update({ where: { id: rec.id }, data: { voidReason: 'changed' } }),
    ).rejects.toThrow(/already voided/);
  });

  it('lists records as they stood on a date', async () => {
    const ids = await setup();
    const rec = await h.evidence.record({ ...ids, dueDate: '2027-01-01', source: 'MANUAL' }, 'operator');
    await h.prisma.$executeRaw`ALTER TABLE "compliance_record" DISABLE TRIGGER "compliance_record_append_only"`;
    await h.prisma.$executeRaw`UPDATE "compliance_record" SET "recorded_at" = '2026-01-10T12:00:00Z' WHERE "id" = ${rec.id}::uuid`;
    await h.prisma.$executeRaw`ALTER TABLE "compliance_record" ENABLE TRIGGER "compliance_record_append_only"`;
    await h.evidence.void(rec.id, 'Wrong person', 'operator');

    expect(await h.evidence.listAsOf('2026-01-09')).toEqual([]);
    expect((await h.evidence.listAsOf('2026-01-10')).map((r) => r.id)).toEqual([rec.id]);
    const today = new Date().toISOString().slice(0, 10);
    expect(await h.evidence.listAsOf(today)).toEqual([]);
  });

  it('rejects unknown subjects and invalid values', async () => {
    const ids = await setup();
    await expect(h.evidence.record({ ...ids, subjectId: '00000000-0000-0000-0000-000000000000', source: 'MANUAL' }, 'op')).rejects.toBeInstanceOf(NotFoundError);
    await expect(h.evidence.record({ ...ids, issue: 9.5, source: 'MANUAL' }, 'op')).rejects.toBeInstanceOf(ValidationError);
    await expect(h.evidence.record({ ...ids, dueDate: '2026-02-30', source: 'MANUAL' }, 'op')).rejects.toBeInstanceOf(ValidationError);
  });
});
