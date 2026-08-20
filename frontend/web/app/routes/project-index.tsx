import type { Route } from './+types/project-index';
import { Navigate } from 'react-router';
import { routes } from '@/shared/routes';
export default function ProjectIndex({ params }: Route.ComponentProps) {
  return <Navigate to={routes.dashboard(params.workspaceId, params.projectId)} replace />;
}
