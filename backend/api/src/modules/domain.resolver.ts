import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';

import { UserLoader } from '../common/user.loader.js';
import type {
  CreateTestCaseInput,
  CreateTestResultInput,
  CreateTestRunInput,
  PageInput,
  TestCaseFilter,
  TestCaseSort,
  TestStepInput,
  UpdateEnvironmentInput,
  UpdateProjectInput,
  UpdateTestCaseInput,
  UpdateTestPlanInput,
  UpdateTestRunInput,
  UpdateTestSuiteInput,
  User,
} from '../generated/graphql.js';
import { TestRunStatus, WorkspaceRole } from '../generated/graphql.js';
import { AnalyticsService } from './analytics/analytics.service.js';
import { AttachmentsService } from './attachments/attachments.service.js';
import { CurrentUser } from './auth/current-user.decorator.js';
import type { AuthenticatedUser } from './auth/auth.types.js';
import { EnvironmentsService } from './environments/environments.service.js';
import { PlansService } from './plans/plans.service.js';
import { ProjectsService } from './projects/projects.service.js';
import { ResultsService } from './results/results.service.js';
import { RunsService } from './runs/runs.service.js';
import { SuitesService } from './suites/suites.service.js';
import { TestCasesService } from './test-cases/test-cases.service.js';
import { WorkspacesService } from './workspaces/workspaces.service.js';

