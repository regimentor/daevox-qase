import { Alert, Button, Form, Input } from 'antd';
import { useState } from 'react';
import { toFrontendError } from '@/shared/lib/errors';

export function RegisterForm({
  register,
  onSuccess,
}: {
  register(email: string, name: string, password: string): Promise<void>;
  onSuccess(): void;
}) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const submit = async (values: { email: string; name: string; password: string }) => {
    setPending(true);
    setError(undefined);
    try {
      await register(values.email.trim().toLowerCase(), values.name.trim(), values.password);
      onSuccess();
    } catch (reason) {
      setError(toFrontendError(reason).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <Form layout="vertical" requiredMark={false} onFinish={submit} disabled={pending}>
      {error && (
        <Form.Item>
          <Alert type="error" showIcon title={error} />
        </Form.Item>
      )}
      <Form.Item
        label="Имя"
        name="name"
        rules={[{ required: true, whitespace: true, message: 'Введите имя' }, { max: 120 }]}
      >
        <Input autoComplete="name" autoFocus />
      </Form.Item>
      <Form.Item
        label="Email"
        name="email"
        rules={[
          { required: true, message: 'Введите email' },
          { type: 'email', message: 'Проверьте формат email' },
        ]}
      >
        <Input autoComplete="email" />
      </Form.Item>
      <Form.Item
        label="Пароль"
        name="password"
        extra="Минимум 12 символов"
        rules={[{ required: true }, { min: 12, message: 'Минимум 12 символов' }]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={pending} block>
        Создать аккаунт
      </Button>
    </Form>
  );
}
