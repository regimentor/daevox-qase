import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client/react';
import { App, Button, Popconfirm, Space, Table, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useProjectContext } from '@/entities/project';
import { PlanEditor } from '@/features/test-plan-edit';
import { DeleteTestPlanDocument, TestPlansDocument } from '@/shared/api/graphql';
import { formatDate } from '@/shared/lib/dates';
import { toFrontendError } from '@/shared/lib/errors';
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from '@/shared/ui';
import { routes } from '@/shared/routes';
export function TestPlansPage() {
  const { project, workspace, readOnly } = useProjectContext();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const query = useQuery(TestPlansDocument, {
    variables: { projectId: project.id, page: { limit: 50, offset: 0 } },
  });
  const [remove, state] = useMutation(DeleteTestPlanDocument, {
    refetchQueries: [TestPlansDocument],
  });
  const deletePlan = async (id: string) => {
    try {
      await remove({ variables: { id } });
      void message.success('План удалён');
    } catch (error) {
      void message.error(toFrontendError(error).message);
    }
  };
  return (
    <main className="page">
      <PageHeader
        title="Тест-планы"
        description="Статические упорядоченные наборы тест-кейсов"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={readOnly}
            onClick={() => setCreateOpen(true)}
          >
            Создать план
          </Button>
        }
      />
      {query.loading && !query.data ? (
        <PageSkeleton />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data?.testPlans.items.length ? (
        <EmptyState
          title="Нет тест-планов"
          description="Создайте повторно используемый набор тест-кейсов."
        />
      ) : (
        <Table
          rowKey="id"
          dataSource={query.data.testPlans.items}
          pagination={{ pageSize: 20 }}
          onRow={(item) => ({
            onClick: () => navigate(routes.plan(workspace.id, project.id, item.id)),
          })}
          columns={[
            {
              title: 'Название',
              dataIndex: 'title',
              render: (value, item) => (
                <Space orientation="vertical" size={0}>
                  <Typography.Text strong>{value}</Typography.Text>
                  <Typography.Text type="secondary" ellipsis>
                    {item.description || 'Без описания'}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: 'Кейсов',
              render: (_, item) =>
                `${item.activeCaseCount} активных · ${item.archivedCaseCount} архивных`,
            },
            { title: 'Обновлён', dataIndex: 'updatedAt', render: formatDate },
            {
              title: 'Действия',
              render: (_, item) => (
                <Space onClick={(event) => event.stopPropagation()}>
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    disabled={readOnly}
                    onClick={() => navigate(routes.plan(workspace.id, project.id, item.id))}
                  >
                    Открыть
                  </Button>
                  <Popconfirm
                    title="Удалить план?"
                    description="План, использованный в запуске, удалить нельзя."
                    onConfirm={() => void deletePlan(item.id)}
                  >
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={readOnly}
                      loading={state.loading}
                    />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      )}
      {createOpen && (
        <PlanEditor
          open
          projectId={project.id}
          onClose={() => setCreateOpen(false)}
          onSaved={(id) => navigate(routes.plan(workspace.id, project.id, id))}
        />
      )}
    </main>
  );
}
