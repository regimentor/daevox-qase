import { AuthPage } from '@/pages/auth';
import { useAuth } from '@/app/providers/auth';
export function meta() {
  return [{ title: 'Вход — Daevox QA Suite' }];
}
export default function LoginRoute() {
  const auth = useAuth();
  return <AuthPage mode="login" {...auth} />;
}
