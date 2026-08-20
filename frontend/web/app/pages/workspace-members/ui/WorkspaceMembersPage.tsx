import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import {
  AddWorkspaceMemberDocument,
  RemoveWorkspaceMemberDocument,
  UpdateWorkspaceMemberDocument,
  WorkspaceMembersDocument,
  type WorkspaceRole,
} from '@/shared/api/graphql';
import { formatDate } from '@/shared/lib/dates';
import { applyServerFieldErrors, toFrontendError } from '@/shared/lib/errors';
import { ErrorState, PageHeader, PageSkeleton } from '@/shared/ui';

export function WorkspaceMembersPage({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<{ email: string; role: WorkspaceRole }>();
  const [formError, setFormError] = useState<string>();
  const query = useQuery(WorkspaceMembersDocument, {
    variables: { workspaceId, page: { limit: 100, offset: 0 } },
  });
  const [add, addState] = useMutation(AddWorkspaceMemberDocument, {
    refetchQueries: [WorkspaceMembersDocument],
  });
  const [update, updateState] = useMutation(UpdateWorkspaceMemberDocument);
  const [remove, removeState] = useMutation(RemoveWorkspaceMemberDocument, {
    refetchQueries: [WorkspaceMembersDocument],
  });
  const isAdmin = useMemo(
    () =>
      query.data?.workspaceMembers.items.some(
        (item) => item.userId === userId && item.role === 'ADMIN',
      ) ?? false,
    [query.data, userId],
  );
  const submit = async (values: { email: string; role: WorkspaceRole }) => {
    setFormError(undefined);
    try {
      await add({
        variables: { workspaceId, email: values.email.trim().toLowerCase(), role: values.role },
      });
      setOpen(false);
      form.resetFields();
      void message.success('Участник добавлен');
    } catch (error) {
      setFormError(applyServerFieldErrors(form, error).message);
    }
  };
  const changeRole = async (memberId: string, role: WorkspaceRole) => {
    try {
      await update({ variables: { workspaceId, userId: memberId, role } });
      void message.success('Роль обновлена');
    } catch (error) {
      void message.error(toFrontendError(error).message);
    }
  };
  const removeMember = async (memberId: string) => {
    try {
      await remove({ variables: { workspaceId, userId: memberId } });
      void message.success('Участник удалён');
    } catch (error) {
      void message.error(toFrontendError(error).message);
    }
  };
  return (
    <main className="page">
      <PageHeader
        title="Участники"
        description="Роли и доступ к рабочему пространству"
        extra={
          isAdmin && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              Добавить
            </Button>
          )
        }
      />
      {query.loading && !query.data ? (
        <PageSkeleton />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Table
          rowKey="id"
          dataSource={query.data?.workspaceMembers.items}
          loading={query.networkStatus === 4}
          pagination={false}
          columns={[
            {
              title: 'Пользователь',
              render: (_, item) => (
                <Space orientation="vertical" size={0}>
                  <Typography.Text strong>{item.user.name}</Typography.Text>
                  <Typography.Text type="secondary">{item.user.email}</Typography.Text>
                </Space>
              ),
            },
            {
              title: 'Роль',
              dataIndex: 'role',
              render: (role: WorkspaceRole, item) =>
                isAdmin ? (
                  <Select
                    aria-label={`Роль ${item.user.name}`}
                    value={role}
                    disabled={updateState.loading}
                    options={[
                      { value: 'ADMIN', label: 'Администратор' },
                      { value: 'MEMBER', label: 'Участник' },
                    ]}
                    onChange={(value) => void changeRole(item.userId, value)}
                  />
                ) : (
                  <Tag>{role === 'ADMIN' ? 'Администратор' : 'Участник'}</Tag>
                ),
            },
            { title: 'Добавлен', dataIndex: 'createdAt', render: formatDate },
            {
              title: 'Действия',
              width: 100,
              render: (_, item) =>
                isAdmin && (
                  <Popconfirm
                    title="Удалить участника?"
                    description="Доступ к workspace будет отозван."
                    onConfirm={() => void removeMember(item.userId)}
                  >
                    <Button
                      danger
                      type="text"
                      loading={removeState.loading}
                      aria-label={`Удалить ${item.user.name}`}
                      icon={<DeleteOutlined />}
                    />
                  </Popconfirm>
                ),
            },
          ]}
        />
      )}
      <Modal
        title="Добавить участника"
        open={open}
        footer={null}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ role: 'MEMBER' }}
          onFinish={submit}
          disabled={addState.loading}
        >
          {formError && (
            <Alert type="error" showIcon title={formError} style={{ marginBottom: 16 }} />
          )}
          <Form.Item
            label="Email зарегистрированного пользователя"
            name="email"
            rules={[{ required: true }, { type: 'email' }]}
          >
            <Input autoFocus />
          </Form.Item>
          <Form.Item label="Роль" name="role">
            <Select
              options={[
                { value: 'MEMBER', label: 'Участник' },
                { value: 'ADMIN', label: 'Администратор' },
              ]}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={addState.loading}>
            Добавить
          </Button>
        </Form>
      </Modal>
    </main>
  );
}
