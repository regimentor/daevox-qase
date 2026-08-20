import { Injectable } from '@nestjs/common';
import { Prisma } from '@app/storage';

import { AppError, invariant } from '../../common/errors.js';
import { limits, optionalText, page, text, uniqueIds } from '../../common/validation.js';
import { withTransactionRetry } from '../../common/transaction-retry.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import type {
  CreateTestCaseInput,
  TestCaseFilter,
  TestCaseSort,
  TestStepInput,
  UpdateTestCaseInput,
} from '../../generated/graphql.js';
import { SortDirection, TestCaseSortField } from '../../generated/graphql.js';
import { TenantService } from '../workspaces/tenant.service.js';
import { PlanSyncService } from '../plans/plan-sync.service.js';

const caseInclude = {
  project: { select: { code: true } },
  steps: { orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }] },
  tags: {
    include: { tag: true },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
};

function shapeCase<T extends { project: { code: string }; tags: Array<{ tag: unknown }> }>(row: T) {
  return {
    ...row,
    displayId: `${row.project.code}-${String((row as T & { caseNumber: number }).caseNumber)}`,
    tags: row.tags.map((link) => link.tag),
  };
}

@Injectable()
export class TestCasesService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly sync: PlanSyncService,
  ) {}

  public async get(userId: string, id: string) {
    const row = await this.prisma.client.testCase.findFirst({
      where: { id, project: { workspace: { members: { some: { userId } } } } },
      include: caseInclude,
    });
    if (!row) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    return shapeCase(row);
  }

  public async list(
    userId: string,
    projectId: string,
    filter?: TestCaseFilter | null,
    sort?: TestCaseSort | null,
    pagination?: { limit?: number | null; offset?: number | null } | null,
  ) {
    const project = await this.tenant.project(userId, projectId);
    const { limit, offset } = page(pagination);
    const search = filter?.search?.trim();
    const parsedNumber = search?.toUpperCase().startsWith(`${project.code}-`)
      ? Number(search.slice(project.code.length + 1))
      : search && /^\d+$/.test(search)
        ? Number(search)
        : undefined;
    const escaped = search?.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
    const where: Prisma.TestCaseWhereInput = {
      projectId,
      ...(!filter?.includeArchived ? { archivedAt: null } : {}),
      ...(filter?.suiteId ? { suiteId: filter.suiteId } : {}),
      ...(filter?.tagId ? { tags: { some: { tagId: filter.tagId } } } : {}),
      ...(filter?.priority ? { priority: filter.priority } : {}),
      ...(filter?.severity ? { severity: filter.severity } : {}),
      ...(filter?.type ? { type: filter.type } : {}),
      ...(filter?.automationStatus ? { automationStatus: filter.automationStatus } : {}),
      ...(filter?.assigneeId ? { assigneeId: filter.assigneeId } : {}),
      ...(escaped
        ? {
            OR: [
              ...(Number.isSafeInteger(parsedNumber) ? [{ caseNumber: parsedNumber }] : []),
              { title: { contains: escaped, mode: 'insensitive' as const } },
              { description: { contains: escaped, mode: 'insensitive' as const } },
              { preconditions: { contains: escaped, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const direction = sort?.direction === SortDirection.DESC ? 'desc' : 'asc';
    const field = sort?.field ?? TestCaseSortField.CASE_NUMBER;
    const key = {
      [TestCaseSortField.CASE_NUMBER]: 'caseNumber',
      [TestCaseSortField.TITLE]: 'title',
      [TestCaseSortField.PRIORITY]: 'priority',
      [TestCaseSortField.SEVERITY]: 'severity',
      [TestCaseSortField.CREATED_AT]: 'createdAt',
      [TestCaseSortField.UPDATED_AT]: 'updatedAt',
    }[field];
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.testCase.findMany({
        where,
        include: caseInclude,
        orderBy: [{ [key]: direction }, { id: direction }],
        skip: offset,
        take: limit,
      }),
      this.prisma.client.testCase.count({ where }),
    ]);
    return { items: rows.map(shapeCase), pageInfo: { limit, offset, total } };
  }

  public create(userId: string, input: CreateTestCaseInput) {
    this.validateSteps(input.steps ?? []);
    uniqueIds(input.tagIds ?? [], 'tagIds', limits.cases);
    return withTransactionRetry(
      () =>
        this.prisma.client.$transaction(
          async (transaction) => {
            const project = await this.tenant.project(userId, input.projectId, true, transaction);
            await this.validateReferences(
              transaction,
              project.workspaceId,
              input.projectId,
              input.suiteId,
              input.assigneeId,
              input.tagIds ?? [],
            );
            const counter = await transaction.project.update({
              where: { id: input.projectId },
              data: { nextCaseNumber: { increment: 1 } },
              select: { nextCaseNumber: true },
            });
            const testCase = await transaction.testCase.create({
              data: {
                projectId: input.projectId,
                suiteId: input.suiteId,
                caseNumber: counter.nextCaseNumber - 1,
                title: text(input.title, 'title', limits.title),
                description: optionalText(input.description, 'description'),
                preconditions: optionalText(input.preconditions, 'preconditions'),
                postconditions: optionalText(input.postconditions, 'postconditions'),
                priority: input.priority,
                severity: input.severity,
                type: input.type,
                automationStatus: input.automationStatus,
                assigneeId: input.assigneeId ?? null,
                estimatedDurationSeconds: this.duration(input.estimatedDurationSeconds),
                createdBy: userId,
              },
            });
            if (input.steps?.length)
              await transaction.testStep.createMany({
                data: input.steps.map((step, position) =>
                  this.stepData(testCase.id, input.projectId, step, position),
                ),
              });
            if (input.tagIds?.length)
              await transaction.testCaseTag.createMany({
                data: input.tagIds.map((tagId) => ({
                  projectId: input.projectId,
                  testCaseId: testCase.id,
                  tagId,
                })),
              });
            await this.sync.syncCase(transaction, input.projectId, testCase.id);
            return this.load(transaction, testCase.id);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      8,
    );
  }

  public async update(userId: string, id: string, input: UpdateTestCaseInput) {
    return this.prisma.client.$transaction(async (transaction) => {
      const current = await transaction.testCase.findFirst({
        where: { id, project: { workspace: { members: { some: { userId } } } } },
      });
      if (!current) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
      const project = await this.tenant.project(userId, current.projectId, true, transaction);
      if (current.archivedAt) throw new AppError('TEST_CASE_ARCHIVED', 'Test case is archived');
      if (input.suiteId) {
        const suite = await transaction.testSuite.findFirst({
          where: { id: input.suiteId, projectId: current.projectId, archivedAt: null },
        });
        if (!suite) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
      }
      if (input.assigneeId)
        await this.tenant.member(project.workspaceId, input.assigneeId, transaction);
      const data: Prisma.TestCaseUpdateInput = {};
      if (input.suiteId !== undefined && input.suiteId !== null)
        data.suite = { connect: { id: input.suiteId } };
      if (input.title !== undefined && input.title !== null)
        data.title = text(input.title, 'title', limits.title);
      if (input.description !== undefined)
        data.description = optionalText(input.description, 'description');
      if (input.preconditions !== undefined)
        data.preconditions = optionalText(input.preconditions, 'preconditions');
      if (input.postconditions !== undefined)
        data.postconditions = optionalText(input.postconditions, 'postconditions');
      if (input.priority !== undefined && input.priority !== null) data.priority = input.priority;
      if (input.severity !== undefined && input.severity !== null) data.severity = input.severity;
      if (input.type !== undefined && input.type !== null) data.type = input.type;
      if (input.automationStatus !== undefined && input.automationStatus !== null)
        data.automationStatus = input.automationStatus;
      if (input.assigneeId !== undefined)
        data.assignee = input.assigneeId
          ? { connect: { id: input.assigneeId } }
          : { disconnect: true };
      if (input.estimatedDurationSeconds !== undefined)
        data.estimatedDurationSeconds = this.duration(input.estimatedDurationSeconds);
      await transaction.testCase.update({ where: { id }, data });
      await this.sync.syncCase(transaction, current.projectId, id);
      return this.load(transaction, id);
    });
  }

  public async archive(userId: string, id: string) {
    const current = await this.get(userId, id);
    await this.tenant.project(userId, current.projectId, true);
    return this.prisma.client.$transaction(async (transaction) => {
      const row = await transaction.testCase.findFirst({
        where: { id, projectId: current.projectId, archivedAt: null },
      });
      if (!row) return this.load(transaction, id);
      const archivedAt = new Date();
      const operation = await transaction.archiveOperation.create({
        data: { projectId: current.projectId, kind: 'CASE' },
      });
      await transaction.testCase.update({
        where: { id },
        data: { archivedAt, archiveOperationId: operation.id },
      });
      await this.sync.archiveCaseLinks(transaction, current.projectId, [id], archivedAt);
      return this.load(transaction, id);
    });
  }

  public async restore(userId: string, id: string) {
    const current = await this.get(userId, id);
    await this.tenant.project(userId, current.projectId, true);
    return this.prisma.client.$transaction(async (transaction) => {
      const row = await transaction.testCase.findFirst({
        where: { id, projectId: current.projectId, archivedAt: { not: null } },
      });
      if (!row) return this.load(transaction, id);
      const suite = await transaction.testSuite.findFirst({
        where: { id: row.suiteId, projectId: row.projectId, archivedAt: null },
      });
      if (!suite) throw new AppError('SUITE_ARCHIVED', 'Suite is archived');
      await transaction.testCase.update({
        where: { id },
        data: { archivedAt: null, archiveOperationId: null },
      });
      await this.sync.syncCase(transaction, row.projectId, id);
      return this.load(transaction, id);
    });
  }

  public async archivePreview(userId: string, id: string) {
    const current = await this.get(userId, id);
    if (current.archivedAt) return { suiteCount: 0, caseCount: 0, affectedPlans: [] };
    return {
      suiteCount: 0,
      caseCount: 1,
      affectedPlans: await this.prisma.client.$transaction((transaction) =>
        this.sync.impactedPlans(transaction, current.projectId, [id]),
      ),
    };
  }

  public replaceSteps(userId: string, testCaseId: string, steps: TestStepInput[]) {
    this.validateSteps(steps);
    return this.prisma.client.$transaction(async (transaction) => {
      const current = await transaction.testCase.findFirst({
        where: { id: testCaseId, project: { workspace: { members: { some: { userId } } } } },
      });
      if (!current) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
      await this.tenant.project(userId, current.projectId, true, transaction);
      if (current.archivedAt) throw new AppError('TEST_CASE_ARCHIVED', 'Test case is archived');
      await transaction.testStep.deleteMany({ where: { testCaseId } });
      if (steps.length)
        await transaction.testStep.createMany({
          data: steps.map((step, position) =>
            this.stepData(testCaseId, current.projectId, step, position),
          ),
        });
      return this.load(transaction, testCaseId);
    });
  }

  public replaceTags(userId: string, testCaseId: string, tagIds: string[]) {
    uniqueIds(tagIds, 'tagIds', limits.cases);
    return this.prisma.client.$transaction(async (transaction) => {
      const current = await transaction.testCase.findFirst({
        where: { id: testCaseId, project: { workspace: { members: { some: { userId } } } } },
      });
      if (!current) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
      await this.tenant.project(userId, current.projectId, true, transaction);
      const count = await transaction.tag.count({
        where: { id: { in: tagIds }, projectId: current.projectId },
      });
      invariant(count === tagIds.length, 'RESOURCE_NOT_FOUND', 'Resource not found');
      await transaction.testCaseTag.deleteMany({ where: { testCaseId } });
      if (tagIds.length)
        await transaction.testCaseTag.createMany({
          data: tagIds.map((tagId) => ({ projectId: current.projectId, testCaseId, tagId })),
        });
      return this.load(transaction, testCaseId);
    });
  }

  public async tags(userId: string, projectId: string) {
    await this.tenant.project(userId, projectId);
    return this.prisma.client.tag.findMany({
      where: { projectId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  public async createTag(userId: string, projectId: string, nameInput: string) {
    await this.tenant.project(userId, projectId, true);
    const name = text(nameInput, 'name', limits.tagName);
    try {
      return await this.prisma.client.tag.create({ data: { projectId, name } });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError('CONFLICT', 'Tag name already exists');
      throw error;
    }
  }

  public async deleteTag(userId: string, id: string): Promise<boolean> {
    const tag = await this.prisma.client.tag.findFirst({
      where: { id, project: { workspace: { members: { some: { userId } } } } },
    });
    if (!tag) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    await this.tenant.project(userId, tag.projectId, true);
    await this.prisma.client.tag.delete({ where: { id } });
    return true;
  }

  private validateSteps(steps: readonly TestStepInput[]): void {
    invariant(steps.length <= limits.steps, 'VALIDATION_ERROR', 'Request validation failed', {
      steps: `A case accepts at most ${limits.steps} steps`,
    });
    for (const step of steps) {
      text(step.action, 'action', limits.longText, { trim: false });
      text(step.expectedResult, 'expectedResult', limits.longText, { trim: false });
      optionalText(step.testData, 'testData');
    }
  }

  private duration(value: number | null | undefined): number | null {
    invariant(
      value === null || value === undefined || (Number.isSafeInteger(value) && value >= 0),
      'VALIDATION_ERROR',
      'Request validation failed',
      { estimatedDurationSeconds: 'Duration must be a non-negative integer' },
    );
    return value ?? null;
  }

  private stepData(testCaseId: string, projectId: string, step: TestStepInput, position: number) {
    return {
      testCaseId,
      projectId,
      position,
      action: step.action,
      testData: step.testData ?? null,
      expectedResult: step.expectedResult,
    };
  }

  private async validateReferences(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    projectId: string,
    suiteId: string,
    assigneeId: string | null | undefined,
    tagIds: string[],
  ): Promise<void> {
    const suite = await transaction.testSuite.count({
      where: { id: suiteId, projectId, archivedAt: null },
    });
    invariant(suite === 1, 'RESOURCE_NOT_FOUND', 'Resource not found');
    if (assigneeId) await this.tenant.member(workspaceId, assigneeId, transaction);
    const tags = await transaction.tag.count({ where: { id: { in: tagIds }, projectId } });
    invariant(tags === tagIds.length, 'RESOURCE_NOT_FOUND', 'Resource not found');
  }

  private async load(transaction: Prisma.TransactionClient, id: string) {
    return shapeCase(
      await transaction.testCase.findUniqueOrThrow({ where: { id }, include: caseInclude }),
    );
  }
}
