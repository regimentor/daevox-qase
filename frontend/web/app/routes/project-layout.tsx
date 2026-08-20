import type { Route } from './+types/project-layout';
import { Navigate, useNavigate } from 'react-router';
import { useQuery } from '@apollo/client/react';
import { useAuth } from '@/app/providers/auth';
import { ProjectContextProvider } from '@/entities/project';
import { AppShell } from '@/widgets/app-shell';
import { ProjectContextDocument, WorkspaceContextDocument } from '@/shared/api/graphql';
import { ErrorState, NotFoundState, PageSkeleton } from '@/shared/ui';
import { routes } from '@/shared/routes';
import { toFrontendError } from '@/shared/lib/errors';

export default function ProjectLayout({ params }: Route.ComponentProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const workspace = useQuery(WorkspaceContextDocument, { variables: { id: params.workspaceId } });
  const project = useQuery(ProjectContextDocument, { variables: { id: params.projectId } });
  if ((workspace.loading || project.loading) && (!workspace.data || !project.data))
    return (
      <main className="page">
        <PageSkeleton rows={10} />
      </main>
    );
  const error = workspace.error ?? project.error;
  if (error) {
    const mapped = toFrontendError(error);
    return (
      <main className="page">
        {mapped.code === 'RESOURCE_NOT_FOUND' ? (
          <NotFoundState />
        ) : (
          <ErrorState
            error={mapped.message}
            onRetry={() => {
              void workspace.refetch();
              void project.refetch();
            }}
          />
        )}
      </main>
    );
  }
  if (!workspace.data || !project.data || project.data.project.workspaceId !== params.workspaceId)
    return (
      <main className="page">
        <NotFoundState />
      </main>
    );
  if (!user) return <Navigate to={routes.login()} replace />;
  return (
    <ProjectContextProvider
      value={{
        workspace: workspace.data.workspace,
        project: project.data.project,
        readOnly: Boolean(project.data.project.archivedAt),
      }}
    >
      <AppShell
        workspaceId={params.workspaceId}
        projectId={params.projectId}
        user={user}
        onLogout={async () => {
          await logout();
          navigate(routes.login(), { replace: true });
        }}
      />
    </ProjectContextProvider>
  );
}
