import { Injectable } from '@nestjs/common';
import { Prisma, type ComplianceTypeVersion } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import type { CatalogueEntry } from '../compliance-rules';
import { fromDbDate, fromDbDateOrNull, isUniqueViolation, PrismaService, toDbDate } from '../prisma/prisma.service';
import type { IsoDate } from '../shared/local-date';
import { normaliseName } from '../shared/numbers';

export type Thresholds = [number, number, number, number, number];

export interface VersionInput {
  validFrom: IsoDate;
  groupLevel1: string;
  groupLevel2: string;
  group: string;
  subGroup: string;
  detailedGroup?: string | null;
  detailedSubGroup?: string | null;
  core: boolean;
  /** null: never expires. */
  timeframeMonths: number | null;
  thresholds: Thresholds;
}

export interface CatalogueVersionView extends Required<VersionInput> {
  complianceTypeId: string;
  complianceType: string;
  version: number;
  validTo: IsoDate | null;
}

/** Catalogue as of a date, ready for the rules engine. */
export interface CatalogueSnapshot {
  versions: CatalogueVersionView[];
  /** Compliance Group 1/2 hierarchy. */
  primary: CatalogueEntry[];
  /** Compliance Group 3/4 hierarchy; only types that have one. */
  detailed: CatalogueEntry[];
}

/**
 * Owns compliance types and their versioned settings. Replaces each tool's Compliance Timeframes table. A change
 * never edits a version: it closes the open one and opens the next, so past scores stay reproducible.
 */
@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  async createType(name: string, first: VersionInput, createdBy: string): Promise<CatalogueVersionView> {
    const trimmed = name.trim();
    if (trimmed === '') {
      throw new ValidationError('name is required');
    }
    const data = versionData(first);
    try {
      const type = await this.prisma.complianceType.create({
        data: { name: trimmed, code: normaliseName(trimmed), versions: { create: { ...data, version: 1, createdBy } } },
        include: { versions: true },
      });
      return toView(type.name, type.versions[0]!);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`Compliance type "${trimmed}" already exists`);
      }
      throw error;
    }
  }

  /** Opens a new version from `validFrom`, closing the current one on that date. */
  async addVersion(complianceTypeId: string, input: VersionInput, createdBy: string): Promise<CatalogueVersionView> {
    const data = versionData(input);
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ name: string }[]>`
        SELECT "name" FROM "compliance_type" WHERE "id" = ${complianceTypeId}::uuid FOR UPDATE`;
      if (locked.length === 0) {
        throw new NotFoundError(`Compliance type ${complianceTypeId} not found`);
      }
      const open = await tx.complianceTypeVersion.findFirst({ where: { complianceTypeId, validTo: null } });
      const last = await tx.complianceTypeVersion.findFirst({ where: { complianceTypeId }, orderBy: { version: 'desc' } });
      if (open) {
        if (data.validFrom <= open.validFrom) {
          throw new ValidationError(`validFrom must be after the current version's start (${fromDbDate(open.validFrom)})`);
        }
        await tx.complianceTypeVersion.update({ where: { id: open.id }, data: { validTo: data.validFrom } });
      }
      const created = await tx.complianceTypeVersion.create({
        data: { ...data, complianceTypeId, version: (last?.version ?? 0) + 1, createdBy },
      });
      return toView(locked[0]!.name, created);
    });
  }

  async findTypeByName(name: string): Promise<{ id: string; name: string } | null> {
    return this.prisma.complianceType.findUnique({ where: { code: normaliseName(name) }, select: { id: true, name: true } });
  }

  async snapshot(asOf: IsoDate): Promise<CatalogueSnapshot> {
    const day = toDbDate(asOf);
    const rows = await this.prisma.complianceTypeVersion.findMany({
      where: { validFrom: { lte: day }, OR: [{ validTo: null }, { validTo: { gt: day } }] },
      include: { complianceType: { select: { name: true } } },
      orderBy: { complianceType: { name: 'asc' } },
    });
    const versions = rows.map((r) => toView(r.complianceType.name, r));
    const entry = (v: CatalogueVersionView, group: string, subGroup: string): CatalogueEntry => ({
      complianceType: v.complianceType,
      group,
      subGroup,
      core: v.core,
      thresholds: v.thresholds,
    });
    return {
      versions,
      primary: versions.map((v) => entry(v, v.group, v.subGroup)),
      detailed: versions
        .filter((v) => v.detailedGroup !== null && v.detailedSubGroup !== null)
        .map((v) => entry(v, v.detailedGroup!, v.detailedSubGroup!)),
    };
  }
}

function versionData(input: VersionInput) {
  const thresholds = input.thresholds;
  if (thresholds.length !== 5 || thresholds.some((t) => !Number.isFinite(t) || t < 0 || t > 1)) {
    throw new ValidationError('thresholds must be five numbers between 0 and 1');
  }
  if (thresholds.some((t, i) => i > 0 && t > thresholds[i - 1]!)) {
    throw new ValidationError('thresholds must not increase from Threshold 1 to Threshold 5');
  }
  if (input.timeframeMonths !== null && (!Number.isInteger(input.timeframeMonths) || input.timeframeMonths <= 0)) {
    throw new ValidationError('timeframeMonths must be a positive whole number or null');
  }
  if ((input.detailedGroup ?? null) === null !== ((input.detailedSubGroup ?? null) === null)) {
    throw new ValidationError('detailedGroup and detailedSubGroup must be set together');
  }
  for (const [field, value] of Object.entries({ groupLevel1: input.groupLevel1, groupLevel2: input.groupLevel2, group: input.group, subGroup: input.subGroup })) {
    if (value.trim() === '') {
      throw new ValidationError(`${field} is required`);
    }
  }
  return {
    validFrom: toDbDate(input.validFrom),
    groupLevel1: input.groupLevel1.trim(),
    groupLevel2: input.groupLevel2.trim(),
    group: input.group.trim(),
    subGroup: input.subGroup.trim(),
    detailedGroup: input.detailedGroup?.trim() ?? null,
    detailedSubGroup: input.detailedSubGroup?.trim() ?? null,
    core: input.core,
    timeframeMonths: input.timeframeMonths,
    threshold1: new Prisma.Decimal(thresholds[0]),
    threshold2: new Prisma.Decimal(thresholds[1]),
    threshold3: new Prisma.Decimal(thresholds[2]),
    threshold4: new Prisma.Decimal(thresholds[3]),
    threshold5: new Prisma.Decimal(thresholds[4]),
  };
}

function toView(name: string, v: ComplianceTypeVersion): CatalogueVersionView {
  return {
    complianceTypeId: v.complianceTypeId,
    complianceType: name,
    version: v.version,
    validFrom: fromDbDate(v.validFrom),
    validTo: fromDbDateOrNull(v.validTo),
    groupLevel1: v.groupLevel1,
    groupLevel2: v.groupLevel2,
    group: v.group,
    subGroup: v.subGroup,
    detailedGroup: v.detailedGroup,
    detailedSubGroup: v.detailedSubGroup,
    core: v.core,
    timeframeMonths: v.timeframeMonths,
    thresholds: [v.threshold1, v.threshold2, v.threshold3, v.threshold4, v.threshold5].map((d) => d.toNumber()) as Thresholds,
  };
}
