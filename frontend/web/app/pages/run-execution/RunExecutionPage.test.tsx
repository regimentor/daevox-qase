import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { App } from 'antd';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { ProjectContextProvider } from '@/entities/project';
import { RunExecutionPage } from '@/pages/run-execution';
import { runCaseFixture } from '@/shared/test';
import { routes } from '@/shared/routes';
import {
  CurrentRunCaseStatus,
  TestResultStatus,
  TestRunStatus,
  type RunFieldsFragment,
  type ResultFieldsFragment,
  type CreateTestResultMutation,
  type CreateTestResultMutationVariables,
} from '@/shared/api/graphql';

const run: RunFieldsFragment = {
  __typename: 'TestRun',
  id: 'run-1',
  projectId: 'project-1',
  testPlanId: null,
  environmentId: null,
  title: 'Smoke',
  status: TestRunStatus.InProgress,
  createdBy: 'user-1',
  startedAt: runCaseFixture.createdAt,
  completedAt: null,
  createdAt: runCaseFixture.createdAt,
  updatedAt: runCaseFixture.updatedAt,
  cases: [
    {
      ...runCaseFixture,
      __typename: 'TestRunCase',
      id: 'loose',
      title: 'Без сьюта кейс',
      position: 0,
      suiteMetadata: [],
    },
    {
      ...runCaseFixture,
      __typename: 'TestRunCase',
      id: 'grouped',
      title: 'В сьюте кейс',
      position: 1,
    },
  ],
};
const server = setupServer(
  graphql.query('TestRun', () => HttpResponse.json({ data: { testRun: run } })),
  graphql.query('TestResults', () =>
    HttpResponse.json({
      data: { testResults: { items: [], pageInfo: { limit: 50, offset: 0, total: 0 } } },
    }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => {
  sessionStorage.clear();
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});

function Screen() {
  const { runCaseId } = useParams();
  const location = useLocation();
  return (
    <>
      <output aria-label="Адрес">{location.pathname}</output>
      <RunExecutionPage runId="run-1" runCaseId={runCaseId} />
    </>
  );
}

function mount(runCaseId?: string) {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({ uri: 'http://localhost/graphql' }),
  });
  render(
    <ApolloProvider client={client}>
      <App>
        <ProjectContextProvider
          value={{
            readOnly: false,
            workspace: {
              id: 'workspace-1',
              name: 'QA',
              createdBy: 'user-1',
              createdAt: run.createdAt,
              updatedAt: run.updatedAt,
            },
            project: {
              id: 'project-1',
              workspaceId: 'workspace-1',
              name: 'Web',
              code: 'WEB',
              description: null,
              archivedAt: null,
              createdAt: run.createdAt,
              updatedAt: run.updatedAt,
            },
          }}
        >
          <MemoryRouter
            initialEntries={[routes.execute('workspace-1', 'project-1', 'run-1', runCaseId)]}
          >
            <Routes>
              <Route path="/w/:workspaceId/p/:projectId/runs/:runId/execute" element={<Screen />} />
              <Route
                path="/w/:workspaceId/p/:projectId/runs/:runId/execute/:runCaseId"
                element={<Screen />}
              />
            </Routes>
          </MemoryRouter>
        </ProjectContextProvider>
      </App>
    </ApolloProvider>,
  );
}

it('opens the first untested case in suite-tree order and records its route', async () => {
  mount();
  expect(await screen.findByRole('heading', { name: 'В сьюте кейс' })).toBeVisible();
  expect(screen.getByRole('status', { name: 'Адрес' })).toHaveTextContent(
    '/w/workspace-1/p/project-1/runs/run-1/execute/grouped',
  );
});

