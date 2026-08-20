import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Space } from 'antd';
import { EmptyState, ErrorState, PriorityTag, SeverityTag, StatusTag } from '@/shared/ui';
import { TestCasePriority, TestCaseSeverity } from '@/shared/api/graphql';

const meta = {
  title: 'Shared/Semantic states',
  component: StatusTag,
  tags: ['autodocs'],
} satisfies Meta<typeof StatusTag>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Statuses: Story = {
  args: { status: 'IN_PROGRESS' },
  render: () => (
    <Space wrap>
      {(
        [
          'UNTESTED',
          'PASSED',
          'FAILED',
          'BLOCKED',
          'SKIPPED',
          'DRAFT',
          'IN_PROGRESS',
          'COMPLETED',
        ] as const
      ).map((status) => (
        <StatusTag status={status} key={status} />
      ))}
    </Space>
  ),
};
export const PriorityAndSeverity: Story = {
  args: { status: 'DRAFT' },
  render: () => (
    <Space>
      <PriorityTag value={TestCasePriority.High} />
      <PriorityTag value={TestCasePriority.Medium} />
      <SeverityTag value={TestCaseSeverity.Blocker} />
    </Space>
  ),
};
export const Empty: Story = {
  args: { status: 'DRAFT' },
  render: () => (
    <EmptyState
      title="Нет тест-кейсов"
      description="Создайте первый кейс."
      action={<Button>Создать</Button>}
    />
  ),
};
export const Error: Story = {
  args: { status: 'FAILED' },
  render: () => <ErrorState error="Сервер временно недоступен" onRetry={() => undefined} />,
};
