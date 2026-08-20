import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphql, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router';
import { expect, fn, userEvent, within } from 'storybook/test';
import { AppShell } from '@/widgets/app-shell';
const handlers = [
  graphql.query('Workspaces', () =>
    HttpResponse.json({
      data: {
        workspaces: {
          items: [
            {
              id: 'workspace-1',
              name: 'Daevox Team',
              createdBy: 'user-1',
              createdAt: '2026-08-20T00:00:00Z',
              updatedAt: '2026-08-20T00:00:00Z',
            },
            {
              id: 'workspace-2',
              name: 'Mobile Team',
              createdBy: 'user-1',
              createdAt: '2026-08-20T00:00:00Z',
              updatedAt: '2026-08-20T00:00:00Z',
            },
          ],
          pageInfo: { limit: 100, offset: 0, total: 1 },
        },
      },
    }),
  ),
  graphql.query('Projects', () =>
    HttpResponse.json({
      data: {
        projects: {
          items: [
            {
              id: 'project-1',
              workspaceId: 'workspace-1',
              name: 'Web App',
              code: 'WEB',
              description: null,
              archivedAt: null,
              createdAt: '2026-08-20T00:00:00Z',
              updatedAt: '2026-08-20T00:00:00Z',
            },
            {
              id: 'project-2',
              workspaceId: 'workspace-1',
              name: 'Public API',
              code: 'API',
              description: null,
              archivedAt: null,
              createdAt: '2026-08-20T00:00:00Z',
              updatedAt: '2026-08-20T00:00:00Z',
            },
          ],
          pageInfo: { limit: 100, offset: 0, total: 1 },
        },
      },
    }),
  ),
];
const meta = {
  title: 'Shared/Workspace and project switchers',
  component: AppShell,
  args: {
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    user: { name: 'QA Engineer', email: 'qa@example.com' },
    onLogout: fn(),
  },
  parameters: { msw: handlers, layout: 'fullscreen' },
  render: (args) => (
    <Routes>
      <Route element={<AppShell {...args} />}>
        <Route index element={<div className="page">Контент проекта</div>} />
        <Route path="*" element={<div className="page">Контент проекта</div>} />
      </Route>
    </Routes>
  ),
} satisfies Meta<typeof AppShell>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByText('Контент проекта');
    await userEvent.click(canvas.getByRole('button', { name: 'Свернуть меню' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Развернуть меню' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Меню пользователя' }));
    await userEvent.click(await body.findByText('Выйти'));
    await expect(args.onLogout).toHaveBeenCalled();
  },
};
export const ProjectNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Контент проекта');
    await userEvent.click(canvas.getByText('Repository'));
  },
};
export const Loading: Story = {
  parameters: {
    msw: [
      graphql.query('Workspaces', async () => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return HttpResponse.json({
          data: { workspaces: { items: [], pageInfo: { limit: 100, offset: 0, total: 0 } } },
        });
      }),
      ...handlers,
    ],
  },
};
