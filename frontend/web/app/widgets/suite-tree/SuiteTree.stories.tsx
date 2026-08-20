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
const deleteHandler = graphql.mutation('DeleteSuite', () =>
  HttpResponse.json({ data: { deleteTestSuite: true } }),
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
export const DeleteSuccess: Story = {
  args: { selected: 'suite-1' },
  parameters: { msw: [...handlers, deleteHandler] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Действия для suite Аутентификация' }),
    );
    await userEvent.click(await body.findByText('Удалить'));
    const dialog = await body.findByRole('dialog', { name: 'Удалить suite?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await expect(body.findByText('Suite удалён')).resolves.toBeVisible();
    await expect(args.onSelect).toHaveBeenCalledWith(undefined);
  },
};
export const DeleteNonEmpty: Story = {
  parameters: {
    msw: [
      ...handlers,
      graphql.mutation('DeleteSuite', () =>
        HttpResponse.json({
          errors: [
            {
              message: 'Suite must be empty before deletion',
              extensions: { code: 'SUITE_NOT_EMPTY' },
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
    await userEvent.click(await body.findByText('Удалить'));
    const dialog = await body.findByRole('dialog', { name: 'Удалить suite?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await expect(
      body.findByText('Suite можно удалить только если в нём нет тестов и дочерних suites.'),
    ).resolves.toBeVisible();
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
    expect(await body.findByText('Удалить')).toHaveAttribute('aria-disabled', 'true');
  },
};
export const Error: Story = {
  parameters: {
    msw: [
      graphql.query('SuiteTree', () => HttpResponse.json({ errors: [{ message: 'Unavailable' }] })),
    ],
  },
};
