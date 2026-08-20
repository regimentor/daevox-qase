import { Card, Space, Typography } from 'antd';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { LoginForm } from '@/features/auth-login';
import { RegisterForm } from '@/features/auth-register';
import { routes, safeReturnTo } from '@/shared/routes';

export function AuthPage({
  mode,
  user,
  ready,
  login,
  register,
}: {
  mode: 'login' | 'register';
  user: { id: string } | null;
  ready: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, name: string, password: string): Promise<void>;
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));
  if (!ready) return <div className="app-boot">Проверяем сессию…</div>;
  if (user) return <Navigate to={returnTo} replace />;
  return (
    <main className="auth-layout">
      <Card className="auth-card">
        <Space orientation="vertical" size={20} style={{ width: '100%' }}>
          <header>
            <Typography.Title level={2}>Daevox</Typography.Title>
            <Typography.Text type="secondary">Управление ручным QA-тестированием</Typography.Text>
          </header>
          {mode === 'login' ? (
            <LoginForm login={login} onSuccess={() => navigate(returnTo, { replace: true })} />
          ) : (
            <RegisterForm
              register={register}
              onSuccess={() => navigate(routes.workspaces(), { replace: true })}
            />
          )}
          <Typography.Text type="secondary">
            {mode === 'login' ? (
              <>
                Нет аккаунта? <Link to={routes.register()}>Зарегистрироваться</Link>
              </>
            ) : (
              <>
                Уже есть аккаунт? <Link to={routes.login()}>Войти</Link>
              </>
            )}
          </Typography.Text>
        </Space>
      </Card>
    </main>
  );
}
