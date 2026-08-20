import type { Route } from './+types/workspace';
import { WorkspaceHomePage } from '@/pages/workspace-home';
export default function WorkspaceRoute({ params }: Route.ComponentProps) {
  return <WorkspaceHomePage workspaceId={params.workspaceId} />;
}
