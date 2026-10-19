import { useId } from 'react';
import clsx from 'clsx';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export function Toggle({ checked, onChange, label, disabled, size = 'md' }: ToggleProps) {
  const id = useId();
  const dims = size === 'sm' ? { w: 34, h: 20, k: 16 } : { w: 42, h: 24, k: 20 };
  return (
    <label
      htmlFor={id}
      className={clsx('inline-flex items-center gap-2 cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed')}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(checked)}
        className="relative rounded-full transition-colors duration-150"
        style={{
          width: dims.w,
          height: dims.h,
          background: checked ? 'var(--primary)' : 'var(--border)',
        }}
      >
        <span
          className="absolute top-0.5 rounded-full transition-all duration-150"
          style={{
            width: dims.k,
            height: dims.k,
            background: '#fff',
            left: checked ? dims.w - dims.k - 2 : 2,
            boxShadow: '0 1px 2px rgb(0 0 0 / 0.25)',
          }}
        />
      </button>
      {label ? <span className="text-sm font-medium">{label}</span> : null}
    </label>
  );
}
