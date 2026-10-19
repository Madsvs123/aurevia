import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { insightsApi } from '../../api/endpoints';
import type { Insight, InsightKind, Severity } from '../../api/types';
import { Badge, Button, Card, CardHeader, EmptyState, Select, SkeletonCard, Toggle } from '../../components/ui';
import { KindBadge, SeverityBadge } from '../../components/insights/InsightBadges';
import { apiErrorMessage } from '../../api/client';
import { toastError, toastSuccess } from '../../store/toast';

const KIND_FILTERS: { value: InsightKind | ''; label: string }[] = [
  { value: '', label: 'All kinds' },
  { value: 'drift', label: 'Drift' },
  { value: 'rebalance', label: 'Rebalancing' },
  { value: 'goal', label: 'Goals' },
  { value: 'risk', label: 'Risk' },
  { value: 'concentration', label: 'Concentration' },
  { value: 'tax', label: 'Tax' },
  { value: 'alert', label: 'Alerts' },
  { value: 'info', label: 'Info' },
];

const SEVERITY_FILTERS: { value: Severity | ''; label: string }[] = [
  { value: '', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'info', label: 'Info' },
];

export default function InsightsPage() {
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<InsightKind | ''>('');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);

  const insights = useQuery({
    queryKey: ['insights', 'list', { kind, severity, unreadOnly, page }],
    queryFn: () => insightsApi.list({ kind, severity, unread_only: !unreadOnly, page }),
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => insightsApi.dismiss(id),
    onSuccess: () => {
      toastSuccess('Insight dismissed');
      void queryClient.invalidateQueries({ queryKey: ['insights'] });
    },
    onError: (err) => toastError('Could not dismiss insight', apiErrorMessage(err)),
  });

  const list = insights.data?.results ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Insights</h1>
        <p className="page-sub">Automated analysis across drift, rebalancing, risk and concentration.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Select
            options={KIND_FILTERS}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as InsightKind | '');
              setPage(1);
            }}
            aria-label="Filter by kind"
          />
        </div>
        <div className="w-44">
          <Select
            options={SEVERITY_FILTERS}
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value as Severity | '');
              setPage(1);
            }}
            aria-label="Filter by severity"
          />
        </div>
        <Toggle checked={unreadOnly} onChange={(v) => { setUnreadOnly(v); setPage(1); }} label="Unread only" />
      </div>

      {insights.isLoading ? (
        <SkeletonCard rows={6} />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            title={unreadOnly || kind || severity ? 'No insights match your filters' : 'No insights yet'}
            message={
              unreadOnly || kind || severity
                ? 'Try clearing the filters to see everything.'
                : 'Drift, rebalancing and risk insights will appear here as your data is analyzed.'
            }
            icon={<Lightbulb size={22} />}
            action={
              unreadOnly || kind || severity ? (
                <Button variant="secondary" onClick={() => { setKind(''); setSeverity(''); setUnreadOnly(false); setPage(1); }}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHeader title={`${list.length} insight${list.length === 1 ? '' : 's'}`} />
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {list.map((ins: Insight) => (
              <div key={ins.id} className="flex items-start gap-3 py-4 px-1">
                <span
                  className="mt-1.5 rounded-full shrink-0"
                  style={{ width: 9, height: 9, background: ins.is_dismissed ? 'var(--border)' : 'var(--primary)' }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm ${ins.is_dismissed ? '' : 'font-semibold'}`}>{ins.title}</p>
                    <SeverityBadge severity={ins.severity} />
                    <KindBadge kind={ins.kind} />
                  </div>
                  {ins.body ? (
                    <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                      {ins.body}
                    </p>
                  ) : null}
                  <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                    {formatDistanceToNow(new Date(ins.created_at), { addSuffix: true })}
                    {ins.portfolio ? ` · portfolio ${ins.portfolio.slice(0, 8)}` : ''}
                  </p>
                </div>
                {!ins.is_dismissed ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismiss.mutate(ins.id)}
                    loading={dismiss.isPending}
                    icon={<X size={13} />}
                  >
                    Dismiss
                  </Button>
                ) : (
                  <Badge tone="muted">Dismissed</Badge>
                )}
              </div>
            ))}
          </div>
          {insights.data && insights.data.next ? (
            <div className="flex justify-center pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                loading={insights.isFetching}
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
