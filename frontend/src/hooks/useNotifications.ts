import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { notificationsApi } from '../api/endpoints';
import type { AppNotification, NotificationKind } from '../api/types';
import { useAuthStore } from '../store/auth';
import { toastInfo, toastWarning } from '../store/toast';

const POLL_INTERVAL = 60_000;

function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/notifications/?token=${encodeURIComponent(
    useAuthStore.getState().accessToken ?? '',
  )}`;
}

/**
 * Unread count + live WebSocket notifications.
 * Falls back to polling when the WS cannot connect (e.g. backend down in dev).
 */
export function useNotifications() {
  const queryClient = useQueryClient();
  const [liveCount, setLiveCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: POLL_INTERVAL,
    enabled: Boolean(useAuthStore.getState().accessToken),
  });

  const unreadCount = (unread.data?.count ?? 0) + liveCount;

  useEffect(() => {
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    let disposed = false;
    let ws: WebSocket | null = null;
    let retryTimer: number | undefined;

    const connect = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(getWsUrl());
        wsRef.current = ws;
        ws.onopen = () => {
          if (!disposed) setWsConnected(true);
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data as string) as AppNotification;
            // Bump live badge without a full refetch.
            setLiveCount((c) => c + 1);
            if (data.kind === 'price_alert' || data.kind === 'goal_milestone') {
              toastWarning(data.title, data.body);
            } else {
              toastInfo(data.title, data.body);
            }
            void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          } catch {
            /* non-JSON message, ignore */
          }
        };
        ws.onclose = () => {
          setWsConnected(false);
          if (!disposed && !retryTimer) {
            retryTimer = window.setTimeout(() => {
              retryTimer = undefined;
              connect();
            }, 100_000);
          }
        };
        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        setWsConnected(false);
      }
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      ws?.close();
      wsRef.current = null;
    };
  }, [queryClient]);

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.setQueryData<{ count: number }>(['notifications', 'unread-count'], (old) => ({
        count: Math.max(0, (old?.count ?? 0) - 1),
      }));
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.setQueryData<{ count: number }>(['notifications', 'unread-count'], { count: 0 });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
    },
  });

  return {
    unreadCount,
    wsConnected,
    markRead: markRead.mutateAsync,
    markAllRead: markAllRead.mutateAsync,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  };
}

export type { NotificationKind };
