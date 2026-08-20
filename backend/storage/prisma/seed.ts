import 'dotenv/config';

import { argon2id, hash } from 'argon2';

import {
  AutomationStatus,
  createPrismaClient,
  TestCasePriority,
  TestCaseSeverity,
  TestCaseType,
  type TestCase,
  WorkspaceRole,
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const password = process.env.SEED_DEMO_PASSWORD;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!password || password.length < 12 || Buffer.byteLength(password) > 1024) {
  throw new Error('SEED_DEMO_PASSWORD must be at least 12 characters and at most 1024 bytes');
}
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
  throw new Error('Production seed requires ALLOW_PRODUCTION_SEED=true');
}

const prisma = createPrismaClient(databaseUrl);
try {
  const passwordHash = await hash(password, { type: argon2id });
  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    create: { email: 'demo@example.com', name: 'Demo User', passwordHash },
    update: { name: 'Demo User', passwordHash },
  });
  let workspace = await prisma.workspace.findFirst({
    where: { name: 'Demo Workspace', createdBy: user.id },
  });
  workspace ??= await prisma.workspace.create({
    data: { name: 'Demo Workspace', createdBy: user.id },
  });
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    create: { workspaceId: workspace.id, userId: user.id, role: WorkspaceRole.ADMIN },
    update: { role: WorkspaceRole.ADMIN },
  });
  const project = await prisma.project.upsert({
    where: { workspaceId_code: { workspaceId: workspace.id, code: 'DEMO' } },
    create: { workspaceId: workspace.id, name: 'Demo API', code: 'DEMO', nextCaseNumber: 4 },
    update: { name: 'Demo API', archivedAt: null },
  });

  async function suite(title: string, position: number) {
    const existing = await prisma.testSuite.findFirst({
      where: { projectId: project.id, parentId: null, title },
    });
    return (
      existing ?? prisma.testSuite.create({ data: { projectId: project.id, title, position } })
    );
  }
  const authentication = await suite('Authentication', 0);
  const orders = await suite('Orders', 1);

  const definitions = [
    {
      caseNumber: 1,
      suiteId: authentication.id,
      title: 'Login with valid credentials',
      steps: [
        { action: 'Open the login page', expectedResult: 'The login form is displayed' },
        { action: 'Submit valid credentials', expectedResult: 'The user dashboard is displayed' },
      ],
    },
    {
      caseNumber: 2,
      suiteId: authentication.id,
      title: 'Login with invalid password',
      steps: [
        {
          action: 'Submit a valid email and invalid password',
          expectedResult: 'A generic invalid credentials error is displayed',
        },
      ],
    },
    {
      caseNumber: 3,
      suiteId: orders.id,
      title: 'Create order',
      steps: [
        {
          action: 'Submit a valid new order',
          expectedResult: 'The order is created and assigned an identifier',
        },
      ],
    },
  ];
  const cases: TestCase[] = [];
  for (const definition of definitions) {
    const testCase = await prisma.testCase.upsert({
      where: { projectId_caseNumber: { projectId: project.id, caseNumber: definition.caseNumber } },
      create: {
        projectId: project.id,
        suiteId: definition.suiteId,
        caseNumber: definition.caseNumber,
        title: definition.title,
        priority: TestCasePriority.MEDIUM,
        severity: TestCaseSeverity.NORMAL,
        type: TestCaseType.FUNCTIONAL,
        automationStatus: AutomationStatus.MANUAL,
        createdBy: user.id,
      },
      update: { suiteId: definition.suiteId, title: definition.title, archivedAt: null },
    });
    await prisma.testStep.deleteMany({ where: { testCaseId: testCase.id } });
    await prisma.testStep.createMany({
      data: definition.steps.map((step, position) => ({
        ...step,
        position,
        projectId: project.id,
        testCaseId: testCase.id,
      })),
    });
    cases.push(testCase);
  }
  await prisma.project.updateMany({
    where: { id: project.id, nextCaseNumber: { lt: 4 } },
    data: { nextCaseNumber: 4 },
  });

  let plan = await prisma.testPlan.findFirst({ where: { projectId: project.id, title: 'Smoke' } });
  plan ??= await prisma.testPlan.create({
    data: { projectId: project.id, title: 'Smoke', createdBy: user.id },
  });
  await prisma.testPlanCase.deleteMany({ where: { testPlanId: plan.id } });
  await prisma.testPlanCase.createMany({
    data: cases.map((testCase, position) => ({
      projectId: project.id,
      testPlanId: plan.id,
      testCaseId: testCase.id,
      position,
    })),
  });

  const environment = await prisma.environment.upsert({
    where: { projectId_name: { projectId: project.id, name: 'Staging' } },
    create: { projectId: project.id, name: 'Staging' },
    update: {},
  });
  let run = await prisma.testRun.findFirst({
    where: { projectId: project.id, title: 'Staging Smoke', status: 'DRAFT' },
  });
  if (!run) {
    run = await prisma.$transaction(async (transaction) => {
      const created = await transaction.testRun.create({
        data: {
          projectId: project.id,
          testPlanId: plan.id,
          environmentId: environment.id,
          title: 'Staging Smoke',
          createdBy: user.id,
        },
      });
      for (const [position, testCase] of cases.entries()) {
        const source = await transaction.testCase.findUniqueOrThrow({
          where: { id: testCase.id },
          include: { steps: { orderBy: { position: 'asc' } } },
        });
        const snapshot = await transaction.testRunCase.create({
          data: {
            testRunId: created.id,
            projectId: project.id,
            sourceTestCaseId: source.id,
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
      return created;
    });
  }
  process.stdout.write(
    `${JSON.stringify({ user: user.email, workspace: workspace.name, project: project.code, run: run.title })}\n`,
  );
} finally {
  await prisma.$disconnect();
}
