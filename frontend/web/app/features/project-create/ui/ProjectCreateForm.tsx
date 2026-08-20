import { Alert, Button, Form, Input } from 'antd';
import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import { CreateProjectDocument, ProjectsDocument } from '@/shared/api/graphql';
import { applyServerFieldErrors } from '@/shared/lib/errors';

export function ProjectCreateForm({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated(id: string): void;
}) {
  const [form] = Form.useForm<{ name: string; code: string; description?: string }>();
  const [error, setError] = useState<string>();
  const [create, { loading }] = useMutation(CreateProjectDocument);
  const submit = async (values: { name: string; code: string; description?: string }) => {
    setError(undefined);
    try {
      const result = await create({
        variables: {
          workspaceId,
          name: values.name.trim(),
          code: values.code.trim().toUpperCase(),
          description: values.description?.trim() || null,
        },
        refetchQueries: [
          { query: ProjectsDocument, variables: { workspaceId, page: { limit: 100, offset: 0 } } },
        ],
      });
      if (result.data) onCreated(result.data.createProject.id);
    } catch (reason) {
      setError(applyServerFieldErrors(form, reason).message);
    }
  };
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={submit}
      disabled={loading}
      style={{ maxWidth: 620 }}
    >
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      <Form.Item
        label="Название проекта"
        name="name"
        rules={[{ required: true, whitespace: true }]}
      >
        <Input autoFocus maxLength={120} />
      </Form.Item>
      <Form.Item
        label="Код"
        name="code"
        extra="Используется в ID тест-кейсов, например WEB-42"
        normalize={(value: string) => value.toUpperCase()}
        rules={[
          { required: true },
          { pattern: /^[A-Z][A-Z0-9_-]{1,15}$/, message: '2–16 латинских букв, цифр, _ или -' },
        ]}
      >
        <Input className="mono-id" maxLength={16} />
      </Form.Item>
      <Form.Item label="Описание" name="description">
        <Input.TextArea rows={4} maxLength={2000} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={loading}>
        Создать проект
      </Button>
    </Form>
  );
}
