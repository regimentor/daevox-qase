import { Injectable } from '@nestjs/common';
import { Prisma, TestRunStatus } from '@app/storage';

import { AppError, invariant } from '../../common/errors.js';
import { limits, page, text, uniqueIds } from '../../common/validation.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import type { CreateTestRunInput, UpdateTestRunInput } from '../../generated/graphql.js';
import { TenantService } from '../workspaces/tenant.service.js';

const runInclude = {
  project: { select: { code: true } },
  cases: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    include: {
      steps: { orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }] },
      results: { orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }], take: 1 },
    },
  },
};

function shapeRun<
  T extends {
    project: { code: string };
    cases: Array<{ caseNumber: number; results: Array<{ status: string }> }>;
  },
>(run: T) {
  return {
    ...run,
    cases: run.cases.map((runCase) => ({
      ...runCase,
      displayId: `${run.project.code}-${String(runCase.caseNumber)}`,
      currentStatus: runCase.results[0]?.status ?? 'UNTESTED',
    })),
  };
}

@Injectable()
export class RunsService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  public async get(userId: string, id: string) {
    const run = await this.prisma.client.testRun.findFirst({
      where: { id, project: { workspace: { members: { some: { userId } } } } },
      include: runInclude,
    });
    if (!run) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    return shapeRun(run);
  }

  public async runCase(userId: string, id: string) {
    const row = await this.prisma.client.testRunCase.findFirst({
      where: { id, testRun: { project: { workspace: { members: { some: { userId } } } } } },
      include: {
        testRun: { include: { project: { select: { code: true } } } },
        steps: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
        results: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
      },
    });
    if (!row) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    return {
      ...row,
      displayId: `${row.testRun.project.code}-${String(row.caseNumber)}`,
      currentStatus: row.results[0]?.status ?? 'UNTESTED',
    };
  }

  public async list(
    userId: string,
    projectId: string,
    status: TestRunStatus | null | undefined,
    pagination?: { limit?: number | null; offset?: number | null } | null,
  ) {
    await this.tenant.project(userId, projectId);
    const { limit, offset } = page(pagination);
    const where = { projectId, ...(status ? { status } : {}) };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.testRun.findMany({
        where,
        include: runInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.client.testRun.count({ where }),
    ]);
    return { items: rows.map(shapeRun), pageInfo: { limit, offset, total } };
  }

  public create(userId: string, input: CreateTestRunInput) {
    const explicit = input.testCaseIds;
    const hasPlan = input.testPlanId !== undefined && input.testPlanId !== null;
    const hasExplicit = explicit !== undefined && explicit !== null;
    if (hasPlan === hasExplicit || (hasExplicit && explicit.length === 0))
      throw new AppError('RUN_SOURCE_INVALID', 'Exactly one non-empty run source is required');
    if (explicit) uniqueIds(explicit, 'testCaseIds', limits.cases);
    return this.prisma.client.$transaction(
      async (transaction) => {
        const project = await this.tenant.project(userId, input.projectId, true, transaction);
        if (input.environmentId) {
          const count = await transaction.environment.count({
            where: { id: input.environmentId, projectId: input.projectId },
          });
          invariant(count === 1, 'RESOURCE_NOT_FOUND', 'Resource not found');
        }
        if (input.defaultAssigneeId)
          await this.tenant.member(project.workspaceId, input.defaultAssigneeId, transaction);
        let orderedIds: string[];
        if (input.testPlanId) {
          const plan = await transaction.testPlan.findFirst({
            where: { id: input.testPlanId, projectId: input.projectId },
            include: {
              cases: {
                where: { archivedAt: null, testCase: { archivedAt: null } },
                orderBy: [{ position: 'asc' }, { id: 'asc' }],
              },
            },
          });
          if (!plan) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
          orderedIds = plan.cases.map((item) => item.testCaseId);
        } else {
          orderedIds = explicit ?? [];
        }
        if (orderedIds.length) {
          await transaction.$queryRaw`SELECT id FROM test_cases WHERE id IN (${Prisma.join(orderedIds)}) FOR SHARE`;
        }
        const cases = await transaction.testCase.findMany({
          where: { id: { in: orderedIds }, projectId: input.projectId, archivedAt: null },
          include: { steps: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
        });
        invariant(
          cases.length === orderedIds.length,
          'VALIDATION_ERROR',
          'Request validation failed',
          { testCaseIds: 'Cases must exist, be active, and belong to the project' },
        );
        const byId = new Map(cases.map((testCase) => [testCase.id, testCase]));
        const run = await transaction.testRun.create({
          data: {
            projectId: input.projectId,
            testPlanId: input.testPlanId ?? null,
            environmentId: input.environmentId ?? null,
            title: text(input.title, 'title', limits.title),
            createdBy: userId,
          },
        });
        for (const [position, sourceId] of orderedIds.entries()) {
          const source = byId.get(sourceId);
          invariant(source, 'VALIDATION_ERROR', 'Request validation failed');
          const snapshot = await transaction.testRunCase.create({
            data: {
              testRunId: run.id,
              projectId: input.projectId,
              sourceTestCaseId: source.id,
              assigneeId: input.defaultAssigneeId ?? source.assigneeId,
              caseNumber: source.caseNumber,
              title: source.title,
              description: source.description,
              preconditions: source.preconditions,
              postconditions: source.postconditions,
              priority: source.priority,
              severity: source.severity,
              type: source.type,
              automationStatus: source.automationStatus,
              estimatedDurationSeconds: source.estimatedDurationSeconds,
              position,
            },
          });
          if (source.steps.length) {
            await transaction.testRunCaseStep.createMany({
              data: source.steps.map((step) => ({
                testRunCaseId: snapshot.id,
                sourceTestStepId: step.id,
                position: step.position,
                action: step.action,
                testData: step.testData,
                expectedResult: step.expectedResult,
              })),
            });
          }
        }
        return shapeRun(
          await transaction.testRun.findUniqueOrThrow({
            where: { id: run.id },
            include: runInclude,
          }),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  public async update(userId: string, id: string, input: UpdateTestRunInput) {
    const run = await this.get(userId, id);
    await this.tenant.project(userId, run.projectId, true);
    if (run.status !== TestRunStatus.DRAFT)
      throw new AppError('RUN_STATE_INVALID', 'Only a draft run can be updated');
    if (input.environmentId) {
      const count = await this.prisma.client.environment.count({
        where: { id: input.environmentId, projectId: run.projectId },
      });
      invariant(count === 1, 'RESOURCE_NOT_FOUND', 'Resource not found');
    }
    const data: Prisma.TestRunUncheckedUpdateManyInput = {};
    if (input.title !== undefined && input.title !== null)
      data.title = text(input.title, 'title', limits.title);
    if (input.environmentId !== undefined) data.environmentId = input.environmentId;
    const changed = await this.prisma.client.testRun.updateMany({
      where: { id, status: TestRunStatus.DRAFT },
      data,
    });
    if (changed.count !== 1)
      throw new AppError('RUN_STATE_INVALID', 'Run state changed concurrently');
    return this.get(userId, id);
  }

  public start(userId: string, id: string) {
    return this.transition(userId, id, TestRunStatus.DRAFT, TestRunStatus.IN_PROGRESS);
  }

  public complete(userId: string, id: string) {
    return this.transition(userId, id, TestRunStatus.IN_PROGRESS, TestRunStatus.COMPLETED);
  }

  public async delete(userId: string, id: string): Promise<boolean> {
    const run = await this.get(userId, id);
    await this.tenant.project(userId, run.projectId, true);
    const deleted = await this.prisma.client.testRun.deleteMany({
      where: { id, status: TestRunStatus.DRAFT },
    });
    if (deleted.count !== 1)
      throw new AppError('RUN_DELETE_FORBIDDEN', 'Only a draft run can be deleted');
    return true;
  }

  public async updateAssignee(
    userId: string,
    runCaseId: string,
    assigneeId: string | null | undefined,
  ) {
    const runCase = await this.runCase(userId, runCaseId);
    const run = await this.get(userId, runCase.testRunId);
    if (run.status === TestRunStatus.COMPLETED)
      throw new AppError('RUN_STATE_INVALID', 'Completed run is read-only');
    const project = await this.tenant.project(userId, run.projectId, true);
    if (assigneeId) await this.tenant.member(project.workspaceId, assigneeId);
    await this.prisma.client.testRunCase.update({
      where: { id: runCaseId },
      data: { assigneeId: assigneeId ?? null },
    });
    return this.runCase(userId, runCaseId);
  }

  public assign(
    userId: string,
    runId: string,
    assigneeId: string | null | undefined,
    runCaseIds: string[] | null | undefined,
  ) {
    const ids = runCaseIds ?? [];
    uniqueIds(ids, 'runCaseIds', limits.cases);
    return this.prisma.client.$transaction(async (transaction) => {
      const run = await transaction.testRun.findFirst({
        where: { id: runId, project: { workspace: { members: { some: { userId } } } } },
        include: { project: true },
      });
      if (!run) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
      await this.tenant.project(userId, run.projectId, true, transaction);
      if (run.status === TestRunStatus.COMPLETED)
        throw new AppError('RUN_STATE_INVALID', 'Completed run is read-only');
      if (assigneeId) await this.tenant.member(run.project.workspaceId, assigneeId, transaction);
      if (ids.length) {
        const count = await transaction.testRunCase.count({
          where: { id: { in: ids }, testRunId: runId },
        });
        invariant(count === ids.length, 'RESOURCE_NOT_FOUND', 'Resource not found');
      }
      await transaction.testRunCase.updateMany({
        where: { testRunId: runId, ...(ids.length ? { id: { in: ids } } : {}) },
        data: { assigneeId: assigneeId ?? null },
      });
      return shapeRun(
        await transaction.testRun.findUniqueOrThrow({ where: { id: runId }, include: runInclude }),
      );
    });
  }

  private async transition(
    userId: string,
    id: string,
    expected: TestRunStatus,
    next: TestRunStatus,
  ) {
    const run = await this.get(userId, id);
    await this.tenant.project(userId, run.projectId, true);
    const now = new Date();
    const updated = await this.prisma.client.testRun.updateMany({
      where: { id, status: expected },
      data: {
        status: next,
        ...(next === TestRunStatus.IN_PROGRESS ? { startedAt: now } : { completedAt: now }),
      },
    });
    if (updated.count !== 1) throw new AppError('RUN_STATE_INVALID', `Run must be ${expected}`);
    return this.get(userId, id);
  }
}
