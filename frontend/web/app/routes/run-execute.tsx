import type { Route } from './+types/run-execute';
import { RunExecutionPage } from '@/pages/run-execution';
export default function RunExecuteRoute({ params }: Route.ComponentProps) {
  return <RunExecutionPage runId={params.runId} runCaseId={params.runCaseId} />;
}
