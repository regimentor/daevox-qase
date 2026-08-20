import { Card, Col, Progress, Row, Space, Statistic, Typography } from 'antd';
import { StatusTag } from '@/shared/ui';
import { clampPercentage } from '@/shared/lib/number';

export interface RunSummaryValue {
  total: number;
  untested: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  executed: number;
  progressPercent: number;
  passRate: number;
}
export function RunSummary({
  value,
  onStatusSelect,
}: {
  value: RunSummaryValue;
  onStatusSelect?(status: string): void;
}) {
  const statuses = [
    ['UNTESTED', value.untested],
    ['PASSED', value.passed],
    ['FAILED', value.failed],
    ['BLOCKED', value.blocked],
    ['SKIPPED', value.skipped],
  ] as const;
  return (
    <Card className="run-summary">
      <Row gutter={[24, 16]} align="middle">
        <Col xs={24} md={8}>
          <Progress
            type="dashboard"
            percent={clampPercentage(value.progressPercent)}
            strokeColor="#4f5bd5"
            aria-label={`Прогресс выполнения ${clampPercentage(value.progressPercent)} процентов`}
          />
        </Col>
        <Col xs={12} md={4}>
          <Statistic title="Выполнено" value={value.executed} suffix={`/ ${value.total}`} />
        </Col>
        <Col xs={12} md={4}>
          <Statistic title="Pass rate" value={clampPercentage(value.passRate)} suffix="%" />
        </Col>
        <Col xs={24} md={8}>
          <Typography.Text strong>Распределение результатов</Typography.Text>
          <Space orientation="vertical" size={6} style={{ display: 'flex', marginTop: 8 }}>
            {statuses.map(([status, count]) => (
              <button
                type="button"
                className="legend-button"
                key={status}
                onClick={() => onStatusSelect?.(status)}
              >
                <StatusTag status={status} />
                <strong>{count}</strong>
              </button>
            ))}
          </Space>
        </Col>
      </Row>
    </Card>
  );
}
