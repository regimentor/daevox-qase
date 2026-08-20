import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphql, HttpResponse } from 'msw';
import { expect, fireEvent, userEvent, waitFor as waitForAssertion, within } from 'storybook/test';
import type { ReactNode } from 'react';
import { ProjectContextProvider } from '@/entities/project';
import { ProjectDashboardPage } from '@/pages/project-dashboard';
import { EnvironmentsPage } from '@/pages/environments';
import { TestPlanDetailsPage } from '@/pages/test-plan-details';
import { TestPlansPage } from '@/pages/test-plans';
import { TestRunsPage } from '@/pages/test-runs';
import { WorkspaceHomePage } from '@/pages/workspace-home';
import { WorkspaceListPage } from '@/pages/workspace-list';
import { WorkspaceMembersPage } from '@/pages/workspace-members';
import {
  AutomationStatus,
  CurrentRunCaseStatus,
  TestCasePriority,
  TestCaseSeverity,
  TestCaseType,
  TestRunStatus,
} from '@/shared/api/graphql';
import { runCaseFixture, testCaseFixture } from '@/shared/test';

const now = '2026-08-20T08:00:00Z';
const workspace = {
  __typename: 'Workspace' as const,
  id: 'workspace-1',
  name: 'Daevox QA',
  createdBy: 'user-1',
  createdAt: now,
  updatedAt: now,
};
const project = {
  __typename: 'Project' as const,
  id: 'project-1',
  workspaceId: workspace.id,
  name: 'Web Platform',
  code: 'WEB',
  description: 'Основной продукт',
  archivedAt: null as string | null,
  createdAt: now,
  updatedAt: now,
};
const pageInfo = (total: number) => ({ limit: 100, offset: 0, total });
const graphError = (operation: string) =>
  graphql.operation(({ operationName }) => {
    if (operationName !== operation) return;
    return HttpResponse.json({ errors: [{ message: 'Сервис временно недоступен' }] });
  });
const waitFor =
  (text: string | RegExp) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await within(canvasElement).findByText(text);
  };
const projectFrame = (content: ReactNode, readOnly = false) => (
  <ProjectContextProvider value={{ workspace, project, readOnly }}>
    {content}
  </ProjectContextProvider>
);

const plan = {
  __typename: 'TestPlan' as const,
  id: 'plan-1',
  projectId: project.id,
  title: 'Smoke plan',
  description: 'Критический путь',
  createdBy: 'user-1',
  createdAt: now,
  updatedAt: now,
  testCases: [testCaseFixture],
};
const environment = {
  __typename: 'Environment' as const,
  id: 'environment-1',
  projectId: project.id,
  name: 'Staging',
  description: 'Предрелизное окружение',
  createdAt: now,
  updatedAt: now,
};
const run = {
  __typename: 'TestRun' as const,
  id: 'run-1',
  projectId: project.id,
  testPlanId: plan.id,
  environmentId: environment.id,
  title: 'Staging Smoke',
  status: TestRunStatus.InProgress,
  createdBy: 'user-1',
  startedAt: now,
  completedAt: null,
  createdAt: now,
  updatedAt: now,
  cases: [{ __typename: 'TestRunCase' as const, ...runCaseFixture }],
};

const meta = { title: 'Pages/Loading empty error and data states' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const WorkspaceListData: Story = {
  parameters: {
    msw: [
      graphql.query('Workspaces', () =>
        HttpResponse.json({ data: { workspaces: { items: [workspace], pageInfo: pageInfo(1) } } }),
      ),
    ],
  },
  render: () => <WorkspaceListPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const workspaceTitle = await canvas.findByText('Daevox QA');
    const card = workspaceTitle.closest<HTMLElement>('.ant-card');
    if (!card) throw new Error('Workspace card unavailable');
    await userEvent.click(card);
    card.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(canvas.getByRole('button', { name: /Создать workspace/ }));
    const modalTitle = await body.findByText('Новое рабочее пространство');
    const dialog = modalTitle.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error('Workspace modal unavailable');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
  },
};
export const WorkspaceListEmpty: Story = {
  parameters: {
    msw: [
      graphql.query('Workspaces', () =>
        HttpResponse.json({ data: { workspaces: { items: [], pageInfo: pageInfo(0) } } }),
      ),
    ],
  },
  render: () => <WorkspaceListPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByText('Нет рабочих пространств');
    await userEvent.click(canvas.getAllByRole('button', { name: 'Создать workspace' }).at(-1)!);
    const modalTitle = await body.findByText('Новое рабочее пространство');
    const dialog = modalTitle.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error('Workspace modal unavailable');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
  },
};
export const WorkspaceListError: Story = {
  parameters: { msw: [graphError('Workspaces')] },
  render: () => <WorkspaceListPage />,
  play: waitFor('Не удалось загрузить данные'),
};

