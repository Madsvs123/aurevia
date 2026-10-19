import { forwardRef, type InputHTMLAttributes } from 'react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={clsx('input', error && '!border-dangr', className)}
        aria-invalid={Boolean(error)}
        {...rest}
      />
      {error ? <p className="field-hint" style={{ color: 'var(--danger)' }}>{error}</p> : null}
      {hint && !error ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
});
