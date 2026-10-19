import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { analyticsApi, portfoliosApi } from '../../../api/endpoints';
import type { AllocationBy } from '../../../api/types';
import { formatMoney, formatPercent, parseMoney, signClass } from '../../../api/types';
import { Card, CardHeader, Badge, Tabs, EmptyState, Input, Button, SkeletonTable } from '../../../components/ui';
import { PerformanceLine, DrawdownArea, MonthlyReturnsBar, AllocationDonut, type AllocationDatum, type MonthlyBarDatum } from '../../../components/charts';
import { useAuth } from '../../../hooks/useAuth';
import { usePortfolio } from '../../../hooks/usePortfolio';

interface AnalyticsTabProps {
  portfolioId: string;
}

const ALLOCATION_VIEWS: { key: AllocationBy; label: string }[] = [
  { key: 'asset_class', label: 'Asset class' },
  { key: 'sector', label: 'Sector' },
  { key: 'region', label: 'Region' },
  { key: 'currency', label: 'Currency' },
  { key: 'risk', label: 'Risk' },
];

function Metric({ label, value, pct, negative }: { label: string; value: string; pct?: boolean; negative?: boolean }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      <p className={`text-lg font-bold mt-0.5 ${negative ? 'text-negative' : ''}`}>
        {pct ? formatPercent(value) : value}
      </p>
    </div>
  );
}

