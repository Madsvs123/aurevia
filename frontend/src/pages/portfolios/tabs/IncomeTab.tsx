import { useQuery } from '@tanstack/react-query';
import { portfoliosApi } from '../../../api/endpoints';
import { formatMoney, parseMoney } from '../../../api/types';
import { Card, CardHeader, StatCard, EmptyState } from '../../../components/ui';
import { IncomeBar, type IncomeBarDatum } from '../../../components/charts';
import { useAuth } from '../../../hooks/useAuth';
import { usePortfolio } from '../../../hooks/usePortfolio';

interface IncomeTabProps {
  portfolioId: string;
}

export default function IncomeTab({ portfolioId }: IncomeTabProps) {
  const { profile } = useAuth();
  const locale = profile?.locale ?? 'en-US';
  const { detail } = usePortfolio(portfolioId);
  const currency = detail.data?.currency ?? profile?.base_currency ?? 'USD';

  const income = useQuery({
    queryKey: ['portfolio', portfolioId, 'income'],
    queryFn: () => portfoliosApi.income(portfolioId),
  });

  const data: IncomeBarDatum[] = (income.data?.by_month ?? []).map((m) => ({
    label: m.month,
    dividends: parseMoney(m.dividends),
    interest: parseMoney(m.interest),
    fees: parseMoney(m.fees),
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Dividends" value={income.data ? formatMoney(income.data.dividends, currency, locale) : undefined} loading={income.isLoading} currency={currency} />
        <StatCard label="Interest" value={income.data ? formatMoney(income.data.dividends, currency, locale) : undefined} loading={income.isLoading} currency={currency} />
        <StatCard label="Fees" value={income.data ? formatMoney(income.data.fees, currency, locale) : undefined} loading={income.isLoading} currency={currency} />
      </div>

      <Card>
        <CardHeader title="Income by month" subtitle="Dividends, interest and fees · stacked" />
        <IncomeBar
          data={data}
          loading={income.isLoading}
          currency={currency}
          locale={locale}
          emptyTitle="No income recorded"
          emptyMessage="Dividend, interest and fee transactions will be aggregated here by month."
        />
      </Card>

      {income.data && income.data.by_month.length === 0 ? (
        <Card>
          <EmptyState
            title="No monthly breakdown yet"
            message="Once you record dividend or interest transactions, the monthly breakdown will populate automatically."
            compact
          />
        </Card>
      ) : null}
    </div>
  );
}
