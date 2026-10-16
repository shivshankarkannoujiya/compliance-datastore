import { Injectable } from '@nestjs/common';
import type { ComplianceRecord, RecordSource } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import {
  endOfDay,
  fromDbDateOrNull,
  isForeignKeyViolation,
  PrismaService,
  toDbDateOrNull,
  type Tx,
} from '../prisma/prisma.service';
import type { IsoDate } from '../shared/local-date';

export interface RecordInput {
  subjectId: string;
  complianceTypeId: string;
  completionDate?: IsoDate | null;
  completionStatus?: string | null;
  dueDate?: IsoDate | null;
  issue?: number | null;
  notes?: string | null;
  source: RecordSource;
  sourceRef?: string | null;
}

export type CorrectionInput = Omit<RecordInput, 'subjectId' | 'complianceTypeId'>;

export interface RecordView {
  id: string;
  recordedSeq: number;
  subjectId: string;
  complianceTypeId: string;
  completionDate: IsoDate | null;
  completionStatus: string | null;
  dueDate: IsoDate | null;
  issue: number | null;
  notes: string | null;
  source: RecordSource;
  sourceRef: string | null;
  recordedAt: Date;
  recordedBy: string;
  supersedesId: string | null;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
}

/**
 * Owns completion records. Records are only ever added: a mistake is voided with a reason, and a correction is a
 * new record that supersedes the voided one, in one transaction. A database trigger rejects any other update or
 * delete. Replaces the Compliance Data table and its overwrite and delete-and-replace habits.
 */
@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordInput, recordedBy: string): Promise<RecordView> {
    return this.create(this.prisma, input, recordedBy, null);
  }

  /** Voids the record and adds its replacement, keeping subject and type. */
  async correct(recordId: string, input: CorrectionInput, reason: string, by: string): Promise<RecordView> {
    requireReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const original = await lockOpenRecord(tx, recordId);
      await tx.complianceRecord.update({ where: { id: recordId }, data: { voidedAt: new Date(), voidedBy: by, voidReason: reason.trim() } });
      return this.create(
        tx,
        { ...input, subjectId: original.subjectId, complianceTypeId: original.complianceTypeId },
        by,
        recordId,
      );
    });
  }

  async void(recordId: string, reason: string, by: string): Promise<RecordView> {
    requireReason(reason);
    return this.prisma.$transaction(async (tx) => {
      await lockOpenRecord(tx, recordId);
      return toView(
        await tx.complianceRecord.update({ where: { id: recordId }, data: { voidedAt: new Date(), voidedBy: by, voidReason: reason.trim() } }),
      );
    });
  }

  async history(subjectId: string, complianceTypeId: string): Promise<RecordView[]> {
    const rows = await this.prisma.complianceRecord.findMany({
      where: { subjectId, complianceTypeId },
      orderBy: { recordedSeq: 'asc' },
    });
    return rows.map(toView);
  }

  /**
   * Records as they stood at the end of the as-of date: entered by then and not voided by then. Re-running a past
   * date therefore gives the same input even after later corrections.
   */
  async listAsOf(asOf: IsoDate): Promise<RecordView[]> {
    const cutoff = endOfDay(asOf);
    const rows = await this.prisma.complianceRecord.findMany({
      where: { recordedAt: { lt: cutoff }, OR: [{ voidedAt: null }, { voidedAt: { gte: cutoff } }] },
      orderBy: { recordedSeq: 'asc' },
    });
    return rows.map(toView);
  }

  private async create(db: PrismaService | Tx, input: RecordInput, recordedBy: string, supersedesId: string | null): Promise<RecordView> {
    if (input.issue !== undefined && input.issue !== null && !Number.isInteger(input.issue)) {
      throw new ValidationError('issue must be a whole number');
    }
    try {
      const created = await db.complianceRecord.create({
        data: {
          subjectId: input.subjectId,
          complianceTypeId: input.complianceTypeId,
          completionDate: toDbDateOrNull(input.completionDate),
          completionStatus: blankToNull(input.completionStatus),
          dueDate: toDbDateOrNull(input.dueDate),
          issue: input.issue ?? null,
          notes: blankToNull(input.notes),
          source: input.source,
          sourceRef: blankToNull(input.sourceRef),
          recordedBy,
          supersedesId,
        },
      });
      return toView(created);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new NotFoundError('Subject or compliance type not found');
      }
      throw error;
    }
  }
}

async function lockOpenRecord(tx: Tx, recordId: string): Promise<ComplianceRecord> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "compliance_record" WHERE "id" = ${recordId}::uuid FOR UPDATE`;
  if (locked.length === 0) {
    throw new NotFoundError(`Record ${recordId} not found`);
  }
  const record = await tx.complianceRecord.findUniqueOrThrow({ where: { id: recordId } });
  if (record.voidedAt !== null) {
    throw new ConflictError(`Record ${recordId} is already voided`);
  }
  return record;
}

function requireReason(reason: string): void {
  if (reason.trim() === '') {
    throw new ValidationError('A reason is required');
  }
}

function blankToNull(text: string | null | undefined): string | null {
  return text === null || text === undefined || text.trim() === '' ? null : text.trim();
}

function toView(row: ComplianceRecord): RecordView {
  return {
    id: row.id,
    recordedSeq: row.recordedSeq,
    subjectId: row.subjectId,
    complianceTypeId: row.complianceTypeId,
    completionDate: fromDbDateOrNull(row.completionDate),
    completionStatus: row.completionStatus,
    dueDate: fromDbDateOrNull(row.dueDate),
    issue: row.issue,
    notes: row.notes,
    source: row.source,
    sourceRef: row.sourceRef,
    recordedAt: row.recordedAt,
    recordedBy: row.recordedBy,
    supersedesId: row.supersedesId,
    voidedAt: row.voidedAt,
    voidedBy: row.voidedBy,
    voidReason: row.voidReason,
  };
}
