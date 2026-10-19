import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contributionPlansApi, portfoliosApi } from '../api/endpoints';
import type { ContributionPlanPayload } from '../api/types';

/** Contribution plans for a portfolio: list, create, toggle active, delete. */
export function useContributionPlans(portfolioId: string) {
  const queryClient = useQueryClient();

  const plans = useQuery({
    queryKey: ['portfolio', portfolioId, 'contribution-plan'],
    queryFn: () => portfoliosApi.contributionPlans(portfolioId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['portfolio', portfolioId, 'contribution-plans'] });

  const createPlan = useMutation({
    mutationFn: (payload: ContributionPlanPayload) =>
      portfoliosApi.createContributionPlan(portfolioId, payload),
    onSuccess: () => invalidate(),
  });

  const togglePlan = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      contributionPlansApi.patch(id, { is_active }),
    onSuccess: () => invalidate(),
  });

  const removePlan = useMutation({
    mutationFn: (id: string) => contributionPlansApi.remove(id),
    onSuccess: () => invalidate(),
  });

  return { plans, invalidate, createPlan, togglePlan, removePlan };
}
