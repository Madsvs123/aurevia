import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
}

export function Card({ children, padded = true, className, ...rest }: CardProps) {
  return (
    <div className={clsx('card', !padded && 'card-pad', className)} {...rest}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div className={clsx('flex items-start justify-between gap-3 mb-4', className)}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle ? <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
