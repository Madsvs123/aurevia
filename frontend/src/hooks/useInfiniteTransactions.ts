import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { portfoliosApi } from '../api/endpoints';
import type { Transaction, TransactionType } from '../api/types';

export interface UseInfiniteTransactionsOptions {
  portfolioId: string;
  type?: TransactionType | '';
  from?: string;
  to?: string;
}

/** Infinite-scroll transactions (DRF PageNumberPagination, page_size=50). */
export function useInfiniteTransactions({ portfolioId, type, from, to }: UseInfiniteTransactionsOptions) {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['portfolio', portfolioId, 'transactions', { type, from, to }],
    queryFn: ({ pageParam = 1 }) =>
      portfoliosApi.transactions(portfolioId, {
        type: type || undefined,
        from: from || undefined,
        to: to || undefined,
        page: pageParam as number | undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined;
      const url = new URL(lastPage.next, window.location.origin);
      const page = url.searchParams.get('page');
      return page ? Number(page) : undefined;
    },
    enabled: Boolean(portfolioId),
  });

  const transactions: Transaction[] = (query.data?.pages ?? []).flatMap((p) => p.results);
  const totalCount = query.data?.pages[1]?.count ?? 0;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['portfolio', portfolioId, 'transactions'] });

  return {
    ...query,
    transactions,
    totalCount,
    invalidate,
    loadMore: query.fetchNextPage,
    hasMore: Boolean(query.hasNextPage),
  };
}
