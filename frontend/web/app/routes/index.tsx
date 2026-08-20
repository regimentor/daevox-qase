import { Navigate } from 'react-router';
import { useAuth } from '@/app/providers/auth';
import { routes } from '@/shared/routes';
export default function IndexRoute() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="app-boot">Загрузка…</div>;
  return <Navigate to={user ? routes.workspaces() : routes.login()} replace />;
}
