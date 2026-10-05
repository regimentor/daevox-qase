import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { App } from 'antd';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { graphql, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { ExecutionWorkspace } from '@/widgets/execution-workspace';
import { runCaseFixture } from '@/shared/test';
import { CurrentRunCaseStatus, type RunCaseFieldsFragment } from '@/shared/api/graphql';

const server = setupServer(
  graphql.query('TestResults', () =>
    HttpResponse.json({
      data: { testResults: { items: [], pageInfo: { limit: 50, offset: 0, total: 0 } } },
    }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
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

it('reveals matching cases and ancestors during search and keeps the current snapshot for an empty result', async () => {
  const user = userEvent.setup();
  mount();
  const navigator = within(screen.getByRole('navigation', { name: 'Кейсы запуска' }));
  await user.click(navigator.getByRole('button', { name: 'Авторизация' }));
  await user.type(navigator.getByRole('textbox', { name: 'Поиск кейсов запуска' }), 'web-2');
  expect(navigator.getByRole('button', { name: 'Авторизация' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(navigator.getByRole('button', { name: /WEB-2/ })).toBeVisible();
  expect(navigator.queryByRole('button', { name: 'Платежи' })).not.toBeInTheDocument();
  await user.clear(navigator.getByRole('textbox', { name: 'Поиск кейсов запуска' }));
  await user.type(
    navigator.getByRole('textbox', { name: 'Поиск кейсов запуска' }),
    'нет совпадений',
  );
  expect(navigator.getByText('Кейсы не найдены')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Смена пароля' })).toBeVisible();
});

const parent = {
  suiteId: 'parent',
  suiteTitle: 'Авторизация',
  position: 0,
  preconditions: null,
  postconditions: null,
};
const child = {
  suiteId: 'child',
  suiteTitle: 'Пароли',
  position: 1,
  preconditions: null,
  postconditions: null,
};
const cases: RunCaseFieldsFragment[] = [
  {
    ...runCaseFixture,
    id: 'loose',
    displayId: 'WEB-9',
    title: 'Проверка без сьюта',
    position: 0,
    suiteMetadata: [],
  },
  {
    ...runCaseFixture,
    id: 'nested',
    displayId: 'WEB-2',
    title: 'Смена пароля',
    position: 1,
    suiteMetadata: [parent, child],
  },
  {
    ...runCaseFixture,
    id: 'direct',
    displayId: 'WEB-1',
    title: 'Вход',
    position: 3,
    currentStatus: CurrentRunCaseStatus.Passed,
    suiteMetadata: [parent],
  },
  {
    ...runCaseFixture,
    id: 'other',
    displayId: 'WEB-3',
    title: 'Оплата',
    position: 2,
    currentStatus: CurrentRunCaseStatus.Passed,
    suiteMetadata: [{ ...parent, suiteId: 'payments', suiteTitle: 'Платежи' }],
  },
];

function mount(currentId = 'nested', onSelect: (id: string) => void = () => {}, runCases = cases) {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({ uri: 'http://localhost/graphql' }),
  });
  function Harness({ items }: { items: RunCaseFieldsFragment[] }) {
    const [selected, setSelected] = useState(currentId);
    return (
      <ExecutionWorkspace
        workspaceId="workspace-1"
        runId="run-1"
        title="Smoke"
        cases={items}
        currentId={selected}
        onSelect={(id) => {
          setSelected(id);
          onSelect(id);
        }}
        onExit={() => {}}
      />
    );
  }
  const view = (items: RunCaseFieldsFragment[]) => (
    <ApolloProvider client={client}>
      <App>
        <Harness items={items} />
      </App>
    </ApolloProvider>
  );
  const result = render(view(runCases));
  return {
    ...result,
    updateCases: (items: RunCaseFieldsFragment[]) => result.rerender(view(items)),
  };
}

it('starts with every suite collapsed while displaying the selected case snapshot', () => {
  mount();
  const navigator = within(screen.getByRole('navigation', { name: 'Кейсы запуска' }));
  expect(navigator.getAllByRole('button', { expanded: false })).toHaveLength(3);
  expect(navigator.queryByRole('button', { name: /WEB-/ })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Смена пароля' })).toBeVisible();
});

it('shows subtree totals and status counts for collapsed suites, including ungrouped cases', async () => {
  const user = userEvent.setup();
  mount();
  const navigator = within(screen.getByRole('navigation', { name: 'Кейсы запуска' }));
  const summary = within(navigator.getByRole('group', { name: 'Статистика сьюта Авторизация' }));
  expect(summary.getByText('Кейсов: 2')).toBeVisible();
  expect(summary.getByLabelText('Не выполнен: 1')).toBeVisible();
  expect(summary.getByLabelText('Пройден: 1')).toBeVisible();
  expect(summary.getByLabelText('Провален: 0')).toBeVisible();
  expect(summary.getByLabelText('Заблокирован: 0')).toBeVisible();
  expect(summary.getByLabelText('Пропущен: 0')).toBeVisible();
  const loose = within(navigator.getByRole('group', { name: 'Статистика сьюта Без сьюта' }));
  expect(loose.getByText('Кейсов: 1')).toBeVisible();
  expect(loose.getByLabelText('Не выполнен: 1')).toBeVisible();
  await user.click(navigator.getByRole('button', { name: 'Авторизация' }));
  const nested = within(navigator.getByRole('group', { name: 'Статистика сьюта Пароли' }));
  expect(nested.getByText('Кейсов: 1')).toBeVisible();
  expect(nested.getByLabelText('Не выполнен: 1')).toBeVisible();
});

it('keeps full suite statistics during filtering and updates them when a case result changes', async () => {
  const user = userEvent.setup();
  const view = mount();
  const navigator = within(screen.getByRole('navigation', { name: 'Кейсы запуска' }));
  await user.type(navigator.getByRole('textbox', { name: 'Поиск кейсов запуска' }), 'Вход');
  const stats = () =>
    within(navigator.getByRole('group', { name: 'Статистика сьюта Авторизация' }));
  expect(navigator.getAllByRole('button', { name: /WEB-/ })).toHaveLength(1);
  expect(stats().getByText('Кейсов: 2')).toBeVisible();
  expect(stats().getByLabelText('Пройден: 1')).toBeVisible();
  view.updateCases(
    cases.map((item) =>
      item.id === 'nested' ? { ...item, currentStatus: CurrentRunCaseStatus.Failed } : item,
    ),
  );
  expect(stats().getByLabelText('Провален: 1')).toBeVisible();
  expect(stats().getByLabelText('Не выполнен: 0')).toBeVisible();
  expect(stats().getByLabelText('Пройден: 1')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Смена пароля' })).toBeVisible();
});

it('shows snapshot suites, nested cases and ungrouped cases after the suites', async () => {
  const user = userEvent.setup();
  mount();
  const navigator = within(screen.getByRole('navigation', { name: 'Кейсы запуска' }));
  const roots = navigator.getByRole('list', { name: 'Сьюты запуска' });
  await user.click(navigator.getByRole('button', { name: 'Авторизация' }));
  expect(navigator.getByRole('button', { name: 'Пароли' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await user.click(navigator.getByRole('button', { name: 'Пароли' }));
  await user.click(navigator.getByRole('button', { name: 'Платежи' }));
  await user.click(navigator.getByRole('button', { name: 'Без сьюта' }));
  expect(
    within(roots)
      .getAllByRole('button', { expanded: true })
      .map((item) => item.textContent),
  ).toEqual(['Авторизация', 'Пароли', 'Платежи', 'Без сьюта']);
  const passwordCases = navigator.getByRole('list', { name: 'Пароли' });
  expect(
    within(passwordCases).getByRole('button', { name: /WEB-2.*Смена пароля/ }),
  ).toHaveAttribute('aria-current', 'true');
  expect(navigator.getAllByRole('button', { name: /WEB-/ })).toHaveLength(4);
  expect(
    within(navigator.getByRole('list', { name: 'Без сьюта' })).getByRole('button', {
      name: /WEB-9/,
    }),
  ).toBeVisible();
});

it('collapses suites by keyboard and reveals the selected branch when navigating back', async () => {
  const user = userEvent.setup();
  mount();
  const navigator = within(screen.getByRole('navigation', { name: 'Кейсы запуска' }));
  await user.click(navigator.getByRole('button', { name: 'Авторизация' }));
  await user.click(navigator.getByRole('button', { name: 'Пароли' }));
  const passwords = navigator.getByRole('button', { name: 'Пароли' });
  passwords.focus();
  await user.keyboard('{Enter}');
  expect(passwords).toHaveAttribute('aria-expanded', 'false');
  expect(navigator.queryByRole('button', { name: /WEB-2/ })).not.toBeInTheDocument();
  await user.click(navigator.getByRole('button', { name: /WEB-1/ }));
  expect(screen.getByRole('heading', { name: 'Вход' })).toBeVisible();
  await user.click(navigator.getByRole('button', { name: /Назад/ }));
  expect(navigator.getByRole('button', { name: /WEB-2/ })).toHaveAttribute('aria-current', 'true');
});

it('navigates in tree order and visits ungrouped cases last even while the list is filtered', async () => {
  const user = userEvent.setup();
  mount('other');
  const navigator = within(screen.getByRole('navigation', { name: 'Кейсы запуска' }));
  await user.type(navigator.getByRole('textbox', { name: 'Поиск кейсов запуска' }), 'Оплата');
  expect(navigator.getByRole('button', { name: /Далее/ })).toBeEnabled();
  await user.click(navigator.getByRole('button', { name: /Далее/ }));
  expect(screen.getByRole('heading', { name: 'Проверка без сьюта' })).toBeVisible();
  expect(navigator.getByRole('button', { name: /Далее/ })).toBeDisabled();
  await user.click(navigator.getByRole('button', { name: /Назад/ }));
  expect(screen.getByRole('heading', { name: 'Оплата' })).toBeVisible();
});

it('combines status and search without changing suite order when an earlier case is excluded', async () => {
  const user = userEvent.setup();
  mount();
  const navigator = within(screen.getByRole('navigation', { name: 'Кейсы запуска' }));
  await user.click(navigator.getByRole('combobox', { name: 'Фильтр кейсов запуска по статусу' }));
  await user.click(screen.getByRole('option', { name: 'PASSED' }));
  expect(
    navigator.getAllByRole('button', { expanded: true }).map((item) => item.textContent),
  ).toEqual(['Авторизация', 'Платежи']);
  expect(navigator.getAllByRole('button', { name: /WEB-/ })).toHaveLength(2);
  await user.type(navigator.getByRole('textbox', { name: 'Поиск кейсов запуска' }), 'Вход');
  expect(navigator.getAllByRole('button', { name: /WEB-/ })).toHaveLength(1);
  expect(navigator.getByRole('button', { name: /WEB-1/ })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Смена пароля' })).toBeVisible();
});

it('allows execution when all cases are ungrouped', async () => {
  const user = userEvent.setup();
  mount('loose', () => {}, [cases[0]!]);
  const navigator = within(screen.getByRole('navigation', { name: 'Кейсы запуска' }));
  await user.click(navigator.getByRole('button', { name: 'Без сьюта' }));
  expect(navigator.getAllByRole('button', { expanded: true })).toHaveLength(1);
  expect(navigator.getByRole('list', { name: 'Без сьюта' })).toBeVisible();
  expect(navigator.getByRole('button', { name: /WEB-9/ })).toHaveAttribute('aria-current', 'true');
  expect(navigator.getByRole('button', { name: /Назад/ })).toBeDisabled();
  expect(navigator.getByRole('button', { name: /Далее/ })).toBeDisabled();
});

it('preserves the step draft when switching between cases through the suite tree', async () => {
  const user = userEvent.setup();
  mount();
  await user.type(
    screen.getByRole('textbox', { name: 'Фактический результат шага 1' }),
    'Пароль обновлён',
  );
  const navigator = within(screen.getByRole('navigation', { name: 'Кейсы запуска' }));
  await user.click(navigator.getByRole('button', { name: 'Авторизация' }));
  await user.click(navigator.getByRole('button', { name: 'Пароли' }));
  await user.click(navigator.getByRole('button', { name: /WEB-1/ }));
  expect(screen.getByRole('textbox', { name: 'Фактический результат шага 1' })).toHaveValue('');
  await user.click(navigator.getByRole('button', { name: /WEB-2/ }));
  expect(screen.getByRole('textbox', { name: 'Фактический результат шага 1' })).toHaveValue(
    'Пароль обновлён',
  );
});
