import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bell, CheckCheck, Wifi, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { notificationsApi } from '../../api/endpoints';
import type { AppNotification, NotificationKind } from '../../api/types';
import { Badge, Button, Card, CardHeader, EmptyState, Select, SkeletonCard, Toggle } from '../../components/ui';
import { useNotifications } from '../../hooks/useNotifications';
import { toastSuccess } from '../../store/toast';

const KIND_FILTERS: { value: NotificationKind | ''; label: string }[] = [
  { value: '', label: 'All kinds' },
  { value: 'price_alert', label: 'Price alerts' },
  { value: 'portfolio_event', label: 'Portfolio events' },
  { value: 'dividend', label: 'Dividends' },
  { value: 'goal_milestone', label: 'Goal milestones' },
  { value: 'report_ready', label: 'Reports ready' },
  { value: 'account_activity', label: 'Account activity' },
  { value: 'system', label: 'System' },
];

const kindTone = (k: NotificationKind) =>
  k === 'price_alert' ? 'warning' : k === 'report_ready' ? 'info' : k === 'goal_milestone' ? 'success' : k === 'portfolio_event' ? 'primary' : 'muted';

export default function NotificationsPage() {
  const [kind, setKind] = useState<NotificationKind | ''>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);
  const { unreadCount, markRead, markAllRead, wsConnected } = useNotifications();

  const notifications = useQuery({
    queryKey: ['notifications', 'list', { kind, unreadOnly, page }],
    queryFn: () => notificationsApi.list({ kind, unread_only: !unreadOnly, page }),
  });

  const list = notifications.data?.results ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-sub">
            {unreadCount} unread · live updates{' '}
            {wsConnected ? (
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--success)' }}>
                <Wifi size={12} /> connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                <WifiOff size={12} /> polling
              </span>
            )}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            markAllRead().then(() => toastSuccess('All notifications marked as read')).catch(() => undefined)
          }
          icon={<CheckCheck size={15} />}
        >
          Mark all read
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Select
            options={KIND_FILTERS}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as NotificationKind | '');
              setPage(1);
            }}
            aria-label="Filter by kind"
          />
        </div>
        <Toggle checked={unreadOnly} onChange={(v) => { setUnreadOnly(v); setPage(1); }} label="Unread only" />
      </div>

      {notifications.isLoading ? (
        <SkeletonCard rows={6} />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
            message={
              unreadOnly
                ? 'You’re all caught up. 🎉'
                : 'Price alerts, dividends, goal milestones and report updates will appear here in real time.'
            }
            icon={<Bell size={22} />}
          />
        </Card>
      ) : (
        <Card>
          <CardHeader title={`${list.length} notification${list.length === 1 ? '' : 's'}`} />
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {list.map((n: AppNotification) => (
              <div key={n.id} className="flex items-start gap-3 py-3.5 px-1">
                <span
                  className="mt-1.5 rounded-full shrink-0"
                  style={{ width: 9, height: 9, background: n.is_read ? 'var(--border)' : 'var(--primary)' }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm ${n.is_read ? '' : 'font-semibold'}`}>{n.title}</p>
                    <Badge tone={kindTone(n.kind)}>{n.kind.replace(/_/g, ' ')}</Badge>
                  </div>
                  {n.body ? (
                    <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                      {n.body}
                    </p>
                  ) : null}
                  <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                {!n.is_read ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markRead(n.id).catch(() => undefined)}
                  >
                    Mark read
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          {notifications.data && notifications.data.next ? (
            <div className="flex justify-center pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                loading={notifications.isFetching}
              >
                Load more
              </Button>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
