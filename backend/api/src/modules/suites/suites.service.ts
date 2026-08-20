import { Injectable } from '@nestjs/common';
import { Prisma } from '@app/storage';

import { AppError, invariant } from '../../common/errors.js';
import { limits, optionalText, text } from '../../common/validation.js';
import { withTransactionRetry } from '../../common/transaction-retry.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import type { UpdateTestSuiteInput } from '../../generated/graphql.js';
import { TenantService } from '../workspaces/tenant.service.js';

type SuiteNode = Awaited<ReturnType<PrismaService['client']['testSuite']['findFirst']>> & {
  children: SuiteNode[];
};

@Injectable()
export class SuitesService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  public async get(userId: string, id: string) {
    const suite = await this.prisma.client.testSuite.findFirst({
      where: { id, project: { workspace: { members: { some: { userId } } } } },
    });
    if (!suite) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    return { ...suite, children: [] };
  }

  public async tree(userId: string, projectId: string): Promise<SuiteNode[]> {
    await this.tenant.project(userId, projectId);
    const rows = await this.prisma.client.testSuite.findMany({
      where: { projectId },
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
    await this.tenant.project(userId, suite.projectId, true);
    const data: Prisma.TestSuiteUpdateInput = {};
    if (input.title !== undefined && input.title !== null)
      data.title = text(input.title, 'title', limits.title);
    if (input.description !== undefined)
      data.description = optionalText(input.description, 'description');
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
            where: { id: suiteId, project: { workspace: { members: { some: { userId } } } } },
          });
          if (!suite) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
          await transaction.$queryRaw`SELECT id FROM projects WHERE id = ${suite.projectId}::uuid FOR UPDATE`;
          await this.tenant.project(userId, suite.projectId, true, transaction);
          if (parentId === suite.id)
            throw new AppError('SUITE_CYCLE', 'A suite cannot be its own parent');
          const all = await transaction.testSuite.findMany({
            where: { projectId: suite.projectId },
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
          });
          if (parentId) {
            invariant(
              all.some((candidate) => candidate.id === parentId),
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

  public async delete(userId: string, id: string): Promise<boolean> {
    const suite = await this.get(userId, id);
    await this.tenant.project(userId, suite.projectId, true);
    return this.prisma.client.$transaction(async (transaction) => {
      const [children, cases] = await Promise.all([
        transaction.testSuite.count({ where: { parentId: id } }),
        transaction.testCase.count({ where: { suiteId: id } }),
      ]);
      if (children > 0 || cases > 0)
        throw new AppError('SUITE_NOT_EMPTY', 'Suite must be empty before deletion');
      await transaction.testSuite.delete({ where: { id } });
      const siblings = await transaction.testSuite.findMany({
        where: { projectId: suite.projectId, parentId: suite.parentId },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      });
      await this.reindex(transaction, siblings);
      return true;
    });
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
        where: { id: cursor, projectId },
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
