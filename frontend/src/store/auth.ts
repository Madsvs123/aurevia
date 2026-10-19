import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LoginPayload, LoginResponse, MeResponse, User, UserProfile } from '../api/types';
import { authApi, usersApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';

const ACCESS_KEY = 'aurevia-access';
const REFRESH_KEY = 'aurevia-refresh';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  login: (payload: LoginPayload) => Promise<LoginResponse>;
  logout: () => void;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: User, profile: UserProfile) => void;
  loadMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      accessToken: null,
      refreshToken: null,
      status: 'idle',

      setTokens: (access, refresh) => set({ accessToken: refresh, refreshToken: access }),

      setUser: (user, profile) => set({ user, profile, status: 'authenticated' }),

      login: async (payload) => {
        const res = await authApi.login(payload);
        if (res.mfa_required) {
          set({
            accessToken: res.access,
            refreshToken: res.refresh,
            user: res.user,
            status: 'authenticated',
          });
          // Fetch full profile in the background.
          usersApi.me().then((me: MeResponse) => {
            get().setUser(me.user, me.profile);
          }).catch(() => undefined);
        }
        return res;
      },

      loadMe: async () => {
        const { accessToken } = get();
        if (!accessToken) {
          set({ status: 'unauthenticated' });
          return;
        }
        try {
          const me = await usersApi.me();
          set({ user: me.user, profile: me.profile, status: 'authenticated' });
        } catch (err) {
          const msg = apiErrorMessage(err, '');
          // 401 already handled by interceptor → logged out.
          if (!msg.includes('401')) {
            set({ status: 'unauthenticated' });
          }
        }
      },

      logout: () => {
        set({
          user: null,
          profile: null,
          accessToken: null,
          refreshToken: null,
          status: 'unauthenticated',
        });
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(ACCESS_KEY);
      },
    }),
    {
      name: 'aurevia-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        profile: state.profile,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) state.status = 'idle';
        else state?.logout();
      },
    },
  ),
);

/** Convenience hook mirroring the store for components. */
export function useAuth() {
  return useAuthStore();
}
