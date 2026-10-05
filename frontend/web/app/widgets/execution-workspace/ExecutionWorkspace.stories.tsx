import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphql, HttpResponse } from 'msw';
import { expect, fn, userEvent, within } from 'storybook/test';
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
    const passwords = navigator.getByRole('list', { name: 'Пароли' });
    await expect(within(passwords).getByRole('button', { name: /WEB-2/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    const suiteButton = navigator.getByRole('button', { name: 'Аутентификация' });
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
