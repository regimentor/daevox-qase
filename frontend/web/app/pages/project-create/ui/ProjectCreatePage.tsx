import { useNavigate } from 'react-router';
import { ProjectCreateForm } from '@/features/project-create';
import { PageHeader } from '@/shared/ui';
import { routes } from '@/shared/routes';
export function ProjectCreatePage({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate();
  return (
    <main className="page">
      <PageHeader
        title="Новый проект"
        description="Проект объединяет repository, планы и запуски."
      />
      <div className="surface" style={{ padding: 24, maxWidth: 680 }}>
        <ProjectCreateForm
          workspaceId={workspaceId}
          onCreated={(id) => navigate(routes.dashboard(workspaceId, id))}
        />
      </div>
    </main>
  );
}
