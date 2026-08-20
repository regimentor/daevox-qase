import { Button, Select, Table } from 'antd';
import { useEffect, useRef } from 'react';
import type { RunCaseFieldsFragment } from '@/shared/api/graphql';
import { StatusTag } from '@/shared/ui';
import { formatDuration } from '@/shared/lib/dates';
export function RunCaseTable({
  cases,
  loading,
  selectedKeys,
  onSelectionChange,
  onOpen,
  statusFilter,
  onStatusFilter,
}: {
  cases: readonly RunCaseFieldsFragment[];
  loading?: boolean;
  selectedKeys: React.Key[];
  onSelectionChange(keys: React.Key[]): void;
  onOpen(item: RunCaseFieldsFragment): void;
  statusFilter?: string;
  onStatusFilter(value?: string): void;
}) {
  const tableRegion = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tableRegion.current?.querySelector('.ant-table-content')?.setAttribute('tabindex', '0');
  });
  const filtered = statusFilter
    ? cases.filter((item) => item.currentStatus === statusFilter)
    : cases;
  return (
    <>
      <Select
        aria-label="Фильтр кейсов запуска по статусу"
        allowClear
        placeholder="Фильтр по статусу"
        value={statusFilter}
        onChange={onStatusFilter}
        style={{ width: 210, marginBottom: 12 }}
        options={['UNTESTED', 'PASSED', 'FAILED', 'BLOCKED', 'SKIPPED'].map((value) => ({
          value,
          label: <StatusTag status={value as 'UNTESTED'} />,
        }))}
      />
      <div ref={tableRegion}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={[...filtered]}
          pagination={{ pageSize: 50 }}
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: onSelectionChange }}
          onRow={(item) => ({ onClick: () => onOpen(item) })}
          columns={[
            { title: '#', dataIndex: 'position', width: 60, render: (value) => value + 1 },
            {
              title: 'ID',
              dataIndex: 'displayId',
              width: 110,
              render: (value) => <span className="mono-id">{value}</span>,
            },
            { title: 'Snapshot', dataIndex: 'title' },
            {
              title: 'Статус',
              dataIndex: 'currentStatus',
              width: 150,
              render: (value) => <StatusTag status={value} />,
            },
            {
              title: 'Исполнитель',
              dataIndex: 'assigneeId',
              width: 140,
              render: (value) =>
                value ? <span className="mono-id">{value.slice(0, 8)}</span> : '—',
            },
            {
              title: 'Оценка',
              dataIndex: 'estimatedDurationSeconds',
              width: 110,
              render: formatDuration,
            },
            {
              title: <span className="sr-only">Действие</span>,
              width: 110,
              render: (_, item) => (
                <Button
                  type="link"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(item);
                  }}
                >
                  Выполнить
                </Button>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
