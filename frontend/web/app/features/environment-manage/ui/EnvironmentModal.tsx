import { Alert, Button, Form, Input, Modal } from 'antd';
import { useMutation } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import {
  CreateEnvironmentDocument,
  EnvironmentsDocument,
  UpdateEnvironmentDocument,
  type EnvironmentFieldsFragment,
} from '@/shared/api/graphql';
import { applyServerFieldErrors } from '@/shared/lib/errors';
export function EnvironmentModal({
  open,
  projectId,
  environment,
  onClose,
}: {
  open: boolean;
  projectId: string;
  environment?: EnvironmentFieldsFragment;
  onClose(): void;
}) {
  const [form] = Form.useForm<{ name: string; description?: string }>();
  const [error, setError] = useState<string>();
  const [create, createState] = useMutation(CreateEnvironmentDocument);
  const [update, updateState] = useMutation(UpdateEnvironmentDocument);
  useEffect(() => {
    if (open)
      form.setFieldsValue({
        name: environment?.name ?? '',
        description: environment?.description ?? '',
      });
  }, [open, environment, form]);
  const submit = async (values: { name: string; description?: string }) => {
    setError(undefined);
    try {
      const payload = { name: values.name.trim(), description: values.description?.trim() || null };
      if (environment) await update({ variables: { id: environment.id, input: payload } });
      else
        await create({
          variables: { projectId, ...payload },
          refetchQueries: [
            {
              query: EnvironmentsDocument,
              variables: { projectId, page: { limit: 100, offset: 0 } },
            },
          ],
        });
      onClose();
    } catch (reason) {
      setError(applyServerFieldErrors(form, reason).message);
    }
  };
  return (
    <Modal
      title={environment ? 'Изменить окружение' : 'Новое окружение'}
      open={open}
      footer={null}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={submit}
        disabled={createState.loading || updateState.loading}
      >
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form.Item label="Название" name="name" rules={[{ required: true, whitespace: true }]}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item label="Описание" name="description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          loading={createState.loading || updateState.loading}
        >
          Сохранить
        </Button>
      </Form>
    </Modal>
  );
}
