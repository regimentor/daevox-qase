import type { Route } from './+types/project-new';
import { ProjectCreatePage } from '@/pages/project-create';
export default function ProjectNewRoute({ params }: Route.ComponentProps) {
  return <ProjectCreatePage workspaceId={params.workspaceId} />;
}
