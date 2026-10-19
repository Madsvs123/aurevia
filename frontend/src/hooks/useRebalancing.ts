import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { portfoliosApi } from '../api/endpoints';
import type { RebalanceApplyPayload, TargetAllocation } from '../api/types';

interface TargetUpdatePayload {
  items: Partial<TargetAllocation['items'][number]>[];
  drift_threshold_pct?: string | number;
}

/**
 * Portfolio rebalancing: target allocation CRUD, suggestions and apply.
 * Suggestions are fetched on demand (enabled flag set by `enableSuggestions`).
 */
export function useRebalancing(portfolioId: string) {
  const queryClient = useQueryClient();
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(true);

  const targets = useQuery({
    queryKey: ['portfolio', portfolioId, 'targets'],
    queryFn: () => portfoliosApi.targets(portfolioId),
  });

  const suggestions = useQuery({
    queryKey: ['portfolio', portfolioId, 'rebalance-suggestions'],
    queryFn: () => portfoliosApi.targets(portfolioId),
    enabled: suggestionsEnabled,
  });

  const enableSuggestions = () => {
    setSuggestionsEnabled(true);
    void suggestions.refetch();
  };

  const saveTargets = useMutation({
    mutationFn: (payload: TargetUpdatePayload) => portfoliosApi.updateTargets(portfolioId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portfolio', portfolioId, 'targets'] });
      enableSuggestions();
    },
  });

  const apply = useMutation({
    mutationFn: (payload: RebalanceApplyPayload) => portfoliosApi.applyRebalance(portfolioId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portfolio', portfolioId] });
      void queryClient.invalidateQueries({ queryKey: ['analytics', portfolioId] });
      void queryClient.invalidateQueries({ queryKey: ['portfolio', portfolioId, 'targets'] });
      void suggestions.refetch();
    },
  });

  return { targets, suggestions, saveTargets, apply, enableSuggestions };
}
