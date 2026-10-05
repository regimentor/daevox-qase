import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphql, HttpResponse } from 'msw';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import { ProjectContextProvider } from '@/entities/project';
import { TestRepositoryPage } from '@/pages/test-repository';
import { TestRunStatus } from '@/shared/api/graphql';
import { testCaseFixture } from '@/shared/test';

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
  archivedAt: null,
  createdAt: now,
  updatedAt: now,
};
const suite = {
  __typename: 'TestSuite' as const,
  id: 'suite-1',
  projectId: project.id,
  parentId: null,
  title: 'Аутентификация',
  description: null,
  preconditions: 'Пользователь активен',
  postconditions: 'Сессия закрыта',
  archivedAt: null,
  position: 0,
  createdAt: now,
  updatedAt: now,
  children: [],
};
const testCase = {
  __typename: 'TestCase' as const,
  ...testCaseFixture,
  steps: testCaseFixture.steps.map((step) => ({ __typename: 'TestStep' as const, ...step })),
  tags: testCaseFixture.tags.map((tag) => ({ __typename: 'Tag' as const, ...tag })),
};
const environment = {
  __typename: 'Environment' as const,
  id: 'environment-1',
  projectId: project.id,
  name: 'Staging',
  description: null,
  createdAt: now,
  updatedAt: now,
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
const pageInfo = (total: number) => ({ limit: 100, offset: 0, total });
const handlers = [
  graphql.query('SuiteTree', () => HttpResponse.json({ data: { suiteTree: [suite] } })),
  graphql.query('Tags', () => HttpResponse.json({ data: { tags: testCase.tags } })),
  graphql.query('TestCases', ({ variables }) => {
    const filter = variables.filter as { search?: string | null } | null;
    const items = filter?.search ? [] : [testCase];
    return HttpResponse.json({
      data: { testCases: { items, pageInfo: pageInfo(items.length) } },
    });
  }),
  graphql.query('Environments', () =>
    HttpResponse.json({ data: { environments: { items: [environment], pageInfo: pageInfo(1) } } }),
  ),
  graphql.query('TestPlans', () =>
    HttpResponse.json({ data: { testPlans: { items: [], pageInfo: pageInfo(0) } } }),
  ),
  graphql.query('WorkspaceMembers', () =>
    HttpResponse.json({ data: { workspaceMembers: { items: [member], pageInfo: pageInfo(1) } } }),
  ),
  graphql.query('TestRuns', () =>
    HttpResponse.json({ data: { testRuns: { items: [], pageInfo: pageInfo(0) } } }),
  ),
  graphql.mutation('ArchiveTestCase', () =>
    HttpResponse.json({
      data: { archiveTestCase: { ...testCase, archivedAt: now } },
    }),
  ),
  graphql.mutation('CreateTestRun', () =>
    HttpResponse.json({
      data: {
        createTestRun: {
          __typename: 'TestRun',
          id: 'run-created',
          projectId: project.id,
          testPlanId: null,
          environmentId: environment.id,
          title: 'Selected cases',
          status: TestRunStatus.Draft,
          createdBy: 'user-1',
          startedAt: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          cases: [],
        },
      },
    }),
  ),
  graphql.mutation('UpdateSuite', ({ variables }) =>
    HttpResponse.json({
      data: {
        updateTestSuite: {
          ...suite,
          ...(variables.input as Record<string, unknown>),
        },
      },
    }),
  ),
];

const meta = {
  title: 'Repository/Page workflows',
  component: TestRepositoryPage,
  parameters: { msw: handlers },
  render: () => (
    <ProjectContextProvider value={{ workspace, project, readOnly: false }}>
      <TestRepositoryPage />
    </ProjectContextProvider>
  ),
} satisfies Meta<typeof TestRepositoryPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FiltersPreviewArchiveAndRun: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByText('WEB-1');

    const rowCheckboxes = canvas.getAllByRole('checkbox');
    const rowLabel = rowCheckboxes.at(-1)?.closest<HTMLElement>('label');
    if (!rowLabel) throw new Error('Row selection label unavailable');
    fireEvent.click(rowLabel);
    const createRun = canvas.getByRole('button', { name: /Создать run из выбранных/ });
    expect(createRun).toBeEnabled();
    await userEvent.click(createRun);
    const drawerTitle = await body.findByText('Создать тестовый запуск');
    const drawer = drawerTitle.closest<HTMLElement>('[role="dialog"]');
    if (!drawer) throw new Error('Run drawer unavailable');
    const runForm = within(drawer);
    const title = drawer.querySelector<HTMLInputElement>('input#title');
    if (!title) throw new Error('Run title unavailable');
    fireEvent.change(title, { target: { value: ' Selected cases ' } });
    await userEvent.click(runForm.getByRole('button', { name: 'Продолжить' }));
    await userEvent.click(runForm.getByRole('button', { name: 'Продолжить' }));
    expect(await runForm.findByText('Кейсов в snapshot: 1')).toBeVisible();
    await userEvent.click(runForm.getByRole('button', { name: 'Назад' }));
    await userEvent.click(runForm.getByRole('button', { name: 'Продолжить' }));
    await userEvent.click(runForm.getByRole('button', { name: 'Создать запуск' }));
    await waitFor(() => expect(body.queryByText('Создать тестовый запуск')).toBeNull());

    const search = canvas.getByRole('textbox', { name: 'Поиск тест-кейсов' });
    await userEvent.type(search, 'missing');
    expect(await canvas.findByText('По фильтрам ничего не найдено')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /Сбросить/ }));
    expect(await canvas.findByText('WEB-1')).toBeVisible();

    await userEvent.click(canvas.getByRole('combobox', { name: 'Фильтр по приоритету' }));
    await userEvent.click(await body.findByRole('option', { name: 'Высокий' }));
    expect(
      (await canvas.findAllByText('Высокий', { selector: '.ant-tag' })).length,
    ).toBeGreaterThan(1);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Фильтр по серьёзности' }));
    await userEvent.click(await body.findByRole('option', { name: 'Критический' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Фильтр по типу' }));
    await userEvent.click(await body.findByRole('option', { name: 'Smoke' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Направление сортировки' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Направление сортировки' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Архив' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Архив' }));
    await userEvent.click(canvas.getByRole('button', { name: /Сбросить/ }));

    await userEvent.click(await canvas.findByText('WEB-1'));
    expect(await canvas.findByText('Описание')).toBeVisible();
    const closeDrawer = canvasElement.querySelector<HTMLButtonElement>('.ant-drawer-close');
    if (!closeDrawer) throw new Error('Preview close button unavailable');
    await userEvent.click(closeDrawer);

    await userEvent.click(canvas.getByRole('button', { name: 'Действия WEB-1' }));
    await userEvent.click(await body.findByText('Архивировать'));
    await userEvent.click(await body.findByRole('button', { name: 'Архивировать' }));
    await waitFor(() => expect(body.queryByText('Архивировать WEB-1?')).toBeNull());
    await canvas.findByText('WEB-1');
  },
};

export const EmptyReadOnly: Story = {
  parameters: {
    msw: [
      graphql.query('TestCases', () =>
        HttpResponse.json({ data: { testCases: { items: [], pageInfo: pageInfo(0) } } }),
      ),
      ...handlers,
    ],
  },
  render: () => (
    <ProjectContextProvider
      value={{ workspace, project: { ...project, archivedAt: now }, readOnly: true }}
    >
      <TestRepositoryPage />
    </ProjectContextProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('Тест-кейсов пока нет')).toBeVisible();
    expect(canvas.getByRole('button', { name: /Создать test case/ })).toBeDisabled();
  },
};

