import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portfoliosApi } from '../api/endpoints';
import type { CreatePortfolioPayload } from '../api/endpoints';
import type { Portfolio } from '../api/types';

export function usePortfolio(id: string | undefined) {
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['portfolio', id],
    queryFn: () => portfoliosApi.detail(id as string),
    enabled: Boolean(id),
  });

  const summary = useQuery({
    queryKey: ['portfolio', id, 'summary'],
    queryFn: () => portfoliosApi.detail(id as string),
    enabled: Boolean(id),
    select: (data: Portfolio) => data.summary ?? null,
  });

  const history = useQuery({
    queryKey: ['portfolio', id, 'histor'],
    queryFn: () => portfoliosApi.history(id as string, { interval: 'day' }),
    enabled: Boolean(id),
  });

  const holdings = useQuery({
    queryKey: ['portfolio', id, 'holdings'],
    queryFn: () => portfoliosApi.holdings(id as string),
    enabled: Boolean(id),
  });

  const invalidate = (key?: string) =>
    queryClient.invalidateQueries({ queryKey: key ? ['portfolio', id, key] : ['portfolio', id] });

  const createMutation = useMutation({
    mutationFn: (payload: CreatePortfolioPayload) => portfoliosApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ portfolioId, payload }: { portfolioId: string; payload: Partial<CreatePortfolioPayload> }) =>
      portfoliosApi.patch(portfolioId, payload),
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (portfolioId: string) => portfoliosApi.remove(portfolioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });

  return {
    detail,
    summary,
    history,
    holdings,
    invalidate,
    createPortfolio: createMutation.mutateAsync,
    updatePortfolio: updateMutation.mutateAsync,
    deletePortfolio: deleteMutation.mutateAsync,
  };
}

export function usePortfolios() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['portfolios'],
    queryFn: portfoliosApi.list,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['portfolios'] });

  return { ...query, invalidate };
}
