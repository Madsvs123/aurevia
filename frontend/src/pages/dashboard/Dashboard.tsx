import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Target, Wallet, Bell } from 'lucide-react';
import { portfoliosApi, goalsApi, watchlistsApi, notificationsApi } from '../../api/endpoints';
import { formatMoney, formatPercent, parseMoney, signClass } from '../../api/types';
import { Card, CardHeader, Badge, Button, ProgressBar, StatCard, SkeletonCard, EmptyState } from '../../components/ui';
import { ValueChart, AllocationDonut, type ValuePoint } from '../../components/charts';
import { InsightsFeedCard } from '../../components/insights/InsightsFeedCard';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { format } from 'date-fns';

export default function DashboardPage() {
  const { profile } = useAuth();
  const { unreadCount } = useNotifications();
  const currency = profile?.base_currency ?? 'USD';
  const locale = profile?.locale ?? 'en-US';

  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: portfoliosApi.list });
  const goals = useQuery({ queryKey: ['goals'], queryFn: goalsApi.list });
  const watchlistOverview = useQuery({ queryKey: ['watchlists', 'overview'], queryFn: watchlistsApi.overview });
  const recentNotifications = useQuery({
    queryKey: ['notifications', 'list', { page: 1 }],
    queryFn: () => notificationsApi.list({ page: 1 }),
  });

  const portfolioList = portfolios.data ?? [];
  const primary = portfolioList[0];

  const history = useQuery({
    queryKey: ['portfolio', primary?.id, 'history'],
    queryFn: () => portfoliosApi.history(primary!.id, { interval: 'week' }),
    enabled: Boolean(primary),
  });

  const allocation = useQuery({
    queryKey: ['portfolio', primary?.id, 'allocation'],
    queryFn: () => portfoliosApi.allocation(primary!.id, 'asset_class'),
    enabled: Boolean(primary),
  });

  const holdings = useQuery({
    queryKey: ['portfolio', primary?.id, 'holdings'],
    queryFn: () => portfoliosApi.holdings(primary!.id),
    enabled: Boolean(primary),
  });

  const recentTransactions = useQuery({
    queryKey: ['portfolio', primary?.id, 'transactions', 'recent'],
    queryFn: () => portfoliosApi.transactions(primary!.id, { page: 1 }),
    enabled: Boolean(primary),
  });

  const income = useQuery({
    queryKey: ['portfolio', primary?.id, 'income'],
    queryFn: () => portfoliosApi.income(primary!.id),
    enabled: Boolean(primary),
  });

  const loading = portfolios.isLoading;

  // Aggregate value across all portfolios.
  const totalValue = portfolioList.reduce((sum, p) => sum + parseMoney(p.summary?.total_value), 0);
  const totalReturnPct = (() => {
    const withSummary = portfolioList.filter((p) => p.summary);
    if (withSummary.length === 0) return 0;
    return withSummary.reduce((sum, p) => sum + parseMoney(p.summary?.return_pct), 0) / withSummary.length;
  })();
  const totalIncome = parseMoney(income.data?.dividends) - parseMoney(income.data?.interest);

  const chartData: ValuePoint[] = (history.data ?? []).map((h) => ({
    date: format(new Date(`${h.date}T00:00:00`), 'MMM d'),
    value: parseMoney(h.value),
    invested: parseMoney(h.invested),
  }));

  const donutData = (allocation.data ?? []).map((a) => ({
    label: a.label,
    value: parseMoney(a.value),
    weight_pct: parseMoney(a.weight_pct),
    color: a.color ?? undefined,
  }));

  const holdingList = (holdings.data ?? []).slice(0, 5);
  const transactionList = recentTransactions.data?.results ?? [];
  const notificationList = recentNotifications.data?.results ?? [];
  const goalList = goals.data ?? [];
  const watchlistItems = (watchlistOverview.data ?? []).flatMap((w) => w.items).slice(0, 4);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">Welcome back — here’s your portfolio at a glance.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total value"
          value={loading ? undefined : formatMoney(totalValue, currency, locale)}
          loading={loading}
          delta={formatPercent(totalReturnPct)}
          deltaLabel="avg return"
          icon={<Wallet size={15} />}
          currency={currency}
        />
        <StatCard
          label="Unrealized gains"
          value={loading ? undefined : formatMoney(portfolioList.reduce((s, p) => s + parseMoney(p.summary?.unrealized_gains), 0), currency, locale)}
          loading={loading}
          delta={formatPercent(portfolioList.reduce((s, p) => s + parseMoney(p.summary?.unrealized_gains), 0))}
          deltaLabel="across portfolios"
          currency={currency}
        />
        <StatCard
          label="Income (dividends + interest)"
          value={loading ? undefined : formatMoney(totalIncome, currency, locale)}
          loading={loading}
          hint="Trailing income for the primary portfolio"
          currency={currency}
        />
        <StatCard
          label="Active portfolios"
          value={loading ? undefined : String(portfolioList.filter((p) => !p.is_archived).length)}
          loading={loading}
          hint={`${goalList.length} goal${goalList.length === 1 ? '' : 's'} tracked`}
        />
      </div>

      {/* Value chart + allocation */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Portfolio value"
            subtitle={primary ? primary.name : 'All portfolios'}
            action={
              primary ? (
                <Link to={`/portfolios/${primary.id}`} className="link text-xs inline-flex items-center gap-1">
                  Details <ArrowRight size={12} />
                </Link>
              ) : undefined
            }
          />
          <ValueChart
            data={chartData}
            currency={currency}
            locale={locale}
            loading={history.isLoading}
            compareKey="invested"
            emptyTitle="No value history yet"
            emptyMessage="Once you create a portfolio and record transactions, your value history appears here."
          />
        </Card>
        <Card>
          <CardHeader
            title="Allocation by asset class"
            subtitle={primary ? primary.name : undefined}
          />
          <AllocationDonut
            data={donutData}
            loading={allocation.isLoading}
            currency={currency}
            locale={locale}
            centerValue={primary ? formatMoney(parseMoney(primary.summary?.total_value), currency, locale) : undefined}
            centerLabel="total value"
            emptyTitle="No holdings yet"
            emptyMessage="Add holdings to see allocation by asset class."
          />
        </Card>
      </div>

      {/* Holdings + transactions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="Top holdings"
            subtitle={primary ? `From ${primary.name}` : 'No portfolio selected'}
            action={
              primary ? (
                <Link to={`/portfolios/${primary.id}?tab=holdings`} className="link text-xs">
                  View all
                </Link>
              ) : undefined
            }
          />
          {holdings.isLoading ? (
            <SkeletonCard rows={4} />
          ) : holdingList.length === 0 ? (
            <EmptyState
              title="No holdings yet"
              message="Record your first buy transaction to see holdings here."
              action={
                primary ? (
                  <Link to={`/portfolios/${primary.id}?tab=transactions`}>
                    <Button variant="secondary" size="sm">Add transaction</Button>
                  </Link>
                ) : undefined
              }
              compact
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th className="text-right">Market value</th>
                    <th className="text-right">Weight</th>
                    <th className="text-right">Unrealized</th>
                  </tr>
                </thead>
                <tbody>
                  {holdingList.map((h) => (
                    <tr key={h.instrument.symbol}>
                      <td>
                        <p className="font-semibold">{h.instrument.symbol}</p>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>{h.instrument.name}</p>
                      </td>
                      <td className="text-right">{formatMoney(h.market_value, currency, locale)}</td>
                      <td className="text-right">{parseMoney(h.weight_pct).toFixed(1)}%</td>
                      <td className={`text-right ${signClass(h.unrealized_gain)}`}>
                        {formatMoney(h.unrealized_gain, currency, locale)}
                        <span className="text-xs ml-1">({parseMoney(h.unrealized_gain_pct).toFixed(1)}%)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent transactions"
            action={
              primary ? (
                <Link to={`/portfolios/${primary.id}?tab=transactions`} className="link text-xs">
                  View all
                </Link>
              ) : undefined
            }
          />
          {recentTransactions.isLoading ? (
            <SkeletonCard rows={4} />
          ) : transactionList.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              message="Your latest buys, sells and income will show up here."
              action={
                primary ? (
                  <Link to={`/portfolios/${primary.id}?tab=transactions`}>
                    <Button variant="secondary" size="sm">Add transaction</Button>
                  </Link>
                ) : undefined
              }
              compact
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Symbol</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionList.slice(0, 6).map((t) => (
                    <tr key={t.id}>
                      <td className="text-xs">{format(new Date(`${t.date}T00:00:00`), 'MMM d, yyyy')}</td>
                      <td>
                        <Badge tone={t.type === 'buy' || t.type === 'deposit' ? 'success' : t.type === 'sell' || t.type === 'withdrawal' || t.type === 'fee' ? 'danger' : 'info'}>
                          {t.type.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="font-medium">{t.instrument?.symbol ?? '—'}</td>
                      <td className={`text-right ${signClass(t.amount)}`}>{formatMoney(t.amount, t.currency, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Goals + watchlist + notifications + insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader
            title="Goal progress"
            action={<Link to="/goals" className="link text-xs">All goals</Link>}
          />
          {goals.isLoading ? (
            <SkeletonCard rows={2} />
          ) : goalList.length === 0 ? (
            <EmptyState
              title="No goals yet"
              message="Set a savings or investment goal to track progress over time."
              action={<Link to="/goals"><Button variant="secondary" size="sm">Create a goal</Button></Link>}
              compact
            />
          ) : (
            <div className="space-y-4">
              {goalList.slice(0, 3).map((g) => {
                const pct = g.target_amount ? (parseMoney(g.starting_amount) / parseMoney(g.target_amount)) * 100 : 0;
                return (
                  <Link key={g.id} to={`/goals/${g.id}`} className="block">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Target size={13} style={{ color: 'var(--primary)' }} /> {g.name}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        {Math.min(100, pct).toFixed(0)}%
                      </span>
                    </div>
                    <ProgressBar value={pct} size="sm" color={pct >= 100 ? 'var(--success)' : undefined} />
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                      {formatMoney(g.starting_amount, currency, locale)} of {formatMoney(g.target_amount, currency, locale)}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Watchlist" action={<Link to="/watchlists" className="link text-xs">Manage</Link>} />
          {watchlistOverview.isLoading ? (
            <SkeletonCard rows={3} />
          ) : watchlistItems.length === 0 ? (
            <EmptyState
              title="Nothing on your watchlist"
              message="Add instruments from the search bar to track prices and set alerts."
              action={<Link to="/watchlists"><Button variant="secondary" size="sm">Open watchlists</Button></Link>}
              compact
            />
          ) : (
            <div className="space-y-3">
              {watchlistItems.map((w) => (
                <div key={w.instrument.symbol} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{w.instrument.symbol}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{w.instrument.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{w.last_price ? formatMoney(w.last_price, w.instrument.currency, locale) : '—'}</p>
                    <p className={`text-xs ${signClass(w.change_pct)}`}>
                      {w.change_pct !== null && w.change_pct !== undefined ? formatPercent(w.change_pct) : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Latest notifications"
            action={<Link to="/notifications" className="link text-xs inline-flex items-center gap-1">All <Bell size={12} /></Link>}
          />
          {recentNotifications.isLoading ? (
            <SkeletonCard rows={3} />
          ) : notificationList.length === 0 ? (
            <EmptyState
              title="You’re all caught up"
              message={unreadCount > 0 ? 'Some notifications are waiting in the list.' : 'New alerts, dividends and report updates will land here.'}
              compact
            />
          ) : (
            <div className="space-y-3">
              {notificationList.slice(0, 4).map((n) => (
                <div key={n.id} className="flex items-start gap-2.5">
                  <span
                    className="mt-1 rounded-full shrink-0"
                    style={{ width: 7, height: 7, background: n.is_read ? 'var(--border)' : 'var(--primary)' }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    <p className="text-xs line-clamp-2" style={{ color: 'var(--muted)' }}>{n.body}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
                      {format(new Date(n.created_at), 'MMM d, HH:mm')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <InsightsFeedCard />
      </div>
    </div>
  );
}
