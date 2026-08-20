import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphql, HttpResponse } from 'msw';
import { fn, userEvent, within } from 'storybook/test';
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