const workspaceHandlers = (items: Array<typeof project>) => [
  graphql.query('WorkspaceContext', () => HttpResponse.json({ data: { workspace } })),
  graphql.query('Projects', () =>
    HttpResponse.json({ data: { projects: { items, pageInfo: pageInfo(items.length) } } }),
  ),
];
export const WorkspaceProjects: Story = {
  parameters: {
    msw: workspaceHandlers([project, { ...project, id: 'project-2', archivedAt: now }]),
  },
  render: () => <WorkspaceHomePage workspaceId={workspace.id} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const projectTitles = await canvas.findAllByText('Web Platform');
    await userEvent.click(canvas.getByRole('button', { name: /Участники/ }));
    await userEvent.click(canvas.getByRole('button', { name: /Новый проект/ }));
    const card = projectTitles[0]?.closest<HTMLElement>('.ant-card');
    if (!card) throw new Error('Project card unavailable');
    await userEvent.click(card);
  },
};
export const WorkspaceProjectsEmpty: Story = {
  parameters: { msw: workspaceHandlers([]) },
  render: () => <WorkspaceHomePage workspaceId={workspace.id} />,
  play: waitFor('Нет проектов'),
};
export const WorkspaceProjectsError: Story = {
  parameters: { msw: [graphError('WorkspaceContext'), graphError('Projects')] },
  render: () => <WorkspaceHomePage workspaceId={workspace.id} />,
  play: waitFor('Не удалось загрузить данные'),
};

const dashboardHandler = (latestRuns = [run]) =>
  graphql.query('ProjectDashboard', () =>
    HttpResponse.json({
      data: {
        projectDashboard: {
          totalTestCases: 12,
          manualTestCases: 10,
          automatedTestCases: 2,
          runsLast30Days: 3,
          averagePassRate: 75,
          latestRuns,
        },
      },
    }),
  );
export const DashboardData: Story = {
  parameters: {
    msw: [
      dashboardHandler(),
      graphql.mutation('ArchiveProject', () =>
        HttpResponse.json({ data: { archiveProject: { ...project, archivedAt: now } } }),
      ),
      graphql.query('ProjectContext', () =>
        HttpResponse.json({ data: { project: { ...project, archivedAt: now } } }),
      ),
    ],
  },
  render: () => projectFrame(<ProjectDashboardPage />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByText('Последние запуски');
    await userEvent.click(canvas.getByText('Staging Smoke'));
    await userEvent.click(canvas.getByRole('button', { name: /Архивировать/ }));
    await userEvent.click(await body.findByRole('button', { name: 'Архивировать' }));
    await waitForAssertion(() =>
      expect(body.queryByText('Архивировать «Web Platform»?')).toBeNull(),
    );
  },
};
export const DashboardZeroDataArchived: Story = {
  parameters: { msw: [dashboardHandler([])] },
  render: () => (
    <ProjectContextProvider
      value={{ workspace, project: { ...project, archivedAt: now }, readOnly: true }}
    >
      <ProjectDashboardPage />
    </ProjectContextProvider>
  ),
  play: waitFor('Запусков пока нет'),
};
export const DashboardError: Story = {
  parameters: { msw: [graphError('ProjectDashboard')] },
  render: () => projectFrame(<ProjectDashboardPage />),
  play: waitFor('Не удалось загрузить данные'),
};

