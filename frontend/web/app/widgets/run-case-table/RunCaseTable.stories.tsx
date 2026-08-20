import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { RunCaseTable } from '@/widgets/run-case-table';
import { runCaseFixture } from '@/shared/test';
const meta = {
  title: 'Runs/Run case table',
  component: RunCaseTable,
  args: {
    cases: [runCaseFixture],
    selectedKeys: [],
    onSelectionChange: fn(),
    onOpen: fn(),
    onStatusFilter: fn(),
  },
} satisfies Meta<typeof RunCaseTable>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Loading: Story = { args: { loading: true } };
export const ManyRows: Story = {
  args: {
    cases: Array.from({ length: 25 }, (_, index) => ({
      ...runCaseFixture,
      id: `rc-${index}`,
      position: index,
      displayId: `WEB-${index + 1}`,
    })),
  },
};
