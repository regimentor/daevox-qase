import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import { TestCaseTable } from '@/widgets/test-case-table';
import { testCaseFixture } from '@/shared/test';
const meta = {
  title: 'Repository/Test case table',
  component: TestCaseTable,
  args: {
    data: [testCaseFixture],
    total: 1,
    page: 1,
    pageSize: 20,
    selectedKeys: [],
    onSelectionChange: fn(),
    onPageChange: fn(),
    onOpen: fn(),
    onArchive: fn(),
    onRestore: fn(),
  },
} satisfies Meta<typeof TestCaseTable>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('WEB-1'));
    await expect(args.onOpen).toHaveBeenCalled();
  },
};
export const Loading: Story = { args: { loading: true } };
export const Empty: Story = { args: { data: [], total: 0 } };
export const ManyRows: Story = {
  args: {
    data: Array.from({ length: 30 }, (_, index) => ({
      ...testCaseFixture,
      id: `case-${index}`,
      caseNumber: index + 1,
      displayId: `WEB-${index + 1}`,
      title: `${testCaseFixture.title} ${index + 1}`,
    })),
    total: 30,
  },
};
export const LongDisplayId: Story = {
  args: {
    data: [
      {
        ...testCaseFixture,
        displayId: 'ONLINEREGWEB-13',
        title: 'Проверка работоспособности выбора филиала',
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const displayId = canvas.getByText('ONLINEREGWEB-13');
    const title = canvas.getByText('Проверка работоспособности выбора филиала');
    expect(displayId.getBoundingClientRect().right).toBeLessThan(
      title.getBoundingClientRect().left,
    );
  },
};
export const PermissionRestricted: Story = { args: { selectedKeys: [] } };
export const ActionsAndArchivedRow: Story = {
  args: {
    data: [
      { ...testCaseFixture, assigneeId: 'user-assigned' },
      {
        ...testCaseFixture,
        id: 'case-archived',
        caseNumber: 2,
        displayId: 'WEB-2',
        title: 'Архивный сценарий',
        archivedAt: '2026-08-20T10:00:00Z',
      },
    ],
    total: 2,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    expect(await canvas.findByText('user-ass')).toBeVisible();
    expect(canvas.getByText('Архив')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Действия WEB-1' }));
    await userEvent.click(await body.findByText('Архивировать'));
    await expect(args.onArchive).toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: 'Действия WEB-2' }));
    fireEvent.click((await body.findAllByText('Открыть')).at(-1)!);
    await expect(args.onOpen).toHaveBeenCalled();
  },
};
