import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReactNode } from 'react';
import { EmptyState } from '../ui/EmptyState';
import { formatMoney, formatPercent, parseMoney } from '../../api/types';

/* ---------- shared helpers ---------- */

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#4f46e5';
}

export const chartColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
];

const axisStyle = {
  fontSize: 9,
  fill: 'var(--muted)',
};

function ChartEmpty({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex items-center justify-center" style={{ height: 260 }}>
      <EmptyState title={title} message={message} compact />
    </div>
  );
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string; value?: string | number; color?: string; payload?: Record<string, unknown> }>;
  label?: string | number;
  formatter?: (value: number, name: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="card card-pad !p-3 text-xs space-y-1" style={{ boxShadow: 'var(--shadow)' }}>
      <p className="font-semibold" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      {payload.map((entry, i) => {
        const val = typeof entry.value === 'number' ? entry.value : parseMoney(entry.value);
        return (
          <p key={i} className="flex items-center gap-2">
            <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: entry.color }} />
            <span style={{ color: 'var(--muted)' }}>{entry.name}:</span>
            <span className="font-semibold">{formatter ? formatter(val, String(entry.name)) : val.toLocaleString()}</span>
          </p>
        );
      })}
    </div>
  );
}

/* ---------- ValueChart (area) ---------- */

export interface ValuePoint {
  date: string;
  value: number;
  cash?: number;
  invested?: number;
}

interface ValueChartProps {
  data: ValuePoint[];
  currency?: string;
  locale?: string;
  loading?: boolean;
  height?: number;
  compareKey?: 'cash' | 'invested';
  emptyTitle?: string;
  emptyMessage?: string;
}

export function ValueChart({ data, currency = 'USD', locale = 'en-US', loading, height = 280, compareKey, emptyTitle, emptyMessage }: ValueChartProps) {
  if (loading) {
    return <div className="skeleton rounded-xl" style={{ height }} />;
  }
  if (data.length === 0) {
    return <ChartEmpty title={emptyTitle ?? 'No value history yet'} message={emptyMessage ?? 'Value history will appear once your portfolio has activity.'} />;
  }
  const fmt = (v: number) => formatMoney(v, currency, locale);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cssVar('--chart-1')} stopOpacity={0.35} />
            <stop offset="100%" stopColor={cssVar('--chart-1')} stopOpacity={0.02} />
          </linearGradient>
          {compareKey ? (
            <linearGradient id="compareFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cssVar('--chart-2')} stopOpacity={0.25} />
              <stop offset="100%" stopColor={cssVar('--chart-2')} stopOpacity={0.02} />
            </linearGradient>
          ) : null}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={cssVar('--border')} vertical={false} />
        <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={{ stroke: cssVar('--border') }} minTickGap={32} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatMoney(v, currency, locale).replace(/\.00$/, '')} width={72} />
        <RechartsTooltip content={<ChartTooltipContent formatter={(v) => fmt(v)} />} />
        <Area type="monotone" dataKey="value" name="Value" stroke={cssVar('--chart-1')} strokeWidth={2} fill="url(#valueFill)" />
        {compareKey ? <Area type="monotone" dataKey={compareKey} name={compareKey} stroke={cssVar('--chart-2')} strokeWidth={1.5} strokeDasharray="4 3" fill="url(#compareFill)" /> : null}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ---------- AllocationDonut ---------- */

export interface AllocationDatum {
  label: string;
  value: number;
  weight_pct?: number;
  color?: string | null;
}

interface AllocationDonutProps {
  data: AllocationDatum[];
  loading?: boolean;
  currency?: string;
  locale?: string;
  height?: number;
  emptyTitle?: string;
  emptyMessage?: string;
  centerLabel?: string;
  centerValue?: string;
}

