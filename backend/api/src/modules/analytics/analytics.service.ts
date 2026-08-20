import { Injectable } from '@nestjs/common';
import { Prisma } from '@app/storage';

import { PrismaService } from '../../infrastructure/prisma.service.js';
import { TenantService } from '../workspaces/tenant.service.js';

type SummaryRow = {
  total: bigint;
  untested: bigint;
  passed: bigint;
  failed: bigint;
  blocked: bigint;
  skipped: bigint;
};

@Injectable()
export class AnalyticsService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  public async summary(userId: string, runId: string) {
    const run = await this.prisma.client.testRun.findFirst({
      where: { id: runId, project: { workspace: { members: { some: { userId } } } } },
    });
    if (!run) {
      const { AppError } = await import('../../common/errors.js');
      throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    }
    const rows = await this.prisma.client.$queryRaw<SummaryRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON (trc.id) trc.id, tr.status
        FROM test_run_cases trc
        LEFT JOIN test_results tr ON tr.test_run_case_id = trc.id
        WHERE trc.test_run_id = ${runId}::uuid
        ORDER BY trc.id, tr.created_at DESC NULLS LAST, tr.id DESC NULLS LAST
      )
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE status IS NULL)::bigint AS untested,
        COUNT(*) FILTER (WHERE status = 'PASSED')::bigint AS passed,
        COUNT(*) FILTER (WHERE status = 'FAILED')::bigint AS failed,
        COUNT(*) FILTER (WHERE status = 'BLOCKED')::bigint AS blocked,
        COUNT(*) FILTER (WHERE status = 'SKIPPED')::bigint AS skipped
      FROM latest
    `;
    const row = rows[0] ?? {
      total: 0n,
      untested: 0n,
      passed: 0n,
      failed: 0n,
      blocked: 0n,
      skipped: 0n,
    };
    const total = Number(row.total);
    const untested = Number(row.untested);
    const passed = Number(row.passed);
    const executed = total - untested;
    return {
      total,
      untested,
      passed,
      failed: Number(row.failed),
      blocked: Number(row.blocked),
      skipped: Number(row.skipped),
      executed,
      progressPercent: total === 0 ? 0 : Math.round((executed / total) * 10_000) / 100,
      passRate: executed === 0 ? 0 : Math.round((passed / executed) * 10_000) / 100,
    };
  }

  public async dashboard(userId: string, projectId: string) {
    await this.tenant.project(userId, projectId);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totalTestCases, manualTestCases, automatedTestCases, latestRuns, rows] =
      await this.prisma.client.$transaction([
        this.prisma.client.testCase.count({ where: { projectId, archivedAt: null } }),
        this.prisma.client.testCase.count({
          where: { projectId, archivedAt: null, automationStatus: 'MANUAL' },
        }),
        this.prisma.client.testCase.count({
          where: { projectId, archivedAt: null, automationStatus: 'AUTOMATED' },
        }),
        this.prisma.client.testRun.findMany({
          where: { projectId },
          include: {
            project: { select: { code: true } },
            cases: {
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              include: {
                steps: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
                results: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 5,
        }),
        this.prisma.client.$queryRaw<Array<{ runs: bigint; average: number | null }>>(Prisma.sql`
        WITH completed_runs AS (
          SELECT id FROM test_runs
          WHERE project_id = ${projectId}::uuid
            AND status = 'COMPLETED'
            AND completed_at >= ${since}
        ), latest AS (
          SELECT DISTINCT ON (trc.id) trc.id AS test_run_case_id, trc.test_run_id, tr.status
          FROM test_run_cases trc
          JOIN completed_runs run ON run.id = trc.test_run_id
          LEFT JOIN test_results tr ON tr.test_run_case_id = trc.id
          ORDER BY trc.id, tr.created_at DESC NULLS LAST, tr.id DESC NULLS LAST
        ), rates AS (
          SELECT run.id AS test_run_id,
            CASE WHEN COUNT(latest.status) = 0 THEN 0
              ELSE COUNT(*) FILTER (WHERE latest.status = 'PASSED')::numeric / COUNT(latest.status) * 100 END AS pass_rate
          FROM completed_runs run
          LEFT JOIN latest ON latest.test_run_id = run.id
          GROUP BY run.id
        )
        SELECT (SELECT COUNT(*) FROM test_runs WHERE project_id = ${projectId}::uuid AND created_at >= ${since})::bigint AS runs,
          COALESCE(AVG(pass_rate), 0)::float8 AS average FROM rates
      `),
      ]);
    return {
      totalTestCases,
      manualTestCases,
      automatedTestCases,
      latestRuns: latestRuns.map((run) => ({
        ...run,
        cases: run.cases.map((runCase) => ({
          ...runCase,
          displayId: `${run.project.code}-${String(runCase.caseNumber)}`,
          currentStatus: runCase.results[0]?.status ?? 'UNTESTED',
        })),
      })),
      runsLast30Days: Number(rows[0]?.runs ?? 0),
      averagePassRate: Math.round((rows[0]?.average ?? 0) * 100) / 100,
    };
  }
}
