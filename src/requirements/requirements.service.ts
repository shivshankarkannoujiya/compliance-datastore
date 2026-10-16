import { Injectable } from '@nestjs/common';
import type { Requirement } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { fromDbDate, fromDbDateOrNull, isForeignKeyViolation, PrismaService, toDbDate } from '../prisma/prisma.service';
import type { IsoDate } from '../shared/local-date';

export interface AssignRequirementInput {
  subjectId: string;
  complianceTypeId: string;
  /** false keeps the row for reference but it never counts toward percentages ("Required (T/F)"). */
  required?: boolean;
  activeFrom: IsoDate;
  notes?: string | null;
}

export interface RequirementView {
  id: string;
  subjectId: string;
  complianceTypeId: string;
  required: boolean;
  activeFrom: IsoDate;
  activeTo: IsoDate | null;
  notes: string | null;
}

export interface RequirementAsOf extends RequirementView {
  /** Started on or before the as-of date and not yet ended: the workbook's Active flag. */
  active: boolean;
}

/** Owns who must hold which compliance type, and when. Replaces the Requirements tabs and the Active flag. */
@Injectable()
export class RequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Adds a requirement. A subject can have only one open requirement per type. */
  async assign(input: AssignRequirementInput, createdBy: string): Promise<RequirementView> {
    const activeFrom = toDbDate(input.activeFrom);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "subject" WHERE "id" = ${input.subjectId}::uuid FOR UPDATE`;
      const overlapping = await tx.requirement.findFirst({
        where: {
          subjectId: input.subjectId,
          complianceTypeId: input.complianceTypeId,
          OR: [{ activeTo: null }, { activeTo: { gt: activeFrom } }],
        },
      });
      if (overlapping) {
        throw new ConflictError(`The subject already has this requirement from ${fromDbDate(overlapping.activeFrom)}`);
      }
      try {
        const created = await tx.requirement.create({
          data: {
            subjectId: input.subjectId,
            complianceTypeId: input.complianceTypeId,
            required: input.required ?? true,
            activeFrom,
            notes: input.notes ?? null,
            createdBy,
          },
        });
        return toView(created);
      } catch (error) {
        if (isForeignKeyViolation(error)) {
          throw new NotFoundError('Subject or compliance type not found');
        }
        throw error;
      }
    });
  }

  /** Ends a requirement (for example when someone leaves). The row is kept for history. */
  async end(requirementId: string, activeTo: IsoDate): Promise<RequirementView> {
    const existing = await this.prisma.requirement.findUnique({ where: { id: requirementId } });
    if (!existing) {
      throw new NotFoundError(`Requirement ${requirementId} not found`);
    }
    if (existing.activeTo !== null) {
      throw new ConflictError(`Requirement ${requirementId} already ended on ${fromDbDate(existing.activeTo)}`);
    }
    const end = toDbDate(activeTo);
    if (end <= existing.activeFrom) {
      throw new ValidationError('activeTo must be after activeFrom');
    }
    return toView(await this.prisma.requirement.update({ where: { id: requirementId }, data: { activeTo: end } }));
  }

  /**
   * Every requirement that had started by the as-of date, flagged active or not. Ended requirements are kept,
   * as inactive rows are in the workbook (they do not count toward percentages but do weigh in threshold averages).
   */
  async listAsOf(asOf: IsoDate): Promise<RequirementAsOf[]> {
    const day = toDbDate(asOf);
    const rows = await this.prisma.requirement.findMany({
      where: { activeFrom: { lte: day } },
      orderBy: [{ subjectId: 'asc' }, { complianceTypeId: 'asc' }, { activeFrom: 'asc' }],
    });
    const latest = new Map<string, Requirement>();
    for (const row of rows) {
      latest.set(`${row.subjectId}:${row.complianceTypeId}`, row);
    }
    return [...latest.values()].map((row) => ({ ...toView(row), active: row.activeTo === null || row.activeTo > day }));
  }
}

function toView(row: Requirement): RequirementView {
  return {
    id: row.id,
    subjectId: row.subjectId,
    complianceTypeId: row.complianceTypeId,
    required: row.required,
    activeFrom: fromDbDate(row.activeFrom),
    activeTo: fromDbDateOrNull(row.activeTo),
    notes: row.notes,
  };
}
