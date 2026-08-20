import { AuthPage } from '@/pages/auth';
import { useAuth } from '@/app/providers/auth';
export function meta() {
  return [{ title: 'Регистрация — Daevox QA Suite' }];
}
export default function RegisterRoute() {
  const auth = useAuth();
  return <AuthPage mode="register" {...auth} />;
}
