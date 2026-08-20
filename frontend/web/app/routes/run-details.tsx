import type { Route } from './+types/run-details';
import { TestRunDetailsPage } from '@/pages/test-run-details';
export default function RunDetailsRoute({ params }: Route.ComponentProps) {
  return <TestRunDetailsPage runId={params.runId} />;
}