export function AllocationDonut({ data, loading, currency = 'USD', locale = 'en-US', height = 260, emptyTitle, emptyMessage, centerLabel, centerValue }: AllocationDonutProps) {
  if (loading) {
    return <div className="skeleton rounded-xl" style={{ height }} />;
  }
  const nonEmpty = data.filter((d) => d.value > 0);
  if (nonEmpty.length === 0) {
    return <ChartEmpty title={emptyTitle ?? 'No allocation data'} message={emptyMessage ?? 'Add holdings to see how your portfolio is allocated.'} />;
  }
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={nonEmpty} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="none">
            {nonEmpty.map((entry, i) => (
              <Cell key={entry.label} fill={entry.color || chartColors[i % chartColors.length]} />
            ))}
          </Pie>
          <RechartsTooltip content={<ChartTooltipContent formatter={(v) => formatMoney(v, currency, locale)} />} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: cssVar('--muted') }}
            formatter={(value: string) => {
              const d = nonEmpty.find((x) => x.label === value);
              const pct = d?.weight_pct ?? (nonEmpty.length > 0 && d ? (d.value / nonEmpty.reduce((s, x) => s + x.value, 0)) * 100 : 0);
              return `${value} · ${pct.toFixed(1)}%`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerValue ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold">{centerValue}</span>
          {centerLabel ? <span className="text-xs" style={{ color: 'var(--muted)' }}>{centerLabel}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- PerformanceLine ---------- */

export interface PerformancePoint {
  date: string;
  portfolio?: number | null;
  benchmark?: number | null;
}

interface PerformanceLineProps {
  data: PerformancePoint[];
  loading?: boolean;
  height?: number;
  currency?: string;
  locale?: string;
  benchmarkLabel?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  isPercent?: boolean;
}

export function PerformanceLine({ data, loading, height = 280, currency = 'USD', locale = 'en-US', benchmarkLabel = 'Benchmark', emptyTitle, emptyMessage, isPercent = false }: PerformanceLineProps) {
  if (loading) {
    return <div className="skeleton rounded-xl" style={{ height }} />;
  }
  if (data.length === 0) {
    return <ChartEmpty title={emptyTitle ?? 'No performance data'} message={emptyMessage ?? 'Performance vs benchmark will show once there is history.'} />;
  }
  const fmt = (v: number) => (isPercent ? formatPercent(v) : formatMoney(v, currency, locale));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={cssVar('--border')} vertical={false} />
        <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={{ stroke: cssVar('--border') }} minTickGap={32} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v: number) => (isPercent ? `${v.toFixed(0)}%` : formatMoney(v, currency, locale).replace(/\.00$/, ''))} width={72} />
        <RechartsTooltip content={<ChartTooltipContent formatter={(v) => fmt(v)} />} />
        <Legend wrapperStyle={{ fontSize: 11, color: cssVar('--muted') }} iconType="plainline" />
        <Line type="monotone" dataKey="portfolio" name="Portfolio" stroke={cssVar('--chart-1')} strokeWidth={2} dot={false} connectNulls />
        <Line type="monotone" dataKey="benchmark" name={benchmarkLabel} stroke={cssVar('--chart-4')} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ---------- MonthlyReturnsBar ---------- */

export interface MonthlyBarDatum {
  label: string;
  value: number;
}

interface MonthlyReturnsBarProps {
  data: MonthlyBarDatum[];
  loading?: boolean;
  height?: number;
  emptyTitle?: string;
  emptyMessage?: string;
  colorPositive?: string;
  colorNegative?: string;
}

export function MonthlyReturnsBar({ data, loading, height = 240, emptyTitle, emptyMessage, colorPositive, colorNegative }: MonthlyReturnsBarProps) {
  if (loading) {
    return <div className="skeleton rounded-xl" style={{ height }} />;
  }
  if (data.length === 0) {
    return <ChartEmpty title={emptyTitle ?? 'No monthly data'} message={emptyMessage ?? 'Monthly returns will appear once there is enough history.'} />;
  }
  const pos = colorPositive ?? cssVar('--chart-3');
  const neg = colorNegative ?? cssVar('--chart-5');
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={cssVar('--border')} vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={{ stroke: cssVar('--border') }} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={48} />
        <RechartsTooltip content={<ChartTooltipContent formatter={(v) => formatPercent(v)} />} cursor={{ fill: cssVar('--surface-2'), opacity: 0.5 }} />
        <Bar dataKey="value" name="Return" radius={[3, 3, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.value >= 0 ? pos : neg} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- DrawdownArea ---------- */

export interface DrawdownPoint {
  date: string;
  drawdown_pct: number;
}

interface DrawdownAreaProps {
  data: DrawdownPoint[];
  loading?: boolean;
  height?: number;
  emptyTitle?: string;
  emptyMessage?: string;
}

export function DrawdownArea({ data, loading, height = 220, emptyTitle, emptyMessage }: DrawdownAreaProps) {
  if (loading) {
    return <div className="skeleton rounded-xl" style={{ height }} />;
  }
  if (data.length === 0) {
    return <ChartEmpty title={emptyTitle ?? 'No drawdown data'} message={emptyMessage ?? 'Drawdown history will appear once there is enough data.'} />;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cssVar('--chart-5')} stopOpacity={0.3} />
            <stop offset="100%" stopColor={cssVar('--chart-5')} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={cssVar('--border')} vertical={false} />
        <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={{ stroke: cssVar('--border') }} minTickGap={32} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={48} />
        <RechartsTooltip content={<ChartTooltipContent formatter={(v) => formatPercent(v)} />} />
        <Area type="monotone" dataKey="drawdown_pct" name="Drawdown" stroke={cssVar('--chart-5')} strokeWidth={2} fill="url(#ddFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ---------- GoalProjectionArea ---------- */

export interface GoalProjectionPoint {
  label: string;
  value: number;
  projected?: number;
}

interface GoalProjectionAreaProps {
  data: GoalProjectionPoint[];
  loading?: boolean;
  height?: number;
  currency?: string;
  locale?: string;
  emptyTitle?: string;
  emptyMessage?: string;
}

export function GoalProjectionArea({ data, loading, height = 260, currency = 'USD', locale = 'en-US', emptyTitle, emptyMessage }: GoalProjectionAreaProps) {
  if (loading) {
    return <div className="skeleton rounded-xl" style={{ height }} />;
  }
  if (data.length === 0) {
    return <ChartEmpty title={emptyTitle ?? 'No projection data'} message={emptyMessage ?? 'Projections will appear once the goal has contributions.'} />;
  }
  const fmt = (v: number) => formatMoney(v, currency, locale);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="goalFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cssVar('--chart-6')} stopOpacity={0.35} />
            <stop offset="100%" stopColor={cssVar('--chart-6')} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cssVar('--chart-4')} stopOpacity={0.25} />
            <stop offset="100%" stopColor={cssVar('--chart-4')} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={cssVar('--border')} vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={{ stroke: cssVar('--border') }} minTickGap={32} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatMoney(v, currency, locale).replace(/\.00$/, '')} width={72} />
        <RechartsTooltip content={<ChartTooltipContent formatter={(v) => fmt(v)} />} />
        <Legend wrapperStyle={{ fontSize: 11, color: cssVar('--muted') }} iconType="plainline" />
        <Area type="monotone" dataKey="value" name="Actual" stroke={cssVar('--chart-6')} strokeWidth={2} fill="url(#goalFill)" />
        <Area type="monotone" dataKey="projected" name="Projected" stroke={cssVar('--chart-4')} strokeWidth={2} strokeDasharray="5 4" fill="url(#projFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ---------- IncomeBar ---------- */

export interface IncomeBarDatum {
  label: string;
  dividends?: number;
  interest?: number;
  fees?: number;
}

interface IncomeBarProps {
  data: IncomeBarDatum[];
  loading?: boolean;
  height?: number;
  currency?: string;
  locale?: string;
  emptyTitle?: string;
  emptyMessage?: string;
}

export function IncomeBar({ data, loading, height = 260, currency = 'USD', locale = 'en-US', emptyTitle, emptyMessage }: IncomeBarProps) {
  if (loading) {
    return <div className="skeleton rounded-xl" style={{ height }} />;
  }
  if (data.length === 0) {
    return <ChartEmpty title={emptyTitle ?? 'No income data'} message={emptyMessage ?? 'Dividends, interest and fees will appear by month.'} />;
  }
  const fmt = (v: number) => formatMoney(v, currency, locale);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={cssVar('--border')} vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={{ stroke: cssVar('--border') }} minTickGap={16} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatMoney(v, currency, locale).replace(/\.00$/, '')} width={72} />
        <RechartsTooltip content={<ChartTooltipContent formatter={(v) => fmt(v)} />} cursor={{ fill: cssVar('--surface-2'), opacity: 0.5 }} />
        <Legend wrapperStyle={{ fontSize: 11, color: cssVar('--muted') }} iconType="circle" iconSize={8} />
        <Bar dataKey="dividends" name="Dividends" stackId="income" fill={cssVar('--chart-3')} radius={[0, 0, 0, 0]} />
        <Bar dataKey="interest" name="Interest" stackId="income" fill={cssVar('--chart-2')} />
        <Bar dataKey="fees" name="Fees" fill={cssVar('--chart-5')} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export type { ReactNode };
