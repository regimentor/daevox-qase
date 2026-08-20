import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@apollo/client/react';
import { Button, Progress, Segmented, Table } from 'antd';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useProjectContext } from '@/entities/project';
import { RunCreateDrawer } from '@/features/test-run-create';
import { TestRunsDocument, TestRunStatus } from '@/shared/api/graphql';
import { formatDate } from '@/shared/lib/dates';
import { clampPercentage } from '@/shared/lib/number';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, StatusTag } from '@/shared/ui';
import { routes } from '@/shared/routes';
export function TestRunsPage() {
  const { project, workspace, readOnly } = useProjectContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const status = params.get('status') as TestRunStatus | null;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const query = useQuery(TestRunsDocument, {
    variables: { projectId: project.id, status, page: { limit: 20, offset: (page - 1) * 20 } },
  });
  const items = query.data?.testRuns.items ?? [];
  return (
    <main className="page">
      <PageHeader
        title="Тестовые запуски"
        description="Планирование и выполнение ручных проверок"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={readOnly}
            onClick={() => setCreateOpen(true)}
          >
            Создать run
          </Button>
        }
      />
      <Segmented
        value={status ?? 'ALL'}
        options={[
          { value: 'ALL', label: 'Все' },
          { value: TestRunStatus.Draft, label: 'Черновики' },
          { value: TestRunStatus.InProgress, label: 'В работе' },
          { value: TestRunStatus.Completed, label: 'Завершённые' },
        ]}
        onChange={(value) => {
          const next = new URLSearchParams();
          if (value !== 'ALL') next.set('status', value);
          setParams(next);
        }}
        style={{ marginBottom: 14 }}
      />
      {query.loading && !query.data ? (
        <PageSkeleton />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !items.length ? (
        <EmptyState
          title="Запусков не найдено"
          description={
            status
              ? 'В этом статусе пока нет запусков.'
              : 'Создайте запуск из тест-плана или выбранных кейсов.'
          }
        />
      ) : (
        <Table
          rowKey="id"
          dataSource={items}
          loading={query.networkStatus === 4}
          pagination={{
            current: page,
            pageSize: 20,
            total: query.data?.testRuns.pageInfo.total,
            onChange: (value) => {
              const next = new URLSearchParams(params);
              next.set('page', String(value));
              setParams(next);
            },
          }}
          onRow={(item) => ({
            onClick: () => navigate(routes.run(workspace.id, project.id, item.id)),
          })}
          columns={[
            { title: 'Название', dataIndex: 'title' },
            {
              title: 'Статус',
              dataIndex: 'status',
              render: (value) => <StatusTag status={value} />,
            },
            {
              title: 'Окружение',
              dataIndex: 'environmentId',
              render: (value) =>
                value ? <span className="mono-id">{value.slice(0, 8)}</span> : '—',
            },
            {
              title: 'Источник',
              dataIndex: 'testPlanId',
              render: (value) => (value ? 'Тест-план' : 'Выбранные кейсы'),
            },
            {
              title: 'Прогресс',
              render: (_, item) => {
                const executed = item.cases.filter(
                  (entry) => entry.currentStatus !== 'UNTESTED',
                ).length;
                const percent = item.cases.length
                  ? clampPercentage((executed / item.cases.length) * 100)
                  : 0;
                return (
                  <Progress
                    aria-label={`Прогресс запуска ${item.title}`}
                    percent={percent}
                    size="small"
                    format={() => `${executed}/${item.cases.length}`}
                  />
                );
              },
            },
            { title: 'Создан', dataIndex: 'createdAt', render: formatDate },
          ]}
        />
      )}
      {createOpen && (
        <RunCreateDrawer
          open
          projectId={project.id}
          workspaceId={workspace.id}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => navigate(routes.run(workspace.id, project.id, id))}
        />
      )}
    </main>
  );
}
