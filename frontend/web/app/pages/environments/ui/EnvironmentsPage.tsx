import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client/react';
import { App, Button, Popconfirm, Space, Table } from 'antd';
import { useState } from 'react';
import { useProjectContext } from '@/entities/project';
import { EnvironmentModal } from '@/features/environment-manage';
import {
  DeleteEnvironmentDocument,
  EnvironmentsDocument,
  type EnvironmentFieldsFragment,
} from '@/shared/api/graphql';
import { formatDate } from '@/shared/lib/dates';
import { toFrontendError } from '@/shared/lib/errors';
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from '@/shared/ui';
export function EnvironmentsPage() {
  const { project, readOnly } = useProjectContext();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<EnvironmentFieldsFragment | 'new'>();
  const query = useQuery(EnvironmentsDocument, {
    variables: { projectId: project.id, page: { limit: 100, offset: 0 } },
  });
  const [remove, removeState] = useMutation(DeleteEnvironmentDocument, {
    refetchQueries: [EnvironmentsDocument],
  });
  const deleteOne = async (id: string) => {
    try {
      await remove({ variables: { id } });
      void message.success('Окружение удалено');
    } catch (error) {
      void message.error(toFrontendError(error).message);
    }
  };
  return (
    <main className="page">
      <PageHeader
        title="Окружения"
        description="Контексты выполнения тестовых запусков"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={readOnly}
            title={readOnly ? 'Архивный проект доступен только для чтения' : undefined}
            onClick={() => setEditing('new')}
          >
            Создать
          </Button>
        }
      />
      {query.loading && !query.data ? (
        <PageSkeleton />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data?.environments.items.length ? (
        <EmptyState
          title="Нет окружений"
          description="Добавьте, например, Staging или Production."
        />
      ) : (
        <Table
          rowKey="id"
          dataSource={query.data.environments.items}
          pagination={false}
          columns={[
            { title: 'Название', dataIndex: 'name' },
            { title: 'Описание', dataIndex: 'description', render: (value) => value || '—' },
            { title: 'Обновлено', dataIndex: 'updatedAt', render: formatDate },
            {
              title: 'Действия',
              render: (_, item) => (
                <Space>
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    aria-label={`Изменить ${item.name}`}
                    disabled={readOnly}
                    onClick={() => setEditing(item)}
                  />
                  <Popconfirm
                    title="Удалить окружение?"
                    description="Использованное в запуске окружение удалить нельзя."
                    onConfirm={() => void deleteOne(item.id)}
                  >
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`Удалить ${item.name}`}
                      disabled={readOnly}
                      loading={removeState.loading}
                    />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      )}
      {editing && (
        <EnvironmentModal
          open
          projectId={project.id}
          environment={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </main>
  );
}
