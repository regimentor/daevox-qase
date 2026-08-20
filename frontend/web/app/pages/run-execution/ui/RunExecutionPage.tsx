import { useQuery } from '@apollo/client/react';
import { Navigate, useNavigate } from 'react-router';
import { useProjectContext } from '@/entities/project';
import { ExecutionWorkspace } from '@/widgets/execution-workspace';
import { TestRunDocument, TestRunStatus } from '@/shared/api/graphql';
import { ErrorState, PageSkeleton } from '@/shared/ui';
import { routes } from '@/shared/routes';
export function RunExecutionPage({ runId, runCaseId }: { runId: string; runCaseId?: string }) {
  const { workspace, project } = useProjectContext();
  const navigate = useNavigate();
  const query = useQuery(TestRunDocument, { variables: { id: runId } });
  if (query.loading && !query.data)
    return (
      <main className="page">
        <PageSkeleton rows={12} />
      </main>
    );
  if (query.error)
    return (
      <main className="page">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </main>
    );
  const run = query.data?.testRun;
  if (!run) return null;
  const first = run.cases.find((item) => item.currentStatus === 'UNTESTED') ?? run.cases[0];
  if (!runCaseId && first)
    return <Navigate to={routes.execute(workspace.id, project.id, runId, first.id)} replace />;
  if (!runCaseId || !run.cases.some((item) => item.id === runCaseId))
    return <Navigate to={routes.run(workspace.id, project.id, runId)} replace />;
  return (
    <ExecutionWorkspace
      workspaceId={workspace.id}
      runId={runId}
      title={run.title}
      cases={run.cases}
      currentId={runCaseId}
      disabled={run.status !== TestRunStatus.InProgress}
      onSelect={(id) => navigate(routes.execute(workspace.id, project.id, runId, id))}
      onExit={() => navigate(routes.run(workspace.id, project.id, runId))}
    />
  );
}
