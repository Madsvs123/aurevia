import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import clsx from 'clsx';

interface EmptyStateProps {
  title: string;
  message?: string;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ title, message, action, icon, compact }: EmptyStateProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center text-center', compact ? 'py-14' : 'py-6')}>
      <div
        className="flex items-center justify-center rounded-full mb-3"
        style={{ width: 48, height: 48, background: 'var(--surface-2)' }}
      >
        {icon ?? <Inbox size={22} style={{ color: 'var(--muted)' }} />}
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {message ? (
        <p className="text-sm mt-1 max-w-sm" style={{ color: 'var(--muted)' }}>
          {message}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
