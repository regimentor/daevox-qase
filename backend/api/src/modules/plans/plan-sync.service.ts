import { Injectable } from '@nestjs/common';
import { Prisma } from '@app/storage';

import { invariant } from '../../common/errors.js';
import { limits } from '../../common/validation.js';

type Transaction = Prisma.TransactionClient;

type SuiteRow = {
  id: string;
  parentId: string | null;
  position: number;
};

@Injectable()
export class PlanSyncService {
  public async sourceCaseIds(
    transaction: Transaction,
    projectId: string,
    sourceSuiteIds: string[],
  ): Promise<{ orderedCaseIds: string[]; casesBySource: Map<string, string[]> }> {
    if (!sourceSuiteIds.length) return { orderedCaseIds: [], casesBySource: new Map() };
    const suites = await transaction.testSuite.findMany({
      where: { projectId, archivedAt: null },
      select: { id: true, parentId: true, position: true },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    const suiteById = new Map(suites.map((suite) => [suite.id, suite]));
    for (const id of sourceSuiteIds) {
      invariant(suiteById.has(id), 'RESOURCE_NOT_FOUND', 'Resource not found');
    }
    const children = new Map<string | null, SuiteRow[]>();
    for (const suite of suites) {
      const list = children.get(suite.parentId) ?? [];
      list.push(suite);
      children.set(suite.parentId, list);
    }
    const order: string[] = [];
    const descendants = new Map<string, string[]>();
    const visit = (suite: SuiteRow): string[] => {
      const ids = [suite.id];
      order.push(suite.id);
      for (const child of children.get(suite.id) ?? []) ids.push(...visit(child));
      descendants.set(suite.id, ids);
      return ids;
    };
    for (const root of children.get(null) ?? []) visit(root);
    const orderIndex = new Map(order.map((id, index) => [id, index]));
    const selected = [...sourceSuiteIds].toSorted(
      (left, right) => (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0),
    );
    const relevantSuiteIds = selected.flatMap((id) => descendants.get(id) ?? [id]);
    const cases = await transaction.testCase.findMany({
      where: { projectId, archivedAt: null, suiteId: { in: [...new Set(relevantSuiteIds)] } },
      select: { id: true, caseNumber: true, suiteId: true },
      orderBy: [{ caseNumber: 'asc' }, { id: 'asc' }],
    });
    const casesBySuite = new Map<string, string[]>();
    const orderedCaseIds: string[] = [];
    const seen = new Set<string>();
    for (const sourceSuiteId of selected) {
      const covered = new Set(descendants.get(sourceSuiteId) ?? [sourceSuiteId]);
      const ids = cases.filter((item) => covered.has(item.suiteId)).map((item) => item.id);
      casesBySuite.set(sourceSuiteId, ids);
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        orderedCaseIds.push(id);
      }
    }
    return { orderedCaseIds, casesBySource: casesBySuite };
  }

  public async syncCase(
    transaction: Transaction,
    projectId: string,
    caseId: string,
  ): Promise<void> {
    const current = await transaction.testCase.findFirst({
      where: { id: caseId, projectId, archivedAt: null },
      select: { id: true, suiteId: true },
    });
    if (!current) return;
    const suites = await transaction.testSuite.findMany({
      where: { projectId, archivedAt: null },
      select: { id: true, parentId: true },
    });
    const byId = new Map(suites.map((suite) => [suite.id, suite]));
    const ancestors = new Set<string>();
    let cursor: string | null = current.suiteId;
    while (cursor) {
      ancestors.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    const plans = await transaction.testPlan.findMany({
      where: { projectId },
      select: {
        id: true,
        sourceSuites: { select: { testSuiteId: true } },
        cases: {
          where: { testCaseId: caseId },
          select: {
            id: true,
            position: true,
            manual: true,
            archivedAt: true,
            sources: { select: { sourceSuiteId: true } },
          },
        },
      },
    });
    for (const plan of plans) {
      const desiredSources = plan.sourceSuites
        .map((source) => source.testSuiteId)
        .filter((sourceSuiteId) => ancestors.has(sourceSuiteId));
      const link = plan.cases[0];
      if (!desiredSources.length) {
        if (link?.archivedAt === null) {
          await transaction.testPlanCaseSource.deleteMany({
            where: { testPlanId: plan.id, testCaseId: caseId },
          });
          if (!link.manual) await transaction.testPlanCase.delete({ where: { id: link.id } });
        }
        continue;
      }
      let activeLink = link;
      if (activeLink && activeLink.archivedAt !== null) {
        await transaction.testPlanCase.delete({ where: { id: activeLink.id } });
        activeLink = undefined;
      }
      if (!activeLink) {
        const activeCount = await transaction.testPlanCase.count({
          where: { testPlanId: plan.id, archivedAt: null },
        });
        invariant(activeCount < limits.cases, 'VALIDATION_ERROR', 'Request validation failed', {
          testCaseIds: `A plan accepts at most ${limits.cases} cases`,
        });
        const max = await transaction.testPlanCase.aggregate({
          where: { testPlanId: plan.id },
          _max: { position: true },
        });
        activeLink = await transaction.testPlanCase.create({
          data: {
            projectId,
            testPlanId: plan.id,
            testCaseId: caseId,
            position: (max._max.position ?? -1) + 1,
            manual: false,
          },
          select: {
            id: true,
            position: true,
            manual: true,
            archivedAt: true,
            sources: { select: { sourceSuiteId: true } },
          },
        });
      }
      if (!activeLink) continue;
      const existing = new Set(activeLink.sources.map((source) => source.sourceSuiteId));
      await transaction.testPlanCaseSource.deleteMany({
        where: {
          testPlanId: plan.id,
          testCaseId: caseId,
          sourceSuiteId: { notIn: desiredSources },
        },
      });
      for (const sourceSuiteId of desiredSources) {
        if (existing.has(sourceSuiteId)) continue;
        await transaction.testPlanCaseSource.create({
          data: { projectId, testPlanId: plan.id, testCaseId: caseId, sourceSuiteId },
        });
      }
    }
  }

  public async archiveCaseLinks(
    transaction: Transaction,
    projectId: string,
    caseIds: string[],
    archivedAt: Date,
  ): Promise<void> {
    if (!caseIds.length) return;
    await transaction.testPlanCase.updateMany({
      where: { projectId, testCaseId: { in: caseIds }, archivedAt: null },
      data: { archivedAt },
    });
    await transaction.testPlanCaseSource.deleteMany({
      where: { projectId, testCaseId: { in: caseIds } },
    });
  }

  public async impactedPlans(
    transaction: Transaction,
    projectId: string,
    caseIds: string[],
  ): Promise<Array<{ planId: string; title: string; affectedCaseCount: number }>> {
    if (!caseIds.length) return [];
    const rows = await transaction.testPlanCase.findMany({
      where: { projectId, testCaseId: { in: caseIds }, archivedAt: null },
      select: { testPlanId: true, testPlan: { select: { title: true } }, testCaseId: true },
    });
    const byPlan = new Map<string, { title: string; cases: Set<string> }>();
    for (const row of rows) {
      const item = byPlan.get(row.testPlanId) ?? { title: row.testPlan.title, cases: new Set() };
      item.cases.add(row.testCaseId);
      byPlan.set(row.testPlanId, item);
    }
    return [...byPlan.entries()].map(([planId, item]) => ({
      planId,
      title: item.title,
      affectedCaseCount: item.cases.size,
    }));
  }
}
