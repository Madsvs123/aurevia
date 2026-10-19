import { forwardRef, type SelectHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, options, placeholder, className, id, ...rest },
  ref,
) {
  const selectId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={selectId} className="field-label">
          {label}
        </label>
      ) : null}
      <select ref={ref} id={selectId} className={clsx('select', className)} {...rest}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.label}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
});
