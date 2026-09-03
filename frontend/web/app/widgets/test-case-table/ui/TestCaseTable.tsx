import { MoreOutlined } from '@ant-design/icons';
import { Button, Dropdown, Table, Tag, Typography } from 'antd';
import type { TablePaginationConfig } from 'antd';
import { useEffect, useRef } from 'react';
import type { AutomationStatus, TestCaseFieldsFragment, TestCaseType } from '@/shared/api/graphql';
import { formatDate } from '@/shared/lib/dates';
import { labels, PriorityTag, SeverityTag } from '@/shared/ui';

export function TestCaseTable({
  data,
  loading,
  total,
  page,
  pageSize,
  selectedKeys,
  onSelectionChange,
  onPageChange,
  onOpen,
  onArchive,
  onRestore,
  emptyText = 'Тест-кейсов пока нет',
}: {
  data: readonly TestCaseFieldsFragment[];
  loading?: boolean;
  total: number;
  page: number;
  pageSize: number;
  selectedKeys: React.Key[];
  onSelectionChange(keys: React.Key[]): void;
  onPageChange(page: number, pageSize: number): void;
  onOpen(item: TestCaseFieldsFragment): void;
  onArchive(item: TestCaseFieldsFragment): void;
  onRestore(item: TestCaseFieldsFragment): void;
  emptyText?: string;
}) {
  const tableRegion = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tableRegion.current?.querySelector('.ant-table-content')?.setAttribute('tabindex', '0');
  });
  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    showSizeChanger: true,
    pageSizeOptions: [20, 50, 100],
    onChange: onPageChange,
    showTotal: (count) => `Всего: ${count}`,
  };
  return (
    <div ref={tableRegion}>
      <Table<TestCaseFieldsFragment>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={[...data]}
        scroll={{ x: 1150 }}
        pagination={pagination}
        locale={{ emptyText }}
        rowClassName={(item) => (item.archivedAt ? 'muted-row' : '')}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: onSelectionChange }}
        onRow={(item) => ({ onClick: () => onOpen(item), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: 'ID',
            dataIndex: 'displayId',
            width: 140,
            fixed: 'left',
            render: (value, item) => (
              <Button
                size="small"
                type="link"
                className="mono-id"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen(item);
                }}
              >
                {value}
              </Button>
            ),
          },
          {
            title: 'Название',
            dataIndex: 'title',
            width: 280,
            render: (value, item) => (
              <Typography.Text strong>
                {value} {item.archivedAt && <Tag>Архив</Tag>}
              </Typography.Text>
            ),
          },
          {
            title: 'Suite',
            dataIndex: 'suiteId',
            width: 130,
            render: (value) => (
              <Typography.Text type="secondary" className="mono-id">
                {value.slice(0, 8)}
              </Typography.Text>
            ),
          },
          {
            title: 'Приоритет',
            dataIndex: 'priority',
            width: 120,
            render: (value) => <PriorityTag value={value} />,
          },
          {
            title: 'Серьёзность',
            dataIndex: 'severity',
            width: 135,
            render: (value) => <SeverityTag value={value} />,
          },
          {
            title: 'Тип',
            dataIndex: 'type',
            width: 140,
            render: (value: TestCaseType) => labels.type[value],
          },
          {
            title: 'Автоматизация',
            dataIndex: 'automationStatus',
            width: 150,
            render: (value: AutomationStatus) => labels.automation[value],
          },
          {
            title: 'Исполнитель',
            dataIndex: 'assigneeId',
            width: 130,
            render: (value) => (value ? <span className="mono-id">{value.slice(0, 8)}</span> : '—'),
          },
          { title: 'Обновлён', dataIndex: 'updatedAt', width: 160, render: formatDate },
          {
            title: <span className="sr-only">Действия</span>,
            width: 52,
            fixed: 'right',
            render: (_, item) => (
              <Dropdown
                menu={{
                  items: [
                    { key: 'open', label: 'Открыть' },
                    item.archivedAt
                      ? { key: 'restore', label: 'Восстановить' }
                      : { key: 'archive', label: 'Архивировать', danger: true },
                  ],
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    if (key === 'archive') onArchive(item);
                    else if (key === 'restore') onRestore(item);
                    else onOpen(item);
                  },
                }}
              >
                <Button
                  size="small"
                  type="text"
                  aria-label={`Действия ${item.displayId}`}
                  icon={<MoreOutlined />}
                  onClick={(event) => event.stopPropagation()}
                />
              </Dropdown>
            ),
          },
        ]}
      />
    </div>
  );
}
