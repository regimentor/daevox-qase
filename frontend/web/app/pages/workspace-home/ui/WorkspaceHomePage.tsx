import { FolderOpenOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery } from '@apollo/client/react';
import { Button, Card, Col, Row, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router';
import { ProjectsDocument, WorkspaceContextDocument } from '@/shared/api/graphql';
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from '@/shared/ui';
import { routes } from '@/shared/routes';

export function WorkspaceHomePage({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate();
  const workspace = useQuery(WorkspaceContextDocument, { variables: { id: workspaceId } });
  const projects = useQuery(ProjectsDocument, {
    variables: { workspaceId, page: { limit: 100, offset: 0 } },
  });
  if ((workspace.loading || projects.loading) && !workspace.data)
    return (
      <main className="page">
        <PageSkeleton rows={7} />
      </main>
    );
  if (workspace.error || projects.error)
    return (
      <main className="page">
        <ErrorState
          error={workspace.error ?? projects.error ?? 'Ошибка'}
          onRetry={() => {
            void workspace.refetch();
            void projects.refetch();
          }}
        />
      </main>
    );
  return (
    <main className="page">
      <PageHeader
        title={workspace.data?.workspace.name ?? 'Workspace'}
        description="Проекты и настройки команды"
        extra={
          <Space>
            <Button icon={<TeamOutlined />} onClick={() => navigate(routes.members(workspaceId))}>
              Участники
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate(routes.newProject(workspaceId))}
            >
              Новый проект
            </Button>
          </Space>
        }
      />
      {!projects.data?.projects.items.length ? (
        <EmptyState
          title="Нет проектов"
          description="Создайте проект, чтобы начать вести тест-кейсы."
          action={
            <Button type="primary" onClick={() => navigate(routes.newProject(workspaceId))}>
              Создать проект
            </Button>
          }
        />
      ) : (
        <Row gutter={[16, 16]}>
          {projects.data.projects.items.map((project) => (
            <Col xs={24} md={12} xl={8} key={project.id}>
              <Card hoverable onClick={() => navigate(routes.dashboard(workspaceId, project.id))}>
                <Space orientation="vertical">
                  <Space>
                    <FolderOpenOutlined />
                    <Typography.Title level={3} style={{ margin: 0 }}>
                      {project.name}
                    </Typography.Title>
                    {project.archivedAt && <Tag>Архив</Tag>}
                  </Space>
                  <Typography.Text code>{project.code}</Typography.Text>
                  <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }}>
                    {project.description || 'Без описания'}
                  </Typography.Paragraph>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </main>
  );
}
