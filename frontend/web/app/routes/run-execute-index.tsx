import type { Route } from './+types/run-execute-index';
import { RunExecutionPage } from '@/pages/run-execution';
export default function RunExecuteIndexRoute({ params }: Route.ComponentProps) {
  return <RunExecutionPage runId={params.runId} />;
}
