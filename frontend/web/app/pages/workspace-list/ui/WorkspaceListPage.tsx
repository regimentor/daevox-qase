import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery } from '@apollo/client/react';
import { Button, Card, Col, Row, Space, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { WorkspaceCreateModal } from '@/features/workspace-create';
import { WorkspacesDocument } from '@/shared/api/graphql';
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from '@/shared/ui';
import { routes } from '@/shared/routes';
import { formatDate } from '@/shared/lib/dates';

export function WorkspaceListPage({ createInitially = false }: { createInitially?: boolean }) {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(createInitially);
  const { data, loading, error, refetch } = useQuery(WorkspacesDocument, {
    variables: { page: { limit: 100, offset: 0 } },
  });
  const created = (id: string) => {
    setCreateOpen(false);
    navigate(routes.workspace(id));
  };
  return (
    <main className="page workspace-list-page">
      <PageHeader
        title="Рабочие пространства"
        description="Выберите команду или создайте новую."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Создать workspace
          </Button>
        }
      />
      {loading && !data ? (
        <PageSkeleton rows={6} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data?.workspaces.items.length ? (
        <EmptyState
          title="Нет рабочих пространств"
          description="Создайте первое пространство для вашей QA-команды."
          action={
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              Создать workspace
            </Button>
          }
        />
      ) : (
        <Row gutter={[16, 16]}>
          {data.workspaces.items.map((workspace) => (
            <Col xs={24} md={12} xl={8} key={workspace.id}>
              <Card
                hoverable
                onClick={() => navigate(routes.workspace(workspace.id))}
                onKeyDown={(event) =>
                  event.key === 'Enter' && navigate(routes.workspace(workspace.id))
                }
                tabIndex={0}
              >
                <Space orientation="vertical">
                  <Typography.Title level={3}>{workspace.name}</Typography.Title>
                  <Typography.Text type="secondary">
                    <TeamOutlined /> Команда workspace
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    Обновлено: {formatDate(workspace.updatedAt)}
                  </Typography.Text>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}
      <WorkspaceCreateModal
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          if (createInitially) navigate(routes.workspaces());
        }}
        onCreated={created}
      />
    </main>
  );
}