const plansHandler = (items: Array<typeof plan>) =>
  graphql.query('TestPlans', () =>
    HttpResponse.json({ data: { testPlans: { items, pageInfo: pageInfo(items.length) } } }),
  );
export const PlansData: Story = {
  parameters: { msw: [plansHandler([plan])] },
  render: () => projectFrame(<TestPlansPage />),
  play: waitFor('Smoke plan'),
};
export const PlansEmptyReadOnly: Story = {
  parameters: { msw: [plansHandler([])] },
  render: () => projectFrame(<TestPlansPage />, true),
  play: waitFor('Нет тест-планов'),
};
export const PlansError: Story = {
  parameters: { msw: [graphError('TestPlans')] },
  render: () => projectFrame(<TestPlansPage />),
  play: waitFor('Не удалось загрузить данные'),
};

export const PlanDetailsData: Story = {
  parameters: {
    msw: [graphql.query('TestPlan', () => HttpResponse.json({ data: { testPlan: plan } }))],
  },
  render: () => projectFrame(<TestPlanDetailsPage planId={plan.id} />),
  play: waitFor('Кейсы · 1'),
};
export const PlanDetailsError: Story = {
  parameters: { msw: [graphError('TestPlan')] },
  render: () => projectFrame(<TestPlanDetailsPage planId={plan.id} />),
  play: waitFor('Не удалось загрузить данные'),
};

const environmentHandler = (items: Array<typeof environment>) =>
  graphql.query('Environments', () =>
    HttpResponse.json({ data: { environments: { items, pageInfo: pageInfo(items.length) } } }),
  );
