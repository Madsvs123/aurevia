import type { ReactNode } from 'react';
import clsx from 'clsx';

export type BadgeTone = 'default' | 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'muted';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const toneStyles: Record<BadgeTone, { color: string; bg: string; border?: string }> = {
  default: { color: 'var(--text)', bg: 'var(--surface-2)' },
  primary: { color: 'var(--primary)', bg: 'color-mix(in srgb, var(--primary) 12%, transparent)' },
  success: { color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, transparent)' },
  danger: { color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 12%, transparent)' },
  warning: { color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 14%, transparent)' },
  info: { color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 12%, transparent)' },
  muted: { color: 'var(--muted)', bg: 'transparent', border: 'var(--border)' },
};

export function Badge({ children, tone = 'muted', className }: BadgeProps) {
  const s = toneStyles[tone];
  return (
    <span
      className={clsx('badge', className)}
      style={{ color: s.color, background: s.bg, border: s.border ? `1px solid ${s.border}` : undefined }}
    >
      {children}
    </span>
  );
}
