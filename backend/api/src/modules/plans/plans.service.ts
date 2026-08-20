import { Injectable } from '@nestjs/common';
import { Prisma } from '@app/storage';

import { AppError, invariant } from '../../common/errors.js';
import { limits, optionalText, page, text, uniqueIds } from '../../common/validation.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import type { UpdateTestPlanInput } from '../../generated/graphql.js';
import { TenantService } from '../workspaces/tenant.service.js';

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
    },
  },
};

function shapePlan<
  T extends {
    cases: Array<{
      testCase: { project: { code: string }; caseNumber: number; tags: Array<{ tag: unknown }> };
    }>;
  },
>(plan: T) {
  return {
    ...plan,
    testCases: plan.cases.map(({ testCase }) => ({
      ...testCase,
      displayId: `${testCase.project.code}-${String(testCase.caseNumber)}`,
      tags: testCase.tags.map(({ tag }) => tag),
    })),
  };
}

@Injectable()
export class PlansService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
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

  public create(
    userId: string,
    projectId: string,
    titleInput: string,
    description: string | null | undefined,
    testCaseIds: string[],
  ) {
    uniqueIds(testCaseIds, 'testCaseIds', limits.cases);
    return this.prisma.client.$transaction(async (transaction) => {
      await this.tenant.project(userId, projectId, true, transaction);
      await this.validateCases(transaction, projectId, testCaseIds);
      const plan = await transaction.testPlan.create({
        data: {
          projectId,
          title: text(titleInput, 'title', limits.title),
          description: optionalText(description, 'description'),
          createdBy: userId,
        },
      });
      if (testCaseIds.length)
        await transaction.testPlanCase.createMany({
          data: testCaseIds.map((testCaseId, position) => ({
            projectId,
            testPlanId: plan.id,
            testCaseId,
            position,
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

  public replaceCases(userId: string, id: string, testCaseIds: string[]) {
    uniqueIds(testCaseIds, 'testCaseIds', limits.cases);
    return this.prisma.client.$transaction(async (transaction) => {
      const plan = await transaction.testPlan.findFirst({
        where: { id, project: { workspace: { members: { some: { userId } } } } },
      });
      if (!plan) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
      await this.tenant.project(userId, plan.projectId, true, transaction);
      await this.validateCases(transaction, plan.projectId, testCaseIds);
      await transaction.testPlanCase.deleteMany({ where: { testPlanId: id } });
      if (testCaseIds.length)
        await transaction.testPlanCase.createMany({
          data: testCaseIds.map((testCaseId, position) => ({
            projectId: plan.projectId,
            testPlanId: id,
            testCaseId,
            position,
          })),
        });
      return shapePlan(
        await transaction.testPlan.findUniqueOrThrow({ where: { id }, include: planInclude }),
      );
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
}
