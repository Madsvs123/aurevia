import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { usersApi } from '../api/endpoints';
import { useAuthStore } from '../store/auth';

/** Load the current user + profile into the auth store when tokens exist. */
export function useAuth() {
  const store = useAuthStore();
  const queryClient = useQueryClient();
  const authenticated = Boolean(store.accessToken);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: usersApi.me,
    enabled: authenticated,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (meQuery.data && authenticated) {
      store.setUser(meQuery.data.user, meQuery.data.profile);
    }
  }, [meQuery.data, authenticated, store]);

  // Invalidate everything user-scoped when the user changes.
  useEffect(() => {
    if (store.user?.id) {
      void queryClient.invalidateQueries();
    }
  }, [store.user?.id, queryClient]);

  return {
    user: store.user,
    profile: store.profile,
    accessToken: store.accessToken,
    status: store.status,
    isAuthenticated: authenticated,
    isOnboarded: store.profile?.onboarded ?? true,
    login: store.login,
    logout: store.logout,
    loadMe: store.loadMe,
    isLoadingMe: meQuery.isLoading,
  };
}
