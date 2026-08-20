import { Injectable } from '@nestjs/common';
import { TestRunStatus } from '@app/storage';

import { AppError, invariant } from '../../common/errors.js';
import { limits, optionalText, page, uniqueIds } from '../../common/validation.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import type { CreateTestResultInput } from '../../generated/graphql.js';

const resultInclude = {
  stepResults: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  attachments: {
    include: { attachment: true },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
};

function shapeResult<T extends { attachments: Array<{ attachment: unknown }> }>(result: T) {
  return { ...result, attachments: result.attachments.map((link) => link.attachment) };
}

@Injectable()
export class ResultsService {
  public constructor(private readonly prisma: PrismaService) {}

  public async list(
    userId: string,
    runCaseId: string,
    pagination?: { limit?: number | null; offset?: number | null } | null,
  ) {
    const allowed = await this.prisma.client.testRunCase.count({
      where: {
        id: runCaseId,
        testRun: { project: { workspace: { members: { some: { userId } } } } },
      },
    });
    if (allowed !== 1) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    const { limit, offset } = page(pagination);
    const where = { testRunCaseId: runCaseId };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.testResult.findMany({
        where,
        include: resultInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.client.testResult.count({ where }),
    ]);
    return { items: rows.map(shapeResult), pageInfo: { limit, offset, total } };
  }

  public create(userId: string, input: CreateTestResultInput) {
    const steps = input.steps ?? [];
    const attachments = input.attachmentIds ?? [];
    uniqueIds(
      steps.map((step) => step.stepId),
      'steps',
      limits.steps,
    );
    uniqueIds(attachments, 'attachmentIds', limits.attachments);
    invariant(
      input.durationSeconds === null ||
        input.durationSeconds === undefined ||
        (Number.isSafeInteger(input.durationSeconds) && input.durationSeconds >= 0),
      'VALIDATION_ERROR',
      'Request validation failed',
      { durationSeconds: 'Duration must be a non-negative integer' },
    );
    optionalText(input.comment, 'comment');
    for (const step of steps) optionalText(step.actualResult, 'actualResult');
    return this.prisma.client.$transaction(async (transaction) => {
      const runCase = await transaction.testRunCase.findFirst({
        where: {
          id: input.runCaseId,
          testRun: { project: { workspace: { members: { some: { userId } } } } },
        },
        include: { testRun: { include: { project: true } } },
      });
      if (!runCase) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
      if (runCase.testRun.status !== TestRunStatus.IN_PROGRESS)
        throw new AppError('RUN_STATE_INVALID', 'Results can only be added to an in-progress run');
      const stepCount = await transaction.testRunCaseStep.count({
        where: { id: { in: steps.map((step) => step.stepId) }, testRunCaseId: runCase.id },
      });
      invariant(stepCount === steps.length, 'RESOURCE_NOT_FOUND', 'Resource not found');
      const attachmentRows = await transaction.attachment.findMany({
        where: { id: { in: attachments }, workspaceId: runCase.testRun.project.workspaceId },
      });
      invariant(
        attachmentRows.length === attachments.length,
        'RESOURCE_NOT_FOUND',
        'Resource not found',
      );
      if (attachmentRows.some((attachment) => attachment.status !== 'READY'))
        throw new AppError('ATTACHMENT_NOT_READY', 'Every attachment must be ready');
      const result = await transaction.testResult.create({
        data: {
          testRunCaseId: runCase.id,
          status: input.status,
          executedBy: userId,
          comment: input.comment ?? null,
          durationSeconds: input.durationSeconds ?? null,
        },
      });
      if (steps.length)
        await transaction.testStepResult.createMany({
          data: steps.map((step) => ({
            testResultId: result.id,
            testRunCaseId: runCase.id,
            testRunCaseStepId: step.stepId,
            status: step.status,
            actualResult: step.actualResult ?? null,
          })),
        });
      if (attachments.length)
        await transaction.testResultAttachment.createMany({
          data: attachments.map((attachmentId) => ({ testResultId: result.id, attachmentId })),
        });
      return shapeResult(
        await transaction.testResult.findUniqueOrThrow({
          where: { id: result.id },
          include: resultInclude,
        }),
      );
    });
  }
}
