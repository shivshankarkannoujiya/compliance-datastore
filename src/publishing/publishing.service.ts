import { Injectable } from '@nestjs/common';
import { Hierarchy, type Prisma, type PublishRun, type PublishStatus } from '@prisma/client';
import { CatalogueService, type CatalogueVersionView } from '../catalogue/catalogue.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../common/errors';
import type { CatalogueEntry, ComplianceRecord, ComplianceWarning, Requirement } from '../compliance-rules';
import { ComplianceScoringService } from '../compliance-scoring/compliance-scoring.module';
import { EvidenceService, type RecordView } from '../evidence/evidence.service';
import { fromDbDate, PrismaService, toDbDate, toDbDateOrNull } from '../prisma/prisma.service';
import { RequirementsService, type RequirementAsOf } from '../requirements/requirements.service';
import type { ScoreResult } from '../scoring';
import type { IsoDate } from '../shared/local-date';

export interface PublishRunView {
  id: string;
  asOf: IsoDate;
  policyVersion: string;
  status: PublishStatus;
  createdBy: string;
  createdAt: Date;
  decidedBy: string | null;
  decidedAt: Date | null;
  warnings: ComplianceWarning[];
  counts: { requirements: number; typeScores: number; subGroupScores: number; groupScores: number };
}

/**
 * Calculates every score as of a date into a draft run, then publishes it once a second person approves.
 * Reads subjects' requirements, the catalogue and the evidence only through their owning services.
 * Replaces the Last Updated table and the "save, refresh twice" routine.
 */
@Injectable()
export class PublishingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
    private readonly requirements: RequirementsService,
    private readonly evidence: EvidenceService,
    private readonly scoring: ComplianceScoringService,
  ) {}

  async calculate(asOf: IsoDate, createdBy: string): Promise<PublishRunView> {
    const [snapshot, requirementRows, recordRows] = await Promise.all([
      this.catalogue.snapshot(asOf),
      this.requirements.listAsOf(asOf),
      this.evidence.listAsOf(asOf),
    ]);
    const input = buildInputs(snapshot.versions, requirementRows, recordRows);
    const primary = this.scoring.score({ asOf, catalogue: snapshot.primary, requirements: input.requirements, records: input.records });
    const detailed = this.scoring.score({
      asOf,
      catalogue: snapshot.detailed,
      requirements: input.requirements.filter((r) => snapshot.detailed.some((d) => sameType(d, r.complianceType))),
      records: input.records,
    });
    const warnings = [...input.warnings, ...primary.warnings];

    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.publishRun.create({
        data: {
          asOf: toDbDate(asOf),
          policyVersion: primary.policyVersion,
          createdBy,
          warnings: warnings as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.publishedRequirementStatus.createMany({
        data: primary.requirements.map((status) => {
          const source = input.requirementSource.get(status.requirement)!;
          return {
            runId: created.id,
            requirementId: source.id,
            subjectId: source.subjectId,
            complianceTypeId: source.complianceTypeId,
            recordId: status.evaluated?.record.id ?? null,
            compliant: status.compliant,
            dueDateKind: status.dueDate.kind,
            dueDate: status.dueDate.kind === 'DATE' ? toDbDateOrNull(status.dueDate.date) : null,
            completionStatus: status.completionStatus,
            compliance: status.compliance,
            complianceCore: status.complianceCore,
            expiry: status.evaluated?.expiry ?? null,
            weeksNonCompliant: status.evaluated?.weeksNonCompliant ?? null,
          };
        }),
      });
      for (const [hierarchy, result] of [
        [Hierarchy.PRIMARY, primary],
        [Hierarchy.DETAILED, detailed],
      ] as const) {
        await writeScores(tx, created.id, hierarchy, result);
      }
      return created;
    });
    return this.get(run.id);
  }

  /** Publishes a draft. The approver must not be the person who calculated it. */
  async approve(runId: string, approvedBy: string): Promise<PublishRunView> {
    return this.decide(runId, approvedBy, 'PUBLISHED');
  }

  async discard(runId: string, discardedBy: string): Promise<PublishRunView> {
    return this.decide(runId, discardedBy, 'DISCARDED');
  }

  async get(runId: string): Promise<PublishRunView> {
    const run = await this.prisma.publishRun.findUnique({ where: { id: runId }, include: countsInclude });
    if (!run) {
      throw new NotFoundError(`Publish run ${runId} not found`);
    }
    return toView(run);
  }

  async latestPublished(): Promise<PublishRunView | null> {
    const run = await this.prisma.publishRun.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { decidedAt: 'desc' },
      include: countsInclude,
    });
    return run ? toView(run) : null;
  }

  private async decide(runId: string, by: string, status: 'PUBLISHED' | 'DISCARDED'): Promise<PublishRunView> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: PublishStatus; created_by: string }[]>`
        SELECT "status", "created_by" FROM "publish_run" WHERE "id" = ${runId}::uuid FOR UPDATE`;
      const run = locked[0];
      if (!run) {
        throw new NotFoundError(`Publish run ${runId} not found`);
      }
      if (run.status !== 'DRAFT') {
        throw new ConflictError(`Publish run ${runId} is already ${run.status.toLowerCase()}`);
      }
      if (status === 'PUBLISHED' && run.created_by === by) {
        throw new ForbiddenError('A run must be approved by someone other than the person who calculated it');
      }
      await tx.publishRun.update({ where: { id: runId }, data: { status, decidedAt: new Date(), decidedBy: by } });
    });
    return this.get(runId);
  }
}

