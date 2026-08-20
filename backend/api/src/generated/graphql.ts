
/*
 * -------------------------------------------------------
 * THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT MODIFY)
 * -------------------------------------------------------
 */

/* tslint:disable */
/* eslint-disable */

export enum WorkspaceRole {
    ADMIN = "ADMIN",
    MEMBER = "MEMBER"
}

export enum TestCasePriority {
    HIGH = "HIGH",
    MEDIUM = "MEDIUM",
    LOW = "LOW"
}

export enum TestCaseSeverity {
    BLOCKER = "BLOCKER",
    CRITICAL = "CRITICAL",
    MAJOR = "MAJOR",
    NORMAL = "NORMAL",
    MINOR = "MINOR",
    TRIVIAL = "TRIVIAL"
}

export enum TestCaseType {
    FUNCTIONAL = "FUNCTIONAL",
    SMOKE = "SMOKE",
    REGRESSION = "REGRESSION",
    SECURITY = "SECURITY",
    PERFORMANCE = "PERFORMANCE",
    USABILITY = "USABILITY",
    COMPATIBILITY = "COMPATIBILITY",
    OTHER = "OTHER"
}

export enum AutomationStatus {
    MANUAL = "MANUAL",
    TO_AUTOMATE = "TO_AUTOMATE",
    AUTOMATED = "AUTOMATED",
    CANNOT_AUTOMATE = "CANNOT_AUTOMATE"
}

export enum TestRunStatus {
    DRAFT = "DRAFT",
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED"
}

export enum TestResultStatus {
    PASSED = "PASSED",
    FAILED = "FAILED",
    BLOCKED = "BLOCKED",
    SKIPPED = "SKIPPED"
}

export enum CurrentRunCaseStatus {
    UNTESTED = "UNTESTED",
    PASSED = "PASSED",
    FAILED = "FAILED",
    BLOCKED = "BLOCKED",
    SKIPPED = "SKIPPED"
}

export enum AttachmentStatus {
    PENDING = "PENDING",
    READY = "READY"
}

export enum TestCaseSortField {
    CASE_NUMBER = "CASE_NUMBER",
    TITLE = "TITLE",
    PRIORITY = "PRIORITY",
    SEVERITY = "SEVERITY",
    CREATED_AT = "CREATED_AT",
    UPDATED_AT = "UPDATED_AT"
}

export enum SortDirection {
    ASC = "ASC",
    DESC = "DESC"
}

export interface PageInput {
    limit?: Nullable<number>;
    offset?: Nullable<number>;
}

export interface UpdateProjectInput {
    name?: Nullable<string>;
    code?: Nullable<string>;
    description?: Nullable<string>;
}

export interface UpdateTestSuiteInput {
    title?: Nullable<string>;
    description?: Nullable<string>;
}

export interface TestStepInput {
    action: string;
    testData?: Nullable<string>;
    expectedResult: string;
}

export interface CreateTestCaseInput {
    projectId: UUID;
    suiteId: UUID;
    title: string;
    description?: Nullable<string>;
    preconditions?: Nullable<string>;
    postconditions?: Nullable<string>;
    priority: TestCasePriority;
    severity: TestCaseSeverity;
    type: TestCaseType;
    automationStatus: AutomationStatus;
    assigneeId?: Nullable<UUID>;
    estimatedDurationSeconds?: Nullable<number>;
    steps?: Nullable<TestStepInput[]>;
    tagIds?: Nullable<UUID[]>;
}

export interface UpdateTestCaseInput {
    suiteId?: Nullable<UUID>;
    title?: Nullable<string>;
    description?: Nullable<string>;
    preconditions?: Nullable<string>;
    postconditions?: Nullable<string>;
    priority?: Nullable<TestCasePriority>;
    severity?: Nullable<TestCaseSeverity>;
    type?: Nullable<TestCaseType>;
    automationStatus?: Nullable<AutomationStatus>;
    assigneeId?: Nullable<UUID>;
    estimatedDurationSeconds?: Nullable<number>;
}

