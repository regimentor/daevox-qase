import { Tag } from 'antd';
import type {
  AutomationStatus,
  TestCasePriority,
  TestCaseSeverity,
  TestCaseType,
} from '@/shared/api/graphql';

const priorityLabels: Record<TestCasePriority, string> = {
  HIGH: 'Высокий',
  MEDIUM: 'Средний',
  LOW: 'Низкий',
};
const severityLabels: Record<TestCaseSeverity, string> = {
  BLOCKER: 'Блокирующий',
  CRITICAL: 'Критический',
  MAJOR: 'Серьёзный',
  NORMAL: 'Обычный',
  MINOR: 'Незначительный',
  TRIVIAL: 'Тривиальный',
};
const typeLabels: Record<TestCaseType, string> = {
  FUNCTIONAL: 'Функциональный',
  SMOKE: 'Smoke',
  REGRESSION: 'Регрессия',
  SECURITY: 'Безопасность',
  PERFORMANCE: 'Производительность',
  USABILITY: 'Удобство',
  COMPATIBILITY: 'Совместимость',
  OTHER: 'Другой',
};
const automationLabels: Record<AutomationStatus, string> = {
  MANUAL: 'Ручной',
  TO_AUTOMATE: 'К автоматизации',
  AUTOMATED: 'Автоматизирован',
  CANNOT_AUTOMATE: 'Не автоматизируется',
};

export const labels = {
  priority: priorityLabels,
  severity: severityLabels,
  type: typeLabels,
  automation: automationLabels,
};
export function PriorityTag({ value }: { value: TestCasePriority }) {
  return (
    <Tag color={value === 'HIGH' ? 'volcano' : value === 'MEDIUM' ? 'gold' : 'default'}>
      {priorityLabels[value]}
    </Tag>
  );
}
export function SeverityTag({ value }: { value: TestCaseSeverity }) {
  return <Tag>{severityLabels[value]}</Tag>;
}
