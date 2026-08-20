import { Button, Form, Input, Modal } from 'antd';
import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import { CreateWorkspaceDocument, WorkspacesDocument } from '@/shared/api/graphql';
import { applyServerFieldErrors } from '@/shared/lib/errors';

export function WorkspaceCreateModal({
  open,
  onCancel,
  onCreated,
}: {
  open: boolean;
  onCancel(): void;
  onCreated(id: string): void;
}) {
  const [form] = Form.useForm<{ name: string }>();
  const [error, setError] = useState<string>();
  const [create, { loading }] = useMutation(CreateWorkspaceDocument, {
    refetchQueries: [WorkspacesDocument],
  });
  const submit = async ({ name }: { name: string }) => {
    setError(undefined);
    try {
      const result = await create({ variables: { name: name.trim() } });
      if (result.data) {
        form.resetFields();
        onCreated(result.data.createWorkspace.id);
      }
    } catch (reason) {
      const mapped = applyServerFieldErrors(form, reason);
      setError(mapped.message);
    }
  };
  return (
    <Modal
      title="Новое рабочее пространство"
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={submit} disabled={loading}>
        <Form.Item
          label="Название"
          name="name"
          validateStatus={error ? 'error' : undefined}
          help={error}
          rules={[{ required: true, whitespace: true, message: 'Введите название' }]}
        >
          <Input autoFocus maxLength={120} />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" loading={loading}>
            Создать
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}