@Resolver()
export class DomainResolver {
  public constructor(
    private readonly workspaces: WorkspacesService,
    private readonly projectsService: ProjectsService,
    private readonly suites: SuitesService,
    private readonly cases: TestCasesService,
    private readonly plans: PlansService,
    private readonly environmentsService: EnvironmentsService,
    private readonly runs: RunsService,
    private readonly results: ResultsService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Query() public async me(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.workspaces.me(user.id);
  }
  @Query('workspaces') public workspacesList(
    @CurrentUser() user: AuthenticatedUser,
    @Args('page') page?: PageInput,
  ) {
    return this.workspaces.list(user.id, page);
  }
  @Query('workspace') public workspace(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
  ) {
    return this.workspaces.get(user.id, id);
  }
  @Query() public workspaceMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Args('workspaceId') workspaceId: string,
    @Args('page') page?: PageInput,
  ) {
    return this.workspaces.members(user.id, workspaceId, page);
  }
  @Query() public projects(
    @CurrentUser() user: AuthenticatedUser,
    @Args('workspaceId') workspaceId: string,
    @Args('page') page?: PageInput,
  ) {
    return this.projectsService.list(user.id, workspaceId, page);
  }
  @Query() public project(@CurrentUser() user: AuthenticatedUser, @Args('id') id: string) {
    return this.projectsService.get(user.id, id);
  }
  @Query() public suite(@CurrentUser() user: AuthenticatedUser, @Args('id') id: string) {
    return this.suites.get(user.id, id);
  }
  @Query() public suiteTree(
    @CurrentUser() user: AuthenticatedUser,
    @Args('projectId') projectId: string,
  ) {
    return this.suites.tree(user.id, projectId);
  }
  @Query() public testCase(@CurrentUser() user: AuthenticatedUser, @Args('id') id: string) {
    return this.cases.get(user.id, id);
  }
  @Query() public testCases(
    @CurrentUser() user: AuthenticatedUser,
    @Args('projectId') projectId: string,
    @Args('filter') filter?: TestCaseFilter,
    @Args('sort') sort?: TestCaseSort,
    @Args('page') page?: PageInput,
  ) {
    return this.cases.list(user.id, projectId, filter, sort, page);
  }
  @Query() public tags(
    @CurrentUser() user: AuthenticatedUser,
    @Args('projectId') projectId: string,
  ) {
    return this.cases.tags(user.id, projectId);
  }
  @Query() public testPlan(@CurrentUser() user: AuthenticatedUser, @Args('id') id: string) {
    return this.plans.get(user.id, id);
  }
  @Query() public testPlans(
    @CurrentUser() user: AuthenticatedUser,
    @Args('projectId') projectId: string,
    @Args('page') page?: PageInput,
  ) {
    return this.plans.list(user.id, projectId, page);
  }
  @Query() public environments(
    @CurrentUser() user: AuthenticatedUser,
    @Args('projectId') projectId: string,
    @Args('page') page?: PageInput,
  ) {
    return this.environmentsService.list(user.id, projectId, page);
  }
  @Query() public testRun(@CurrentUser() user: AuthenticatedUser, @Args('id') id: string) {
    return this.runs.get(user.id, id);
  }
  @Query() public testRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Args('projectId') projectId: string,
    @Args('status') status?: TestRunStatus,
    @Args('page') page?: PageInput,
  ) {
    return this.runs.list(user.id, projectId, status, page);
  }
  @Query() public runCase(@CurrentUser() user: AuthenticatedUser, @Args('id') id: string) {
    return this.runs.runCase(user.id, id);
  }
  @Query() public testResults(
    @CurrentUser() user: AuthenticatedUser,
    @Args('runCaseId') runCaseId: string,
    @Args('page') page?: PageInput,
  ) {
    return this.results.list(user.id, runCaseId, page);
  }
  @Query() public runSummary(@CurrentUser() user: AuthenticatedUser, @Args('runId') runId: string) {
    return this.analytics.summary(user.id, runId);
  }
  @Query() public projectDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Args('projectId') projectId: string,
  ) {
    return this.analytics.dashboard(user.id, projectId);
  }

  @Mutation() public createWorkspace(
    @CurrentUser() user: AuthenticatedUser,
    @Args('name') name: string,
  ) {
    return this.workspaces.create(user.id, name);
  }
  @Mutation() public updateWorkspace(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
    @Args('name') name: string,
  ) {
    return this.workspaces.update(user.id, id, name);
  }
  @Mutation() public deleteWorkspace(
    @CurrentUser() user: AuthenticatedUser,
    @Args('workspaceId') workspaceId: string,
    @Args('confirmationName') confirmationName: string,
  ) {
    return this.workspaces.delete(user.id, workspaceId, confirmationName);
  }
  @Mutation() public addWorkspaceMember(
    @CurrentUser() user: AuthenticatedUser,
    @Args('workspaceId') workspaceId: string,
    @Args('email') email: string,
    @Args('role') role: WorkspaceRole,
  ) {
    return this.workspaces.addMember(user.id, workspaceId, email, role);
  }
  @Mutation() public updateWorkspaceMember(
    @CurrentUser() user: AuthenticatedUser,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string,
    @Args('role') role: WorkspaceRole,
  ) {
    return this.workspaces.updateMember(user.id, workspaceId, userId, role);
  }
  @Mutation() public removeWorkspaceMember(
    @CurrentUser() user: AuthenticatedUser,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string,
  ) {
    return this.workspaces.removeMember(user.id, workspaceId, userId);
  }
  @Mutation() public createProject(
    @CurrentUser() user: AuthenticatedUser,
    @Args('workspaceId') workspaceId: string,
    @Args('name') name: string,
    @Args('code') code: string,
    @Args('description') description?: string | null,
  ) {
    return this.projectsService.create(user.id, workspaceId, name, code, description);
  }
  @Mutation() public updateProject(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
    @Args('input') input: UpdateProjectInput,
  ) {
    return this.projectsService.update(user.id, id, input);
  }
  @Mutation() public archiveProject(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
  ) {
    return this.projectsService.archive(user.id, id);
  }
  @Mutation() public deleteProject(@CurrentUser() user: AuthenticatedUser, @Args('id') id: string) {
    return this.projectsService.delete(user.id, id);
  }
  @Mutation() public createTestSuite(
    @CurrentUser() user: AuthenticatedUser,
    @Args('projectId') projectId: string,
    @Args('parentId') parentId: string | null | undefined,
    @Args('title') title: string,
    @Args('description') description?: string | null,
    @Args('position') position?: number | null,
  ) {
    return this.suites.create(user.id, projectId, parentId, title, description, position);
  }
  @Mutation() public updateTestSuite(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
    @Args('input') input: UpdateTestSuiteInput,
  ) {
    return this.suites.update(user.id, id, input);
  }
  @Mutation() public moveTestSuite(
    @CurrentUser() user: AuthenticatedUser,
    @Args('suiteId') suiteId: string,
    @Args('parentId') parentId: string | null | undefined,
    @Args('position') position: number,
  ) {
    return this.suites.move(user.id, suiteId, parentId, position);
  }
  @Mutation() public deleteTestSuite(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
  ) {
    return this.suites.delete(user.id, id);
  }
  @Mutation() public createTestCase(
    @CurrentUser() user: AuthenticatedUser,
    @Args('input') input: CreateTestCaseInput,
  ) {
    return this.cases.create(user.id, input);
  }
  @Mutation() public updateTestCase(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
    @Args('input') input: UpdateTestCaseInput,
  ) {
    return this.cases.update(user.id, id, input);
  }
  @Mutation() public archiveTestCase(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
  ) {
    return this.cases.archive(user.id, id);
  }
  @Mutation() public deleteTestCase(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
  ) {
    return this.cases.delete(user.id, id);
  }
  @Mutation() public replaceTestCaseSteps(
    @CurrentUser() user: AuthenticatedUser,
    @Args('testCaseId') testCaseId: string,
    @Args('steps') steps: TestStepInput[],
  ) {
    return this.cases.replaceSteps(user.id, testCaseId, steps);
  }
  @Mutation() public replaceTestCaseTags(
    @CurrentUser() user: AuthenticatedUser,
    @Args('testCaseId') testCaseId: string,
    @Args('tagIds') tagIds: string[],
  ) {
    return this.cases.replaceTags(user.id, testCaseId, tagIds);
  }
  @Mutation() public createTag(
    @CurrentUser() user: AuthenticatedUser,
    @Args('projectId') projectId: string,
    @Args('name') name: string,
  ) {
    return this.cases.createTag(user.id, projectId, name);
  }
  @Mutation() public deleteTag(@CurrentUser() user: AuthenticatedUser, @Args('id') id: string) {
    return this.cases.deleteTag(user.id, id);
  }
  @Mutation() public createTestPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Args('projectId') projectId: string,
    @Args('title') title: string,
    @Args('description') description: string | null | undefined,
    @Args('testCaseIds') testCaseIds: string[],
  ) {
    return this.plans.create(user.id, projectId, title, description, testCaseIds);
  }
  @Mutation() public updateTestPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
    @Args('input') input: UpdateTestPlanInput,
  ) {
    return this.plans.update(user.id, id, input);
  }
  @Mutation() public replaceTestPlanCases(
    @CurrentUser() user: AuthenticatedUser,
    @Args('testPlanId') testPlanId: string,
    @Args('testCaseIds') testCaseIds: string[],
  ) {
    return this.plans.replaceCases(user.id, testPlanId, testCaseIds);
  }
  @Mutation() public deleteTestPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
  ) {
    return this.plans.delete(user.id, id);
  }
  @Mutation() public createEnvironment(
    @CurrentUser() user: AuthenticatedUser,
    @Args('projectId') projectId: string,
    @Args('name') name: string,
    @Args('description') description?: string | null,
  ) {
    return this.environmentsService.create(user.id, projectId, name, description);
  }
  @Mutation() public updateEnvironment(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
    @Args('input') input: UpdateEnvironmentInput,
  ) {
    return this.environmentsService.update(user.id, id, input);
  }
  @Mutation() public deleteEnvironment(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
  ) {
    return this.environmentsService.delete(user.id, id);
  }
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Mutation()
  public createTestRun(
    @CurrentUser() user: AuthenticatedUser,
    @Args('input') input: CreateTestRunInput,
  ) {
    return this.runs.create(user.id, input);
  }
  @Mutation() public updateTestRun(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
    @Args('input') input: UpdateTestRunInput,
  ) {
    return this.runs.update(user.id, id, input);
  }
  @Mutation() public startTestRun(@CurrentUser() user: AuthenticatedUser, @Args('id') id: string) {
    return this.runs.start(user.id, id);
  }
  @Mutation() public completeTestRun(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id') id: string,
  ) {
    return this.runs.complete(user.id, id);
  }
  @Mutation() public deleteTestRun(@CurrentUser() user: AuthenticatedUser, @Args('id') id: string) {
    return this.runs.delete(user.id, id);
  }
  @Mutation() public updateRunCaseAssignee(
    @CurrentUser() user: AuthenticatedUser,
    @Args('runCaseId') runCaseId: string,
    @Args('assigneeId') assigneeId?: string | null,
  ) {
    return this.runs.updateAssignee(user.id, runCaseId, assigneeId);
  }
  @Mutation() public assignRunCases(
    @CurrentUser() user: AuthenticatedUser,
    @Args('runId') runId: string,
    @Args('assigneeId') assigneeId: string | null | undefined,
    @Args('runCaseIds') runCaseIds?: string[] | null,
  ) {
    return this.runs.assign(user.id, runId, assigneeId, runCaseIds);
  }
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Mutation()
  public createTestResult(
    @CurrentUser() user: AuthenticatedUser,
    @Args('input') input: CreateTestResultInput,
  ) {
    return this.results.create(user.id, input);
  }
}

@Resolver('Attachment')
export class AttachmentResolver {
  public constructor(private readonly attachments: AttachmentsService) {}

  @ResolveField()
  public downloadUrl(@CurrentUser() user: AuthenticatedUser, @Parent() attachment: { id: string }) {
    return this.attachments.downloadUrl(user.id, attachment.id);
  }

  @Mutation()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  public presignAttachmentUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Args('workspaceId') workspaceId: string,
    @Args('filename') filename: string,
    @Args('mimeType') mimeType: string,
    @Args('size') size: bigint,
  ) {
    return this.attachments.presign(user.id, workspaceId, filename, mimeType, size);
  }

  @Mutation()
  public completeAttachmentUpload(@CurrentUser() user: AuthenticatedUser, @Args('id') id: string) {
    return this.attachments.complete(user.id, id);
  }

  @Mutation()
  public deleteAttachment(@CurrentUser() user: AuthenticatedUser, @Args('id') id: string) {
    return this.attachments.delete(user.id, id);
  }
}

@Resolver('WorkspaceMember')
export class WorkspaceMemberResolver {
  public constructor(private readonly users: UserLoader) {}

  @ResolveField()
  public user(@Parent() membership: { userId: string }) {
    return this.users.load(membership.userId);
  }
}
