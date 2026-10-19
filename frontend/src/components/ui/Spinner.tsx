import clsx from 'clsx';

interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 18, className }: SpinnerProps) {
  return (
    <span
      className={clsx('inline-block animate-spin rounded-full', className)}
      style={{
        width: size,
        height: size,
        border: '2px solid var(--border)',
        borderTopColor: 'var(--border)',
      }}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner size={32} />
    </div>
  );
}
