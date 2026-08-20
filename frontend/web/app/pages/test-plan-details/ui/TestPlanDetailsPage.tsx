import { EditOutlined } from '@ant-design/icons';
import { useQuery } from '@apollo/client/react';
import { Button, Table, Typography } from 'antd';
import { useState } from 'react';
import { useProjectContext } from '@/entities/project';
import { PlanEditor } from '@/features/test-plan-edit';
import { TestPlanDocument } from '@/shared/api/graphql';
import { ErrorState, PageHeader, PageSkeleton, PriorityTag } from '@/shared/ui';
export function TestPlanDetailsPage({ planId }: { planId: string }) {
  const { project, readOnly } = useProjectContext();
  const [editing, setEditing] = useState(false);
  const query = useQuery(TestPlanDocument, { variables: { id: planId } });
  if (query.loading && !query.data)
    return (
      <main className="page">
        <PageSkeleton />
      </main>
    );
  if (query.error)
    return (
      <main className="page">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </main>
    );
  const plan = query.data?.testPlan;
  if (!plan) return null;
  return (
    <main className="page">
      <PageHeader
        title={plan.title}
        description={plan.description || 'Без описания'}
        extra={
          <Button icon={<EditOutlined />} disabled={readOnly} onClick={() => setEditing(true)}>
            Редактировать
          </Button>
        }
      />
      <Typography.Title level={3}>Кейсы · {plan.testCases.length}</Typography.Title>
      <Table
        rowKey="id"
        dataSource={plan.testCases}
        pagination={false}
        columns={[
          { title: '#', render: (_, __, index) => index + 1, width: 60 },
          { title: 'ID', dataIndex: 'displayId', width: 110 },
          { title: 'Название', dataIndex: 'title' },
          {
            title: 'Приоритет',
            dataIndex: 'priority',
            render: (value) => <PriorityTag value={value} />,
          },
        ]}
      />
      {editing && (
        <PlanEditor
          open
          projectId={project.id}
          planId={planId}
          onClose={() => setEditing(false)}
          onSaved={() => void query.refetch()}
        />
      )}
    </main>
  );
}
