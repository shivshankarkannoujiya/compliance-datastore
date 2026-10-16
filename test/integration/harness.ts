import { Test } from '@nestjs/testing';
import {
  CatalogueService,
  ComplianceDatastoreModule,
  EvidenceService,
  PrismaService,
  PublishingService,
  RequirementsService,
  SubjectsService,
  type VersionInput,
} from '../../src';

export async function createHarness() {
  const moduleRef = await Test.createTestingModule({ imports: [ComplianceDatastoreModule] }).compile();
  await moduleRef.init();
  const prisma = moduleRef.get(PrismaService);
  return {
    moduleRef,
    prisma,
    subjects: moduleRef.get(SubjectsService),
    catalogue: moduleRef.get(CatalogueService),
    requirements: moduleRef.get(RequirementsService),
    evidence: moduleRef.get(EvidenceService),
    publishing: moduleRef.get(PublishingService),
    /** TRUNCATE skips row triggers, so it clears the append-only evidence table too. */
    async reset() {
      await prisma.$executeRawUnsafe(`TRUNCATE "published_requirement_status", "published_type_score", "published_sub_group_score",
        "published_group_score", "publish_run", "compliance_record", "requirement", "compliance_type_version", "compliance_type",
        "subject_alias", "subject" RESTART IDENTITY CASCADE`);
    },
    close: () => moduleRef.close(),
  };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

export function version(overrides: Partial<VersionInput> = {}): VersionInput {
  return {
    validFrom: '2025-01-01',
    groupLevel1: 'Staff',
    groupLevel2: 'Staff Compliance',
    group: 'Staff',
    subGroup: 'Checks',
    core: true,
    timeframeMonths: 36,
    thresholds: [1, 0.9, 0.8, 0.7, 0.6],
    ...overrides,
  };
}
