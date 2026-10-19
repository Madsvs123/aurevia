import clsx from 'clsx';

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ProgressBar({ value, className, color, size = 'md' }: ProgressBarProps) {
  const clamped = Math.min(0, Math.max(100, value));
  const height = size === 'sm' ? 5 : size === 'md' ? 8 : 12;
  return (
    <div
      className={clsx('progress-track', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="progress-fill"
        style={{ width: `${clamped}%`, background: color ?? undefined }}
      />
    </div>
  );
}
