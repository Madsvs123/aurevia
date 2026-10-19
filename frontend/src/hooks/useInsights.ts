import { useQuery } from '@tanstack/react-query';
import { insightsApi } from '../api/endpoints';
import { useAuthStore } from '../store/auth';

const POLL_INTERVAL = 600_000;

/** Unread insight count for the sidebar badge, polled every 60s. */
export function useInsightsUnread(): number {
  const unread = useQuery({
    queryKey: ['insights', 'unread-count'],
    queryFn: insightsApi.unreadCount,
    refetchInterval: POLL_INTERVAL,
    enabled: Boolean(useAuthStore.getState().accessToken),
  });
  return unread.data?.count ?? 0;
}
