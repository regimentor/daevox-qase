import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphql, HttpResponse } from 'msw';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TestCaseDrawer } from '@/features/test-case-edit';
import { testCaseFixture } from '@/shared/test';
const handlers = [
  graphql.query('SuiteTree', () =>
    HttpResponse.json({
      data: {
        suiteTree: [
          {
            id: 'suite-1',
            projectId: 'project-1',
            parentId: null,
            title: 'Аутентификация',
            description: null,
            position: 0,
            createdAt: '2026-08-20T00:00:00Z',
            updatedAt: '2026-08-20T00:00:00Z',
            children: [],
          },
        ],
      },
    }),
  ),
  graphql.query('Tags', () => HttpResponse.json({ data: { tags: testCaseFixture.tags } })),
];
const meta = {
  title: 'Repository/Test case preview',
  component: TestCaseDrawer,
  args: { open: true, projectId: 'project-1', testCase: testCaseFixture, onClose: fn() },
  parameters: { msw: handlers },
} satisfies Meta<typeof TestCaseDrawer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Preview: Story = {
  play: async ({ canvasElement }) => {
    const drawer = canvasElement.querySelector<HTMLElement>('.ant-drawer-content-wrapper');
    expect(drawer).toHaveStyle({ width: '720px' });
  },
};
export const LongContent: Story = {
  args: { testCase: { ...testCaseFixture, description: 'Длинное описание\n'.repeat(30) } },
};
export const PermissionRestricted: Story = { args: { readOnly: true } };
export const CaseStepsEditor: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click((await canvas.findAllByText('Редактировать'))[0]!);
    await userEvent.click((await canvas.findAllByText('Добавить шаг'))[0]!);
  },
};
