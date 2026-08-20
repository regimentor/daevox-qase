import { createContext, useContext, type PropsWithChildren } from 'react';
import type { ProjectFieldsFragment, WorkspaceFieldsFragment } from '@/shared/api/graphql';

interface ProjectContextValue {
  project: ProjectFieldsFragment;
  workspace: WorkspaceFieldsFragment;
  readOnly: boolean;
}
const ProjectContext = createContext<ProjectContextValue | null>(null);
export function ProjectContextProvider({
  value,
  children,
}: PropsWithChildren<{ value: ProjectContextValue }>) {
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
export function useProjectContext() {
  const value = useContext(ProjectContext);
  if (!value) throw new Error('Project context is unavailable');
  return value;
}