export interface TestCaseFilter {
    suiteId?: Nullable<UUID>;
    tagId?: Nullable<UUID>;
    priority?: Nullable<TestCasePriority>;
    severity?: Nullable<TestCaseSeverity>;
    type?: Nullable<TestCaseType>;
    automationStatus?: Nullable<AutomationStatus>;
    assigneeId?: Nullable<UUID>;
    search?: Nullable<string>;
    includeArchived?: Nullable<boolean>;
}

export interface TestCaseSort {
    field: TestCaseSortField;
    direction: SortDirection;
}

export interface UpdateTestPlanInput {
    title?: Nullable<string>;
    description?: Nullable<string>;
}

export interface UpdateEnvironmentInput {
    name?: Nullable<string>;
    description?: Nullable<string>;
}

export interface CreateTestRunInput {
    projectId: UUID;
    title: string;
    testPlanId?: Nullable<UUID>;
    testCaseIds?: Nullable<UUID[]>;
    environmentId?: Nullable<UUID>;
    defaultAssigneeId?: Nullable<UUID>;
}

export interface UpdateTestRunInput {
    title?: Nullable<string>;
    environmentId?: Nullable<UUID>;
}

export interface TestStepResultInput {
    stepId: UUID;
    status: TestResultStatus;
    actualResult?: Nullable<string>;
}

export interface CreateTestResultInput {
    runCaseId: UUID;
    status: TestResultStatus;
    comment?: Nullable<string>;
    durationSeconds?: Nullable<number>;
    steps?: Nullable<TestStepResultInput[]>;
    attachmentIds?: Nullable<UUID[]>;
}

export interface PageInfo {
    __typename?: 'PageInfo';
    limit: number;
    offset: number;
    total: number;
}

