import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { RunSummary } from '@/widgets/run-summary';
const meta = {
  title: 'Runs/Run summary',
  component: RunSummary,
  args: {
    value: {
      total: 20,
      untested: 5,
      passed: 10,
      failed: 2,
      blocked: 2,
      skipped: 1,
      executed: 15,
      progressPercent: 75,
      passRate: 67,
    },
    onStatusSelect: fn(),
  },
} satisfies Meta<typeof RunSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = {
  args: {
    value: {
      total: 0,
      untested: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      skipped: 0,
      executed: 0,
      progressPercent: 0,
      passRate: 0,
    },
  },
};
export const MobileCompact: Story = { parameters: { viewport: { defaultViewport: 'mobile1' } } };
