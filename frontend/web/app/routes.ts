import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/index.tsx'),
  route('login', 'routes/login.tsx'),
  route('register', 'routes/register.tsx'),
  layout('routes/protected-layout.tsx', [
    route('workspaces', 'routes/workspaces.tsx'),
    route('workspaces/new', 'routes/workspace-new.tsx'),
    route('w/:workspaceId', 'routes/workspace.tsx'),
    route('w/:workspaceId/settings/members', 'routes/workspace-members.tsx'),
    route('w/:workspaceId/projects/new', 'routes/project-new.tsx'),
    layout('routes/project-layout.tsx', [
      route('w/:workspaceId/p/:projectId', 'routes/project-index.tsx'),
      route('w/:workspaceId/p/:projectId/dashboard', 'routes/project-dashboard.tsx'),
      route('w/:workspaceId/p/:projectId/repository', 'routes/repository.tsx'),
      route('w/:workspaceId/p/:projectId/plans', 'routes/plans.tsx'),
      route('w/:workspaceId/p/:projectId/plans/:planId', 'routes/plan-details.tsx'),
      route('w/:workspaceId/p/:projectId/runs', 'routes/runs.tsx'),
      route('w/:workspaceId/p/:projectId/runs/:runId', 'routes/run-details.tsx'),
      route('w/:workspaceId/p/:projectId/runs/:runId/execute', 'routes/run-execute-index.tsx'),
      route('w/:workspaceId/p/:projectId/runs/:runId/execute/:runCaseId', 'routes/run-execute.tsx'),
      route('w/:workspaceId/p/:projectId/settings/environments', 'routes/environments.tsx'),
    ]),
  ]),
  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig;
