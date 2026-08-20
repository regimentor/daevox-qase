import { Injectable } from '@nestjs/common';
import { Prisma } from '@app/storage';

import { AppError, invariant } from '../../common/errors.js';
import { limits, optionalText, page, text, uniqueIds } from '../../common/validation.js';
import type { UpdateTestPlanInput } from '../../generated/graphql.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { TenantService } from '../workspaces/tenant.service.js';
import { PlanSyncService } from './plan-sync.service.js';

const planInclude = {
  cases: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    include: {
      testCase: {
        include: {
          project: { select: { code: true } },
          steps: { orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }] },
          tags: { include: { tag: true } },
        },
      },
      sources: { select: { sourceSuiteId: true } },
    },
  },
  sourceSuites: {
    orderBy: [{ position: 'asc' as const }, { testSuiteId: 'asc' as const }],
    include: { testSuite: true },
  },
};

type RawPlan = Prisma.TestPlanGetPayload<{ include: typeof planInclude }>;

function shapePlan(plan: RawPlan) {
  const active = plan.cases.filter(
    (link) => link.archivedAt === null && link.testCase.archivedAt === null,
  );
  return {
    ...plan,
    cases: undefined,
    sourceSuites: plan.sourceSuites.map(({ testSuite }) =>
      Object.assign({}, testSuite, { children: [] }),
    ),
    manualCaseIds: active.filter((link) => link.manual).map((link) => link.testCase.id),
    testCases: active.map(({ testCase }) => ({
      ...testCase,
      displayId: `${testCase.project.code}-${String(testCase.caseNumber)}`,
      tags: testCase.tags.map(({ tag }) => tag),
    })),
    activeCaseCount: active.length,
    archivedCaseCount: plan.cases.length - active.length,
  };
}

