import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphql, HttpResponse } from 'msw';
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
import { PlanEditor } from '@/features/test-plan-edit';
import { testCaseFixture } from '@/shared/test';

const now = '2026-08-20T08:00:00Z';
const firstCase = {
  __typename: 'TestCase' as const,
  ...testCaseFixture,
  steps: testCaseFixture.steps.map((step) => ({ __typename: 'TestStep' as const, ...step })),
  tags: testCaseFixture.tags.map((tag) => ({ __typename: 'Tag' as const, ...tag })),
};
const secondCase = {
  ...firstCase,
  id: 'case-2',
  caseNumber: 2,
  displayId: 'WEB-2',
  title: 'Восстановление пароля',
};
const plan = {
  __typename: 'TestPlan' as const,
  id: 'plan-1',
  projectId: 'project-1',
  title: 'Smoke plan',
  description: 'Критический путь',
  createdBy: 'user-1',
  createdAt: now,
  updatedAt: now,
  testCases: [firstCase],
};
const queryHandlers = [
  graphql.query('TestPlan', () => HttpResponse.json({ data: { testPlan: plan } })),
  graphql.query('TestCases', () =>
    HttpResponse.json({
      data: {
        testCases: {
          items: [firstCase, secondCase],
          pageInfo: { limit: 100, offset: 0, total: 2 },
        },
      },
    }),
  ),
];
const meta = {
  title: 'Plans/Editor',
  component: PlanEditor,
  args: {
    open: true,
    projectId: 'project-1',
    planId: 'plan-1',
    onClose: fn(),
    onSaved: fn(),
  },
} satisfies Meta<typeof PlanEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EditReorderAndSave: Story = {
  parameters: {
    msw: [
      ...queryHandlers,
      graphql.mutation('UpdateTestPlan', () =>
        HttpResponse.json({ data: { updateTestPlan: { ...plan, title: 'Smoke updated' } } }),
      ),
      graphql.mutation('ReplaceTestPlanCases', () =>
        HttpResponse.json({ data: { replaceTestPlanCases: plan } }),
      ),
    ],
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog', { name: 'Редактировать тест-план' });
    const page = within(dialog);
    const title = dialog.querySelector<HTMLInputElement>('input#title');
    if (!title) throw new Error('Title input unavailable');
    await waitFor(() => expect(title).toBeEnabled());
    fireEvent.change(title, { target: { value: ' Smoke updated ' } });
    await userEvent.click(page.getByRole('button', { name: /Добавить кейсы/ }));
    await userEvent.click(await body.findByRole('checkbox', { name: 'Выбрать WEB-2' }));
    await userEvent.click(body.getByRole('button', { name: 'Готово' }));
    const down = page.getAllByRole('button', { name: 'Переместить ниже' })[0];
    if (down) await userEvent.click(down);
    const up = page.getAllByRole('button', { name: 'Переместить выше' })[1];
    if (up) await userEvent.click(up);
    await userEvent.click(page.getAllByRole('button', { name: 'Удалить из плана' })[1]!);
    await userEvent.click(page.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(args.onSaved).toHaveBeenCalled());
  },
};

export const SaveValidationError: Story = {
  parameters: {
    msw: [
      ...queryHandlers,
      graphql.mutation('UpdateTestPlan', () =>
        HttpResponse.json({
          errors: [
            {
              message: 'Validation failed',
              extensions: { code: 'VALIDATION_ERROR', fields: { title: 'Название занято' } },
            },
          ],
        }),
      ),
    ],
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog', { name: 'Редактировать тест-план' });
    const page = within(dialog);
    const title = dialog.querySelector<HTMLInputElement>('input#title');
    if (!title) throw new Error('Title input unavailable');
    await waitFor(() => expect(title).toBeEnabled());
    fireEvent.change(title, { target: { value: 'Smoke duplicate' } });
    await userEvent.click(page.getByRole('button', { name: 'Сохранить' }));
    expect(await page.findByText('Название занято')).toBeVisible();
  },
};

export const CreateWithoutCases: Story = {
  args: { planId: undefined },
  parameters: {
    msw: [
      graphql.query('TestCases', () =>
        HttpResponse.json({
          data: { testCases: { items: [], pageInfo: { limit: 100, offset: 0, total: 0 } } },
        }),
      ),
      graphql.mutation('CreateTestPlan', () =>
        HttpResponse.json({ data: { createTestPlan: { ...plan, id: 'plan-2', testCases: [] } } }),
      ),
      graphql.query('TestPlans', () =>
        HttpResponse.json({
          data: { testPlans: { items: [], pageInfo: { limit: 50, offset: 0, total: 0 } } },
        }),
      ),
    ],
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog', { name: 'Новый тест-план' });
    const page = within(dialog);
    const title = dialog.querySelector<HTMLInputElement>('input#title');
    if (!title) throw new Error('Title input unavailable');
    await userEvent.type(title, 'Regression');
    await userEvent.click(page.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(args.onSaved).toHaveBeenCalled());
  },
};