interface BuiltInputs {
  requirements: Requirement[];
  records: ComplianceRecord[];
  requirementSource: Map<Requirement, RequirementAsOf>;
  warnings: ComplianceWarning[];
}

/** Maps stored rows to the rules engine's shapes; the catalogue version supplies each record's Level 1/2 groups. */
function buildInputs(
  versions: readonly CatalogueVersionView[],
  requirementRows: readonly RequirementAsOf[],
  recordRows: readonly RecordView[],
): BuiltInputs {
  const versionByType = new Map(versions.map((v) => [v.complianceTypeId, v]));
  const warnings: ComplianceWarning[] = [];
  const requirementSource = new Map<Requirement, RequirementAsOf>();
  const requirements: Requirement[] = [];
  for (const row of requirementRows) {
    const version = versionByType.get(row.complianceTypeId);
    const requirement: Requirement = {
      subjectId: row.subjectId,
      // An unknown id makes the engine drop the row with an UNKNOWN_COMPLIANCE_TYPE warning.
      complianceType: version?.complianceType ?? `unknown:${row.complianceTypeId}`,
      required: row.required,
      active: row.active,
    };
    requirementSource.set(requirement, row);
    requirements.push(requirement);
  }
  const records: ComplianceRecord[] = [];
  for (const row of recordRows) {
    const version = versionByType.get(row.complianceTypeId);
    if (!version) {
      warnings.push({ code: 'UNKNOWN_COMPLIANCE_TYPE', subjectId: row.subjectId, complianceType: `unknown:${row.complianceTypeId}` });
      continue;
    }
    records.push({
      id: row.id,
      subjectId: row.subjectId,
      complianceType: version.complianceType,
      groupLevel1: version.groupLevel1,
      groupLevel2: version.groupLevel2,
      completionDate: row.completionDate,
      completionStatus: row.completionStatus,
      dueDate: row.dueDate,
      issue: row.issue,
      recordedSeq: row.recordedSeq,
      notes: row.notes,
    });
  }
  return { requirements, records, requirementSource, warnings };
}

async function writeScores(tx: Prisma.TransactionClient, runId: string, hierarchy: Hierarchy, result: ScoreResult): Promise<void> {
  await tx.publishedTypeScore.createMany({
    data: result.types.map((t) => ({
      runId,
      hierarchy,
      group: t.group,
      subGroup: t.subGroup,
      complianceType: t.complianceType,
      percentCompliant: t.percentCompliant,
      percentCompliantCore: t.percentCompliantCore,
      rag: t.rag,
      ragCore: t.ragCore,
    })),
  });
  await tx.publishedSubGroupScore.createMany({
    data: result.subGroups.map((s) => ({
      runId,
      hierarchy,
      group: s.group,
      subGroup: s.subGroup,
      percentCompliant: s.percentCompliant,
      percentCompliantCore: s.percentCompliantCore,
      rag: s.rag,
      ragCore: s.ragCore,
    })),
  });
  await tx.publishedGroupScore.createMany({
    data: result.groups.map((g) => ({
      runId,
      hierarchy,
      group: g.group,
      percentCompliant: g.percentCompliant,
      percentCompliantCore: g.percentCompliantCore,
      rag: g.rag,
      ragCore: g.ragCore,
    })),
  });
}

function sameType(entry: CatalogueEntry, complianceType: string): boolean {
  return entry.complianceType.trim().toLowerCase() === complianceType.trim().toLowerCase();
}

const countsInclude = {
  _count: { select: { requirementStatuses: true, typeScores: true, subGroupScores: true, groupScores: true } },
} as const;

function toView(
  run: PublishRun & { _count: { requirementStatuses: number; typeScores: number; subGroupScores: number; groupScores: number } },
): PublishRunView {
  return {
    id: run.id,
    asOf: fromDbDate(run.asOf),
    policyVersion: run.policyVersion,
    status: run.status,
    createdBy: run.createdBy,
    createdAt: run.createdAt,
    decidedBy: run.decidedBy,
    decidedAt: run.decidedAt,
    warnings: run.warnings as unknown as ComplianceWarning[],
    counts: {
      requirements: run._count.requirementStatuses,
      typeScores: run._count.typeScores,
      subGroupScores: run._count.subGroupScores,
      groupScores: run._count.groupScores,
    },
  };
}
