import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphql, HttpResponse } from 'msw';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ExecutionWorkspace } from '@/widgets/execution-workspace';
import { runCaseFixture } from '@/shared/test';
const handlers = [
  graphql.query('TestResults', () =>
    HttpResponse.json({
      data: { testResults: { items: [], pageInfo: { limit: 50, offset: 0, total: 0 } } },
    }),
  ),
];
const meta = {
  title: 'Execution/Workspace',
  component: ExecutionWorkspace,
  args: {
    workspaceId: 'workspace-1',
    runId: 'run-1',
    title: 'Staging Smoke',
    cases: [runCaseFixture],
    currentId: runCaseFixture.id,
    onSelect: fn(),
    onExit: fn(),
  },
  parameters: { msw: handlers, layout: 'fullscreen' },
} satisfies Meta<typeof ExecutionWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const StepStatusInteraction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click((await canvas.findAllByText('Пройден'))[0]!);
    await userEvent.type(
      (await canvas.findAllByLabelText('Фактический результат шага 1'))[0]!,
      'Форма открылась',
    );
  },
};
export const PermissionRestricted: Story = { args: { disabled: true } };
export const MobileCompact: Story = { parameters: { viewport: { defaultViewport: 'mobile1' } } };

const suite = runCaseFixture.suiteMetadata[0]!;
export const SuiteTree: Story = {
  args: {
    currentId: 'nested',
    cases: [
      { ...runCaseFixture, id: 'loose', title: 'Кейс без сьюта', position: 0, suiteMetadata: [] },
      {
        ...runCaseFixture,
        id: 'nested',
        displayId: 'WEB-2',
        title: 'Смена пароля',
        position: 1,
        suiteMetadata: [
          suite,
          { ...suite, suiteId: 'passwords', suiteTitle: 'Пароли', position: 1 },
        ],
      },
      {
        ...runCaseFixture,
        id: 'payments',
        displayId: 'WEB-3',
        title: 'Оплата заказа',
        position: 2,
        suiteMetadata: [{ ...suite, suiteId: 'payments', suiteTitle: 'Платежи' }],
      },
      { ...runCaseFixture, id: 'direct', displayId: 'WEB-4', title: 'Вход', position: 3 },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const navigator = within(canvas.getByRole('navigation', { name: 'Кейсы запуска' }));
    const suiteButton = navigator.getByRole('button', { name: 'Аутентификация' });
    await expect(suiteButton).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(suiteButton);
    await userEvent.click(navigator.getByRole('button', { name: 'Пароли' }));
    const passwords = navigator.getByRole('list', { name: 'Пароли' });
    await expect(within(passwords).getByRole('button', { name: /WEB-2/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    suiteButton.focus();
    await userEvent.keyboard('{Enter}');
    await expect(suiteButton).toHaveAttribute('aria-expanded', 'false');
    await expect(navigator.queryByRole('button', { name: /WEB-2/ })).not.toBeInTheDocument();
    await userEvent.type(navigator.getByRole('textbox', { name: 'Поиск кейсов запуска' }), 'WEB-2');
    await expect(navigator.getByRole('button', { name: /WEB-2/ })).toBeVisible();
    await expect(navigator.queryByRole('button', { name: 'Платежи' })).not.toBeInTheDocument();
    await userEvent.clear(navigator.getByRole('textbox', { name: 'Поиск кейсов запуска' }));
    await userEvent.click(navigator.getByRole('button', { name: /WEB-4/ }));
    await expect(args.onSelect).toHaveBeenCalledWith('direct');
  },
};

export const IndependentPanelScrolling: Story = {
  args: {
    currentId: 'long-0',
    cases: Array.from({ length: 40 }, (_, index) => ({
      ...runCaseFixture,
      id: `long-${index}`,
      displayId: `WEB-${index + 1}`,
      title: `Длинный запуск — кейс ${index + 1}`,
      position: index,
      description: 'Строка описания кейса\n'.repeat(100),
    })),
  },
  parameters: {
    msw: [
      graphql.query('TestResults', () =>
        HttpResponse.json({
          data: {
            testResults: {
              items: Array.from({ length: 30 }, (_, index) => ({
                __typename: 'TestResult',
                id: `result-${index}`,
                testRunCaseId: 'long-0',
                status: 'PASSED',
                executedBy: 'user-1',
                comment: 'Попытка',
                durationSeconds: 30,
                createdAt: runCaseFixture.createdAt,
                updatedAt: runCaseFixture.updatedAt,
                stepResults: [],
                attachments: [],
              })),
              pageInfo: { limit: 50, offset: 0, total: 30 },
            },
          },
        }),
      ),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole('navigation', { name: 'Кейсы запуска' });
    const panel = canvas.getByRole('complementary');
    const content = canvas.getByRole('main');
    const document = canvasElement.ownerDocument;
    const scroller = document.scrollingElement!;
    await canvas.findByText('История попыток');
    await waitFor(() =>
      expect(within(panel).getAllByRole('button', { expanded: false })).toHaveLength(30),
    );
    await userEvent.click(within(nav).getByRole('button', { name: 'Аутентификация' }));
    const list = within(nav).getByRole('list', { name: 'Сьюты запуска' }).parentElement!;
    await waitFor(() => expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight));
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    const pageHeight = scroller.scrollHeight;
    const pageTop = scroller.scrollTop;
    list.scrollTop = 100;
    panel.scrollTop = 100;
    expect(list.scrollTop).toBe(100);
    expect(panel.scrollTop).toBe(100);
    expect(scroller.scrollTop).toBe(pageTop);
    expect(scroller.scrollHeight).toBe(pageHeight);
    expect(content.getBoundingClientRect().height).toBeGreaterThan(window.innerHeight);
    const navHeight = nav.getBoundingClientRect().height;
    expect(navHeight).toBeLessThanOrEqual(window.innerHeight);
    if (window.innerWidth > 1023) {
      scroller.scrollTop = 400;
      await waitFor(() => expect(scroller.scrollTop).toBe(400));
      expect(nav.getBoundingClientRect().top).toBeGreaterThanOrEqual(60);
      expect(panel.getBoundingClientRect().top).toBeGreaterThanOrEqual(60);
      expect(nav.getBoundingClientRect().height).toBe(navHeight);
    }
    list.scrollTop = 0;
    panel.scrollTop = 0;
    scroller.scrollTop = 0;
  },
};

export const ResizablePanels: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole('navigation', { name: 'Кейсы запуска' });
    const panel = canvas.getByRole('complementary');
    const content = canvas.getByRole('main');
    const left = canvas.getByRole('separator', { name: 'Ширина списка кейсов' });
    const right = canvas.getByRole('separator', { name: 'Ширина результата попытки' });
    if (window.innerWidth >= 1400) {
      await waitFor(() => expect(nav.getBoundingClientRect().width).toBe(520));
    }
    const initialLeft = nav.getBoundingClientRect().width;
    left.focus();
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(nav.getBoundingClientRect().width).toBe(initialLeft - 20));
    const initialRight = panel.getBoundingClientRect().width;
    right.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(panel.getBoundingClientRect().width).toBe(initialRight - 20));
    await userEvent.keyboard('{End}');
    expect(content.getBoundingClientRect().width).toBeGreaterThanOrEqual(420);
    expect(panel.getBoundingClientRect().width).toBe(Number(right.getAttribute('aria-valuemax')));
    await userEvent.keyboard('{Home}');
    expect(panel.getBoundingClientRect().width).toBe(280);
    left.focus();
    await userEvent.keyboard('{End}');
    expect(content.getBoundingClientRect().width).toBeGreaterThanOrEqual(420);
    expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth,
    );
  },
};

export const NarrowContainer: Story = {
  args: {
    title: 'ОченьДлинноеНазваниеЗапуска'.repeat(8),
    cases: [
      {
        ...runCaseFixture,
        steps: runCaseFixture.steps.map((step) => ({
          ...step,
          action: 'ДлинноеДействие'.repeat(20),
        })),
      },
    ],
  },
  render: (args) => (
    <div style={{ width: 390, maxWidth: '100%' }}>
      <ExecutionWorkspace {...args} />
    </div>
  ),
};
