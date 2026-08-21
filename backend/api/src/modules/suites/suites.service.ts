import { Injectable } from '@nestjs/common';
import { Prisma } from '@app/storage';

import { AppError, invariant } from '../../common/errors.js';
import { limits, optionalText, text } from '../../common/validation.js';
import { withTransactionRetry } from '../../common/transaction-retry.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import type { UpdateTestSuiteInput } from '../../generated/graphql.js';
import { TenantService } from '../workspaces/tenant.service.js';
import { PlanSyncService } from '../plans/plan-sync.service.js';

type SuiteNode = Awaited<ReturnType<PrismaService['client']['testSuite']['findFirst']>> & {
  children: SuiteNode[];
};

function suiteText(value: string | null | undefined, field: string): string | null | undefined {
  if (value === undefined || value === null || value.trim() === '')
    return value === undefined ? undefined : null;
  return optionalText(value, field);
}

@Injectable()
export class SuitesService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly sync: PlanSyncService,
  ) {}

  public async get(userId: string, id: string) {
    const suite = await this.prisma.client.testSuite.findFirst({
      where: { id, project: { workspace: { members: { some: { userId } } } } },
    });
    if (!suite) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    return { ...suite, children: [] };
  }

  public async tree(userId: string, projectId: string): Promise<SuiteNode[]> {
    return this.treeWithArchive(userId, projectId, false);
  }

  public async treeWithArchive(
    userId: string,
    projectId: string,
    includeArchived: boolean,
  ): Promise<SuiteNode[]> {
    await this.tenant.project(userId, projectId);
    const rows = await this.prisma.client.testSuite.findMany({
      where: { projectId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    const nodes = new Map<string, SuiteNode>();
    for (const row of rows) nodes.set(row.id, { ...row, children: [] });
    const roots: SuiteNode[] = [];
    for (const row of rows) {
      const node = nodes.get(row.id);
      if (!node) continue;
      if (row.parentId) nodes.get(row.parentId)?.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  public create(
    userId: string,
    projectId: string,
    parentId: string | null | undefined,
    titleInput: string,
    description: string | null | undefined,
    preconditions: string | null | undefined,
    postconditions: string | null | undefined,
    requestedPosition: number | null | undefined,
  ) {
    return withTransactionRetry(() =>
      this.prisma.client.$transaction(
        async (transaction) => {
          await transaction.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
          await this.tenant.project(userId, projectId, true, transaction);
          if (parentId) await this.assertParent(transaction, projectId, parentId);
          const siblings = await transaction.testSuite.findMany({
            where: { projectId, parentId: parentId ?? null },
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
          });
          const position = requestedPosition ?? siblings.length;
          invariant(
            position >= 0 && position <= siblings.length,
            'VALIDATION_ERROR',
            'Request validation failed',
            { position: 'Position is outside the sibling list' },
          );
          await this.reindex(transaction, siblings, undefined, position);
          return transaction.testSuite.create({
            data: {
              projectId,
              parentId: parentId ?? null,
              title: text(titleInput, 'title', limits.title),
              description: optionalText(description, 'description'),
              preconditions: suiteText(preconditions, 'preconditions'),
              postconditions: suiteText(postconditions, 'postconditions'),
              position,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  public async update(userId: string, id: string, input: UpdateTestSuiteInput) {
    const suite = await this.get(userId, id);
    if (suite.archivedAt) throw new AppError('VALIDATION_ERROR', 'Archived suite is read-only');
    await this.tenant.project(userId, suite.projectId, true);
    const data: Prisma.TestSuiteUpdateInput = {};
    if (input.title !== undefined && input.title !== null)
      data.title = text(input.title, 'title', limits.title);
    if (input.description !== undefined)
      data.description = optionalText(input.description, 'description');
    if (input.preconditions !== undefined)
      data.preconditions = suiteText(input.preconditions, 'preconditions');
    if (input.postconditions !== undefined)
      data.postconditions = suiteText(input.postconditions, 'postconditions');
    return this.prisma.client.testSuite.update({ where: { id }, data });
  }

  public async move(
    userId: string,
    suiteId: string,
    parentId: string | null | undefined,
    position: number,
  ) {
    invariant(position >= 0, 'VALIDATION_ERROR', 'Request validation failed', {
      position: 'Position must be non-negative',
    });
    return withTransactionRetry(() =>
      this.prisma.client.$transaction(
        async (transaction) => {
          const suite = await transaction.testSuite.findFirst({
            where: {
              id: suiteId,
              archivedAt: null,
              project: { workspace: { members: { some: { userId } } } },
            },
          });
          if (!suite) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
          await transaction.$queryRaw`SELECT id FROM projects WHERE id = ${suite.projectId}::uuid FOR UPDATE`;
          await this.tenant.project(userId, suite.projectId, true, transaction);
          if (parentId === suite.id)
            throw new AppError('SUITE_CYCLE', 'A suite cannot be its own parent');
          const all = await transaction.testSuite.findMany({
            where: { projectId: suite.projectId, archivedAt: null },
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
          });
          if (parentId) {
            invariant(
              all.some((candidate) => candidate.id === parentId && candidate.archivedAt === null),
              'RESOURCE_NOT_FOUND',
              'Resource not found',
            );
            let cursor: string | null = parentId;
            let depth = 1;
            while (cursor) {
              if (cursor === suite.id)
                throw new AppError('SUITE_CYCLE', 'Suite move would create a cycle');
              cursor = all.find((candidate) => candidate.id === cursor)?.parentId ?? null;
              depth += 1;
              if (depth > limits.suiteDepth)
                throw new AppError('VALIDATION_ERROR', 'Request validation failed', {
                  parentId: `Suite depth cannot exceed ${limits.suiteDepth}`,
                });
            }
          }
          const source = all.filter(
            (candidate) => candidate.parentId === suite.parentId && candidate.id !== suite.id,
          );
          const sameParent = (suite.parentId ?? null) === (parentId ?? null);
          const destination = sameParent
            ? source
            : all.filter((candidate) => candidate.parentId === (parentId ?? null));
          invariant(
            position <= destination.length,
            'VALIDATION_ERROR',
            'Request validation failed',
            { position: 'Position is outside the sibling list' },
          );
          const impacted = sameParent
            ? [...destination, suite]
            : [...source, ...destination, suite];
          await transaction.testSuite.updateMany({
            where: { id: { in: impacted.map((item) => item.id) } },
            data: { position: { increment: 100_000 } },
          });
          if (!sameParent) {
            for (const [index, item] of source.entries())
              await transaction.testSuite.update({
                where: { id: item.id },
                data: { position: index },
              });
          }
          destination.splice(position, 0, suite);
          for (const [index, item] of destination.entries()) {
            await transaction.testSuite.update({
              where: { id: item.id },
              data: { parentId: parentId ?? null, position: index },
            });
          }
          return transaction.testSuite.findUniqueOrThrow({ where: { id: suite.id } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  public async archivePreview(userId: string, id: string) {
    const suite = await this.get(userId, id);
    if (suite.archivedAt) return { suiteCount: 0, caseCount: 0, affectedPlans: [] };
    return this.prisma.client.$transaction(async (transaction) => {
      const descendants = await this.descendantIds(transaction, suite.projectId, id);
      const caseIds = await transaction.testCase.findMany({
        where: { projectId: suite.projectId, suiteId: { in: descendants }, archivedAt: null },
        select: { id: true },
      });
      return {
        suiteCount: descendants.length,
        caseCount: caseIds.length,
        affectedPlans: await this.sync.impactedPlans(
          transaction,
          suite.projectId,
          caseIds.map((item) => item.id),
        ),
      };
    });
  }

  public async archive(userId: string, id: string) {
    const suite = await this.get(userId, id);
    await this.tenant.project(userId, suite.projectId, true);
    return this.prisma.client.$transaction(async (transaction) => {
      const current = await transaction.testSuite.findFirst({
        where: { id, projectId: suite.projectId, archivedAt: null },
      });
      if (!current) return { ...suite, children: [] };
      await transaction.$queryRaw`SELECT id FROM projects WHERE id = ${suite.projectId}::uuid FOR UPDATE`;
      const suiteIds = await this.descendantIds(transaction, suite.projectId, id);
      const caseRows = await transaction.testCase.findMany({
        where: { projectId: suite.projectId, suiteId: { in: suiteIds }, archivedAt: null },
        select: { id: true },
      });
      const archivedAt = new Date();
      const operation = await transaction.archiveOperation.create({
        data: { projectId: suite.projectId, kind: 'SUITE' },
      });
      await transaction.testSuite.updateMany({
        where: { projectId: suite.projectId, id: { in: suiteIds } },
        data: { archivedAt, archiveOperationId: operation.id },
      });
      await transaction.testCase.updateMany({
        where: { projectId: suite.projectId, id: { in: caseRows.map((item) => item.id) } },
        data: { archivedAt, archiveOperationId: operation.id },
      });
      await this.sync.archiveCaseLinks(
        transaction,
        suite.projectId,
        caseRows.map((item) => item.id),
        archivedAt,
      );
      await transaction.testPlanSourceSuite.deleteMany({
        where: { projectId: suite.projectId, testSuiteId: { in: suiteIds } },
      });
      return { ...current, archivedAt, archiveOperationId: operation.id, children: [] };
    });
  }

  public async restore(userId: string, id: string) {
    const suite = await this.get(userId, id);
    await this.tenant.project(userId, suite.projectId, true);
    return this.prisma.client.$transaction(async (transaction) => {
      const current = await transaction.testSuite.findFirst({
        where: { id, projectId: suite.projectId, archivedAt: { not: null } },
      });
      if (!current?.archiveOperationId)
        throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
      const operation = await transaction.archiveOperation.findFirst({
        where: { id: current.archiveOperationId, projectId: suite.projectId, kind: 'SUITE' },
      });
      if (!operation) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
      if (current.parentId) {
        const parent = await transaction.testSuite.findFirst({
          where: { id: current.parentId, projectId: suite.projectId },
          select: { archivedAt: true, archiveOperationId: true },
        });
        if (parent?.archivedAt && parent.archiveOperationId !== operation.id)
          throw new AppError('SUITE_ARCHIVED', 'Suite is archived');
      }
      const archived = await transaction.testSuite.findMany({
        where: { projectId: suite.projectId, archiveOperationId: operation.id },
      });
      const ids = new Set(archived.map((item) => item.id));
      const root = archived.find((item) => !item.parentId || !ids.has(item.parentId)) ?? current;
      await transaction.testSuite.updateMany({
        where: { projectId: suite.projectId, archiveOperationId: operation.id },
        data: { archivedAt: null, archiveOperationId: null },
      });
      await transaction.testCase.updateMany({
        where: { projectId: suite.projectId, archiveOperationId: operation.id },
        data: { archivedAt: null, archiveOperationId: null },
      });
      const maxPosition = await transaction.testSuite.aggregate({
        where: { projectId: suite.projectId, parentId: root.parentId },
        _max: { position: true },
      });
      await transaction.testSuite.update({
        where: { id: root.id },
        data: { position: (maxPosition._max.position ?? -1) + 1 },
      });
      return { ...current, archivedAt: null, archiveOperationId: null, children: [] };
    });
  }

  private async descendantIds(
    transaction: Prisma.TransactionClient,
    projectId: string,
    rootId: string,
  ): Promise<string[]> {
    const rows = await transaction.testSuite.findMany({
      where: { projectId, archivedAt: null },
      select: { id: true, parentId: true },
    });
    const result: string[] = [];
    const visit = (id: string) => {
      result.push(id);
      for (const child of rows.filter((row) => row.parentId === id)) visit(child.id);
    };
    visit(rootId);
    return result;
  }

  private async assertParent(
    transaction: Prisma.TransactionClient,
    projectId: string,
    parentId: string,
  ): Promise<void> {
    let cursor: string | null = parentId;
    let depth = 0;
    while (cursor) {
      const parent: { parentId: string | null } | null = await transaction.testSuite.findFirst({
        where: { id: cursor, projectId, archivedAt: null },
        select: { parentId: true },
      });
      if (!parent) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
      cursor = parent.parentId;
      depth += 1;
      invariant(depth < limits.suiteDepth, 'VALIDATION_ERROR', 'Request validation failed', {
        parentId: `Suite depth cannot exceed ${limits.suiteDepth}`,
      });
    }
  }

  private async reindex(
    transaction: Prisma.TransactionClient,
    rows: Array<{ id: string }>,
    excludedId?: string,
    gap?: number,
  ): Promise<void> {
    if (rows.length === 0) return;
    await transaction.testSuite.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { position: { increment: 100_000 } },
    });
    let next = 0;
    for (const row of rows) {
      if (row.id === excludedId) continue;
      if (next === gap) next += 1;
      await transaction.testSuite.update({ where: { id: row.id }, data: { position: next } });
      next += 1;
    }
  }
}
