import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphql, HttpResponse } from 'msw';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SuiteTree } from '@/widgets/suite-tree';
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
            archivedAt: null,
            children: [
              {
                id: 'suite-2',
                projectId: 'project-1',
                parentId: 'suite-1',
                title: 'Вход',
                description: null,
                position: 0,
                createdAt: '2026-08-20T00:00:00Z',
                updatedAt: '2026-08-20T00:00:00Z',
                archivedAt: null,
                children: [],
              },
            ],
          },
        ],
      },
    }),
  ),
];
const updateHandler = graphql.mutation('UpdateSuite', () =>
  HttpResponse.json({
    data: { updateTestSuite: { id: 'suite-1', title: 'Учётные записи', parentId: null } },
  }),
);
const previewHandler = graphql.query('SuiteArchivePreview', () =>
  HttpResponse.json({
    data: {
      suiteArchivePreview: { suiteCount: 2, caseCount: 3, affectedPlans: [] },
    },
  }),
);
const archiveHandler = graphql.mutation('ArchiveSuite', () =>
  HttpResponse.json({ data: { archiveTestSuite: { id: 'suite-1', archivedAt: '2026-08-21' } } }),
);
const restoreHandler = graphql.mutation('RestoreSuite', () =>
  HttpResponse.json({ data: { restoreTestSuite: { id: 'suite-1', archivedAt: null } } }),
);
const meta = {
  title: 'Repository/Suite tree',
  component: SuiteTree,
  args: { projectId: 'project-1', onSelect: fn() },
  parameters: { msw: handlers },
} satisfies Meta<typeof SuiteTree>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const PermissionRestricted: Story = { args: { disabled: true } };
export const RenameSuccess: Story = {
  parameters: { msw: [...handlers, updateHandler] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Действия для suite Аутентификация' }),
    );
    await userEvent.click(await body.findByText('Переименовать'));
    const dialog = await body.findByRole('dialog', { name: 'Переименовать suite' });
    const input = within(dialog).getByRole('textbox', { name: 'Название' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Учётные записи');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await expect(body.findByText('Suite переименован')).resolves.toBeVisible();
  },
};
export const ArchiveSuccess: Story = {
  args: { selected: 'suite-1' },
  parameters: { msw: [...handlers, previewHandler, archiveHandler] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Действия для suite Аутентификация' }),
    );
    await userEvent.click(await body.findByText('Архивировать'));
    const dialog = await body.findByRole('dialog', { name: 'Архивировать suite?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Архивировать' }));
    await expect(body.findByText('Suite архивирован')).resolves.toBeVisible();
    await expect(args.onSelect).toHaveBeenCalledWith(undefined);
  },
};
export const ArchivePreviewError: Story = {
  parameters: {
    msw: [
      ...handlers,
      graphql.query('SuiteArchivePreview', () =>
        HttpResponse.json({
          errors: [
            {
              message: 'Unavailable',
            },
          ],
        }),
      ),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Действия для suite Аутентификация' }),
    );
    await userEvent.click(await body.findByText('Архивировать'));
    await expect(body.findByText('Unavailable')).resolves.toBeVisible();
  },
};
export const ActionsDisabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Действия для suite Аутентификация' }),
    );
    expect(await body.findByText('Переименовать')).toHaveAttribute('aria-disabled', 'true');
    expect(await body.findByText('Архивировать')).toHaveAttribute('aria-disabled', 'true');
  },
};
export const RestoreArchived: Story = {
  args: { includeArchived: true },
  parameters: {
    msw: [
      graphql.query('SuiteTree', () =>
        HttpResponse.json({
          data: {
            suiteTree: [
              {
                id: 'suite-1',
                projectId: 'project-1',
                parentId: null,
                title: 'Архивная suite',
                description: null,
                position: 0,
                createdAt: '2026-08-20T00:00:00Z',
                updatedAt: '2026-08-20T00:00:00Z',
                archivedAt: '2026-08-21T00:00:00Z',
                children: [],
              },
            ],
          },
        }),
      ),
      restoreHandler,
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Действия для suite Архивная suite' }),
    );
    await userEvent.click(await body.findByText('Восстановить'));
    await expect(body.findByText('Suite восстановлен')).resolves.toBeVisible();
  },
};
export const Error: Story = {
  parameters: {
    msw: [
      graphql.query('SuiteTree', () => HttpResponse.json({ errors: [{ message: 'Unavailable' }] })),
    ],
  },
};
