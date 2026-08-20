export const routes = {
  login: (returnTo?: string) =>
    `/login${returnTo ? `?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}` : ''}`,
  register: () => '/register',
  workspaces: () => '/workspaces',
  workspace: (workspaceId: string) => `/w/${encodeURIComponent(workspaceId)}`,
  members: (workspaceId: string) => `/w/${encodeURIComponent(workspaceId)}/settings/members`,
  newProject: (workspaceId: string) => `/w/${encodeURIComponent(workspaceId)}/projects/new`,
  project: (workspaceId: string, projectId: string) =>
    `/w/${encodeURIComponent(workspaceId)}/p/${encodeURIComponent(projectId)}`,
  dashboard: (workspaceId: string, projectId: string) =>
    `${routes.project(workspaceId, projectId)}/dashboard`,
  repository: (workspaceId: string, projectId: string) =>
    `${routes.project(workspaceId, projectId)}/repository`,
  plans: (workspaceId: string, projectId: string) =>
    `${routes.project(workspaceId, projectId)}/plans`,
  plan: (workspaceId: string, projectId: string, planId: string) =>
    `${routes.plans(workspaceId, projectId)}/${encodeURIComponent(planId)}`,
  runs: (workspaceId: string, projectId: string) =>
    `${routes.project(workspaceId, projectId)}/runs`,
  run: (workspaceId: string, projectId: string, runId: string) =>
    `${routes.runs(workspaceId, projectId)}/${encodeURIComponent(runId)}`,
  execute: (workspaceId: string, projectId: string, runId: string, runCaseId?: string) =>
    `${routes.run(workspaceId, projectId, runId)}/execute${runCaseId ? `/${encodeURIComponent(runCaseId)}` : ''}`,
  environments: (workspaceId: string, projectId: string) =>
    `${routes.project(workspaceId, projectId)}/settings/environments`,
};

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return '/workspaces';
  try {
    const parsed = new URL(value, 'https://daevox.invalid');
    return parsed.origin === 'https://daevox.invalid'
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : '/workspaces';
  } catch {
    return '/workspaces';
  }
}