export interface User {
    __typename?: 'User';
    id: UUID;
    email: string;
    name: string;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface AuthPayload {
    __typename?: 'AuthPayload';
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: DateTime;
    refreshTokenExpiresAt: DateTime;
    user: User;
}

export interface Workspace {
    __typename?: 'Workspace';
    id: UUID;
    name: string;
    createdBy: UUID;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface WorkspaceMember {
    __typename?: 'WorkspaceMember';
    id: UUID;
    workspaceId: UUID;
    userId: UUID;
    role: WorkspaceRole;
    user: User;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface WorkspaceConnection {
    __typename?: 'WorkspaceConnection';
    items: Workspace[];
    pageInfo: PageInfo;
}

export interface WorkspaceMemberConnection {
    __typename?: 'WorkspaceMemberConnection';
    items: WorkspaceMember[];
    pageInfo: PageInfo;
}

export interface Project {
    __typename?: 'Project';
    id: UUID;
    workspaceId: UUID;
    name: string;
    code: string;
    description?: Nullable<string>;
    archivedAt?: Nullable<DateTime>;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface ProjectConnection {
    __typename?: 'ProjectConnection';
    items: Project[];
    pageInfo: PageInfo;
}

export interface TestSuite {
    __typename?: 'TestSuite';
    id: UUID;
    projectId: UUID;
    parentId?: Nullable<UUID>;
    title: string;
    description?: Nullable<string>;
    position: number;
    children: TestSuite[];
    archivedAt?: Nullable<DateTime>;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface TestStep {
    __typename?: 'TestStep';
    id: UUID;
    testCaseId: UUID;
    position: number;
    action: string;
    testData?: Nullable<string>;
    expectedResult: string;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface Tag {
    __typename?: 'Tag';
    id: UUID;
    projectId: UUID;
    name: string;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface TestCase {
    __typename?: 'TestCase';
    id: UUID;
    projectId: UUID;
    suiteId: UUID;
    caseNumber: number;
    displayId: string;
    title: string;
    description?: Nullable<string>;
    preconditions?: Nullable<string>;
    postconditions?: Nullable<string>;
    priority: TestCasePriority;
    severity: TestCaseSeverity;
    type: TestCaseType;
    automationStatus: AutomationStatus;
    assigneeId?: Nullable<UUID>;
    estimatedDurationSeconds?: Nullable<number>;
    createdBy: UUID;
    archivedAt?: Nullable<DateTime>;
    steps: TestStep[];
    tags: Tag[];
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface TestCaseConnection {
    __typename?: 'TestCaseConnection';
    items: TestCase[];
    pageInfo: PageInfo;
}

export interface TestPlan {
    __typename?: 'TestPlan';
    id: UUID;
    projectId: UUID;
    title: string;
    description?: Nullable<string>;
    testCases: TestCase[];
    sourceSuites: TestSuite[];
    manualCaseIds: UUID[];
    activeCaseCount: number;
    archivedCaseCount: number;
    createdBy: UUID;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface TestPlanSourceChangePreview {
    __typename?: 'TestPlanSourceChangePreview';
    removedCaseCount: number;
}

export interface TestPlanSyncAffectedPlan {
    __typename?: 'TestPlanSyncAffectedPlan';
    planId: UUID;
    title: string;
    addedCaseCount: number;
    removedCaseCount: number;
}

export interface TestPlanSourceSyncResult {
    __typename?: 'TestPlanSourceSyncResult';
    testPlan: TestPlan;
    addedCaseCount: number;
    removedCaseCount: number;
    affectedPlans: TestPlanSyncAffectedPlan[];
}

export interface ArchiveImpactPlan {
    __typename?: 'ArchiveImpactPlan';
    planId: UUID;
    title: string;
    affectedCaseCount: number;
}

export interface ArchiveImpactPreview {
    __typename?: 'ArchiveImpactPreview';
    suiteCount: number;
    caseCount: number;
    affectedPlans: ArchiveImpactPlan[];
}

export interface TestPlanConnection {
    __typename?: 'TestPlanConnection';
    items: TestPlan[];
    pageInfo: PageInfo;
}

export interface Environment {
    __typename?: 'Environment';
    id: UUID;
    projectId: UUID;
    name: string;
    description?: Nullable<string>;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface EnvironmentConnection {
    __typename?: 'EnvironmentConnection';
    items: Environment[];
    pageInfo: PageInfo;
}

export interface TestRunCaseStep {
    __typename?: 'TestRunCaseStep';
    id: UUID;
    testRunCaseId: UUID;
    sourceTestStepId?: Nullable<UUID>;
    position: number;
    action: string;
    testData?: Nullable<string>;
    expectedResult: string;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface TestRunCase {
    __typename?: 'TestRunCase';
    id: UUID;
    testRunId: UUID;
    projectId: UUID;
    sourceTestCaseId: UUID;
    assigneeId?: Nullable<UUID>;
    caseNumber: number;
    displayId: string;
    title: string;
    description?: Nullable<string>;
    preconditions?: Nullable<string>;
    postconditions?: Nullable<string>;
    priority: TestCasePriority;
    severity: TestCaseSeverity;
    type: TestCaseType;
    automationStatus: AutomationStatus;
    estimatedDurationSeconds?: Nullable<number>;
    position: number;
    currentStatus: CurrentRunCaseStatus;
    steps: TestRunCaseStep[];
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface TestRun {
    __typename?: 'TestRun';
    id: UUID;
    projectId: UUID;
    testPlanId?: Nullable<UUID>;
    environmentId?: Nullable<UUID>;
    title: string;
    status: TestRunStatus;
    createdBy: UUID;
    startedAt?: Nullable<DateTime>;
    completedAt?: Nullable<DateTime>;
    cases: TestRunCase[];
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface TestRunConnection {
    __typename?: 'TestRunConnection';
    items: TestRun[];
    pageInfo: PageInfo;
}

export interface TestResult {
    __typename?: 'TestResult';
    id: UUID;
    testRunCaseId: UUID;
    status: TestResultStatus;
    executedBy: UUID;
    comment?: Nullable<string>;
    durationSeconds?: Nullable<number>;
    stepResults: TestStepResult[];
    attachments: Attachment[];
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface TestStepResult {
    __typename?: 'TestStepResult';
    id: UUID;
    testResultId: UUID;
    testRunCaseStepId: UUID;
    status: TestResultStatus;
    actualResult?: Nullable<string>;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface TestResultConnection {
    __typename?: 'TestResultConnection';
    items: TestResult[];
    pageInfo: PageInfo;
}

export interface Attachment {
    __typename?: 'Attachment';
    id: UUID;
    workspaceId: UUID;
    uploadedBy: UUID;
    filename: string;
    mimeType: string;
    size: BigInt;
    status: AttachmentStatus;
    downloadUrl?: Nullable<string>;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface PresignedUpload {
    __typename?: 'PresignedUpload';
    attachment: Attachment;
    url: string;
    method: string;
    headers: UploadHeader[];
    expiresAt: DateTime;
}

export interface UploadHeader {
    __typename?: 'UploadHeader';
    name: string;
    value: string;
}

export interface RunSummary {
    __typename?: 'RunSummary';
    total: number;
    untested: number;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
    executed: number;
    progressPercent: number;
    passRate: number;
}

export interface ProjectDashboard {
    __typename?: 'ProjectDashboard';
    totalTestCases: number;
    manualTestCases: number;
    automatedTestCases: number;
    latestRuns: TestRun[];
    runsLast30Days: number;
    averagePassRate: number;
}

export interface IQuery {
    __typename?: 'IQuery';
    me(): User | Promise<User>;
    workspaces(page?: Nullable<PageInput>): WorkspaceConnection | Promise<WorkspaceConnection>;
    workspace(id: UUID): Workspace | Promise<Workspace>;
    workspaceMembers(workspaceId: UUID, page?: Nullable<PageInput>): WorkspaceMemberConnection | Promise<WorkspaceMemberConnection>;
    projects(workspaceId: UUID, page?: Nullable<PageInput>): ProjectConnection | Promise<ProjectConnection>;
    project(id: UUID): Project | Promise<Project>;
    suite(id: UUID): TestSuite | Promise<TestSuite>;
    suiteTree(projectId: UUID, includeArchived?: Nullable<boolean>): TestSuite[] | Promise<TestSuite[]>;
    suiteArchivePreview(id: UUID): ArchiveImpactPreview | Promise<ArchiveImpactPreview>;
    testCase(id: UUID): TestCase | Promise<TestCase>;
    testCases(projectId: UUID, filter?: Nullable<TestCaseFilter>, sort?: Nullable<TestCaseSort>, page?: Nullable<PageInput>): TestCaseConnection | Promise<TestCaseConnection>;
    testCaseArchivePreview(id: UUID): ArchiveImpactPreview | Promise<ArchiveImpactPreview>;
    tags(projectId: UUID): Tag[] | Promise<Tag[]>;
    testPlan(id: UUID): TestPlan | Promise<TestPlan>;
    testPlans(projectId: UUID, page?: Nullable<PageInput>): TestPlanConnection | Promise<TestPlanConnection>;
    planSourceChangePreview(testPlanId: UUID, sourceSuiteIds: UUID[]): TestPlanSourceChangePreview | Promise<TestPlanSourceChangePreview>;
    environments(projectId: UUID, page?: Nullable<PageInput>): EnvironmentConnection | Promise<EnvironmentConnection>;
    testRun(id: UUID): TestRun | Promise<TestRun>;
    testRuns(projectId: UUID, status?: Nullable<TestRunStatus>, page?: Nullable<PageInput>): TestRunConnection | Promise<TestRunConnection>;
    runCase(id: UUID): TestRunCase | Promise<TestRunCase>;
    testResults(runCaseId: UUID, page?: Nullable<PageInput>): TestResultConnection | Promise<TestResultConnection>;
    runSummary(runId: UUID): RunSummary | Promise<RunSummary>;
    projectDashboard(projectId: UUID): ProjectDashboard | Promise<ProjectDashboard>;
}

export interface IMutation {
    __typename?: 'IMutation';
    register(email: string, name: string, password: string): AuthPayload | Promise<AuthPayload>;
    login(email: string, password: string): AuthPayload | Promise<AuthPayload>;
    refresh(refreshToken: string): AuthPayload | Promise<AuthPayload>;
    logout(refreshToken: string): boolean | Promise<boolean>;
    createWorkspace(name: string): Workspace | Promise<Workspace>;
    updateWorkspace(id: UUID, name: string): Workspace | Promise<Workspace>;
    deleteWorkspace(workspaceId: UUID, confirmationName: string): boolean | Promise<boolean>;
    addWorkspaceMember(workspaceId: UUID, email: string, role: WorkspaceRole): WorkspaceMember | Promise<WorkspaceMember>;
    updateWorkspaceMember(workspaceId: UUID, userId: UUID, role: WorkspaceRole): WorkspaceMember | Promise<WorkspaceMember>;
    removeWorkspaceMember(workspaceId: UUID, userId: UUID): boolean | Promise<boolean>;
    createProject(workspaceId: UUID, name: string, code: string, description?: Nullable<string>): Project | Promise<Project>;
    updateProject(id: UUID, input: UpdateProjectInput): Project | Promise<Project>;
    archiveProject(id: UUID): Project | Promise<Project>;
    deleteProject(id: UUID): boolean | Promise<boolean>;
    createTestSuite(projectId: UUID, title: string, parentId?: Nullable<UUID>, description?: Nullable<string>, position?: Nullable<number>): TestSuite | Promise<TestSuite>;
    updateTestSuite(id: UUID, input: UpdateTestSuiteInput): TestSuite | Promise<TestSuite>;
    moveTestSuite(suiteId: UUID, position: number, parentId?: Nullable<UUID>): TestSuite | Promise<TestSuite>;
    archiveTestSuite(id: UUID): TestSuite | Promise<TestSuite>;
    restoreTestSuite(id: UUID): TestSuite | Promise<TestSuite>;
    createTestCase(input: CreateTestCaseInput): TestCase | Promise<TestCase>;
    updateTestCase(id: UUID, input: UpdateTestCaseInput): TestCase | Promise<TestCase>;
    archiveTestCase(id: UUID): TestCase | Promise<TestCase>;
    restoreTestCase(id: UUID): TestCase | Promise<TestCase>;
    replaceTestCaseSteps(testCaseId: UUID, steps: TestStepInput[]): TestCase | Promise<TestCase>;
    replaceTestCaseTags(testCaseId: UUID, tagIds: UUID[]): TestCase | Promise<TestCase>;
    createTag(projectId: UUID, name: string): Tag | Promise<Tag>;
    deleteTag(id: UUID): boolean | Promise<boolean>;
    createTestPlan(projectId: UUID, title: string, testCaseIds: UUID[], sourceSuiteIds?: Nullable<UUID[]>, description?: Nullable<string>): TestPlan | Promise<TestPlan>;
    updateTestPlan(id: UUID, input: UpdateTestPlanInput): TestPlan | Promise<TestPlan>;
    replaceTestPlanCases(testPlanId: UUID, testCaseIds: UUID[]): TestPlan | Promise<TestPlan>;
    replaceTestPlanSources(testPlanId: UUID, sourceSuiteIds: UUID[], manualTestCaseIds: UUID[], orderedTestCaseIds: UUID[]): TestPlanSourceSyncResult | Promise<TestPlanSourceSyncResult>;
    deleteTestPlan(id: UUID): boolean | Promise<boolean>;
    createEnvironment(projectId: UUID, name: string, description?: Nullable<string>): Environment | Promise<Environment>;
    updateEnvironment(id: UUID, input: UpdateEnvironmentInput): Environment | Promise<Environment>;
    deleteEnvironment(id: UUID): boolean | Promise<boolean>;
    createTestRun(input: CreateTestRunInput): TestRun | Promise<TestRun>;
    updateTestRun(id: UUID, input: UpdateTestRunInput): TestRun | Promise<TestRun>;
    startTestRun(id: UUID): TestRun | Promise<TestRun>;
    completeTestRun(id: UUID): TestRun | Promise<TestRun>;
    deleteTestRun(id: UUID): boolean | Promise<boolean>;
    updateRunCaseAssignee(runCaseId: UUID, assigneeId?: Nullable<UUID>): TestRunCase | Promise<TestRunCase>;
    assignRunCases(runId: UUID, assigneeId?: Nullable<UUID>, runCaseIds?: Nullable<UUID[]>): TestRun | Promise<TestRun>;
    createTestResult(input: CreateTestResultInput): TestResult | Promise<TestResult>;
    presignAttachmentUpload(workspaceId: UUID, filename: string, mimeType: string, size: BigInt): PresignedUpload | Promise<PresignedUpload>;
    completeAttachmentUpload(id: UUID): Attachment | Promise<Attachment>;
    deleteAttachment(id: UUID): boolean | Promise<boolean>;
}

export type UUID = any;
export type DateTime = any;
export type BigInt = any;
type Nullable<T> = T | null;
