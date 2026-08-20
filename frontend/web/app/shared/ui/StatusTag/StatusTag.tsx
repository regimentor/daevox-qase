import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons';
import { Tag } from 'antd';

const statusMap = {
  UNTESTED: { label: 'Не выполнен', color: 'default', icon: <MinusCircleOutlined /> },
  PASSED: { label: 'Пройден', color: 'success', icon: <CheckCircleOutlined /> },
  FAILED: { label: 'Провален', color: 'error', icon: <CloseCircleOutlined /> },
  BLOCKED: { label: 'Заблокирован', color: 'warning', icon: <PauseCircleOutlined /> },
  SKIPPED: { label: 'Пропущен', color: 'processing', icon: <MinusCircleOutlined /> },
  DRAFT: { label: 'Черновик', color: 'default', icon: <MinusCircleOutlined /> },
  IN_PROGRESS: { label: 'В работе', color: 'processing', icon: <ClockCircleOutlined /> },
  COMPLETED: { label: 'Завершён', color: 'success', icon: <CheckCircleOutlined /> },
} as const;

export type StatusValue = keyof typeof statusMap;

export function StatusTag({ status }: { status: StatusValue }) {
  const item = statusMap[status];
  return (
    <Tag color={item.color} icon={item.icon} aria-label={`Статус: ${item.label}`}>
      {item.label}
    </Tag>
  );
}

export function getStatusLabel(status: StatusValue) {
  return statusMap[status].label;
}