export default function AnalyticsTab({ portfolioId }: AnalyticsTabProps) {
  const { profile } = useAuth();
  const currency = profile?.base_currency ?? 'USD';
  const locale = profile?.locale ?? 'en-US';
  const { detail } = usePortfolio(portfolioId);
  const portfolioCurrency = detail.data?.currency ?? currency;

  const [allocView, setAllocView] = useState<AllocationBy>('asset_class');
  const [benchmark, setBenchmark] = useState('SPY');
  const [benchmarkInput, setBenchmarkInput] = useState('SPY');

  const returns = useQuery({
    queryKey: ['analytics', portfolioId, 'returns', benchmark],
    queryFn: () => analyticsApi.returns(portfolioId, { benchmark }),
  });

  const risk = useQuery({
    queryKey: ['analytics', portfolioId, 'risk'],
    queryFn: () => analyticsApi.risk(portfolioId),
  });

  const portfolioAllocation = useQuery({
    queryKey: ['portfolio', portfolioId, 'allocation', allocView],
    queryFn: () => portfoliosApi.allocation(portfolioId, allocView),
  });

  const costBasis = useQuery({
    queryKey: ['analytics', portfolioId, 'cost-basis'],
    queryFn: () => analyticsApi.costBasis(portfolioId),
  });

  const diversification = useQuery({
    queryKey: ['analytics', portfolioId, 'diversification'],
    queryFn: () => analyticsApi.diversification(portfolioId),
  });

  const [forecastParams, setForecastParams] = useState({ years: 30, expected_return: 7, contribution: 1000, contribution_freq: 'monthly' });
  const forecast = useQuery({
    queryKey: ['analytics', portfolioId, 'forecast', forecastParams],
    queryFn: () =>
      analyticsApi.forecast(portfolioId, {
        years: forecastParams.years,
        expected_return: forecastParams.expected_return,
        contribution: forecastParams.contribution,
        contribution_freq: forecastParams.contribution_freq,
      }),
  });

  const r = returns.data;
  const series: { date: string; portfolio: number | null; benchmark: number | null }[] =
    (r?.series ?? []).map((p) => ({
      date: p.date,
      portfolio: p.portfolio !== null ? parseMoney(p.portfolio) : null,
      benchmark: p.benchmark !== null ? parseMoney(p.benchmark) : null,
    }));

  const drawdownData = (risk.data?.drawdown_series ?? []).map((d) => ({
    date: d.date,
    drawdown_pct: parseMoney(d.drawdown_pct),
  }));

  const donutData: AllocationDatum[] = (portfolioAllocation.data ?? []).map((a) => ({
    label: a.label,
    value: parseMoney(a.value),
    weight_pct: parseMoney(a.weight_pct),
    color: a.color ?? undefined,
  }));

  const monthlyData: MonthlyBarDatum[] = useMonthlyReturns(r?.series);

  const allocTabs = ALLOCATION_VIEWS.map((v) => ({ key: v.key, label: v.label }));

  return (
    <div className="space-y-5">
      {/* Performance vs benchmark */}
      <Card>
        <CardHeader
          title="Performance vs benchmark"
          subtitle={`Returns indexed to 100 · benchmark: ${benchmark}`}
          action={
            <form
              className="flex gap-2 items-center"
              onSubmit={(e) => {
                e.preventDefault();
                setBenchmark(benchmarkInput.trim().toUpperCase() || '');
              }}
            >
              <Input value={benchmarkInput} onChange={(e) => setBenchmarkInput(e.target.value)} className="!w-28" aria-label="Benchmark symbol" placeholder="SPY" />
              <Button type="submit" size="sm" variant="secondary">Apply</Button>
            </form>
          }
        />
        <PerformanceLine
          data={series}
          loading={returns.isLoading}
          currency={portfolioCurrency}
          locale={locale}
          isPercent
          emptyTitle="No performance data"
          emptyMessage="Performance series will appear once the portfolio has price history."
        />
        {r ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 mt-4">
            <Metric label="Total return" value={formatPercent(r.total_return_pct)} pct negative={parseMoney(r.total_return_pct) < 0} />
            <Metric label="Annualized" value={formatPercent(r.annualized_return_pct)} pct negative={parseMoney(r.annualized_return_pct) < 0} />
            <Metric label="TWR" value={formatPercent(r.twr_pct)} pct />
            <Metric label="MWR (IRR)" value={formatPercent(r.mwr_pct)} pct />
            <Metric label="Benchmark" value={formatPercent(r.benchmark_return_pct)} pct negative={parseMoney(r.benchmark_return_pct) > 0} />
            <Metric label="Excess" value={formatPercent(r.excess_return_pct)} pct negative={parseMoney(r.excess_return_pct) < 0} />
            <Metric label="Alpha" value={formatPercent(r.alpha)} pct />
            <Metric label="Beta" value={r.beta} />
          </div>
        ) : null}
      </Card>

      {/* Risk stats + drawdown */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Risk metrics" subtitle="Volatility, drawdown and tail risk" />
          {risk.isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-16 rounded-xl" />
              ))}
            </div>
          ) : risk.data ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Metric label="Volatility" value={formatPercent(risk.data.volatility_pct)} pct />
              <Metric label="VaR 95%" value={formatPercent(risk.data.var_95_pct)} pct negative />
              <Metric label="CVaR 95%" value={formatPercent(risk.data.cvar_95_pct)} pct negative />
              <Metric label="Beta" value={risk.data.beta} />
              <Metric
                label="Max drawdown"
                value={formatPercent(drawdownData.reduce((min, d) => Math.min(min, d.drawdown_pct), 0))}
                pct
                negative
              />
              <Metric
                label="Sharpe"
                value={r ? r.sharpe : '—'}
              />
            </div>
          ) : (
            <EmptyState title="No risk data" message="Risk metrics need enough price history to compute." compact />
          )}
        </Card>
        <Card>
          <CardHeader title="Drawdown" subtitle="% below previous peak" />
          <DrawdownArea
            data={drawdownData}
            loading={risk.isLoading}
            emptyTitle="No drawdown data"
            emptyMessage="Drawdown series will appear once there is price history."
          />
        </Card>
      </div>

      {/* Rolling metrics */}
      <RollingPanel portfolioId={portfolioId} />

      {/* Drawdown table + capture ratio */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DrawdownTablePanel portfolioId={portfolioId} />
        <CapturePanel portfolioId={portfolioId} />
      </div>

      {/* Correlation matrix */}
      <CorrelationPanel portfolioId={portfolioId} />

      {/* Scenario stress test */}
      <ScenarioPanel portfolioId={portfolioId} />

      {/* Allocation switcher */}
      <Card>
        <CardHeader title="Allocation breakdown" subtitle="Switch between dimensions" />
        <Tabs tabs={allocTabs} active={allocView} onChange={(k) => setAllocView(k as AllocationBy)} className="mb-4" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-center">
          <AllocationDonut
            data={donutData}
            loading={portfolioAllocation.isLoading}
            currency={portfolioCurrency}
            locale={locale}
            emptyTitle="No allocation data"
            emptyMessage="Holdings are needed to compute allocation."
          />
          <div className="space-y-2">
            {donutData.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Allocation by {allocView.replace(/_/g, ' ')} will appear here.
              </p>
            ) : (
              donutData.map((d, i) => (
                <div key={d.label} className="flex items-center gap-2.5 text-sm">
                  <span className="rounded-full shrink-0" style={{ width: 10, height: 10, background: d.color ?? `var(--chart-${(i % 8) + 1})` }} />
                  <span className="flex-1 font-medium capitalize">{d.label}</span>
                  <span style={{ color: 'var(--muted)' }}>{formatMoney(d.value, portfolioCurrency, locale)}</span>
                  <Badge tone="info">{d.weight_pct !== undefined ? d.weight_pct.toFixed(1) : '0.0'}%</Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      {/* Monthly returns */}
      <Card>
        <CardHeader title="Monthly returns" subtitle="From the performance series" />
        <MonthlyReturnsBar
          data={monthlyData}
          loading={returns.isLoading}
          emptyTitle="No monthly data"
          emptyMessage="Monthly returns are derived from the performance series."
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {r ? (
            <>
              <Metric label="Best month" value={formatPercent(r.best_month_pct)} pct />
              <Metric label="Worst month" value={formatPercent(r.worst_month_pct)} pct negative />
              <Metric label="Winning months" value={`${r.winning_months_pct}%`} />
              <Metric label="Sortino" value={r.sortino} />
            </>
          ) : null}
        </div>
      </Card>

      {/* Cost basis */}
      <Card>
        <CardHeader title="Cost basis" subtitle={costBasis.data ? `Method: ${costBasis.data.method}` : 'FIFO or average cost per holding'} />
        {costBasis.isLoading ? (
          <div className="skeleton h-40 rounded-xl" />
        ) : costBasis.data && costBasis.data.holdings.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Avg cost</th>
                  <th className="text-right">Total cost</th>
                  <th className="text-right">Market value</th>
                  <th className="text-right">Realized</th>
                  <th className="text-right">Unrealized</th>
                </tr>
              </thead>
              <tbody>
                {costBasis.data.holdings.map((h) => (
                  <tr key={h.symbol}>
                    <td className="font-semibold">{h.symbol}</td>
                    <td className="text-right">{parseMoney(h.quantity).toLocaleString(locale, { maximumFractionDigits: 4 })}</td>
                    <td className="text-right">{formatMoney(h.avg_cost, portfolioCurrency, locale)}</td>
                    <td className="text-right">{formatMoney(h.total_cost, portfolioCurrency, locale)}</td>
                    <td className="text-right">{formatMoney(h.market_value, portfolioCurrency, locale)}</td>
                    <td className={`text-right ${signClass(h.realized_gain)}`}>{formatMoney(h.realized_gain, portfolioCurrency, locale)}</td>
                    <td className={`text-right ${signClass(h.unrealized_gain)}`}>{formatMoney(h.unrealized_gain, portfolioCurrency, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No cost basis data" message="Buy transactions are needed to compute cost basis." compact />
        )}
      </Card>

      {/* Diversification */}
      <Card>
        <CardHeader title="Diversification" subtitle="Concentration analysis" />
        {diversification.isLoading ? (
          <div className="skeleton h-32 rounded-xl" />
        ) : diversification.data ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label="HHI" value={diversification.data.hhi} />
            <Metric label="Effective count" value={diversification.data.effective_count} />
            <Metric
              label="Concentration"
              value={diversification.data.concentration_level.replace(/_/g, ' ')}
            />
            <Metric label="Top-10 weight" value={formatPercent(diversification.data.top_10_weight_pct)} pct />
          </div>
        ) : (
          <EmptyState title="No diversification data" message="Holdings are needed for concentration analysis." compact />
        )}
      </Card>

      {/* Forecast */}
      <Card>
        <CardHeader
          title="Forecast"
          subtitle="Monte Carlo projection with contributions"
          action={
            <form
              className="flex flex-wrap gap-2 items-end justify-end"
              onSubmit={(e) => {
                e.preventDefault();
                void forecast.refetch();
              }}
            >
              <div>
                <label className="field-label text-xs">Years</label>
                <Input type="number" min={1} max={50} className="!w-20" value={forecastParams.years} onChange={(e) => setForecastParams((p) => ({ ...p, years: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="field-label text-xs">Exp. return %</label>
                <Input type="number" min={-10} max={30} step="0.5" className="!w-20" value={forecastParams.expected_return} onChange={(e) => setForecastParams((p) => ({ ...p, expected_return: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="field-label text-xs">Contribution</label>
                <Input type="number" min={0} className="!w-24" value={forecastParams.contribution} onChange={(e) => setForecastParams((p) => ({ ...p, contribution: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="field-label text-xs">Frequency</label>
                <select className="select !w-28" value={forecastParams.contribution_freq} onChange={(e) => setForecastParams((p) => ({ ...p, contribution_freq: e.target.value }))}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                  <option value="one-time">One-time</option>
                </select>
              </div>
              <Button type="submit" size="sm" variant="secondary">Run forecast</Button>
            </form>
          }
        />
        {forecast.isLoading ? (
          <div className="skeleton h-56 rounded-xl" />
        ) : forecast.data ? (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-center">
            <div className="space-y-3">
              <Metric label="Projected value" value={formatMoney(forecast.data.projected_value, portfolioCurrency, locale)} />
              <Metric label="Goal value (needed)" value={formatMoney(forecast.data.goal_value, portfolioCurrency, locale)} />
              <div className="rounded-xl p-3.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Probability of success
                </p>
                <p className="text-lg font-bold mt-0.5">{parseMoney(forecast.data.probability_of_success).toFixed(1)}%</p>
              </div>
            </div>
            <div className="xl:col-span-2">
              <GoalProjectionInline data={(forecast.data.series ?? []).map((s) => ({ label: String(s.year), value: parseMoney(s.value), projected: parseMoney(s.contributed) }))} currency={portfolioCurrency} locale={locale} />
            </div>
          </div>
        ) : (
          <EmptyState title="No forecast data" message="Run the forecast to see the projection." compact />
        )}
      </Card>
    </div>
  );
}

function useMonthlyReturns(series: { date: string; portfolio: string | null }[] | undefined): MonthlyBarDatum[] {
  if (!series || series.length === 0) return [];
  const buckets = new Map<string, number[]>();
  for (const p of series) {
    if (p.portfolio === null) continue;
    const month = p.date.slice(0, 7);
    const arr = buckets.get(month) ?? [];
    arr.push(parseMoney(p.portfolio));
    buckets.set(month, arr);
  }
  const months = [...buckets.keys()].sort();
  const out: MonthlyBarDatum[] = [];
  for (let i = 1; i < months.length; i++) {
    const prev = (buckets.get(months[i - 1]) ?? []);
    const cur = (buckets.get(months[i]) ?? []);
    const prevVal = prev.length ? prev[prev.length - 1] : 0;
    const curVal = cur.length ? cur[cur.length - 1] : 0;
    if (prevVal !== 0) {
      out.push({ label: months[i], value: ((curVal - prevVal) / prevVal) * 100 });
    }
  }
  return out;
}

function GoalProjectionInline({ data, currency, locale }: { data: { label: string; value: number; projected: number }[]; currency: string; locale: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fcCont" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={72} tickFormatter={(v: number) => formatMoney(v, currency, locale).replace(/\.00$/, '')} />
        <Area type="monotone" dataKey="value" name="Projected" stroke="var(--chart-1)" strokeWidth={2} fill="url(#fcFill)" />
        <Area type="monotone" dataKey="projected" name="Contributed" stroke="var(--chart-4)" strokeWidth={1.5} strokeDasharray="5 4" fill="url(#fcCont)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ============================================================
   Expanded analytics panels (rolling / drawdowns / capture / correlation / scenarios)
   ============================================================ */

const axisStyle2 = {
  fontSize: 11,
  fill: 'var(--muted)',
};

const ROLLING_WINDOWS = [30, 60, 90];

function RollingPanel({ portfolioId }: { portfolioId: string }) {
  const [windowDays, setWindowDays] = useState(30);
  const rolling = useQuery({
    queryKey: ['analytics', portfolioId, 'rolling', windowDays],
    queryFn: () => analyticsApi.rolling(portfolioId, windowDays),
  });

  const data = (rolling.data?.dates ?? []).map((d, i) => ({
    date: d,
    returns: rolling.data?.returns_pct?.[i] != null ? parseMoney(rolling.data.returns_pct[i]) : null,
    volatility: rolling.data?.volatility_pct?.[i] != null ? parseMoney(rolling.data.volatility_pct[i]) : null,
  }));

  return (
    <Card>
      <CardHeader
        title="Rolling metrics"
        subtitle={`${windowDays}-day rolling return and volatility`}
        action={
          <div className="tabs">
            {ROLLING_WINDOWS.map((w) => (
              <button
                key={w}
                role="tab"
                aria-selected={windowDays === w}
                className={`tab ${windowDays === w ? 'tab-active' : ''}`}
                onClick={() => setWindowDays(w)}
              >
                {w}d
              </button>
            ))}
          </div>
        }
      />
      {rolling.isLoading ? (
        <div className="skeleton rounded-xl" style={{ height: 240 }} />
      ) : data.length === 0 ? (
        <EmptyState title="No rolling data" message="Rolling metrics need enough price history to compute." compact />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={axisStyle2} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={32} />
              <YAxis tick={axisStyle2} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={48} />
              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} iconType="plainline" />
              <Line type="monotone" dataKey="returns" name="Rolling return" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="volatility" name="Volatility" stroke="var(--chart-5)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <Metric label="Window" value={`${rolling.data?.window ?? windowDays} days`} />
            <Metric label="Latest return" value={formatPercent(rolling.data?.returns_pct?.[rolling.data?.returns_pct.length - 1])} pct />
            <Metric label="Latest volatility" value={formatPercent(rolling.data?.volatility_pct?.[rolling.data?.volatility_pct.length - 1])} pct />
          </div>
        </>
      )}
    </Card>
  );
}

function DrawdownTablePanel({ portfolioId }: { portfolioId: string }) {
  const { profile } = useAuth();
  const locale = profile?.locale ?? 'en-US';
  const drawdowns = useQuery({
    queryKey: ['analytics', portfolioId, 'drawdowns'],
    queryFn: () => analyticsApi.drawdowns(portfolioId),
  });

  const rows = drawdowns.data?.table ?? [];

  return (
    <Card>
      <CardHeader
        title="Drawdown periods"
        subtitle={drawdowns.data ? `Max depth ${formatPercent(drawdowns.data.max_depth_pct)}` : 'Historical drawdown episodes'}
      />
      {drawdowns.isLoading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : rows.length === 0 ? (
        <EmptyState title="No drawdown periods" message="Drawdown history will appear once there is enough data." compact />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Start</th>
                <th>Trough</th>
                <th>End</th>
                <th className="text-right">Depth</th>
                <th className="text-right">Duration</th>
                <th className="text-right">Recovery</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => (
                <tr key={`${d.start}-${i}`}>
                  <td className="text-xs">{new Date(`${d.start}T00:00:00`).toLocaleDateString(locale)}</td>
                  <td className="text-xs">{new Date(`${d.trough}T00:00:00`).toLocaleDateString(locale)}</td>
                  <td className="text-xs">{d.end ? new Date(`${d.end}T00:00:00`).toLocaleDateString(locale) : '—'}</td>
                  <td className={`text-right ${signClass(d.depth_pct)}`}>{formatPercent(d.depth_pct)}</td>
                  <td className="text-right">{d.duration_days}d</td>
                  <td className="text-right">{d.recovery_days !== null && d.recovery_days !== undefined ? `${d.recovery_days}d` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function CapturePanel({ portfolioId }: { portfolioId: string }) {
  const [benchmarkInput, setBenchmarkInput] = useState('SPY');
  const [benchmark, setBenchmark] = useState('SPY');
  const capture = useQuery({
    queryKey: ['analytics', portfolioId, 'capture', benchmark],
    queryFn: () => analyticsApi.capture(portfolioId, benchmark),
  });

  const c = capture.data;
  return (
    <Card>
      <CardHeader
        title="Capture ratio"
        subtitle="How the portfolio participates in up and down markets"
        action={
          <form
            className="flex gap-2 items-center"
            onSubmit={(e) => {
              e.preventDefault();
              setBenchmark(benchmarkInput.trim().toUpperCase() || 'SPY');
            }}
          >
            <Input value={benchmarkInput} onChange={(e) => setBenchmarkInput(e.target.value)} className="!w-24" aria-label="Benchmark symbol" placeholder="SPY" />
            <Button type="submit" size="sm" variant="secondary">Apply</Button>
          </form>
        }
      />
      {capture.isLoading ? (
        <div className="skeleton h-28 rounded-xl" />
      ) : c ? (
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Up capture" value={formatPercent(c.up_capture_pct)} pct />
          <Metric label="Down capture" value={formatPercent(c.down_capture_pct)} pct negative={parseMoney(c.down_capture_pct) < 100} />
          <Metric label="Up months" value={String(c.up_count)} />
          <Metric label="Down months" value={String(c.down_count)} />
        </div>
      ) : (
        <EmptyState title="No capture data" message="Capture ratios need benchmark-aligned history." compact />
      )}
      {c?.synthetic ? (
        <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
          <Badge tone="warning">Synthetic</Badge> · benchmark series was approximated.
        </p>
      ) : null}
    </Card>
  );
}

function corrColor(value: string | null): { background: string; color: string } {
  if (value === null || value === undefined || value === '') return { background: 'transparent', color: 'var(--muted)' };
  const v = parseMoney(value);
  const clamped = Math.max(-1, Math.min(1, v));
  const alpha = Math.round(Math.abs(clamped) * 70) + 10;
  const positive = clamped >= 0;
  const base = positive ? 'var(--chart-3)' : 'var(--chart-5)';
  const text = Math.abs(clamped) > 0.55 ? '#fff' : 'var(--text)';
  return { background: `color-mix(in srgb, ${base} ${alpha}%, transparent)`, color: text };
}

function CorrelationPanel({ portfolioId }: { portfolioId: string }) {
  const correlation = useQuery({
    queryKey: ['analytics', portfolioId, 'correlation'],
    queryFn: () => analyticsApi.correlation(portfolioId),
  });

  const symbols = correlation.data?.symbols ?? [];
  const matrix = correlation.data?.matrix ?? [];

  return (
    <Card>
      <CardHeader title="Correlation matrix" subtitle="Pairwise return correlation between holdings" />
      {correlation.isLoading ? (
        <div className="skeleton h-48 rounded-xl" />
      ) : symbols.length === 0 ? (
        <EmptyState title="No correlation data" message="Holdings with price history are needed to compute correlations." compact />
      ) : (
        <div className="overflow-x-auto">
          <table className="table text-center" style={{ minWidth: symbols.length * 72 + 120 }}>
            <thead>
              <tr>
                <th className="sticky left-0" style={{ background: 'var(--surface)' }}>Symbol</th>
                {symbols.map((s) => (
                  <th key={s} className="text-xs font-semibold">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {symbols.map((rowSym, i) => (
                <tr key={rowSym}>
                  <td className="font-semibold sticky left-0" style={{ background: 'var(--surface)' }}>{rowSym}</td>
                  {symbols.map((colSym, j) => {
                    const v = matrix[i]?.[j] ?? null;
                    const style = corrColor(v);
                    return (
                      <td
                        key={colSym}
                        className="text-xs font-medium"
                        style={{ background: style.background, color: style.color, minWidth: 56 }}
                      >
                        {v !== null && v !== undefined && v !== '' ? parseMoney(v).toFixed(2) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ScenarioPanel({ portfolioId }: { portfolioId: string }) {
  const { profile } = useAuth();
  const currency = profile?.base_currency ?? 'USD';
  const locale = profile?.locale ?? 'en-US';
  const { detail } = usePortfolio(portfolioId);
  const portfolioCurrency = detail.data?.currency ?? currency;

  const [marketChange, setMarketChange] = useState('-20');
  const [volMultiplier, setVolMultiplier] = useState('1.5');
  const [run, setRun] = useState(false);

  const scenario = useQuery({
    queryKey: ['analytics', portfolioId, 'scenarios', marketChange, volMultiplier],
    queryFn: () =>
      analyticsApi.scenarios(portfolioId, {
        market_change: Number(marketChange),
        vol_multiplier: Number(volMultiplier),
      }),
    enabled: run,
  });

  const s = scenario.data;

  return (
    <Card>
      <CardHeader
        title="Scenario stress test"
        subtitle="What happens to the portfolio under a market shock?"
        action={
          <form
            className="flex flex-wrap gap-2 items-end justify-end"
            onSubmit={(e) => {
              e.preventDefault();
              setRun(true);
              void scenario.refetch();
            }}
          >
            <div>
              <label className="field-label text-xs">Market change %</label>
              <Input type="number" step="any" className="!w-24" value={marketChange} onChange={(e) => setMarketChange(e.target.value)} aria-label="Market change percent" />
            </div>
            <div>
              <label className="field-label text-xs">Vol multiplier</label>
              <Input type="number" step="0.1" min="0" className="!w-24" value={volMultiplier} onChange={(e) => setVolMultiplier(e.target.value)} aria-label="Volatility multiplier" />
            </div>
            <Button type="submit" size="sm" variant="secondary">Run scenario</Button>
          </form>
        }
      />
      {scenario.isLoading ? (
        <div className="skeleton h-24 rounded-xl" />
      ) : !s ? (
        <EmptyState
          title="No scenario run yet"
          message="Set a market shock (e.g. -20%) and volatility multiplier, then run the scenario."
          compact
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Base value" value={formatMoney(s.base_value, portfolioCurrency, locale)} />
          <Metric label="Scenario value" value={formatMoney(s.scenario_value, portfolioCurrency, locale)} negative={parseMoney(s.change_pct) < 0} />
          <Metric label="Change" value={formatPercent(s.change_pct)} pct negative={parseMoney(s.change_pct) < 0} />
          <Metric label="Est. max drawdown" value={formatPercent(s.est_max_drawdown_pct)} pct negative />
        </div>
      )}
    </Card>
  );
}
