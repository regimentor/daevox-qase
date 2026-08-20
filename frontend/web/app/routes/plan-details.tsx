import type { Route } from './+types/plan-details';
import { TestPlanDetailsPage } from '@/pages/test-plan-details';
export default function PlanDetailsRoute({ params }: Route.ComponentProps) {
  return <TestPlanDetailsPage planId={params.planId} />;
}
