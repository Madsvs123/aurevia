import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney, parseMoney, signClass } from '../../../api/types';
import { Card, CardHeader, Badge, Table, Button } from '../../../components/ui';
import { usePortfolio } from '../../../hooks/usePortfolio';
import { useAuth } from '../../../hooks/useAuth';
import type { Holding } from '../../../api/types';

interface HoldingsTabProps {
  portfolioId: string;
}

type SortKey = 'symbol' | 'quantity' | 'avg_cost' | 'market_value' | 'unrealized_gain' | 'weight_pct';

export default function HoldingsTab({ portfolioId }: HoldingsTabProps) {
  const { profile } = useAuth();
  const currency = profile?.base_currency ?? 'USD';
  const locale = profile?.locale ?? 'en-US';
  const { holdings } = usePortfolio(portfolioId);

  const [sortKey, setSortKey] = useState<SortKey>('market_value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const list: Holding[] = holdings.data?.results ?? [];

  const sorted = useMemo(() => {
    const dir = sortDir === 'desc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'symbol') return a.instrument.symbol.localeCompare(b.instrument.symbol) * dir;
      return (parseMoney(a[sortKey]) - parseMoney(b[sortKey])) * dir;
    });
  }, [list, sortKey, sortDir]);

  const onSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key as SortKey);
      setSortDir('desc');
    }
  };

  const totalValue = list.reduce((s, h) => s + parseMoney(h.market_value), 0);

  return (
    <Card>
      <CardHeader
        title={`Holdings (${list.length})`}
        subtitle={`Total market value: ${formatMoney(totalValue, currency, locale)}`}
      />
      <Table<Holding>
        columns={[
          {
            key: 'symbol',
            header: 'Symbol',
            sortable: true,
            render: (h) => (
              <div>
                <p className="font-semibold">{h.instrument.symbol}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{h.instrument.name}</p>
              </div>
            ),
          },
          {
            key: 'quantity',
            header: 'Quantity',
            sortable: true,
            align: 'right',
            render: (h) => parseMoney(h.quantity).toLocaleString(locale, { maximumFractionDigits: 4 }),
          },
          {
            key: 'avg_cost',
            header: 'Avg cost',
            sortable: true,
            align: 'right',
            render: (h) => formatMoney(h.avg_cost, currency, locale),
          },
          {
            key: 'market_value',
            header: 'Market value',
            sortable: true,
            align: 'right',
            render: (h) => formatMoney(h.market_value, currency, locale),
          },
          {
            key: 'unrealized_gain',
            header: 'Unrealized gain',
            sortable: true,
            align: 'right',
            render: (h) => (
              <span className={signClass(h.unrealized_gain)}>
                {formatMoney(h.unrealized_gain, currency, locale)}
                <span className="text-xs ml-1">({parseMoney(h.unrealized_gain_pct).toFixed(1)}%)</span>
              </span>
            ),
          },
          {
            key: 'weight_pct',
            header: 'Weight',
            sortable: true,
            align: 'right',
            render: (h) => <Badge tone="info">{parseMoney(h.weight_pct).toFixed(1)}%</Badge>,
          },
        ]}
        data={sorted}
        rowKey={(h) => h.instrument.symbol}
        loading={holdings.isLoading}
        onSort={onSort}
        sortKey={sortKey}
        sortDir={sortDir}
        emptyTitle="No holdings yet"
        emptyMessage="Buy an instrument to start building your holdings."
        emptyAction={
          <Link to={`/portfolios/${portfolioId}?tab=transactions`}>
            <Button variant="secondary" size="sm">Add a transaction</Button>
          </Link>
        }
      />
    </Card>
  );
}
