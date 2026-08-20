import { useQuery } from '@apollo/client/react';
import { Card, Col, Row, Table, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router';
import { useProjectContext } from '@/entities/project';
import { ArchiveProjectButton } from '@/features/project-archive';
import { ProjectDashboardDocument } from '@/shared/api/graphql';
import { ErrorState, PageHeader, PageSkeleton, StatusTag } from '@/shared/ui';
import { formatDate } from '@/shared/lib/dates';
import { formatPercentage } from '@/shared/lib/number';
import { routes } from '@/shared/routes';

export function ProjectDashboardPage() {
  const { project, workspace } = useProjectContext();
  const navigate = useNavigate();
  const query = useQuery(ProjectDashboardDocument, { variables: { projectId: project.id } });
  if (query.loading && !query.data)
    return (
      <main className="page">
        <PageSkeleton rows={9} />
      </main>
    );
  if (query.error)
    return (
      <main className="page">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </main>
    );
  const dashboard = query.data?.projectDashboard;
  if (!dashboard) return null;
  const metrics = [
    ['Всего тест-кейсов', dashboard.totalTestCases],
    ['Ручные', dashboard.manualTestCases],
    ['Автоматизированные', dashboard.automatedTestCases],
    ['Запусков за 30 дней', dashboard.runsLast30Days],
    ['Средний pass rate', formatPercentage(dashboard.averagePassRate)],
  ];
  return (
    <main className="page">
      <PageHeader
        title={
          <>
            {project.code} · {project.name} {project.archivedAt && <Tag>Архив · только чтение</Tag>}
          </>
        }
        description={project.description || 'Обзор проекта'}
        extra={
          <ArchiveProjectButton
            projectId={project.id}
            projectName={project.name}
            disabled={Boolean(project.archivedAt)}
          />
        }
      />
      <Row gutter={[12, 12]}>
        {metrics.map(([title, value]) => (
          <Col xs={12} lg={Math.floor(24 / 5)} key={title}>
            <Card>
              <Typography.Text type="secondary">{title}</Typography.Text>
              <Typography.Title level={3} style={{ margin: '6px 0 0' }}>
                {value}
              </Typography.Title>
            </Card>
          </Col>
        ))}
      </Row>
      <section style={{ marginTop: 20 }}>
        <Typography.Title level={3}>Последние запуски</Typography.Title>
        <Table
          rowKey="id"
          dataSource={dashboard.latestRuns}
          pagination={false}
          locale={{ emptyText: 'Запусков пока нет' }}
          onRow={(run) => ({
            onClick: () => navigate(routes.run(workspace.id, project.id, run.id)),
          })}
          columns={[
            { title: 'Название', dataIndex: 'title' },
            {
              title: 'Статус',
              dataIndex: 'status',
              render: (status) => <StatusTag status={status} />,
            },
            { title: 'Создан', dataIndex: 'createdAt', render: formatDate },
          ]}
        />
      </section>
    </main>
  );
}
