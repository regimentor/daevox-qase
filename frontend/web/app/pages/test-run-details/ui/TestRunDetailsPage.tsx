import {
  CheckOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client/react';
import { App, Button, Card, Descriptions, Popconfirm, Select, Space, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useProjectContext } from '@/entities/project';
import { RunSummary } from '@/widgets/run-summary';
import { RunCaseTable } from '@/widgets/run-case-table';
import {
  AssignRunCasesDocument,
  CompleteTestRunDocument,
  DeleteTestRunDocument,
  RunSummaryDocument,
  StartTestRunDocument,
  TestRunDocument,
  TestRunStatus,
  WorkspaceMembersDocument,
} from '@/shared/api/graphql';
import { formatDate } from '@/shared/lib/dates';
import { toFrontendError } from '@/shared/lib/errors';
import { ErrorState, PageHeader, PageSkeleton, StatusTag } from '@/shared/ui';
import { routes } from '@/shared/routes';
export function TestRunDetailsPage({ runId }: { runId: string }) {
  const { project, workspace, readOnly } = useProjectContext();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>();
  const run = useQuery(TestRunDocument, { variables: { id: runId } });
  const summary = useQuery(RunSummaryDocument, { variables: { runId } });
  const members = useQuery(WorkspaceMembersDocument, {
    variables: { workspaceId: workspace.id, page: { limit: 100, offset: 0 } },
  });
  const [start, startState] = useMutation(StartTestRunDocument, {
    refetchQueries: [TestRunDocument, RunSummaryDocument],
  });
  const [complete, completeState] = useMutation(CompleteTestRunDocument, {
    refetchQueries: [TestRunDocument, RunSummaryDocument],
  });
  const [remove] = useMutation(DeleteTestRunDocument);
  const [assign, assignState] = useMutation(AssignRunCasesDocument);
  if (run.loading && !run.data)
    return (
      <main className="page">
        <PageSkeleton rows={10} />
      </main>
    );
  if (run.error || summary.error)
    return (
      <main className="page">
        <ErrorState
          error={run.error ?? summary.error ?? 'Ошибка'}
          onRetry={() => {
            void run.refetch();
            void summary.refetch();
          }}
        />
      </main>
    );
  const item = run.data?.testRun;
  if (!item) return null;
  const action = async (kind: 'start' | 'complete') => {
    try {
      if (kind === 'start') await start({ variables: { id: runId } });
      else await complete({ variables: { id: runId } });
      void message.success(kind === 'start' ? 'Запуск начат' : 'Запуск завершён');
    } catch (error) {
      void message.error(toFrontendError(error).message);
    }
  };
  const assignCases = async (assigneeId: string | null) => {
    try {
      await assign({ variables: { runId, assigneeId, runCaseIds: selected.map(String) } });
      setSelected([]);
      void message.success('Исполнитель назначен');
    } catch (error) {
      void message.error(toFrontendError(error).message);
    }
  };
  return (
    <main className="page">
      <PageHeader
        title={
          <Space>
            {item.title}
            <StatusTag status={item.status} />
          </Space>
        }
        description={`Run snapshot · ${item.cases.length} кейсов`}
        extra={
          <Space>
            {item.status === TestRunStatus.Draft && (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={startState.loading}
                disabled={readOnly}
                onClick={() =>
                  modal.confirm({
                    title: 'Начать запуск?',
                    content: 'Snapshot будет доступен для выполнения.',
                    onOk: () => action('start'),
                  })
                }
              >
                Начать
              </Button>
            )}
            {item.status === TestRunStatus.InProgress && (
              <>
                <Button onClick={() => navigate(routes.execute(workspace.id, project.id, item.id))}>
                  Открыть выполнение
                </Button>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={completeState.loading}
                  onClick={() =>
                    modal.confirm({
                      title: 'Завершить запуск?',
                      content: 'После завершения результаты нельзя добавлять.',
                      okText: 'Завершить',
                      onOk: () => action('complete'),
                    })
                  }
                >
                  Завершить
                </Button>
              </>
            )}
            {item.status === TestRunStatus.Draft && (
              <Popconfirm
                title="Удалить черновик запуска?"
                onConfirm={async () => {
                  await remove({ variables: { id: runId } });
                  navigate(routes.runs(workspace.id, project.id));
                }}
              >
                <Button danger icon={<DeleteOutlined />} disabled={readOnly}>
                  Удалить
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      />
      {summary.data && (
        <RunSummary
          value={summary.data.runSummary}
          onStatusSelect={(value) => setStatusFilter(value === statusFilter ? undefined : value)}
        />
      )}
      <Card style={{ margin: '14px 0' }}>
        <Descriptions
          column={{ xs: 1, sm: 2, lg: 4 }}
          items={[
            {
              key: 'environment',
              label: 'Окружение',
              children: item.environmentId ? (
                <Tag className="mono-id">{item.environmentId.slice(0, 8)}</Tag>
              ) : (
                '—'
              ),
            },
            {
              key: 'source',
              label: 'Источник',
              children: item.testPlanId ? 'Тест-план' : 'Выбранные кейсы',
            },
            { key: 'created', label: 'Создан', children: formatDate(item.createdAt) },
            { key: 'started', label: 'Начат', children: formatDate(item.startedAt) },
            { key: 'completed', label: 'Завершён', children: formatDate(item.completedAt) },
          ]}
        />
      </Card>
      <Space style={{ marginBottom: 10 }}>
        <Select
          aria-label="Назначить выбранным"
          allowClear
          placeholder="Назначить выбранным"
          disabled={!selected.length || item.status === TestRunStatus.Completed || readOnly}
          loading={assignState.loading || members.loading}
          style={{ width: 260 }}
          options={members.data?.workspaceMembers.items.map((member) => ({
            value: member.userId,
            label: member.user.name,
          }))}
          onChange={(value) => void assignCases(value ?? null)}
          suffixIcon={<UserSwitchOutlined />}
        />
        {selected.length > 0 && <span>Выбрано: {selected.length}</span>}
      </Space>
      <RunCaseTable
        cases={item.cases}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        onOpen={(runCase) =>
          navigate(routes.execute(workspace.id, project.id, item.id, runCase.id))
        }
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
      />
    </main>
  );
}
