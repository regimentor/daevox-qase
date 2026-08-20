import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphql, HttpResponse } from 'msw';
import { fn } from 'storybook/test';
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
export const Error: Story = {
  parameters: {
    msw: [
      graphql.query('SuiteTree', () => HttpResponse.json({ errors: [{ message: 'Unavailable' }] })),
    ],
  },
};
