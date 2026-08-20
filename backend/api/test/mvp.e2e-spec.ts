import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { MinioContainer, type StartedMinioContainer } from '@testcontainers/minio';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Identifier = { id: string };
type Auth = { accessToken: string; refreshToken: string; user: Identifier };

describe('Daevox MVP GraphQL walkthrough', () => {
  let postgres: StartedPostgreSqlContainer;
  let minio: StartedMinioContainer;
  let app: INestApplication;
  let databaseUrl: string;
  let minioStopped = false;
  let admin: Auth;
  let member: Auth;
  let workspace: Identifier;
  let project: Identifier;
  let suite: Identifier;
  let tag: Identifier;
  let testCase: Identifier & { displayId: string; steps: Identifier[] };
  let plan: Identifier;
  let environment: Identifier;
  let mainRun: Identifier;
  let mainRunCase: Identifier & { steps: Identifier[] };
  let mainAttachment: Identifier;
  let concurrentCaseIds: string[] = [];

  async function graphql<T>(
    query: string,
    variables: Record<string, unknown> = {},
    token?: string,
  ): Promise<T> {
    const call = request(app.getHttpServer())
      .post('/graphql')
      .set('content-type', 'application/json');
    if (token) call.set('authorization', `Bearer ${token}`);
    const response = await call.send({ query, variables });
    const body = response.body as {
      data?: T;
      errors?: Array<{ message: string; extensions: { code?: string } }>;
    };
    if (body.errors) throw new Error(JSON.stringify(body.errors));
    if (!body.data) throw new Error(`Missing GraphQL data: ${response.text}`);
    return body.data;
  }

  async function graphqlError(
    query: string,
    variables: Record<string, unknown>,
    token?: string,
  ): Promise<string> {
    const call = request(app.getHttpServer()).post('/graphql');
    if (token) call.set('authorization', `Bearer ${token}`);
    const response = await call.send({ query, variables });
    return response.body.errors[0].extensions.code as string;
  }

  async function register(email: string, name: string): Promise<Auth> {
    return (
      await graphql<{ register: Auth }>(
        `
          mutation ($email: String!, $name: String!) {
            register(email: $email, name: $name, password: "a-secure-password-123") {
              accessToken
              refreshToken
              user {
                id
              }
            }
          }
        `,
        { email, name },
      )
    ).register;
  }

  beforeAll(async () => {
    [postgres, minio] = await Promise.all([
      new PostgreSqlContainer('postgres:17-alpine')
        .withDatabase('daevox_test')
        .withUsername('daevox')
        .withPassword('daevox')
        .start(),
      new MinioContainer('minio/minio:latest')
        .withUsername('minio-test-user')
        .withPassword('minio-test-password')
        .start(),
    ]);
    databaseUrl = postgres.getConnectionUri().replace(/^postgres:/, 'postgresql:');
    const keys = generateKeyPairSync('ed25519');
    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: databaseUrl,
      ACCESS_TOKEN_PRIVATE_KEY: keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      ACCESS_TOKEN_PUBLIC_KEY: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      ACCESS_TOKEN_TTL_SECONDS: '900',
      REFRESH_TOKEN_TTL_SECONDS: '2592000',
      CORS_ORIGINS: 'http://localhost:3001',
      S3_ENDPOINT: minio.getConnectionUrl(),
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'daevox-test',
      S3_ACCESS_KEY_ID: minio.getUsername(),
      S3_SECRET_ACCESS_KEY: minio.getPassword(),
      S3_FORCE_PATH_STYLE: 'true',
      ATTACHMENT_MAX_BYTES: '26214400',
      ATTACHMENT_ALLOWED_MIME_TYPES:
        'image/png,image/jpeg,application/pdf,text/plain,application/json',
    });
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: resolve(process.cwd(), 'backend/storage'),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
    const s3 = new S3Client({
      endpoint: minio.getConnectionUrl(),
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: minio.getUsername(), secretAccessKey: minio.getPassword() },
    });
    await s3.send(new CreateBucketCommand({ Bucket: 'daevox-test' }));
    const { AppModule } = await import('../src/app.module.js');
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await postgres?.stop();
    if (!minioStopped) await minio?.stop();
  });

  it('executes auth, tenant, authoring, immutable run, result, attachment and analytics flow', async () => {
    admin = await register('admin@example.com', 'Admin');
    member = await register('member@example.com', 'Member');
    const outsider = await register('outsider@example.com', 'Outsider');

    workspace = (
      await graphql<{ createWorkspace: Identifier }>(
        'mutation{createWorkspace(name:"QA Workspace"){id}}',
        {},
        admin.accessToken,
      )
    ).createWorkspace;
    await graphql(
      'mutation($id:UUID!){addWorkspaceMember(workspaceId:$id,email:"member@example.com",role:MEMBER){id role}}',
      { id: workspace.id },
      admin.accessToken,
    );
    const outsiderWorkspace = (
      await graphql<{ createWorkspace: Identifier }>(
        'mutation{createWorkspace(name:"Other Workspace"){id}}',
        {},
        outsider.accessToken,
      )
    ).createWorkspace;
    expect(outsiderWorkspace.id).not.toBe(workspace.id);

    project = (
      await graphql<{ createProject: Identifier }>(
        'mutation($workspaceId:UUID!){createProject(workspaceId:$workspaceId,name:"API",code:" api "){id}}',
        { workspaceId: workspace.id },
        member.accessToken,
      )
    ).createProject;
    suite = (
      await graphql<{ createTestSuite: Identifier }>(
        'mutation($projectId:UUID!){createTestSuite(projectId:$projectId,title:"Authentication"){id}}',
        { projectId: project.id },
        member.accessToken,
      )
    ).createTestSuite;
    tag = (
      await graphql<{ createTag: Identifier }>(
        'mutation($projectId:UUID!){createTag(projectId:$projectId,name:"Smoke"){id}}',
        { projectId: project.id },
        member.accessToken,
      )
    ).createTag;
    testCase = (
      await graphql<{ createTestCase: Identifier & { displayId: string; steps: Identifier[] } }>(
        `
          mutation ($input: CreateTestCaseInput!) {
            createTestCase(input: $input) {
              id
              displayId
              steps {
                id
              }
            }
          }
        `,
        {
          input: {
            projectId: project.id,
            suiteId: suite.id,
            title: 'Login succeeds',
            priority: 'HIGH',
            severity: 'CRITICAL',
            type: 'SMOKE',
            automationStatus: 'MANUAL',
            steps: [{ action: 'Submit valid credentials', expectedResult: 'Dashboard opens' }],
            tagIds: [tag.id],
          },
        },
        member.accessToken,
      )
    ).createTestCase;
    expect(testCase.displayId).toBe('API-1');

    plan = (
      await graphql<{ createTestPlan: Identifier }>(
        'mutation($projectId:UUID!,$ids:[UUID!]!){createTestPlan(projectId:$projectId,title:"Smoke",testCaseIds:$ids){id}}',
        { projectId: project.id, ids: [testCase.id] },
        member.accessToken,
      )
    ).createTestPlan;
    environment = (
      await graphql<{ createEnvironment: Identifier }>(
        'mutation($projectId:UUID!){createEnvironment(projectId:$projectId,name:"Staging"){id}}',
        { projectId: project.id },
        member.accessToken,
      )
    ).createEnvironment;
    const run = (
      await graphql<{
        createTestRun: Identifier & {
          cases: Array<
            Identifier & { title: string; steps: Array<Identifier & { action: string }> }
          >;
        };
      }>(
        `
          mutation ($input: CreateTestRunInput!) {
            createTestRun(input: $input) {
              id
              cases {
                id
                title
                steps {
                  id
                  action
                }
              }
            }
          }
        `,
        {
          input: {
            projectId: project.id,
            title: 'Staging Smoke',
            testPlanId: plan.id,
            environmentId: environment.id,
          },
        },
        member.accessToken,
      )
    ).createTestRun;
    mainRun = run;
    const snapshot = run.cases[0];
    if (!snapshot) throw new Error('Run snapshot was not created');
    mainRunCase = snapshot;
    await graphql(
      'mutation($id:UUID!){updateTestCase(id:$id,input:{title:"Changed source"}){id}}',
      { id: testCase.id },
      member.accessToken,
    );
    await graphql(
      'mutation($id:UUID!){replaceTestCaseSteps(testCaseId:$id,steps:[{action:"New action",expectedResult:"New result"}]){id}}',
      { id: testCase.id },
      member.accessToken,
    );
    const unchanged = (
      await graphql<{
        testRun: { cases: Array<{ title: string; steps: Array<{ action: string }> }> };
      }>(
        'query($id:UUID!){testRun(id:$id){cases{title steps{action}}}}',
        { id: run.id },
        member.accessToken,
      )
    ).testRun.cases[0];
    expect(unchanged).toEqual({
      title: snapshot.title,
      steps: [{ action: snapshot.steps[0]?.action }],
    });

    await graphql(
      'mutation($runId:UUID!,$assignee:UUID!){assignRunCases(runId:$runId,assigneeId:$assignee){id}}',
      { runId: run.id, assignee: member.user.id },
      member.accessToken,
    );
    await graphql(
      'mutation($id:UUID!){startTestRun(id:$id){id status}}',
      { id: run.id },
      member.accessToken,
    );
    const upload = (
      await graphql<{
        presignAttachmentUpload: {
          attachment: Identifier;
          url: string;
          headers: Array<{ name: string; value: string }>;
        };
      }>(
        `
          mutation ($workspaceId: UUID!) {
            presignAttachmentUpload(
              workspaceId: $workspaceId
              filename: "evidence.txt"
              mimeType: "text/plain"
              size: "8"
            ) {
              attachment {
                id
              }
              url
              headers {
                name
                value
              }
            }
          }
        `,
        { workspaceId: workspace.id },
        member.accessToken,
      )
    ).presignAttachmentUpload;
    mainAttachment = upload.attachment;
    const put = await fetch(upload.url, {
      method: 'PUT',
      headers: Object.fromEntries(upload.headers.map((header) => [header.name, header.value])),
      body: 'evidence',
    });
    expect(put.ok).toBe(true);
    await graphql(
      'mutation($id:UUID!){completeAttachmentUpload(id:$id){id status downloadUrl}}',
      { id: upload.attachment.id },
      member.accessToken,
    );
    await graphql(
      `
        mutation ($input: CreateTestResultInput!) {
          createTestResult(input: $input) {
            id
            status
            stepResults {
              id
              status
            }
            attachments {
              id
              downloadUrl
            }
          }
        }
      `,
      {
        input: {
          runCaseId: snapshot.id,
          status: 'PASSED',
          durationSeconds: 15,
          steps: [{ stepId: snapshot.steps[0]?.id, status: 'PASSED' }],
          attachmentIds: [upload.attachment.id],
        },
      },
      member.accessToken,
    );
    await graphql(
      'mutation($id:UUID!){completeTestRun(id:$id){id status}}',
      { id: run.id },
      member.accessToken,
    );
    const analytics = await graphql<{
      runSummary: {
        total: number;
        passed: number;
        executed: number;
        progressPercent: number;
        passRate: number;
      };
      projectDashboard: {
        totalTestCases: number;
        manualTestCases: number;
        latestRuns: Identifier[];
      };
    }>(
      'query($runId:UUID!,$projectId:UUID!){runSummary(runId:$runId){total passed executed progressPercent passRate} projectDashboard(projectId:$projectId){totalTestCases manualTestCases latestRuns{id}}}',
      { runId: run.id, projectId: project.id },
      member.accessToken,
    );
    expect(analytics.runSummary).toMatchObject({
      total: 1,
      passed: 1,
      executed: 1,
      progressPercent: 100,
      passRate: 100,
    });
    expect(analytics.projectDashboard.totalTestCases).toBe(1);

    const foreign = await request(app.getHttpServer())
      .post('/graphql')
      .set('authorization', `Bearer ${outsider.accessToken}`)
      .send({ query: 'query($id:UUID!){project(id:$id){id}}', variables: { id: project.id } });
    expect(foreign.body.errors[0].extensions.code).toBe('RESOURCE_NOT_FOUND');
    expect(foreign.body.errors[0].extensions.correlationId).toEqual(expect.any(String));
    expect(foreign.body.errors[0].extensions.stacktrace).toBeUndefined();
  });

  it('allocates case numbers safely under concurrent GraphQL mutations and supports filters/search/pagination', async () => {
    const create = (index: number) =>
      graphql<{ createTestCase: { id: string; caseNumber: number } }>(
        'mutation($input:CreateTestCaseInput!){createTestCase(input:$input){id caseNumber}}',
        {
          input: {
            projectId: project.id,
            suiteId: suite.id,
            title: `Concurrent case ${index}`,
            priority: index % 2 === 0 ? 'HIGH' : 'LOW',
            severity: 'NORMAL',
            type: 'FUNCTIONAL',
            automationStatus: index === 0 ? 'AUTOMATED' : 'MANUAL',
          },
        },
        member.accessToken,
      );
    const created = await Promise.all(Array.from({ length: 12 }, (_, index) => create(index)));
    const numbers = created.map((item) => item.createTestCase.caseNumber);
    concurrentCaseIds = created.map((item) => item.createTestCase.id);
    expect(new Set(numbers).size).toBe(12);
    const filtered = await graphql<{
      testCases: {
        items: Array<{ title: string; priority: string }>;
        pageInfo: { limit: number; offset: number; total: number };
      };
    }>(
      'query($projectId:UUID!){testCases(projectId:$projectId,filter:{priority:HIGH,search:"Concurrent"},sort:{field:TITLE,direction:ASC},page:{limit:3,offset:0}){items{title priority} pageInfo{limit offset total}}}',
      { projectId: project.id },
      member.accessToken,
    );
    expect(filtered.testCases.items).toHaveLength(3);
    expect(filtered.testCases.items.every((item) => item.priority === 'HIGH')).toBe(true);
    expect(filtered.testCases.pageInfo.total).toBe(6);

    await graphql(
      'mutation($id:UUID!,$assignee:UUID!){updateTestCase(id:$id,input:{assigneeId:$assignee}){id}}',
      { id: testCase.id, assignee: member.user.id },
      member.accessToken,
    );
    const filterCases: Array<{ filter: Record<string, unknown>; minimum: number }> = [
      { filter: { suiteId: suite.id }, minimum: 13 },
      { filter: { tagId: tag.id }, minimum: 1 },
      { filter: { priority: 'HIGH' }, minimum: 7 },
      { filter: { severity: 'CRITICAL' }, minimum: 1 },
      { filter: { type: 'SMOKE' }, minimum: 1 },
      { filter: { automationStatus: 'AUTOMATED' }, minimum: 1 },
      { filter: { assigneeId: member.user.id }, minimum: 1 },
    ];
    for (const entry of filterCases) {
      const result = await graphql<{ testCases: { pageInfo: { total: number } } }>(
        'query($projectId:UUID!,$filter:TestCaseFilter){testCases(projectId:$projectId,filter:$filter){pageInfo{total}}}',
        { projectId: project.id, filter: entry.filter },
        member.accessToken,
      );
      expect(result.testCases.pageInfo.total).toBeGreaterThanOrEqual(entry.minimum);
    }
    const archived = created[0];
    if (!archived) throw new Error('Missing concurrent case');
    await graphql(
      'mutation($id:UUID!){archiveTestCase(id:$id){id}}',
      { id: archived.createTestCase.id },
      member.accessToken,
    );
    const archiveCounts = await graphql<{
      active: { pageInfo: { total: number } };
      all: { pageInfo: { total: number } };
    }>(
      'query($projectId:UUID!){active:testCases(projectId:$projectId){pageInfo{total}} all:testCases(projectId:$projectId,filter:{includeArchived:true}){pageInfo{total}}}',
      { projectId: project.id },
      member.accessToken,
    );
    expect(archiveCounts.all.pageInfo.total - archiveCounts.active.pageInfo.total).toBe(1);

    for (const field of [
      'CASE_NUMBER',
      'TITLE',
      'PRIORITY',
      'SEVERITY',
      'CREATED_AT',
      'UPDATED_AT',
    ]) {
      const sorted = await graphql<{ testCases: { items: Identifier[] } }>(
        'query($projectId:UUID!,$sort:TestCaseSort){testCases(projectId:$projectId,sort:$sort,page:{limit:2}){items{id}}}',
        { projectId: project.id, sort: { field, direction: 'DESC' } },
        member.accessToken,
      );
      expect(sorted.testCases.items).toHaveLength(2);
    }
  });

  it('keeps suite order contiguous and rolls back invalid plan replacements', async () => {
    const rootA = (
      await graphql<{ createTestSuite: Identifier }>(
        'mutation($id:UUID!){createTestSuite(projectId:$id,title:"Root A"){id}}',
        { id: project.id },
        member.accessToken,
      )
    ).createTestSuite;
    const rootB = (
      await graphql<{ createTestSuite: Identifier }>(
        'mutation($id:UUID!){createTestSuite(projectId:$id,title:"Root B"){id}}',
        { id: project.id },
        member.accessToken,
      )
    ).createTestSuite;
    await graphql(
      'mutation($id:UUID!,$parent:UUID!){createTestSuite(projectId:$id,title:"Child",parentId:$parent){id}}',
      { id: project.id, parent: rootA.id },
      member.accessToken,
    );
    await graphql(
      'mutation($suite:UUID!,$parent:UUID!){moveTestSuite(suiteId:$suite,parentId:$parent,position:0){id}}',
      { suite: rootB.id, parent: rootA.id },
      member.accessToken,
    );
    const tree = await graphql<{
      suiteTree: Array<{
        id: string;
        position: number;
        children: Array<{ id: string; position: number }>;
      }>;
    }>(
      'query($id:UUID!){suiteTree(projectId:$id){id position children{id position}}}',
      { id: project.id },
      member.accessToken,
    );
    const parent = tree.suiteTree.find((item) => item.id === rootA.id);
    expect(parent?.children.map((item) => item.position)).toEqual([0, 1]);
    expect(
      await graphqlError(
        'mutation($id:UUID!){deleteTestSuite(id:$id)}',
        { id: rootA.id },
        member.accessToken,
      ),
    ).toBe('SUITE_NOT_EMPTY');
    await graphql(
      'mutation($suite:UUID!){moveTestSuite(suiteId:$suite,parentId:null,position:1){id}}',
      { suite: rootB.id },
      member.accessToken,
    );
    const roots = await graphql<{ suiteTree: Array<{ position: number }> }>(
      'query($id:UUID!){suiteTree(projectId:$id){position}}',
      { id: project.id },
      member.accessToken,
    );
    expect(roots.suiteTree.map((item) => item.position)).toEqual(
      Array.from({ length: roots.suiteTree.length }, (_, index) => index),
    );

    const before = await graphql<{ testPlans: { pageInfo: { total: number } } }>(
      'query($id:UUID!){testPlans(projectId:$id){pageInfo{total}}}',
      { id: project.id },
      member.accessToken,
    );
    expect(
      await graphqlError(
        'mutation($id:UUID!,$cases:[UUID!]!){createTestPlan(projectId:$id,title:"Invalid",testCaseIds:$cases){id}}',
        { id: project.id, cases: [testCase.id, testCase.id] },
        member.accessToken,
      ),
    ).toBe('VALIDATION_ERROR');
    expect(
      await graphqlError(
        'mutation($id:UUID!,$cases:[UUID!]!){replaceTestPlanCases(testPlanId:$id,testCaseIds:$cases){id}}',
        { id: plan.id, cases: [concurrentCaseIds[0]] },
        member.accessToken,
      ),
    ).toBe('VALIDATION_ERROR');
    const after = await graphql<{ testPlans: { pageInfo: { total: number } } }>(
      'query($id:UUID!){testPlans(projectId:$id){pageInfo{total}}}',
      { id: project.id },
      member.accessToken,
    );
    expect(after.testPlans.pageInfo.total).toBe(before.testPlans.pageInfo.total);
  });

  it('calculates all latest-result summary buckets including UNTESTED', async () => {
    const ids = concurrentCaseIds.slice(1, 6);
    expect(ids).toHaveLength(5);
    const run = (
      await graphql<{
        createTestRun: { id: string; cases: Array<Identifier & { steps: Identifier[] }> };
      }>(
        'mutation($input:CreateTestRunInput!){createTestRun(input:$input){id cases{id steps{id}}}}',
        { input: { projectId: project.id, title: 'All statuses', testCaseIds: ids } },
        member.accessToken,
      )
    ).createTestRun;
    const runCase = run.cases[0];
    if (!runCase) throw new Error('Missing retry run case');
    expect(
      await graphqlError(
        'mutation($input:CreateTestResultInput!){createTestResult(input:$input){id}}',
        { input: { runCaseId: runCase.id, status: 'PASSED' } },
        member.accessToken,
      ),
    ).toBe('RUN_STATE_INVALID');
    await graphql(
      'mutation($id:UUID!){startTestRun(id:$id){id}}',
      { id: run.id },
      member.accessToken,
    );
    for (const [index, status] of ['PASSED', 'FAILED', 'BLOCKED', 'SKIPPED'].entries()) {
      const summaryCase = run.cases[index];
      if (!summaryCase) throw new Error('Missing summary run case');
      await graphql(
        'mutation($input:CreateTestResultInput!){createTestResult(input:$input){id}}',
        { input: { runCaseId: summaryCase.id, status } },
        member.accessToken,
      );
    }
    const result = await graphql<{
      runSummary: {
        total: number;
        untested: number;
        passed: number;
        failed: number;
        blocked: number;
        skipped: number;
        executed: number;
        progressPercent: number;
        passRate: number;
      };
    }>(
      'query($id:UUID!){runSummary(runId:$id){total untested passed failed blocked skipped executed progressPercent passRate}}',
      { id: run.id },
      member.accessToken,
    );
    expect(result.runSummary).toEqual({
      total: 5,
      untested: 1,
      passed: 1,
      failed: 1,
      blocked: 1,
      skipped: 1,
      executed: 4,
      progressPercent: 80,
      passRate: 25,
    });
  });

  it('hides every deep resource category from a foreign tenant', async () => {
    const outsider = await graphql<{ login: Auth }>(
      'mutation{login(email:"outsider@example.com",password:"a-secure-password-123"){accessToken refreshToken user{id}}}',
    );
    const checks: Array<{ query: string; variables: Record<string, unknown> }> = [
      { query: 'query($id:UUID!){workspace(id:$id){id}}', variables: { id: workspace.id } },
      {
        query: 'query($id:UUID!){workspaceMembers(workspaceId:$id){pageInfo{total}}}',
        variables: { id: workspace.id },
      },
      { query: 'query($id:UUID!){project(id:$id){id}}', variables: { id: project.id } },
      { query: 'query($id:UUID!){suite(id:$id){id}}', variables: { id: suite.id } },
      { query: 'query($id:UUID!){testCase(id:$id){id}}', variables: { id: testCase.id } },
      { query: 'query($id:UUID!){tags(projectId:$id){id}}', variables: { id: project.id } },
      { query: 'query($id:UUID!){testPlan(id:$id){id}}', variables: { id: plan.id } },
      {
        query: 'query($id:UUID!){environments(projectId:$id){pageInfo{total}}}',
        variables: { id: project.id },
      },
      { query: 'query($id:UUID!){testRun(id:$id){id}}', variables: { id: mainRun.id } },
      { query: 'query($id:UUID!){runCase(id:$id){id}}', variables: { id: mainRunCase.id } },
      {
        query: 'query($id:UUID!){testResults(runCaseId:$id){pageInfo{total}}}',
        variables: { id: mainRunCase.id },
      },
      {
        query: 'mutation($id:UUID!){completeAttachmentUpload(id:$id){id}}',
        variables: { id: mainAttachment.id },
      },
      {
        query: 'mutation($id:UUID!){updateEnvironment(id:$id,input:{name:"Foreign"}){id}}',
        variables: { id: environment.id },
      },
    ];
    for (const check of checks) {
      expect(await graphqlError(check.query, check.variables, outsider.login.accessToken)).toBe(
        'RESOURCE_NOT_FOUND',
      );
    }
  });

  it('preserves append-only attempts and deterministically derives the latest run-case status', async () => {
    const run = (
      await graphql<{
        createTestRun: { id: string; cases: Array<Identifier & { steps: Identifier[] }> };
      }>(
        'mutation($input:CreateTestRunInput!){createTestRun(input:$input){id cases{id steps{id}}}}',
        { input: { projectId: project.id, title: 'Retry run', testCaseIds: [testCase.id] } },
        member.accessToken,
      )
    ).createTestRun;
    const runCase = run.cases[0];
    if (!runCase) throw new Error('Missing retry run case');
    await graphql(
      'mutation($id:UUID!){startTestRun(id:$id){id}}',
      { id: run.id },
      member.accessToken,
    );
    const pending = (
      await graphql<{ presignAttachmentUpload: { attachment: Identifier } }>(
        'mutation($id:UUID!){presignAttachmentUpload(workspaceId:$id,filename:"pending-result.txt",mimeType:"text/plain",size:"4"){attachment{id}}}',
        { id: workspace.id },
        member.accessToken,
      )
    ).presignAttachmentUpload.attachment;
    expect(
      await graphqlError(
        'mutation($input:CreateTestResultInput!){createTestResult(input:$input){id}}',
        {
          input: {
            runCaseId: runCase.id,
            status: 'PASSED',
            attachmentIds: [pending.id],
          },
        },
        member.accessToken,
      ),
    ).toBe('ATTACHMENT_NOT_READY');
    await graphql(
      'mutation($id:UUID!){deleteAttachment(id:$id)}',
      { id: pending.id },
      member.accessToken,
    );
    const foreignStep = mainRunCase.steps[0];
    if (!foreignStep) throw new Error('Missing foreign snapshot step');
    expect(
      await graphqlError(
        'mutation($input:CreateTestResultInput!){createTestResult(input:$input){id}}',
        {
          input: {
            runCaseId: runCase.id,
            status: 'FAILED',
            steps: [{ stepId: foreignStep.id, status: 'FAILED' }],
          },
        },
        member.accessToken,
      ),
    ).toBe('RESOURCE_NOT_FOUND');
    for (const status of ['FAILED', 'PASSED']) {
      await graphql(
        'mutation($input:CreateTestResultInput!){createTestResult(input:$input){id status}}',
        { input: { runCaseId: runCase.id, status } },
        member.accessToken,
      );
    }
    const state = await graphql<{
      runCase: { currentStatus: string };
      testResults: { items: Array<{ status: string }>; pageInfo: { total: number } };
      runSummary: { passed: number; failed: number; executed: number; passRate: number };
    }>(
      'query($caseId:UUID!,$runId:UUID!){runCase(id:$caseId){currentStatus} testResults(runCaseId:$caseId){items{status} pageInfo{total}} runSummary(runId:$runId){passed failed executed passRate}}',
      { caseId: runCase.id, runId: run.id },
      member.accessToken,
    );
    expect(state.testResults.items.map((item) => item.status)).toEqual(['PASSED', 'FAILED']);
    expect(state.testResults.pageInfo.total).toBe(2);
    expect(state.runCase.currentStatus).toBe('PASSED');
    expect(state.runSummary).toEqual({ passed: 1, failed: 0, executed: 1, passRate: 100 });
    await graphql(
      'mutation($id:UUID!){completeTestRun(id:$id){id}}',
      { id: run.id },
      member.accessToken,
    );
    expect(
      await graphqlError(
        'mutation($input:CreateTestResultInput!){createTestResult(input:$input){id}}',
        { input: { runCaseId: runCase.id, status: 'PASSED' } },
        member.accessToken,
      ),
    ).toBe('RUN_STATE_INVALID');
  });

  it('enforces role, last-admin, run-source, and suite-cycle invariants', async () => {
    expect(
      await graphqlError(
        'mutation($id:UUID!){updateWorkspace(id:$id,name:"Denied"){id}}',
        { id: workspace.id },
        member.accessToken,
      ),
    ).toBe('FORBIDDEN');
    expect(
      await graphqlError(
        'mutation($workspaceId:UUID!,$userId:UUID!){removeWorkspaceMember(workspaceId:$workspaceId,userId:$userId)}',
        { workspaceId: workspace.id, userId: admin.user.id },
        admin.accessToken,
      ),
    ).toBe('LAST_ADMIN_REQUIRED');
    expect(
      await graphqlError(
        'mutation($input:CreateTestRunInput!){createTestRun(input:$input){id}}',
        {
          input: {
            projectId: project.id,
            title: 'Invalid source',
            testPlanId: null,
            testCaseIds: null,
          },
        },
        member.accessToken,
      ),
    ).toBe('RUN_SOURCE_INVALID');
    const parent = (
      await graphql<{ createTestSuite: Identifier }>(
        'mutation($id:UUID!){createTestSuite(projectId:$id,title:"Parent"){id}}',
        { id: project.id },
        member.accessToken,
      )
    ).createTestSuite;
    const child = (
      await graphql<{ createTestSuite: Identifier }>(
        'mutation($id:UUID!,$parent:UUID!){createTestSuite(projectId:$id,title:"Child",parentId:$parent){id}}',
        { id: project.id, parent: parent.id },
        member.accessToken,
      )
    ).createTestSuite;
    expect(
      await graphqlError(
        'mutation($suite:UUID!,$parent:UUID!){moveTestSuite(suiteId:$suite,position:0,parentId:$parent){id}}',
        { suite: parent.id, parent: child.id },
        member.accessToken,
      ),
    ).toBe('SUITE_CYCLE');

    const rotated = await graphql<{ refresh: { refreshToken: string } }>(
      'mutation($token:String!){refresh(refreshToken:$token){refreshToken}}',
      { token: admin.refreshToken },
    );
    expect(
      await graphqlError('mutation($token:String!){refresh(refreshToken:$token){refreshToken}}', {
        token: admin.refreshToken,
      }),
    ).toBe('REFRESH_TOKEN_REUSED');
    const { createPrismaClient } = await import('@app/storage');
    const client = createPrismaClient(databaseUrl);
    try {
      expect(
        await client.refreshSession.count({
          where: { userId: admin.user.id, revokedAt: null },
        }),
      ).toBe(0);
      expect(rotated.refresh.refreshToken).not.toBe(admin.refreshToken);
    } finally {
      await client.$disconnect();
    }
  });

  it('covers workspace administration and complete disposable project CRUD lifecycles', async () => {
    const temporaryMember = await register('crud-member@example.com', 'CRUD Member');
    expect(await graphqlError('query { me { id } }', {}, undefined)).toBe('UNAUTHENTICATED');
    expect(
      await graphqlError(
        'mutation { login(email:"missing@example.com",password:"a-secure-password-123"){accessToken} }',
        {},
      ),
    ).toBe('INVALID_CREDENTIALS');
    expect(
      await graphqlError(
        'mutation { register(email:"crud-member@example.com",name:"Duplicate",password:"a-secure-password-123"){accessToken} }',
        {},
      ),
    ).toBe('EMAIL_ALREADY_EXISTS');
    expect(
      await graphqlError(
        'mutation { register(email:"rate-limit@example.com",name:"Rate Limited",password:"a-secure-password-123"){accessToken} }',
        {},
      ),
    ).toBe('RATE_LIMITED');
    const loggedIn = await graphql<{ me: { id: string; email: string } }>(
      'query { me { id email } }',
      {},
      temporaryMember.accessToken,
    );
    expect(loggedIn.me.id).toBe(temporaryMember.user.id);

    await graphql(
      'mutation($workspace:UUID!){addWorkspaceMember(workspaceId:$workspace,email:"crud-member@example.com",role:ADMIN){id role}}',
      { workspace: workspace.id },
      admin.accessToken,
    );
    expect(
      await graphqlError(
        'mutation($workspace:UUID!){addWorkspaceMember(workspaceId:$workspace,email:"CRUD-MEMBER@example.com",role:MEMBER){id}}',
        { workspace: workspace.id },
        admin.accessToken,
      ),
    ).toBe('WORKSPACE_MEMBER_ALREADY_EXISTS');
    const membership = await graphql<{
      workspaceMembers: { items: Array<{ userId: string; role: string; user: { email: string } }> };
    }>(
      'query($workspace:UUID!){workspaceMembers(workspaceId:$workspace,page:{limit:100}){items{userId role user{email}}}}',
      { workspace: workspace.id },
      admin.accessToken,
    );
    expect(
      membership.workspaceMembers.items.find((item) => item.userId === temporaryMember.user.id),
    ).toMatchObject({ role: 'ADMIN', user: { email: 'crud-member@example.com' } });
    await graphql(
      'mutation($workspace:UUID!,$user:UUID!){updateWorkspaceMember(workspaceId:$workspace,userId:$user,role:MEMBER){role}}',
      { workspace: workspace.id, user: temporaryMember.user.id },
      admin.accessToken,
    );
    await graphql(
      'mutation($workspace:UUID!,$user:UUID!){removeWorkspaceMember(workspaceId:$workspace,userId:$user)}',
      { workspace: workspace.id, user: temporaryMember.user.id },
      admin.accessToken,
    );

    await graphql(
      'mutation($id:UUID!){updateWorkspace(id:$id,name:"QA Workspace Renamed"){id name}}',
      { id: workspace.id },
      admin.accessToken,
    );
    const workspaceReads = await graphql<{
      workspace: { name: string };
      workspaces: { items: Identifier[]; pageInfo: { total: number } };
      projects: { items: Identifier[]; pageInfo: { total: number } };
    }>(
      'query($workspace:UUID!){workspace(id:$workspace){name} workspaces(page:{limit:10,offset:0}){items{id} pageInfo{total}} projects(workspaceId:$workspace){items{id} pageInfo{total}}}',
      { workspace: workspace.id },
      admin.accessToken,
    );
    expect(workspaceReads.workspace.name).toBe('QA Workspace Renamed');
    expect(workspaceReads.workspaces.items.some((item) => item.id === workspace.id)).toBe(true);
    expect(workspaceReads.projects.items.some((item) => item.id === project.id)).toBe(true);
    await graphql(
      'mutation($id:UUID!){updateWorkspace(id:$id,name:"QA Workspace"){id}}',
      { id: workspace.id },
      admin.accessToken,
    );

    const disposableProject = (
      await graphql<{ createProject: Identifier & { code: string } }>(
        'mutation($workspace:UUID!){createProject(workspaceId:$workspace,name:"Disposable",code:" crud ",description:"temporary"){id code}}',
        { workspace: workspace.id },
        member.accessToken,
      )
    ).createProject;
    expect(disposableProject.code).toBe('CRUD');
    expect(
      await graphqlError(
        'mutation($workspace:UUID!){createProject(workspaceId:$workspace,name:"Duplicate",code:"CRUD"){id}}',
        { workspace: workspace.id },
        member.accessToken,
      ),
    ).toBe('PROJECT_CODE_ALREADY_EXISTS');
    const updatedProject = (
      await graphql<{ updateProject: { name: string; code: string; description: string | null } }>(
        'mutation($id:UUID!){updateProject(id:$id,input:{name:"Disposable Updated",code:"crud_two",description:null}){name code description}}',
        { id: disposableProject.id },
        member.accessToken,
      )
    ).updateProject;
    expect(updatedProject).toEqual({
      name: 'Disposable Updated',
      code: 'CRUD_TWO',
      description: null,
    });
    expect(
      (
        await graphql<{ project: { code: string } }>(
          'query($id:UUID!){project(id:$id){code}}',
          { id: disposableProject.id },
          member.accessToken,
        )
      ).project.code,
    ).toBe('CRUD_TWO');

    const disposableSuite = (
      await graphql<{ createTestSuite: Identifier }>(
        'mutation($project:UUID!){createTestSuite(projectId:$project,title:"Disposable Suite",description:"old"){id}}',
        { project: disposableProject.id },
        member.accessToken,
      )
    ).createTestSuite;
    const suiteUpdate = await graphql<{ updateTestSuite: { title: string; description: null } }>(
      'mutation($id:UUID!){updateTestSuite(id:$id,input:{title:"Suite Updated",description:null}){title description}}',
      { id: disposableSuite.id },
      member.accessToken,
    );
    expect(suiteUpdate.updateTestSuite).toEqual({ title: 'Suite Updated', description: null });
    expect(
      (
        await graphql<{ suite: { id: string } }>(
          'query($id:UUID!){suite(id:$id){id}}',
          { id: disposableSuite.id },
          member.accessToken,
        )
      ).suite.id,
    ).toBe(disposableSuite.id);

    const disposableTag = (
      await graphql<{ createTag: Identifier }>(
        'mutation($project:UUID!){createTag(projectId:$project,name:"Disposable Tag"){id}}',
        { project: disposableProject.id },
        member.accessToken,
      )
    ).createTag;
    expect(
      await graphqlError(
        'mutation($project:UUID!){createTag(projectId:$project,name:"disposable tag"){id}}',
        { project: disposableProject.id },
        member.accessToken,
      ),
    ).toBe('CONFLICT');
    expect(
      (
        await graphql<{ tags: Identifier[] }>(
          'query($project:UUID!){tags(projectId:$project){id}}',
          { project: disposableProject.id },
          member.accessToken,
        )
      ).tags,
    ).toHaveLength(1);

    const disposableCase = (
      await graphql<{ createTestCase: Identifier & { steps: Identifier[] } }>(
        'mutation($input:CreateTestCaseInput!){createTestCase(input:$input){id steps{id}}}',
        {
          input: {
            projectId: disposableProject.id,
            suiteId: disposableSuite.id,
            title: 'Disposable Case',
            description: 'description',
            preconditions: 'preconditions',
            postconditions: 'postconditions',
            priority: 'LOW',
            severity: 'MINOR',
            type: 'USABILITY',
            automationStatus: 'TO_AUTOMATE',
            assigneeId: member.user.id,
            estimatedDurationSeconds: 30,
            steps: [{ action: 'First', testData: 'data', expectedResult: 'Done' }],
            tagIds: [disposableTag.id],
          },
        },
        member.accessToken,
      )
    ).createTestCase;
    const updatedCase = await graphql<{
      updateTestCase: {
        title: string;
        description: null;
        estimatedDurationSeconds: null;
        automationStatus: string;
      };
    }>(
      'mutation($id:UUID!){updateTestCase(id:$id,input:{title:"Case Updated",description:null,estimatedDurationSeconds:null,automationStatus:AUTOMATED,assigneeId:null}){title description estimatedDurationSeconds automationStatus}}',
      { id: disposableCase.id },
      member.accessToken,
    );
    expect(updatedCase.updateTestCase).toEqual({
      title: 'Case Updated',
      description: null,
      estimatedDurationSeconds: null,
      automationStatus: 'AUTOMATED',
    });
    await graphql(
      'mutation($id:UUID!){replaceTestCaseSteps(testCaseId:$id,steps:[]){id steps{id}}}',
      { id: disposableCase.id },
      member.accessToken,
    );
    await graphql(
      'mutation($id:UUID!){replaceTestCaseTags(testCaseId:$id,tagIds:[]){id tags{id}}}',
      { id: disposableCase.id },
      member.accessToken,
    );
    expect(
      await graphqlError(
        'mutation($id:UUID!){updateTestCase(id:$id,input:{estimatedDurationSeconds:-1}){id}}',
        { id: disposableCase.id },
        member.accessToken,
      ),
    ).toBe('VALIDATION_ERROR');

    const disposablePlan = (
      await graphql<{ createTestPlan: Identifier }>(
        'mutation($project:UUID!,$cases:[UUID!]!){createTestPlan(projectId:$project,title:"Disposable Plan",description:"old",testCaseIds:$cases){id}}',
        { project: disposableProject.id, cases: [disposableCase.id] },
        member.accessToken,
      )
    ).createTestPlan;
    const planReads = await graphql<{
      testPlan: { testCases: Identifier[] };
      testPlans: { pageInfo: { total: number } };
    }>(
      'query($id:UUID!,$project:UUID!){testPlan(id:$id){testCases{id}} testPlans(projectId:$project,page:{limit:10}){pageInfo{total}}}',
      { id: disposablePlan.id, project: disposableProject.id },
      member.accessToken,
    );
    expect(planReads.testPlan.testCases).toHaveLength(1);
    expect(planReads.testPlans.pageInfo.total).toBe(1);
    await graphql(
      'mutation($id:UUID!){updateTestPlan(id:$id,input:{title:"Plan Updated",description:null}){id title description}}',
      { id: disposablePlan.id },
      member.accessToken,
    );
    await graphql(
      'mutation($id:UUID!){replaceTestPlanCases(testPlanId:$id,testCaseIds:[]){id testCases{id}}}',
      { id: disposablePlan.id },
      member.accessToken,
    );
    await graphql(
      'mutation($id:UUID!,$cases:[UUID!]!){replaceTestPlanCases(testPlanId:$id,testCaseIds:$cases){id}}',
      { id: disposablePlan.id, cases: [disposableCase.id] },
      member.accessToken,
    );

    const disposableEnvironment = (
      await graphql<{ createEnvironment: Identifier }>(
        'mutation($project:UUID!){createEnvironment(projectId:$project,name:"Disposable Env",description:"old"){id}}',
        { project: disposableProject.id },
        member.accessToken,
      )
    ).createEnvironment;
    await graphql(
      'mutation($id:UUID!){updateEnvironment(id:$id,input:{name:"Environment Updated",description:null}){id name description}}',
      { id: disposableEnvironment.id },
      member.accessToken,
    );
    expect(
      (
        await graphql<{ environments: { pageInfo: { total: number } } }>(
          'query($project:UUID!){environments(projectId:$project,page:{limit:10}){pageInfo{total}}}',
          { project: disposableProject.id },
          member.accessToken,
        )
      ).environments.pageInfo.total,
    ).toBe(1);

    const disposableRun = (
      await graphql<{ createTestRun: { id: string; cases: Identifier[] } }>(
        'mutation($input:CreateTestRunInput!){createTestRun(input:$input){id cases{id}}}',
        {
          input: {
            projectId: disposableProject.id,
            title: 'Disposable Run',
            testCaseIds: [disposableCase.id],
            environmentId: disposableEnvironment.id,
            defaultAssigneeId: member.user.id,
          },
        },
        member.accessToken,
      )
    ).createTestRun;
    const disposableRunCase = disposableRun.cases[0];
    if (!disposableRunCase) throw new Error('Missing disposable run case');
    await graphql(
      'mutation($id:UUID!){updateTestRun(id:$id,input:{title:"Run Updated",environmentId:null}){id title environmentId}}',
      { id: disposableRun.id },
      member.accessToken,
    );
    await graphql(
      'mutation($id:UUID!,$assignee:UUID!){updateRunCaseAssignee(runCaseId:$id,assigneeId:$assignee){id assigneeId}}',
      { id: disposableRunCase.id, assignee: member.user.id },
      member.accessToken,
    );
    await graphql(
      'mutation($id:UUID!){updateRunCaseAssignee(runCaseId:$id,assigneeId:null){id assigneeId}}',
      { id: disposableRunCase.id },
      member.accessToken,
    );
    const listedRuns = await graphql<{
      testRuns: { items: Identifier[]; pageInfo: { total: number } };
    }>(
      'query($project:UUID!){testRuns(projectId:$project,status:DRAFT,page:{limit:10}){items{id} pageInfo{total}}}',
      { project: disposableProject.id },
      member.accessToken,
    );
    expect(listedRuns.testRuns.items).toHaveLength(1);
    expect(
      await graphql<{ deleteTestRun: boolean }>(
        'mutation($id:UUID!){deleteTestRun(id:$id)}',
        { id: disposableRun.id },
        member.accessToken,
      ),
    ).toEqual({ deleteTestRun: true });

    expect(
      await graphqlError(
        'mutation($id:UUID!){deleteTestRun(id:$id)}',
        { id: mainRun.id },
        member.accessToken,
      ),
    ).toBe('RUN_DELETE_FORBIDDEN');
    expect(
      await graphqlError(
        'mutation($id:UUID!){updateTestRun(id:$id,input:{title:"Nope"}){id}}',
        { id: mainRun.id },
        member.accessToken,
      ),
    ).toBe('RUN_STATE_INVALID');
    expect(
      await graphqlError(
        'mutation($id:UUID!){deleteTestPlan(id:$id)}',
        { id: plan.id },
        member.accessToken,
      ),
    ).toBe('CONFLICT');
    expect(
      await graphqlError(
        'mutation($id:UUID!){deleteEnvironment(id:$id)}',
        { id: environment.id },
        member.accessToken,
      ),
    ).toBe('CONFLICT');
    expect(
      await graphqlError(
        'mutation($id:UUID!){deleteProject(id:$id)}',
        { id: project.id },
        member.accessToken,
      ),
    ).toBe('CONFLICT');

    await graphql(
      'mutation($id:UUID!){deleteTestPlan(id:$id)}',
      { id: disposablePlan.id },
      member.accessToken,
    );
    await graphql(
      'mutation($id:UUID!){deleteEnvironment(id:$id)}',
      { id: disposableEnvironment.id },
      member.accessToken,
    );
    await graphql(
      'mutation($id:UUID!){deleteTestCase(id:$id)}',
      { id: disposableCase.id },
      member.accessToken,
    );
    await graphql(
      'mutation($id:UUID!){deleteTag(id:$id)}',
      { id: disposableTag.id },
      member.accessToken,
    );
    await graphql(
      'mutation($id:UUID!){deleteTestSuite(id:$id)}',
      { id: disposableSuite.id },
      member.accessToken,
    );
    const archivedOnce = await graphql<{ archiveProject: { archivedAt: string } }>(
      'mutation($id:UUID!){archiveProject(id:$id){archivedAt}}',
      { id: disposableProject.id },
      member.accessToken,
    );
    const archivedTwice = await graphql<{ archiveProject: { archivedAt: string } }>(
      'mutation($id:UUID!){archiveProject(id:$id){archivedAt}}',
      { id: disposableProject.id },
      member.accessToken,
    );
    expect(archivedTwice.archiveProject.archivedAt).toBe(archivedOnce.archiveProject.archivedAt);
    expect(
      await graphqlError(
        'mutation($project:UUID!){createTestSuite(projectId:$project,title:"Nope"){id}}',
        { project: disposableProject.id },
        member.accessToken,
      ),
    ).toBe('PROJECT_ARCHIVED');
    await graphql(
      'mutation($id:UUID!){deleteProject(id:$id)}',
      { id: disposableProject.id },
      member.accessToken,
    );

    expect(
      await graphql<{ logout: boolean }>('mutation { logout(refreshToken:"invalid") }'),
    ).toEqual({ logout: true });
  });

  it('retains an object-deletion outbox record when object storage is unavailable', async () => {
    const pending = (
      await graphql<{ presignAttachmentUpload: { attachment: Identifier } }>(
        'mutation($id:UUID!){presignAttachmentUpload(workspaceId:$id,filename:"pending.txt",mimeType:"text/plain",size:"4"){attachment{id}}}',
        { id: workspace.id },
        member.accessToken,
      )
    ).presignAttachmentUpload.attachment;
    await minio.stop();
    minioStopped = true;
    await graphql(
      'mutation($id:UUID!){deleteAttachment(id:$id)}',
      { id: pending.id },
      member.accessToken,
    );
    const { createPrismaClient } = await import('@app/storage');
    const client = createPrismaClient(databaseUrl);
    try {
      expect(await client.attachment.count({ where: { id: pending.id } })).toBe(0);
      expect(await client.objectDeletion.count({ where: { attachmentId: pending.id } })).toBe(1);
      await graphql(
        'mutation($id:UUID!){deleteWorkspace(workspaceId:$id,confirmationName:"QA Workspace")}',
        { id: workspace.id },
        admin.accessToken,
      );
      expect(await client.workspace.count({ where: { id: workspace.id } })).toBe(0);
      expect(await client.project.count({ where: { id: project.id } })).toBe(0);
      expect(await client.testResult.count()).toBe(0);
      expect(await client.objectDeletion.count()).toBeGreaterThanOrEqual(2);
    } finally {
      await client.$disconnect();
    }
  });
});
