import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { toDayNumber, type IsoDate } from '../shared/local-date';
import { ValidationError } from '../common/errors';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Transaction-scoped client, passed explicitly so nested work cannot use a different connection. */
export type Tx = Prisma.TransactionClient;

/** ISO date → value for a `@db.Date` column (UTC midnight). */
export function toDbDate(date: IsoDate): Date {
  try {
    toDayNumber(date);
  } catch (error) {
    throw new ValidationError((error as Error).message);
  }
  return new Date(`${date}T00:00:00.000Z`);
}

export function toDbDateOrNull(date: IsoDate | null | undefined): Date | null {
  return date === null || date === undefined ? null : toDbDate(date);
}

/** `@db.Date` column value → ISO date. */
export function fromDbDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function fromDbDateOrNull(date: Date | null): IsoDate | null {
  return date === null ? null : fromDbDate(date);
}

/** Start of the day after `date`, for "on or before this date" comparisons with timestamps. */
export function endOfDay(date: IsoDate): Date {
  const next = toDbDate(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}
