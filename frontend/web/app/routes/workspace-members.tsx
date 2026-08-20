import type { Route } from './+types/workspace-members';
import { useAuth } from '@/app/providers/auth';
import { WorkspaceMembersPage } from '@/pages/workspace-members';
export default function WorkspaceMembersRoute({ params }: Route.ComponentProps) {
  const { user } = useAuth();
  return user && <WorkspaceMembersPage workspaceId={params.workspaceId} userId={user.id} />;
}