export const EnvironmentsData: Story = {
  parameters: {
    msw: [
      environmentHandler([environment]),
      graphql.mutation('UpdateEnvironment', () =>
        HttpResponse.json({ data: { updateEnvironment: { ...environment, description: null } } }),
      ),
      graphql.mutation('DeleteEnvironment', () =>
        HttpResponse.json({ data: { deleteEnvironment: true } }),
      ),
    ],
  },
  render: () => projectFrame(<EnvironmentsPage />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Staging');
    await userEvent.click(canvas.getByRole('button', { name: 'Изменить Staging' }));
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog', { name: 'Изменить окружение' });
    const description = dialog.querySelector<HTMLTextAreaElement>('textarea#description');
    if (!description) throw new Error('Description input unavailable');
    fireEvent.change(description, { target: { value: ' Обновлено ' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitForAssertion(() =>
      expect(body.queryByRole('dialog', { name: 'Изменить окружение' })).toBeNull(),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Удалить Staging' }));
    await userEvent.click(await body.findByRole('button', { name: 'OK' }));
  },
};
export const EnvironmentsEmptyReadOnly: Story = {
  parameters: { msw: [environmentHandler([])] },
  render: () => projectFrame(<EnvironmentsPage />, true),
  play: waitFor('Нет окружений'),
};
export const EnvironmentsError: Story = {
  parameters: { msw: [graphError('Environments')] },
  render: () => projectFrame(<EnvironmentsPage />),
  play: waitFor('Не удалось загрузить данные'),
};

const runsHandler = (items: Array<typeof run>) =>
  graphql.query('TestRuns', () =>
    HttpResponse.json({ data: { testRuns: { items, pageInfo: pageInfo(items.length) } } }),
  );
export const RunsData: Story = {
  parameters: { msw: [runsHandler([run])] },
  render: () => projectFrame(<TestRunsPage />),
  play: waitFor('Staging Smoke'),
};
export const RunsEmpty: Story = {
  parameters: { msw: [runsHandler([])] },
  render: () => projectFrame(<TestRunsPage />),
  play: waitFor('Запусков не найдено'),
};
export const RunsError: Story = {
  parameters: { msw: [graphError('TestRuns')] },
  render: () => projectFrame(<TestRunsPage />),
  play: waitFor('Не удалось загрузить данные'),
};

const member = {
  __typename: 'WorkspaceMember' as const,
  id: 'member-1',
  workspaceId: workspace.id,
  userId: 'user-1',
  role: 'ADMIN',
  createdAt: now,
  updatedAt: now,
  user: {
    __typename: 'User' as const,
    id: 'user-1',
    email: 'qa@example.com',
    name: 'QA Lead',
    createdAt: now,
    updatedAt: now,
  },
};
const membersHandler = (items: Array<typeof member>) =>
  graphql.query('WorkspaceMembers', () =>
    HttpResponse.json({ data: { workspaceMembers: { items, pageInfo: pageInfo(items.length) } } }),
  );
export const MembersAdmin: Story = {
  parameters: { msw: [membersHandler([member])] },
  render: () => <WorkspaceMembersPage workspaceId={workspace.id} userId="user-1" />,
  play: waitFor('QA Lead'),
};
export const MembersAdminActions: Story = {
  parameters: {
    msw: [
      membersHandler([member]),
      graphql.mutation('AddWorkspaceMember', () =>
        HttpResponse.json({
          data: {
            addWorkspaceMember: {
              ...member,
              id: 'member-2',
              userId: 'user-2',
              role: 'MEMBER',
              user: { ...member.user, id: 'user-2', email: 'member@example.com', name: 'QA' },
            },
          },
        }),
      ),
      graphql.mutation('UpdateWorkspaceMember', () =>
        HttpResponse.json({ data: { updateWorkspaceMember: { ...member, role: 'MEMBER' } } }),
      ),
      graphql.mutation('RemoveWorkspaceMember', () =>
        HttpResponse.json({ data: { removeWorkspaceMember: true } }),
      ),
    ],
  },
  render: () => <WorkspaceMembersPage workspaceId={workspace.id} userId="user-1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('QA Lead');
    await userEvent.click(canvas.getByRole('button', { name: /Добавить/ }));
    const body = within(canvasElement.ownerDocument.body);
    const modalTitle = await body.findByText('Добавить участника');
    const dialog = modalTitle.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error('Member modal unavailable');
    await userEvent.type(within(dialog).getByLabelText(/Email/), ' MEMBER@Example.com ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    await waitForAssertion(() =>
      expect(body.queryByRole('dialog', { name: 'Добавить участника' })).toBeNull(),
    );
    await userEvent.click(canvas.getByLabelText('Роль QA Lead'));
    await userEvent.click(await body.findByRole('option', { name: 'Участник' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Удалить QA Lead' }));
    await userEvent.click(await body.findByRole('button', { name: 'OK' }));
  },
};
export const MembersMutationError: Story = {
  parameters: {
    msw: [
      membersHandler([member]),
      graphql.mutation('AddWorkspaceMember', () =>
        HttpResponse.json({
          errors: [
            {
              message: 'Validation failed',
              extensions: { code: 'VALIDATION_ERROR', fields: { email: 'Пользователь не найден' } },
            },
          ],
        }),
      ),
    ],
  },
  render: () => <WorkspaceMembersPage workspaceId={workspace.id} userId="user-1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('QA Lead');
    await userEvent.click(canvas.getByRole('button', { name: /Добавить/ }));
    const body = within(canvasElement.ownerDocument.body);
    const modalTitle = await body.findByText('Добавить участника');
    const dialog = modalTitle.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error('Member modal unavailable');
    await userEvent.type(within(dialog).getByLabelText(/Email/), 'missing@example.com');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    expect(await within(dialog).findByText('Пользователь не найден')).toBeVisible();
  },
};
export const MembersMemberPermissions: Story = {
  parameters: { msw: [membersHandler([{ ...member, role: 'MEMBER' }])] },
  render: () => <WorkspaceMembersPage workspaceId={workspace.id} userId="user-1" />,
  play: waitFor('Участник'),
};
export const MembersError: Story = {
  parameters: { msw: [graphError('WorkspaceMembers')] },
  render: () => <WorkspaceMembersPage workspaceId={workspace.id} userId="user-1" />,
  play: waitFor('Не удалось загрузить данные'),
};

// Keep enum payloads represented in this backend-free catalogue.
void [
  AutomationStatus.Manual,
  CurrentRunCaseStatus.Untested,
  TestCasePriority.High,
  TestCaseSeverity.Critical,
  TestCaseType.Smoke,
];
