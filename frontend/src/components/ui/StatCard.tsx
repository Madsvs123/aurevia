import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Skeleton } from './Skeleton';
import { parseMoney, signClass } from '../../api/types';

interface StatCardProps {
  label: string;
  value?: string | number | null;
  loading?: boolean;
  delta?: string | number | null;
  deltaLabel?: string;
  icon?: ReactNode;
  currency?: string;
  hint?: string;
}

export function StatCard({ label, value, loading, delta, deltaLabel, icon, currency, hint }: StatCardProps) {
  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          {label}
        </p>
        {icon ? (
          <span style={{ color: 'var(--muted)' }} className="flex items-center">
            {icon}
          </span>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="h-7 w-28 mt-2" />
      ) : (
        <p className="text-2xl font-bold mt-1.5 tracking-tight">{value ?? '—'}</p>
      )}
      {delta !== undefined && delta !== null ? (
        <p className={`text-xs font-medium mt-1.5 flex items-center gap-1 ${signClass(delta)}`}>
          {parseMoney(delta) >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {typeof delta === 'string' || typeof delta === 'number' ? String(delta) : ''}
          {deltaLabel ? <span style={{ color: 'var(--muted)' }}>· {deltaLabel}</span> : null}
        </p>
      ) : null}
      {hint && delta ? (
        <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
          {hint}
        </p>
      ) : null}
      {currency ? (
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
          {currency}
        </p>
      ) : null}
    </div>
  );
}