export const EditSelectedSuiteMetadata: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Аутентификация'));
    const preconditions = await canvas.findByRole('textbox', { name: 'Предусловия' });
    const postconditions = canvas.getByRole('textbox', { name: 'Постусловия' });
    await userEvent.clear(preconditions);
    await userEvent.type(preconditions, 'Новое условие');
    await userEvent.clear(postconditions);
    await userEvent.type(postconditions, 'Новое завершение');
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(canvas.getByText('Метаданные suite: Аутентификация')).toBeVisible());
  },
};

export const ErrorAndRetry: Story = {
  parameters: {
    msw: [
      graphql.query('TestCases', () =>
        HttpResponse.json({ errors: [{ message: 'Repository unavailable' }] }),
      ),
      ...handlers,
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('Не удалось загрузить данные')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Повторить' }));
  },
};

const longSuiteTitle = 'ПроверкаАвторизацииПользователя'.repeat(4);

export const ResizableSuitePanel: Story = {
  parameters: {
    msw: [
      graphql.query('SuiteTree', () =>
        HttpResponse.json({
          data: {
            suiteTree: [
              {
                ...suite,
                children: [
                  { ...suite, id: 'suite-long', parentId: suite.id, title: longSuiteTitle },
                ],
              },
            ],
          },
        }),
      ),
      ...handlers,
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('WEB-1');
    await userEvent.click(await canvas.findByText(suite.title));
    await canvas.findByRole('textbox', { name: 'Предусловия' });
    const suiteNode = canvas.getByText(suite.title).closest('.ant-tree-treenode');
    const switcher = suiteNode?.querySelector<HTMLElement>('.ant-tree-switcher');
    if (!switcher) throw new Error('Suite expander unavailable');
    await userEvent.click(switcher);
    const title = await canvas.findByText(longSuiteTitle);
    const panel = canvasElement.querySelector<HTMLElement>('.suite-panel');
    const main = canvasElement.querySelector<HTMLElement>('.repository-main');
    const layout = canvasElement.querySelector<HTMLElement>('.repository-layout');
    const scroller = canvasElement.querySelector<HTMLElement>('.ant-table-content');
    if (!panel || !main || !layout || !scroller) throw new Error('Repository layout unavailable');

    const assertContained = () => {
      expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(
        window.innerWidth,
      );
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
      expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth + 1);
      expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth + 1);
    };
    if (window.innerWidth <= 1023) {
      // A width written during desktop resizing must not overflow the stacked layout.
      panel.style.width = '2000px';
      expect(getComputedStyle(panel).resize).toBe('none');
      expect(main.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        panel.getBoundingClientRect().bottom,
      );
      assertContained();
      panel.style.removeProperty('width');
      return;
    }

    const initialWidth = main.getBoundingClientRect().width;
    const previousLayoutWidth = layout.style.width;
    try {
      expect(panel.getBoundingClientRect().width).toBe(280);
      expect(getComputedStyle(panel).resize).toBe('horizontal');
      // Native resizing writes an inline width; exercise the same constraint path.
      panel.style.width = '460px';
      await waitFor(() => expect(main.getBoundingClientRect().width).toBeLessThan(initialWidth));
      expect(panel.getBoundingClientRect().right).toBeLessThan(main.getBoundingClientRect().left);
      assertContained();

      panel.style.width = '2000px';
      expect(main.getBoundingClientRect().width).toBeGreaterThanOrEqual(320);
      layout.style.width = '650px';
      expect(panel.getBoundingClientRect().width).toBe(320);
      expect(main.getBoundingClientRect().width).toBe(320);
      assertContained();
      expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
      scroller.scrollLeft = 100;
      expect(scroller.scrollLeft).toBeGreaterThan(0);

      panel.style.width = '240px';
      expect(panel.getBoundingClientRect().width).toBe(240);
      expect(main.getBoundingClientRect().width).toBe(400);
      assertContained();
    } finally {
      panel.style.removeProperty('width');
      layout.style.width = previousLayoutWidth;
      scroller.scrollLeft = 0;
    }
  },
};
