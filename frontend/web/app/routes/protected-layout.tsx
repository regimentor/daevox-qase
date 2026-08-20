import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/app/providers/auth';
import { routes } from '@/shared/routes';
export default function ProtectedLayout() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="app-boot">Восстанавливаем сессию…</div>;
  if (!user)
    return <Navigate to={routes.login(`${location.pathname}${location.search}`)} replace />;
  return <Outlet />;
}
