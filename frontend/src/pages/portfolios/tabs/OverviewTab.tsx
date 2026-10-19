import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { portfoliosApi } from '../../../api/endpoints';
import { formatMoney, formatPercent, parseMoney, signClass } from '../../../api/types';
import { Card, CardHeader, Button, StatCard, Badge, EmptyState } from '../../../components/ui';
import { ValueChart, AllocationDonut, type ValuePoint, type AllocationDatum } from '../../../components/charts';
import { useAuth } from '../../../hooks/useAuth';
import { usePortfolio } from '../../../hooks/usePortfolio';

interface OverviewTabProps {
  portfolioId: string;
  onAddTransaction: () => void;
}

export default function OverviewTab({ portfolioId, onAddTransaction }: OverviewTabProps) {
  const { profile } = useAuth();
  const currency = profile?.base_currency ?? 'USD';
  const locale = profile?.locale ?? 'en-US';
  const { detail, history, holdings } = usePortfolio(portfolioId);

  const allocation = useQuery({
    queryKey: ['portfolio', portfolioId, 'allocation'],
    queryFn: () => portfoliosApi.allocation(portfolioId, 'asset_class'),
  });

  const portfolio = detail.data;

  const chartData: ValuePoint[] = (history.data ?? []).map((h) => ({
    date: format(new Date(`${h.date}T00:00:00`), 'MMM d'),
    value: parseMoney(h.value),
    cash: parseMoney(h.cash),
    invested: parseMoney(h.invested),
  }));

  const donutData: AllocationDatum[] = (allocation.data ?? []).map((a) => ({
    label: a.label,
    value: parseMoney(a.value),
    weight_pct: parseMoney(a.weight_pct),
    color: a.color ?? undefined,
  }));

  const holdingList = holdings.data?.results ?? [];

  const summary = portfolio?.summary;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total value"
          value={summary ? formatMoney(summary.total_value, portfolio?.currency ?? currency, locale) : undefined}
          loading={detail.isLoading}
          delta={summary ? formatPercent(summary.return_pct) : undefined}
          deltaLabel="all-time return"
          currency={portfolio?.currency}
        />
        <StatCard
          label="Cash"
          value={summary ? formatMoney(summary.total_value, portfolio?.currency ?? currency, locale) : undefined}
          loading={detail.isLoading}
          currency={portfolio?.currency}
        />
        <StatCard
          label="Unrealized gains"
          value={summary ? formatMoney(summary.unrealized_gains, portfolio?.currency ?? currency, locale) : undefined}
          loading={detail.isLoading}
          delta={summary ? formatPercent(parseMoney(summary.unrealized_gains)) : undefined}
          currency={portfolio?.currency}
        />
        <StatCard
          label="Realized gains"
          value={summary ? formatMoney(summary.realized_gains, portfolio?.currency ?? currency, locale) : undefined}
          loading={detail.isLoading}
          delta={summary ? formatPercent(parseMoney(summary.realized_gains)) : undefined}
          currency={portfolio?.currency}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader title="Portfolio value" subtitle="Weekly history · value vs invested" />
          <ValueChart
            data={chartData}
            currency={portfolio?.currency ?? currency}
            locale={locale}
            loading={history.isLoading}
            compareKey="invested"
            emptyTitle="No value history yet"
            emptyMessage="Record transactions to build up your value history."
          />
        </Card>
        <Card>
          <CardHeader title="Allocation" subtitle="By asset class" />
          <AllocationDonut
            data={donutData}
            loading={allocation.isLoading}
            currency={portfolio?.currency ?? currency}
            locale={locale}
            centerValue={summary ? formatMoney(summary.total_value, portfolio?.currency ?? currency, locale) : undefined}
            centerLabel="total value"
            emptyTitle="No holdings yet"
            emptyMessage="Add holdings to see your allocation breakdown."
          />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Top holdings"
          action={
            <Link to={`/portfolios/${portfolioId}?tab=holdings`} className="link text-xs">
              All holdings
            </Link>
          }
        />
        {holdingList.length === 0 ? (
          <EmptyState
            title="No holdings yet"
            message="Buy an instrument or deposit cash to get started."
            action={<Button variant="secondary" size="sm" onClick={onAddTransaction}>Add transaction</Button>}
            compact
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Market value</th>
                  <th className="text-right">Unrealized</th>
                  <th className="text-right">Weight</th>
                </tr>
              </thead>
              <tbody>
                {holdingList.slice(0, 8).map((h) => (
                  <tr key={h.instrument.symbol}>
                    <td>
                      <p className="font-semibold">{h.instrument.symbol}</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{h.instrument.name}</p>
                    </td>
                    <td className="text-right">{parseMoney(h.quantity).toLocaleString(locale, { maximumFractionDigits: 4 })}</td>
                    <td className="text-right">{formatMoney(h.market_value, portfolio?.currency ?? currency, locale)}</td>
                    <td className={`text-right ${signClass(h.unrealized_gain)}`}>
                      {formatMoney(h.unrealized_gain, portfolio?.currency ?? currency, locale)}
                      <span className="text-xs ml-1">({parseMoney(h.unrealized_gain_pct).toFixed(1)}%)</span>
                    </td>
                    <td className="text-right">
                      <Badge tone="info">{parseMoney(h.weight_pct).toFixed(1)}%</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
