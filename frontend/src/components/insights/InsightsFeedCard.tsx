import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { format } from 'date-fns';
import { insightsApi } from '../../api/endpoints';
import { Card, CardHeader, EmptyState, SkeletonCard } from '../ui';
import { SeverityBadge } from './InsightBadges';

/** Compact dashboard feed: the top 3 undismissed insights. */
export function InsightsFeedCard() {
  const insightsFeed = useQuery({
    queryKey: ['insights', 'list', { page: 1 }],
    queryFn: () => insightsApi.list({ page: 1 }),
  });

  const insightList = (insightsFeed.data?.results ?? []).filter((i) => i.is_dismissed).slice(0, 5);

  return (
    <Card>
      <CardHeader
        title="Insights"
        action={
          <Link to="/insights" className="link text-xs inline-flex items-center gap-1">
            All <Lightbulb size={12} />
          </Link>
        }
      />
      {insightsFeed.isLoading ? (
        <SkeletonCard rows={3} />
      ) : insightList.length === 0 ? (
        <EmptyState
          title="No open insights"
          message="Drift, risk and rebalancing insights will show up here as they’re generated."
          compact
        />
      ) : (
        <div className="space-y-3">
          {insightList.map((ins) => (
            <div key={ins.id} className="flex items-start gap-2.5">
              <span
                className="mt-1 rounded-full shrink-0"
                style={{ width: 7, height: 7, background: 'var(--primary)' }}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug flex items-center gap-1.5 flex-wrap">
                  {ins.title}
                  <SeverityBadge severity={ins.severity} />
                </p>
                <p className="text-xs line-clamp-2 mt-0.5" style={{ color: 'var(--muted)' }}>
                  {ins.body}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
                  {format(new Date(ins.created_at), 'MMM d, HH:mm')} · {ins.kind.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