it('opens a saved snapshot by direct link and changes the route when selecting another case', async () => {
  const user = userEvent.setup();
  mount('grouped');
  expect(await screen.findByRole('heading', { name: 'В сьюте кейс' })).toBeVisible();
  const navigator = within(screen.getByRole('navigation', { name: 'Кейсы запуска' }));
  expect(navigator.getByRole('button', { name: 'Аутентификация' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await user.click(navigator.getByRole('button', { name: 'Аутентификация' }));
  expect(navigator.getByRole('button', { name: /В сьюте кейс/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await user.click(navigator.getByRole('button', { name: 'Без сьюта' }));
  await user.click(navigator.getByRole('button', { name: /Без сьюта кейс/ }));
  expect(screen.getByRole('heading', { name: 'Без сьюта кейс' })).toBeVisible();
  expect(screen.getByRole('status', { name: 'Адрес' })).toHaveTextContent(
    '/w/workspace-1/p/project-1/runs/run-1/execute/loose',
  );
});

it('submits a result, updates status and advances to the next untested case in the same suite', async () => {
  const user = userEvent.setup();
  const grouped = run.cases[1]!;
  let currentRun: RunFieldsFragment = {
    ...run,
    cases: [
      run.cases[0]!,
      grouped,
      {
        ...grouped,
        id: 'other-suite',
        title: 'Оплата',
        position: 2,
        suiteMetadata: [
          { ...grouped.suiteMetadata[0]!, suiteId: 'payments', suiteTitle: 'Платежи' },
        ],
      },
      { ...grouped, id: 'same-suite', title: 'Следующий кейс сьюта', position: 3 },
    ],
  };
  let saved: ResultFieldsFragment | undefined;
  server.use(
    graphql.query('TestRun', () => HttpResponse.json({ data: { testRun: currentRun } })),
    graphql.query('RunCase', ({ variables }) =>
      HttpResponse.json({
        data: { runCase: currentRun.cases.find((item) => item.id === variables.id) },
      }),
    ),
    graphql.query('RunSummary', () =>
      HttpResponse.json({
        data: {
          runSummary: {
            total: 4,
            untested: 3,
            passed: 1,
            failed: 0,
            blocked: 0,
            skipped: 0,
            executed: 1,
            progressPercent: 25,
            passRate: 100,
          },
        },
      }),
    ),
    graphql.query('TestResults', ({ variables }) => {
      const items = saved && variables.runCaseId === saved.testRunCaseId ? [saved] : [];
      return HttpResponse.json({
        data: { testResults: { items, pageInfo: { limit: 50, offset: 0, total: items.length } } },
      });
    }),
    graphql.mutation<CreateTestResultMutation, CreateTestResultMutationVariables>(
      'CreateTestResult',
      ({ variables }) => {
        const { input } = variables;
        expect(input).toMatchObject({ runCaseId: 'grouped', status: TestResultStatus.Passed });
        saved = {
          __typename: 'TestResult',
          id: 'result-1',
          testRunCaseId: input.runCaseId,
          status: input.status,
          executedBy: 'user-1',
          comment: input.comment ?? null,
          durationSeconds: input.durationSeconds ?? null,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
          stepResults: [],
          attachments: [],
        };
        currentRun = {
          ...currentRun,
          cases: currentRun.cases.map((item) =>
            item.id === input.runCaseId
              ? { ...item, currentStatus: CurrentRunCaseStatus.Passed }
              : item,
          ),
        };
        return HttpResponse.json({ data: { createTestResult: saved } });
      },
    ),
  );
  mount('grouped');
  await screen.findByRole('heading', { name: 'В сьюте кейс' });
  const navigator = within(screen.getByRole('navigation', { name: 'Кейсы запуска' }));
  await user.type(navigator.getByRole('textbox', { name: 'Поиск кейсов запуска' }), 'В сьюте кейс');
  await user.click(navigator.getByRole('combobox', { name: 'Фильтр кейсов запуска по статусу' }));
  await user.click(screen.getByRole('option', { name: 'UNTESTED' }));
  within(screen.getByRole('complementary')).getByRole('radio', { name: 'Пройден' }).focus();
  await user.keyboard(' ');
  await user.click(screen.getByRole('button', { name: 'Сохранить результат' }));
  expect(await screen.findByRole('heading', { name: 'Следующий кейс сьюта' })).toBeVisible();
  expect(await navigator.findByText('Кейсы не найдены')).toBeVisible();
  await user.clear(navigator.getByRole('textbox', { name: 'Поиск кейсов запуска' }));
  await user.click(navigator.getByRole('combobox', { name: 'Фильтр кейсов запуска по статусу' }));
  await user.click(screen.getByRole('option', { name: 'PASSED' }));
  await waitFor(() =>
    expect(
      within(navigator.getByRole('button', { name: /В сьюте кейс/ })).getByLabelText(
        'Статус: Пройден',
      ),
    ).toBeVisible(),
  );
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  expect(screen.getByRole('status', { name: 'Адрес' })).toHaveTextContent(
    '/w/workspace-1/p/project-1/runs/run-1/execute/same-suite',
  );
});

it('keeps a completed run navigable while preventing result changes', async () => {
  server.use(
    graphql.query('TestRun', () =>
      HttpResponse.json({ data: { testRun: { ...run, status: TestRunStatus.Completed } } }),
    ),
  );
  const user = userEvent.setup();
  mount('grouped');
  await screen.findByRole('heading', { name: 'В сьюте кейс' });
  expect(screen.getByRole('button', { name: 'Сохранить результат' })).toBeDisabled();
  const navigator = within(screen.getByRole('navigation', { name: 'Кейсы запуска' }));
  await user.click(navigator.getByRole('button', { name: 'Без сьюта' }));
  await user.click(navigator.getByRole('button', { name: /Без сьюта кейс/ }));
  expect(screen.getByRole('heading', { name: 'Без сьюта кейс' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Сохранить результат' })).toBeDisabled();
});
