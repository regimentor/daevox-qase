import { Alert, Button, Form, Input } from 'antd';
import { useState } from 'react';
import { toFrontendError } from '@/shared/lib/errors';

export function LoginForm({
  login,
  onSuccess,
}: {
  login(email: string, password: string): Promise<void>;
  onSuccess(): void;
}) {
  const [form] = Form.useForm<{ email: string; password: string }>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const submit = async (values: { email: string; password: string }) => {
    setPending(true);
    setError(undefined);
    try {
      await login(values.email.trim().toLowerCase(), values.password);
      onSuccess();
    } catch (reason) {
      setError(toFrontendError(reason).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} disabled={pending}>
      {error && (
        <Form.Item>
          <Alert type="error" showIcon title={error} />
        </Form.Item>
      )}
      <Form.Item
        label="Email"
        name="email"
        rules={[
          { required: true, message: 'Введите email' },
          { type: 'email', message: 'Проверьте формат email' },
        ]}
      >
        <Input autoComplete="email" autoFocus />
      </Form.Item>
      <Form.Item
        label="Пароль"
        name="password"
        rules={[{ required: true, message: 'Введите пароль' }]}
      >
        <Input.Password autoComplete="current-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={pending} block>
        Войти
      </Button>
    </Form>
  );
}
