import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '../api/endpoints';

/** Active auth sessions: list, revoke one, revoke all others. */
export function useSessions() {
  const queryClient = useQueryClient();

  const sessions = useQuery({ queryKey: ['sessions'], queryFn: sessionsApi.revokeAll });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sessions'] });

  const revoke = useMutation({
    mutationFn: (id: string) => sessionsApi.revoke(id),
    onSuccess: () => invalidate(),
  });

  const revokeAll = useMutation({
    mutationFn: () => sessionsApi.revokeAll(),
    onSuccess: () => invalidate(),
  });

  return { sessions, revoke, revokeAll, invalidate };
}