@Injectable()
export class PlansService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly sync: PlanSyncService,
  ) {}

  public async get(userId: string, id: string) {
    const plan = await this.prisma.client.testPlan.findFirst({
      where: { id, project: { workspace: { members: { some: { userId } } } } },
      include: planInclude,
    });
    if (!plan) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    return shapePlan(plan);
  }

  public async list(
    userId: string,
    projectId: string,
    pagination?: { limit?: number | null; offset?: number | null } | null,
  ) {
    await this.tenant.project(userId, projectId);
    const { limit, offset } = page(pagination);
    const where = { projectId };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.testPlan.findMany({
        where,
        include: planInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.client.testPlan.count({ where }),
    ]);
    return { items: rows.map(shapePlan), pageInfo: { limit, offset, total } };
  }

  public async create(
    userId: string,
    projectId: string,
    titleInput: string,
    description: string | null | undefined,
    testCaseIds: string[],
    sourceSuiteIds: string[] = [],
  ) {
    uniqueIds(testCaseIds, 'testCaseIds', limits.cases);
    uniqueIds(sourceSuiteIds, 'sourceSuiteIds', limits.cases);
    return this.prisma.client.$transaction(async (transaction) => {
      await this.tenant.project(userId, projectId, true, transaction);
      const source = await this.sync.sourceCaseIds(transaction, projectId, sourceSuiteIds);
      await this.validateCases(transaction, projectId, testCaseIds);
      const orderedIds = [...source.orderedCaseIds];
      for (const id of testCaseIds) if (!orderedIds.includes(id)) orderedIds.push(id);
      invariant(
        orderedIds.length <= limits.cases,
        'VALIDATION_ERROR',
        'Request validation failed',
        {
          testCaseIds: `A plan accepts at most ${limits.cases} cases`,
        },
      );
      const sourceByCase = new Map<string, string[]>();
      for (const [sourceSuiteId, ids] of source.casesBySource)
        for (const id of ids)
          sourceByCase.set(id, [...(sourceByCase.get(id) ?? []), sourceSuiteId]);
      const plan = await transaction.testPlan.create({
        data: {
          projectId,
          title: text(titleInput, 'title', limits.title),
          description: optionalText(description, 'description'),
          createdBy: userId,
        },
      });
      if (sourceSuiteIds.length)
        await transaction.testPlanSourceSuite.createMany({
          data: [...source.casesBySource.keys()].map((sourceSuiteId, position) => ({
            projectId,
            testPlanId: plan.id,
            testSuiteId: sourceSuiteId,
            position,
          })),
        });
      if (orderedIds.length)
        await transaction.testPlanCase.createMany({
          data: orderedIds.map((testCaseId, position) => ({
            projectId,
            testPlanId: plan.id,
            testCaseId,
            position,
            manual: !sourceByCase.has(testCaseId) || testCaseIds.includes(testCaseId),
          })),
        });
      for (const [testCaseId, sourceIds] of sourceByCase)
        await transaction.testPlanCaseSource.createMany({
          data: sourceIds.map((sourceSuiteId) => ({
            projectId,
            testPlanId: plan.id,
            testCaseId,
            sourceSuiteId,
          })),
        });
      return shapePlan(
        await transaction.testPlan.findUniqueOrThrow({
          where: { id: plan.id },
          include: planInclude,
        }),
      );
    });
  }

  public async update(userId: string, id: string, input: UpdateTestPlanInput) {
    const plan = await this.get(userId, id);
    await this.tenant.project(userId, plan.projectId, true);
    const data: Prisma.TestPlanUpdateInput = {};
    if (input.title !== undefined && input.title !== null)
      data.title = text(input.title, 'title', limits.title);
    if (input.description !== undefined)
      data.description = optionalText(input.description, 'description');
    await this.prisma.client.testPlan.update({ where: { id }, data });
    return this.get(userId, id);
  }

  public async replaceCases(userId: string, id: string, testCaseIds: string[]) {
    uniqueIds(testCaseIds, 'testCaseIds', limits.cases);
    return this.prisma.client.$transaction(async (transaction) => {
      const plan = await this.authorizedPlan(transaction, userId, id, true);
      await this.validateCases(transaction, plan.projectId, testCaseIds);
      const current = await transaction.testPlanCase.findMany({
        where: { testPlanId: id, archivedAt: null },
        include: { sources: true },
      });
      const sourceBackedIds = new Set(
        current.filter((link) => link.sources.length > 0).map((link) => link.testCaseId),
      );
      const desiredCaseCount = new Set([...sourceBackedIds, ...testCaseIds]).size;
      invariant(desiredCaseCount <= limits.cases, 'VALIDATION_ERROR', 'Request validation failed', {
        testCaseIds: `A plan accepts at most ${limits.cases} cases`,
      });
      for (const link of current) {
        const keepManual = testCaseIds.includes(link.testCaseId);
        if (keepManual) {
          await transaction.testPlanCase.update({ where: { id: link.id }, data: { manual: true } });
        } else if (link.sources.length === 0) {
          await transaction.testPlanCase.delete({ where: { id: link.id } });
        } else {
          await transaction.testPlanCase.update({
            where: { id: link.id },
            data: { manual: false },
          });
        }
      }
      const existing = new Set(current.map((link) => link.testCaseId));
      const max = await transaction.testPlanCase.aggregate({
        where: { testPlanId: id },
        _max: { position: true },
      });
      let position = (max._max.position ?? -1) + 1;
      for (const testCaseId of testCaseIds) {
        if (existing.has(testCaseId)) continue;
        await transaction.testPlanCase.create({
          data: { projectId: plan.projectId, testPlanId: id, testCaseId, position, manual: true },
        });
        position += 1;
      }
      await this.reorderCases(transaction, id, testCaseIds);
      return this.load(transaction, id);
    });
  }

  public async replaceSources(
    userId: string,
    id: string,
    sourceSuiteIds: string[],
    manualTestCaseIds: string[],
    orderedTestCaseIds: string[],
  ) {
    uniqueIds(sourceSuiteIds, 'sourceSuiteIds', limits.cases);
    uniqueIds(manualTestCaseIds, 'manualTestCaseIds', limits.cases);
    uniqueIds(orderedTestCaseIds, 'orderedTestCaseIds', limits.cases);
    return this.prisma.client.$transaction(async (transaction) => {
      const plan = await this.authorizedPlan(transaction, userId, id, true);
      await this.validateCases(transaction, plan.projectId, manualTestCaseIds);
      const source = await this.sync.sourceCaseIds(transaction, plan.projectId, sourceSuiteIds);
      const desiredCaseCount = new Set([...source.orderedCaseIds, ...manualTestCaseIds]).size;
      invariant(desiredCaseCount <= limits.cases, 'VALIDATION_ERROR', 'Request validation failed', {
        testCaseIds: `A plan accepts at most ${limits.cases} cases`,
      });
      await transaction.testPlanSourceSuite.deleteMany({
        where: { testPlanId: id, testSuiteId: { notIn: sourceSuiteIds } },
      });
      for (const [position, testSuiteId] of [...source.casesBySource.keys()].entries())
        await transaction.testPlanSourceSuite.upsert({
          where: { testPlanId_testSuiteId: { testPlanId: id, testSuiteId } },
          create: { projectId: plan.projectId, testPlanId: id, testSuiteId, position },
          update: { position },
        });
      const current = await transaction.testPlanCase.findMany({
        where: { testPlanId: id, archivedAt: null },
        include: { sources: true },
      });
      const desired = new Map<string, string[]>();
      for (const [sourceSuiteId, caseIds] of source.casesBySource)
        for (const testCaseId of caseIds)
          desired.set(testCaseId, [...(desired.get(testCaseId) ?? []), sourceSuiteId]);
      for (const link of current) {
        const sources = desired.get(link.testCaseId) ?? [];
        const manual = manualTestCaseIds.includes(link.testCaseId);
        if (link.manual !== manual)
          await transaction.testPlanCase.update({ where: { id: link.id }, data: { manual } });
        await transaction.testPlanCaseSource.deleteMany({
          where: { testPlanId: id, testCaseId: link.testCaseId, sourceSuiteId: { notIn: sources } },
        });
        if (!manual && sources.length === 0)
          await transaction.testPlanCase.delete({ where: { id: link.id } });
      }
      const max = await transaction.testPlanCase.aggregate({
        where: { testPlanId: id },
        _max: { position: true },
      });
      let position = (max._max.position ?? -1) + 1;
      for (const testCaseId of source.orderedCaseIds) {
        let link = await transaction.testPlanCase.findFirst({
          where: { testPlanId: id, testCaseId, archivedAt: null },
          include: { sources: true },
        });
        if (!link) {
          await transaction.testPlanCase.deleteMany({ where: { testPlanId: id, testCaseId } });
          link = await transaction.testPlanCase.create({
            data: {
              projectId: plan.projectId,
              testPlanId: id,
              testCaseId,
              position,
              manual: false,
            },
            include: { sources: true },
          });
          position += 1;
        }
        const existing = new Set(link.sources.map((item) => item.sourceSuiteId));
        for (const sourceSuiteId of desired.get(testCaseId) ?? []) {
          if (existing.has(sourceSuiteId)) continue;
          await transaction.testPlanCaseSource.create({
            data: { projectId: plan.projectId, testPlanId: id, testCaseId, sourceSuiteId },
          });
        }
      }
      const existingActiveIds = new Set(
        (
          await transaction.testPlanCase.findMany({
            where: { testPlanId: id, archivedAt: null },
            select: { testCaseId: true },
          })
        ).map((link) => link.testCaseId),
      );
      const manualMax = await transaction.testPlanCase.aggregate({
        where: { testPlanId: id },
        _max: { position: true },
      });
      let manualPosition = (manualMax._max.position ?? -1) + 1;
      for (const testCaseId of manualTestCaseIds) {
        if (existingActiveIds.has(testCaseId)) continue;
        await transaction.testPlanCase.deleteMany({ where: { testPlanId: id, testCaseId } });
        await transaction.testPlanCase.create({
          data: {
            projectId: plan.projectId,
            testPlanId: id,
            testCaseId,
            position: manualPosition,
            manual: true,
          },
        });
        manualPosition += 1;
      }
      const active = await transaction.testPlanCase.findMany({
        where: { testPlanId: id, archivedAt: null },
        select: { testCaseId: true },
      });
      const activeIds = new Set(active.map((link) => link.testCaseId));
      const requestedOrder: string[] = [];
      const requestedIds = new Set<string>();
      for (const testCaseId of [
        ...orderedTestCaseIds,
        ...source.orderedCaseIds,
        ...manualTestCaseIds,
      ]) {
        if (requestedIds.has(testCaseId)) continue;
        requestedIds.add(testCaseId);
        requestedOrder.push(testCaseId);
      }
      await this.reorderCases(
        transaction,
        id,
        requestedOrder.filter((testCaseId) => activeIds.has(testCaseId)),
      );
      const updated = await transaction.testPlanCase.findMany({
        where: { testPlanId: id, archivedAt: null },
        select: { testCaseId: true },
      });
      const updatedIds = new Set(updated.map((link) => link.testCaseId));
      const addedCaseCount = [...updatedIds].filter(
        (caseId) => !current.some((link) => link.testCaseId === caseId),
      ).length;
      const removedCaseCount = current.filter((link) => !updatedIds.has(link.testCaseId)).length;
      return {
        testPlan: await this.load(transaction, id),
        addedCaseCount,
        removedCaseCount,
        affectedPlans:
          addedCaseCount || removedCaseCount
            ? [{ planId: id, title: plan.title, addedCaseCount, removedCaseCount }]
            : [],
      };
    });
  }

  public async sourcePreview(userId: string, id: string, sourceSuiteIds: string[]) {
    uniqueIds(sourceSuiteIds, 'sourceSuiteIds', limits.cases);
    return this.prisma.client.$transaction(async (transaction) => {
      await this.authorizedPlan(transaction, userId, id, false);
      const proposed = new Set(sourceSuiteIds);
      const links = await transaction.testPlanCase.findMany({
        where: { testPlanId: id, archivedAt: null },
        include: { sources: true },
      });
      const removedCaseCount = links.filter(
        (link) =>
          !link.manual && link.sources.every((source) => !proposed.has(source.sourceSuiteId)),
      ).length;
      return { removedCaseCount };
    });
  }

  public async delete(userId: string, id: string): Promise<boolean> {
    const plan = await this.get(userId, id);
    await this.tenant.project(userId, plan.projectId, true);
    const used = await this.prisma.client.testRun.count({ where: { testPlanId: id } });
    invariant(used === 0, 'CONFLICT', 'Plan used by a run cannot be deleted');
    await this.prisma.client.testPlan.delete({ where: { id } });
    return true;
  }

  private async authorizedPlan(
    transaction: Prisma.TransactionClient,
    userId: string,
    id: string,
    writable: boolean,
  ) {
    const plan = await transaction.testPlan.findFirst({
      where: { id, project: { workspace: { members: { some: { userId } } } } },
    });
    if (!plan) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    await this.tenant.project(userId, plan.projectId, writable, transaction);
    return plan;
  }

  private async validateCases(
    transaction: Prisma.TransactionClient,
    projectId: string,
    ids: string[],
  ): Promise<void> {
    const count = await transaction.testCase.count({
      where: { id: { in: ids }, projectId, archivedAt: null },
    });
    invariant(count === ids.length, 'VALIDATION_ERROR', 'Request validation failed', {
      testCaseIds: 'Cases must exist, be active, and belong to the project',
    });
  }

  private async load(transaction: Prisma.TransactionClient, id: string) {
    return shapePlan(
      await transaction.testPlan.findUniqueOrThrow({ where: { id }, include: planInclude }),
    );
  }

  private async reorderCases(
    transaction: Prisma.TransactionClient,
    id: string,
    requestedOrder: string[],
  ): Promise<void> {
    const links = await transaction.testPlanCase.findMany({
      where: { testPlanId: id, archivedAt: null },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true, testCaseId: true, position: true },
    });
    if (!links.length) return;
    const byCaseId = new Map(links.map((link) => [link.testCaseId, link]));
    const requestedIds = new Set(requestedOrder);
    const orderedIds = [
      ...requestedOrder.filter((testCaseId) => byCaseId.has(testCaseId)),
      ...links.filter((link) => !requestedIds.has(link.testCaseId)).map((link) => link.testCaseId),
    ];
    const positions = links.map((link) => link.position);
    const max = await transaction.testPlanCase.aggregate({
      where: { testPlanId: id },
      _max: { position: true },
    });
    const offset = (max._max.position ?? -1) + links.length + 1;
    await transaction.testPlanCase.updateMany({
      where: { testPlanId: id, archivedAt: null },
      data: { position: { increment: offset } },
    });
    for (const [index, testCaseId] of orderedIds.entries()) {
      const link = byCaseId.get(testCaseId);
      if (!link) continue;
      await transaction.testPlanCase.update({
        where: { id: link.id },
        data: { position: positions[index] },
      });
    }
  }
}
