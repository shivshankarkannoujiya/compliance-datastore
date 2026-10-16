import { Injectable } from '@nestjs/common';
import type { SubjectKind } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service';
import { normaliseName } from '../shared/numbers';

export interface SubjectView {
  id: string;
  kind: SubjectKind;
  displayName: string;
  externalRef: string | null;
  aliases: string[];
}

export interface CreateSubjectInput {
  kind: SubjectKind;
  displayName: string;
  externalRef?: string | null;
  /** Extra spellings used by legacy tools or source exports. The display name is always an alias. */
  aliases?: string[];
  aliasSource?: string;
}

/** Owns the subject register and name aliases. Replaces the Names tabs and their name-text keys. */
@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateSubjectInput): Promise<SubjectView> {
    const displayName = input.displayName.trim();
    if (displayName === '') {
      throw new ValidationError('displayName is required');
    }
    const aliases = uniqueByNormalised([displayName, ...(input.aliases ?? [])]);
    try {
      const subject = await this.prisma.subject.create({
        data: {
          kind: input.kind,
          displayName,
          externalRef: input.externalRef ?? null,
          aliases: { create: aliases.map((alias) => ({ alias, normalised: normaliseName(alias), source: input.aliasSource ?? null })) },
        },
        include: { aliases: true },
      });
      return toView(subject);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`A subject already uses the external reference or one of the names: ${aliases.join(', ')}`);
      }
      throw error;
    }
  }

  async addAlias(subjectId: string, alias: string, source?: string): Promise<SubjectView> {
    const normalised = normaliseName(alias);
    if (normalised === '') {
      throw new ValidationError('alias is required');
    }
    await this.get(subjectId);
    const existing = await this.prisma.subjectAlias.findUnique({ where: { normalised } });
    if (existing && existing.subjectId !== subjectId) {
      throw new ConflictError(`"${alias}" already belongs to another subject`);
    }
    if (!existing) {
      await this.prisma.subjectAlias.create({ data: { subjectId, alias: alias.trim(), normalised, source: source ?? null } });
    }
    return this.get(subjectId);
  }

  async get(id: string): Promise<SubjectView> {
    const subject = await this.prisma.subject.findUnique({ where: { id }, include: { aliases: true } });
    if (!subject) {
      throw new NotFoundError(`Subject ${id} not found`);
    }
    return toView(subject);
  }

  /** Finds the subject a name refers to, through any of its aliases. */
  async resolveByName(name: string): Promise<SubjectView | null> {
    const alias = await this.prisma.subjectAlias.findUnique({
      where: { normalised: normaliseName(name) },
      include: { subject: { include: { aliases: true } } },
    });
    return alias ? toView(alias.subject) : null;
  }
}

function uniqueByNormalised(names: string[]): string[] {
  const seen = new Map<string, string>();
  for (const name of names) {
    const key = normaliseName(name);
    if (key !== '' && !seen.has(key)) {
      seen.set(key, name.trim());
    }
  }
  return [...seen.values()];
}

function toView(subject: {
  id: string;
  kind: SubjectKind;
  displayName: string;
  externalRef: string | null;
  aliases: { alias: string }[];
}): SubjectView {
  return {
    id: subject.id,
    kind: subject.kind,
    displayName: subject.displayName,
    externalRef: subject.externalRef,
    aliases: subject.aliases.map((a) => a.alias).sort(),
  };
}
