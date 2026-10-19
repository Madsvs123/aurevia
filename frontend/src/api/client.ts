import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth';
import type { RefreshResponse } from './types';

export const API_BASE = '/api/v1';

/** Single-flight refresh promise so concurrent 401s share one refresh call. */
let refreshPromise: Promise<string> | null = null;

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 3000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

async function refreshAccessToken(): Promise<string> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) {
    logout();
    throw new Error('No refresh token available');
  }
  try {
    const res = await axios.post<RefreshResponse>(`${API_BASE}/auth/refresh/`, {
      refresh: refreshToken,
    });
    setTokens(res.data.refresh, refreshToken);
    return res.data.access;
  } catch (err) {
    logout();
    const message = err instanceof Error ? err.message : 'Session expired';
    throw new Error(message);
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    // Skip refresh for the refresh call itself and auth endpoints that must fail loudly.
    const url = original?.url ?? '';
    const isAuthEndpoint =
      url.includes('/auth/refresh/') ||
      url.includes('/auth/login/') ||
      url.includes('/auth/register/') ||
      url.includes('/auth/verify-email/');

    if (error.response?.status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const access = await refreshPromise;
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${access}` };
        return apiClient(original);
      } catch {
        // Logout already handled inside refreshAccessToken; surface the error.
        return Promise.reject(error);
      }
    }

    // If a refresh call itself 401s, log out cleanly.
    if (error.response?.status === 401 && isAuthEndpoint && url.includes('/auth/refresh/')) {
      useAuthStore.getState().logout();
    }

    return Promise.reject(error);
  },
);

/** Extract a human-readable message from an axios error (DRF shape). */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as unknown;
    if (data && typeof data === 'object') {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) return detail.join(' ');
      // Field errors: {field: [msgs]}
      const entries = Object.entries(data as Record<string, unknown>).filter(
        ([key]) => key !== 'detail',
      );
      if (entries.length > 0) {
        const [field, msgs] = entries[0];
        const msg = Array.isArray(msgs) ? msgs.join(' ') : String(msgs);
        return `${field.replace(/_/g, ' ')}: ${msg}`;
      }
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
